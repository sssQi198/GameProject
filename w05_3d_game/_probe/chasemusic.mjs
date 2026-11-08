/**
 * 「追逐音乐 + 怪物怒吼」的纯逻辑校验（不开浏览器、不用 WebGL）。
 *
 * 覆盖：
 *   1. 节拍表（M1）—— 167 → 200bpm、低鼓在 1/3 拍、二次鼓在第 3 拍、
 *      军鼓/金属敲/固定音型的压力门槛、踩镲与低音泵
 *   2. 常驻层（M6/M8/M12）—— 三支不谐 saw、1.4k 颤弓、32Hz 轰鸣，参数随压力开亮
 *   3. 调度器 —— 0.15 秒 lookahead、帧率无关、切后台不补拍、离开追逐拆干净
 *   4. 原曲压低 —— 追逐时 musicGain 0.035（比平时 0.18 低 14dB），且都过 musicDuck
 *   5. 怒吼（第十轮）—— 2.4 秒长啸：150Hz「呃」→ 330/360Hz「啊」、三个共振峰
 *      从 /ə/ 滑到 /a/、tanh 软饱和、12Hz 锯齿调幅、5.5Hz 颤音、胸腔低八度、
 *      750Hz 喉噪 + 2.4k→1.4k 嘶声，峰值 0.98，并把音乐让开（duckMusic）
 *   6. 采样路线（第十一轮）—— CC0 吼声/成品曲解码后：跳过起音前静音、降两个半音、
 *      峰值归一化、cutRoar 能掐采样；追逐改成放成品曲后，合成打击层必须全部让位；
 *      解码失败时自动退回上面 1–5 那条合成路径
 *
 * 验的是「排出来的音频图」，实际听感仍要在浏览器里听。
 */
import { AudioBus, ROAR_SAMPLES, ROAR_DESIGNS, CHASE_BEDS } from '../src/audio.js';
import { CHASE_MUSIC, CHASE_BED, chaseBeatPeriod, chaseBeatPlan } from '../src/chasemusic.js';
import { FakeCtx, installFakeAudio, capture, lastTarget, peakOf } from './fakeaudio.mjs';

const STEP = 1 / 60;

let fail = 0;
let pass = 0;
function ok(cond, label, detail = '') {
  // 编号放在最前面：这台机器上 PowerShell 会把中文标签打成乱码，
  // 有 #N 才能对回源码（失败时只搜 "#N" 就够了）。
  const n = pass + fail + 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  #${n}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
  else pass += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 第一段（1–5）验的是合成兜底：让 fetch 全部失败，并把这 5 条 warn 收进数组，
// 既能断言「加载失败只警告不抛异常」，又不会把探针输出刷成一片。
const warns = [];
const realWarn = console.warn;
console.warn = (...args) => warns.push(args.map(String).join(' '));
globalThis.fetch = async () => {
  throw new TypeError('probe: 故意让 fetch 失败，走合成兜底');
};

installFakeAudio();
const bus = new AudioBus();
bus.unlock();
await new Promise((r) => setTimeout(r, 0));
console.warn = realWarn;
const ctx = bus.ctx;
ok(ctx instanceof FakeCtx, 'unlock 建立了 AudioContext');
ok(warns.length === ROAR_SAMPLES.length + CHASE_BEDS.length, '素材全部加载失败时只 warn，不抛异常', `${warns.length} 条`);
ok(bus.roarBuffer() === null, '没有采样 → roarBuffer() 为 null（roar 会走合成版）');
ok(bus.samplesReady === true, '加载结束（失败也算结束，不会卡在 loading）', String(bus.samplesReady));

// ── 工具：从节点堆里认各层 ──────────────────────────────────────────────────
/** 低鼓 = 正弦 + 120 → 55Hz 下滑。 */
const isDrum = (n) => n.kind === 'osc' && n.type === 'sine'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 55);
/** 金属敲 = 2.4kHz 带通噪声。 */
const isMetal = (n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 2400;
/** 上升音 = 400 → 3kHz 带通扫频。 */
const isRiser = (n) => n.kind === 'filter'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 3000);

function onsetOf(drum) {
  const e = drum.frequency.events.find((x) => x.kind === 'set');
  return e ? e.t : NaN;
}

/** 跑 seconds 秒，每帧推进 ctx.currentTime 并调一次 bus.update。 */
function run(seconds, { fps = 60, tension = 0 } = {}) {
  const dt = 1 / fps;
  bus.setTension(tension);
  for (let i = 0; i < Math.round(seconds * fps); i += 1) {
    ctx.currentTime += dt;
    bus.update(dt);
  }
}

/** 跑一段并返回这段时间新建的节点。 */
function runCapture(seconds, opts) {
  const from = ctx.created.length;
  run(seconds, opts);
  return ctx.created.slice(from);
}

// ── 1. 节拍表 ───────────────────────────────────────────────────────────────
ok(near(chaseBeatPeriod(0), 0.36, 1e-9), '压力 0 时一拍 0.36 秒（167bpm）', chaseBeatPeriod(0).toFixed(2));
ok(near(chaseBeatPeriod(1), 0.3, 1e-9), '压力 1 时一拍 0.30 秒（200bpm）', chaseBeatPeriod(1).toFixed(2));
ok(near(chaseBeatPeriod(0.5), 0.33, 1e-9), '中间线性插值', chaseBeatPeriod(0.5).toFixed(2));
ok(near(chaseBeatPeriod(9), 0.3, 1e-9) && near(chaseBeatPeriod(-3), 0.36, 1e-9),
  '压力超范围会被夹住（不产出 200bpm 这种意外）');
ok(near(chaseBeatPeriod(undefined), 0.36, 1e-9), '压力是 undefined 时按 0 处理');

const drums = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).drum > 0);
ok(JSON.stringify(drums) === '[true,false,true,false]', '低鼓落在 1、3 拍', drums.join(','));
const metals = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).metal > 0);
ok(JSON.stringify(metals) === '[false,true,false,true]', '金属敲落在 2、4 拍', metals.join(','));
ok([0, 1, 2, 3].every((b) => chaseBeatPlan(b, 0.3).metal === 0),
  `压力低于 ${CHASE_MUSIC.metalAt} 不出金属敲（前半段不吵）`);
ok([0, 1, 2, 3].some((b) => chaseBeatPlan(b, 0.7).metal > 0), '压力超过门槛后金属敲进来');
ok(chaseBeatPlan(0, 0.9).drum > chaseBeatPlan(0, 0).drum, '压力越高低鼓越重',
  `${chaseBeatPlan(0, 0).drum.toFixed(2)} → ${chaseBeatPlan(0, 0.9).drum.toFixed(2)}`);
ok(chaseBeatPlan(0, 0.9).drum > chaseBeatPlan(2, 0.9).drum, '每 8 拍的第一下是重音');
ok(chaseBeatPlan(0, 0.6).riser === true && chaseBeatPlan(4, 0.6).riser === false,
  '上升音 8 拍一次');
ok(chaseBeatPlan(0, 0.2).riser === false, `上升音在压力低于 ${CHASE_MUSIC.riserAt} 时不进`);
ok(chaseBeatPlan(0, 0.6).swell === true && chaseBeatPlan(1, 0.6).swell === false,
  '不谐簇每 8 拍呼吸一次');
const stabs = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).stab > 0);
ok(JSON.stringify(stabs) === '[false,true,false,true]', 'M11 短和弦落在 2、4 拍', stabs.join(','));
ok(chaseBeatPlan(1, 0.2).stab > 0 && chaseBeatPlan(1, 0.2).metal === 0,
  '短和弦从第一拍就有（金属敲要压力过半才进，前者不用）');

// 第十轮加厚的几层：每层都要「有位置、有门槛」，否则加进来只是更响而不是更刺激
const ghosts = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).ghost > 0);
ok(JSON.stringify(ghosts) === '[false,false,true,false]', '二次鼓补在第 3 拍', ghosts.join(','));
ok(chaseBeatPlan(2, 0.9).ghost > chaseBeatPlan(2, 0).ghost, '压力越高二次鼓越响');
const snares = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).snare > 0);
ok(JSON.stringify(snares) === '[false,true,false,true]', '军鼓落在 2、4 拍', snares.join(','));
ok([0, 1, 2, 3].every((b) => chaseBeatPlan(b, 0.1).snare === 0),
  `压力低于 ${CHASE_MUSIC.snareAt} 不出军鼓`);
ok([0, 1, 2, 3].every((b) => chaseBeatPlan(b, 0.05).hat > 0), '踩镲没有门槛（它提供的是密度）');
ok(chaseBeatPlan(0, 0.5).hatOff < chaseBeatPlan(0, 0.5).hat, '后半拍的踩镲弱一档（正-反才有律动）');
const pumps = [0, 1, 2, 3].map((b) => chaseBeatPlan(b, 0.8).pump > 0);
ok(JSON.stringify(pumps) === '[true,false,true,false]', '低音泵挂在正拍的后半拍', pumps.join(','));
ok(chaseBeatPlan(0, 0.8).ostinato > 0 && chaseBeatPlan(0, 0.2).ostinato === 0,
  `固定音型在压力低于 ${CHASE_MUSIC.ostinatoAt} 时不进`);
ok(chaseBeatPlan(0, 0.3).crash === true && chaseBeatPlan(1, 0.3).crash === false,
  '撞击落在每 8 拍的句头');

// ── 2. 还没开始时不发声 ─────────────────────────────────────────────────────
ok(bus.chase === null, '没进追逐时不创建节拍层（不白占节点）');
const idleNodes = runCapture(1, { tension: 0.8 });
ok(idleNodes.filter(isDrum).length === 0, '没 start 之前一拍都不排', `${idleNodes.length} 个节点`);

// ── 3. 启停与常驻层 ─────────────────────────────────────────────────────────
const mark = ctx.created.length;
bus.setTension(0); // 起跑时压力接近 0（怪物还在 7 米外），节拍层从慢速起手
bus.setMood('chase');
bus.startChaseMusic();
ok(bus.chase != null, 'startChaseMusic 建出节拍层');
ok(bus.chase.active === true, '节拍层进入 active');

const built = ctx.created.slice(mark); // 这一段是 start() 建的常驻层
const saws = built.filter((n) => n.kind === 'osc' && n.type === 'sawtooth'
  && [110, 116.5, 155.6].some((f) => near(n.frequency.value, f, 0.01)));
ok(saws.length === 3, '不谐簇是三支 saw（110 / 116.5 / 155.6Hz）', `${saws.length} 支`);
ok(built.some((n) => n.kind === 'osc' && n.type === 'triangle' && n.frequency.value === 32),
  '楼体轰鸣有 32Hz 三角');
ok(built.some((n) => n.kind === 'filter' && n.frequency.value === CHASE_MUSIC.cutoffLow),
  `不谐簇过低通 ${CHASE_MUSIC.cutoffLow}Hz`);
ok(built.some((n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 1400),
  '颤弓是 1.4kHz 窄带噪声');
ok(built.some((n) => n.kind === 'osc' && n.type === 'sine' && n.frequency.value === CHASE_MUSIC.tremLow),
  `颤弓 LFO 起手 ${CHASE_MUSIC.tremLow}Hz`);
// 小喇叭能不能放出来，先看中频有没有东西
ok(CHASE_MUSIC.cutoffHigh >= 2400, `不谐簇最亮开到 ${CHASE_MUSIC.cutoffHigh}Hz（600Hz 在小喇叭上等于没声）`);
ok(CHASE_MUSIC.tremHigh >= 18, `颤弓抖到 ${CHASE_MUSIC.tremHigh}Hz（13Hz 以下听着还是「嗡」）`);

// ── 4. 调度：拍距、第一拍对齐、帧率无关 ─────────────────────────────────────
const t0 = ctx.currentTime;
const firstBatch = runCapture(0.2, { tension: 0 });
const firstDrum = firstBatch.filter(isDrum)[0];
ok(firstDrum && onsetOf(firstDrum) - t0 <= 0.05,
  '第一拍紧跟调用它的那一帧（和 stinger、「快跑！」同一帧）',
  firstDrum ? `${(onsetOf(firstDrum) - t0).toFixed(3)}s` : '没有');

bus.stopChaseMusic();
ctx.currentTime = 0;
bus.startChaseMusic();
const slowRun = runCapture(6, { tension: 0, fps: 60 });
const slowDrums = slowRun.filter(isDrum).map(onsetOf).sort((a, b) => a - b);
const slowGap = slowDrums[1] - slowDrums[0];
ok(near(slowGap, 0.72, 0.02), '压力 0：低鼓每 0.72 秒一下（两拍）', `${slowGap.toFixed(3)}s`);
ok(slowDrums.length >= 8 && slowDrums.length <= 10, '6 秒里 8–10 下低鼓', `${slowDrums.length} 下`);

bus.stopChaseMusic();
ctx.currentTime = 0;
bus.startChaseMusic();
const fastRun = runCapture(6, { tension: 1, fps: 60 });
const fastDrums = fastRun.filter(isDrum).map(onsetOf).sort((a, b) => a - b);
const fastGap = fastDrums[1] - fastDrums[0];
ok(near(fastGap, 0.6, 0.02), '压力 1：低鼓每 0.60 秒一下（快 17%）', `${fastGap.toFixed(3)}s`);
ok(fastDrums.length > slowDrums.length, '压力拉满时同样 6 秒里拍子更多',
  `${slowDrums.length} → ${fastDrums.length} 下`);

bus.stopChaseMusic();
ctx.currentTime = 0;
bus.startChaseMusic();
const fps30 = runCapture(6, { tension: 0, fps: 30 });
const fps30Drums = fps30.filter(isDrum).map(onsetOf).sort((a, b) => a - b);
ok(Math.abs(fps30Drums.length - slowDrums.length) <= 1,
  '掉到 30fps 拍数不变（按 currentTime 排，不按帧）',
  `${slowDrums.length} 下 vs ${fps30Drums.length} 下`);
const maxDrift = Math.max(...fps30Drums.map((t, i) => Math.abs(t - (slowDrums[i] ?? t))));
ok(maxDrift <= 0.02, '30fps 与 60fps 的落拍时刻一致（<20ms）', `${(maxDrift * 1000).toFixed(1)}ms`);

// ── 5. 切后台回来不补拍 ─────────────────────────────────────────────────────
ctx.currentTime += 30; // 标签页挂起 30 秒后回来
const afterJump = runCapture(STEP, { tension: 0 });
ok(afterJump.filter(isDrum).length <= 1, '时间跳 30 秒后只对齐一拍，不一次补几十拍',
  `${afterJump.filter(isDrum).length} 下`);

// ── 6. 金属敲 / 上升音的门槛 ────────────────────────────────────────────────
bus.stopChaseMusic();
ctx.currentTime = 0;
bus.startChaseMusic();
const quietRun = runCapture(4, { tension: 0.2, fps: 60 });
ok(quietRun.filter(isMetal).length === 0, '压力 0.2 时完全没有金属敲');
ok(quietRun.filter(isRiser).length === 0, '压力 0.2 时没有上升音');

bus.stopChaseMusic();
ctx.currentTime = 0;
bus.startChaseMusic();
const hotRun = runCapture(4, { tension: 0.8, fps: 60 });
ok(hotRun.filter(isMetal).length > 0, '压力 0.8 时金属敲进来', `${hotRun.filter(isMetal).length} 下`);
ok(hotRun.filter(isRiser).length > 0, '压力 0.8 时上升音出现', `${hotRun.filter(isRiser).length} 段`);

// 第十轮新加的乐器：光有 plan 字段不算数，节点图上要真的排出来
const isGhost = (n) => n.kind === 'osc' && n.type === 'sine'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 58);
const isSnare = (n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 1900;
const isHat = (n) => n.kind === 'filter' && n.type === 'highpass' && n.frequency.value === 7000;
const isPump = (n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 260;
const isOst = (n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 1150;
const isCrash = (n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 3000;
ok(hotRun.filter(isGhost).length > 0, '二次鼓排出来了（95 → 58Hz）', `${hotRun.filter(isGhost).length} 下`);
ok(hotRun.filter(isSnare).length > 0, '军鼓排出来了（1.9kHz 带通）', `${hotRun.filter(isSnare).length} 下`);
ok(hotRun.filter(isHat).length >= 8, '踩镲正反都排（4 秒至少 8 下）', `${hotRun.filter(isHat).length} 下`);
ok(hotRun.filter(isPump).length > 0, '低音泵排出来了（55Hz 过 260Hz 低通）', `${hotRun.filter(isPump).length} 下`);
ok(hotRun.filter(isOst).length > 0, '固定音型排出来了（1.15kHz 带通）', `${hotRun.filter(isOst).length} 下`);
ok(hotRun.filter(isCrash).length > 0, '撞击排出来了（3kHz 宽带）', `${hotRun.filter(isCrash).length} 次`);
ok(quietRun.filter(isSnare).length === 0 && quietRun.filter(isOst).length === 0,
  `压力 0.2 时军鼓和固定音型都还不进（门槛 ${CHASE_MUSIC.snareAt} / ${CHASE_MUSIC.ostinatoAt}）`);
ok(quietRun.filter(isHat).length > 0 && quietRun.filter(isGhost).length > 0,
  '压力 0.2 时踩镲和二次鼓已经在推（这两层不设门槛）');

// M6：2、4 拍的三支短和弦锯齿（220 / 233.1 / 311.1Hz），是「换音乐」最直接的证据
const isStab = (n) => n.kind === 'osc' && n.type === 'sawtooth'
  && [220, 233.1, 311.08].some((f) => near(n.frequency.value, f, 0.1));
const stabSaws = hotRun.filter(isStab);
ok(stabSaws.length >= 3, 'M6 短和弦真的排了（2、4 拍各一次三和弦）', `${stabSaws.length} 支锯齿`);
ok(stabSaws.every((n) => n.started.length > 0 && n.stopped[0] - n.started[0].t <= 0.2),
  '短和弦是掐一下就走（≤0.2 秒），不是又一层长音');

// ── 7. 参数随压力开亮 ───────────────────────────────────────────────────────
bus.setTension(1);
const cm = bus.chase;
ok(near(lastTarget(cm.clusterFilter.frequency), CHASE_MUSIC.cutoffHigh, 1e-6),
  `不谐簇低通开到 ${CHASE_MUSIC.cutoffHigh}Hz（越来越刺）`,
  lastTarget(cm.clusterFilter.frequency).toFixed(0));
const sawDetunes = cm.saws.map((o) => lastTarget(o.detune));
ok(sawDetunes.length === 3, '三支 saw 都在改失谐', sawDetunes.map((v) => v.toFixed(1)).join(', '));
ok(sawDetunes.every((v) => Math.abs(v) > CHASE_MUSIC.detuneLow && Math.abs(v) <= CHASE_MUSIC.detuneHigh + 1e-6),
  `失谐从 ±${CHASE_MUSIC.detuneLow} 拉到 ±${CHASE_MUSIC.detuneHigh} 音分`);
ok(sawDetunes.some((v) => v > 0) && sawDetunes.some((v) => v < 0), '失谐有正有负（同向只会跑调，不会晃）');
ok(near(lastTarget(cm.lfo.frequency), CHASE_MUSIC.tremHigh, 1e-6),
  `颤弓 LFO 加到 ${CHASE_MUSIC.tremHigh}Hz`, lastTarget(cm.lfo.frequency).toFixed(0));
ok(near(lastTarget(cm.tremDepth.gain), 0.11, 1e-6),
  '颤弓深度同时 0.07 → 0.11（越近抖得越狠）', lastTarget(cm.tremDepth.gain).toFixed(3));
ok(near(lastTarget(cm.rumbleLevel.gain), CHASE_MUSIC.rumbleHigh, 1e-6),
  `轰鸣层音量升到 ${CHASE_MUSIC.rumbleHigh}`, lastTarget(cm.rumbleLevel.gain).toFixed(2));

// 压力变化小于 2% 不重排自动化（避免每帧往音频线程写参数）
const paramEvents = () => cm.clusterFilter.frequency.events.length
  + cm.lfo.frequency.events.length + cm.rumbleLevel.gain.events.length
  + cm.saws.reduce((sum, o) => sum + o.detune.events.length, 0);
bus.setTension(0.5);
const e1 = paramEvents();
bus.setTension(0.51);
const e2 = paramEvents();
ok(e1 === e2, '压力变化 <2% 时整段跳过（不每帧重排自动化）');
bus.setTension(0.8);
ok(paramEvents() > e2, '压力变化明显时才真的改参数');

// ── 8. 原曲压制 ─────────────────────────────────────────────────────────────
ok(near(lastTarget(bus.musicGain.gain), 0.035, 1e-9),
  '追逐时原曲压到 0.035（比平时 0.18 低 14dB，才听得出来「换了」）',
  String(lastTarget(bus.musicGain.gain)));
ok(bus.musicDuck && bus.musicGain.dest === bus.musicDuck && bus.musicDuck.dest === bus.master,
  '原曲与节拍层都过 musicDuck 这道闸（吼声要靠它让开）');
ok(bus.chase && bus.chase.outGain && bus.chase.outGain.dest === bus.musicDuck,
  '节拍层的输出也接在 musicDuck 上');
bus.setMood('play');
ok(near(lastTarget(bus.musicGain.gain), 0.18, 1e-9), '离开追逐后原曲回到 0.18');
ok(bus.chase.active === false, '离开追逐（setMood 不是 chase）就停掉节拍层');
ok(bus.chase.voices.length === 0, '常驻节点全部交出去停掉', `${bus.chase.voices.length} 个残留`);
ok(bus.chase.outGain === null, '输出节点也放掉（重开一局不残留声音）');

// 再进一次：能重新起来，拍子从 0 数
bus.setMood('chase');
bus.startChaseMusic();
ok(bus.chase.active === true, '第二次进追逐还能重新启动');
ok(bus.chase.beat === 0, '重新启动后拍号归零');
const restartDrums = runCapture(0.6, { tension: 0 }).filter(isDrum);
ok(restartDrums.length >= 1, '重新启动后节拍正常', `${restartDrums.length} 下`);
bus.stopChaseMusic();

// ── 9. 怪物怒吼（第十轮：2.4 秒的长啸，不是一下闷响） ──────────────────────
const ROAR = 2.4; // 与 audio.js 的 ROAR_SECONDS 对齐；改一边就必须改另一边
const roarNodes = capture(ctx, () => bus.roar(1, 0));
const screamAt = (f) => roarNodes.find((n) => n.kind === 'osc' && n.type === 'sawtooth'
  && n.frequency.events.some((e) => e.kind === 'exp' && near(e.v, f, 0.01)));
const voice = screamAt(360);
const voice2 = screamAt(360 * 1.006);
ok(voice != null, '主嗓子扫到 360Hz 并撑住 —— 有音高的长啸，不是下滑的低吼');
ok(voice && near(voice.frequency.events[0].v, 150, 1e-6), '从 150Hz 的「呃」起音',
  voice ? String(voice.frequency.events[0].v) : '没有');
const contour = voice ? voice.frequency.events.map((e) => e.v) : [];
ok(Math.max(...contour) === 360 && contour[contour.length - 1] === 196,
  '先冲到 360Hz 再落回 196Hz（「啊——」喊到没气）', contour.map((v) => v.toFixed(0)).join(' → '));
ok(voice2 != null && voice2.detune.value === 12, '第二条嗓子差 12 音分（拍频＝两条声带）');
// 长度是这一版的核心：1.5 秒的下滑再响也像「一声」，2.4 秒才像「喊」
const roarLen = voice && voice.stopped.length ? voice.stopped[0] - voice.frequency.events[0].t : NaN;
ok(near(roarLen, ROAR + 0.02, 0.02), `长啸 ${ROAR} 秒（不是一下闷响）`, `${roarLen.toFixed(2)}s`);

// 颤音：5.5 → 7Hz，深度 18 → 70 音分；两条嗓子共用同一个 LFO
const vib = roarNodes.find((n) => n.kind === 'osc' && n.type === 'sine' && n.frequency.events[0]?.v === 5.5);
ok(vib != null, '颤音从 5.5Hz 起（不是 17Hz 那样的「抖」）');
const vibDepth = roarNodes.find((n) => n.kind === 'gain' && n.dests.includes(voice.detune)
  && n.dests.includes(voice2.detune));
ok(vib != null && vibDepth != null && vib.dest === vibDepth,
  '颤音接在两条嗓子的 detune 上（同步晃，不然像两把琴）',
  vibDepth ? `${vibDepth.gain.events.map((e) => e.v).join(' → ')} 音分` : '没有');
ok(vibDepth != null && near(vibDepth.gain.events[0].v, 18, 1e-6)
  && near(vibDepth.gain.events[vibDepth.gain.events.length - 1].v, 70, 1e-6),
  '深度 18 → 70 音分（越喊越不稳，这是人声和合成器的分界）');

// 元音：三个共振峰一起从 /ə/ 滑到 /a/，这才是「呃 → 啊」
const formantTo = (to) => roarNodes.find((n) => n.kind === 'filter' && n.type === 'bandpass'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === to));
const f1 = formantTo(780);
const f2 = formantTo(1150);
const f3 = formantTo(2600);
ok(f1 != null && f2 != null && f3 != null, '三个共振峰都在（780 / 1150 / 2600Hz）');
ok(f1 && f2 && f3 && f1.frequency.events[0].v === 500 && f2.frequency.events[0].v === 1500
  && f3.frequency.events[0].v === 2500,
  '/ə/ → /a/：500/1500/2500 一起滑到 780/1150/2600（滑移才是元音变化，不是换滤波器）');
ok([f1, f2, f3].every((n) => n && n.Q.value >= 6), '共振峰 Q 6 / 8 / 9 —— 像喉咙不像电线',
  [f1, f2, f3].map((n) => (n ? n.Q.value : 0)).join(' / '));
const body = roarNodes.find((n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 2400);
ok(body != null, '肉声低通 2.4kHz 直通 —— 锯齿的整串谐波留下来，小喇叭靠它出声');

// 胸口：低八度的第二条嗓子
const chest = roarNodes.find((n) => n.kind === 'osc' && n.type === 'sawtooth'
  && n.frequency.events[0]?.v === 165);
ok(chest != null, '胸腔嗓子 165 → 96 → 90Hz');
ok(chest && chest.frequency.events.some((e) => e.kind === 'exp' && e.v === 90),
  '胸腔跟着一起往下松（喊到没气）');
ok(roarNodes.some((n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 240),
  '胸腔过 240Hz 低通（耳机上是「大」，小喇叭不会糊）');

// 破音：tanh 软饱和 + 12Hz 锯齿调幅
const shaper = roarNodes.find((n) => n.kind === 'shaper');
ok(shaper != null && shaper.curve != null && shaper.curve.length === 1024,
  'WaveShaper 用 1024 点 tanh 曲线（把正弦感压成破锣）');
ok(shaper != null && near(shaper.curve[0], -1, 0.002) && near(shaper.curve[1023], 1, 0.002),
  '曲线端点 ±1（软饱和，不是硬削顶）');
ok(shaper != null && shaper.oversample === '2x', '2x 过采样，少一点混叠');
const roughLfo = roarNodes.find((n) => n.kind === 'osc' && n.type === 'sawtooth'
  && n.frequency.value === 12);
ok(roughLfo != null && roughLfo.dest != null && roughLfo.dest.kind === 'gain'
  && near(roughLfo.dest.gain.value, 0.3, 1e-6),
  '12Hz 锯齿调幅深度 0.3，接在饱和前的增益上（锯齿边，不是正弦颤）');
const roughBus = roarNodes.find((n) => n.kind === 'gain' && n.gain.value === 0.7);
ok(roughBus != null, '进饱和前的总线增益 0.7');

// 噪声：750Hz 喉噪 + 2.4k→1.4k 嘶声
const rasp = roarNodes.find((n) => n.kind === 'filter' && n.type === 'bandpass' && n.frequency.value === 750);
ok(rasp != null, '750Hz 宽带噪声层（撕裂感的中频主体）');
const hiss = roarNodes.find((n) => n.kind === 'filter' && n.type === 'bandpass'
  && n.frequency.events[0]?.v === 2400 && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 1400));
ok(hiss != null, '嘶声 2.4k → 1.4k 带通（气声的「啊」全靠它）');

// 峰值只看包络：颤音的「增益」是 70 音分，混进来会把峰值算成 70
const envPeakNow = () => Math.max(...bus.roarVoice.env.gain.events
  .filter((e) => e.kind === 'exp').map((e) => e.v));
const envPeak = envPeakNow();
ok(near(envPeak, 0.98, 0.01), 'vol=1 时峰值 0.98（第九轮 0.95，且新版不会再被窄带通吃掉）',
  envPeak.toFixed(2));
// 让开：吼声一起，整条音乐必须掉下去
const duckEvents = bus.musicDuck.gain.events.slice(-2);
ok(duckEvents.length === 2 && near(duckEvents[0].v, 0.45, 1e-6) && near(duckEvents[1].v, 1, 1e-6),
  '吼声同时把音乐压到 0.45（让开 55%），1.2 秒后自己涨回来',
  duckEvents.map((e) => e.v.toFixed(2)).join(' → '));
const panner = roarNodes.find((n) => n.kind === 'panner');
ok(panner != null, '嘶吼带声像（听得出它在哪一侧）');
ok(roarNodes.some((n) => n.kind === 'osc' && n.started[0]?.t !== undefined), '嘶吼的振荡器都排了起点');
ok(bus.roarVoice != null && bus.roarVoice.stops.length === 7,
  '记下了正在响的那条长啸（cutRoar 要掐的就是它）');

const loud = capture(ctx, () => bus.roar(1.2, 0));
const loudPeak = envPeakNow();
ok(near(loudPeak, 0.98 * 1.2, 0.02), 'vol 会真的放大嘶吼', loudPeak.toFixed(2));
const silent = capture(ctx, () => bus.roar(0, 0));
ok(silent.length === 0, 'vol=0 一个节点都不建');
const clampRoar = capture(ctx, () => bus.roar(9, 0));
const clampPeak = envPeakNow();
ok(near(clampPeak, 0.98 * 1.2, 0.02), 'vol 上限 1.2（不会被怪物吼爆棚）', clampPeak.toFixed(2));

// cutRoar：长啸必须在「死寂真空」和玩家被咬的瞬间被掐断，否则两秒多的吼声把静音盖没了
const envOfRoar = bus.roarVoice.env;
ok(bus.roarVoice != null, 'cutRoar 之前记着当前长啸');
bus.cutRoar(0.2);
ok(bus.roarVoice === null, 'cutRoar 之后引用清掉（不会掐第二次）');
const cutEvents = envOfRoar.gain.events;
ok(cutEvents.some((e) => e.kind === 'cancel') && near(cutEvents[cutEvents.length - 1].v, 0.0001, 1e-9)
  && cutEvents[cutEvents.length - 1].kind === 'exp',
  'cutRoar 取消已排的自动化并指数淡出到 0.0001（不是硬切，硬切会「啪」）',
  cutEvents.map((e) => e.kind).slice(-3).join(' → '));
const cutLen = cutEvents[cutEvents.length - 1].t - cutEvents[cutEvents.length - 2].t;
ok(near(cutLen, 0.2, 1e-6), '淡出长度就是传进去的 0.2 秒', `${cutLen.toFixed(2)}s`);
bus.cutRoar(0.2);
ok(true, '没有在响的长啸时 cutRoar 什么都不做（不报错）');

// ── 6. 采样路线：CC0 吼声 + 成品追逐曲 ──────────────────────────────────────
// 造一段带前导静音的「录音」。decodeAudioData 直接原样交回，省掉真解码 ——
// 这里要验的是「拿到缓冲之后怎么用」，不是浏览器的 Vorbis/MP3 解码器。
function fakeSample({ seconds, lead = 0, peak = 0.5, rate = 1000 }) {
  const length = Math.round(seconds * rate);
  const data = new Float32Array(length);
  const from = Math.round(lead * rate);
  for (let i = from; i < length; i += 1) data[i] = peak * Math.sin(i * 0.37);
  return { duration: seconds, length, sampleRate: rate, getChannelData: () => data };
}

const ROAR_BUFS = ROAR_SAMPLES.map(() => fakeSample({ seconds: 3.9, lead: 0.3, peak: 0.45 }));
const BED_BUFS = CHASE_BEDS.map(() => fakeSample({ seconds: 76, peak: 0.6 }));
const byUrl = new Map();
ROAR_SAMPLES.forEach((s, i) => byUrl.set(s.url, ROAR_BUFS[i]));
CHASE_BEDS.forEach((b, i) => byUrl.set(b.url, BED_BUFS[i]));

globalThis.fetch = async (url) => {
  const buf = byUrl.get(url);
  return buf ? { ok: true, arrayBuffer: async () => buf } : { ok: false, status: 404 };
};

const fresh = new AudioBus();
fresh.unlock();
// 假解码器：必须在上面那次 await 之前装好（loadSamples 在微任务里才调它）
fresh.ctx.decodeAudioData = async (raw) => raw;
await new Promise((r) => setTimeout(r, 0));
const fctx = fresh.ctx;

ok(fresh.samplesReady === true, '素材加载完成', String(fresh.samplesReady));
ok(fresh.roarVariants.length === 3, '三条吼声素材都进来了', String(fresh.roarVariants.length));
ok(fresh.chaseBeds.length === 2, '两首追逐成品曲都进来了', String(fresh.chaseBeds.length));
ok(near(fresh.roarVariants[0].offset, 0.285, 0.03), '自动跳过起音前 0.3 秒空白（不跳就晚半拍）',
  fresh.roarVariants[0].offset.toFixed(3));
ok(fresh.roarVariants[0].peak > 0.4 && fresh.roarVariants[0].peak <= 0.45,
  '测出素材峰值（用来做响度归一化）', fresh.roarVariants[0].peak.toFixed(3));
ok(fresh.roarBuffer() === ROAR_BUFS[0] && fresh.bedBuffer() === BED_BUFS[0],
  'roarBuffer()/bedBuffer() 指向默认素材');

// 6.1 采样吼声的音频图（先切回「原声」档：这一节的数字是原声档的基线）
ok(fresh.roarDesignName() === '野兽', '默认走「野兽」档（要的就是不像人）', fresh.roarDesignName());
fresh.setRoarDesign(0);
ok(fresh.roarDesignName() === '原声', '可以切回原声档', fresh.roarDesignName());
const sNodes = capture(fctx, () => fresh.roar(1, 0));
const sSrc = sNodes.find((n) => n.kind === 'buffer' && n.buffer === ROAR_BUFS[0]);
ok(sSrc != null, 'roar() 走采样：发的是素材缓冲');
ok(near(sSrc.playbackRate.value, 0.9, 1e-9), '降两个半音（人声立刻不像人）', String(sSrc.playbackRate.value));
ok(sSrc.loop === false, '不循环（吼一声就完）');
ok(near(sSrc.started[0].offset, 0.285, 0.03), '从起音处开始播', sSrc.started[0].offset.toFixed(3));
ok(near(sSrc.started[0].duration, 2.34, 0.02), '只截 2.6 秒播出（缓冲时长要乘 0.9）',
  sSrc.started[0].duration.toFixed(2));
const sEnv = fresh.roarVoice.env;
const sPeak = sEnv.gain.events.filter((e) => e.kind === 'exp')[0].v;
ok(near(sPeak, 1.9, 0.02), '按素材峰值归一化到约 0.9 满刻度', sPeak.toFixed(2));
ok(near(sEnv.gain.events[sEnv.gain.events.length - 1].t - fctx.currentTime, 2.6, 0.02),
  '尾巴在 2.6 秒处收干净（3.8 秒原始录音会拖到下一句台词上）');
ok(sNodes.some((n) => n.kind === 'shaper' && n.curve && n.oversample === '2x'),
  '一层 2x 过采样的轻饱和（k=1.8，只加「扎」，不磨掉素材的破音）');
ok(sNodes.some((n) => n.kind === 'filter' && n.type === 'highpass' && n.frequency.value === 60),
  '60Hz 高通掐掉房间嗡声');
ok(sNodes.some((n) => n.kind === 'panner'), '采样吼声同样带声像');
ok(fresh.musicDuck.gain.events.some((e) => e.kind === 'target' && near(e.v, 0.4, 1e-6)),
  '采样吼声同样把音乐让开 60%');

// 6.2 cutRoar 要能掐采样源
const now0 = fctx.currentTime;
fresh.cutRoar(0.18);
ok(fresh.roarVoice === null, '采样版 cutRoar 之后引用也清掉');
ok(sSrc.stopped.some((t) => near(t, now0 + 0.2, 1e-6)), '采样源被 stop 掉（否则尾巴盖住死寂真空）',
  sSrc.stopped.map((t) => t.toFixed(2)).join(','));

// 6.3 切换素材
const nameB = fresh.setRoarSample(1);
ok(nameB === ROAR_SAMPLES[1].name && fresh.roarIndex === 1, '可以切换吼声（Dev 面板 A/B/C）', String(nameB));
const sNodesB = capture(fctx, () => fresh.roar(1, 0));
ok(sNodesB.some((n) => n.kind === 'buffer' && n.buffer === ROAR_BUFS[1]), '切换后发的是新素材');

// 6.3b 原型档：同一段录音换加工链，不换素材
const beastName = fresh.setRoarDesign(1);
ok(beastName === '野兽', '原型档可以切换', beastName);
const bNodes = capture(fctx, () => fresh.roar(1, 0));
const bMain = bNodes.find((n) => n.kind === 'buffer' && n.buffer === ROAR_BUFS[1] && !n.loop);
ok(bMain != null, '野兽档还是发同一条素材（只换处理）');
ok(near(bMain.playbackRate.events[0].v, 0.82, 1e-9), '先降到 0.82（体型变大）',
  String(bMain.playbackRate.events[0].v));
const slide = bMain.playbackRate.events.filter((e) => e.kind === 'exp').pop();
ok(slide != null && near(slide.v, 0.82 * 0.58, 1e-6), '播放中继续往下滑（嗓子在塌，不是慢放）',
  slide ? slide.v.toFixed(3) : 'none');
ok(bNodes.some((n) => n.kind === 'filter' && n.type === 'peaking' && n.frequency.value === 620),
  '顶一个 620Hz 共振峰（保住「呃/啊」的元音，不然只是闷响）');
const growl = bNodes.find((n) => n.kind === 'osc');
ok(growl != null && near(growl.frequency.value, 33, 1e-9), '33Hz 喉部抖动（活物感）',
  growl ? String(growl.frequency.value) : 'none');
const amGain = bNodes.find((n) => n.kind === 'gain' && near(n.gain.value, 0.62, 1e-9));
const depthGain = bNodes.find((n) => n.kind === 'gain' && near(n.gain.value, 0.38, 1e-9));
ok(amGain != null && depthGain != null && depthGain.dests.includes(amGain.gain),
  '抖动接到音量参数上（真 AM，不是空接）');
const subs = bNodes.filter((n) => n.kind === 'buffer' && n.buffer === ROAR_BUFS[1]);
ok(subs.length === 2, '两条嗓子：主体 + 低八度', String(subs.length));
ok(near(subs.map((n) => n.playbackRate.value).sort((a, b) => a - b)[0], 0.41, 1e-9),
  '低八度那条是 0.41 倍速（「这东西有多大」）');
const air = bNodes.find((n) => n.kind === 'buffer' && n.buffer !== ROAR_BUFS[1] && n.loop === true);
ok(air != null, '气流层：一条循环白噪（破掉的嗓子才有气）');
ok(bNodes.some((n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 220),
  '低八度只过 220Hz 低通（不许糊中频）');

// 6.3c 「嘶嘶底噪」的三条修正（第十二轮）：底噪之所以被听见，是三件事叠在一起
//  ① 饱和曲线在 x→0 处斜率 k/tanh(k)，把录音底噪整体抬 8–10dB；
//  ② 气流层直接挂主包络，不随喉部抖动，且尾巴不收；
//  ③ 气流带通 1600/Q0.6，通带近 3kHz，等于在中频铺了一张白噪毯子。
const bShaper = bNodes.find((n) => n.kind === 'shaper');
const cur = bShaper && bShaper.curve;
const at = (v) => cur[Math.round(((v + 1) / 2) * (cur.length - 1))];
const step = 2 / (cur.length - 1);
const slope0 = (at(step) - at(0)) / step;
ok(Math.abs(at(0)) < 2 * step && near(slope0, 1, 0.05),
  '零附近 1:1 直通：录音底噪不再被饱和曲线抬上去', slope0.toFixed(3));
ok(near(at(1), 1, 1e-6) && at(0.5) > 0.5,
  '峰值仍是 1、中段仍被顶亮：响度归一化不用改，破音也还在');
ok(bNodes.some((n) => n.kind === 'filter' && n.type === 'bandpass'
  && n.frequency.value === 1400 && near(n.Q.value, 0.9, 1e-9)),
  '气流带通收窄到 1400Hz/Q0.9（原来 1600/Q0.6 近 3kHz 宽）');
const amNodeB = bNodes.find((n) => n.kind === 'gain' && near(n.gain.value, 0.62, 1e-9));
const airGain = bNodes.find((n) => n.kind === 'gain' && near(n.gain.value, ROAR_DESIGNS[1].breath, 1e-9));
ok(airGain != null && airGain.dests.some((n) => (n.dests || []).includes(amNodeB)),
  '气流挂到喉部抖动下游（不跟着嗓子抖的白噪 = 底噪）');
const bEnvEnd = fresh.roarVoice.env.gain.events.slice(-1)[0].t;
const airEnv = bNodes.find((n) => n.kind === 'gain' && n.gain.events.length === 4
  && near(n.gain.events[1].v, 1, 1e-9) && near(n.gain.events[2].v, 1, 1e-9));
ok(airEnv != null && near(airEnv.gain.events.slice(-1)[0].v, 0.0001, 1e-9)
  && airEnv.gain.events.slice(-1)[0].t < bEnvEnd - 0.1,
  '气流有自己的包络，尾巴比主声先收干净（不然只剩白噪在衰减）');
const bEnv = fresh.roarVoice.env;
const bPeak = bEnv.gain.events.filter((e) => e.kind === 'exp')[0].v;
ok(near(bPeak, 1.9 / (1 + 0.34 * 0.8 + ROAR_DESIGNS[1].breath), 0.02), '三层叠加留了余量，不靠削波充响度',
  bPeak.toFixed(2));
ok(fresh.roarVoice.stops.length === 4, '四条声音都要能被 cutRoar 掐掉（主体/低八度/气流/抖动）',
  String(fresh.roarVoice.stops.length));
const bNow = fctx.currentTime;
fresh.cutRoar(0.18);
ok(fresh.roarVoice === null && bNodes.filter((n) => n.kind !== 'gain' && n.kind !== 'filter' && n.kind !== 'shaper' && n.kind !== 'panner')
  .every((n) => n.stopped.some((t) => near(t, bNow + 0.2, 1e-6))), '野兽档同样被掐干净');
ok(fresh.setRoarDesign(9) === '童声', '档位越界夹到最后一档，不报错');
fresh.setRoarDesign(1);
fresh.setRoarSample(0);
ok(fresh.setRoarSample(9) === ROAR_SAMPLES[ROAR_SAMPLES.length - 1].name, '越界索引夹到末尾，不报错');
fresh.setRoarSample(0);
fresh.cutRoar(0.1);

// 6.4 追逐改用成品曲
fresh.setMood('chase');
fresh.startChaseMusic();
const chase = fresh.chase;
ok(chase.bedSource != null, '追逐用成品曲当床');
ok(chase.bedSource.loop === true, '床是循环的（76 秒 ≫ 15–25 秒的追逐，接缝听不到）');
ok(chase.bedSource.buffer === BED_BUFS[0], '放的是当前选中的那一首');
ok(near(chase.bedSource.playbackRate.value, CHASE_BED.rate, 1e-9),
  '整体降速 6%（降一个半音，比自己心跳还慢）', String(chase.bedSource.playbackRate.value));
const bedSub = chase.bedSub;
ok(bedSub != null && bedSub.buffer === BED_BUFS[0] && bedSub.loop === true,
  '低八度垫底用的是同一段素材（真低频，不是合成 sub）');
ok(near(bedSub.playbackRate.value, CHASE_BED.rate * 0.5, 1e-9),
  '垫底只有半速（低一个八度）', String(bedSub.playbackRate.value));
ok(fctx.created.some((n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 150),
  '垫底只留 150Hz 以下（不然只是把整首放两遍）');
ok(chase.saws === undefined && chase.clusterFilter === undefined,
  '床模式下不建不谐簇（和成品的和声打架）');
ok(near(chase.bedFilter.frequency.value, CHASE_BED.cutoffLow, 1e-9), '起始低通 900Hz（还隔着一道门）',
  String(chase.bedFilter.frequency.value));
chase.setTension(1);
ok(near(lastTarget(chase.bedFilter.frequency), CHASE_BED.cutoffHigh, 1e-9), '压力 1 → 低通开 6kHz（贴脸）',
  String(lastTarget(chase.bedFilter.frequency)));
ok(near(lastTarget(chase.bedGain.gain), CHASE_BED.levelHigh, 1e-9), '压力 1 → 音量顶到 0.62',
  String(lastTarget(chase.bedGain.gain)));
const beforeBed = fctx.created.length;
for (let i = 0; i < 60; i += 1) {
  fctx.currentTime += STEP;
  chase.update();
}
const bedTick = fctx.created.slice(beforeBed);
ok(bedTick.length === 0, '床模式下不再排合成打击层（否则两套鼓抢拍）', `${bedTick.length} 个节点`);

// 6.5 换床 / 拆床
const nameBed = fresh.setChaseBed(1);
ok(nameBed === CHASE_BEDS[1].name, '可以切换追逐成品曲', String(nameBed));
ok(fresh.chase.active === true && fresh.chase.bedSource.buffer === BED_BUFS[1],
  '换床是「重开一次」，新床立刻生效、追逐没断');
fresh.stopChaseMusic();
ok(fresh.chase.bedSource === null && fresh.chase.bedSub === null
  && fresh.chase.bedFilter === null && fresh.chase.bedGain === null,
  'stop() 把床拆干净（重开一局不会残留）');
ok(bedSub.stopped.length > 0, '垫底声源也一起停了（否则低八度会一直嗡到下一局）');
ok(fresh.chase.voices.length === 0, '常驻层也清空');

// 6.6 没有素材时：必须退回合成版，关卡不能变哑
fresh.chaseBeds = [];
ok(fresh.setChaseBed(0) === null, '没有成品曲时 setChaseBed 返回 null（Dev 面板据此提示）');
fresh.roarVariants = [];
fresh.roarInfo = null;
ok(fresh.roarBuffer() === null, '采样清空后 roarBuffer() 为 null');
const fbNodes = capture(fctx, () => fresh.roar(1, 0));
ok(fbNodes.some((n) => n.kind === 'osc'), '采样不可用 → roar() 退回合成长啸');
fresh.cutRoar(0.1);

// ASSERTS=<n> 是给 CI/grep 用的纯 ASCII 计数行（中文在 GBK 控制台会糊掉数字）
console.log(fail === 0 ? `\n全部通过（${pass} 条断言）` : `\n${fail} 项失败（${pass} 条通过）`);
console.log(`ASSERTS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
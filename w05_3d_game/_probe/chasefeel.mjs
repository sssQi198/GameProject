/**
 * 追逐段「紧张感」第二批的纯逻辑校验（不开浏览器、不用 WebGL）。
 *
 * 覆盖三组改动：
 *   1. 怪物脚步（A1）—— 距离衰减、左右脚声像交替、听不见的远距离不出声
 *   2. 心跳与低频跟随压力（A2）—— 0.62 → 0.40 秒、bpm 升、第二下比第一下轻
 *   3. 起跑 stinger + 抽空环境（A3）、灯灭声（A5）、身后灯永久熄灭（S1）
 *
 * 用一个假的 AudioContext 记录所有节点和参数自动化，所以 verifies 的是
 * 「排出来的音频图对不对」，实际听感仍要在浏览器里听。
 */
import { AudioBus } from '../src/audio.js';
import { CONFIG } from '../src/config.js';
import { LAYOUT } from '../src/layout.js';
import { hallLampPassed, hallLampPan, HALL_LAMP_KILL_DIST } from '../src/hallglow.js';
import { FakeCtx, installFakeAudio } from './fakeaudio.mjs';

const STEP = 1 / 60;

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}

// 假 Web Audio 见 fakeaudio.mjs
installFakeAudio();

const bus = new AudioBus();
bus.unlock();
const ctx = bus.ctx;
ok(ctx instanceof FakeCtx, 'unlock 建立了 AudioContext');
ok(bus.noise != null, '噪声缓冲已生成（burst / stinger 依赖它）');

/** 跑 fn，返回它新建的节点。 */
function capture(fn) {
  const from = ctx.created.length;
  fn();
  return ctx.created.slice(from);
}

/** 抓一段时间的节点。 */
function captureDuring(seconds, fn) {
  const from = ctx.created.length;
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) fn(i * STEP);
  return ctx.created.slice(from);
}

// ── 1. 心跳跟随压力（A2）────────────────────────────────────────────────────
bus.setMood('chase');

/** 在 seconds 秒里按 60fps 跑 update，记录每次心跳的帧号和增益。 */
function runHeart(seconds, tension) {
  const beats = [];
  let now = 0;
  const realHeart = bus.heartbeat.bind(bus);
  bus.heartbeat = (g) => { beats.push({ t: now, g }); };
  bus.setTension(tension);
  bus.startHeartbeat();
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    now = i * STEP;
    bus.update(STEP);
  }
  bus.heartbeat = realHeart;
  return beats;
}

const calmBeats = runHeart(6, 0);
const hotBeats = runHeart(6, 1);
const calmGaps = calmBeats.slice(1).map((b, i) => b.t - calmBeats[i].t);
const hotGaps = hotBeats.slice(1).map((b, i) => b.t - hotBeats[i].t);
const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

ok(calmGaps.length > 2 && Math.abs(avg(calmGaps) - 0.62) < 0.03,
  '压力 0 时心跳 0.62 秒一下', `实测 ${avg(calmGaps).toFixed(3)}s ⇒ ${Math.round(60 / avg(calmGaps))} bpm`);
ok(hotGaps.length > calmGaps.length, '压力 1 时心跳明显更快',
  `${hotBeats.length} 下 vs ${calmBeats.length} 下（6 秒）`);
ok(Math.abs(avg(hotGaps) - 0.40) < 0.03, '压力 1 时心跳 0.40 秒一下',
  `实测 ${avg(hotGaps).toFixed(3)}s ⇒ ${Math.round(60 / avg(hotGaps))} bpm`);
ok(calmBeats[0].g === 0.55 && Math.abs(hotBeats[0].g - 0.8) < 1e-9,
  '压力越高心跳越重', `${calmBeats[0].g} → ${hotBeats[0].g}`);

// 一次心跳 = 两下（第二下轻一点）
const thumps = capture(() => bus.heartbeat(0.8));
const voices = thumps.filter((n) => n.kind === 'osc');
const peaks = thumps.filter((n) => n.kind === 'gain').map((n) => Math.max(...n.gain.events.map((e) => e.v)));
ok(voices.length === 2, '一次心跳是「咚-咚」两下', `${voices.length} 个振荡器`);
ok(peaks.length === 2 && peaks[1] < peaks[0] && peaks[1] > peaks[0] * 0.6,
  '第二下（舒张期）比第一下轻，但不是轻到听不见', `${peaks[0].toFixed(2)} → ${peaks[1].toFixed(2)}`);

// drone 音高被压力顶上去（笔记本小喇叭听不见 48Hz，所以 48 → 58 是给谐波留的余量）
bus.setTension(0);
const low = bus.droneA.frequency.value;
bus.setTension(1);
const high = bus.droneA.frequency.value;
ok(Math.abs(low - 48) < 1e-6 && Math.abs(high - 58) < 1e-6,
  '追逐时低频 drone 48 → 58Hz', `${low} → ${high}`);
ok(Math.abs(bus.droneB.frequency.value - 58 * 1.5) < 1e-6, 'drone 的三角波跟着同比例升高（小喇叭靠它听出来）');

// 退出追逐时压力归零，drone 回到 calm 的高音
bus.stopHeartbeat();
ok(bus.tension === 0, 'stopHeartbeat 把压力清零');
bus.setMood('calm');
ok(bus.droneA.frequency.value === 196, 'calm 时 drone 回到 196Hz', `${bus.droneA.frequency.value}`);
bus.setMood('chase');

// ── 2. 起跑前抽空环境（A3）──────────────────────────────────────────────────
function lastTarget(param) {
  const e = [...param.events].reverse().find((x) => x.kind === 'target');
  return e ? e.v : null;
}
ok(Math.abs(lastTarget(bus.ambientGain.gain) - 0.03) < 1e-9, '追逐中环境低频 0.03');
bus.duckAmbient(true);
ok(Math.abs(lastTarget(bus.ambientGain.gain) - 0.004) < 1e-9,
  '转身那 0.73 秒把环境低频抽到 0.004（真空）', String(lastTarget(bus.ambientGain.gain)));
const beforeDup = bus.ambientGain.gain.events.length;
bus.duckAmbient(true);
ok(bus.ambientGain.gain.events.length === beforeDup, '重复抽空不重复排队自动化');
bus.duckAmbient(false);
ok(Math.abs(lastTarget(bus.ambientGain.gain) - 0.03) < 1e-9,
  '交还操作的瞬间环境低频回到追逐值（和 stinger 同一帧）',
  String(lastTarget(bus.ambientGain.gain)));

// stinger：92 → 34Hz 下潜 + 300 → 2600Hz 噪声扫
const sting = capture(() => bus.stinger());
const sub = sting.find((n) => n.kind === 'osc' && n.type === 'sine'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 34));
ok(!!sub, 'stinger 有 92 → 34Hz 的次低下潜');
if (sub) {
  const start = sub.frequency.events.find((e) => e.kind === 'set')?.v;
  ok(start === 92, '下潜起点 92Hz', String(start));
}
const sweep = sting.find((n) => n.kind === 'filter'
  && n.frequency.events.some((e) => e.kind === 'exp' && e.v === 2600));
ok(!!sweep, 'stinger 有一层噪声扫（300 → 2600Hz）');
ok(sting.filter((n) => n.kind === 'buffer').length >= 1, 'stinger 的噪声层真的启动了');

// ── 3. 怪物脚步（A1）────────────────────────────────────────────────────────
bus.setMood('chase');
const near = capture(() => bus.monsterStep(2, 0.28));
const far = capture(() => bus.monsterStep(9, -0.28));
const gone = capture(() => bus.monsterStep(20, 0));

const peakOf = (nodes) => Math.max(0, ...nodes
  .filter((n) => n.kind === 'gain')
  .map((n) => Math.max(...n.gain.events.map((e) => e.v))));

ok(near.filter((n) => n.kind === 'buffer').length === 2, '一步是两层噪声（低频体重 + 爪尖轻碰）',
  `${near.filter((n) => n.kind === 'buffer').length} 层`);
ok(peakOf(near) > peakOf(far) && peakOf(far) > 0, '离得越近脚步越响',
  `2m ${peakOf(near).toFixed(2)} / 9m ${peakOf(far).toFixed(2)}`);
ok(gone.length === 0, '14 米以外一步都不出声（不在地板下制造假声音）', `${gone.length} 个节点`);

const pans = [...near, ...far].filter((n) => n.kind === 'panner').map((n) => n.pan.value);
// 一层脚步 = 两层噪声 = 两个 panner，同一只脚的两个 panner 必须同值
ok(pans.length === 4 && pans.every((p, i) => p === (i < 2 ? 0.28 : -0.28)),
  '左右脚声像按 ±0.28 交替（同一只脚的两层同值）', pans.map((p) => p.toFixed(2)).join(', '));
ok(pans.every((p) => Math.abs(p) <= 1), '声像值在 [-1, 1] 内');

// 连续几步不该从噪声缓冲的同一个位置开始（否则听起来像节拍器）
const sameFoot = near.filter((n) => n.kind === 'buffer').map((n) => n.started[0]?.offset ?? 0);
ok(sameFoot.length === 2 && Math.abs(sameFoot[0] - sameFoot[1]) < 1e-9,
  '同一只脚的两层用同一个噪声起点（听起来是一次动作）', sameFoot.map((o) => o.toFixed(2)).join(', '));
const stepOffsets = [0, 1, 2].map(() => {
  const nodes = capture(() => bus.monsterStep(3, 0));
  return nodes.find((n) => n.kind === 'buffer').started[0].offset;
});
ok(new Set(stepOffsets.map((o) => o.toFixed(3))).size >= 2,
  '相邻脚步换噪声起点（不是同一段噪声循环）', stepOffsets.map((o) => o.toFixed(2)).join(', '));

// 4.45m/s、一步 1.5 米 ⇒ 约 3 步/秒；game.js 里的累积逻辑照抄一遍验证节拍
function stepCount(speed, stride, seconds, dt = STEP) {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    acc += speed * dt;
    if (acc >= stride) { acc -= stride; n += 1; }
  }
  return n;
}
const strideRate = CONFIG.entitySpeed / 1.5;
const tenSec = stepCount(CONFIG.entitySpeed, 1.5, 10);
ok(Math.abs(tenSec - strideRate * 10) <= 1, '追逐中怪物步频约 3 步/秒',
  `${(tenSec / 10).toFixed(2)} 步/秒 @ ${CONFIG.entitySpeed} m/s，步幅 1.5m`);
ok(Math.abs(stepCount(CONFIG.entitySpeed, 1.5, 10, 1 / 30) - tenSec) <= 1,
  '掉到 30fps 步频不变（按走过的距离累积，不按帧数）',
  `${tenSec} 步 vs ${stepCount(CONFIG.entitySpeed, 1.5, 10, 1 / 30)} 步`);

// ── 4. 灯灭声（A5）──────────────────────────────────────────────────────────
const pop = capture(() => bus.lampDeath(-0.35));
const buzz = pop.find((n) => n.kind === 'osc' && n.type === 'square');
ok(!!buzz, '灯灭有灯丝的方波「嗡」');
if (buzz) ok(buzz.frequency.events.some((e) => e.kind === 'exp' && e.v === 70), '方波 128 → 70Hz 断掉');
const popPan = pop.filter((n) => n.kind === 'panner');
ok(popPan.length > 0 && popPan.every((n) => Math.abs(n.pan.value + 0.35) < 1e-9),
  '灯灭声带声像（听得出是身后哪一盏）');
ok(pop.filter((n) => n.kind === 'buffer').length >= 1, '灯灭还带一下玻璃/电流的噪声');

// ── 5. 身后的灯永久熄灭（S1）────────────────────────────────────────────────
ok(hallLampPassed(-8, -10) === true, 'x=-10 的灯在玩家 −8 时已经算「被越过」（−8 > −8.8）');
ok(hallLampPassed(0, 0) === false, '正好在灯下不算越过');
ok(hallLampPassed(HALL_LAMP_KILL_DIST - 0.01, 0) === false
  && hallLampPassed(HALL_LAMP_KILL_DIST + 0.01, 0) === true,
  `越线就是 +${HALL_LAMP_KILL_DIST} 米，边界严格`, '');
ok(hallLampPan(0, 10) === 1 && hallLampPan(0, -10) === -1 && hallLampPan(0, 0) === 0,
  '灯灭声像：右侧 +1 / 左侧 −1 / 正侧 0');
ok(hallLampPan(NaN, 10) === 0, 'playerX 不是数字时声像归 0（不产出 NaN）');

// 把 level.updateLights 的追逐分支照抄一遍跑完整条走廊
const lampX = [];
for (let x = LAYOUT.hall.minX + 10; x <= LAYOUT.hall.maxX - 5; x += 10) lampX.push(x);
ok(lampX.length === 10, '走廊还是 10 盏灯（不增不减，避免着色器重编译）', `${lampX.length}`);

const dead = new Set();
let primed = false;
const pops = [];
const lamps = lampX.map((x) => ({ position: { x }, intensity: 1, distance: 14 }));
const audio = { lampDeath: (pan) => pops.push(pan) };

function tickLights(playerX) {
  if (!primed) {
    primed = true;
    for (let i = 0; i < lamps.length; i += 1) if (hallLampPassed(playerX, lamps[i].position.x)) dead.add(i);
  }
  for (let i = 0; i < lamps.length; i += 1) {
    const lamp = lamps[i];
    if (!dead.has(i) && hallLampPassed(playerX, lamp.position.x)) {
      dead.add(i);
      if (playerX - lamp.position.x <= 8) audio.lampDeath(hallLampPan(playerX, lamp.position.x));
    }
    if (dead.has(i)) { lamp.intensity = 0; continue; }
    lamp.intensity = CONFIG.hallLamp * CONFIG.hallPoolGain;
  }
}

// 起跑位置就在 −8：身后三盏应当静音熄灭，一声都不响
const startX = -8;
tickLights(startX);
ok(pops.length === 0, '起跑第一帧不「啪」一串（身后的灯静音熄灭）', `${pops.length} 声`);
ok(dead.size === 3, '起跑时已越过 3 盏', `x = ${[...dead].map((i) => lampX[i]).join(', ')}`);
ok([...dead].every((i) => lamps[i].intensity === 0), '越过的灯强度归 0（不是留一点余辉）');

// 跑到 EXIT
let playerX = startX;
while (playerX < LAYOUT.exitX) {
  playerX = Math.min(LAYOUT.exitX, playerX + 0.1);
  tickLights(playerX);
}
const crossing = lampX.filter((x) => hallLampPassed(LAYOUT.exitX, x));
ok(dead.size === crossing.length, '跑完全程，路过的灯全灭',
  `${dead.size}/${crossing.length} 盏`);
ok(lamps[lamps.length - 1].intensity > 0, '最前面那盏灯还亮着（前方不黑）');
ok(pops.length === crossing.length - 3, '每越过一盏响一声（起跑那三盏除外）',
  `${pops.length} 声 / ${crossing.length - 3} 盏`);
ok(pops.every((p) => p <= 0 && p >= -1), '灯都在身后 ⇒ 声像全在左/正中', pops.map((p) => p.toFixed(2)).join(', '));

// 一帧跨很远（掉帧 / 传送）时，不该给几十米外的灯补响
const dead2 = new Set();
let primed2 = false;
const pops2 = [];
const lamps2 = lampX.map((x) => ({ position: { x }, intensity: 1 }));
function tick2(px) {
  if (!primed2) {
    primed2 = true;
    for (let i = 0; i < lamps2.length; i += 1) if (hallLampPassed(px, lamps2[i].position.x)) dead2.add(i);
  }
  for (let i = 0; i < lamps2.length; i += 1) {
    if (!dead2.has(i) && hallLampPassed(px, lamps2[i].position.x)) {
      dead2.add(i);
      if (px - lamps2[i].position.x <= 8) pops2.push(hallLampPan(px, lamps2[i].position.x));
    }
  }
}
tick2(-8);
tick2(30); // 一帧从 −8 跳到 30
ok(pops2.length === 0, '一帧跨 38 米时不给远方的灯补响声', `${pops2.length} 声`);
ok(dead2.size === 6, '但那些灯照样灭掉（画面上走廊在身后黑掉）', `${dead2.size} 盏`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
/**
 * _probe/chasemusic.mjs — 追逐伴奏（第十九轮）自检
 *
 * 不开浏览器，用 _probe/fakeaudio.mjs 的假 AudioContext 把四份候选曲的音频图排出来，
 * 检查：四份都在、能起能停、调度器真的在往未来排拍子、强度确实会改快慢、
 * 切歌不会两首叠着、拆机不残留、以及没用到 FakeCtx 之外的 API。
 *
 * 跑法：node _probe/chasemusic.mjs
 */

import { FakeCtx } from './fakeaudio.mjs';
import { ChaseMusic, CHASE_TRACKS, seeded } from '../src/chasemusic.js';

let failed = 0;
let passed = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}${extra ? '  ' + extra : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${extra ? '  ' + extra : ''}`);
  }
}

function fresh() {
  const ctx = new FakeCtx();
  const dest = ctx.createGain();
  const music = new ChaseMusic(ctx, dest);
  return { ctx, dest, music };
}

/** 往前推 0.05 秒走一步，模拟 rAF 每帧调 update()。 */
function advance(ctx, music, seconds, step = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    ctx.currentTime = Number((ctx.currentTime + step).toFixed(4));
    music.update();
  }
}

console.log('追逐伴奏 chasemusic.js');

// ── 1. 曲目表 ────────────────────────────────────────────────────────────
ok('四份候选', CHASE_TRACKS.length === 4, `实际 ${CHASE_TRACKS.length}`);
const ids = CHASE_TRACKS.map((t) => t.id);
const names = CHASE_TRACKS.map((t) => t.name);
ok('id 不重复', new Set(ids).size === 4, ids.join(','));
ok('名字不重复', new Set(names).size === 4, names.join(' / '));
ok('每份都有简介和参考', CHASE_TRACKS.every((t) => t.brief && t.ref && t.name));
ok(
  'bpm 都是 [低, 高] 且低 < 高',
  CHASE_TRACKS.every((t) => Array.isArray(t.bpm) && t.bpm.length === 2 && t.bpm[0] < t.bpm[1]),
  CHASE_TRACKS.map((t) => t.bpm.join('–')).join(' '),
);

// ── 2. 固定种子 ──────────────────────────────────────────────────────────
const s1 = seeded(20251107);
const s2 = seeded(20251107);
const a = [s1(), s1(), s1(), s1()];
const b = [s2(), s2(), s2(), s2()];
ok('同种子出同一串数', a.every((v, i) => v === b[i]), a.map((v) => v.toFixed(3)).join(','));
ok('都落在 [0,1)', a.every((v) => v >= 0 && v < 1));
const s3 = seeded(7);
ok('换种子会变', s3() !== a[0]);

// ── 3. 四份逐个跑 ────────────────────────────────────────────────────────
for (let i = 1; i <= CHASE_TRACKS.length; i += 1) {
  const spec = CHASE_TRACKS[i - 1];
  const { ctx, music } = fresh();
  console.log(`\n${i}. ${spec.name}（${spec.id}）`);

  const idx = music.setTrack(i);
  ok('setTrack 定位正确', idx === i - 1 && music.info().index === i, `info.index=${music.info().index}`);
  ok('没开始前 playing=false', music.playing === false);

  const from = ctx.created.length;
  const started = music.start();
  const built = ctx.created.slice(from);
  ok('start() 起得来', started === true && music.playing === true);
  ok('建了持续音色（振荡器 + 滤波 + 增益）', built.length >= 6, `${built.length} 个节点`);
  ok(
    '有持续音（振荡器已 start）',
    built.filter((n) => n.kind === 'osc' && n.started.length > 0).length >= 2,
  );
  ok(
    '没有偷偷用 WaveShaper / Analyser',
    built.every((n) => n.kind !== 'shaper') && typeof ctx.createAnalyser !== 'function',
  );

  // 调度：推 2 秒，拍子应该一直在往未来排
  advance(ctx, music, 2);
  const beatsAfter2 = music.info().beats;
  const leastBeats = Math.floor(2 / (30 / spec.bpm[1])) - 1;
  ok('推 2 秒排出了拍子', beatsAfter2 >= leastBeats, `${beatsAfter2} 拍（至少 ${leastBeats}）`);

  // 一次性音符是在 advance 里排出来的：现在再看全量节点
  const all = ctx.created.slice(from);
  ok('两秒里排了一大堆一次性音', all.length > built.length + beatsAfter2, `共 ${all.length} 个节点`);

  // 排出来的时间戳必须单调、有限、且落在合理窗口里
  const times = [];
  for (const n of all) {
    if (n.kind === 'osc') {
      for (const e of n.frequency.events) times.push(e.t);
      for (const s of n.started) times.push(s.t);
    }
  }
  ok('所有排程时间都是有限数', times.every((t) => Number.isFinite(t)) && times.length > 0, `${times.length} 个时间戳`);
  ok('没有排在负时间', times.every((t) => t >= -1e-9));
  ok(
    '没有排到太远的未来（调度窗口内）',
    times.every((t) => t <= ctx.currentTime + 1),
    `最远 +${Math.max(...times).toFixed(2)}s，当前 ${ctx.currentTime.toFixed(2)}s`,
  );

  // 强度：满压力必须更快
  const dur0 = music.run.part.stepDur(0);
  const dur1 = music.run.part.stepDur(1);
  ok('强度越高步长越短', dur1 < dur0, `${dur0.toFixed(3)}s → ${dur1.toFixed(3)}s`);
  const bpm0 = 30 / dur0;
  const bpm1 = 30 / dur1;
  ok(
    '实际 bpm 落在标称范围内',
    bpm0 >= spec.bpm[0] - 0.5 && bpm1 <= spec.bpm[1] + 0.5,
    `${bpm0.toFixed(0)} → ${bpm1.toFixed(0)}（标称 ${spec.bpm.join('–')}）`,
  );

  // 掉帧很久：一次 update 不允许补出几十拍
  const before = music.info().beats;
  ctx.currentTime += 10;
  music.update();
  const burst = music.info().beats - before;
  ok('长时间掉帧只补一小段', burst > 0 && burst <= 32, `${burst} 拍`);
  advance(ctx, music, 0.5);

  // 增益都有限且非负（持续音是直接 .value，一次性音符走自动化，两边都查）
  const gains = [];
  for (const n of all) {
    if (n.kind !== 'gain') continue;
    gains.push(n.gain.value);
    for (const e of n.gain.events) gains.push(e.v);
  }
  ok(
    '增益都是有限非负数',
    gains.length > 0 && gains.every((v) => Number.isFinite(v) && v >= 0),
    `${gains.length} 个增益值`,
  );

  const stopped = music.stop(0.3);
  ok('stop() 停得掉', stopped === true && music.playing === false);
  ok('停的时候排了淡出', built.some((n) => n.kind === 'gain' && n.gain.events.some((e) => e.kind === 'lin')));
  ok('持续音都排了 stop', built.filter((n) => n.kind === 'osc').every((n) => n.stopped.length > 0));
  ok('stop() 之后 update 不炸', (() => { try { music.update(); return true; } catch { return false; } })());
}

// ── 4. 换歌与边界 ────────────────────────────────────────────────────────
console.log('\n5. 换歌 / 强度 / 容错');
{
  const { ctx, music } = fresh();
  music.setTrack(1);
  music.start();
  advance(ctx, music, 0.5);
  const oldRun = music.run;
  const before = ctx.created.length;
  music.setTrack(3);
  ok('换歌后 index 变了', music.info().index === 3 && music.info().id === 'industrial');
  ok('换歌后还在放', music.playing === true);
  ok('旧的被拆了（新起了一套节点）', ctx.created.length > before);
  ok('旧的那套已经 dispose', oldRun.stopped === true && oldRun.sources.length === 0);
  ok('换歌后拍子从 0 重新数', music.info().beats <= 1, `${music.info().beats}`);

  music.setIntensity(-1);
  ok('强度下限夹到 0', music.info().intensity === 0);
  music.setIntensity(5);
  ok('强度上限夹到 1', music.info().intensity === 1);
  music.setIntensity(NaN);
  ok('强度 NaN 当 0', music.info().intensity === 0);

  ok('未开始就 update 不炸', (() => { try { const m = fresh().music; m.update(); return true; } catch { return false; } })());
  ok('未开始就 stop 返回 false', fresh().music.stop() === false);

  // 1..4 之外要绕回来，不能越界
  const m2 = fresh().music;
  ok('setTrack(6) 绕回第 2 份', m2.setTrack(6) === 1);
  ok('setTrack(0) 绕回第 4 份', m2.setTrack(0) === 3);
  ok('setTrack(4) 是第 4 份', m2.setTrack(4) === 3);

  const info = m2.info();
  ok('info() 字段齐', ['index', 'id', 'name', 'playing', 'intensity', 'beats'].every((k) => k in info));
  ok('info().intensity 是三位小数', String(info.intensity).split('.')[1]?.length <= 3 || !String(info.intensity).includes('.'));
}

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) {
  console.log('有 FAIL');
  process.exit(1);
}
console.log('全部通过');
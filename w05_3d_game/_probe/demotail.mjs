/**
 * 演示收尾（④ 方案）的行为探针：白光满屏 → 冻住终局 → 白光实打实停 1.0 s → 收尾。
 *
 * 为什么不用浏览器验：演示要跑完五关，无头环境的虚拟时间推不动 rAF（主循环一帧都不走），
 * 跑到菜单那一帧还会直接卡住不出 DOM。这一段的可验之处全在 DemoDirector 的判定上，
 * 所以用假 game 直接喂 dt —— 走的是 STEPS 里真的三步和真的 update()。
 *
 * 验四件事：
 *   1. 白满且已进第 1 段 → 冻住（held / debugHold），且第 2 段之后不许再动；
 *   2. 白光从冻住那一刻起实打实保持 1.0 s 才收尾（不是从进场算）；
 *   3. 白没满、阶段没到都不许收尾（否则观众会看见安全屋，剧透）；
 *   4. finishDemo() 只调一次。
 */
import { readFileSync } from 'node:fs';
import { DemoDirector } from '../src/demo.js';

const STEP = 0.05;
let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}

/** 假 game：只保留 DemoDirector 会碰到的字段。 */
function makeGame({ phase = 'ending', stage = 1, white = 1, whiteLive = true } = {}) {
  return {
    phase,
    endStage: stage,
    debugHold: false,
    finishCalls: 0,
    said: [],
    hud: { fadeShown: { white, black: -1 } },
    whiteLive,
    player: { clearCourse() {} },
    say(text) { this.said.push(text); },
    finishDemo() { this.finishCalls += 1; this.phase = 'menu'; },
    beginFinale() {},
    forceCurrentPhoto() {},
    level: { getAnomalyStand: () => ({ x: 0, z: 4.5 }) },
  };
}

/** 从收尾三步开始喂 dt，返回每帧快照。onFrame 里可以改 game 状态。 */
function run(game, seconds, onFrame = null) {
  const demo = new DemoDirector(game);
  demo.start();
  demo.jumpToTail();
  const trace = [];
  let t = 0;
  let finishAt = -1;
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
    demo.update(STEP);
    t = Number((t + STEP).toFixed(3));
    if (game.finishCalls > 0 && finishAt < 0) finishAt = t;
    trace.push({ t, held: !!demo.held, hold: !!game.debugHold, active: demo.active });
    if (onFrame) onFrame(game, demo, t);
    if (finishAt >= 0) break;
  }
  return { demo, trace, finishAt, t };
}

// A. 正常收尾：白满 + 第 1 段
{
  const game = makeGame({ white: 1, stage: 1 });
  const { demo, trace, finishAt } = run(game, 4);
  const first = trace[0];
  const heldAt = trace.find((f) => f.held).t;
  ok(first.held && first.hold, '第一帧就冻住终局', `held=${first.held} debugHold=${first.hold}`);
  ok(finishAt > 0, '演示确实收尾了', `finishAt=${finishAt}s finishCalls=${game.finishCalls}`);
  // 计时从「冻住」那一帧起算；判定完还要再花一帧调 finishDemo，加上 0.05 s 的粗步长，
  // 所以只允许 3 帧以内的超出，绝不允许短于 1.0 s。
  const holdA = finishAt - heldAt;
  ok(holdA >= 1.0 - 1e-9 && holdA <= 1.0 + 3 * STEP, '白光保持 1.0 s 才收尾（不长不短）',
    `冻住 ${heldAt}s → 收尾 ${finishAt}s = ${holdA.toFixed(2)}s`);
  ok(game.said.length === 0, '没有回头补跑前面的台词', game.said.join('/') || '无');
  ok(game.debugHold === true && demo.held === true, '收尾后冻结标志仍在（交给 abortEnding 清）');

  // 结束后再喂 100 帧，不许重复收尾
  for (let i = 0; i < 100; i += 1) demo.update(STEP);
  ok(game.finishCalls === 1, 'finishDemo 只调一次', `调了 ${game.finishCalls} 次`);
}

// B. 白没满（0.5）+ 第 1 段：不许冻、不许收尾
{
  const game = makeGame({ white: 0.5, stage: 1 });
  const { trace, finishAt } = run(game, 3);
  const anyHeld = trace.some((f) => f.held);
  ok(!anyHeld, '白没满不许冻', `held 出现过 ${anyHeld}`);
  ok(finishAt < 0, '白没满不许收尾', finishAt < 0 ? '没结束（正确）' : `${finishAt}s 就结束了`);
  ok(game.debugHold === false, 'debugHold 没被点起来');
}

// C. 阶段没到：先把白光点满，stage 仍是 0 → 不许收尾；提到 1 之后再数 1.0 s
{
  const game = makeGame({ white: 1, stage: 0 });
  const { trace, finishAt } = run(game, 5, (g, d, t) => {
    if (g.endStage < 1 && t >= 1.5) g.endStage = 1;
  });
  const heldAt = trace.find((f) => f.held)?.t;
  ok(finishAt > 1.5, '阶段没到时一直不收尾', `finishAt=${finishAt}s`);
  const holdC = finishAt - heldAt;
  ok(heldAt >= 0 && holdC >= 1.0 - 1e-9 && holdC <= 1.0 + 3 * STEP, '进段 1 之后重新数满 1.0 s',
    `冻住 ${heldAt}s → 收尾 ${finishAt}s = ${holdC.toFixed(2)}s`);
  ok(trace[0].held === false, '阶段没到之前不冻', `第一帧 held=${trace[0].held}`);
}

// D. 已经换场（stage>=2）但白没满：这时也要冻，不能让它继续往下演
{
  const game = makeGame({ white: 0, stage: 2 });
  const { trace } = run(game, 0.2);
  ok(trace[0].held && game.debugHold, '段 2 起即使白没满也冻住（兜底）', `held=${trace[0].held}`);
}

// E. 非 ending 相位（比如还在 finaleChase）：不许冻
{
  const game = makeGame({ phase: 'finaleChase', white: 1, stage: 1 });
  const { trace, finishAt } = run(game, 1);
  ok(!trace.some((f) => f.held), '不在终局相位时不许冻');
  ok(finishAt < 0, '不在终局相位时不许收尾', finishAt < 0 ? '没结束（正确）' : `${finishAt}s`);
}

// F. 源码契约：上面的探针用的是假 game，这里补一道静态核对，防止收尾顺序被人改回去。
//    ④ 的观感全靠这三步的先后：先把 z-6 的白层顶满 → 回菜单（此时标题已在下面）→ 再淡掉。
{
  const src = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  finishDemo() {'), src.indexOf('  returnToMenu() {'));
  const order = ['setCut(1)', 'returnToMenu()', 'dissolveCut(620)'].map((k) => body.indexOf(k));
  ok(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2],
    'finishDemo 的顺序是 setCut(1) → returnToMenu() → dissolveCut(620)',
    `位置 ${order.join(' / ')}`);

  const abort = src.slice(src.indexOf('  abortEnding() {'), src.indexOf('  badEnd() {'));
  ok(!abort.includes('clearCut'),
    'abortEnding 不碰 #fade-cut（一碰就把演示的溶解掐死）');

  // 第二十轮给 start() 加了第二个参数（opts.musicTau，开场 BGM 渐起的斜坡常数），
  // 所以这里不再写死签名，改成定位到定义行、切到下一个方法。
  const startAt = src.indexOf('  start(asDemo = false');
  const start = src.slice(startAt, src.indexOf('  startDemo() {'));
  ok(startAt > 0, 'start() 还在（签名已带 opts，不再写死参数表）');
  ok(start.includes('hud.clearCut()'),
    'start() 会清 #fade-cut（否则新开一局被一层白蒙住）');
}

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
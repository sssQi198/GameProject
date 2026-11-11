/**
 * 终局「强迫回头 → 自动转回逃跑方向」的纯逻辑校验（不需要 DOM）。
 *
 * 流程和 game.js 一致：beginFinale 里把实体放在正后方 → lookLock 1.25s →
 * beginChase 改成 beginAutoTurn(ESCAPE_YAW) → 转到位才交还操作。
 */
import * as THREE from '../vendor/three.module.js';
import { CONFIG } from '../src/config.js';
import { Player } from '../src/player.js';

// player.syncCamera 会读 prefers-reduced-motion，这里给个最小 window 垫片
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {},
  devicePixelRatio: 1,
};
globalThis.document = { pointerLockElement: null };

const STEP = 1 / 60;
const ESCAPE_YAW = -Math.PI / 2; // +X（EXIT 那头）

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
function wrap(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
const player = new Player(camera);
player.reset(0.4, 2.0, ESCAPE_YAW); // 出教室那一刻：面向 +X
player.setLamp(0);

// ── 1. 强迫注视身后的怪物（和 beginFinale 一样，正后方 7.2m，远景 1.62 高位）──
const gap = CONFIG.entityGap + CONFIG.entitySpeed;
player.beginLookLock(new THREE.Vector3(player.x - gap, 0.6, player.z));
const lockFrames = Math.round(1.25 / STEP);
for (let i = 0; i < lockFrames; i += 1) player.update(STEP, []);
const lockedYaw = player.yaw;
ok(Math.abs(wrap(lockedYaw - Math.PI / 2)) < 0.05, '注视到位：镜头转到 -X（身后）',
  `yaw=${lockedYaw.toFixed(3)} 期望≈${(Math.PI / 2).toFixed(3)}`);
ok(player.pitch < -0.02, '注视时向下看（怪物比眼睛低）', `pitch=${player.pitch.toFixed(3)}`);
ok(!player.autoTurn, '注视阶段没有自动转向在跑');

// ── 2. beginChase：镜头自动转回 +X ──
player.endLookLock();
player.beginAutoTurn(ESCAPE_YAW, 0);
let frames = 0;
let t = 0;
let prevErr = Math.abs(wrap(ESCAPE_YAW - player.yaw));
let monotonic = true;
let maxAbsYaw = Math.abs(player.yaw);
while (player.autoTurn && frames < 600) {
  player.update(STEP, []);
  frames += 1;
  t += STEP;
  const err = Math.abs(wrap(ESCAPE_YAW - player.yaw));
  if (err > prevErr + 1e-6) monotonic = false;
  prevErr = err;
  maxAbsYaw = Math.max(maxAbsYaw, Math.abs(player.yaw));
}
ok(!player.autoTurn, '自动转向会自己结束');
ok(player.yaw === ESCAPE_YAW, '结束时 yaw 精确等于逃跑朝向（无残差）', `yaw=${player.yaw}`);
ok(player.pitch === 0, '结束时俯仰归零（平视走廊）', `pitch=${player.pitch}`);
ok(monotonic, '角度误差单调收敛，没有来回摆');
ok(t > 0.35 && t < 1.2, '转向耗时约半秒级（不会突然瞬移，也不会拖太久）',
  `${t.toFixed(2)}s / ${frames} 帧`);
ok(maxAbsYaw <= Math.PI / 2 + 0.02, '走的是短弧（中途不超出两端的 ±90°）',
  `max|yaw|=${maxAbsYaw.toFixed(3)}`);

// ── 3. 转完之后的「往前跑」就是 +X ──
const fx = -Math.sin(player.yaw);
const fz = -Math.cos(player.yaw);
ok(fx > 0.999 && Math.abs(fz) < 0.01, '镜头朝 +X，按 W 直接跑向 EXIT',
  `forward=(${fx.toFixed(3)}, ${fz.toFixed(3)})`);

// ── 4. 转向期间不接受鼠标位移（攒下来的增量不许在交还操作瞬间甩一下）──
player.beginAutoTurn(ESCAPE_YAW, 0);
player.pendingDX = 500;
player.pendingDY = 500;
player.update(STEP, []);
ok(player.pendingDX === 0 && player.pendingDY === 0, '转向期间丢弃鼠标增量');
player.endAutoTurn();
ok(player.autoTurn === null, 'endAutoTurn 能强制收尾（调试/重开用）');

// ── 5. reset 清干净 ──
player.beginAutoTurn(ESCAPE_YAW, 0);
player.reset(1, 2, ESCAPE_YAW);
ok(player.autoTurn === null, 'reset 清掉自动转向状态');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
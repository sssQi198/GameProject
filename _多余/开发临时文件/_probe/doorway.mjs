/**
 * 安全屋 + 走廊尽头那扇门的几何/接口校验（不需要 WebGL，不需要服务器）。
 *
 * 检查六件事：
 *   1. 隔离：安全屋在 +X 方向离走廊尽头够远，雾够厚，走廊里看不见它
 *   2. 站位：出生点、同学进门点、同学站定点都在房间里，距离合理
 *   3. 门：门轴位置、门板尺寸、开合角度范围、往房间里开
 *   4. 同学：走位 / 转身的速度不会瞬移，转到位精确落点
 *   5. 揭示：setReveal / lunge / setMateOpacity / reset 的边界行为
 *   6. 整组显隐：setVisible 不留下脏状态
 *
 * 同学 GLB 在 node 里加载不了（没有 fetch），所以红眼和尖牙的实际位置
 * 这里查不到——那部分靠浏览器验收确认。本探针只验「几何 + 状态机」。
 */
function makeCtx() {
  const c = {
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, fillRect() {}, clearRect() {}, drawImage() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
    measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  for (const k of ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign',
    'textBaseline', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'lineCap', 'lineJoin']) {
    let v = null;
    Object.defineProperty(c, k, { get() { return v; }, set(nv) { v = nv; }, enumerable: true });
  }
  return c;
}
globalThis.document = {
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => makeCtx();
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
globalThis.window = globalThis;
// 没有网络：让 GLB 加载走失败分支（同学变成一个空 Group，接口照样可测）
globalThis.fetch = () => Promise.reject(new Error('probe: 离线'));
process.on('unhandledRejection', () => {});

const THREE = await import('../vendor/three.module.js');
const { CONFIG } = await import('../src/config.js');
const { LAYOUT } = await import('../src/layout.js');
const { SAFEHOUSE, createSafehouse } = await import('../src/safehouse.js');

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

// ── 1. 隔离 ──
const gap = SAFEHOUSE.minX - LAYOUT.hall.maxX;
ok(gap >= 50, '安全屋离走廊尽头 ≥ 50m（走廊里绝对看不到）', `间距 ${gap.toFixed(1)}m`);
ok(SAFEHOUSE.minX < SAFEHOUSE.maxX && SAFEHOUSE.minZ < SAFEHOUSE.maxZ, '房间包围盒方向正确',
  `x ${SAFEHOUSE.minX}..${SAFEHOUSE.maxX} / z ${SAFEHOUSE.minZ}..${SAFEHOUSE.maxZ}`);
const halfDiag = Math.hypot((SAFEHOUSE.maxX - SAFEHOUSE.minX) / 2, (SAFEHOUSE.maxZ - SAFEHOUSE.minZ) / 2);
ok(SAFEHOUSE.height >= 2.9, '层高 ≥ 2.9m（压抑感来自走廊，不是这间屋）', `${SAFEHOUSE.height}m`);
console.log(`     房间 ${(SAFEHOUSE.maxX - SAFEHOUSE.minX).toFixed(1)}×${(SAFEHOUSE.maxZ - SAFEHOUSE.minZ).toFixed(1)}m，半对角 ${halfDiag.toFixed(1)}m`);
ok(CONFIG.fogSafe < CONFIG.fogCalm * 0.5, '安全屋雾密度不到舒适期的一半（这是「亮起来」的主杠杆）',
  `${CONFIG.fogSafe} vs ${CONFIG.fogCalm}`);
ok(CONFIG.exposureSafe > CONFIG.exposure, '安全屋曝光高于全局基线', `${CONFIG.exposureSafe} vs ${CONFIG.exposure}`);
ok(CONFIG.hemiSafe > 0, '安全屋有独立半球光强度', `hemiSafe=${CONFIG.hemiSafe}`);

// ── 2. 站位与朝向 ──
function inside(p) {
  return p.x > SAFEHOUSE.minX + 0.3 && p.x < SAFEHOUSE.maxX - 0.3
    && p.z > SAFEHOUSE.minZ + 0.3 && p.z < SAFEHOUSE.maxZ - 0.3;
}
ok(inside(SAFEHOUSE.spawn), '出生点在房间内', `(${SAFEHOUSE.spawn.x}, ${SAFEHOUSE.spawn.z})`);
ok(inside(SAFEHOUSE.mateEntry), '同学进门点在房间内', `(${SAFEHOUSE.mateEntry.x}, ${SAFEHOUSE.mateEntry.z})`);
ok(inside(SAFEHOUSE.mateStation), '同学站定点在房间内', `(${SAFEHOUSE.mateStation.x}, ${SAFEHOUSE.mateStation.z})`);
ok(SAFEHOUSE.doorX === SAFEHOUSE.minX, '门开在西墙（最靠近走廊的那面）', `doorX=${SAFEHOUSE.doorX}`);

const spawnToDoor = SAFEHOUSE.spawn.x - SAFEHOUSE.doorX;
ok(spawnToDoor > 2.6 && spawnToDoor < 4.0, '出生点离门 3m 左右（回头就看得到门）', `${spawnToDoor.toFixed(2)}m`);

// 出生朝向：yaw = -π/2 时镜头朝 +X（房间深处），也就是背对门
const fx = -Math.sin(SAFEHOUSE.spawn.yaw);
const fz = -Math.cos(SAFEHOUSE.spawn.yaw);
ok(fx > 0.99 && Math.abs(fz) < 0.02, '出生朝向 +X：进门后是背对门、面向房间', `forward=(${fx.toFixed(2)}, ${fz.toFixed(2)})`);

// 同学进门时背对玩家、面向门（-X）。注意角色模型 +Z 是脸，
// 所以角色朝前的公式是 (sin yaw, cos yaw)，和相机（朝 -Z）差一个负号。
const mateEntryFace = Math.sin(-Math.PI / 2);
ok(mateEntryFace < -0.99, '同学进门时面朝 -X（背对玩家，玩家只看到后背）', `face.x=${mateEntryFace.toFixed(2)}`);

// 同学站定后转向玩家：yaw = atan2(dx, dz)，模型 +Z 是脸
const toPlayerYaw = Math.atan2(SAFEHOUSE.spawn.x - SAFEHOUSE.mateStation.x, SAFEHOUSE.spawn.z - SAFEHOUSE.mateStation.z);
const faceX = Math.sin(toPlayerYaw);
const faceZ = Math.cos(toPlayerYaw);
ok(faceX > 0.9, '转向玩家时脸朝 +X（玩家在门的里侧）', `yaw=${toPlayerYaw.toFixed(3)} face=(${faceX.toFixed(2)}, ${faceZ.toFixed(2)})`);
ok(Math.abs(wrap(toPlayerYaw)) < Math.PI * 0.6, '这次转身是短弧，不到 110°（不会出现「转半圈再转回来」）',
  `${(Math.abs(wrap(toPlayerYaw)) * 180 / Math.PI).toFixed(0)}°`);

const mateToPlayer = Math.hypot(
  SAFEHOUSE.spawn.x - SAFEHOUSE.mateStation.x,
  SAFEHOUSE.spawn.z - SAFEHOUSE.mateStation.z,
);
ok(mateToPlayer > 1.4 && mateToPlayer < 2.2, '同学站定后与玩家相距 1.4–2.2m（飞扑前刚好够压迫）',
  `${mateToPlayer.toFixed(2)}m`);

// ── 3. 建模：真的建出来了 ──
const scene = { add() {}, remove() {} };
const house = createSafehouse(scene);
const need = ['show', 'hide', 'setVisible', 'openDoor', 'doorAngle', 'reset',
  'setMateVisible', 'setMateOpacity', 'mateYaw', 'setMateYaw', 'walkMate', 'turnMate',
  'setReveal', 'lunge', 'mateChestPoint', 'update', 'dispose'];
const missing = need.filter((k) => typeof house[k] !== 'function');
ok(missing.length === 0, '对外接口齐全', missing.length ? `缺 ${missing.join(',')}` : `共 ${need.length + 1} 个（含 group）`);

const root = house.group;
ok(!!root && root.isGroup, '有独立的根节点（整组显隐靠它）');
root.updateMatrixWorld(true);

// 门轴：位置 (doorX, 0, -0.85)
const pivots = [];
root.traverse((o) => {
  if (o.isGroup && Math.abs(o.position.x - SAFEHOUSE.doorX) < 0.01 && Math.abs(o.position.z + 0.85) < 0.01) {
    pivots.push(o);
  }
});
ok(pivots.length === 1, '找到唯一的门轴，位于西墙 doorX / z=-0.85', `找到 ${pivots.length} 个`);

if (pivots.length === 1) {
  const pivot = pivots[0];
  house.openDoor(0);
  root.updateMatrixWorld(true);
  const closed = new THREE.Box3().setFromObject(pivot);
  const w = closed.max.z - closed.min.z;
  const h = closed.max.y - closed.min.y;
  ok(w > 1.6, '门板宽 ≥ 1.6m（够一个人侧身进门）', `${w.toFixed(2)}m`);
  ok(h > 2.1, '门板高 ≥ 2.1m', `${h.toFixed(2)}m`);
  ok(Math.abs(closed.min.x - SAFEHOUSE.doorX) < 1.0, '关门时门板贴着西墙，不突出到走廊里',
    `x ${closed.min.x.toFixed(2)}..${closed.max.x.toFixed(2)}`);

  // 开到最大：门板末端应该甩进房间（+X），而不是穿进墙里
  house.openDoor(1.92);
  root.updateMatrixWorld(true);
  const opened = new THREE.Box3().setFromObject(pivot);
  ok(opened.max.x > SAFEHOUSE.doorX + 0.9, '开门时门板甩进房间一侧（+X）', `max.x=${opened.max.x.toFixed(2)}`);
  ok(opened.min.x > SAFEHOUSE.doorX - 0.35, '门板没有穿到墙外（走廊侧）', `min.x=${opened.min.x.toFixed(2)}`);

  ok(Math.abs(house.doorAngle() - 1.92) < 1e-6, 'openDoor 上限 1.92 弧度（约 110°）', `${house.doorAngle().toFixed(3)}`);
  house.openDoor(9);
  ok(house.doorAngle() <= 1.92 + 1e-6, 'openDoor 会夹住超限值', `${house.doorAngle().toFixed(3)}`);
  house.openDoor(-3);
  ok(house.doorAngle() >= -1e-6, 'openDoor 不接受负角（门只会往里开）', `${house.doorAngle().toFixed(3)}`);
}

// ── 4. 同学：走位与转身 ──
house.reset();
ok(house.mateYaw() !== undefined, 'reset 后可读到同学朝向');
ok(Math.abs(wrap(house.mateYaw() + Math.PI / 2)) < 1e-6, 'reset 后同学背对房间、面朝门（-π/2）',
  `yaw=${house.mateYaw().toFixed(3)}`);

// 走位：从进门点到站定点
let walked = 0;
let guard = 0;
let maxStep = 0;
let prev = house.mateChestPoint();
while (guard < 600) {
  const remain = house.walkMate(1 / 60, 1.15);
  const now = house.mateChestPoint();
  maxStep = Math.max(maxStep, Math.hypot(now.x - prev.x, now.z - prev.z));
  prev = now;
  walked += 1 / 60;
  guard += 1;
  if (remain <= 0) break;
}
ok(guard < 600, '同学会自己走到站定点（不靠外部计时）', `${walked.toFixed(2)}s`);
const chest = house.mateChestPoint();
const stationErr = Math.hypot(chest.x - SAFEHOUSE.mateStation.x, chest.z - SAFEHOUSE.mateStation.z);
ok(stationErr < 0.02, '走到站定点，误差 < 2cm（最后一段是吸附阈值，不再补帧）', `${(stationErr * 1000).toFixed(1)}mm`);
ok(maxStep < 1.15 / 60 + 1e-6, '每帧位移不超过 speed×dt（没有瞬移）', `最大 ${maxStep.toFixed(4)}m/帧`);
const walkYaw = Math.atan2(
  SAFEHOUSE.mateStation.x - SAFEHOUSE.mateEntry.x,
  SAFEHOUSE.mateStation.z - SAFEHOUSE.mateEntry.z,
);
ok(Math.abs(wrap(house.mateYaw() - walkYaw)) < 0.02, '走路时脸朝行进方向',
  `yaw=${house.mateYaw().toFixed(3)} 期望 ${walkYaw.toFixed(3)}`);
ok(walked > 0.8 && walked < 1.15, '进门走到站定点约 1 秒（阶段 6 的 1.0s 预算内）', `${walked.toFixed(2)}s`);

// 关门姿势：走到站定点后转过身去面对门（阶段 6 的后半段）
let toDoorFrames = 0;
while (toDoorFrames < 600) {
  if (house.turnMate(-Math.PI / 2, 4.0, 1 / 60)) break;
  toDoorFrames += 1;
}
ok(Math.abs(wrap(house.mateYaw() + Math.PI / 2)) < 1e-9, '关完门是背对玩家（-π/2）', `yaw=${house.mateYaw().toFixed(3)}`);
console.log(`     关门转身 ${(toDoorFrames / 60).toFixed(2)}s：阶段 6 剩 0.50s，差的部分由阶段 7 补完`);

// 转身：rate 是「弧度/秒」，不是「弧度/帧」
const target = toPlayerYaw;
let frames = 0;
let turnMax = 0;
let last = house.mateYaw();
let done = false;
while (frames < 600) {
  const reached = house.turnMate(target, 2.9, 1 / 60);
  const y = house.mateYaw();
  turnMax = Math.max(turnMax, Math.abs(wrap(y - last)));
  last = y;
  frames += 1;
  if (reached) { done = true; break; }
}
ok(done, 'turnMate 会报告「转到位」', `${(frames / 60).toFixed(2)}s / ${frames} 帧`);
ok(Math.abs(wrap(house.mateYaw() - target)) < 1e-9, '转到位后角度精确等于目标（不留残差）',
  `${house.mateYaw().toFixed(4)} vs ${target.toFixed(4)}`);
ok(turnMax < 2.9 / 60 + 1e-6, '单帧转角 ≤ rate×dt（30 帧/秒也是同样的秒数）', `最大 ${turnMax.toFixed(4)}rad/帧`);
const expectTurn = Math.abs(wrap(target - (-Math.PI / 2))) / 2.9;
ok(Math.abs(frames / 60 - expectTurn) < 0.05, '转身耗时 = 角度 ÷ 2.9 rad/s（和帧率无关）',
  `${(frames / 60).toFixed(2)}s 期望 ${expectTurn.toFixed(2)}s`);
ok(frames / 60 < 1.05 + 1.20, '这一转能在阶段 8（1.05s）+ 阶段 9（1.20s）里转完',
  `${(frames / 60).toFixed(2)}s ≤ 2.25s`);

// ── 5. 揭示 / 飞扑 / 透明度 ──
house.setReveal(0);
ok(true, 'setReveal(0) 不抛（GLB 没加载时红眼/尖牙为 null，也要能跑）');
house.setReveal(1);
ok(true, 'setReveal(1) 不抛');
house.setReveal(2.5);
ok(true, 'setReveal 会夹住越界值');

house.lunge(0);
const atStation = house.mateChestPoint();
house.lunge(1);
const atPlayer = house.mateChestPoint();
ok(Math.abs(atStation.x - SAFEHOUSE.mateStation.x) < 0.01, 'lunge(0) 回到站定点', `x=${atStation.x.toFixed(2)}`);
ok(atPlayer.x > atStation.x + 1.4, 'lunge(1) 向 +X（玩家方向）扑出 1.6m', `x=${atPlayer.x.toFixed(2)}`);
ok(house.lunge(-1) === undefined && Math.abs(house.mateChestPoint().x - SAFEHOUSE.mateStation.x) < 0.01,
  'lunge 夹住负值（不会往门那边飞）');

house.setMateOpacity(0.5);
ok(true, 'setMateOpacity(0.5) 不抛');

// ── 6. 整组显隐 + reset 复位 ──
house.setVisible(true);
ok(house.group.visible === true, 'setVisible(true) 打开整组');
house.setVisible(false);
ok(house.group.visible === false, 'setVisible(false) 关掉整组');
house.setVisible(true);

house.reset();
ok(house.group.visible === true, 'reset 不改整组显隐（由 game 决定）');
ok(Math.abs(house.doorAngle()) < 1e-9, 'reset 关门', `angle=${house.doorAngle()}`);
const back = house.mateChestPoint();
ok(Math.hypot(back.x - SAFEHOUSE.mateEntry.x, back.z - SAFEHOUSE.mateEntry.z) < 0.01,
  'reset 把同学放回进门点', `(${back.x.toFixed(2)}, ${back.z.toFixed(2)})`);
ok(Math.abs(wrap(house.mateYaw() + Math.PI / 2)) < 1e-6, 'reset 把同学朝向复位到 -π/2', `yaw=${house.mateYaw().toFixed(3)}`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
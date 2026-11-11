/**
 * 追逐实体 = 第五关那张脸？核对 createEyes 的几何是否与裂缝那套一致。
 * 只跑纯几何，不需要 DOM。
 */
import * as THREE from '../vendor/three.module.js';
import { createEyes } from '../src/team/m2.js';

let fails = 0;
const check = (ok, msg, extra = '') => {
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  [' + extra + ']' : ''}`);
};
const f = (n) => Math.round(n * 10000) / 10000;

const g = createEyes(THREE);

// ── 收集 ──
const spheres = [];
const cones = [];
const boxes = [];
const addHalos = [];
g.traverse((o) => {
  if (!o.isMesh) return;
  const t = o.geometry.type;
  if (t === 'SphereGeometry') {
    if (o.material.blending === THREE.AdditiveBlending) addHalos.push(o);
    else if (!o.material.transparent) spheres.push(o);   // 半透明那个是身后黑球，不算眼睛
  }
  if (t === 'ConeGeometry') cones.push(o);
  if (t === 'BoxGeometry') boxes.push(o);
});
g.updateMatrixWorld(true);

// ── 眼睛：半径 / 间距 / 高度 / 颜色 ──
check(spheres.length === 2, '红眼 2 颗', `${spheres.length}`);
const eyes = spheres.sort((a, b) => a.position.x - b.position.x);
check(f(eyes[0].geometry.parameters.radius) === 0.087, '眼球半径 = 0.087（同裂缝）',
  `${f(eyes[0].geometry.parameters.radius)}`);
check(f(eyes[0].position.x) === -0.19 && f(eyes[1].position.x) === 0.19,
  '眼心间距 ±0.19（同裂缝）', `${f(eyes[0].position.x)} / ${f(eyes[1].position.x)}`);
check(f(eyes[0].position.y) === 1.62, '眼高 1.62', `${f(eyes[0].position.y)}`);
check(eyes[0].material.color.getHex() === 0xff2030, '眼睛色 0xff2030（同裂缝）',
  '#' + eyes[0].material.color.getHexString());
check(eyes[0].material.toneMapped === false, 'toneMapped:false（不被 ACES 压灰）');

// ── 光晕 ──
check(addHalos.length === 2, '加性光晕 2 个', `${addHalos.length}`);
check(addHalos.length === 2 && f(addHalos[0].geometry.parameters.radius) === f(0.087 * 1.9),
  '光晕直径 = 半径 ×1.9（同裂缝）',
  addHalos.length ? `${f(addHalos[0].geometry.parameters.radius)}` : '—');
check(addHalos.length === 2 && f(addHalos[0].material.opacity) === 0.18, '光晕 opacity 0.18');

// ── 咧嘴尖牙 ──
check(cones.length === 17, '牙 17 颗（上 9 下 8）', `${cones.length}`);
const toothBox = new THREE.Box3();
cones.forEach((t) => toothBox.expandByObject(t));
check(f(toothBox.min.x) < -0.40 && f(toothBox.max.x) > 0.40, '咧嘴半宽 ≈ 0.43（0.46×0.94）',
  `${f(toothBox.min.x)} .. ${f(toothBox.max.x)}`);
// 嘴在眼睛下方，且不咬到眼球
const eyeBottom = 1.62 - 0.087;
check(f(toothBox.max.y) < eyeBottom, '牙最高点低于眼球下沿（不咬眼）',
  `牙顶 ${f(toothBox.max.y)} < 眼下沿 ${f(eyeBottom)}，差 ${f(eyeBottom - toothBox.max.y)}`);
check(f(toothBox.max.y) > 1.30, '牙最高点落在眼睛下方足够近（嘴角咧到位）', `${f(toothBox.max.y)}`);
// 牙在眼睛前面
check(f(toothBox.min.z) > 0.02, '牙整排在眼睛前面（z 更大 = 更靠玩家）',
  `${f(toothBox.min.z)} > 0.02`);

// ── 脸板 ──
check(boxes.length === 8, '黑脸板 8 块（主板/颅顶/眉弓×2/鼻梁/颧骨×2/下颌）', `${boxes.length}`);
const faceBox = new THREE.Box3();
boxes.forEach((b) => faceBox.expandByObject(b));
check(f(faceBox.max.y) > 1.62 + 0.30, '脸板高过眼睛（有颅顶）', `顶 ${f(faceBox.max.y)}`);
check(f(faceBox.min.y) < 1.14, '脸板低于嘴（有下颌）', `底 ${f(faceBox.min.y)}`);

// ── 身后那团黑不能盖住脸 ──
const dark = g.children.find((o) => o.isMesh && o.geometry.type === 'SphereGeometry'
  && o.material.transparent && o.material.color.getHex() === 0x000000);
check(!!dark, '身后黑球存在');
if (dark) {
  const r = dark.geometry.parameters.radius;
  const dy = 1.62 - dark.position.y;
  const frontAtEyes = dark.position.z + Math.sqrt(Math.max(0, r * r - dy * dy));
  check(f(frontAtEyes) < 0.02, '黑球前表面在眼睛之后（不会蒙住红眼）',
    `黑球前沿 ${f(frontAtEyes)} < 眼 z 0.02`);
  check(f(frontAtEyes) < f(faceBox.min.z), '黑球前表面在脸板之后（不会蒙掉牙和脸）',
    `黑球前沿 ${f(frontAtEyes)} < 脸板最前 ${f(faceBox.min.z)}`);
}

// ── 贴脸压制 setGrin ──
const toothMat = cones[0].material;
const full = toothMat.color.getHex();
const linFull = toothMat.color.r;          // 材质色是线性的，getHex 会转回 sRGB，别拿它算比例
const grinRoot = cones[0].parent;
const sFull = grinRoot.scale.x;
g.userData.setGrin(0);
const near = toothMat.color.getHex();
const linNear = toothMat.color.r;
const sNear = grinRoot.scale.x;
check(full !== near, 'setGrin(0) 会把牙齿压暗',
  '#' + new THREE.Color(full).getHexString() + ' → #' + new THREE.Color(near).getHexString());
check(sNear < sFull, 'setGrin(0) 会把咧嘴略微缩小', `${f(sFull)} → ${f(sNear)}`);
const ratio = linNear / linFull;
check(Math.abs(ratio - 0.30) < 0.02, '近距离线性色压到 0.30 倍', `${f(ratio)}`);
const lumFull = (full >> 16 & 255) + (full >> 8 & 255) + (full & 255);
const lumNear = (near >> 16 & 255) + (near >> 8 & 255) + (near & 255);
check(lumNear / lumFull > 0.4 && lumNear / lumFull < 0.6,
  '肉眼看掉到五成左右（不糊屏，但仍读得出牙）', `${f(lumNear / lumFull)} 倍`);
g.userData.setGrin(1);
check(toothMat.color.getHex() === full, 'setGrin(1) 能恢复原亮度');

console.log(fails === 0 ? '\n全部通过' : `\n${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
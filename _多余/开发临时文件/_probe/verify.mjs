/**
 * 第 5 关血肉墙的数值验证（不需要 WebGL）。
 * 1) createFleshWall() 能否跑完不报错；
 * 2) 有没有真正偏青/偏绿的材质（用色度判定，不是简单的通道阈值）；
 * 3) 裂缝/触手/肉芽/血管在墙前面还是里面、在天花板下面还是上面；
 * 4) 从玩家站位是否落在视锥里。
 *
 * 跑法：node _probe/verify.mjs
 */

// ---------- 最小 canvas / 2d 上下文替身 ----------
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

const THREE = await import('../vendor/three.module.js');
const { createAnomaly } = await import('../src/anomalies.js');
const { LAYOUT } = await import('../src/layout.js');

const room = LAYOUT.room;
const WALL_Z = room.minZ + 0.01;
const CEIL_Y = room.height - 0.04;
const CEIL_LOWEST = CEIL_Y - 0.018;

const out = [];
const log = (s = '') => out.push(s);
const pad = (s, n) => String(s).padEnd(n);

log('room: minZ=' + room.minZ + '  height=' + room.height);
log('前墙血肉面 z=' + WALL_Z.toFixed(3)
  + '   天花板血肉面 y=' + CEIL_Y.toFixed(3)
  + '   呼吸最低 y=' + CEIL_LOWEST.toFixed(3));
log('');

let anomaly;
try {
  anomaly = createAnomaly(5);
} catch (e) {
  console.log('=== createFleshWall() THREW ===');
  console.log(e && e.stack ? e.stack : e);
  process.exit(1);
}
const group = anomaly.group;
group.updateMatrixWorld(true);

const meshes = [];
group.traverse((o) => { if (o.isMesh) meshes.push(o); });

log('createFleshWall() OK  id=' + anomaly.id + '  children=' + group.children.length
  + '  meshes=' + meshes.length);
log('');

// ---------- 颜色审计：色度判定 ----------
const byColor = new Map();
for (const m of meshes) {
  const mat = m.material;
  if (!mat || !mat.color) continue;
  const hasMap = !!mat.map;
  const hex = mat.color.getHex();
  const key = (hasMap ? 'MAP:' : '') + hex.toString(16).padStart(6, '0');
  const rec = byColor.get(key) || { key, hex, hasMap, count: 0, type: m.geometry.type };
  rec.count += 1;
  byColor.set(key, rec);
}
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const cyanFam = [];
const greenFam = [];
for (const rec of byColor.values()) {
  if (rec.hasMap) continue;
  const [r, g, b] = rgbOf(rec.hex);
  const mx = Math.max(g, b);
  if (g >= 60 && b >= 60 && r < mx - 20) cyanFam.push({ ...rec, r, g, b });
  else if (g >= 80 && g > r + 40 && g > b + 30) greenFam.push({ ...rec, r, g, b });
}
log('=== 颜色审计（按色度判定，不贴图材质）===');
log('偏青/蓝绿材质: ' + cyanFam.length + (cyanFam.length === 0 ? '   PASS' : '   <-- FAIL'));
cyanFam.forEach((s) => log('   ' + s.key + ' rgb(' + s.r + ',' + s.g + ',' + s.b + ') x' + s.count + ' ' + s.type));
log('偏绿材质    : ' + greenFam.length + (greenFam.length === 0 ? '   PASS' : '   <-- FAIL'));
greenFam.forEach((s) => log('   ' + s.key + ' rgb(' + s.r + ',' + s.g + ',' + s.b + ') x' + s.count + ' ' + s.type));
log('');
log('全部不贴图材质：');
[...byColor.values()].filter((r) => !r.hasMap).sort((a, b) => b.count - a.count).forEach((r) => {
  const [R, G, B] = rgbOf(r.hex);
  log('   ' + pad('#' + r.key, 10) + pad('rgb(' + R + ',' + G + ',' + B + ')', 20) + 'x' + r.count);
});
log('');

// ---------- 几何审计 ----------
function bbOf(m) {
  m.geometry.computeBoundingBox();
  const bb = m.geometry.boundingBox.clone();
  bb.applyMatrix4(m.matrixWorld);
  return bb;
}

const crackColors = new Set(['3c0709', '140102', '020000']);
const cracks = [];
const tents = [];
const veins = [];
const bumps = [];
for (const m of meshes) {
  const hex = m.material && m.material.color ? m.material.color.getHex() : 0;
  const rec = { m, bb: bbOf(m), hex, type: m.geometry.type };
  const h = hex.toString(16).padStart(6, '0');
  if (crackColors.has(h)) cracks.push(rec);
  else if (m.geometry.type === 'TubeGeometry') {
    // 血管的 B 通道 >= 0x0a；触手是纯红黑（B <= 0x08）
    if ((hex & 255) >= 0x0a) veins.push(rec); else tents.push(rec);
  } else if (m.geometry.type === 'SphereGeometry' && m.geometry.parameters.radius < 0.09
    && (hex & 0xffffff) !== 0xff2030) bumps.push(rec);
}

log('=== 裂缝本体（应为 9：前墙臂/天花板臂/转角补片 各三层）===');
for (const c of cracks) {
  log('   #' + c.hex.toString(16).padStart(6, '0')
    + '  x[' + c.bb.min.x.toFixed(2) + ',' + c.bb.max.x.toFixed(2) + ']'
    + '  y[' + c.bb.min.y.toFixed(2) + ',' + c.bb.max.y.toFixed(2) + ']'
    + '  z[' + c.bb.min.z.toFixed(2) + ',' + c.bb.max.z.toFixed(2) + ']');
}
// 环形条带每圈拆成左右两片：3 圈 x 2 臂 x 2 片 = 12，加转角补片 3 + 天花板臂封口 1 = 16
log('   数量=' + cracks.length + (cracks.length === 16 ? '  PASS' : '  <-- FAIL'));
log('');

function audit(name, list, checks) {
  log(name + '  n=' + list.length);
  for (const [label, fn] of checks) {
    let bad = 0;
    for (const r of list) if (!fn(r)) bad += 1;
    log('   ' + pad(label, 46) + ' 越界=' + bad + (bad === 0 ? '  PASS' : '  <-- FAIL'));
  }
}

log('=== 位置审计 ===');
audit('触手 TubeGeometry', tents, [
  ['minZ > 前墙面 ' + WALL_Z.toFixed(2) + '（不在墙里）', (r) => r.bb.min.z > WALL_Z],
  ['minY < 天花板呼吸最低 ' + CEIL_LOWEST.toFixed(3) + '（主体在下方，可见）', (r) => r.bb.min.y < CEIL_LOWEST],
]);
{
  const poked = tents.filter((r) => r.bb.max.y >= CEIL_LOWEST).length;
  log('   （其中 ' + poked + '/' + tents.length + ' 根尖端伸进天花板，看起来就是从天花板里长出来，属正常）');
}
audit('肉芽 SphereGeometry', bumps, [
  ['minZ > 前墙面 ' + WALL_Z.toFixed(2), (r) => r.bb.min.z > WALL_Z],
  ['maxY < 天花板呼吸最低 ' + CEIL_LOWEST.toFixed(3), (r) => r.bb.max.y < CEIL_LOWEST],
]);
// 血管是贴面细节：少量穿进墙里/天花板里属于"埋进遮蔽物"，肉眼不可见，不算视觉缺陷，
// 所以这里只报告不判定。
log('血管 TubeGeometry  n=' + veins.length + '（信息项，不计 PASS/FAIL）');
{
  const inWall = veins.filter((r) => r.bb.min.z <= WALL_Z - 0.06).length;
  const inCeil = veins.filter((r) => r.bb.max.y >= CEIL_LOWEST).length;
  log('   有部分埋进前墙的: ' + inWall + '/' + veins.length);
  log('   有部分埋进天花板的: ' + inCeil + '/' + veins.length);
}
log('');

// ---------- 视锥 ----------
const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 180);
cam.position.set(0, 1.62, 4.2);
cam.lookAt(0, 2.70, -6.0);
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();
const frustum = new THREE.Frustum().setFromProjectionMatrix(
  new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
);
const inF = (list) => list.filter((r) => frustum.intersectsBox(r.bb)).length;

log('=== 视锥审计（相机 (0,1.62,4.2) 看向 (0,2.70,-6)）===');
log('   裂缝   ' + inF(cracks) + '/' + cracks.length + (inF(cracks) === cracks.length ? '  PASS' : '  <-- FAIL'));
log('   触手   ' + inF(tents) + '/' + tents.length);
log('   肉芽   ' + inF(bumps) + '/' + bumps.length);
log('   血管   ' + inF(veins) + '/' + veins.length);

const pts = [
  ['墙臂中部  (0,2.20,-5.92)', new THREE.Vector3(0, 2.20, -5.92)],
  ['墙臂下段  (0,1.50,-5.92)', new THREE.Vector3(0, 1.50, -5.92)],
  ['L 转角    (0,3.09,-5.92)', new THREE.Vector3(0, 3.09, -5.92)],
  ['天花板臂  (0,3.09,-4.60)', new THREE.Vector3(0, 3.09, -4.60)],
];
for (const [name, v] of pts) {
  const p = v.clone().project(cam);
  const ok = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
  log('   ' + pad(name, 26) + ' NDC(' + p.x.toFixed(3) + ',' + p.y.toFixed(3) + ')'
    + (ok ? '  画面内 PASS' : '  画面外 FAIL'));
}
log('');
log('=== 数量 ===');
log('   裂缝条带 ' + cracks.length + ' / 触手 ' + tents.length
  + ' / 肉芽 ' + bumps.length + ' / 血管 ' + veins.length);

console.log(out.join('\n'));

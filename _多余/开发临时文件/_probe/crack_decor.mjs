/**
 * 第 5 关「裂缝周围的装饰」接入验证（Node 端，不需要 WebGL）。
 *
 * 把 crack_decor_v01.glb 真读进 createAnomaly(5)，确认：
 *   - 载入成功后程序化翻边 / 触手 / 肉芽整组被换掉；
 *   - 世界坐标、朝向、L 形尺寸和深渊/脸/眼/牙对得上；
 *   - 洞心仍然是空的，翻边没有挡住眼睛；
 *   - 材质是白色 MeshBasic + 顶点色，不吃光、不进雾；
 *   - 眼睛、黑脸、牙三个旧 glb 仍然走 glb（没有回归）。
 *
 * 跑法：node _probe/crack_decor.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// ---------- canvas / document 替身 ----------
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
function makeFakeImage() {
  const img = { width: 512, height: 512, style: {} };
  const listeners = {};
  img.addEventListener = (type, fn) => { listeners[type] = fn; };
  img.removeEventListener = () => {};
  Object.defineProperty(img, 'src', {
    set(v) { img._src = v; queueMicrotask(() => { if (listeners.load) listeners.load.call(img); }); },
    get() { return img._src; },
  });
  img.decode = () => Promise.resolve();
  return img;
}
globalThis.document = {
  body: { dataset: {} },
  createElement(tag) {
    if (tag === 'img') return makeFakeImage();
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => makeCtx();
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
globalThis.window = globalThis;
globalThis.self = globalThis;
self.URL.createObjectURL = () => 'blob:crack-detail';
self.URL.revokeObjectURL = () => {};
globalThis.ProgressEvent = class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};

// ---------- 把 /assets/... 的请求落到仓库文件 ----------
const RealRequest = globalThis.Request;
const RealFetch = globalThis.fetch;
globalThis.Request = class extends RealRequest {
  constructor(input, init) {
    if (typeof input === 'string' && input.startsWith('/')) input = 'http://local' + input;
    super(input, init);
  }
};
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  if (u.host === 'local') {
    const file = path.join(ROOT, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file), {
      status: 200,
      headers: { 'Content-Type': 'model/gltf-binary' },
    });
  }
  return RealFetch(input, init);
};

const THREE = await import('../vendor/three.module.js');
const { createAnomaly } = await import('../src/anomalies.js');

const out = [];
let fails = 0;
const log = (s = '') => out.push(s);
const check = (ok, msg) => {
  if (!ok) fails += 1;
  log((ok ? 'PASS  ' : 'FAIL  ') + msg);
  return ok;
};
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const round = (v, n = 4) => Number(v.toFixed(n));

const anomaly = createAnomaly(5);
await anomaly.whenReady;
const group = anomaly.group;
group.updateMatrixWorld(true);

log('=== 1. 四个 glb 载入 ===');
for (const [key, label] of [['eyesModel', '眼睛'], ['faceModel', '黑脸'],
  ['teethModel', '牙'], ['crackDecor', '裂缝翻边']]) {
  check(document.body.dataset[key] === 'glb',
    label + ' 走 glb（body.dataset.' + key + ' = ' + document.body.dataset[key] + '）');
}

const root = group.getObjectByName('CrackDecor');
const mesh = group.getObjectByName('CrackDecor_Mesh');
check(!!root, '场景里找到 CrackDecor 根节点');
check(!!mesh && mesh.isMesh, '场景里找到 CrackDecor_Mesh');
const rootWorld = root ? root.getWorldPosition(new THREE.Vector3()) : null;
check(!!rootWorld && near(rootWorld.x, 0) && near(rootWorld.y, 3.09) && near(rootWorld.z, -5.92),
  '根节点世界位置 (0, 3.09, -5.92)，实际 ('
  + (rootWorld ? [rootWorld.x, rootWorld.y, rootWorld.z].map((v) => round(v)).join(', ') : 'n/a') + ')');
check(root?.children.length === 1 && root.children[0] === mesh, '根节点下只有 1 个网格');

log('=== 2. 程序化翻边已换掉 ===');
check(!group.getObjectByName('crack-decor-procedural'),
  '程序化翻边组 crack-decor-procedural 已移除');
// 程序化翻边是 3 个近黑/暗红材质的平面组；新模型是 1 个带顶点色的网格。
// 这里确认没有残留的装饰条带：翻边组名没了就够，深渊/脸/牙本来就不在组里。

log('=== 3. 材质 ===');
const mat = mesh?.material;
check(!!mat && mat.isMeshBasicMaterial, '材质是 MeshBasicMaterial（不吃光）');
check(mat?.vertexColors === true, '材质开了 vertexColors');
check(mat?.color?.getHex() === 0xffffff, '材质底色是白（颜色全在顶点色）');
check(mat?.fog === false, 'fog = false（暗红不被雾洗灰）');
check(mat?.toneMapped === false, 'toneMapped = false（顶点色就是最终颜色）');
check(mat?.side === THREE.DoubleSide, 'DoubleSide（和旧的裂缝材质一致）');
check(!!mesh?.geometry?.attributes?.color, '几何体带顶点色');
check(!!mesh?.geometry?.attributes?.uv, '几何体带 UV');
check(!!mat?.map, '材质带细节贴图 map（斑驳/肌纤维/血点）');

log('=== 4. 世界包围盒 / 朝向 ===');
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
log('  size = (' + [size.x, size.y, size.z].map((v) => round(v)).join(', ') + ')');
log('  min  = (' + [box.min.x, box.min.y, box.min.z].map((v) => round(v)).join(', ') + ')');
log('  max  = (' + [box.max.x, box.max.y, box.max.z].map((v) => round(v)).join(', ') + ')');
check(near(size.x, 2.5027, 0.02), 'X 跨度 2.503 m');
check(near(size.y, 3.1794, 0.02), 'Y 跨度 3.179 m');
check(near(size.z, 2.6680, 0.02), 'Z 跨度 2.668 m');
check(near(box.min.y, 0.0, 0.03), '底部落在地面附近 y = ' + round(box.min.y));
check(box.max.y < 3.16 + 0.005, '顶部没有穿过天花板面 3.16');
check(near(box.max.z, -3.3148, 0.02), '天花板臂伸到 z = ' + round(box.max.z) + '（2.6 m）');
check(box.min.z > -5.99 - 0.005, '最靠墙 z = ' + round(box.min.z) + '，没有穿到墙后');

// 顶面 y=0 的位置：模型是挂在前墙 + 天花板上的，不应超过 3.16
log('=== 5. 洞心 / 眼睛间隙 ===');
const pos = mesh.geometry.attributes.position;
const v3 = new THREE.Vector3();
let hollow = 0;
let eyeHit = 0;
const eyeBox = new THREE.Box3();
const eyes = [];
group.traverse((n) => {
  if (n.isMesh && /^Eye_[LR]$/.test(n.name)) eyes.push(n);
});
check(eyes.length === 2, '找到两只眼睛');
for (const e of eyes) eyeBox.expandByObject(e);
const eyeHitBox = eyeBox.clone().expandByScalar(0.01);
const eyeAt = [];
for (let i = 0; i < pos.count; i += 1) {
  v3.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
  if (Math.abs(v3.x) < 0.08 && v3.y > 0.7 && v3.y < 2.6) hollow += 1;
  if (eyeHitBox.containsPoint(v3)) eyeHit += 1;
  if (Math.abs(v3.y - 2.42) < 0.05) eyeAt.push(v3.x);
}
check(hollow === 0, '洞心 (|x|<8 cm, 0.7<y<2.6) 没有顶点，实际 ' + hollow);
check(eyeHit === 0, '翻边没有碰到眼睛包围盒，实际 ' + eyeHit);
const leftX = Math.max(...eyeAt.filter((x) => x < 0));
const rightX = Math.min(...eyeAt.filter((x) => x > 0));
log('  眼睛高度内唇 x ∈ [' + round(leftX) + ', ' + round(rightX)
  + ']，开口 ' + round(rightX - leftX) + ' m');
check(rightX - leftX > 0.60, '眼睛高度开口 ' + round(rightX - leftX) + ' m > 0.60');
check(leftX < eyeBox.min.x && rightX > eyeBox.max.x,
  '内唇落在眼睛包围盒外侧（眼睛不会被翻边遮住）');

log('=== 6. 顶点色三档 ===');
const colors = mesh.geometry.attributes.color;
let cMin = Infinity;
let cMax = -Infinity;
let cDeep = 0;
let cBlood = 0;
let cBlack = 0;
let colMaxG = 0;
for (let i = 0; i < colors.count; i += 1) {
  const r = colors.getX(i);
  const g = colors.getY(i);
  const b = colors.getZ(i);
  cMin = Math.min(cMin, r);
  cMax = Math.max(cMax, r);
  colMaxG = Math.max(colMaxG, g, b);
  if (r < 0.01) cBlack += 1;
  else if (r < 0.10) cDeep += 1;
  else cBlood += 1;
}
log('  R ∈ [' + round(cMin, 4) + ', ' + round(cMax, 4) + ']，G/B ≤ ' + round(colMaxG, 4));
log('  近黑 ' + cBlack + ' / 深红 ' + cDeep + ' / 暗血红 ' + cBlood + ' 顶点');
check(cBlack > 0 && cDeep > 0 && cBlood > 0, '三档都出现在顶点色里');
check(colMaxG < 0.05, '只有红/黑');

log('=== 7. 拍照判定没有被新翻边挡住 ===');
const raycaster = new THREE.Raycaster();
raycaster.far = 8.5;
function aimTag(from, toward) {
  const dir = toward.clone().sub(from).normalize();
  raycaster.set(from, dir);
  for (const h of raycaster.intersectObject(group, true)) {
    let cur = h.object;
    while (cur) {
      if (cur.userData?.anomalyLevel === 5) return { tag: cur.userData, hit: h };
      cur = cur.parent;
    }
  }
  return null;
}
const from = new THREE.Vector3(0, 1.62, 2.0);
const eyeAim = aimTag(from, new THREE.Vector3(0, 2.42, -5.952));
check(!!eyeAim, '从 (0,1.62,2.0) 瞄眼睛 → 命中异常'
  + (eyeAim ? '（' + eyeAim.tag.anomalyId + '）' : ''));
const wallAim = aimTag(from, new THREE.Vector3(2.5, 2.4, -5.99));
check(!wallAim, '瞄墙面 (x=2.5) → 拍不到，必须对准眼睛');
const standAim = aimTag(new THREE.Vector3(0, 1.62, 4.2), new THREE.Vector3(0, 2.42, -5.952));
check(!standAim, '站远处 (0,4.2) 拍不到 → 必须走近');

// ---------- 输出 ----------
console.log(out.join('\n'));
console.log('');
if (fails) {
  console.log(`=== ${fails} 项失败 ===`);
  process.exit(1);
} else {
  console.log('=== 全部通过 ===');
}

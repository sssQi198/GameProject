/**
 * 第 5 关「咧嘴的牙」接入验证（Node 端，不需要 WebGL）。
 *
 * 和 eyes.mjs 不同，这个 probe 会把 assets/models/teeth_v01.glb 真的读进来：
 *   - 把 three.js FileLoader 的 fetch 指到本地文件；
 *   - 等 createAnomaly(5).whenReady 里的三个 glb 都载完；
 *   - 再量牙齿在世界坐标里的包围盒、牙数、材质、和眼睛的距离。
 *
 * 跑法：node _probe/teeth.mjs
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
globalThis.document = {
  body: { dataset: {} },
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => makeCtx();
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
globalThis.window = globalThis;
// three.js 的 FileLoader 会 new ProgressEvent；Node 里没有这个类
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

log('=== 1. glb 载入 ===');
check(document.body.dataset.teethModel === 'glb', 'body.dataset.teethModel = glb（不是 fallback）');
const root = group.getObjectByName('GrinTeeth');
check(!!root, '场景里找到 GrinTeeth 根节点');
const mesh = group.getObjectByName('GrinTeeth_Mesh');
check(!!mesh && mesh.isMesh, '场景里找到 GrinTeeth_Mesh');
check(mesh?.geometry?.attributes?.color, '牙齿几何体带顶点色');
check(mesh?.material?.vertexColors === true, '材质开了 vertexColors');
check(mesh?.material?.color?.getHex() === 0x4a2a20, '材质颜色是 #4a2a20');
check(mesh?.material?.fog === false, '材质 fog = false（暗红不会被雾洗灰）');
check(mesh?.material?.side === THREE.DoubleSide, '沿用程序化牙的 DoubleSide 材质');

// 17 个程序化锥体应该已经被换掉：GrinTeeth 的父级是 glTF 的 scene，
// 再往上一级才是 anomalies.js 里的 teethRoot 组。
const gltfScene = root.parent;
const teethRoot = gltfScene ? gltfScene.parent : null;
check(!!teethRoot && teethRoot.isGroup, 'GrinTeeth 挂在 teethRoot 组里');
check(teethRoot?.children.length === 1 && teethRoot.children[0] === gltfScene,
  'teethRoot 下只剩 1 个 glb scene，实际 ' + (teethRoot ? teethRoot.children.length : 'n/a'));
let cones = 0;
group.traverse((n) => {
  if (n.isMesh && n.geometry?.type === 'ConeGeometry') cones += 1;
});
check(cones === 0, '17 个程序化锥体已移除（剩下 ' + cones + ' 个）');

// ---------- 世界包围盒 ----------
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
log('  世界包围盒 size = (' + [size.x, size.y, size.z].map((v) => round(v)).join(', ') + ')');
log('  世界包围盒 center = (' + [center.x, center.y, center.z].map((v) => round(v)).join(', ') + ')');

log('=== 2. 尺寸与位置 ===');
check(near(size.x, 0.9, 2e-3), '宽 0.900 m');
check(near(size.y, 0.4523, 3e-3), '高 0.4523 m');
check(near(size.z, 0.0587, 3e-3), '厚 0.0587 m');
check(near(center.y, 2.035, 2e-3), '垂直中心 y = 2.035');
check(near(center.z, -5.9, 2e-3), '深度中心 z = -5.900');
check(near(box.max.z, -5.8707, 3e-3), '最前面 z = -5.8707（和旧牙尖 -5.871 对齐）');

// 高度/宽度要落在原来程序化牙的范围内
check(box.max.y < 2.262 && box.min.y > 1.808, 'y ∈ [' + round(box.min.y) + ', ' + round(box.max.y) + ']');

// ---------- 眼睛：牙不能咬到 ----------
const eyes = [];
group.traverse((n) => {
  if (n.isMesh && /^Eye_[LR]$/.test(n.name)) eyes.push(n);
});
check(eyes.length === 2, '找到两只眼睛（glb 或程序化）');
if (eyes.length === 2) {
  const eyeBox = new THREE.Box3();
  for (const e of eyes) eyeBox.expandByObject(e);
  log('  眼睛包围盒 y ∈ [' + round(eyeBox.min.y) + ', ' + round(eyeBox.max.y) + ']');
  check(box.max.y < eyeBox.min.y - 0.05, '牙的最高点离眼球下沿至少 5 cm');
  const eyeCx = (eyeBox.min.x + eyeBox.max.x) / 2;
  check(near(center.x, eyeCx, 0.02), '整排牙和两眼中心对齐（x 差 ' + round(center.x - eyeCx) + ' m）');
}

// ---------- 笑弧与交错 ----------
log('=== 3. 笑弧与交错 ===');
// 直接读 glb 顶点：上排 9 颗、下排 8 颗在 teeth_asset.mjs 已逐颗验过；
// 这里只验整排在游戏坐标里的嘴角比中间高。
const pos = mesh.geometry.attributes.position;
let leftMaxY = -Infinity;
let rightMaxY = -Infinity;
let midMaxY = -Infinity;
for (let i = 0; i < pos.count; i += 1) {
  const x = pos.getX(i);
  const y = pos.getY(i);
  if (x < -0.38) leftMaxY = Math.max(leftMaxY, y);
  else if (x > 0.38) rightMaxY = Math.max(rightMaxY, y);
  else if (Math.abs(x) < 0.1) midMaxY = Math.max(midMaxY, y);
}
const lift = (leftMaxY + rightMaxY) / 2 - midMaxY;
log('  嘴角 y = ' + round((leftMaxY + rightMaxY) / 2) + '，中间 y = ' + round(midMaxY));
check(lift > 0.18 && lift < 0.23, '嘴角比中间高 ' + round(lift) + ' m（目标 0.200）');
check(Math.abs(leftMaxY - rightMaxY) < 0.01, '左右嘴角一样高（差 ' + round(Math.abs(leftMaxY - rightMaxY)) + ' m）');

// ---------- 输出 ----------
console.log(out.join('\n'));
console.log('');
if (fails) {
  console.log(`=== ${fails} 项失败 ===`);
  process.exit(1);
} else {
  console.log('=== 全部通过 ===');
}

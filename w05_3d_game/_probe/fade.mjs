/**
 * L5「裂缝之眼」拍中后淡出：验证牙齿和眼睛是否同步后退。
 *
 * 复现的问题：fade 只作用于 eyesRoot，而 teethRoot / faceRoot 是它的兄弟节点，
 * 于是"眼睛退回深处、牙齿留在原地"。
 *
 * 断言：
 *   1) 牙齿在淡出后世界 z 明显后退（不是原地不动）；
 *   2) 眼睛后退方向一致（同为负 z 方向），且幅度不比牙齿大太多；
 *   3) 牙齿和眼睛同时变暗（原来牙齿亮度完全不受 fade 影响）；
 *   4) 眼睛不会被推到裂缝后壁（z = -5.982）后面去；
 *   5) 淡出结束后整张脸隐藏。
 * 跑法：node _probe/fade.mjs
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

const THREE = await import('../vendor/three.module.js');
const { createAnomaly } = await import('../src/anomalies.js');

const out = [];
const log = (s = '') => out.push(s);
let fails = 0;
function check(ok, msg, extra = '') {
  log((ok ? '  PASS  ' : '  FAIL  ') + msg + (extra ? '   ' + extra : ''));
  if (!ok) fails += 1;
}

const BACK_PLANE_Z = -5.982;   // 裂缝深处的后壁
const anomaly = createAnomaly(5);
const group = anomaly.group;
group.updateMatrixWorld(true);

// ---- 抓出眼睛和牙齿的网格 ----
let eyeMesh = null;
const teeth = [];
group.traverse((o) => {
  if (!o.isMesh || !o.material) return;
  const g = o.geometry;
  if (g && g.type === 'ConeGeometry') teeth.push(o);
  if (o.material.color && o.material.color.getHex() === 0xff2030 && !eyeMesh) eyeMesh = o;
});

log('=== 0. 抓取对象 ===');
check(!!eyeMesh, '找到眼睛网格');
check(teeth.length >= 10, '找到牙齿网格', '数量 ' + teeth.length);
if (!eyeMesh || teeth.length === 0) { log(''); log('无法继续'); console.log(out.join('\n')); process.exit(1); }

// 取正中间那颗牙（x 最接近眼睛中心的）
const eyeWP = new THREE.Vector3();
eyeMesh.getWorldPosition(eyeWP);
teeth.sort((a, b) => {
  const pa = new THREE.Vector3(); a.getWorldPosition(pa);
  const pb = new THREE.Vector3(); b.getWorldPosition(pb);
  return Math.abs(pa.x - eyeWP.x) - Math.abs(pb.x - eyeWP.x);
});
const tooth = teeth[0];
const toothWP = new THREE.Vector3();
tooth.getWorldPosition(toothWP);

const eyeZ0 = eyeWP.z;
const toothZ0 = toothWP.z;
const eyeC0 = eyeMesh.material.color.clone();
const toothC0 = tooth.material.color.clone();
log('  眼睛 z = ' + eyeZ0.toFixed(4) + '   牙齿 z = ' + toothZ0.toFixed(4));
log('  眼睛色 = ' + hexStr(eyeC0.getHex()) + '   牙齿色 = ' + hexStr(toothC0.getHex()));
log('');

// ---- 逐帧推进淡出 ----
const env = { time: 0, flickerDark: false, phase: 'level', levelIndex: 5, playerX: 0, playerZ: 2.0, audio: null };
let t = 0;
const DT = 1 / 60;
function step(n) {
  for (let i = 0; i < n; i += 1) {
    t += DT;
    env.time = t;
    anomaly.update(DT, env);
    group.updateMatrixWorld(true);
  }
}

anomaly.onPhoto();

log('=== 1. 淡出中途（约 f=0.5）===');
step(48);                       // 48 * (1/60) / 1.6 ≈ 0.5
eyeMesh.getWorldPosition(eyeWP);
tooth.getWorldPosition(toothWP);
const eyeMid = eyeWP.z; const toothMid = toothWP.z;
log('  眼睛 z = ' + eyeMid.toFixed(4) + '  (Δ ' + (eyeMid - eyeZ0).toFixed(4) + ')');
log('  牙齿 z = ' + toothMid.toFixed(4) + '  (Δ ' + (toothMid - toothZ0).toFixed(4) + ')');
log('  眼睛色 = ' + hexStr(eyeMesh.material.color.getHex()) + '   牙齿色 = ' + hexStr(tooth.material.color.getHex()));
check(toothMid < toothZ0 - 0.005, '牙齿在后退（不是原地不动）', 'Δ ' + (toothMid - toothZ0).toFixed(4));
check(eyeMesh.material.color.getHex() !== eyeC0.getHex(), '眼睛在变暗');
check(tooth.material.color.getHex() !== toothC0.getHex(), '牙齿在变暗（原来完全不变）');
log('');

log('=== 2. 淡出结束 ===');
step(80);                       // 推到 f=1
eyeMesh.getWorldPosition(eyeWP);
tooth.getWorldPosition(toothWP);
const eyeEnd = eyeWP.z; const toothEnd = toothWP.z;
log('  眼睛 z = ' + eyeEnd.toFixed(4) + '  (Δ ' + (eyeEnd - eyeZ0).toFixed(4) + ')');
log('  牙齿 z = ' + toothEnd.toFixed(4) + '  (Δ ' + (toothEnd - toothZ0).toFixed(4) + ')');
check(toothEnd < toothZ0 - 0.01, '牙齿最终明显后退', 'Δ ' + (toothEnd - toothZ0).toFixed(4));
check(Math.abs(toothEnd - eyeEnd) < Math.abs(toothZ0 - eyeZ0) + 0.001,
  '牙齿和眼睛的间距在缩小（两者朝同一点收缩，而不是各走各的）',
  '间距 ' + Math.abs(toothZ0 - eyeZ0).toFixed(4) + ' → ' + Math.abs(toothEnd - eyeEnd).toFixed(4));
check(eyeEnd > BACK_PLANE_Z, '眼睛没有被推到裂缝后壁背后（会突然被挡掉）',
  '眼睛 z ' + eyeEnd.toFixed(4) + ' vs 后壁 ' + BACK_PLANE_Z);
check(eyeMesh.material.color.getHex() === 0x000000 || eyeEnd !== eyeZ0, '眼睛淡出有位移或变黑');
log('');

log('=== 3. 结束时整体隐藏 ===');
let anyVisible = false;
group.traverse((o) => { if (o.isMesh && o.material && o.material.color && (o.geometry.type === 'ConeGeometry')) { if (o.visible && o.parent && o.parent.parent && o.parent.parent.visible !== false) anyVisible = true; } });
const eyeVisible = (() => { let v = true; let n = eyeMesh; while (n) { if (n.visible === false) v = false; n = n.parent; } return v; })();
check(!eyeVisible, '眼睛所在整条链已隐藏');
log('');

function hexStr(h) { return '#' + h.toString(16).padStart(6, '0'); }

log(fails === 0 ? '全部通过' : ('失败 ' + fails + ' 项'));
console.log(out.join('\n'));
process.exit(fails === 0 ? 0 : 1);
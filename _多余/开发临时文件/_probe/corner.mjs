/**
 * 诊断：L 形直角转角（前墙与天花板交界）附近到底有哪些网格。
 * 跑法：node _probe/corner.mjs
 */
import fs from 'node:fs';

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

const anomaly = createAnomaly(5);
const group = anomaly.group;
group.updateMatrixWorld(true);

// 转角检测盒：正好包住 L 形直角那一段
const BOX = new THREE.Box3(
  new THREE.Vector3(-2.2, 2.86, -6.0),
  new THREE.Vector3(2.2, 3.20, -5.30),
);

const hits = [];
group.traverse((o) => {
  if (!o.isMesh && !o.isLine && !o.isPoints) return;
  const geo = o.geometry;
  if (!geo || !geo.attributes || !geo.attributes.position) return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
  if (!bb.intersectsBox(BOX)) return;
  const mat = o.material;
  const col = mat && mat.color ? mat.color.getHex().toString(16).padStart(6, '0') : '-';
  hits.push({
    kind: o.isPoints ? 'Points' : (o.isLine ? 'Line' : 'Mesh'),
    type: geo.type,
    col,
    op: mat && typeof mat.opacity === 'number' ? mat.opacity : 1,
    tr: !!(mat && mat.transparent),
    y: [bb.min.y.toFixed(2), bb.max.y.toFixed(2)],
    z: [bb.min.z.toFixed(2), bb.max.z.toFixed(2)],
    x: [bb.min.x.toFixed(2), bb.max.x.toFixed(2)],
    n: o.name || '',
  });
});

const byKind = new Map();
for (const h of hits) {
  const key = h.kind + '|' + h.type + '|#' + h.col;
  const rec = byKind.get(key) || { ...h, count: 0 };
  rec.count += 1;
  byKind.set(key, rec);
}

const out = [];
out.push('检测盒 x[-2.2,2.2] y[2.86,3.20] z[-6.00,-5.30]');
out.push('转角处的对象种类：' + byKind.size + ' 种，实例 ' + hits.length + ' 个');
out.push('');
for (const r of [...byKind.values()].sort((a, b) => b.count - a.count)) {
  out.push([
    String(r.kind + '/' + r.type).padEnd(28),
    '#' + r.col,
    'op=' + String(r.op).slice(0, 4).padEnd(5),
    r.tr ? 'transparent' : 'opaque     ',
    'x[' + r.x.join(',') + ']',
    'y[' + r.y.join(',') + ']',
    'z[' + r.z.join(',') + ']',
    'x' + r.count,
  ].join('  '));
}
out.push('');
// 半透明物件是"穿出来"的嫌疑：它们在某条带前面就会盖住裂口
const semi = [...byKind.values()].filter((r) => r.tr);
out.push('半透明（可能在裂口之上留下红线）：' + semi.length + ' 种');
for (const r of semi) {
  out.push('  ' + r.kind + '/' + r.type + ' #' + r.col + ' op=' + r.op + ' x' + r.count);
}

fs.writeFileSync('E:\\新建游戏项目\\_corner.txt', out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));

/**
 * 检查"门那块墙"的四块平面：
 *  1) 有没有共面重叠（重叠 → 逐像素打架 → 贴图闪变）；
 *  2) 每块贴图密度是否一致（不一致 → 被拉糊、看不出流动）。
 * 跑法：node _probe/doorwall.mjs
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
const { LAYOUT } = await import('../src/layout.js');

const anomaly = createAnomaly(5);
const group = anomaly.group;
group.updateMatrixWorld(true);

const zBack = LAYOUT.room.maxZ - 0.01;

// 收集后墙上带贴图的平面
const pieces = [];
group.traverse((o) => {
  if (!o.isMesh || !o.material || !o.material.map) return;
  const geo = o.geometry;
  if (geo.type !== 'PlaneGeometry') return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
  if (Math.abs(bb.min.z - zBack) > 0.05 || Math.abs(bb.max.z - zBack) > 0.05) return;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  pieces.push({
    w, h,
    x: [bb.min.x, bb.max.x],
    y: [bb.min.y, bb.max.y],
    z: bb.min.z,
    rep: [o.material.map.repeat.x, o.material.map.repeat.y],
    texId: o.material.map.id,
    matId: o.material.id,
  });
});

const out = [];
out.push('后墙血肉分片共 ' + pieces.length + ' 块：');
out.push('');
out.push('  宽×高           x 区间            y 区间        repeat       密度(横/纵)');
for (const p of pieces) {
  out.push([
    String(p.w.toFixed(2) + '×' + p.h.toFixed(2)).padEnd(14),
    ('[' + p.x[0].toFixed(2) + ',' + p.x[1].toFixed(2) + ']').padEnd(18),
    ('[' + p.y[0].toFixed(2) + ',' + p.y[1].toFixed(2) + ']').padEnd(14),
    ('(' + p.rep[0].toFixed(2) + ',' + p.rep[1].toFixed(2) + ')').padEnd(14),
    (p.rep[0] / p.w).toFixed(3) + ' / ' + (p.rep[1] / p.h).toFixed(3),
  ].join(''));
}
out.push('');

// 1) 共面重叠检查（只有 z 也几乎相同时才会逐像素打架）
let overlap = 0;
for (let i = 0; i < pieces.length; i += 1) {
  for (let j = i + 1; j < pieces.length; j += 1) {
    const a = pieces[i];
    const b = pieces[j];
    if (Math.abs(a.z - b.z) > 0.003) continue;   // 已经沿法线错开，不会打架
    const ox = Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]);
    const oy = Math.min(a.y[1], b.y[1]) - Math.max(a.y[0], b.y[0]);
    if (ox > 0.001 && oy > 0.001) {
      overlap += 1;
      out.push('  ! 共面重叠: ' + a.w.toFixed(2) + '×' + a.h.toFixed(2)
        + ' 与 ' + b.w.toFixed(2) + '×' + b.h.toFixed(2)
        + '  重叠 ' + ox.toFixed(3) + 'm × ' + oy.toFixed(3) + 'm'
        + '  (z ' + a.z.toFixed(3) + ' / ' + b.z.toFixed(3) + ')');
    }
  }
}
out.push('共面重叠对: ' + overlap + (overlap === 0 ? '   PASS（不会闪变）' : '   <-- FAIL'));
out.push('');

// 2) 密度一致性
const dx = 0.3;            // 目标：横 0.3 次/米
const dy = 1.40625;        // 目标：纵 1.40625 次/米（= 前墙 6/20 / 4.5/3.2）
let badDensity = 0;
for (const p of pieces) {
  const rx = p.rep[0] / p.w;
  const ry = p.rep[1] / p.h;
  const ok = Math.abs(rx - dx) < 0.005 && Math.abs(ry - dy) < 0.02;
  if (!ok) badDensity += 1;
  out.push('  ' + (ok ? 'OK  ' : 'BAD ') + p.w.toFixed(2) + '×' + p.h.toFixed(2)
    + '  横 ' + rx.toFixed(3) + ' / 纵 ' + ry.toFixed(3));
}
out.push('密度不一致的块: ' + badDensity + (badDensity === 0 ? '   PASS（接缝纹理连续、流速一致）' : '   <-- FAIL'));
out.push('');

// 3) 每块是不是独立纹理（共用一份 → 尺寸不同的块必然密度不一致）
const texIds = new Set(pieces.map((p) => p.texId));
out.push('独立纹理数: ' + texIds.size + ' / 分片数 ' + pieces.length
  + (texIds.size === pieces.length ? '   PASS' : '   （有共用，注意一致性）'));

console.log(out.join('\n'));

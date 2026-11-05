/**
 * 诊断：对准裂缝拍照时，射线到底先撞到什么。
 * 复刻 level.js aim() 的语义：按距离排序，跳过 noRay，**第一个通过的命中就定结论**。
 * 跑法：node _probe/aim.mjs
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
    Object.defineProperty(c, k, { get: () => v, set: (nv) => { v = nv; }, enumerable: true });
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

function flagged(object) {
  let cur = object;
  while (cur) {
    if (cur.userData && cur.userData.noRay) return true;
    cur = cur.parent;
  }
  return false;
}
function findTag(object) {
  let cur = object;
  while (cur) {
    if (cur.userData && (cur.userData.anomalyLevel || cur.userData.fakeAnomaly)) return cur.userData;
    cur = cur.parent;
  }
  return null;
}

const ray = new THREE.Raycaster();
ray.far = 8.5;

function aimAt(from, toward) {
  ray.set(from, new THREE.Vector3(toward[0], toward[1], toward[2]).sub(from).normalize());
  const hits = ray.intersectObject(group, true);
  const log = [];
  for (const h of hits) {
    const noRay = flagged(h.object);
    const tag = findTag(h.object);
    log.push({
      d: h.distance,
      type: h.object.type,
      geo: h.object.geometry?.type ?? '-',
      name: h.object.name || '-',
      noRay,
      tag: tag ? tag.anomalyLevel : 0,
      color: h.object.material?.color ? '#' + h.object.material.color.getHex().toString(16).padStart(6, '0') : '-',
    });
    if (noRay) continue;
    // 第一个非 noRay 的命中就定结论（和 level.js 一致）
    if (tag && tag.anomalyLevel) return { kind: 'anomaly', id: tag.anomalyId, log };
    if (tag && tag.fakeAnomaly) return { kind: 'fake', log };
    return { kind: 'none', log };
  }
  return { kind: 'empty', log };
}

const from = new THREE.Vector3(0, 1.62, 2.0);
const cases = [
  ['瞄眼睛', [0, 2.42, -5.95], 'anomaly'],
  ['瞄裂缝中心(暗区)', [-0.11, 2.42, -5.95], 'anomaly'],
  ['瞄裂缝上部', [0, 2.75, -5.95], 'anomaly'],
  ['瞄裂缝下部 y=1.85', [0, 1.85, -5.95], null],
  ['瞄墙面 x=2.5', [2.5, 2.4, -5.99], 'none'],
  ['瞄地板', [0, 0.1, -4.0], 'none'],
];

let fails = 0;
for (const [name, target, expect] of cases) {
  const r = aimAt(from, target);
  const ok = expect === null ? true : r.kind === expect;
  if (!ok) fails += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  ->  kind=' + r.kind
    + (r.id ? ' id=' + r.id : '') + (expect === null ? '（不判定）' : '（期望 ' + expect + '）'));
  if (!ok) {
    r.log.slice(0, 4).forEach((h, i) => {
      console.log('      #' + i + ' d=' + h.d.toFixed(2) + '  ' + h.type + '/' + h.geo
        + '  noRay=' + h.noRay + '  tag=' + h.tag + '  ' + h.color);
    });
  }
}
console.log('');
console.log(fails === 0 ? '全部通过' : ('有 ' + fails + ' 项未通过'));

// 顺带统计：整关有多少装饰物没标 noRay（Points/Line 会以 1 米阈值抢命中）
let bad = 0;
group.traverse((o) => {
  if ((o.isPoints || o.isLine) && !flagged(o)) bad += 1;
});
console.log('未标 noRay 的 Points/Line 数量: ' + bad + (bad === 0 ? '   PASS' : '   <-- 会挡住拍照'));

/**
 * 用射线把嘴部拍成一张 ASCII 正面图 —— 没有显卡、看不了 PNG 时用它判断「笑弧」的形状。
 *
 *   # 牙    .  黑口腔（嘴补片）    ·  皮肤    ' '  背景
 *
 * 打法：从 z=0.9 沿 −z 平行投射（正交前视图），逐格记录第一个实体命中。
 * 判据写在最后：嘴角那一列的牙应当比嘴心那一列更高；牙的整体轮廓应当是一弯上翘的月牙。
 * 用法：node _probe/grinlook.mjs [--closed]
 */
globalThis.document = {
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => ({
      createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData() {}, fillRect() {}, clearRect() {}, drawImage() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
      measureText() { return { width: 10 }; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
    });
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
  body: { dataset: {} },
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.fetch = () => Promise.reject(new Error('probe: 离线'));
process.on('unhandledRejection', () => {});

const THREE = await import('../vendor/three.module.js');
const { createSafehouse } = await import('../src/safehouse.js');

const closed = process.argv.includes('--closed');

const scene = new THREE.Scene();
const sh = createSafehouse(scene);
const info = sh.mateModelInfo();
sh.placeMate(0, 0, 0);
sh.setMateVisible(true);
sh.setReveal(1, closed ? 0 : 1);
sh.group.updateMatrixWorld(true);
const mate = sh.group.children.find((c) => c.name === 'Classmate');

const solid = [];
mate.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (m && m.blending === THREE.AdditiveBlending) return; // 光晕不参与遮挡
  let kind = 'skin';
  if (m && m.type === 'MeshBasicMaterial' && m.vertexColors === true) kind = 'tooth';
  else if (m && m.color && m.color.getHex() === 0x050308) kind = 'mouth';
  else if (m && m.color && m.color.getHex() === 0xff2030) kind = 'eye';
  solid.push({ mesh: o, kind });
});
const targets = solid.map((e) => e.mesh);
const ray = new THREE.Raycaster();
const probe = (x, y) => {
  ray.set(new THREE.Vector3(x, y, 0.9), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(targets, false);
  for (const hit of hits) {
    const e = solid.find((s) => s.mesh === hit.object);
    if (e) return e.kind;
  }
  return 'none';
};

const mouthY = info.headY - 0.052;
// 先把几块东西的世界包围盒打出来：嘴补片在哪、牙在哪、眼睛在哪。
// 这样 ASCII 的取景窗不用猜，直接量。
const boxes = {};
for (const e of solid) {
  const box = new THREE.Box3().setFromObject(e.mesh);
  const b = boxes[e.kind] || (boxes[e.kind] = new THREE.Box3());
  b.union(box);
}
for (const k of ['mouth', 'tooth', 'eye', 'skin']) {
  const b = boxes[k];
  if (!b) continue;
  console.log(`${k.padEnd(5)} x∈[${b.min.x.toFixed(4)}, ${b.max.x.toFixed(4)}]  y∈[${b.min.y.toFixed(4)}, ${b.max.y.toFixed(4)}]  z∈[${b.min.z.toFixed(4)}, ${b.max.z.toFixed(4)}]`);
}
console.log(`预期 mouthY=${mouthY.toFixed(4)}  headY=${info.headY.toFixed(4)}`);
console.log('');
const mouthBox = boxes.mouth || new THREE.Box3().setFromObject(mate);
const X0 = mouthBox.min.x - 0.004;
const X1 = mouthBox.max.x + 0.004;
const Y0 = Math.max(mouthBox.max.y + 0.004, boxes.eye ? boxes.eye.max.y + 0.002 : -Infinity);
const Y1 = mouthBox.min.y - 0.004;
const COLS = 57;
// 每格尽量做成正方形：行数按高度比反推
const ROWS = Math.max(12, Math.round((COLS * (Y0 - Y1)) / (X1 - X0)));
const glyph = { tooth: '#', mouth: '.', skin: '·', eye: 'o', none: ' ' };

const topOfCol = new Array(COLS).fill(Infinity);
const rowsOut = [];
for (let r = 0; r < ROWS; r += 1) {
  const y = Y0 + (Y1 - Y0) * (r / (ROWS - 1));
  let line = '';
  for (let c = 0; c < COLS; c += 1) {
    const x = X0 + (X1 - X0) * (c / (COLS - 1));
    const k = probe(x, y);
    if (k === 'tooth' && topOfCol[c] === Infinity) topOfCol[c] = r;
    line += glyph[k] || '?';
  }
  rowsOut.push(line);
}

console.log(`嘴的正面 ASCII 图（${closed ? '闭着' : '咧开'}）  列 x∈[${X0}, ${X1}]  行 y∈[${Y1.toFixed(3)}, ${Y0.toFixed(3)}]`);
console.log('');
for (const line of rowsOut) console.log(`  ${line}`);

// ── 判据：牙的最高点沿 x 应当是一弯上翘的弧 ──
const colX = (c) => X0 + (X1 - X0) * (c / (COLS - 1));
const centreCols = topOfCol.map((r, c) => (Math.abs(colX(c)) < 0.012 ? r : NaN)).filter((v) => v === v);
const cornerCols = topOfCol.map((r, c) => (Math.abs(colX(c)) > 0.085 ? r : NaN)).filter((v) => v === v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
if (centreCols.length && cornerCols.length) {
  const dc = mean(centreCols);
  const dk = mean(cornerCols);
  console.log('');
  console.log(`牙的最高点（行号，越小越高）：嘴心 ${dc.toFixed(2)}，嘴角 ${dk.toFixed(2)}，嘴角高 ${(dc - dk).toFixed(2)} 行`);
  console.log(`  → ${dc - dk >= 1 ? '笑弧向上弯 ✅' : '嘴角没有明显抬高 ❌'}`);
}
const toothCols = topOfCol.filter((v) => v !== Infinity).length;
console.log(`  有牙的列 ${toothCols}/${COLS}；牙的横向跨度 ${(toothCols * (X1 - X0) / (COLS - 1) * 1000).toFixed(0)} mm`);
sh.reset();
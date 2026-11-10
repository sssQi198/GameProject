/**
 * 五官的「看得见」校验：用射线代替眼睛。
 *
 * mateapi.mjs 查的是数据集（几颗牙、多大、有没有动），查不出
 * 「牙是不是被头挡住了」「眼睛是不是沉进眶里了」这类问题。
 * 这里在脸正前方摆一排射线，看第一个被打到的到底是谁：
 *   - 打向眼球的射线，第一个命中必须是那颗 #ff2030 的自发光球；
 *   - 打向每颗牙的射线，第一个命中必须是牙（不是皮，不是黑嘴）；
 *   - 嘴这一片按网格扫一遍，牙要占掉一大半（太少 ⇒ 牙缩在嘴里看不见）；
 *   - 光晕（加性混合、半透明）不参与判定，它本来就压在眼睛前面。
 *
 * 不需要浏览器：只要 three.js 的几何 + Raycaster。
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

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const fmt = (n, d = 4) => Number(n).toFixed(d);

const scene = new THREE.Scene();
const sh = createSafehouse(scene);
const info = sh.mateModelInfo();
sh.placeMate(0, 0, 0); // 原点站定，正面朝 +Z（镜头就在 +Z 一侧）
sh.setMateVisible(true);
sh.setReveal(1, 1);
sh.group.updateMatrixWorld(true);

const mate = sh.group.children.find((c) => c.name === 'Classmate');
const headY = info.headY;
const headR = info.headR;

const EYE_RED = 0xff2030;
const meshes = [];
mate.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  let kind = 'other';
  if (m && m.color && m.color.getHex() === EYE_RED && m.blending !== THREE.AdditiveBlending) kind = 'eye';
  if (m && m.type === 'MeshBasicMaterial' && m.vertexColors === true) kind = 'fang';
  // 光晕是加性混合的球，永远压在眼睛前面，判定时整层跳过
  if (m && m.blending === THREE.AdditiveBlending) kind = 'halo';
  meshes.push({ mesh: o, kind });
});
const solid = meshes.filter((e) => e.kind !== 'halo');
ok(solid.filter((e) => e.kind === 'eye').length === 2, '两只眼睛都参与判定',
  `${solid.filter((e) => e.kind === 'eye').length} 只`);
ok(solid.filter((e) => e.kind === 'fang').length === 17, '17 颗牙都参与判定',
  `${solid.filter((e) => e.kind === 'fang').length} 颗`);

const targets = solid.map((e) => e.mesh);
const ray = new THREE.Raycaster();
/** 从脸正前方沿 −Z 打一条射线，返回第一个非加性命中的类型与物体。 */
function probe(x, y) {
  ray.set(new THREE.Vector3(x, y, 0.9), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(targets, false);
  for (const hit of hits) {
    const entry = solid.find((e) => e.mesh === hit.object);
    if (entry && entry.kind !== 'halo') return { kind: entry.kind, hit, object: hit.object };
  }
  return { kind: 'miss', hit: null, object: null };
}

// ── 1. 眼睛：从正前方打过去，先碰到的一定是那颗红球（不是眶缘、不是头皮）──
const eyes = solid.filter((e) => e.kind === 'eye').map((e) => e.mesh);
for (const eye of eyes) {
  const p = eye.getWorldPosition(new THREE.Vector3());
  const r = probe(p.x, p.y);
  ok(r.kind === 'eye' && r.object === eye, '眼球朝向 +Z 的那一面是露在外面的（射线直接打到它）',
    `x=${fmt(p.x)} 命中 ${r.kind}`);
  if (r.hit) {
    // 命中点比球心还靠前，说明是球的外凸面被看到，不是从球心后面穿过去
    ok(r.hit.point.z > p.z - 1e-6, '打到的是眼球外侧（不是从球心背面穿过去）',
      `z ${fmt(r.hit.point.z)} > ${fmt(p.z)}`);
  }
}

// ── 2. 每颗牙：正对着它打，第一个命中必须是牙 ──
const fangs = solid.filter((e) => e.kind === 'fang').map((e) => e.mesh);
let fangHidden = 0;
const hiddenList = [];
for (const fang of fangs) {
  const p = fang.getWorldPosition(new THREE.Vector3());
  const { height: len, radiusTop, radiusBottom } = fang.geometry.parameters;
  // 牙尖在「远离牙根」的那一头：上排牙根朝上 ⇒ 牙尖在 −y
  const tipDir = radiusTop > radiusBottom ? -1 : 1;
  // 第二十一轮嘴变成笑弧后，牙的 z 是按牙心所在高度贴到弧面上的，而牙轴是竖直的：
  // 牙尖越靠近嘴心那一列，弧面就比牙心处更靠前一点点。探到 0.42·len 时锥体已经收细到
  // 半径 3 mm，和弧面只差 0.1 mm，射线会先摸到黑嘴补片——那不是被吃掉，是刀锋上的巧合。
  // 所以探针落在牙身还够粗的位置（0.30·len），测的是「这颗牙露不露得出来」。
  const r = probe(p.x, p.y + tipDir * len * 0.3);
  if (r.kind !== 'fang' || r.object !== fang) {
    fangHidden += 1;
    hiddenList.push(`${fmt(p.x)}:${r.kind}`);
  }
}
ok(fangHidden === 0, '17 颗牙每一颗都能从正前方直接看到牙尖（没有一颗被头皮吃掉）',
  fangHidden ? hiddenList.join(' ') : '17/17 可见');

// ── 3. 嘴这一片扫一遍：牙得占掉一大半，剩下的是齿缝里的黑 ──
const mouthY = headY - 0.052; // MOUTH_DY
let tooth = 0;
let black = 0;
let skin = 0;
for (let ix = -6; ix <= 6; ix += 1) {
  for (let iy = -2; iy <= 2; iy += 1) {
    const r = probe(ix * 0.015, mouthY + iy * 0.017);
    if (r.kind === 'fang') tooth += 1;
    else if (r.kind === 'other') black += 1;
    else skin += 1;
  }
}
const total = 13 * 5;
ok(tooth / total > 0.35, '嘴这一片有超过 1/3 的射线直接打在牙上（牙没缩在嘴里）',
  `牙 ${tooth}/${total} = ${fmt(tooth / total, 2)}，黑嘴 ${black}，皮 ${skin}`);
ok(skin <= 2, '嘴的高度以外基本不再漏出头皮（嘴确实裂到那么大）', `漏皮 ${skin} 条`);
ok(black > 0, '齿缝里能看到黑色的口腔（不是一块白板）', `${black} 条打在黑嘴`);

// ── 4. 上排牙的「根部」被唇线挡住：往上打 3 mm 就打到头皮，不再有牙 ──
const topFang = fangs.find((f) => f.geometry.parameters.radiusTop > f.geometry.parameters.radiusBottom
  && Math.abs(f.getWorldPosition(new THREE.Vector3()).x) < 0.005);
if (topFang) {
  const p = topFang.getWorldPosition(new THREE.Vector3());
  const above = probe(p.x, mouthY + 0.045);
  ok(above.kind === 'other' || above.kind === 'miss',
    '上排牙根被唇线挡在后面（唇线以上打不到牙）', `命中 ${above.kind}`);
}

// ── 5. 闭着嘴的时候，这一排牙不该被画出来 ──
// 注意：Raycaster 不看 visible，所以这里查渲染状态（祖先链上有没有被藏起来）
// 加上材质完全透明 —— 两条都成立才真的看不见。
sh.setReveal(0, 0);
sh.group.updateMatrixWorld(true);
const drawn = (obj) => {
  for (let o = obj; o; o = o.parent) if (o.visible === false) return false;
  return true;
};
const visibleWhenClosed = fangs.filter((f) => drawn(f) && f.material.opacity > 0.01).length;
ok(visibleWhenClosed === 0, '嘴合上时这些牙一颗都不画（不是常驻的一排白牙）',
  `${visibleWhenClosed} 颗漏出来`);

// 半开（m = 0.4，嘴已经裂了一点、牙还没淡入）：牙必须仍然看不见
sh.setReveal(1, 0.4);
sh.group.updateMatrixWorld(true);
const early = fangs.filter((f) => drawn(f) && f.material.opacity > 0.01).length;
ok(early === 0, '嘴裂到 40% 时牙还没露出来（那样会浮在嘴唇上）', `${early} 颗提前露`);
// 咧到 70% 应该正在淡入：既不是 0（太晚），也不是 1（太早、贴着唇线穿帮）
sh.setReveal(1, 0.7);
sh.group.updateMatrixWorld(true);
const mid = fangs[0].material.opacity;
ok(mid > 0.05 && mid < 0.95, '咧到 70% 时牙正在淡入（不是一下子全出来）', fmt(mid, 2));

sh.reset();
console.log('');
if (fail > 0) {
  console.log(`${fail} 项失败`);
  process.exit(1);
}
console.log('全部通过');
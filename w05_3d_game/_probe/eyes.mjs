/**
 * 第 5 关「裂缝之眼」结构与判定验证（不需要 WebGL）。
 *  1) 后墙血肉是否真的给 6 扇窗 + 门留了洞、13 块分片是否无缝无叠；
 *  2) 裂缝竖直臂中心是否真的是凹进去的（不是被条带糊住）；
 *  3) 两只眼睛的位置/尺寸/朝向是否合规；
 *  4) 拍照判定是否已收窄到眼睛命中球；
 *  5) 拍后淡出是否能收敛。
 * 跑法：node _probe/eyes.mjs
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
  body: { dataset: {} },
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => makeCtx();
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
globalThis.window = globalThis;

// 这个 probe 量的是**程序化**那版裂缝/牙，不加载四个 glb：
// 让 /assets/... 一律 404，anomalies.js 的 catch 会保留程序化几何。
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
  if (url.startsWith('http://local/assets/')) return new Response('not found', { status: 404 });
  return RealFetch(input, init);
};

const THREE = await import('../vendor/three.module.js');
const { createAnomaly } = await import('../src/anomalies.js');
const { LAYOUT } = await import('../src/layout.js');

const room = LAYOUT.room;
const anomaly = createAnomaly(5);
const group = anomaly.group;
group.updateMatrixWorld(true);

const out = [];
const log = (s = '') => out.push(s);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails += 1; log((ok ? 'PASS  ' : 'FAIL  ') + msg); return ok; };
const hexOf = (m) => (m && m.color ? m.color.getHex() : -1);
const hexStr = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0');

// ================= 1. 后墙分片 =================
const zBack = room.maxZ - 0.01;
const panels = [];
group.traverse((o) => {
  if (!o.isMesh || !o.material || !o.material.map) return;
  if (o.geometry.type !== 'PlaneGeometry') return;
  o.geometry.computeBoundingBox();
  const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  if (Math.abs(bb.min.z - zBack) > 0.01 || Math.abs(bb.max.z - zBack) > 0.01) return;
  panels.push({ x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y });
});

const WIN = { count: 3, w: 1.9, sill: 0.95, top: 2.28, jamb: 0.12 };
const doorHalf = LAYOUT.door.half;
const outer = doorHalf + WIN.jamb;
const winGaps = [];
for (const [x0, x1] of [[room.minX, -outer], [outer, room.maxX]]) {
  const pier = ((x1 - x0) - WIN.count * WIN.w) / (WIN.count + 1);
  for (let i = 0; i < WIN.count; i += 1) {
    const xa = x0 + (i + 1) * pier + i * WIN.w;
    winGaps.push([xa, xa + WIN.w]);
  }
}

log('=== 1. 后墙血肉分片 ===');
log('分片数: ' + panels.length + '（期望 13）');
check(panels.length === 13, '分片数 == 13');

let overlaps = 0;
for (let i = 0; i < panels.length; i += 1) {
  for (let j = i + 1; j < panels.length; j += 1) {
    const a = panels[i]; const b = panels[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 1e-4 && oy > 1e-4) overlaps += 1;
  }
}
check(overlaps === 0, '分片之间无重叠（重叠对 = ' + overlaps + '）');

const bands = [
  [0, WIN.sill, [[-doorHalf, doorHalf]]],
  [WIN.sill, WIN.top, [[-doorHalf, doorHalf]].concat(winGaps)],
  [WIN.top, LAYOUT.door.height, [[-doorHalf, doorHalf]]],
  [LAYOUT.door.height, room.height, []],
];
let bandOk = true;
for (const [ya, yb, gaps] of bands) {
  const inBand = panels.filter((p) => Math.abs(p.y0 - ya) < 1e-3 && Math.abs(p.y1 - yb) < 1e-3);
  const covered = inBand.reduce((s, p) => s + (p.x1 - p.x0), 0);
  const gapW = gaps.reduce((s, g) => s + (g[1] - g[0]), 0);
  const expect = (room.maxX - room.minX) - gapW;
  const ok = Math.abs(covered - expect) < 1e-3;
  if (!ok) bandOk = false;
  log('  带 y[' + ya.toFixed(2) + ',' + yb.toFixed(2) + ']  ' + inBand.length
    + ' 块  覆盖 ' + covered.toFixed(3) + 'm  期望 ' + expect.toFixed(3) + 'm  ' + (ok ? 'OK' : '<-- 不符'));
}
check(bandOk, '每条横带的实心宽度都等于「总宽 - 缺口」');

let blocked = 0;
for (const [gx0, gx1] of winGaps) {
  const cx = (gx0 + gx1) / 2;
  const cy = (WIN.sill + WIN.top) / 2;
  for (const p of panels) {
    if (cx > p.x0 + 1e-4 && cx < p.x1 - 1e-4 && cy > p.y0 + 1e-4 && cy < p.y1 - 1e-4) blocked += 1;
  }
}
check(blocked === 0, '6 扇窗的中心点都没有被血肉盖住（被盖 = ' + blocked + '）');
let doorBlocked = 0;
for (const p of panels) {
  if (0 > p.x0 + 1e-4 && 0 < p.x1 - 1e-4 && 1.2 > p.y0 + 1e-4 && 1.2 < p.y1 - 1e-4) doorBlocked += 1;
}
check(doorBlocked === 0, '门洞中心没有被血肉盖住');
log('');

// ================= 2. 竖直臂中心是否真的凹进去 =================
log('=== 2. 裂缝开口 ===');
const ray = new THREE.Raycaster();
ray.far = 20;
const visibleHits = (o, dir) => {
  ray.set(o, dir);
  return ray.intersectObject(group, true).filter((h) => h.object.isMesh && h.object.visible !== false);
};
// 在 grin 之上、眼睛之下（y=2.20）往洞里打，确认中心是"凹进去"而不是被条带糊住
const down = visibleHits(new THREE.Vector3(0, 2.20, 0), new THREE.Vector3(0, 0, -1));
if (!down.length) {
  check(false, '竖直臂 y=2.20 处沿 -z 没有任何可见命中（异常）');
} else {
  const z = down[0].point.z;
  log('  第一个可见命中: z=' + z.toFixed(3) + '  颜色 ' + hexStr(hexOf(down[0].object.material)));
  check(z < -5.93, '中心是凹进去的（首个可见命中在 -5.930 之后，不在开口平面 -5.892 上）');
}
log('');

// ================= 3. 双眼 =================
log('=== 3. 双眼 ===');
const eyes = [];
group.traverse((o) => {
  if (!o.isMesh || !o.visible) return;
  if (hexOf(o.material) !== 0xff2030) return;
  const p = new THREE.Vector3();
  o.getWorldPosition(p);
  eyes.push({ p, r: o.geometry.parameters?.radius ?? -1, tm: o.material.toneMapped });
});
log('  眼球数量: ' + eyes.length);
check(eyes.length === 2, '两只眼球存在');
if (eyes.length === 2) {
  eyes.sort((a, b) => a.p.x - b.p.x);
  const L = eyes[0]; const R = eyes[1];
  log('  左眼 (' + L.p.x.toFixed(3) + ', ' + L.p.y.toFixed(2) + ', ' + L.p.z.toFixed(3) + ') r=' + L.r.toFixed(3));
  log('  右眼 (' + R.p.x.toFixed(3) + ', ' + R.p.y.toFixed(2) + ', ' + R.p.z.toFixed(3) + ') r=' + R.r.toFixed(3));
  check(Math.abs(L.p.y - 2.42) < 0.01 && Math.abs(R.p.y - 2.42) < 0.01, '两眼高度 y = 2.42（竖直段偏上）');
  const gap = R.p.x - L.p.x;
  const mid = (R.p.x + L.p.x) / 2;
  log('  眼距 ' + gap.toFixed(3) + 'm，中点 x = ' + mid.toFixed(3));
  check(Math.abs(gap - 0.38) < 0.01, '眼距 = 0.38（各 ±0.19）');

  // 量出眼睛高度处开口（洞壁）的真实左右边界，确认两只眼睛都没被洞壁切掉。
  // 从洞槽内部沿 +x 打一条射线，只认洞壁材质（基色 0x180608，顶点色做纵深衰减）。
  const slot = [];
  ray.set(new THREE.Vector3(-1.7, 2.42, -5.94), new THREE.Vector3(1, 0, 0));
  ray.far = 4;
  for (const h of ray.intersectObject(group, true)) {
    if (hexOf(h.object.material) === 0x180608) slot.push(h.point.x);
  }
  const slotL = slot.length ? Math.min(...slot) : NaN;
  const slotR = slot.length ? Math.max(...slot) : NaN;
  check(slot.length >= 2, '量到开口两侧洞壁');
  if (slot.length >= 2) {
    log('  开口 x ∈ [' + slotL.toFixed(3) + ', ' + slotR.toFixed(3) + ']，宽 ' + (slotR - slotL).toFixed(3) + 'm');
    log('  左眼外缘 ' + (L.p.x - L.r).toFixed(3) + '   右眼外缘 ' + (R.p.x + R.r).toFixed(3));
    check(L.p.x - L.r > slotL + 0.004, '左眼完整落在开口内（没被洞壁切）');
    check(R.p.x + R.r < slotR - 0.004, '右眼完整落在开口内（没被洞壁切）');
    check(Math.abs(mid - (slotL + slotR) / 2) < 0.03, '双眼中点与开口中心对齐');
  }
  const front = Math.max(L.p.z, R.p.z) + L.r;
  log('  眼球最靠前 z = ' + front.toFixed(3) + '（开口平面 -5.892 / 墙 -5.990）');
  check(front < -5.892, '眼球不凸出开口平面');
  check(front > -5.990, '眼球不穿进墙里');
  check(L.tm === false && R.tm === false, 'toneMapped = false（否则 ACES 会把红压成灰）');
}
log('');

// ================= 3b. 咧嘴笑（横在眼睛下方的牙）=================
log('=== 3b. 咧嘴笑 ===');
const teeth = [];
group.traverse((o) => {
  if (!o.isMesh || o.visible === false) return;
  if (o.geometry.type !== 'ConeGeometry') return;
  o.geometry.computeBoundingBox();
  const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  teeth.push(bb);
});
log('  牙数: ' + teeth.length + '（期望 17：上排 9 + 下排 8）');
check(teeth.length === 17, '牙数 == 17');
if (teeth.length) {
  // 每颗牙都必须有一段伸到三层环之前，否则会被环整个挡住。
  const hidden = teeth.filter((bb) => bb.max.z <= -5.892).length;
  log('  牙的 z 范围: [' + Math.min(...teeth.map((b) => b.min.z)).toFixed(3)
    + ', ' + Math.max(...teeth.map((b) => b.max.z)).toFixed(3) + ']');
  check(hidden === 0, '每颗牙都有部分露在环之前（被完全挡住的: ' + hidden + ' 颗）');

  // 核心要求：整排牙必须在眼睛下方 = 最靠上的牙也不能高过眼球下沿
  const eyeBottom = 2.42 - 0.087;
  const top = Math.max(...teeth.map((b) => b.max.y));
  log('  牙的最高点 y = ' + top.toFixed(3) + '，眼球下沿 y = ' + eyeBottom.toFixed(3));
  check(top < eyeBottom - 0.01, '所有牙都在眼睛下方（不会咬到眼睛）');

  // 咧嘴宽度：要接近开口宽度才叫"咧得很开"
  const span = Math.max(...teeth.map((b) => b.max.x)) - Math.min(...teeth.map((b) => b.min.x));
  const lower = Math.min(...teeth.map((b) => b.min.y));
  log('  咧嘴宽度 ' + span.toFixed(3) + 'm，最低点 y = ' + lower.toFixed(3));
  check(span > 0.75, '咧嘴够宽（> 0.75m）');

  // 咧嘴是抛物线：嘴角必须明显高于中央，否则就是一条平的横线，不像笑
  const cxT = -0.107;
  const midX = (b) => (b.min.x + b.max.x) / 2;
  const centerTeeth = teeth.filter((b) => Math.abs(midX(b) - cxT) < 0.14);
  const cornerTeeth = teeth.filter((b) => Math.abs(midX(b) - cxT) > 0.33);
  const cyTop = Math.max(...centerTeeth.map((b) => b.max.y));
  const kyTop = Math.max(...cornerTeeth.map((b) => b.max.y));
  log('  中央牙最高 y = ' + cyTop.toFixed(3) + '，嘴角牙最高 y = ' + kyTop.toFixed(3));
  check(kyTop > cyTop + 0.10, '嘴角明显高于中央（抛物线微笑，不是一条横线）');
}
log('');

// ================= 3c. 地板血肉 =================
log('=== 3c. 地板 ===');
// 教室自带地板在 y = 0.03（level.js:813 roomFloor），血肉地板必须压在它上面，
// 否则玩家看到的是木地板（这就是之前「地板不像血肉」的真正原因）。
const ROOM_FLOOR_Y = 0.03;
let floorMesh = null;
group.traverse((o) => {
  if (!o.isMesh || !o.material || !o.material.map) return;
  if (o.geometry.type !== 'PlaneGeometry') return;
  const p = o.geometry.parameters;
  const bb = (o.geometry.computeBoundingBox(), o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  if (Math.abs((bb.max.y - bb.min.y)) > 0.01) return;          // 只看水平的
  if (Math.abs((bb.max.x - bb.min.x) - (LAYOUT.room.maxX - LAYOUT.room.minX)) > 0.2) return;
  if (Math.abs((bb.max.z - bb.min.z) - (LAYOUT.room.maxZ - LAYOUT.room.minZ)) > 0.2) return;
  if (bb.min.y < 0.2) floorMesh = { bb, mat: o.material, p };
});
check(!!floorMesh, '找到地板网格');
if (floorMesh) {
  const fy = (floorMesh.bb.min.y + floorMesh.bb.max.y) / 2;
  log('  地板 y = ' + fy.toFixed(3) + '（教室自带地板 y = ' + ROOM_FLOOR_Y + '）');
  check(fy > ROOM_FLOOR_Y + 0.005, '血肉地板在木地板之上（不会被压住）');
  const c = floorMesh.mat.color;
  const cHex = c.getHex();
  const isWhite = Math.abs(c.r - 1) < 0.01 && Math.abs(c.g - 1) < 0.01 && Math.abs(c.b - 1) < 0.01;
  log('  地板 material.color = ' + hexStr(cHex) + (isWhite ? '（白 = 与墙面同一份血肉）' : '（有染色）'));
  check(isWhite, '地板没有染成近黑（0x1a080a 那种会让血肉看不见）');
  check(!!floorMesh.mat.map, '地板带血肉贴图');
}
log('');

// ================= 4. 拍照判定 =================
log('=== 4. 拍照判定 ===');
check(!group.userData?.anomalyLevel, 'group 本身不带 anomalyLevel（瞄墙面不该过关）');
let hitboxTagged = false;
group.traverse((o) => { if (o.userData?.anomalyLevel === 5) hitboxTagged = true; });
check(hitboxTagged, '有子节点带 anomalyLevel = 5（眼睛命中球）');

function aimTagAt(from, toward, far) {
  const dir = new THREE.Vector3(toward[0], toward[1], toward[2]).sub(from).normalize();
  ray.set(from, dir);
  ray.far = far;
  const hits = ray.intersectObject(group, true);
  for (const h of hits) {
    let cur = h.object;
    while (cur) {
      if (cur.userData?.anomalyLevel === 5) return { tag: cur.userData, z: h.point.z, obj: h.object };
      cur = cur.parent;
    }
  }
  return null;
}

const from = new THREE.Vector3(0, 1.62, 2.0);
const aimEye = aimTagAt(from, [0, 2.42, -5.952], 8.5);
check(!!aimEye, '从 (0,1.62,2.0)（距眼 8.0m）瞄眼睛 → 命中异常'
  + (aimEye ? '（' + aimEye.tag.anomalyId + '）' : ''));
const aimWall = aimTagAt(from, [2.5, 2.4, -5.99], 8.5);
check(!aimWall, '瞄墙面（x=2.5）→ 拍不到，必须对准眼睛');
// 太远也拍不到：photoRange = 8.5，站位 (0,4.2) 距眼 10.2m
const fromStand = new THREE.Vector3(0, 1.62, 4.2);
check(!aimTagAt(fromStand, [0, 2.42, -5.952], 8.5), '站在原始站位 (0,4.2)（距眼 10.2m）拍不到 → 必须走近');
log('');

// ================= 5. 拍后淡出 =================
log('=== 5. 拍后淡出 ===');
let eyeRoot = null;
group.traverse((o) => {
  if (o.isLight && hexOf(o) === 0xff2233) eyeRoot = o.parent;
});
check(!!eyeRoot, '找到眼睛组（含红色点光）');
if (eyeRoot) {
  anomaly.onPhoto();
  for (let i = 0; i < 40; i += 1) {
    anomaly.update(0.05, { time: i * 0.05, flickerDark: false });
  }
  // 淡出隐藏的是整张脸的父节点（眼睛 + 牙齿一起走），
  // 所以这里要沿父链判断"实际是否还画得出来"，不能只看 eyesRoot.visible
  let effVisible = true;
  for (let n = eyeRoot; n; n = n.parent) {
    if (n.visible === false) { effVisible = false; break; }
  }
  check(effVisible === false, '推进 2 秒后眼睛组已隐藏（淡出收敛）');
}
log('');
log(fails === 0 ? '全部通过' : ('有 ' + fails + ' 项未通过'));
console.log(out.join('\n'));
// 这个 probe 故意让四个 glb 走 404 回退；异步的 catch 日志不算失败，强制按断言退出。
process.exit(fails === 0 ? 0 : 1);

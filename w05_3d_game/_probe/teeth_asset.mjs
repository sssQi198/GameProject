/**
 * 咧嘴的牙模型（assets/models/teeth_v01.glb）的结构验证，不需要 WebGL。
 *
 * 对着 docs/model_prompts.md「第五关 · 咧嘴的牙」逐条量：
 *   1) 一整排牙单独浮着：单网格、17 个封闭岛，没有嘴唇/牙龈/脸/眼睛；
 *   2) 宽约 0.9 m；上排 9 颗牙尖朝下、下排 8 颗牙尖朝上，交错半个牙距；
 *   3) 嘴角比中间高约 0.20 m；
 *   4) 污褐色 #4a2a20，不是白牙；短、钝；
 *   5) 单网格 < 3000 三角，没有贴图 / Draco / 其他扩展；
 *   6) three.js 的 GLTFLoader 能真的解析出来，节点名和 extras 都对。
 *
 * 跑法：node _probe/teeth_asset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(HERE, '..', 'assets', 'models', 'teeth_v01.glb');

const out = [];
let fails = 0;
const log = (s = '') => out.push(s);
const check = (ok, msg) => {
  if (!ok) fails += 1;
  log((ok ? 'PASS  ' : 'FAIL  ') + msg);
  return ok;
};
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const round = (v, n = 4) => Number(v.toFixed(n));

// ---------------------------------------------------------------- GLB 拆包
const buf = fs.readFileSync(GLB);
const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
check(magic === 'glTF', 'GLB 头是 glTF：' + magic);
check(version === 2, 'glTF 版本 2，实际 ' + version);
check(length === buf.length, 'GLB 长度和文件大小一致：' + length + ' / ' + buf.length);

const chunks = [];
for (let off = 12; off < buf.length;) {
  const clen = buf.readUInt32LE(off);
  const ctype = buf.toString('ascii', off + 4, off + 8);
  chunks.push({ type: ctype, start: off + 8, len: clen });
  off += 8 + clen;
}
const jsonChunk = chunks.find((c) => c.type === 'JSON');
const binChunk = chunks.find((c) => c.type === 'BIN\0');
check(!!jsonChunk, '有 JSON chunk');
check(!!binChunk, '有 BIN chunk');
const doc = JSON.parse(buf.toString('utf8', jsonChunk.start, jsonChunk.start + jsonChunk.len));
const bin = buf.subarray(binChunk.start, binChunk.start + binChunk.len);

// ---------------------------------------------------------------- accessor
const COMP = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(index) {
  const a = doc.accessors[index];
  const bv = doc.bufferViews[a.bufferView];
  const [size, method] = COMP[a.componentType];
  const n = NUM[a.type];
  const stride = bv.byteStride || size * n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset + base, a.count * stride);
  const values = new Array(a.count * n);
  for (let i = 0; i < a.count; i += 1) {
    for (let c = 0; c < n; c += 1) {
      values[i * n + c] = dv[method](i * stride + c * size, true);
    }
  }
  return { accessor: a, values, n };
}

// ---------------------------------------------------------------- 结构
check(Array.isArray(doc.meshes) && doc.meshes.length === 1, 'meshes 正好 1 个（单网格）');
check(!doc.images && !doc.textures && !doc.samplers, '没有贴图 / 采样器');
check(!doc.extensionsRequired, '没有 extensionsRequired');
check(!doc.extensionsUsed || doc.extensionsUsed.length === 0,
  '没有使用任何扩展' + (doc.extensionsUsed ? '：' + doc.extensionsUsed.join(', ') : ''));

const nodes = doc.nodes || [];
const nodeByName = new Map(nodes.map((n) => [n.name, n]));
const root = nodeByName.get('GrinTeeth');
const meshNode = nodeByName.get('GrinTeeth_Mesh');
check(!!root && !!meshNode, '节点名是 GrinTeeth / GrinTeeth_Mesh');
check(doc.scenes?.[0]?.nodes?.includes(nodes.indexOf(root)), 'GrinTeeth 是场景根节点');
check(root?.children?.includes(nodes.indexOf(meshNode)), 'GrinTeeth_Mesh 挂在根节点下');
check(!!meshNode && typeof meshNode.mesh === 'number', 'GrinTeeth_Mesh 带网格');

check(root?.extras?.upper_teeth === 9, 'extras.upper_teeth = 9');
check(root?.extras?.lower_teeth === 8, 'extras.lower_teeth = 8');
check(root?.extras?.tooth_count === 17, 'extras.tooth_count = 17（9 + 8）');
check(near(root?.extras?.size_w_m, 0.9, 1e-6), 'extras.size_w_m = 0.900');
check(near(root?.extras?.grin_lift_m, 0.2, 1e-6), 'extras.grin_lift_m = 0.200');
check(root?.extras?.color === '#4a2a20', 'extras.color = #4a2a20');
check(root?.extras?.mesh_count === 1, 'extras.mesh_count = 1');
check(root?.extras?.up_axis === 'Y', 'extras.up_axis = Y');
check(meshNode?.extras?.role === 'grin_teeth', '网格 extras.role = grin_teeth');

// ---------------------------------------------------------------- 尺寸 / 三角
const prim = doc.meshes[0].primitives[0];
check(doc.meshes[0].primitives.length === 1, '只有 1 个 primitive');
const attrs = prim.attributes;
check(attrs.POSITION !== undefined && attrs.NORMAL !== undefined, '有 POSITION / NORMAL');
check(attrs.COLOR_0 !== undefined, '有 COLOR_0（顶点色）');
check(!attrs.TEXCOORD_0, '没有 UV（不贴图）');

const pos = readAccessor(attrs.POSITION);
const idx = readAccessor(prim.indices);
const verts = [];
for (let i = 0; i < pos.accessor.count; i += 1) {
  verts.push([pos.values[i * 3], pos.values[i * 3 + 1], pos.values[i * 3 + 2]]);
}
// 导出器会按法线/顶点色把同一个位置拆成多个顶点；按位置焊回来再数连通岛。
const weld = new Map();
const wid = new Array(verts.length);
const cverts = [];
for (let i = 0; i < verts.length; i += 1) {
  const key = verts[i].map((v) => Math.round(v * 1e6)).join(',');
  let id = weld.get(key);
  if (id === undefined) {
    id = cverts.length;
    weld.set(key, id);
    cverts.push(verts[i]);
  }
  wid[i] = id;
}
const tri = [];
for (let i = 0; i < idx.values.length; i += 3) tri.push([wid[idx.values[i]], wid[idx.values[i + 1]], wid[idx.values[i + 2]]]);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const v of verts) {
  for (let c = 0; c < 3; c += 1) {
    if (v[c] < min[c]) min[c] = v[c];
    if (v[c] > max[c]) max[c] = v[c];
  }
}
const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
log('  bbox min = ' + JSON.stringify(min.map((v) => round(v))));
log('  bbox max = ' + JSON.stringify(max.map((v) => round(v))));
log('  size = ' + JSON.stringify(size.map((v) => round(v))) + ' (x 宽 / y 高 / z 厚)');
check(near(size[0], 0.9, 5e-4), '整排宽 0.900 m');
check(near(min[0], -0.45, 5e-4) && near(max[0], 0.45, 5e-4), '左右对称，x ∈ [-0.45, 0.45]');
check(near(min[2] + max[2], 0, 2e-3), '厚度方向以原点为中心');
check(near(size[1], 0.4523, 2e-3), '整排高 0.4523 m（笑弧 0.20 + 两排牙）');

log('  三角数 = ' + tri.length + '，顶点数 = ' + verts.length);
check(tri.length < 3000, '三角数 ' + tri.length + ' < 3000');

// ---------------------------------------------------------------- 连通岛
const parent = cverts.map((_, i) => i);
const find = (x) => {
  let r = x;
  while (parent[r] !== r) r = parent[r];
  while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
  return r;
};
const union = (a, b) => {
  const ra = find(a); const rb = find(b);
  if (ra !== rb) parent[rb] = ra;
};
for (const [a, b, c] of tri) { union(a, b); union(b, c); }

const groups = new Map();
for (let i = 0; i < cverts.length; i += 1) {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, { idx: [], minY: Infinity, maxY: -Infinity });
  const g = groups.get(r);
  g.idx.push(i);
  g.minY = Math.min(g.minY, cverts[i][1]);
  g.maxY = Math.max(g.maxY, cverts[i][1]);
}
const islands = [...groups.values()];
log('  连通岛 = ' + islands.length + '（期望 17：上 9 + 下 8）');
check(islands.length === 17, '17 个封闭的牙');
check(islands.every((g) => g.idx.length >= 60), '每个岛都有完整的牙冠顶点（没有碎片）');

const stats = islands.map((g) => {
  let sx = 0;
  let sz = 0;
  let boxMinX = Infinity;
  let boxMaxX = -Infinity;
  for (const i of g.idx) {
    sx += cverts[i][0];
    sz += cverts[i][2];
    boxMinX = Math.min(boxMinX, cverts[i][0]);
    boxMaxX = Math.max(boxMaxX, cverts[i][0]);
  }
  const cx = sx / g.idx.length;
  const cz = sz / g.idx.length;
  // 牙尖那一端的截面：两端的封口都是平的，取最外侧 7 mm 就够抓住整圈。
  // 用「到牙轴的半径」而不是 X 跨度：牙有外八和扭转，X 跨度会被带偏。
  const band = 0.007;
  const nearMin = g.idx.filter((i) => cverts[i][1] <= g.minY + band);
  const nearMax = g.idx.filter((i) => cverts[i][1] >= g.maxY - band);
  const radius = (list) => list.reduce((s, i) => (
    s + Math.hypot(cverts[i][0] - cx, cverts[i][2] - cz)
  ), 0) / list.length;
  const rMin = radius(nearMin);
  const rMax = radius(nearMax);
  return {
    cx,
    minY: g.minY,
    maxY: g.maxY,
    tipSpan: rMin < rMax ? 'min' : 'max',
    rMin,
    rMax,
    ratio: Math.min(rMin, rMax) / Math.max(rMin, rMax),
    width: boxMaxX - boxMinX,
  };
});

const upper = stats.filter((s) => s.tipSpan === 'min');   // 牙尖在下面 = 上排
const lower = stats.filter((s) => s.tipSpan === 'max');   // 牙尖在上面 = 下排
log('  上排（牙尖朝下）= ' + upper.length + '，下排（牙尖朝上）= ' + lower.length);
check(upper.length === 9, '上排正好 9 颗牙尖朝下');
check(lower.length === 8, '下排正好 8 颗牙尖朝上');

// 牙尖比牙根窄：短而钝，但不能是尖锥
check(stats.every((s) => s.ratio > 0.3 && s.ratio < 0.75),
  '每颗牙的牙尖截面是牙根的 30%–75%（钝头，不是锥子）');

// 交错：每个下排牙的中心都落在两颗上排牙之间
const ux = upper.map((s) => s.cx).sort((a, b) => a - b);
const lx = lower.map((s) => s.cx).sort((a, b) => a - b);
const between = lx.every((x) => ux.some((a, b) => x > a && x < b));
check(between, '下排 8 颗都错开在上排两颗之间（不是对齐的两排）');
const offsets = lx.map((x) => Math.min(...ux.map((u) => Math.abs(u - x))));
log('  最近的上下牙中心距 = ' + offsets.map((v) => round(v, 4)).join(', '));
check(offsets.every((v) => Math.abs(v - 0.0515) < 0.006), '上下排错开约半个牙距（0.0515 m）');

// 嘴角比中间高 0.20 m
const outer = stats.reduce((a, b) => (Math.abs(a.cx) > Math.abs(b.cx) ? a : b));
const center = stats.reduce((a, b) => (Math.abs(a.cx) < Math.abs(b.cx) ? a : b));
const lift = outer.maxY - center.maxY;
log('  嘴角牙根 y = ' + round(outer.maxY) + '，中间牙根 y = ' + round(center.maxY));
check(Math.abs(lift - 0.2) < 0.02, '嘴角比中间高 ' + round(lift) + ' m（目标 0.200）');

// ---------------------------------------------------------------- 材质
const mats = doc.materials || [];
check(mats.length === 1, `只有 1 个材质，实际 ${mats.length}`);
const mat = mats[0];
const pbr = mat.pbrMetallicRoughness || {};
const lin = (hex, i) => {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const want = [lin('#4a2a20', 0), lin('#4a2a20', 1), lin('#4a2a20', 2)];
log('  baseColorFactor = ' + JSON.stringify((pbr.baseColorFactor || []).map((v) => round(v, 5))));
log('  #4a2a20 线性值 = ' + JSON.stringify(want.map((v) => round(v, 5))));
check(Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.every((v, i) => near(v, i < 3 ? want[i] : 1, 5e-4)),
  '底色是 #4a2a20（线性空间换算后一致）');
check(near(pbr.metallicFactor ?? 1, 0), 'metallic = 0');
check(near(pbr.roughnessFactor ?? 1, 0.94, 1e-6), 'roughness = 0.94（哑光）');
check(mat.doubleSided !== true, '单面渲染');
check(!mat.emissiveFactor || mat.emissiveFactor.every((v) => v === 0), '没有自发光');
check(!mat.extensions, '材质没有扩展');

// ---------------------------------------------------------------- three.js 真加载
globalThis.document = { createElementNS() { return {}; }, createElement() { return {}; } };
globalThis.self = globalThis;
const THREE = await import('../vendor/three.module.js');
const { GLTFLoader } = await import('../vendor/GLTFLoader.js');

const gltf = await new Promise((resolve, reject) => {
  try {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject);
  } catch (e) { reject(e); }
}).catch((e) => { log('GLTFLoader 解析失败：' + (e && e.message ? e.message : e)); return null; });

if (check(!!gltf, 'three.js GLTFLoader 能解析这个 glb')) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((n) => { if (n.isMesh) meshes.push(n); });
  check(meshes.length === 1, '加载后场景里正好 1 个 mesh');
  const box = new THREE.Box3().setFromObject(scene);
  const s = box.getSize(new THREE.Vector3());
  log('  加载后世界包围盒 size = (' + [s.x, s.y, s.z].map((v) => round(v)).join(', ') + ')');
  check(near(s.x, 0.9, 2e-3) && near(s.y, 0.4523, 2e-3) && near(s.z, 0.059, 2e-3),
    '加载后的整排尺寸对得上（宽 0.9 / 高 0.452 / 厚 0.059）');
  const m = meshes[0].material;
  check(m.color && near(m.color.r, want[0], 3e-3) && near(m.color.g, want[1], 3e-3),
    'three 材质底色是 #4a2a20');
  check(!!meshes[0].geometry.attributes.color, 'three 几何体带顶点色');
  check(near(m.roughness, 0.94, 1e-3), 'three 材质 roughness 0.94');
}

// ---------------------------------------------------------------- 输出
console.log(out.join('\n'));
console.log('');
if (fails) {
  console.log(`=== ${fails} 项失败 ===`);
  process.exit(1);
} else {
  console.log('=== 全部通过 ===');
}

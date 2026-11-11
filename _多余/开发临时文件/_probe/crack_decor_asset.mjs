/**
 * 裂缝周围的装饰（assets/models/crack_decor_v01.glb）的结构验证，不需要 WebGL。
 *
 * 对着 docs/model_prompts.md「第五关 · 裂缝周围的装饰」逐条量：
 *   1) L 形：竖臂从地面到 3.1 m 以上，天花板臂向房间内 2.6 m；
 *   2) 中间是空的：洞心没有顶点；
 *   3) 三层翻边：顶点色里同时有近黑、深红、暗血红，且只有红/黑；
 *   4) 触手 0.2–0.6 m、3–8 cm，数量对得上 extras；
 *   5) 单网格 < 8000 三角，没有贴图 / Draco / 其他扩展；
 *   6) three.js 的 GLTFLoader 能真的解析出来。
 *
 * 跑法：node _probe/crack_decor_asset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(HERE, '..', 'assets', 'models', 'crack_decor_v01.glb');

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
check(buf.toString('ascii', 0, 4) === 'glTF', 'GLB 头是 glTF');
check(buf.readUInt32LE(4) === 2, 'glTF 版本 2');
check(buf.readUInt32LE(8) === buf.length, 'GLB 长度和文件大小一致');

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

const COMP = {
  5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'],
  5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'],
};
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
  const scale = a.normalized
    ? (a.componentType === 5121 ? 255 : a.componentType === 5123 ? 65535 : 1)
    : 1;
  for (let i = 0; i < a.count; i += 1) {
    for (let c = 0; c < n; c += 1) {
      values[i * n + c] = dv[method](i * stride + c * size, true) / scale;
    }
  }
  return { accessor: a, values, n, scale };
}

// ---------------------------------------------------------------- 结构
check(Array.isArray(doc.meshes) && doc.meshes.length === 1, 'meshes 正好 1 个（单网格）');
check(Array.isArray(doc.textures) && doc.textures.length === 1, '有 1 张贴图（细节纹理）');
check(Array.isArray(doc.images) && doc.images.length === 1, '有 1 张嵌入图片');
check(!doc.extensionsRequired, '没有 extensionsRequired');
check(!doc.extensionsUsed || doc.extensionsUsed.length === 0,
  '没有使用任何扩展' + (doc.extensionsUsed ? '：' + doc.extensionsUsed.join(', ') : ''));

const nodes = doc.nodes || [];
const nodeByName = new Map(nodes.map((n) => [n.name, n]));
const root = nodeByName.get('CrackDecor');
const meshNode = nodeByName.get('CrackDecor_Mesh');
check(!!root && !!meshNode, '节点名是 CrackDecor / CrackDecor_Mesh');
check(doc.scenes?.[0]?.nodes?.includes(nodes.indexOf(root)), 'CrackDecor 是场景根节点');
check(root?.children?.includes(nodes.indexOf(meshNode)), 'CrackDecor_Mesh 挂在根节点下');
check(!!meshNode && typeof meshNode.mesh === 'number', 'CrackDecor_Mesh 带网格');

const ex = root?.extras || {};
check(ex.rims === 3, 'extras.rims = 3（三层翻边）');
check(ex.mesh_count === 1, 'extras.mesh_count = 1');
check(ex.up_axis === 'Y', 'extras.up_axis = Y');
check(Array.isArray(ex.place) && near(ex.place[0], 0, 1e-6)
  && near(ex.place[1], 3.09, 1e-6) && near(ex.place[2], -5.92, 1e-6),
'extras.place = (0, 3.09, -5.92)');
check(ex.ceiling_run_m === 2.6, 'extras.ceiling_run_m = 2.6');
check(near(ex.ceiling_tip_world_z, -3.34, 2e-3), '天花板臂末端世界 z = -3.340');
check(ex.tentacles >= 18 && ex.tentacles <= 32, '触手 ' + ex.tentacles + ' 根（20 上下）');
check(ex.buds >= 35 && ex.buds <= 60, '肉芽 ' + ex.buds + ' 颗');
check(ex.flaps >= 10, '撕出的扁平肉片 ' + ex.flaps + ' 条');
check(Array.isArray(ex.tentacle_len_m)
  && ex.tentacle_len_m[0] >= 0.2 - 1e-6 && ex.tentacle_len_m[1] <= 0.6 + 1e-6,
'触手长度 ' + JSON.stringify(ex.tentacle_len_m) + ' m');
check(Array.isArray(ex.tentacle_dia_m)
  && ex.tentacle_dia_m[0] >= 0.03 - 1e-6 && ex.tentacle_dia_m[1] <= 0.08 + 1e-6,
'触手直径 ' + JSON.stringify(ex.tentacle_dia_m) + ' m');

// ---------------------------------------------------------------- 尺寸 / 三角
const prim = doc.meshes[0].primitives[0];
check(doc.meshes[0].primitives.length === 1, '只有 1 个 primitive');
const attrs = prim.attributes;
check(attrs.POSITION !== undefined && attrs.NORMAL !== undefined, '有 POSITION / NORMAL');
check(attrs.COLOR_0 !== undefined, '有 COLOR_0（顶点色）');
check(attrs.TEXCOORD_0 !== undefined, '有 TEXCOORD_0（UV 采样贴图）');

const pos = readAccessor(attrs.POSITION);
const idx = readAccessor(prim.indices);
const verts = [];
for (let i = 0; i < pos.accessor.count; i += 1) {
  verts.push([pos.values[i * 3], pos.values[i * 3 + 1], pos.values[i * 3 + 2]]);
}
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
log('  size = ' + JSON.stringify(size.map((v) => round(v)))
  + ' (glTF: x 宽 / y 高 / z 进房间)');
check(near(size[0], 2.5027, 0.02), 'X 跨度 2.503 m（两侧翻边 + 触手）');
check(near(size[1], 3.1794, 0.02), 'Y 跨度 3.179 m（地面到天花板）');
check(near(size[2], 2.6680, 0.02), 'Z 跨度 2.668 m（墙前 6 cm 到末端触手）');
check(near(min[1], -3.1129, 0.02) && near(max[1], 0.0628, 0.01),
  'Y ∈ [-3.113, 0.063]：正好从地面到天花板面');
check(near(max[2], 2.6052, 0.02), 'Z 最大 2.605 m：天花板臂伸进房间 2.6 m');
check(near(min[2], -0.0628, 0.01) && min[2] > -0.07,
  '最靠墙 z = -0.063（没有穿到墙面后面）');

const triCount = idx.values.length / 3;
log('  三角数 = ' + triCount + '，顶点数 = ' + verts.length);
check(triCount < 8000, '三角数 ' + triCount + ' < 8000');

// ---------------------------------------------------------------- 洞心 / 开口
// glTF → 世界：x 不变，世界 y = 3.09 + gy，世界 z = -5.92 - gz
const world = verts.map((v) => [v[0], 3.09 + v[1], -5.92 - v[2]]);
const hollow = world.filter((p) => Math.abs(p[0]) < 0.08 && p[1] > 0.7 && p[1] < 2.6);
check(hollow.length === 0, '洞心 (|x|<8 cm, 0.7<y<2.6) 没有顶点，实际 ' + hollow.length);

const atEye = world.filter((p) => Math.abs(p[1] - 2.42) < 0.05);
const leftX = Math.max(...atEye.filter((p) => p[0] < 0).map((p) => p[0]));
const rightX = Math.min(...atEye.filter((p) => p[0] > 0).map((p) => p[0]));
log('  眼睛高度内唇 x ∈ [' + round(leftX) + ', ' + round(rightX)
  + ']，开口 ' + round(rightX - leftX) + ' m');
check(rightX - leftX > 0.60 && rightX - leftX < 0.85,
  '眼睛高度开口 ' + round(rightX - leftX) + ' m（容得下 0.55 m 宽的两眼）');
check(leftX > -0.60 && rightX < 0.35, '内唇没有伸到眼睛前面');

// ---------------------------------------------------------------- 顶点色
const col = readAccessor(attrs.COLOR_0);
const rgb = [];
for (let i = 0; i < col.accessor.count; i += 1) {
  rgb.push([col.values[i * col.n], col.values[i * col.n + 1], col.values[i * col.n + 2]]);
}
const minR = Math.min(...rgb.map((c) => c[0]));
const maxR = Math.max(...rgb.map((c) => c[0]));
const maxG = Math.max(...rgb.map((c) => c[1]));
const maxB = Math.max(...rgb.map((c) => c[2]));
const nearBlack = rgb.filter((c) => c[0] < 0.01).length / rgb.length;
const deepRed = rgb.filter((c) => c[0] > 0.02 && c[0] < 0.10).length / rgb.length;
const bloodRed = rgb.filter((c) => c[0] > 0.12).length / rgb.length;
log('  COLOR_0: R ∈ [' + round(minR, 5) + ', ' + round(maxR, 4) + ']，G/B ≤ '
  + round(Math.max(maxG, maxB), 5) + '（线性）');
log('  近黑 ' + (nearBlack * 100).toFixed(1) + '%，深红 ' + (deepRed * 100).toFixed(1)
  + '%，暗血红 ' + (bloodRed * 100).toFixed(1) + '%');
check(maxG < 0.05 && maxB < 0.05, '只有红/黑，没有蓝绿');
check(nearBlack > 0.10, '内圈近黑占 ' + (nearBlack * 100).toFixed(1) + '%');
check(deepRed > 0.15, '中圈深红占 ' + (deepRed * 100).toFixed(1) + '%');
check(bloodRed > 0.08, '外圈暗血红占 ' + (bloodRed * 100).toFixed(1) + '%');
check(maxR > 0.20, '唇尖/触手尖亮到 R=' + round(maxR, 3));

// ---------------------------------------------------------------- 连通岛
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
for (let i = 0; i < idx.values.length; i += 3) {
  tri.push([wid[idx.values[i]], wid[idx.values[i + 1]], wid[idx.values[i + 2]]]);
}
const parent = cverts.map((_, i) => i);
const find = (x) => {
  let r = x;
  while (parent[r] !== r) r = parent[r];
  while (parent[x] !== r) { const n = parent[x]; parent[x] = r; x = n; }
  return r;
};
for (const [a, b, c] of tri) {
  const ra = find(a); const rb = find(b); const rc = find(c);
  if (ra !== rb) parent[rb] = ra;
  if (find(rc) !== find(a)) parent[find(rc)] = find(a);
}
const groups = new Map();
for (let i = 0; i < cverts.length; i += 1) {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(cverts[i]);
}
const islands = [...groups.values()];
log('  连通岛 = ' + islands.length + '（4 条翻边 + 触手 + 肉芽 + 肉片）');
check(islands.length >= 60, '分成 ' + islands.length + ' 个岛（不是一整块实心板）');

const elongated = [];
for (const list of islands) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const v of list) {
    for (let c = 0; c < 3; c += 1) {
      if (v[c] < mn[c]) mn[c] = v[c];
      if (v[c] > mx[c]) mx[c] = v[c];
    }
  }
  const dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].sort((a, b) => a - b);
  if (dims[2] >= 0.24 && dims[2] <= 0.65) elongated.push(dims);
}
log('  细长岛（0.24–0.65 m）= ' + elongated.length
  + '，最短边范围 ' + round(Math.min(...elongated.map((d) => d[0])), 3) + '–'
  + round(Math.max(...elongated.map((d) => d[0])), 3) + ' m');
check(elongated.length >= 14, '至少 14 根触手/肉片是细长的');
check(elongated.some((d) => d[0] < 0.09), '细长岛里有明显细的（最短边 < 9 cm）');

// ---------------------------------------------------------------- 材质
const mats = doc.materials || [];
check(mats.length === 1, '只有 1 个材质，实际 ' + mats.length);
const mat = mats[0];
const pbr = mat.pbrMetallicRoughness || {};
check(!pbr.baseColorFactor || pbr.baseColorFactor.every((v) => near(v, 1, 1e-4)),
  'baseColorFactor 是白（颜色全在 COLOR_0 + 细节贴图）');
check(!!pbr.baseColorTexture, '材质带 baseColorTexture（细节贴图）');
check(near(pbr.metallicFactor ?? 1, 0), 'metallic = 0');
check(near(pbr.roughnessFactor ?? 1, 1.0, 1e-6), 'roughness = 1.0（哑光）');
check(mat.doubleSided !== true, '单面渲染');
check(!mat.emissiveFactor || mat.emissiveFactor.every((v) => v === 0), '没有自发光');
check(!mat.extensions, '材质没有扩展');

// ---------------------------------------------------------------- three.js 真加载
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
  createElementNS(ns, tag) { return tag === 'img' ? makeFakeImage() : {}; },
  createElement(tag) { return tag === 'img' ? makeFakeImage() : {}; },
};
globalThis.self = globalThis;
self.URL.createObjectURL = () => 'blob:crack-detail';
self.URL.revokeObjectURL = () => {};
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
  log('  加载后包围盒 size = (' + [s.x, s.y, s.z].map((v) => round(v)).join(', ') + ')');
  check(near(s.x, 2.5027, 0.02) && near(s.y, 3.1794, 0.02) && near(s.z, 2.6680, 0.02),
    '加载后的尺寸对得上');
  check(!!meshes[0].geometry.attributes.color, 'three 几何体带顶点色');
  check(!!meshes[0].geometry.attributes.uv, 'three 几何体带 UV');
  check(!!meshes[0].material, 'three 材质存在');
  check(!!meshes[0].material.map, 'three 材质带细节贴图 map');
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

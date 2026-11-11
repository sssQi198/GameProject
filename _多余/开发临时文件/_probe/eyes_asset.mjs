/**
 * 眼睛模型（assets/models/eyes_v01.glb）的结构验证，不需要 WebGL。
 *
 * 对着 docs/model_prompts.md「第五关 · 眼睛」逐条量：
 *   1) 只有两颗球、两个独立网格，没有眼睑/瞳孔/脸/身体；
 *   2) 每只直径 0.174 m，球心相距 0.38 m，高度按放置说明取 2.42 m；
 *   3) 平涂自发光 #ff2030（glTF 的 emissiveFactor 是线性空间，要反算）；
 *   4) 极低面数、没有贴图 / Draco / 其他扩展；
 *   5) three.js 的 GLTFLoader 能真的解析出来，节点名和 extras 都对。
 *
 * 跑法：node _probe/eyes_asset.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(HERE, '..', 'assets', 'models', 'eyes_v01.glb');

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

// ---------------------------------------------------------------- 结构
check(Array.isArray(doc.meshes) && doc.meshes.length === 2, 'meshes 正好 2 个（两只独立网格）');
check(!doc.images && !doc.textures && !doc.samplers, '没有贴图 / 采样器');
check(!doc.extensionsRequired, '没有 extensionsRequired');
check(!doc.extensionsUsed || doc.extensionsUsed.length === 0,
  '没有使用任何扩展' + (doc.extensionsUsed ? '：' + doc.extensionsUsed.join(', ') : ''));

const nodes = doc.nodes || [];
const nodeByName = new Map(nodes.map((n) => [n.name, n]));
const root = nodeByName.get('Eyes');
check(!!root, '根节点叫 Eyes');
const rootIndex = nodes.indexOf(root);
check(Array.isArray(root?.children) && root.children.length === 2, '根节点下挂 2 个孩子');
check(doc.scenes?.[0]?.nodes?.includes(rootIndex), 'Eyes 是场景根节点');

const eyeL = nodeByName.get('Eye_L');
const eyeR = nodeByName.get('Eye_R');
check(!!eyeL && !!eyeR, '两只眼睛的节点名是 Eye_L / Eye_R');
check(eyeL?.mesh === 0 && eyeR?.mesh === 1, '左右眼各用一份网格，没有共用');

const t = (n) => n.translation || [0, 0, 0];
log('  Eye_L translation = ' + JSON.stringify(t(eyeL).map((v) => round(v))));
log('  Eye_R translation = ' + JSON.stringify(t(eyeR).map((v) => round(v))));
check(near(t(eyeL)[0], -0.19) && near(t(eyeL)[1], 0) && near(t(eyeL)[2], 0), '左眼球心 (-0.19, 0, 0)');
check(near(t(eyeR)[0], 0.19) && near(t(eyeR)[1], 0) && near(t(eyeR)[2], 0), '右眼球心 (+0.19, 0, 0)');
check(near(t(eyeR)[0] - t(eyeL)[0], 0.38), '两眼中心距 0.38 m');

check(root?.extras?.eyes?.length === 2
  && root.extras.eyes[0] === 'Eye_L' && root.extras.eyes[1] === 'Eye_R', '根节点 extras.eyes 是 [Eye_L, Eye_R]');
check(root?.extras?.diameter_m === 0.174, 'extras.diameter_m = 0.174');
check(root?.extras?.spacing_m === 0.38, 'extras.spacing_m = 0.38');
check(root?.extras?.eye_y_m === 2.42, 'extras.eye_y_m = 2.42（游戏里球心高度）');
check(root?.extras?.up_axis === 'Y', 'extras.up_axis = Y');
check(eyeL?.extras?.role === 'eye' && eyeR?.extras?.role === 'eye', '两个网格 extras.role = eye');

// ---------------------------------------------------------------- 尺寸
const accessors = doc.accessors || [];
const view = (a) => doc.bufferViews[a.bufferView];
let totalTris = 0;
for (const [name, node] of [['Eye_L', eyeL], ['Eye_R', eyeR]]) {
  const prim = doc.meshes[node.mesh].primitives[0];
  const pos = accessors[prim.attributes.POSITION];
  const dx = pos.max[0] - pos.min[0];
  const dy = pos.max[1] - pos.min[1];
  const dz = pos.max[2] - pos.min[2];
  log(`  ${name}: bbox d=(${round(dx)}, ${round(dy)}, ${round(dz)}) verts=${pos.count}`);
  check(near(dx, 0.174, 2e-4) && near(dy, 0.174, 2e-4) && near(dz, 0.174, 2e-4),
    `${name} 直径 0.174 m（x ${round(dx)} / y ${round(dy)} / z ${round(dz)}）`);
  check(near(pos.min[0], -0.087, 1e-4) && near(pos.max[0], 0.087, 1e-4),
    `${name} 以自己球心为原点（local x ∈ [-0.087, 0.087]）`);
  const idx = accessors[prim.indices];
  totalTris += idx.count / 3;
  check(idx.count / 3 <= 500, `${name} 三角数 ${idx.count / 3} ≤ 500（极低面数）`);
  check(!prim.attributes.TEXCOORD_0, `${name} 没有 UV（不贴图）`);
  check(!!prim.attributes.NORMAL, `${name} 有法线`);
  check(!!binChunk && view(pos).byteLength > 0, `${name} 顶点数据真的在 BIN 里`);
}
log(`  总三角数 = ${totalTris}`);
check(totalTris <= 1000, '整对不到 1000 三角');

// 整对的世界包围盒（两只球 + 节点位移）
const xs = [eyeL, eyeR].map((n) => t(n)[0]);
const overallW = (Math.max(...xs) + 0.087) - (Math.min(...xs) - 0.087);
check(near(overallW, 0.554), '整对包围盒宽 0.554 m（0.38 + 0.174）');

// ---------------------------------------------------------------- 材质
const mats = doc.materials || [];
check(mats.length === 1, `只有 1 个材质，实际 ${mats.length}`);
const mat = mats[0];
const pbr = mat.pbrMetallicRoughness || {};
const lin = (hex, i) => {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const want = [lin('#ff2030', 0), lin('#ff2030', 1), lin('#ff2030', 2)];
log('  emissiveFactor = ' + JSON.stringify((mat.emissiveFactor || []).map((v) => round(v, 5))));
log('  #ff2030 线性值 = ' + JSON.stringify(want.map((v) => round(v, 5))));
check(Array.isArray(mat.emissiveFactor) && mat.emissiveFactor.every((v, i) => near(v, want[i], 5e-4)),
  '自发光颜色是 #ff2030（线性空间换算后一致）');
check(mat.pbrMetallicRoughness?.baseColorFactor?.every((v, i) => near(v, i < 3 ? 0 : 1, 1e-6)),
  '底色是纯黑（只靠自发光，不加高光）');
check(near(pbr.metallicFactor ?? 1, 0), 'metallic = 0');
check(near(pbr.roughnessFactor ?? 1, 1), 'roughness = 1（哑光）');
check(mat.doubleSided !== true, '单面渲染（球体不需要双面）');

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
  check(meshes.length === 2, '加载后场景里正好 2 个 mesh');
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  log('  加载后世界包围盒 size = (' + [size.x, size.y, size.z].map((v) => round(v)).join(', ') + ')');
  check(near(size.x, 0.554, 2e-3) && near(size.y, 0.174, 2e-3) && near(size.z, 0.174, 2e-3),
    '加载后的整对尺寸对得上');
  const m = meshes[0].material;
  check(m.emissive && near(m.emissive.r, 1, 2e-3), 'three 材质带自发光红（emissive.r ≈ 1）');
  check(m.color && near(m.color.r, 0, 1e-6) && near(m.color.g, 0, 1e-6), 'three 材质底色是黑');
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

/** 临时调试：哪两颗牙的牙尖射线打到了别的东西？命中点在哪、是哪个物体。 */
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

const scene = new THREE.Scene();
const sh = createSafehouse(scene);
const info = sh.mateModelInfo();
sh.placeMate(0, 0, 0);
sh.setMateVisible(true);
sh.setReveal(1, 1);
sh.group.updateMatrixWorld(true);
const mate = sh.group.children.find((c) => c.name === 'Classmate');

const all = [];
mate.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  let kind = 'other';
  if (m && m.color && m.color.getHex() === 0xff2030 && m.blending !== THREE.AdditiveBlending) kind = 'eye';
  if (m && m.type === 'MeshBasicMaterial' && m.vertexColors === true) kind = 'fang';
  if (m && m.blending === THREE.AdditiveBlending) kind = 'halo';
  all.push({ mesh: o, kind });
});
const solid = all.filter((e) => e.kind !== 'halo');
const targets = solid.map((e) => e.mesh);
const ray = new THREE.Raycaster();
const probe = (x, y) => {
  ray.set(new THREE.Vector3(x, y, 0.9), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(targets, false);
  for (const hit of hits) {
    const e = solid.find((s) => s.mesh === hit.object);
    if (e && e.kind !== 'halo') return { kind: e.kind, hit, object: hit.object, entry: e };
  }
  return { kind: 'miss', hit: null, object: null };
};

const fangs = solid.filter((e) => e.kind === 'fang').map((e) => e.mesh);
for (const f of fangs) {
  const p = f.getWorldPosition(new THREE.Vector3());
  const { height: len, radiusTop, radiusBottom } = f.geometry.parameters;
  const tipDir = radiusTop > radiusBottom ? -1 : 1;
  const r = probe(p.x, p.y + tipDir * len * 0.42);
  if (r.kind !== 'fang') {
    const o = r.object;
    const gp = o ? o.geometry.parameters : null;
    console.log(`牙 x=${p.x.toFixed(4)} y=${p.y.toFixed(4)} z=${p.z.toFixed(4)} len=${len.toFixed(4)} tip=${tipDir}`);
    console.log(`  命中 ${r.kind} @ (${r.hit.point.x.toFixed(4)}, ${r.hit.point.y.toFixed(4)}, ${r.hit.point.z.toFixed(4)}) 几何=${o ? o.geometry.type : '-'} ${gp ? JSON.stringify(gp).slice(0, 90) : ''}`);
    console.log(`  牙面 z≈${(Math.sqrt(Math.max(0, 0.168 ** 2 - p.x ** 2 - (p.y - info.headY) ** 2)) + 0.003).toFixed(4)}`);
  }
}
sh.reset();
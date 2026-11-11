/** 临时调试二：为什么这两颗牙在自己身上打不到？*/
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

const fangs = [];
mate.traverse((o) => {
  if (o.isMesh && o.material.type === 'MeshBasicMaterial' && o.material.vertexColors === true) fangs.push(o);
});
const ray = new THREE.Raycaster();
const all = [];
mate.traverse((o) => { if (o.isMesh) all.push(o); });
for (const f of fangs) {
  const p = f.getWorldPosition(new THREE.Vector3());
  const { height: len, radiusTop, radiusBottom } = f.geometry.parameters;
  const tipDir = radiusTop > radiusBottom ? -1 : 1;
  const y = p.y + tipDir * len * 0.42;
  ray.set(new THREE.Vector3(p.x, y, 0.9), new THREE.Vector3(0, 0, -1));
  const union = ray.intersectObjects(all, false);
  const first = union[0];
  if (first && first.object === f) continue;
  console.log(`牙 x=${p.x.toFixed(4)} 探针 y=${y.toFixed(4)} —— 完整命中序列：`);
  for (const h of union.slice(0, 5)) {
    const tag = h.object === f ? '这颗牙' : `${h.object.geometry.type}/${h.object.geometry.parameters ? h.object.geometry.parameters.height ?? '' : '自定义'}`;
    console.log(`   z=${h.point.z.toFixed(4)}  ${tag}  不透明度=${h.object.material.opacity?.toFixed?.(2)} 色=#${h.object.material.color?.getHexString?.()}`);
  }
}
sh.reset();
/**
 * M2 人物与异常。
 * anomalyFactory[关卡] 设成函数后，替换该关的程序化异常。
 * 函数返回 { level, id, group, stand:{x,z}, aimY, update(dt, env), parent? }。
 * group 必须用 tagAnomaly(group, level, id) 打过标记，否则拍不到。
 * parent === 'door' 时会挂到门轴上，随门打开。
 *
 * createClassmate / createEyes 返回 null 就继续用程序化模型。
 * 同学：脚底在原点。userData.legs = [左腿, 右腿]，userData.arms = [左上臂, 右上臂]，
 *   userData.torso = 躯干网格（用于呼吸缩放），userData.materials 用于尾声淡出。
 * 眼睛：本地高度约 1.62。userData.eyeL / eyeR 会跟着心跳缩放。
 */
export const anomalyFactory = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
};

/**
 * 多部件同学 v2（约 16 网格）
 * 规格：序章优化规划书 §4.2
 */
export function createClassmate(THREE) {
  const group = new THREE.Group();

  // ── 材质 ──
  const cloth = new THREE.MeshStandardMaterial({ color: 0x252a3a, roughness: 0.86 });   // 外套深藏青
  const pants = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.88 });   // 长裤深灰
  const skin  = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.88 });    // 深灰褐，融入昏暗环境
  const hair  = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.9 });    // 头发与鞋
  const bag   = new THREE.MeshStandardMaterial({ color: 0x33291f, roughness: 0.82 });   // 书包
  const inner = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.6 });    // 领口内搭
  const mats  = [cloth, pants, skin, hair, bag, inner];

  // ── 头（纯白球形，无头发） ──
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16), skin);
  head.position.y = 1.585;
  group.add(head);

  // ── 颈 ──
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.1, 10), skin);
  neck.position.y = 1.45;
  group.add(neck);

  // ── 躯干（4 段圆柱锥化：胸宽腰窄、前后压薄） ──
  const torso = new THREE.Group();
  const segCount = 4;
  const segH = 0.14;
  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1);                  // 0~1，上到下
    const radius = 0.20 - t * 0.08;                // 胸 0.20 → 腰 0.12，锥化更明显
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius - 0.02, segH, 10),
      cloth,
    );
    seg.scale.z = 0.7;                             // 前后压薄
    seg.position.y = 1.36 - i * segH;
    torso.add(seg);
  }
  // 肩宽 ≈0.40 = 0.20*2
  torso.position.y = 0;
  group.add(torso);

  // ── 领口内搭 ──
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.06, 10, 1, true),
    inner,
  );
  collar.scale.z = 0.62;
  collar.position.y = 1.36;
  group.add(collar);

  // ── 胯 ──
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), pants);
  hip.position.y = 0.85;
  group.add(hip);

  // ── 腿（髋 pivot 单件，同现有方案） ──
  const legGeo = new THREE.BoxGeometry(0.12, 0.62, 0.14);
  legGeo.translate(0, -0.31, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  const legR = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.09, 0.78, 0);
  legR.position.set(0.09, 0.78, 0);
  group.add(legL, legR);

  // ── 鞋 ──
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.06, 0.16);
  const shoeL = new THREE.Mesh(shoeGeo, hair);
  const shoeR = new THREE.Mesh(shoeGeo, hair);
  shoeL.position.set(-0.09, 0.19, 0.025);
  shoeR.position.set(0.09, 0.19, 0.025);
  group.add(shoeL, shoeR);

  // ── 上臂 ──
  const armGeo = new THREE.CylinderGeometry(0.05, 0.044, 0.26, 8);
  armGeo.translate(0, -0.13, 0);                  // pivot 在肩
  const armL = new THREE.Mesh(armGeo, cloth);
  const armR = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.26, 1.36, 0);
  armR.position.set(0.26, 1.36, 0);
  group.add(armL, armR);

  // ── 前臂（上臂子节点，固定约 12° 肘弯） ──
  const foreGeo = new THREE.CylinderGeometry(0.038, 0.03, 0.24, 8);
  foreGeo.translate(0, -0.12, 0);
  const foreL = new THREE.Mesh(foreGeo, cloth);
  const foreR = new THREE.Mesh(foreGeo, cloth);
  foreL.position.y = -0.26;
  foreL.rotation.x = 0.21;                         // ~12°
  foreR.position.y = -0.26;
  foreR.rotation.x = 0.21;
  armL.add(foreL);
  armR.add(foreR);

  // ── 手 ──
  const handGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const handL = new THREE.Mesh(handGeo, skin);
  const handR = new THREE.Mesh(handGeo, skin);
  handL.position.set(0, -0.49, 0);
  handR.position.set(0, -0.49, 0);
  armL.add(handL);
  armR.add(handR);

  // ── 书包 ──
  const bagGroup = new THREE.Group();
  const bagBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.1), bag);
  bagBody.position.set(0, 1.18, -0.17);
  bagGroup.add(bagBody);
  // 背面中部小包：在主包背面(z方向靠后)中间偏下位置，扁小包突出于主包背面
  const bagPocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.04), bag);
  bagPocket.position.set(0, 1.10, -0.24);
  bagGroup.add(bagPocket);
  // 两条包带：薄条从肩上挂下
  const strapGeo = new THREE.BoxGeometry(0.03, 0.36, 0.02);
  const strapL = new THREE.Mesh(strapGeo, bag);
  const strapR = new THREE.Mesh(strapGeo, bag);
  strapL.position.set(-0.12, 1.26, -0.14);
  strapR.position.set(0.12, 1.26, -0.14);
  bagGroup.add(strapL, strapR);
  group.add(bagGroup);

  // ── userData：供 level.js 使用 ──
  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  group.userData.torso = torso;
  group.userData.materials = mats;

  return group;
}

export function createEyes() {
  return null;
}

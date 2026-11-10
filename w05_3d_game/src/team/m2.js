/**
 * M2 人物与异常。
 * anomalyFactory[关卡] 设成函数后，替换该关的程序化异常。
 * 函数返回 { level, id, group, stand:{x,z}, aimY, update(dt, env), parent? }。
 * group 必须用 tagAnomaly(group, level, id) 打过标记，否则拍不到。
 * parent === 'door' 时会挂到门轴上，随门打开。
 *
 * createClassmate 默认加载 assets/models/classmate_v01.glb，失败才退回程序化模型。
 *   换模型走下面的 MATE_MODEL（url / scale / yawOffset / offsetY / hideMaterials），
 *   或者在地址栏加 ?mate=proc（程序化） / ?mate=/assets/models/xxx.glb&mateface=keep。
 *   glb 自带的五官（Eye_White/Eye_Dark/Face_Shadow 三个材质槽）默认按材质隐藏，
 *   给尾声的红眼和尖牙让位；换成没有五官的模型时把 hideMaterials 改成 []。
 * 同学：脚底在原点。userData.legs = [左腿, 右腿]，userData.arms = [左上臂, 右上臂]，
 *   userData.torso = 身体（用于呼吸缩放），userData.materials 用于尾声淡出。
 *   这四项在 glb 加载完成前是空的，加载后填进同一批数组。
 * createEyes 返回 null 就继续用程序化眼睛。
 * 眼睛：本地高度约 1.62。userData.eyeL / eyeR 会跟着心跳缩放。
 *   造型与第五关裂缝里那张脸同源（黑脸板 + 加性光晕 + 17 颗咧嘴尖牙），
 *   坐标系是实体本地：眼 z = 0.02，脸/牙朝 +Z。
 *   userData.setGrin(k) 按距离压嘴：k=1 满咧嘴，k=0 贴脸时压暗 70%、咧嘴缩到 0.88。
 *   身后那团半透明黑球退到 z = -1.62，避免 depthWrite:false 的它在脸和牙上再糊一层黑。
 */
import * as THREE from '../../vendor/three.module.js';
import { disposeCharacter, loadCharacter } from '../character-model.js';

// 空着就用 anomalies.js 里 52162af 那套异常模型。
// 要替换某一关，把对应函数填进来。
export const anomalyFactory = {};

export const CLASSMATE_URL = '/assets/models/classmate_v01.glb';

/** url 填这个值就完全不用 glb（= 接 glb 之前那套程序化同学）。 */
export const PROCEDURAL_MATE = 'proc';

/**
 * 同学模型的唯一调参入口。换模型只动这里，或者用 ?mate= 在浏览器里临时覆盖。
 *
 * url            glb 路径；PROCEDURAL_MATE 表示跳过 glb 直接用程序化模型
 * scale          整体缩放（模型不是 1.7 米高时用）
 * yawOffset      朝向修正，弧度。约定的「正面」是 +Z，模型反了就填 Math.PI
 * offsetY        整体抬高/压低，米
 * hideMaterials  要隐藏的材质名。classmate_v01 那张头网格把眼睛和嘴也烘进去了
 *                （Eye_White / Eye_Dark / Face_Shadow 三个材质槽），不隐藏就会和
 *                safehouse 自己挂的红眼、尖牙打架——重影的眼、对不上的嘴。
 *                隐藏是按材质关的（material.visible = false），不动几何。
 *                换成一个没有五官的模型时，把它改成 []。
 */
export const MATE_MODEL = {
  // 第十八轮定稿：默认就是程序化模型（A 方案）。
  // 理由：终局要的是「脸上先亮起两个红光点，再咧嘴露出尖牙」，而 classmate_v01.glb
  // 把眼睛和嘴烘进头网格（6 个面片材质），红眼只能贴在它上面做重影；
  // 程序化那颗球头本来是**完全没有五官**的，红眼 / 嘴 / 牙全部由 safehouse 现挂，
  // 想怎么亮、什么时候咧嘴都是纯参数。glb 仍然可用 `?mate=` 临时换回来。
  url: PROCEDURAL_MATE,
  scale: 1,
  yawOffset: 0,
  offsetY: 0,
  // 程序化头没有五官，没有要藏的东西
  hideMaterials: [],
};

/** 读一份拷贝，避免外面拿着引用改到内部状态。 */
export function mateModelConfig() {
  return { ...MATE_MODEL, hideMaterials: [...MATE_MODEL.hideMaterials] };
}

/**
 * 改模型配置。没给的键保持原样（undefined 才算「没给」）。
 * 只在 createClassmate 读配置的那一刻生效；要热换请用 safehouse.setMateModel。
 */
export function configureMateModel(url, options = {}) {
  if (typeof url === 'string' && url.length > 0) MATE_MODEL.url = url;
  for (const key of ['scale', 'yawOffset', 'offsetY']) {
    if (typeof options[key] === 'number' && Number.isFinite(options[key])) MATE_MODEL[key] = options[key];
  }
  if (Array.isArray(options.hideMaterials)) MATE_MODEL.hideMaterials = [...options.hideMaterials];
  return mateModelConfig();
}

function setDataset(key, value) {
  if (typeof document === 'undefined' || !document.body || !document.body.dataset) return;
  document.body.dataset[key] = value;
}

/**
 * 按材质名把模型自带的五官关掉。返回真正关掉的材质名，方便核对与排查。
 * 用的是 material.visible：glb 里一张网格拆成多个 primitive，three 会做成
 * 「一个 Group + 每个 primitive 一个 Mesh」，每个 Mesh 有自己的材质，
 * 所以按名字关不会误伤同一张头上的皮肤和头发。
 */
export function applyFaceOverride(root, hideMaterials) {
  const hidden = [];
  if (!root || !Array.isArray(hideMaterials) || hideMaterials.length === 0) return hidden;
  const wanted = new Set(hideMaterials);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (mat && wanted.has(mat.name)) {
        mat.visible = false;
        hidden.push(mat.name);
      }
    }
  });
  return hidden;
}

/**
 * 序章 / 尾声的同学。先交出空组，glb 到了再把关节填进原来的数组。
 *
 * hooks.onReady(group) 会被调用一次，参数就是这个组。**参数必须传**：
 * 程序化那套是同步回调的，调用点里 `const g = createClassmate(...)` 的 g 那时还在 TDZ，
 * 回调里直接引用 g 会抛 "Cannot access 'g' before initialization"。用参数就没事。
 */
export function createClassmate(THREE, hooks = {}) {
  const group = new THREE.Group();
  group.name = 'Classmate';
  group.userData.legs = [];
  group.userData.arms = [];
  group.userData.torso = null;
  group.userData.materials = [];
  group.userData.hiddenMaterials = [];
  // 这一份的模型地址在创建那一刻就定下来；后面配置再变，也不该由旧请求去改全局状态
  const url = MATE_MODEL.url;
  group.userData.modelUrl = url;
  const report = (key, value) => {
    if (url === MATE_MODEL.url) setDataset(key, value);
  };

  if (url === PROCEDURAL_MATE) {
    adoptProcedural(group, THREE);
    report('classmateModel', 'procedural');
    // 程序化那套本来就没有五官可以藏；写 'none' 是为了让 data-classmate-hidden 始终有值
    report('classmateHidden', 'none');
    hooks.onReady?.(group);
    return group;
  }

  loadCharacter(url).then((bound) => {
    if (group.userData.disposed) {
      disposeCharacter(bound);
      return;
    }
    group.userData.disposeModel = () => disposeCharacter(bound);
    mountCharacter(group, bound, report);
    report('classmateModel', 'glb');
    hooks.onReady?.(group);
  }).catch((error) => {
    console.warn('同学 GLB 加载失败，改用程序化模型。', error);
    if (!group.userData.disposed) adoptProcedural(group, THREE);
    report('classmateModel', 'fallback');
    report('classmateHidden', 'none');
    hooks.onReady?.(group);
  });
  return group;
}

function mountCharacter(group, bound, report = setDataset) {
  const { scale, yawOffset, offsetY, hideMaterials } = MATE_MODEL;
  bound.root.scale.setScalar(scale);
  bound.root.rotation.y = yawOffset;
  bound.root.position.y = offsetY;
  group.add(bound.root);
  group.userData.legs.push(...bound.legs);
  group.userData.arms.push(...bound.arms);
  group.userData.materials.push(...bound.materials);
  group.userData.torso = bound.body ?? null;
  group.userData.hiddenMaterials = applyFaceOverride(bound.root, hideMaterials);
  report('classmateHidden', group.userData.hiddenMaterials.join(',') || 'none');
  applyOpacity(group);
}

function applyOpacity(group) {
  const value = group.userData.opacity;
  if (typeof value !== 'number') return;
  for (const material of group.userData.materials) {
    material.transparent = value < 0.99;
    material.opacity = value;
  }
}

function adoptProcedural(group, THREE) {
  const built = buildProceduralClassmate(THREE);
  while (built.children.length) group.add(built.children[0]);
  group.userData.legs.push(...built.userData.legs);
  group.userData.arms.push(...built.userData.arms);
  group.userData.materials.push(...built.userData.materials);
  group.userData.torso = built.userData.torso ?? null;
  // 五官接口也要一起搬：safehouse.buildFaceRig 靠 headR 把红眼 / 嘴贴到球面上，
  // 漏了这一行，glb 加载失败后的回退模型就会退回「按 glb 尺寸猜」的 0.135，
  // 红眼又沉进半径 0.165 的球头里（上一版红眼不见就是这个原因）。
  if (built.userData.faceRig) group.userData.faceRig = { ...built.userData.faceRig };
  applyOpacity(group);
}

/**
 * 同学 glb 读不到时的备用体。规格仍是序章那套分件。
 */
function buildProceduralClassmate(THREE) {
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
  // 长度 0.78 而不是 0.62：髋关节在 y=0.78，腿正好落到地面。
  // 之前 0.62 让整套下半身悬空 16 cm（换模型要靠它落地的，见 safehouse.box3）。
  const legGeo = new THREE.BoxGeometry(0.12, 0.78, 0.14);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  const legR = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.09, 0.78, 0);
  legR.position.set(0.09, 0.78, 0);
  group.add(legL, legR);

  // ── 鞋 ──
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.06, 0.16);
  const shoeL = new THREE.Mesh(shoeGeo, hair);
  const shoeR = new THREE.Mesh(shoeGeo, hair);
  shoeL.position.set(-0.09, 0.03, 0.025);
  shoeR.position.set(0.09, 0.03, 0.025);
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

  /**
   * 五官接口（safehouse.buildFaceRig 读）：
   *   headY = 球心高度，headR = 球半径。
   * 有了 headR 才能把红眼 / 嘴贴到**球面**上。上一版是按 glb 的尺寸硬写的
   * （眼 z=0.13、牙 z=0.115），换到半径 0.165 的球头时整个五官都沉在头里面，
   * 屏幕上只剩一张没有五官的脸 —— 这是「红眼不见了」的真正原因。
   */
  group.userData.faceRig = { headY: 1.585, headR: 0.165 };

  return group;
}

/**
 * 终局实体的脸：与第五关裂缝里那双眼睛 + 咧嘴尖牙**同一套规格**。
 * level.js 会读取 userData.eyeL / eyeR，并在追逐时让它们随心跳缩放；
 * 还会把 userData.setGrin(k) 接到 stepEntity 的近距离压制上。
 *
 * 对齐依据（第五关 src/anomalies.js 里那套脸，眼心 y=2.42、z=-5.981）：
 *   · 眼球半径 0.087、眼心间距 ±0.19、色 0xff2030、toneMapped:false；
 *   · 加性光晕球，直径 = 半径 ×1.9，opacity 0.18，色 0xff2434；
 *   · 咧嘴抛物线 y = 中央 + 0.20u²，半宽 0.46，嘴在眼睛前 0.096；
 *   · 17 颗锥体牙（上 9 下 8 交错咬合），顶点色 0x4a2a20 → 牙尖提亮；
 *   · 近黑的几块脸板（主板 / 颅顶 / 眉弓 / 鼻梁 / 颧骨 / 下颌）。
 * 这里只是把原点搬到脚底、眼高 1.62 的实体坐标系，比例与裂缝完全一致。
 */
export function createEyes(three = THREE) {
  const group = new three.Group();

  // ── 与第五关一致的几何常量 ──
  const EYE_Y = 1.62;          // 实体的眼高（level.js 的 entityEye() 也按 1.62 算）
  const EYE_Z = 0.02;
  const EYE_R = 0.087;
  const EYE_DX = 0.19;
  const FACE_FRONT = EYE_Z + 0.040;   // 脸板比眼心靠前 4cm（同裂缝）
  const GRIN_Z = EYE_Z + 0.096;       // 咧嘴比眼心靠前 9.6cm（同裂缝）
  const GRIN_Y0 = EYE_Y - 0.48;       // 嘴中央比眼心低 0.48（同裂缝）
  const GRIN_LIFT = 0.20;             // 嘴角上扬量
  const GRIN_HALF = 0.46;             // 半宽

  // 固定种子的随机数：牙的抖动每次刷新都一样，避免"今天牙齿更长"这类漂移。
  let seed = 20260931;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // ── 眼球 ──
  // MeshBasicMaterial + toneMapped:false：不吃雾、不被 ACES 压成灰，终局的红眼才看得见。
  const eyeMaterial = new three.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
  const eyeGeo = new three.SphereGeometry(EYE_R, 16, 12);
  const eyeL = new three.Mesh(eyeGeo, eyeMaterial);
  const eyeR = new three.Mesh(eyeGeo, eyeMaterial);
  eyeL.position.set(-EYE_DX, EYE_Y, EYE_Z);
  eyeR.position.set(EYE_DX, EYE_Y, EYE_Z);

  // ── 加性光晕：只往周围染红，不产生几何轮廓 ──
  const haloMaterial = new three.MeshBasicMaterial({
    color: 0xff2434,
    transparent: true,
    opacity: 0.18,
    blending: three.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const haloGeo = new three.SphereGeometry(EYE_R * 1.9, 12, 10);
  const haloL = new three.Mesh(haloGeo, haloMaterial);
  haloL.position.copy(eyeL.position);
  const haloR = new three.Mesh(haloGeo, haloMaterial);
  haloR.position.copy(eyeR.position);

  // ── 近黑脸板：用顶点色做"自上而下"的明暗，不靠灯光也能读出眉弓/鼻梁 ──
  function faceShade(geo, bottomK, topK) {
    const pos = geo.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = maxY - minY;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const t = span > 1e-6 ? (pos.getY(i) - minY) / span : 0.5;
      const k = bottomK + (topK - bottomK) * t;
      col[i * 3] = k;
      col[i * 3 + 1] = k;
      col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new three.Float32BufferAttribute(col, 3));
    return geo;
  }
  const flatMatVC = (hex) => new three.MeshBasicMaterial({
    color: hex, side: three.DoubleSide, fog: false, depthWrite: true, vertexColors: true,
  });

  const faceMat = flatMatVC(0x050303);
  const faceHi = flatMatVC(0x0a0808);
  const faceRoot = new three.Group();
  const faceBox = (w, h, d, x, y, frontZ, mat) => {
    const geo = faceShade(new three.BoxGeometry(w, h, d), 0.30, 1.35);
    const m = new three.Mesh(geo, mat || faceMat);
    m.position.set(x, y, frontZ - d / 2);
    faceRoot.add(m);
    return m;
  };
  // 各板的 y 一律 = 第五关的值 − 0.80（眼心 2.42 → 1.62）
  faceBox(1.15, 1.62, 0.020, 0, EYE_Y, FACE_FRONT - 0.017);          // 主板
  faceBox(1.00, 0.30, 0.020, 0, EYE_Y + 0.53, FACE_FRONT - 0.017);   // 颅顶
  faceBox(0.34, 0.085, 0.017, -0.20, EYE_Y + 0.14, FACE_FRONT);      // 眉弓左
  faceBox(0.34, 0.085, 0.017, 0.20, EYE_Y + 0.14, FACE_FRONT);       // 眉弓右
  faceBox(0.11, 0.44, 0.014, 0, EYE_Y - 0.09, FACE_FRONT + 0.002);   // 鼻梁
  faceBox(0.26, 0.15, 0.014, -0.36, EYE_Y - 0.18, FACE_FRONT);       // 颧骨左
  faceBox(0.26, 0.15, 0.014, 0.36, EYE_Y - 0.18, FACE_FRONT);        // 颧骨右
  faceBox(0.95, 0.20, 0.018, 0, EYE_Y - 0.50, FACE_FRONT + 0.002);   // 下颌

  // ── 咧嘴尖牙 ──
  const grinRoot = new three.Group();
  grinRoot.position.set(0, GRIN_Y0, GRIN_Z);   // 缩放时绕嘴中央收缩，不会把牙拉向地面
  const toothMat = flatMatVC(0x4a2a20);
  const toothBase = new three.Color(0x4a2a20);
  const upVec = new three.Vector3(0, 1, 0);
  const grinY = (u) => GRIN_LIFT * u * u;      // 中间低、两边高

  function addTooth(x, yBase, yTip, radius) {
    const base = new three.Vector3(x, yBase - GRIN_Y0, (rnd() - 0.5) * 0.006);
    const tip = new three.Vector3(x * 0.985, yTip - GRIN_Y0, 0.014 + (rnd() - 0.5) * 0.006);
    const dir = new three.Vector3().subVectors(tip, base);
    const len = dir.length();
    dir.normalize();
    // 复用脸的明暗函数：锥体 apex 在局部 +Y，所以牙尖自然更亮
    const geo = faceShade(new three.ConeGeometry(radius, len, 7), 0.75, 2.0);
    const tooth = new three.Mesh(geo, toothMat);
    tooth.position.copy(base).addScaledVector(dir, len / 2);
    tooth.quaternion.setFromUnitVectors(upVec, dir);
    grinRoot.add(tooth);
  }

  // 上排：牙根在上、牙尖朝下（绝对 y 再补回 GRIN_Y0）
  const UPPER_TEETH = 9;
  for (let k = 0; k < UPPER_TEETH; k += 1) {
    const u = -1 + (2 * k) / (UPPER_TEETH - 1);
    const y = GRIN_Y0 + grinY(u) + (rnd() - 0.5) * 0.012;
    addTooth(u * GRIN_HALF * 0.94, y + 0.115, y - 0.030, 0.028 + rnd() * 0.012);
  }
  // 下排：牙根在下、牙尖朝上，错开半格咬合
  const LOWER_TEETH = 8;
  for (let k = 0; k < LOWER_TEETH; k += 1) {
    const u = -1 + (2 * k + 1) / LOWER_TEETH;
    const y = GRIN_Y0 + grinY(u) + (rnd() - 0.5) * 0.012;
    addTooth(u * GRIN_HALF * 0.94, y - 0.125, y + 0.040, 0.026 + rnd() * 0.012);
  }

  // ── 身后的一团黑 ──
  // 注意：这块是半透明、depthWrite:false，会在不透明物之后混合，
  // 所以它**必须留在脸后面**（front ≈ -0.08），否则会把牙和眼睛一起蒙掉 58%。
  const darkMaterial = new three.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: three.DoubleSide,
  });
  const dark = new three.Mesh(new three.SphereGeometry(1.55, 20, 14), darkMaterial);
  dark.position.set(0, 1.45, -1.62);

  // 微弱红光只负责烘托眼睛，不替代 eyeL / eyeR 的缩放动画。
  const halo = new three.PointLight(0xff2233, 1.2, 4.5, 2);
  halo.position.y = 1.6;

  group.add(dark, faceRoot, grinRoot, haloL, haloR, eyeL, eyeR, halo);
  group.userData.eyeL = eyeL;
  group.userData.eyeR = eyeR;

  /**
   * 贴脸压制：k=1 正常咧嘴，k=0 收到最近处最弱。
   * 追逐时怪物会逼到 1.45m，那时 0.92m 宽的嘴会糊掉半个屏幕，
   * 所以 level.js 按距离把牙齿压暗并略微缩小，远看仍有咧嘴。
   */
  group.userData.setGrin = (k) => {
    const t = Math.min(1, Math.max(0, k));
    // 线性色 ×0.30 大约等于眼睛感知到的一半亮（sRGB 下 ≈0.5），再低就彻底看不见了
    toothMat.color.copy(toothBase).multiplyScalar(0.30 + 0.70 * t);
    grinRoot.scale.setScalar(0.88 + 0.12 * t);
  };

  return group;
}

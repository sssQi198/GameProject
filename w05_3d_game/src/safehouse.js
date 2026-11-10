import * as THREE from '../vendor/three.module.js';
import { configureMateModel, createClassmate, mateModelConfig } from './team/m2.js';

export const SAFEHOUSE = {
  minX: 120, maxX: 136, minZ: -8, maxZ: 8, height: 3.0,
  doorX: 120,
  spawn: { x: 123.2, z: 0, yaw: -Math.PI / 2 },
  mateStation: { x: 121.6, z: 0.25 },
  mateEntry: { x: 120.5, z: 0.05 },
};

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** 固定种子伪随机（和 anomalies.js 同一个 mulberry32）：
 *  同一套牙每次刷新都长在同一个位置，调试截图才能前后对比。 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSafehouse(scene) {
  const group = new THREE.Group();
  group.name = 'Safehouse';
  group.visible = false;
  group.userData.keepVisible = true;
  scene.add(group);

  const materials = {};
  const meshes = [];
  const lights = [];

  // ── 材质 ──
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.9 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf2ece2, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8dfd0, roughness: 0.92 });
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xbfae96, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.8, emissive: 0xffe9c8, emissiveIntensity: 0 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5f, roughness: 0.5 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 1.0 });
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3e, roughness: 0.85 });
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.8 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x5c4a3a, roughness: 0.88 });
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6 });
  const lampShadeMat = new THREE.MeshStandardMaterial({ color: 0xffe4c0, roughness: 0.6, emissive: 0xffa040, emissiveIntensity: 0.6 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x9fb6d8, toneMapped: false });
  const pictureFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
  const pictureCanvasMat = new THREE.MeshStandardMaterial({ color: 0xc0a080, roughness: 0.9 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.7 });

  // ── 地面：y ∈ [-0.16, 0] ──
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 16), floorMat);
  floor.position.set(128, -0.08, 0);
  group.add(floor);
  meshes.push(floor);

  // ── 天花板：y ∈ [2.84, 3.0] ──
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 16), ceilingMat);
  ceiling.position.set(128, 2.92, 0);
  group.add(ceiling);
  meshes.push(ceiling);

  // ── 北墙 z = -8 ──
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.16), wallMat);
  northWall.position.set(128, 1.5, -8.08);
  group.add(northWall);
  meshes.push(northWall);

  // ── 南墙 z = +8 ──
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.16), wallMat);
  southWall.position.set(128, 1.5, 8.08);
  group.add(southWall);
  meshes.push(southWall);

  // ── 东墙 x = 136 ──
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 16), wallMat);
  eastWall.position.set(136.08, 1.5, 0);
  group.add(eastWall);
  meshes.push(eastWall);

  // ── 西墙 x = 120，拆成门洞左、右、门楣 ──
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 7.15), wallMat);
  wallLeft.position.set(119.92, 1.5, -4.425);
  group.add(wallLeft);
  meshes.push(wallLeft);

  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 7.15), wallMat);
  wallRight.position.set(119.92, 1.5, 4.425);
  group.add(wallRight);
  meshes.push(wallRight);

  const wallHeader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 1.7), wallMat);
  wallHeader.position.set(119.92, 2.65, 0);
  group.add(wallHeader);
  meshes.push(wallHeader);

  // ── 门框：左、右、上 ──
  const doorFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.12), doorFrameMat);
  doorFrameLeft.position.set(119.96, 1.15, -0.85);
  group.add(doorFrameLeft);
  meshes.push(doorFrameLeft);

  const doorFrameRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.12), doorFrameMat);
  doorFrameRight.position.set(119.96, 1.15, 0.85);
  group.add(doorFrameRight);
  meshes.push(doorFrameRight);

  const doorFrameHead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.7), doorFrameMat);
  doorFrameHead.position.set(119.96, 2.3, 0);
  group.add(doorFrameHead);
  meshes.push(doorFrameHead);

  // ── 门板 + pivot ──
  const doorPivot = new THREE.Group();
  doorPivot.position.set(120, 0, -0.85);
  group.add(doorPivot);

  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.30, 1.70), doorMat);
  doorPanel.position.set(0, 1.15, 0.85);
  doorPivot.add(doorPanel);
  meshes.push(doorPanel);

  // ── 门把手 ──
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.10), handleMat);
  handle.position.set(-0.035, 1.15, 1.55);
  doorPivot.add(handle);
  meshes.push(handle);

  // ── 地毯 ──
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), carpetMat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(126, 0.012, 0);
  group.add(carpet);
  meshes.push(carpet);

  // ── 沙发（靠南墙） ──
  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 0.9), sofaMat);
  sofaBase.position.set(128, 0.17, 6.5);
  group.add(sofaBase);
  meshes.push(sofaBase);

  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.15), sofaMat);
  sofaBack.position.set(128, 0.52, 6.92);
  group.add(sofaBack);
  meshes.push(sofaBack);

  const sofaArmL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.9), sofaMat);
  sofaArmL.position.set(126.92, 0.42, 6.5);
  group.add(sofaArmL);
  meshes.push(sofaArmL);

  const sofaArmR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.9), sofaMat);
  sofaArmR.position.set(129.08, 0.42, 6.5);
  group.add(sofaArmR);
  meshes.push(sofaArmR);

  const sofaCushionL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), sofaMat);
  sofaCushionL.position.set(127.5, 0.36, 6.5);
  group.add(sofaCushionL);
  meshes.push(sofaCushionL);

  const sofaCushionR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), sofaMat);
  sofaCushionR.position.set(128.5, 0.36, 6.5);
  group.add(sofaCushionR);
  meshes.push(sofaCushionR);

  // ── 茶几 ──
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.7), tableMat);
  tableTop.position.set(126, 0.43, 0);
  group.add(tableTop);
  meshes.push(tableTop);

  const tableLegGeo = new THREE.BoxGeometry(0.06, 0.43, 0.06);
  const tableLegs = [
    { x: 125.43, z: -0.28 }, { x: 126.57, z: -0.28 },
    { x: 125.43, z: 0.28 }, { x: 126.57, z: 0.28 },
  ];
  tableLegs.forEach((pos, i) => {
    const leg = new THREE.Mesh(tableLegGeo, tableMat);
    leg.position.set(pos.x, 0.215, pos.z);
    group.add(leg);
    meshes.push(leg);
  });

  // ── 书架（靠东墙） ──
  const shelfSideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.4), shelfMat);
  shelfSideL.position.set(135.28, 1.0, -1.5);
  group.add(shelfSideL);
  meshes.push(shelfSideL);

  const shelfSideR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.4), shelfMat);
  shelfSideR.position.set(135.28, 1.0, 1.5);
  group.add(shelfSideR);
  meshes.push(shelfSideR);

  const shelfBack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.0, 3.0), shelfMat);
  shelfBack.position.set(135.49, 1.0, 0);
  group.add(shelfBack);
  meshes.push(shelfBack);

  const shelfShelves = [0.2, 0.8, 1.4];
  shelfShelves.forEach((y) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 3.0), shelfMat);
    shelf.position.set(135.08, y, 0);
    group.add(shelf);
    meshes.push(shelf);
  });

  // ── 落地灯 ──
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 8), lampPoleMat);
  lampPole.position.set(130, 0.8, -3);
  group.add(lampPole);
  meshes.push(lampPole);

  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 16, 1, true), lampShadeMat);
  lampShade.rotation.x = Math.PI;
  lampShade.position.set(130, 1.62, -3);
  group.add(lampShade);
  meshes.push(lampShade);

  // ── 窗（东墙） ──
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), windowMat);
  windowPane.position.set(135.92, 1.5, 2);
  windowPane.rotation.y = -Math.PI / 2;
  group.add(windowPane);
  meshes.push(windowPane);

  const windowFrameTop = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 1.5), pictureFrameMat);
  windowFrameTop.position.set(135.96, 2.14, 2);
  windowFrameTop.rotation.y = -Math.PI / 2;
  group.add(windowFrameTop);
  meshes.push(windowFrameTop);

  const windowFrameBottom = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 1.5), pictureFrameMat);
  windowFrameBottom.position.set(135.96, 0.86, 2);
  windowFrameBottom.rotation.y = -Math.PI / 2;
  group.add(windowFrameBottom);
  meshes.push(windowFrameBottom);

  const windowFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.08), pictureFrameMat);
  windowFrameLeft.position.set(135.96, 1.5, 1.24);
  windowFrameLeft.rotation.y = -Math.PI / 2;
  group.add(windowFrameLeft);
  meshes.push(windowFrameLeft);

  const windowFrameRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.08), pictureFrameMat);
  windowFrameRight.position.set(135.96, 1.5, 2.76);
  windowFrameRight.rotation.y = -Math.PI / 2;
  group.add(windowFrameRight);
  meshes.push(windowFrameRight);

  // ── 挂画（南墙，两幅） ──
  const picturePositions = [{ x: 125, z: 7.9 }, { x: 131, z: 7.9 }];
  picturePositions.forEach((pos) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.04), pictureFrameMat);
    frame.position.set(pos.x, 1.5, pos.z);
    group.add(frame);
    meshes.push(frame);

    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.48), pictureCanvasMat);
    canvas.position.set(pos.x, 1.5, pos.z - 0.02);
    group.add(canvas);
    meshes.push(canvas);
  });

  // ── 绿植 ──
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.25, 12), potMat);
  pot.position.set(134.5, 0.125, -2);
  group.add(pot);
  meshes.push(pot);

  const leafPositions = [
    { x: 134.5, y: 0.35, z: -2, s: 0.12 },
    { x: 134.65, y: 0.45, z: -1.9, s: 0.1 },
    { x: 134.35, y: 0.45, z: -2.1, s: 0.1 },
    { x: 134.5, y: 0.55, z: -2.05, s: 0.09 },
  ];
  leafPositions.forEach((lp) => {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), leafMat);
    leaf.position.set(lp.x, lp.y, lp.z);
    leaf.rotation.x = -Math.PI / 6;
    leaf.scale.setScalar(lp.s);
    group.add(leaf);
    meshes.push(leaf);
  });

  // ── 三盏 PointLight ──
  const ceilingLight = new THREE.PointLight(0xffe6c0, 42, 16, 2);
  ceilingLight.position.set(128, 2.72, 0);
  group.add(ceilingLight);
  lights.push(ceilingLight);

  const floorLampLight = new THREE.PointLight(0xffe6c0, 18, 10, 2);
  floorLampLight.position.set(130, 1.65, -3);
  group.add(floorLampLight);
  lights.push(floorLampLight);

  const windowFillLight = new THREE.PointLight(0xffe6c0, 12, 9, 2);
  windowFillLight.position.set(134.5, 1.5, 3);
  group.add(windowFillLight);
  lights.push(windowFillLight);

  // ── 同学 ──
  let headY = 1.585;
  /** 头的半径：程序化模型在 userData.faceRig 里报了真值（0.165），glb 只能按旧估计值 0.135 猜。 */
  let headR = 0.165;
  let mate = null;
  let mateEyes = null;
  let mateHalos = null;
  let mateEyeLight = null;
  let mateFangs = null;
  let mateFangMat = null;
  let mateMouthMesh = null;
  let mateMouthGeo = null;
  let mateMouthParams = null;
  let mateReady = false;
  /** 红眼 / 尖牙 / 模型三者的透明度。换模型时 userData 会跟着旧组一起丢，所以留在外面。 */
  let mateOpacity = 1;
  /** 当前揭示进度。模型是异步加载的，可能 setReveal 先到、眼睛后到，
   *  所以进度存成状态，onReady 里再补一次，否则调试直接跳「揭示」会看不到眼睛。 */
  let revealK = 0;
  /** 咧嘴程度 0–1。和 revealK 是两个独立通道：先把红眼在脸上亮起来，再让嘴裂开。 */
  let mouthOpen = 0;

  /** 嘴在头心下方 0.052 m。闭嘴是一道 0.045 rad 的缝，咧到最大 0.28 rad（半高）。 */
  const MOUTH_DY = -0.052;
  const MOUTH_THETA_CLOSED = 0.045;
  const MOUTH_THETA_OPEN = 0.28;
  const MOUTH_PHI_CLOSED = 0.34;
  const MOUTH_PHI_OPEN = 0.62;
  /**
   * 嘴角相对嘴心抬高多少米（第二十一轮：把同学的嘴做成「和怪物一样笑着的、露出尖牙」）。
   * 嘴的半幅约 0.093 m，抬 0.030 ≈ 1/3 个半幅；怪物那口是 GRIN_LIFT/GRIN_HALF = 0.435，
   * 同一量级。这条笑弧是**静态**的：只由横向坐标决定，跟咧嘴程度 m 无关，
   * 所以「五官全程不动、只有不透明度在变」这条老约束照旧成立。
   */
  const GRIN_LIFT = 0.030;
  /** 牙最多排到笑弧的哪个横向位置（0 = 嘴心，1 = 嘴角）。留一点余量，牙才不顶到唇角上。 */
  const GRIN_S_MAX = 0.96;

  /**
   * 把 revealK / mouthOpen 落到几何与材质上。
   *
   * 「不要从下方升起」是这一轮的硬约束，所以本函数**不移动任何五官**：只改
   * visible / opacity / 灯强度；嘴的裂开改的是顶点角度（见 applyMouth），
   * 顶点沿着半径 Rc 的球面走，位置也不动，动的只是「那道缝有多高」。
   */
  function applyReveal() {
    const k = clamp(revealK, 0, 1);
    const on = k > 0.004;
    if (mateEyes) {
      // 两只眼睛各一份材质（要单独压亮度），两边都得改
      for (const eye of mateEyes) {
        eye.visible = on;
        eye.material.opacity = k;
        eye.material.transparent = k < 0.995;
      }
    }
    if (mateHalos) {
      for (const halo of mateHalos) {
        halo.visible = on;
        halo.material.opacity = halo.userData.baseOpacity * k * k;
      }
    }
    if (mateEyeLight) mateEyeLight.intensity = 7.5 * k * k;
    applyMouth();
  }

  /** 张嘴：重算嘴补片的角度 + 让尖牙在嘴裂到 25% 之后淡入。 */
  function applyMouth() {
    const m = clamp(mouthOpen, 0, 1);
    if (mateMouthGeo && mateMouthParams) {
      const halfTheta = MOUTH_THETA_CLOSED + (MOUTH_THETA_OPEN - MOUTH_THETA_CLOSED) * m;
      const halfPhi = MOUTH_PHI_CLOSED + (MOUTH_PHI_OPEN - MOUTH_PHI_CLOSED) * m;
      rewriteMouth(mateMouthParams, mateMouthGeo, halfTheta, halfPhi);
    }
    if (mateFangs) {
      // 牙不是被「切开」的，是嘴裂开之后才淡入的 —— 看起来就是随咧嘴露出来。
      // 第十九轮把淡入推迟到 45%（原来 25%）：牙长 0.042，嘴缝得咧到够高才塞得下，
      // 早露出来会浮在嘴唇上。牙本身一点都不动（位置、缩放全固定），只管透明度。
      const a = clamp((m - 0.45) / 0.40, 0, 1);
      const op = a * a * (3 - 2 * a);
      mateFangs.visible = op > 0.01;
      if (mateFangMat) {
        mateFangMat.opacity = op;
        mateFangMat.transparent = op < 0.995;
      }
    }
  }

  /**
   * 笑弧：横向坐标 s（0 = 嘴心，±1 = 嘴角）处的中心线角度 θ。
   * θ 越小离额头越近（y = Rc·cosθ），所以「抬高 GRIN_LIFT 米」= θ 减去
   * GRIN_LIFT / (Rc·sinθc)。θc 处的半径 Rc·sinθc 就是嘴这一带的「米/弧度」换算率。
   */
  function grinThetaAt(s, Rc, thetaC) {
    return thetaC - (GRIN_LIFT * s * s) / (Rc * Math.sin(thetaC));
  }

  /**
   * 把嘴那层弧形补片的顶点重算到笑弧上。顶点永远在半径 Rc 的球面（比头皮高 2%，
   * 约 3 mm）上，所以裂开时既不会陷进脸里，也不会浮到脸前面。
   *
   * 第二十一轮把「一道水平的缝」改成「一道向上弯的笑弧」：
   *  - 横向坐标 s = (φ − phiC)/MOUTH_PHI_OPEN ∈ [−1, 1]，0 是嘴心、±1 是嘴角；
   *  - 中心线 θ(s) 见 grinThetaAt，嘴角比嘴心高 GRIN_LIFT 米；
   *  - 缝的半高仍按弧度取 halfTheta，沿弧线处处一样厚；halfPhi 决定这道笑纹
   *    往两边抿到多远（闭嘴时只抿到 s ≈ ±0.55，咧到底才铺满 s = ±1）。
   * 注意 s 的分母用的是 MOUTH_PHI_OPEN 这个**常量**，所以弧线的弯曲程度不随 m 变，
   * 变的只是「这道笑纹画多长、多厚」。
   */
  function rewriteMouth(params, geo, halfTheta, halfPhi) {
    const pos = geo.attributes.position;
    const { Rc, thetaC, phiC, phiSeg, thetaSeg } = params;
    let i = 0;
    for (let j = 0; j <= phiSeg; j += 1) {
      // 先用常量的 2·MOUTH_PHI_OPEN 归一，再把 s 还原成真实角度
      const s = (2 * halfPhi * j) / phiSeg / MOUTH_PHI_OPEN - halfPhi / MOUTH_PHI_OPEN;
      const phi = phiC + s * MOUTH_PHI_OPEN;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      const thMid = grinThetaAt(s, Rc, thetaC);
      for (let k = 0; k <= thetaSeg; k += 1) {
        const th = thMid - halfTheta + (2 * halfTheta * k) / thetaSeg;
        const st = Math.sin(th);
        // three.js 的球面参数：x = -r·cosφ·sinθ，y = r·cosθ，z = r·sinφ·sinθ
        pos.setXYZ(i, -Rc * cp * st, Rc * Math.cos(th), Rc * sp * st);
        i += 1;
      }
    }
    pos.needsUpdate = true;
  }

  /**
   * 红眼 / 眼灯 / 嘴 / 尖牙：挂在「当前」这个 mate 上，换模型会整组重建。
   *
   * 第十九轮把五官改成「照着第五关那两件怪物模型长」，不再是另画一套：
   *  - 眼睛抄 assets/models/eyes_v01.glb：两颗自发光 UV 球、没有瞳孔也没有眼睑，
   *    材质 Eye_Glow 的 #ff2030 直接当 MeshBasicMaterial 用（toneMapped:false）——
   *    所以同学的眼睛看起来就是「怪物那种裸眼球」，而不是人类的眼白加瞳孔；
   *  - 眼眶抄 face_v01.glb 的 Face_Charcoal #0d0809 / roughness 1.0，当烧焦的眶缘；
   *  - 尖牙刷 assets/models/teeth_v01.glb：上 9 下 8、错开半齿、牙尖收到牙根的 52%、
   *    脏色 Tooth_Stain #4a2a20 往牙尖提亮、固定种子 20251107。
   *
   * 第十八轮定下的「不要从下方升起」照旧成立，四条位置全部固定：
   *  - 眼眶 / 红点 / 光晕 / 眼灯只改 visible、opacity、灯强度；
   *  - 嘴的裂开靠顶点角度（见 applyMouth），顶点沿半径 Rc 的球面走；
   *  - 牙是随嘴裂开淡入的（45% 之后），位置、缩放全程固定，一动都不动。
   * 位置全由 headY / headR 推出来，所以只要脚底在原点、正面朝 +Z，
   * 换模型时五官自动跟着走（程序化模型会通过 faceRig 报出真实的头心与半径）。
   */
  function buildFaceRig() {
    const Rc = headR * 1.02;
    const tag = (obj) => {
      obj.userData.rig = true;
      return obj;
    };
    /** 头皮在 (x, dy) 处的 z（本地坐标，头心在 (0, headY, 0)）。 */
    const surfaceZ = (x, dy) => {
      const r2 = headR * headR - x * x - dy * dy;
      return r2 > 0 ? Math.sqrt(r2) : 0;
    };

    // —— 眼眶 + 红点 + 两层光晕 ——
    // 眼位沿用第十八轮量出来的 (±0.052, +0.015)，保证和脸上别的特征对得上；
    // 半径按 eyes_v01 的「眼球占头宽」比例取 11.5%，比原来那两颗小红点大一圈，
    // 才能看出是「眼球鼓在眶外」，而不是两个像素点。
    const eyeDx = 0.052;
    const eyeDy = 0.015;
    const eyeR = headR * 0.115;
    // 左右不完全对称：球径、高度、前后各差一点点，避免看起来像镜子里的同一只眼
    const eyeSpecs = [
      { sx: -eyeDx, r: eyeR * 1.05, dy: eyeDy + 0.0015, dz: 0.0012, tilt: 0.18 },
      { sx: eyeDx, r: eyeR * 0.96, dy: eyeDy - 0.0012, dz: -0.0010, tilt: -0.12 },
    ];
    // 眶缘：Face_Charcoal 那种几乎不反光的炭黑，压扁一圈兜住眼球
    const socketGeo = new THREE.SphereGeometry(1, 14, 12);
    const socketMat = new THREE.MeshStandardMaterial({ color: 0x0d0809, roughness: 1.0, metalness: 0 });
    mateEyes = [];
    mateHalos = [];
    for (const spec of eyeSpecs) {
      const r = spec.r;
      const socket = new THREE.Mesh(socketGeo, socketMat);
      socket.position.set(spec.sx, headY + spec.dy, surfaceZ(spec.sx, spec.dy) - r * 0.35);
      socket.scale.set(r * 1.9, r * 1.7, r * 0.72);
      socket.rotation.z = spec.tilt;
      mate.add(tag(socket));

      // 眼球：面比头皮高 30% 个球径，剩下的埋在眶里 —— 和怪物一样是鼓出来的
      const eyeZ = surfaceZ(spec.sx, spec.dy) + r * 0.30 + spec.dz;
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0, toneMapped: false }),
      );
      eye.position.set(spec.sx, headY + spec.dy, eyeZ);
      eye.visible = false;
      mate.add(tag(eye));
      mateEyes.push(eye);

      for (const halo of [{ k: 1.7, base: 0.15 }, { k: 2.8, base: 0.07 }]) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(r * halo.k, 12, 10),
          new THREE.MeshBasicMaterial({
            color: 0xff2030,
            transparent: true,
            opacity: 0,
            fog: false,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        mesh.userData.baseOpacity = halo.base;
        mesh.position.set(spec.sx, headY + spec.dy, eyeZ - r * 0.32);
        mesh.visible = false;
        mate.add(tag(mesh));
        mateHalos.push(mesh);
      }
    }

    // —— 眼灯：照亮半张脸，是「红光在脸上逐渐亮起」的另一半 ——
    const eyeLight = new THREE.PointLight(0xff2030, 0, 1.8, 2);
    eyeLight.position.set(0, headY - 0.004, headR * 1.7);
    mate.add(tag(eyeLight));
    mateEyeLight = eyeLight;

    // —— 嘴：一层贴在头皮外 2% 的弧形黑补片，裂开靠改顶点角度 ——
    mateMouthParams = {
      Rc,
      thetaC: Math.acos(clamp(MOUTH_DY / Rc, -1, 1)),
      phiC: Math.PI / 2, // 正对 +Z
      phiSeg: 24,
      thetaSeg: 6,
    };
    const { phiSeg, thetaSeg } = mateMouthParams;
    mateMouthGeo = new THREE.BufferGeometry();
    mateMouthGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((phiSeg + 1) * (thetaSeg + 1) * 3), 3),
    );
    const index = [];
    for (let j = 0; j < phiSeg; j += 1) {
      for (let k = 0; k < thetaSeg; k += 1) {
        const a = j * (thetaSeg + 1) + k;
        const b = a + thetaSeg + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    mateMouthGeo.setIndex(index);
    // 顶点每帧都会变，包围球按最大状态定死，省得被视锥裁掉半张嘴
    mateMouthGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Rc * 1.05);
    mateMouthMesh = new THREE.Mesh(
      mateMouthGeo,
      new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide, toneMapped: false }),
    );
    mateMouthMesh.position.set(0, headY, 0);
    mateMouthMesh.frustumCulled = false;
    mate.add(tag(mateMouthMesh));

    // —— 尖牙：照 assets/models/teeth_v01.glb 的排布重做 ——
    // 原模型：17 颗（上 9 下 8）、同一行齿距 0.103 m、下排错开半个齿距 0.0515、
    // 整排宽 0.9000、唇舌厚 0.0587、牙尖收到牙根的 52%（是钝的，不是针）、
    // 材质 Tooth_Stain #4a2a20、粗糙度 0.94、顶点色 0.45–1.00、种子 20251107。
    // 这里按「嘴宽 0.194 / 原模型 0.900」缩到 21.6%：齿距 0.0222、牙长 0.042、
    // 根半径 0.0097、齿厚 0.0132；牙根定在嘴心上下 0.038（比嘴咧到底的半高 0.045
    // 还收 7 mm），所以整排牙永远藏在唇线以内，不会在嘴半开时浮到嘴唇上。
    const FANG_PITCH = 0.0222;
    const FANG_LEN = 0.042;
    const FANG_ROOT = 0.038;
    const FANG_R = 0.0097;
    const FANG_TIP_RATIO = 0.52;
    const FANG_DEPTH = 0.68; // 圆柱在 z 上压扁，对应原模型的 0.0587/0.103
    const FANG_ROOT_COLOR = new THREE.Color(0x341c15); // Tooth_Stain 的牙根脏色
    const FANG_TIP_COLOR = new THREE.Color(0xd7cab2); // 露在外面那一截被磨亮
    const rand = seededRandom(20251107);

    // 牙用不受光的材质（和游戏里渲染怪物那 17 颗牙一致）：不管躲多黑，咧嘴就有白森森一排
    mateFangMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    /** 一颗牙：8 边柱代替原模型 10 边超椭圆的放样，牙根 → 牙尖套一层脏色渐变。 */
    const makeTooth = (rootAtTop, rRoot, len, tint) => {
      const rTip = rRoot * FANG_TIP_RATIO;
      const geo = new THREE.CylinderGeometry(
        rootAtTop ? rRoot : rTip,
        rootAtTop ? rTip : rRoot,
        len,
        8,
        1,
        false,
      );
      geo.scale(1, 1, FANG_DEPTH);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i += 1) {
        // 0 = 几何顶端，1 = 底端；再换算成「离牙根多远」
        const u = (len / 2 - pos.getY(i)) / len;
        const tRootToTip = rootAtTop ? u : 1 - u;
        c.copy(FANG_ROOT_COLOR).lerp(FANG_TIP_COLOR, tRootToTip).multiplyScalar(tint);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    };

    const fangGroup = new THREE.Group();
    // 整组挂在「嘴心」上：牙的坐标都是相对嘴心的 dy，于是张嘴时只压缩纵向、不上下平移
    fangGroup.position.set(0, headY + MOUTH_DY, 0);
    /**
     * 笑弧上的一点：s 横向、dy 相对弧线的竖直偏移（米，+ 朝额头）→ 球面上的 {theta, phi}。
     * 竖直偏移按「弧线自己那一列的半径 Rc·sinθ」换算成角度，所以排在嘴角的牙也跟着弧线走。
     */
    const grinAngles = (s, dy = 0) => {
      const th0 = grinThetaAt(s, Rc, mateMouthParams.thetaC);
      return { theta: th0 - dy / (Rc * Math.sin(th0)), phi: Math.PI / 2 + s * MOUTH_PHI_OPEN };
    };
    /** 给定笑弧上的横向位置 x（米），反解出 s。x(s) 在 [−GRIN_S_MAX, GRIN_S_MAX] 上单调，二分即可。 */
    const grinSAtX = (x, dy = 0) => {
      let lo = -GRIN_S_MAX;
      let hi = GRIN_S_MAX;
      for (let it = 0; it < 28; it += 1) {
        const mid = (lo + hi) / 2;
        const { theta, phi } = grinAngles(mid, dy);
        if (-Rc * Math.cos(phi) * Math.sin(theta) < x) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    /**
     * 一颗牙：位置由笑弧决定（第 s 列、弧线上方/下方 centreDy 米），牙本身不缩不转。
     * 「咧嘴」时两排牙被嘴角一起带着往上走，看起来就是一口笑牙。
     */
    const toothAt = (x, rootAtTop) => {
      const len = FANG_LEN * (0.88 + 0.24 * rand());
      const rRoot = FANG_R * (0.92 + 0.16 * rand());
      const tint = 0.72 + 0.34 * rand();
      const mesh = new THREE.Mesh(makeTooth(rootAtTop, rRoot, len, tint), mateFangMat);
      // 上一排牙根在弧线上方 +FANG_ROOT、往下长；下一排牙根在弧线下方 −FANG_ROOT、往上长
      const centreDy = (rootAtTop ? FANG_ROOT - len / 2 : -FANG_ROOT + len / 2) + (rand() - 0.5) * 0.002;
      const jx = x + (rand() - 0.5) * FANG_PITCH * 0.18;
      // 牙长在笑弧上：先按 x 找到它属于哪一列，再由 θ 解出球面坐标，最后整体往脸外挪 3 mm
      const { theta, phi } = grinAngles(grinSAtX(jx, centreDy), centreDy);
      const st = Math.sin(theta);
      mesh.position.set(
        -Rc * Math.cos(phi) * st,
        Rc * Math.cos(theta) - MOUTH_DY, // 挂点在嘴心，所以要减掉 MOUTH_DY
        Rc * Math.sin(phi) * st + 0.003,
      );
      mesh.rotation.z = (rand() - 0.5) * 0.10;
      fangGroup.add(tag(mesh));
    };
    for (let i = 0; i < 9; i += 1) toothAt((i - 4) * FANG_PITCH, true); // 上 9：奇数颗，正中一颗对上唇
    for (let i = 0; i < 8; i += 1) toothAt((i - 3.5) * FANG_PITCH, false); // 下 8：偶数颗，天然错开半齿
    fangGroup.visible = false;
    mate.add(tag(fangGroup));
    mateFangs = fangGroup;
  }

  /** 释放一棵子树的几何与材质（模型换掉时用，别把内存留在那儿）。 */
  function disposeSubtree(root) {
    if (!root) return;
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of list) m.dispose();
      }
    });
  }

  /** 记下当前模型的位置/朝向/可见性，换模型后照原样摆回去。 */
  function snapshotMate() {
    if (!mate) return null;
    return {
      visible: mate.visible,
      x: mate.position.x,
      y: mate.position.y,
      z: mate.position.z,
      yaw: mate.rotation.y,
    };
  }

  let mateModelToken = 0;
  let mateReadyPending = false;

  /**
   * 建同学模型（换模型时也走这里）。snapshot 为空表示按出厂状态摆：
   * 藏在门外、背对门、不可见。
   */
  function buildMateModel(snapshot) {
    const token = ++mateModelToken;
    if (mate) {
      group.remove(mate);
      disposeSubtree(mate);
      // 旧组里的数组是 m2 填的，别让它们指向释放过的对象
      mate.userData.legs = [];
      mate.userData.arms = [];
      mate.userData.materials = [];
      mate = null;
    }
    mateEyes = null;
    mateHalos = null;
    mateEyeLight = null;
    mateFangs = null;
    mateFangMat = null;
    mateMouthMesh = null;
    mateMouthGeo = null;
    mateMouthParams = null;
    mateReady = false;

    /** 模型就位（glb 是异步的，程序化是同步的）：量头高、挂五官、补状态。 */
    const finish = () => {
      if (token !== mateModelToken || !mate) return;
      mateReady = true;

      const box = new THREE.Box3().setFromObject(mate);
      const rig = mate.userData.faceRig;
      if (rig && Number.isFinite(rig.headY) && Number.isFinite(rig.headR)) {
        // 程序化模型自己报了头心高度和半径（0.165），五官按这个装才不会埋进球里 ——
        // 旧版本把眼睛写死在 z=0.13，而那颗球的表面在 z≈0.156，红点整颗陷在头里。
        headY = rig.headY;
        headR = rig.headR;
      } else {
        headY = Number.isFinite(box.max.y) && box.max.y > 0.8 ? box.max.y - 0.16 : 1.585;
        headR = 0.135;
        if (!Number.isFinite(box.max.y) || box.max.y <= 0.8) {
          console.warn('同学 GLB 头部高度回退到 1.585');
        }
      }

      buildFaceRig();
      // 补一次揭示状态：模型加载慢于演出时会漏掉 setReveal
      applyReveal();
      if (mateOpacity < 0.99) applyMateOpacity(mateOpacity);
    };

    const built = createClassmate(THREE, {
      onReady: () => {
        if (token !== mateModelToken) return;
        // 程序化模型是同步回调的，那时 mate 还没赋值，交给下面补一次
        if (!mate) { mateReadyPending = true; return; }
        finish();
      },
    });

    mate = built;
    if (mateReadyPending) {
      mateReadyPending = false;
      finish();
    }

    if (snapshot) {
      mate.visible = snapshot.visible;
      mate.position.set(snapshot.x, snapshot.y, snapshot.z);
      mate.rotation.y = snapshot.yaw;
    } else {
      mate.visible = false;
      mate.rotation.y = -Math.PI / 2;
      mate.position.set(SAFEHOUSE.mateEntry.x, 0, SAFEHOUSE.mateEntry.z);
    }
    group.add(mate);
  }

  /**
   * 换同学模型（运行时接口）。url 给 PROCEDURAL_MATE（'proc'）就是程序化那套。
   * 位置 / 朝向 / 可见性 / 透明度都保持不动，只换皮——换完重新量头高、重挂红眼尖牙。
   */
  function applyMateModel(url, options = {}) {
    const snapshot = snapshotMate();
    const info = configureMateModel(url, options);
    buildMateModel(snapshot);
    return info;
  }

  buildMateModel(null);

  // ── 状态变量 ──
  let mateTargetYaw = -Math.PI / 2;
  let mateWalkPhase = 0;
  let mateLungeK = 0;
  /** 飞扑落点（由 game.js 按镜头视线算），null = 用旧的固定横向偏移 */
  let mateLungeTo = null;

  // 归一化到 (-π, π]
  function wrapAngle(a) {
    let v = a;
    while (v > Math.PI) v -= Math.PI * 2;
    while (v < -Math.PI) v += Math.PI * 2;
    return v;
  }

  /** 只把透明度落到模型材质上（红眼和尖牙不跟着淡，它们要自己亮）。 */
  function applyMateOpacity(alpha) {
    // m2 把材质收集在 userData.materials 里，走它这份清单就不会误伤红眼和尖牙
    if (!mate) return;
    mate.userData.opacity = alpha;
    const list = mate.userData.materials;
    if (list && list.length > 0) {
      for (const mat of list) {
        mat.transparent = alpha < 0.99;
        mat.opacity = alpha;
      }
      return;
    }
    mate.traverse((child) => {
      // 五官自己管亮度（userData.rig 标记过），这里只淡模型本体
      if (child.isMesh && child.material && !child.userData.rig) {
        child.material.transparent = alpha < 0.99;
        child.material.opacity = alpha;
      }
    });
  }

  return {
    group,

    show() {
      group.visible = true;
    },

    hide() {
      group.visible = false;
    },

    setVisible(on) {
      if (on) this.show(); else this.hide();
    },

    openDoor(to) {
      doorPivot.rotation.y = clamp(to, 0, 1.92);
    },

    doorAngle() {
      return doorPivot.rotation.y;
    },

    reset() {
      doorPivot.rotation.y = 0;
      mate.position.set(SAFEHOUSE.mateEntry.x, 0, SAFEHOUSE.mateEntry.z);
      mate.rotation.y = -Math.PI / 2;
      mateTargetYaw = -Math.PI / 2;
      mateWalkPhase = 0;
      mate.visible = false;
      mateLungeK = 0;
      mateLungeTo = null;
      // 嘴角 / 红眼 / 眼灯全部交给 applyReveal（k=0、嘴也合上），不再手动摆一遍
      this.setReveal(0, 0);
      this.setMateOpacity(1);
    },

    setMateVisible(on) {
      mate.visible = on;
    },

    setMateOpacity(a) {
      mateOpacity = clamp(a, 0, 1);
      applyMateOpacity(mateOpacity);
    },

    mateYaw() {
      return mate.rotation.y;
    },

    setMateYaw(y) {
      mateTargetYaw = y;
      mate.rotation.y = y;
    },

    walkMate(dt, speed) {
      const target = SAFEHOUSE.mateStation;
      const dx = target.x - mate.position.x;
      const dz = target.z - mate.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.02) {
        // 到位就站直，别留着走路时的上下起伏
        mate.position.y = 0;
        if (mate.userData.legs && mate.userData.legs.length >= 2) {
          mate.userData.legs[0].rotation.x = 0;
          mate.userData.legs[1].rotation.x = 0;
        }
        return 0;
      }

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const step = Math.min(speed * dt, dist);
      mate.position.x += dirX * step;
      mate.position.z += dirZ * step;

      // 朝行进方向转身（每秒最多转 6 弧度，别瞬间甩头）
      mateTargetYaw = Math.atan2(dirX, dirZ);
      const diff = wrapAngle(mateTargetYaw - mate.rotation.y);
      const turn = Math.min(Math.abs(diff), 6 * dt) * Math.sign(diff);
      mate.rotation.y = wrapAngle(mate.rotation.y + turn);

      // 走路起伏 + 腿摆，相位自己攒，不用 performance.now（要能暂停、要可复现）
      mateWalkPhase = (mateWalkPhase + step * 3.4) % (Math.PI * 2);
      mate.position.y = Math.abs(Math.sin(mateWalkPhase)) * 0.025;
      if (mate.userData.legs && mate.userData.legs.length >= 2) {
        const swing = Math.sin(mateWalkPhase) * 0.32;
        mate.userData.legs[0].rotation.x = swing;
        mate.userData.legs[1].rotation.x = -swing;
      }

      return Math.max(0, dist - step);
    },

    turnMate(yaw, rate, dt) {
      const diff = wrapAngle(yaw - mate.rotation.y);
      if (Math.abs(diff) < 0.02) {
        mate.rotation.y = yaw;
        return true;
      }
      const step = Math.min(Math.abs(diff), rate * dt) * Math.sign(diff);
      mate.rotation.y = wrapAngle(mate.rotation.y + step);
      return false;
    },

    /**
     * 揭示进度：k = 红眼亮到几成（0–1），mouth = 嘴裂到几成（0–1，可省略）。
     * 两个通道分开传，是因为演出上先亮红眼、再咧嘴（见 game.js 第 9 幕）。
     * 省略 mouth 时保持当前张嘴程度，老调用方 setReveal(k) 依旧是纯「亮眼」。
     */
    setReveal(k, mouth) {
      revealK = clamp(k, 0, 1);
      if (mouth !== undefined && mouth !== null) mouthOpen = clamp(mouth, 0, 1);
      applyReveal();
    },

    /** 只要咧嘴：不动红眼。 */
    setMouthOpen(mouth) {
      mouthOpen = clamp(mouth, 0, 1);
      applyMouth();
    },

    lunge(k, target) {
      mateLungeK = clamp(k, 0, 1);
      if (target) mateLungeTo = { x: target.x, y: target.y ?? 0, z: target.z };
      // 落点由 game.js 按「镜头视线」算好再传进来（见 mateLungePoint），
      // 这里只负责从站位走到那个点：横向、纵向、高度一起插值。
      const dst = mateLungeTo ?? { x: SAFEHOUSE.mateStation.x + 1.6, y: 0, z: SAFEHOUSE.mateStation.z };
      const from = SAFEHOUSE.mateStation;
      mate.position.x = from.x + (dst.x - from.x) * mateLungeK;
      mate.position.z = from.z + (dst.z - from.z) * mateLungeK;
      mate.position.y = Math.max(0, (dst.y - 0) * mateLungeK);
      // 贴到脸上的时候那盏红眼灯的照度会按平方反比炸掉（0.14 米处 ≈ 460），
      // 会把整帧糊成红色，所以扑过来的过程中把它压下去，只留两点红。
      // 现在灯的距离也收到 1.8 m、亮度 7.5，这个系数只是双保险。
      if (mateEyeLight) mateEyeLight.intensity = 7.5 * revealK * revealK * (1 - 0.85 * mateLungeK);
    },

    mateChestPoint() {
      return { x: mate.position.x, y: 1.25, z: mate.position.z };
    },

    /** 头部高度（眼睛所在的高度，GBL 量出来的）。飞扑落点靠它把脸放到视线上。 */
    headHeight() {
      return headY;
    },

    /**
     * 换同学模型。url 用 PROCEDURAL_MATE（'proc'）就是程序化那套，
     * 也可以给任意 glb 路径；options 同 m2.MATE_MODEL（scale / yawOffset / offsetY / hideMaterials）。
     * 当前的位置、朝向、可见性、透明度都不动，只换皮并重挂红眼尖牙。
     */
    setMateModel(url, options) {
      return applyMateModel(url, options);
    },

    /** 当前用的模型是什么、有没有加载完、自带的哪些五官被隐藏了。 */
    mateModelInfo() {
      return {
        ...mateModelConfig(),
        ready: mateReady,
        headY,
        headR,
        hidden: mate?.userData.hiddenMaterials ? [...mate.userData.hiddenMaterials] : [],
        legs: mate?.userData.legs?.length ?? 0,
        materials: mate?.userData.materials?.length ?? 0,
        eyes: mateEyes?.length ?? 0,
        halos: mateHalos?.length ?? 0,
        fangs: mateFangs?.children.length ?? 0,
        mouth: Boolean(mateMouthMesh),
        eyeLight: Boolean(mateEyeLight),
        reveal: revealK,
        mouthOpen,
      };
    },

    /** 把同学立刻摆到某个位置并站定（不走过去）：门内那一幕他是「已经在那儿」。 */
    placeMate(x, z, yaw) {
      mate.position.set(x, 0, z);
      mateWalkPhase = 0;
      if (yaw !== undefined) {
        mateTargetYaw = yaw;
        mate.rotation.y = yaw;
      }
      if (mate.userData.legs && mate.userData.legs.length >= 2) {
        mate.userData.legs[0].rotation.x = 0;
        mate.userData.legs[1].rotation.x = 0;
      }
    },

    update(dt) {
      // 小幅动画留空实现
    },

    dispose() {
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      lights.forEach((l) => {
        if (l.dispose) l.dispose();
      });
      scene.remove(group);
    },
  };
}

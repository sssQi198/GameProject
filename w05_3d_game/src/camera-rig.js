// 节点 2：程序化手持相机模型（第一人称相机下的手臂+相机模型，纯视觉）
import * as THREE from '../vendor/three.module.js';

/**
 * 手部姿态表。坐标在相机空间：+x 右、+y 上、-z 前（|z| = 离眼睛的距离）。
 *
 * 几何依据：不透明取景机身的窗口下沿，在深度 d 处位于 y = -0.602·d
 * （全屏 FOV 70 → 半高 0.7002d；窗口 inset 上下各 7%，下沿在中心线下方 86% 处）。
 * 于是：
 *   手顶（= group.y）低于这条线 → 被不透明机身整块挡掉，静止态看不见手（B3 的干净框保住了）；
 *   抬到这条线以上 → 手从框下沿"伸进画面"，动作直接落进眼睛里。
 *
 * 所以抬手/放下不需要切换 visible，也不会产生任何跳变：
 *   抬手 = 双手从腰侧（画面外）扫进画面 → 机身到位后双手沉到框下被机身吃掉；
 *   放下 = 双手先露一下头 → 随相机一起落出画面。
 *
 * 旧版真正的毛病在这里：drawing / lowering 两个状态【没有目标姿态】，
 * 于是 0.9 秒的过渡期里手是死的，所有动作都挤在状态切换的那一帧——
 * 这就是怎么调都像"抽一下"的结构原因。
 */
/* 只有两个"真实姿态"：腰侧 与 握持位。drawing / lowering 直接指向它们——
   因为它们是"正在过渡"的状态名，不是姿态。

   【2026-11-10 三次修订 · 为什么必须只留两个】
   上一版给 drawing / lowering 各配了独立姿态，观感立刻变成"两段式、中间停一下"：
   抬手 holstered→drawing 抬到最高，再 drawing→raised 又沉回去 108px。反向位移就是
   一个转折点：速度先归零再反着走，眼睛读到的必然是"动一下、停、再动一下"。
   放下虽然同向，但两段各自 easeInOut，接缝处速度同样归零，也是一次停顿。
   ⇒ 一个姿态到另一个姿态必须【一段补间走完】。
   ⇒ 副产物：drawing 与 raised 目标相同，切到 raised 时不会再起一段（见 setState 里的
     sameTarget 判断），抬手是完整的一段。 */
const POSE_RAISED = {
  // 握持位：手顶 y=-0.19，在 1080p 上露出约 65px —— 只从窗口下沿探出一截手背与手指，
  // 像"手在下面托着机器"，不再是一整双手摊在画面里（用户："把抬起后的手位置放低一点"）。
  // 这是"静止时看得到多少手"的唯一旋钮，每 0.01 约等于 20px：
  //   -0.19 ≈ 65px（现在）；-0.21 ≈ 24px（只露指尖）；-0.222 ≈ 0（全挡住，
  //   但那样放下时手已经在画面外，放下动作就看不见了）。
  // 注意这些读数对应窗口下沿 91.5%（--vf-inset-y: 8.5%）；改窗口大小要一起重算。
  p: [0.00, -0.19, -0.40],
  r: [-0.06, 0.00, 0.00],
};

const POSE_HOLSTERED = {
  // 腰侧：手顶 y=-0.44（深度 0.55）—— 远在屏幕下边框以外，完全看不见
  p: [0.34, -0.44, -0.55],
  r: [-0.55, 0.15, 0.08],
};

const POSE = {
  holstered: POSE_HOLSTERED,
  raised: POSE_RAISED,
  drawing: POSE_RAISED, // 抬起途中 = 直接奔握持位，中途不停
  lowering: POSE_HOLSTERED, // 放下途中 = 直接落回腰侧，中途不停
};

/**
 * 每个状态的过渡时长（秒）。必须和 game.js 里的 CAMERA_*_TIME 对上：
 * drawing 要短于 CAMERA_DRAW_TIME(0.45) —— 手先停稳，状态才切 raised；
 * lowering 等于 CAMERA_LOWER_TIME(0.4) —— 正好同步到位，切 holstered 时不用再补。
 *
 * 为什么不用指数平滑（1-exp(-10dt)）：
 * 指数平滑的速度与"剩余距离"成正比。手滑出画面这段路只剩两三毫米，
 * 剩余距离趋近 0 时速度也趋近 0——但那是渐近，实际效果是它两三帧就穿过去了。
 * 换句话说，不管系数调成多少，"手离开画面"都会像抽搐。固定时长 + 缓动
 * 才能让这段路真的花掉 0.2 秒，眼睛才追得上。
 */
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;

const TRANSITION = {
  // drawing 0.45 → 0.34：用户要求"动作进程加快一点"，让手先到位、取景框随后合拢。
  // 同时必须 < game.js 的 CAMERA_DRAW_TIME(0.45)，留出"手已停稳、状态才切 raised"的余量。
  drawing: 0.34,
  // raised 与 drawing 同目标，正常情况下不会启动新补间；留着是为了被打断时有个兜底时长。
  raised: 0.3,
  shooting: 0.35,
  // 与 game.js 的 CAMERA_LOWER_TIME 一致：0.4s 正好走完"握持位→腰侧"。
  lowering: 0.4,
  holstered: 0.4,
};

/**
 * 缓动曲线按方向选。为什么不能用同一条：
 * 这段行程只有两成露在取景窗里（腰侧 1151px → 握持位 893px，窗口下沿 1004px），
 * 也就是说八成的路程被不透明机身挡着。所以"哪一段路最快"必须挑：
 *   抬手 ease-out —— 最快的一瞬在最下面（看不见），进窗时已经开始收速，
 *                  手在窗口里的那 0.1 秒是"甩上来再停住"，读得清。
 *   放下 ease-in  —— 同理，最快的一瞬在最下面。手先在窗口里停一下，再加速掉出去。
 * 用 ease-in-out 会两头都慢、中间最快，最快点正好压在窗口下沿上——
 * 观感就是"手在机身后面憋了 0.2 秒，然后突然窜出来"。
 */
const EASE = { drawing: easeOut, lowering: easeIn };

export class CameraRig {
  constructor(camera) {
    // 创建根组并挂到 camera 下
    this.group = new THREE.Group();
    camera.add(this.group);

    // 材质
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7, metalness: 0.1 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5, metalness: 0.2 });
    const handMat = new THREE.MeshStandardMaterial({ color: 0x8a6f5c, roughness: 0.6, metalness: 0.0 });
    const forearmMat = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.65, metalness: 0.05 });

    // 机身
    this.cameraBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), bodyMat);
    this.group.add(this.cameraBody);

    // 镜头（圆柱，朝 -Z）
    const lensGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 16);
    this.lens = new THREE.Mesh(lensGeo, lensMat);
    this.lens.rotation.x = Math.PI / 2; // 圆柱默认朝 Y，转成朝 Z
    this.lens.position.z = -0.04; // 从机身向前伸出
    this.group.add(this.lens);

    // 右手
    this.rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.09), handMat);
    this.rightHand.position.set(0.06, -0.02, 0.02);
    this.group.add(this.rightHand);

    // 左手（镜像）
    this.leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.09), handMat);
    this.leftHand.position.set(-0.06, -0.02, 0.02);
    this.group.add(this.leftHand);

    // 右前臂（圆柱，从右下伸向相机）
    const forearmGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.18, 12);
    this.rightForearm = new THREE.Mesh(forearmGeo, forearmMat);
    this.rightForearm.position.set(0.08, -0.08, 0.06);
    this.rightForearm.rotation.x = -0.3;
    this.group.add(this.rightForearm);

    // 左前臂（镜像）
    this.leftForearm = new THREE.Mesh(forearmGeo, forearmMat);
    this.leftForearm.position.set(-0.08, -0.08, 0.06);
    this.leftForearm.rotation.x = -0.3;
    this.group.add(this.leftForearm);

    // 初始隐藏
    this.group.visible = false;

    // 是否额外画出 3D 的"相机机身 + 镜头"。
    // false（默认）：只留手和前臂。理由不变——不透明取景机身已经占满整条屏幕边缘，
    //   再叠一个暖棕色的 3D 机身就成了"一台机器两种材质"。
    // true：连机身一起画，回到 2026-11-10 之前的旧观感。
    // 手/前臂【不受】这个开关影响：它们是"抬手/放下"唯一的动作载体，
    // 而且靠机身遮挡来隐藏，细节见 setState 上方那段注释。
    this.showRigWhenRaised = false;

    // 状态相关
    this.currentState = 'none';
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
    this.recoil = 0;

    // 过渡状态：起点 / 终点 + 已用时间。update() 里按固定时长插值。
    this.fromPos = new THREE.Vector3();
    this.toPos = new THREE.Vector3();
    this.fromRot = new THREE.Euler();
    this.toRot = new THREE.Euler();
    this.tweenT = 0;
    this.dur = 0;
    this.ease = easeInOut;

    // 初始化目标姿态为 holstered
    this._setTargetPose('holstered');
    // 一开始就摆到腰侧并隐藏：Three.js 里 Group.visible 默认是 true，
    // 不显式隐藏的话，第一次拿出相机前那几帧手会停在 (0,0,0)（就在镜头平面上）。
    this._applyPose('holstered');
    this.group.visible = false;
  }

  _setTargetPose(state) {
    const pose = POSE[state];
    if (!pose) return; // shooting 沿用 raised 的目标，只加后坐
    this.targetPosition.set(pose.p[0], pose.p[1], pose.p[2]);
    this.targetRotation.set(pose.r[0], pose.r[1], pose.r[2]);
  }

  /** 直接把 group 摆到某个姿态（不插值），只用于隐藏 / 首次拿起时的对位。 */
  _applyPose(name) {
    const pose = POSE[name];
    if (!pose) return;
    this.group.position.set(pose.p[0], pose.p[1], pose.p[2]);
    this.group.rotation.set(pose.r[0], pose.r[1], pose.r[2]);
  }

  /** 以"当前实际位置"为起点，重新计一段过渡。 */
  _beginTransition(state) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.fromPos.copy(this.group.position);
    this.fromRot.copy(this.group.rotation);
    this.toPos.copy(this.targetPosition);
    this.toRot.copy(this.targetRotation);
    this.tweenT = 0;
    // 减弱动画模式不再瞬移——瞬移的观感就是"这双手从来没动过"。
    // 只把时长压到 55%，动作还在，只是更快。
    this.dur = (TRANSITION[state] ?? 0.3) * (reduced ? 0.55 : 1);
    this.ease = EASE[state] ?? easeInOut;
  }

  setState(state) {
    // 判据必须是"上一帧是否可见"，不能用 currentState === 'none'。
    // 反例（真实 bug）：lowering 期间 rig 是隐藏的，0.4s 后切 holstered 时 visible 变 true，
    // 但上一帧的 state 是 'lowering' → 旧判据不成立 → 它会先出现在上一个姿态（raised，
    // 就在画面正下方、肉眼可见）再滑向腰侧，观感是"放下相机时手抽一下再落下"。
    const wasHidden = !this.group.visible;
    this.currentState = state;

    // 3D 机身 + 镜头由开关控制（默认关：只留手，避免"一台机器两种材质"）。
    // 手/前臂不受影响，靠下面的姿态表 + 不透明机身遮挡来显隐。
    this.cameraBody.visible = this.showRigWhenRaised;
    this.lens.visible = this.showRigWhenRaised;

    if (state === 'none') {
      // 隐藏前先把姿态归到腰侧、并把补间标成"已完成"：
      // 否则 group 停在旧位置（初始是 0,0,0＝镜头正前方），下次拿出相机就从画面中央滑出来。
      this._setTargetPose('holstered');
      this._applyPose('holstered');
      this.fromPos.copy(this.targetPosition);
      this.fromRot.copy(this.targetRotation);
      this.toPos.copy(this.targetPosition);
      this.toRot.copy(this.targetRotation);
      this.tweenT = 0;
      this.dur = 0;
      this.group.visible = false;
      return;
    }

    // 两个真实姿态直接指向状态名，这里不会有"没有目标姿态"的状态了。
    this._setTargetPose(state);
    if (state === 'shooting') this.recoil = 1;

    // 相机在手上就一直挂着：静止态的手只从窗口下沿露出约 109px，剩下全被不透明机身挡住。
    // 所以不用在这里开关 visible，也就没有跳变。
    this.group.visible = true;

    // 从不可见到可见（第一次拿到相机）：先落到腰侧当起点，抬手动作才是完整的。
    if (wasHidden) this._applyPose('holstered');

    // 【不要再起一段补间】目标没变、而上一段还在跑 —— drawing→raised、raised→shooting
    // 都属于这种情况。重新起一段会让缓动从头再来：手正抬到一半时速度突然归零再重新
    // 加速，这就是"两段式、中间停一下"的直接原因。目标没变就让它跑完。
    const sameTarget = this.toPos.distanceToSquared(this.targetPosition) < 1e-10;
    if (sameTarget && this.tweenT < this.dur) return;

    // 起点取"当前实际位置"，所以被打断的过渡也能无缝接上。
    this._beginTransition(state);
  }

  update(dt) {
    if (this.currentState === 'none') {
      return;
    }

    // 后坐力衰减：每帧都跑，和过渡互不干扰（叠加在插值结果之上）
    this.recoil *= Math.exp(-9 * dt);
    const recoilZ = 0.03 * this.recoil;
    const recoilRotX = -0.08 * this.recoil;

    // 固定时长 + 按方向选的缓动（见 EASE）。p 只增不减，所以过渡一定是单调的：
    // 不会出现"到点了再往回弹一下"。
    this.tweenT = Math.min(this.tweenT + dt, this.dur);
    const p = this.dur > 0 ? this.tweenT / this.dur : 1;
    const e = this.ease(p);

    this.group.position.lerpVectors(this.fromPos, this.toPos, e);
    this.group.position.z += recoilZ;

    this.group.rotation.set(
      this.fromRot.x + (this.toRot.x - this.fromRot.x) * e + recoilRotX,
      this.fromRot.y + (this.toRot.y - this.fromRot.y) * e,
      this.fromRot.z + (this.toRot.z - this.fromRot.z) * e
    );
  }
}

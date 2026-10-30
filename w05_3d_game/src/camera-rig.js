// 节点 2：程序化手持相机模型（第一人称相机下的手臂+相机模型，纯视觉）
import * as THREE from '../vendor/three.module.js';

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

    // 状态相关
    this.currentState = 'none';
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
    this.recoil = 0;

    // 初始化目标姿态为 holstered
    this._setTargetPose('holstered');
  }

  _setTargetPose(state) {
    if (state === 'holstered') {
      this.targetPosition.set(0.30, -0.40, -0.55);
      this.targetRotation.set(-0.55, 0.15, 0.08);
    } else if (state === 'raised') {
      this.targetPosition.set(0.0, -0.16, -0.34);
      this.targetRotation.set(-0.06, 0, 0);
    }
    // drawing/lowering 不改变目标姿态，由 game 状态时长驱动
  }

  setState(state) {
    const wasHidden = this.currentState === 'none';
    this.currentState = state;

    if (state === 'none') {
      this.group.visible = false;
      return;
    }

    if (state === 'holstered' || state === 'raised') {
      this._setTargetPose(state);
    } else if (state === 'shooting') {
      this.recoil = 1;
    }
    // drawing/lowering 不改目标姿态

    this.group.visible = true;
    if (wasHidden) {
      // 从不可见到可见时先落到目标姿态，避免从屏幕中心滑入
      this.group.position.copy(this.targetPosition);
      this.group.rotation.set(this.targetRotation.x, this.targetRotation.y, this.targetRotation.z);
    }
  }

  update(dt) {
    if (this.currentState === 'none') {
      return;
    }

    // prefers-reduced-motion 检查
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (prefersReducedMotion) {
      // 直接到位
      this.group.position.copy(this.targetPosition);
      this.group.rotation.set(
        this.targetRotation.x,
        this.targetRotation.y,
        this.targetRotation.z
      );
      return;
    }

    // 指数平滑系数
    const k = 1 - Math.exp(-10 * dt);

    // 后坐力衰减与偏移
    this.recoil *= Math.exp(-9 * dt);
    const recoilZ = 0.03 * this.recoil;
    const recoilRotX = -0.08 * this.recoil;

    // 计算实际目标（含后坐）
    const actualTargetPos = new THREE.Vector3(
      this.targetPosition.x,
      this.targetPosition.y,
      this.targetPosition.z + recoilZ
    );
    const actualTargetRot = new THREE.Euler(
      this.targetRotation.x + recoilRotX,
      this.targetRotation.y,
      this.targetRotation.z
    );

    // 逐分量 lerp
    this.group.position.lerp(actualTargetPos, k);

    // 旋转插值（手动逐分量）
    this.group.rotation.x += (actualTargetRot.x - this.group.rotation.x) * k;
    this.group.rotation.y += (actualTargetRot.y - this.group.rotation.y) * k;
    this.group.rotation.z += (actualTargetRot.z - this.group.rotation.z) * k;
  }
}

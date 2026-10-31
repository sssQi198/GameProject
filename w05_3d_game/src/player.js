import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { moveCircle } from './collision.js';
import { lookResponsiveness } from './team/p2.js';
import { CameraRig } from './camera-rig.js';

const UP = new THREE.Vector3(0, 1, 0);
const LOOK_LIMIT = 1.25;

/**
 * 第一人称：WASD 移动，鼠标或方向键转向，Shift 冲刺。
 * 演示和强制注视会关掉键鼠，改由脚本或 lookTarget 驱动。
 */
export class Player {
  constructor(camera) {
    this.camera = camera;
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.radius = CONFIG.playerRadius;
    this.controlEnabled = false;
    this.scripted = false;
    this.sprinting = false;
    this.moving = false;
    this.course = null;
    this.courseDone = false;
    this.lookTarget = null;
    this.pendingDX = 0;
    this.pendingDY = 0;
    this.interactQueued = false;
    this.shootQueued = false;
    this.stepAccum = 0;
    this.gaitPhase = 0;
    this.gaitPulse = 0;
    this.gaitPulseVelocity = 0;
    this.gaitAmount = 0;
    this.speedScale = 1;
    this.onStep = null;

    this.lamp = new THREE.SpotLight(0xffe2c4, 0, 14, 0.48, 0.65, 2);
    this.lamp.position.set(0, 0, 0);
    this.lamp.target.position.set(0, 0, -1);
    camera.add(this.lamp);
    camera.add(this.lamp.target);

    this.cameraRig = new CameraRig(camera);

    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this._aim = new THREE.Vector3();
  }

  reset(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.course = null;
    this.courseDone = false;
    this.lookTarget = null;
    this.pendingDX = 0;
    this.pendingDY = 0;
    this.interactQueued = false;
    this.shootQueued = false;
    this.stepAccum = 0;
    this.gaitPhase = 0;
    this.gaitPulse = 0;
    this.gaitPulseVelocity = 0;
    this.gaitAmount = 0;
    this.moving = false;
    this.sprinting = false;
    this.syncCamera();
  }

  setControl(on) {
    this.controlEnabled = on;
    if (!on) {
      this.pendingDX = 0;
      this.pendingDY = 0;
      this.interactQueued = false;
      this.shootQueued = false;
    }
  }

  setScripted(on) {
    this.scripted = on;
    if (on) {
      this.clearInteract();
      this.clearShoot();
    }
  }

  setLamp(intensity) {
    this.lamp.intensity = intensity;
  }

  setCameraRigState(state) {
    this.cameraRig.setState(state);
  }

  pointerLook(dx, dy) {
    if (this.scripted || this.lookTarget || !this.controlEnabled) return;
    // 指针锁定切换、浏览器丢帧时会出现几百像素的异常 movementX。
    // 单次事件截断 + 累计总量封顶，避免一帧之内甩出几十度。
    const limit = 140;
    this.pendingDX += Math.max(-limit, Math.min(limit, dx));
    this.pendingDY += Math.max(-limit, Math.min(limit, dy));
    const cap = 200;
    this.pendingDX = Math.max(-cap, Math.min(cap, this.pendingDX));
    this.pendingDY = Math.max(-cap, Math.min(cap, this.pendingDY));
  }

  /** 重新锁定指针时丢弃残留的鼠标增量，避免恢复瞬间甩视角。 */
  clearPendingLook() {
    this.pendingDX = 0;
    this.pendingDY = 0;
  }

  queueInteract() {
    this.interactQueued = true;
  }

  consumeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  clearInteract() {
    this.interactQueued = false;
  }

  queueShoot() {
    this.shootQueued = true;
  }

  consumeShoot() {
    const v = this.shootQueued;
    this.shootQueued = false;
    return v;
  }

  clearShoot() {
    this.shootQueued = false;
  }

  setCourse(x, z, speed) {
    this.course = { x, z, speed };
    this.courseDone = false;
  }

  clearCourse() {
    this.course = null;
  }

  beginLookLock(target) {
    this.lookTarget = target.clone();
    this.pendingDX = 0;
    this.pendingDY = 0;
  }

  endLookLock() {
    this.lookTarget = null;
    this.pendingDX = 0;
    this.pendingDY = 0;
  }

  /** 把视角精确对准世界坐标，演示拍照用。 */
  facePoint(x, y, z) {
    const dx = x - this.x;
    const dy = y - CONFIG.eyeHeight;
    const dz = z - this.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -LOOK_LIMIT, LOOK_LIMIT);
    this.syncCamera();
  }

  update(dt, colliders) {
    this.radius = CONFIG.playerRadius;
    if (this.lookTarget) {
      this.applyLookLock(dt);
      this.moving = false;
      this.sprinting = false;
    } else if (this.course) {
      this.applyCourse(dt, colliders);
    } else if (this.controlEnabled && !this.scripted) {
      this.applyInput(dt, colliders);
    } else {
      this.moving = false;
      this.sprinting = false;
      this.pendingDX = 0;
      this.pendingDY = 0;
    }
    this.syncCamera(dt);
  }

  applyLookLock(dt) {
    const dx = this.lookTarget.x - this.x;
    const dy = this.lookTarget.y - CONFIG.eyeHeight;
    const dz = this.lookTarget.z - this.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -LOOK_LIMIT, LOOK_LIMIT);
    const k = 1 - Math.exp(-lookResponsiveness() * dt);
    this.yaw = lerpAngle(this.yaw, desiredYaw, k);
    this.pitch += (desiredPitch - this.pitch) * k;
    this.pendingDX = 0;
    this.pendingDY = 0;
  }

  applyCourse(dt, colliders) {
    const dx = this.course.x - this.x;
    const dz = this.course.z - this.z;
    const dist = Math.hypot(dx, dz);
    const speed = this.course.speed;
    if (dist < 0.2) {
      this.courseDone = true;
      this.moving = false;
      this.sprinting = false;
      return;
    }
    const step = Math.min(speed * dt, dist);
    const mx = (dx / dist) * step;
    const mz = (dz / dist) * step;
    const next = moveCircle(this.x, this.z, mx, mz, this.radius, colliders);
    const moved = Math.hypot(next.x - this.x, next.z - this.z);
    this.x = next.x;
    this.z = next.z;
    if (mx !== 0 || mz !== 0) this.yaw = Math.atan2(-mx, -mz);
    this.pitch += (0 - this.pitch) * (1 - Math.exp(-6 * dt));
    this.moving = moved > 0.001;
    this.sprinting = speed > CONFIG.walkSpeed + 0.4;
    this.advanceGait(moved, dt);
    this.accumulateStep(moved);
    this.courseDone = false;
  }

  applyInput(dt, colliders) {
    // 鼠标增量不一次性吃完，按时间常数收敛：即使某一帧卡住，
    // 累计的位移也会分摊到后面几帧，而不是瞬间转到目标角度。
    const k = 1 - Math.exp(-CONFIG.lookSmoothing * dt);
    const stepX = this.pendingDX * k;
    const stepY = this.pendingDY * k;
    this.yaw -= stepX * CONFIG.lookSensitivity;
    this.pitch -= stepY * CONFIG.lookSensitivity;
    this.pendingDX -= stepX;
    this.pendingDY -= stepY;
    this.pitch = clamp(this.pitch, -LOOK_LIMIT, LOOK_LIMIT);

    const keys = heldKeys;
    if (keys.has('ArrowLeft')) this.yaw += 1.5 * dt;
    if (keys.has('ArrowRight')) this.yaw -= 1.5 * dt;
    if (keys.has('ArrowUp')) this.pitch += 1.1 * dt;
    if (keys.has('ArrowDown')) this.pitch -= 1.1 * dt;
    this.pitch = clamp(this.pitch, -LOOK_LIMIT, LOOK_LIMIT);

    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW')) iz += 1;
    if (keys.has('KeyS')) iz -= 1;
    if (keys.has('KeyA')) ix -= 1;
    if (keys.has('KeyD')) ix += 1;
    this.sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const len = Math.hypot(ix, iz);
    this.moving = len > 0;
    if (!this.moving) return;

    const speed = (this.sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed) * this.speedScale;
    const scale = (speed * dt) / len;
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.crossVectors(this.forward, UP).normalize();
    const mx = (this.forward.x * iz + this.right.x * ix) * scale;
    const mz = (this.forward.z * iz + this.right.z * ix) * scale;
    const beforeX = this.x;
    const beforeZ = this.z;
    const next = moveCircle(this.x, this.z, mx, mz, this.radius, colliders);
    this.x = next.x;
    this.z = next.z;
    const moved = Math.hypot(this.x - beforeX, this.z - beforeZ);
    this.moving = moved > 0.001;
    this.advanceGait(moved, dt);
    this.accumulateStep(moved);
  }

  advanceGait(distance, dt) {
    const target = distance > 0.0001 ? 1 : 0;
    const blend = 1 - Math.exp(-12 * dt);
    this.gaitAmount += (target - this.gaitAmount) * blend;
    if (distance <= 0.0001) return;

    const stride = this.sprinting ? 1.05 : 1.25;
    const previousPhase = this.gaitPhase;
    this.gaitPhase = (this.gaitPhase + distance / stride) % 1;
    if (this.gaitPhase < previousPhase) {
      this.gaitPulseVelocity -= this.sprinting ? 0.42 : 0.32;
    }
  }

  accumulateStep(distance) {
    if (distance < 0.0001) return;
    this.stepAccum += distance;
    const stride = this.sprinting ? 1.15 : 1.45;
    if (this.stepAccum >= stride) {
      this.stepAccum = 0;
      this.onStep?.();
    }
  }

  syncCamera(dt = 0.016) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const active = this.moving && !this.lookTarget && !reduce;
    const target = active ? 1 : 0;
    this.gaitAmount += (target - this.gaitAmount) * (1 - Math.exp(-12 * dt));

    if (active) {
      this.gaitPulseVelocity *= Math.exp(-14 * dt);
      this.gaitPulse += this.gaitPulseVelocity * dt;
      this.gaitPulse = clamp(this.gaitPulse, -0.018, 0.004);
    } else {
      this.gaitPulse += (0 - this.gaitPulse) * (1 - Math.exp(-18 * dt));
      this.gaitPulseVelocity *= Math.exp(-18 * dt);
      if (this.gaitAmount < 0.01) {
        this.gaitPhase = 0;
        this.gaitPulse = 0;
        this.gaitPulseVelocity = 0;
      }
    }

    const phase = this.gaitPhase;
    const stepDip = phase < 0.22
      ? -smoothStep(phase / 0.22) * 0.006
      : phase < 0.42
        ? -0.006 + smoothStep((phase - 0.22) / 0.2) * 0.006
        : 0;
    const bobY = (stepDip + this.gaitPulse) * this.gaitAmount;
    const bobX = Math.sin(phase * Math.PI * 2) * 0.0022 * this.gaitAmount;

    this.camera.position.set(this.x + bobX, CONFIG.eyeHeight + bobY, this.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    this.cameraRig.update(dt);
  }
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

const heldKeys = new Set();

export function bindPlayerInput(player, canvas) {
  window.addEventListener('keydown', (event) => {
    heldKeys.add(event.code);
    if (event.code === 'KeyE') player.queueInteract();
    if (event.code === 'KeyF') player.queueShoot();
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    heldKeys.delete(event.code);
  });
  window.addEventListener('blur', () => heldKeys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    if (document.pointerLockElement === canvas) return;
    dragLook = true;
    dragMoved = 0;
    dragButton = event.button;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (document.pointerLockElement === canvas) {
      player.pointerLook(event.movementX, event.movementY);
      return;
    }
    if (!dragLook) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dx || dy) player.pointerLook(dx, dy);
  });
  window.addEventListener('pointerup', () => {
    dragLook = false;
  });
  // 锁定状态切换时浏览器可能补发一大段 movement，先清空再继续。
  document.addEventListener('pointerlockchange', () => {
    player.clearPendingLook();
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

let dragLook = false;
let dragMoved = 0;
let dragButton = 0;
let lastX = 0;
let lastY = 0;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

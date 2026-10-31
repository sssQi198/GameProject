import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { LAYOUT } from './layout.js';
import { moveCircle, pushOut } from './collision.js';
import { cameraModel, createAnomaly } from './anomalies.js';
import { emit } from './team/bus.js';
import { EVENT } from './team/contract.js';
import { extraColliders, createSceneExtra } from './team/m1.js';
import { createClassmate, createEyes } from './team/m2.js';
import { extraProps, isFlickerDark, tick as tickRoom } from './team/p3.js';

const FOG = 0x07080c;

/**
 * 教室 + 循环走廊。几何体是程序生成的，建模组以后可以把同名网格换成 GLB。
 */
export class Level {
  constructor(scene) {
    this.scene = scene;
    this.staticColliders = [];
    this.doorCollider = null;
    this.colliders = [];
    this.anomalies = [];
    this.props = [];
    this.hallLamps = [];
    this.npcDone = false;
    this.npcIndex = 1;
    this._doorLightReveal = false;
    this.doorOpen = false;
    this.doorAngle = 0;
    this.loopEnabled = false;
    this.flickerDark = false;
    this.debugColliders = false;
    this.debugGroup = null;
    this._debugDoor = null;
    this.furnitureVisuals = [];
    this.classroomModel = null;
    this.classroomModelError = null;

    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.FogExp2(FOG, CONFIG.fogMenu);

    this.materials = makeMaterials();
    this.buildShell();
    this.buildFurniture();
    this.buildDoor();
    this.buildCharacters();
    this.buildPickup();
    this.buildExit();
    this.buildProps();
    this.buildLights();
    const extra = createSceneExtra(THREE, LAYOUT);
    if (extra) this.scene.add(extra);
    this.loadClassroomModel();
  }

  loadClassroomModel() {
    import('../vendor/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/assets/models/classroom_m1_v01.glb', (gltf) => {
        const model = gltf.scene;
        model.name = 'Classroom_M1_GLTF';
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = false;
          node.receiveShadow = true;
          node.userData.noRay = true;
        });
        this.scene.add(model);
        this.classroomModel = model;
        for (const mesh of this.furnitureVisuals) {
          mesh.visible = false;
          // 隐藏的旧家具不能被拍照射线命中，否则会出现“看不见的桌子挡住拍摄”。
          mesh.traverse((child) => { child.userData.noRay = true; });
        }
        document.body.dataset.classroomModel = 'glb';
        document.body.dataset.furnitureHidden = String(this.furnitureVisuals.filter((m) => !m.visible).length)
          + '/' + String(this.furnitureVisuals.length);
        // 模型材质第一次进入视野才编译着色器，会造成一次明显卡顿（转视角时最明显）。
        // 交给上层立刻预编译。
        this.onSceneChanged?.();
      }, undefined, (error) => {
        this.classroomModelError = error;
        document.body.dataset.classroomModel = 'fallback';
        console.warn('教室 GLB 加载失败，继续使用程序化教室。', error);
      });
    }).catch((error) => {
      this.classroomModelError = error;
      document.body.dataset.classroomModel = 'fallback';
      console.warn('教室 GLB 模块加载失败，继续使用程序化教室。', error);
    });
  }

  reset() {
    this.clearAnomalies();
    this.doorOpen = false;
    this.doorAngle = 0;
    this.doorPivot.rotation.y = 0;
    this.loopEnabled = false;
    this.npcDone = false;
    this.npcState = 'idle';
    this.npcWaitReached = false;
    this.npcSaidWait = false;
    this.npcTurnTarget = null;
    this.npcDoorReopen = false;
    this.npc.visible = false;
    this.setNpcOpacity(1);
    this.entity.visible = false;
    this.entityLight.intensity = 0;
    this.exitSign.visible = false;
    this.exitLight.intensity = 0;
    this.pickup.visible = false;
    this.pickupLight.intensity = 0;
    for (const prop of this.props) {
      prop.x = prop.homeX;
      prop.z = prop.homeZ;
      prop.mesh.position.x = prop.x;
      prop.mesh.position.z = prop.z;
    }
  }

  beginPrologue() {
    this.npcDone = false;
    this.npcState = 'idle';
    this.npcWaitReached = false;
    this.npcSaidWait = false;
    this.npcTurnTarget = null;
    this.npcDoorReopen = false;
    this.npcIndex = 1;
    this.npcSmoothYaw = Math.PI / 2; // 对齐初始朝向
    this.npc.visible = true;
    this.npc.position.copy(this.npcStandPos);
    this.npc.rotation.y = Math.PI / 2;
    this.setNpcOpacity(1);
  }

  /**
   * NPC隐藏 + 走廊透光开启
   * – npcDone = true 后 game.js 的 introPhase 会推进到 phase 2（出事前的等待）
   * – _doorLightReveal = true 后走廊 doorLight 才会亮起（见 updateLights）
   * – 走廊透光的颜色/强度可调 CONFIG.doorLight（config._lighting）
   */
  hideNpc() {
    this.npc.visible = false;
    this.npcDone = true;
    this._doorLightReveal = true; // NPC进教室后走廊透光，直到门关闭
  }

  revealPickup() {
    this.pickup.visible = true;
    this.pickupLight.intensity = 4;
    this.pickup.position.y = 0.9;
  }

  hidePickup() {
    this.pickup.visible = false;
    this.pickupLight.intensity = 0;
  }

  nearPickup(x, z) {
    if (!this.pickup.visible) return false;
    return Math.hypot(x - LAYOUT.pickup.x, z - LAYOUT.pickup.z) < 1.65;
  }

  /**
   * 开/关门。snap=true 立刻到位（不参与平滑），false 由 update() 每帧平滑过渡。
   * 门平滑由 update()→doorAngle = (target - doorAngle)*min(1, dt*4) 驱动。
   * 关门前 emit(EVENT.door) 发出事件（谁关心谁自己听）。
   * 后续AI接管者不用改这个函数，改门旋转角度或速度调 doorAngle target 和 dt*4。
   */
  setDoorOpen(open, snap = false) {
    this.doorOpen = open;
    if (snap) {
      this.doorAngle = open ? 1.42 : 0;
      this.doorPivot.rotation.y = this.doorAngle;
    }
    emit(EVENT.door, { open });
  }

  /** 从 game.js 控制 NPC 状态切换 */
  setNpcState(state) {
    this.npcState = state;
    if (state === 'walking') {
      this.npc.visible = true;
      this.npc.position.copy(this.npcStandPos);
      this.npcIndex = 1;
      this.npcSmoothYaw = Math.PI / 2; // 对齐朝向，避免闪一下
      this.npcWaitReached = false;
      this.npcSaidWait = false;
      this.npcDoorReopen = false;
    }
  }

  /** 每帧由 game.js 调用来检测等待释放条件 */
  checkNpcWait(playerX, playerZ) {
    if (this.npcState !== 'waiting') return;
    const toDoor = Math.hypot(playerX, playerZ - (LAYOUT.room.maxZ + LAYOUT.wall / 2));
    const inside = playerZ <= LAYOUT.room.maxZ;
    // 释放条件：玩家距门<3.5m，或已进房间，或15s倒计时由game.js处理
    // 这里只负责状态切换
    if (toDoor < 3.5 || inside) {
      this.npcState = 'walking';
      this.npcIndex = 1; // 从当前位置走到door-side waypoint (index 1)
      this.npcWaitReached = false; // 继续走完全程
      this.setDoorOpen(true, false);
    }
  }

  /** 玩家距离门 <1.5m 时触发门推开 */
  checkNpcDoorPush(playerX, playerZ) {
    if (this.doorOpen) return;
    const dist = Math.hypot(playerX, playerZ - (LAYOUT.room.maxZ + LAYOUT.wall / 2));
    if (dist < 1.5 && !this.npcDoorReopen) {
      this.npcDoorReopen = true;
      this.setDoorOpen(true, false);
    }
  }

  /** 玩家距NPC小于某个距离时触发"等等我"提示 */
  checkNpcWaitHint(playerX, playerZ) {
    if (this.npcSaidWait || this.npcState !== 'waiting') return;
    const dx = playerX - this.npc.position.x;
    const dz = playerZ - this.npc.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 6) return 'triggerWait';
    return null;
  }

  /** NPC脚步声，由update在行走时调用 */
  npcFootstep(dt, env) {
    if (this.npcState !== 'walking' || this.npcDone) return;
    if (!this._npcFootstepAcc) this._npcFootstepAcc = 0;
    // 步幅1.0m，每个完整步幅约0.77s @1.3m/s；每步触发一次
    const stepInterval = 0.48; // 秒，约2步每秒
    this._npcFootstepAcc += dt;
    if (this._npcFootstepAcc >= stepInterval) {
      this._npcFootstepAcc = 0;
      const dx = this.npc.position.x - this.audioX;
      const dz = this.npc.position.z - this.audioZ;
      const listenerDist = Math.hypot(dx, dz);
      env.audio?.npcStep(listenerDist);
      this.audioX = this.npc.position.x;
      this.audioZ = this.npc.position.z;
    }
  }

  /** 门缓缓虚掩：序章初始状态门开0.55 rad */
  setDoorAjar(snap = false) {
    this.doorOpen = false;
    if (snap) {
      this.doorAngle = 0.55;
      this.doorPivot.rotation.y = this.doorAngle;
    }
  }

  /**
   * 爆闪/惨绿闪烁 —— 后续AI接管者注意：
   * – 只有调用 triggerFlash(duration) 才激活，每帧由 update()→this.lightFlash(dt) 驱动
   * – 不要直接在 update() 或 updateLights() 里无条件调 lightFlash()，否则会永久闪
   * – 亮度曲线: flashFactor 从 20 快速衰减到 2 再到 1，峰值时 brightness ≈ 20× 正常
   * – 闪光色调: 惨绿色 (flashColor)，亮度越高绿色越浓
   * – 走廊灯 (hallLamps) 同步闪烁，幅度为房间灯的 40%
   * - 恢复后房间灯和走廊灯回到原始亮度和颜色(0xffffff / 0x8ea0c0)
   * – 如需调整闪光强度: 改 flashFactor 起始值和衰减率; 持续时长: triggerFlash(duration) 的参数
   */
  lightFlash(dt) {
    if ((this._flashT ?? -1) < 0) return;
    this._flashT += dt;
    const duration = this._flashDuration ?? 0.45;
    if (this._flashT > duration) {
      // 完全恢复：还原到正常光照
      const base = CONFIG.roomLight;
      const scaled = base * 0.46;
      for (const light of this.roomLights) {
        light.intensity = scaled;
        if (light.color) light.color.setHex(0xffffff);
      }
      this.fixtureMat.emissiveIntensity = 0.05;
      for (const light of this.hallLamps) {
        light.intensity = CONFIG.hallLamp;
        if (light.color) light.color.setHex(0x8ea0c0);
      }
      this._flashT = -1;
      return;
    }
    const progress = this._flashT / duration;
    // 亮度曲线：极强闪光 → 快速回落
    let flashFactor;
    if (progress < 0.10) {
      flashFactor = 20 - 12 * (progress / 0.10);
    } else if (progress < 0.35) {
      flashFactor = 8 - 6 * ((progress - 0.10) / 0.25);
    } else {
      flashFactor = 2 - 1.0 * ((progress - 0.35) / 0.65);
    }
    // 惨绿调色：闪光越强绿色越浓
    const greenMix = Math.min(1, flashFactor / 8);
    const r = Math.round(0xcc * (1 - greenMix * 0.55));
    const g = Math.round(0xff);
    const b = Math.round(0xa0 * (1 - greenMix * 0.7));
    const flashColor = (r << 16) | (g << 8) | b;
    const base = CONFIG.roomLight;
    const scaled = base * 0.46;
    for (const light of this.roomLights) {
      light.intensity = scaled * flashFactor;
      if (light.color) light.color.setHex(flashColor);
    }
    this.fixtureMat.emissiveIntensity = flashFactor > 10 ? 5.0 : (flashFactor > 3 ? 3.0 : 0.05);
    // 走廊灯同步闪烁（走廊灯保持淡绿，亮度也放大但幅度小一些）
    const hallFactor = 1 + (flashFactor - 1) * 0.4;
    for (const light of this.hallLamps) {
      light.intensity = CONFIG.hallLamp * Math.max(1, hallFactor);
      if (light.color) light.color.setHex(flashColor);
    }
  }

  /** 触发一次闪光（重置定时器） */
  triggerFlash(duration) {
    this._flashT = 0;
    this._flashDuration = duration || 0.4;
  }

  spawnUpTo(count) {
    let added = false;
    for (let level = 1; level <= count; level += 1) {
      if (this.anomalies.some((item) => item.level === level)) continue;
      const anomaly = createAnomaly(level);
      if (anomaly.parent === 'door') this.doorPivot.add(anomaly.group);
      else this.scene.add(anomaly.group);
      this.anomalies.push(anomaly);
      added = true;
    }
    // 新异常带着新材质，先让渲染器编译，避免玩家第一次看到它时掉帧。
    if (added) this.onSceneChanged?.();
  }

  clearAnomalies() {
    for (const anomaly of this.anomalies) {
      anomaly.group.removeFromParent();
      disposeObject(anomaly.group);
    }
    this.anomalies = [];
  }

  getAnomalyAimPoint(level) {
    const anomaly = this.anomalies.find((item) => item.level === level);
    if (!anomaly) return null;
    return anomaly.group.localToWorld(new THREE.Vector3(0, anomaly.aimY ?? 0, 0));
  }

  getAnomalyStand(level) {
    const anomaly = this.anomalies.find((item) => item.level === level);
    return anomaly?.stand ?? LAYOUT.photoStand;
  }

  isInsideRoom(x, z) {
    const room = LAYOUT.room;
    return x > room.minX + 0.08 && x < room.maxX - 0.08 && z > room.minZ + 0.08 && z < room.maxZ - 0.05;
  }

  getColliders() {
    const out = this.colliders;
    out.length = 0;
    for (const box of this.staticColliders) out.push(box);
    for (const box of extraColliders()) out.push(box);
    if (!this.doorOpen) out.push(this.doorCollider);
    return out;
  }

  aim(raycaster) {
    const hits = raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (flagged(hit.object, 'noRay')) continue;
      const tag = findTag(hit.object);
      if (tag?.anomalyLevel) {
        return {
          kind: 'anomaly',
          level: tag.anomalyLevel,
          id: tag.anomalyId,
          distance: hit.distance,
        };
      }
      if (tag?.fakeAnomaly) return { kind: 'fake', distance: hit.distance };
      return { kind: 'none', distance: hit.distance };
    }
    return { kind: 'none', distance: Infinity };
  }

  bumpProps(x, z, radius) {
    for (const prop of this.props) {
      let dx = prop.x - x;
      let dz = prop.z - z;
      let dist = Math.hypot(dx, dz);
      const min = radius + prop.r;
      if (dist >= min) continue;
      if (dist < 1e-5) {
        dx = 1;
        dz = 0;
        dist = 1;
      }
      const push = min - dist;
      prop.x += (dx / dist) * push;
      prop.z += (dz / dist) * push;
      const room = LAYOUT.room;
      prop.x = clamp(prop.x, room.minX + 0.6, room.maxX - 0.6);
      prop.z = clamp(prop.z, room.minZ + 0.6, room.maxZ - 0.85);
      const solved = pushOut(prop.x, prop.z, prop.r, this.staticColliders);
      prop.x = solved.x;
      prop.z = solved.z;
      prop.mesh.position.x = prop.x;
      prop.mesh.position.z = prop.z;
    }
  }

  placeEntity(x, z) {
    this.entity.visible = true;
    this.entity.position.set(x, 0, z);
    this.entityLight.intensity = 12;
  }

  hideEntity() {
    this.entity.visible = false;
    this.entityLight.intensity = 0;
  }

  entityEye() {
    return new THREE.Vector3(this.entity.position.x, 1.62, this.entity.position.z);
  }

  stepEntity(targetX, targetZ, dt) {
    const speed = CONFIG.entitySpeed;
    const dx = targetX - this.entity.position.x;
    const dz = targetZ - this.entity.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const step = Math.min(speed * dt, dist);
    const next = moveCircle(
      this.entity.position.x,
      this.entity.position.z,
      (dx / dist) * step,
      (dz / dist) * step,
      0.45,
      this.getColliders(),
    );
    this.entity.position.x = next.x;
    this.entity.position.z = next.z;
    const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.18;
    this.eyeL.scale.setScalar(pulse);
    this.eyeR.scale.setScalar(pulse);
  }

  showExit(on) {
    this.exitSign.visible = on;
    this.exitLight.intensity = on ? 80 : 0;
  }

  update(dt, env) {
    const target = this.doorOpen ? 1.42 : 0;
    this.doorAngle += (target - this.doorAngle) * Math.min(1, dt * 4);
    this.doorPivot.rotation.y = this.doorAngle;

    this.updateLights(env);
    tickRoom(this, dt, env);
    this.updateNpc(dt, env);
    this.npcFootstep(dt, env);
    this.lightFlash(dt); // 每帧驱动爆闪，只有 triggerFlash() 激活后才真的闪；不额外判断以保持时序统一
    this.updatePickup(dt);
    for (const anomaly of this.anomalies) anomaly.update(dt, { ...env, flickerDark: this.flickerDark });

    if (this.pickup.visible) {
      this.pickup.position.y += (0.12 - this.pickup.position.y) * Math.min(1, dt * 4);
      this.pickup.rotation.y += dt * 0.8;
    }

    const density = {
      menu: CONFIG.fogMenu,
      play: CONFIG.fogRoom,
      hall: CONFIG.fogHall,
      chase: CONFIG.fogChase,
      calm: CONFIG.fogCalm,
    }[env.mood] ?? CONFIG.fogRoom;
    this.scene.fog.density = density;

    if (this.debugColliders && this._debugDoor !== this.doorOpen) this.setColliderDebug(true);
  }

  updateShowcase(time, camera) {
    camera.position.set(-1.6 + Math.sin(time * 0.18) * 0.25, 1.64, -0.35);
    camera.lookAt(8.6, 1.5, 0.2);
  }

  /**
   * 灯光调节 —— 后续AI接管者注意：
   * – 走廊灯颜色/亮度：调 `CONFIG.hallLamp`（config._lighting）或下方 `this.hallLamps`
   * – 走廊透光（doorLight）：受 `_doorLightReveal` 控制，在 hideNpc() 设为 true
   * - 环境光/雾：调 `CONFIG.ambient` 和 scene.fog.density
   */
  updateLights(env) {
    const menu = env.mood === 'menu';
    const chase = env.mood === 'chase';
    const calm = env.mood === 'calm';
    this.flickerDark = isFlickerDark(env.time, env.mood);
    const base = calm ? CONFIG.roomLight * 0.3 : chase ? 1.2 : CONFIG.roomLight;
    const scaled = base * 0.46;
    const intensity = menu ? CONFIG.roomLight * 0.42 : this.flickerDark ? scaled * 0.04 : scaled;
    for (const light of this.roomLights) light.intensity = intensity;
    this.fixtureMat.emissiveIntensity = intensity > 4 ? 0.75 : 0.05;
    // doorLight 走廊透光：_doorLightReveal=true(NPC进教室后)才亮，避免出事前走廊突然亮起
    this.doorLight.intensity = this._doorLightReveal ? CONFIG.doorLight : (chase ? 0 : 6);
    const lamp = chase ? 0 : calm ? CONFIG.hallLamp * 1.6 : CONFIG.hallLamp;
    for (const light of this.hallLamps) light.intensity = lamp;
    this.ambient.intensity = calm ? CONFIG.ambient * 2.4 : CONFIG.ambient;
  }

  updateNpc(dt, env) {
    if (env.npcMode === 'hide') {
      this.npc.visible = false;
      return;
    }
    if (env.npcMode === 'ending') {
      this.npc.visible = true;
      this.npc.position.set(LAYOUT.classmateEnd.x, 0, LAYOUT.classmateEnd.z);
      this.npc.rotation.y = Math.PI / 2;
      this.setNpcOpacity(1 - (env.classmateFade || 0));
      return;
    }
    if (this.npcDone) return;
    const speed = 1.3 * (env.npcRate || 1);

    // ===== 空闲状态 — 序章NPC刚出现，站在位置面向玩家 =====
    if (this.npcState === 'idle') {
      this.npc.visible = true;
      // 呼吸动画
      this.npcIdlePhase += dt * 1.7;
      const breathe = 1 + Math.sin(this.npcIdlePhase) * 0.006;
      if (this.npcTorso) this.npcTorso.scale.y = breathe;
      for (const leg of (this.npcLegs ?? [])) leg.rotation.x = 0;
      for (const arm of (this.npcArms ?? [])) arm.rotation.x = 0;
      this.npc.position.y = 0;
      // 面向玩家方向 (Z正方向)
      const faceYaw = Math.PI / 2;
      this.npcSmoothYaw += (faceYaw - this.npcSmoothYaw) * Math.min(1, dt * 3);
      this.npc.rotation.y = this.npcSmoothYaw;
      return;
    }

    const target = this.npcPath[this.npcIndex];

    // ===== 等待状态 — 第一次到达门口时等待玩家 =====
    if (this.npcState === 'waiting') {
      this.npc.visible = true;
      // 站姿呼吸
      this.npcIdlePhase += dt * 1.7;
      const breathe = 1 + Math.sin(this.npcIdlePhase) * 0.006;
      if (this.npcTorso) this.npcTorso.scale.y = breathe;
      for (const leg of (this.npcLegs ?? [])) leg.rotation.x = 0;
      for (const arm of (this.npcArms ?? [])) arm.rotation.x = 0;
      this.npc.position.y = 0;
      // 面向房间内
      this.npcSmoothYaw += (Math.PI / 2 - this.npcSmoothYaw) * Math.min(1, dt * 3);
      this.npc.rotation.y = this.npcSmoothYaw;
      return;
    }

    // ===== 行走状态 — 向目标点移动 =====
    if (!target) {
      this.hideNpc();
      return;
    }
    const dx = target.x - this.npc.position.x;
    const dz = target.z - this.npc.position.z;
    const dist = Math.hypot(dx, dz);
    const step = speed * dt;
    if (dist <= step) {
      this.npc.position.set(target.x, 0, target.z);
      this.npcIndex += 1;

      // 判断是否到达门口（waypoint 0→1之后，坐标接近 door side）
      if (this.npcIndex === 2 && !this.npcWaitReached) {
        this.npcWaitReached = true;
        this.setDoorOpen(true); // NPC到达门口后推开门，走廊透光
      }
      if (this.npcIndex >= this.npcPath.length) this.hideNpc();
      // 站桩/到达后四肢归零
      for (const leg of (this.npcLegs ?? [])) leg.rotation.x = 0;
      for (const arm of (this.npcArms ?? [])) arm.rotation.x = 0;
      if (this.npcTorso) this.npcTorso.position.y = 0;
      this.npc.position.y = 0;
      this.npc.rotation.x = 0;
      this.npcSmoothYaw = this.npc.rotation.y;
    } else {
      this.npc.position.x += (dx / dist) * step;
      this.npc.position.z += (dz / dist) * step;
    }
  }

  updatePickup(dt) {
    if (!this.pickup.visible) return;
    this.pickup.position.y += (0.12 - this.pickup.position.y) * Math.min(1, dt * 3);
  }

  swingLegs(time) {
    if (!this.npcLegs?.[0] || !this.npcLegs[1]) return;
    const swing = Math.sin(time * 8) * 0.45;
    this.npcLegs[0].rotation.x = swing;
    this.npcLegs[1].rotation.x = -swing;
  }

  setNpcOpacity(opacity) {
    const value = clamp(opacity, 0, 1);
    this.npc.visible = value > 0.04;
    for (const material of this.npcMaterials) {
      material.transparent = value < 0.99;
      material.opacity = value;
    }
  }

  setColliderDebug(on) {
    this.debugColliders = on;
    if (this.debugGroup) {
      this.scene.remove(this.debugGroup);
      disposeObject(this.debugGroup);
      this.debugGroup = null;
    }
    if (!on) return;
    this._debugDoor = this.doorOpen;
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: 0x39ff88 });
    for (const box of this.getColliders()) {
      const y = 0.45;
      const points = [
        new THREE.Vector3(box.minX, y, box.minZ),
        new THREE.Vector3(box.maxX, y, box.minZ),
        new THREE.Vector3(box.maxX, y, box.maxZ),
        new THREE.Vector3(box.minX, y, box.maxZ),
        new THREE.Vector3(box.minX, y, box.minZ),
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    markNoRay(group);
    this.scene.add(group);
    this.debugGroup = group;
  }

  buildShell() {
    const { room, hall, wall, alcove } = LAYOUT;
    const floorMat = this.materials.ground;
    const roomFloor = this.materials.wood;
    this.addPlane(112, 24, (hall.minX + hall.maxX) / 2, 0, 4, floorMat);
    this.addPlane(room.maxX - room.minX, room.maxZ - room.minZ, 0, 0.03, 0, roomFloor);

    const h = room.height;
    const t = wall;
    this.addBox(t, h, room.maxZ - room.minZ + t, room.maxX + t / 2, h / 2, 0, this.materials.wall, true);
    this.addBox(t, h, room.maxZ - room.minZ + t, room.minX - t / 2, h / 2, 0, this.materials.wall, true);
    this.addBox(room.maxX - room.minX + t * 2, h, t, 0, h / 2, room.minZ - t / 2, this.materials.wall, true);

    const doorHalf = LAYOUT.door.half;
    this.buildCorridorWall(h, t, doorHalf);
    this.doorCollider = {
      minX: -doorHalf,
      maxX: doorHalf,
      minZ: room.maxZ,
      maxZ: room.maxZ + t,
    };

    this.addBox(0.34, hall.height, hall.minZ - (room.maxZ + t) + 0.2, -doorHalf - 0.17, hall.height / 2, (room.maxZ + t + hall.minZ) / 2, this.materials.hall, true);
    this.addBox(0.34, hall.height, hall.minZ - (room.maxZ + t) + 0.2, doorHalf + 0.17, hall.height / 2, (room.maxZ + t + hall.minZ) / 2, this.materials.hall, true);

    const hallT = 0.42;
    const hallSouthZ = hall.minZ - hallT / 2;
    const hallNorthZ = hall.maxZ + hallT / 2;
    this.addBox(-hall.minX - doorHalf, hall.height, hallT, (hall.minX + -doorHalf) / 2, hall.height / 2, hallSouthZ, this.materials.hall, true);
    this.addBox(hall.maxX - doorHalf, hall.height, hallT, (doorHalf + hall.maxX) / 2, hall.height / 2, hallSouthZ, this.materials.hall, true);
    this.addBox(alcove.minX - hall.minX, hall.height, hallT, (hall.minX + alcove.minX) / 2, hall.height / 2, hallNorthZ, this.materials.hall, true);
    this.addBox(hall.maxX - alcove.maxX, hall.height, hallT, (alcove.maxX + hall.maxX) / 2, hall.height / 2, hallNorthZ, this.materials.hall, true);
    this.addBox(hallT, hall.height, hall.maxZ - hall.minZ + hallT, hall.minX - hallT / 2, hall.height / 2, hall.z, this.materials.hall, true);
    this.addBox(hallT, hall.height, hall.maxZ - hall.minZ + hallT, hall.maxX + hallT / 2, hall.height / 2, hall.z, this.materials.hall, true);

    const alcoveDepth = alcove.backZ - hall.maxZ;
    this.addBox(hallT, hall.height, alcoveDepth, alcove.minX - hallT / 2, hall.height / 2, (hall.maxZ + alcove.backZ) / 2, this.materials.hall, true);
    this.addBox(hallT, hall.height, alcoveDepth, alcove.maxX + hallT / 2, hall.height / 2, (hall.maxZ + alcove.backZ) / 2, this.materials.hall, true);
    this.addBox(alcove.maxX - alcove.minX + hallT, hall.height, hallT, (alcove.minX + alcove.maxX) / 2, hall.height / 2, alcove.backZ + hallT / 2, this.materials.hall, true);
    this.addPlane(alcove.maxX - alcove.minX, alcoveDepth, (alcove.minX + alcove.maxX) / 2, 0.02, (hall.maxZ + alcove.backZ) / 2, floorMat);

    this.addBox(room.maxX - room.minX + 1, 0.16, room.maxZ - room.minZ + 1, 0, room.height + 0.08, 0, this.materials.ceiling, false);
    this.addBox(hall.maxX - hall.minX, 0.14, hall.maxZ - hall.minZ, (hall.minX + hall.maxX) / 2, hall.height + 0.05, hall.z, this.materials.ceiling, false);

    // 墙面线脚每 4 米一条，±20 米对调后仍然对齐
    for (let x = hall.minX + 4; x < hall.maxX; x += 4) {
      if (Math.abs(x) < 1.4) continue;
      this.addBox(0.08, 1.2, 0.06, x, 1.5, hall.minZ + 0.04, this.materials.trim, false);
      if (x < alcove.minX - 0.5 || x > alcove.maxX + 0.5) {
        this.addBox(0.08, 1.2, 0.06, x, 1.5, hall.maxZ - 0.04, this.materials.trim, false);
      }
    }
  }

  buildCorridorWall(h, t, doorHalf) {
    const { room } = LAYOUT;
    const northZ = room.maxZ + t / 2;
    this.staticColliders.push(
      { minX: room.minX, maxX: -doorHalf, minZ: room.maxZ, maxZ: room.maxZ + t },
      { minX: doorHalf, maxX: room.maxX, minZ: room.maxZ, maxZ: room.maxZ + t },
    );
    const lintel = h - LAYOUT.door.height;
    this.addBox(doorHalf * 2, lintel, t, 0, LAYOUT.door.height + lintel / 2, northZ, this.materials.wall, false);
    this.curtains = [];
    this.addWindowRun(room.minX, -doorHalf, northZ, t, h);
    this.addWindowRun(doorHalf, room.maxX, northZ, t, h);
    this.curtainFar = this.curtains[5] ?? null;
    this.curtainNear = this.curtains[6] ?? null;
  }

  addWindowRun(x0, x1, northZ, t, h) {
    const count = 3;
    const winW = 1.9;
    const sill = 0.95;
    const winTop = 2.28;
    const span = x1 - x0;
    const pier = (span - count * winW) / (count + 1);
    const mid = (x0 + x1) / 2;
    const wall = this.materials.wall;
    this.addBox(span, sill, t, mid, sill / 2, northZ, wall, false);
    this.addBox(span, h - winTop, t, mid, winTop + (h - winTop) / 2, northZ, wall, false);
    let cursor = x0;
    for (let i = 0; i < count; i += 1) {
      this.addBox(pier, winTop - sill, t, cursor + pier / 2, (sill + winTop) / 2, northZ, wall, false);
      cursor += pier;
      const center = cursor + winW / 2;
      this.windowIndex = (this.windowIndex || 0) + 1;
      const broken = this.windowIndex === 2 || this.windowIndex === 5;
      this.addWindow(center, (sill + winTop) / 2, winW, winTop - sill, northZ, sill, winTop, broken);
      this.addCurtain(center, broken);
      cursor += winW;
    }
    this.addBox(pier, winTop - sill, t, cursor + pier / 2, (sill + winTop) / 2, northZ, wall, false);
  }

  /**
   * 一扇窗：窗框、横竖分格、窗台、插销，其中第 2、5 扇是破的。
   * 破窗用锯齿形黑片当缺口（外面本来就是黑的），再叠裂纹和几块挂着的碎玻璃。
   */
  addWindow(centerX, centerY, w, h, z, sillY, topY, broken) {
    const innerW = w - 0.10;
    const innerH = h - 0.10;
    const faceZ = z - 0.06;      // 朝教室这一侧
    const trim = this.materials.trim;

    // 玻璃
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), this.materials.glass);
    glass.position.set(centerX, centerY, z - 0.02);
    markNoRay(glass);
    this.scene.add(glass);

    // 外框四条
    const bar = 0.055;
    const frameZ = z - 0.05;
    this.addBox(innerW + bar * 2, bar, 0.07, centerX, topY - 0.05, frameZ, trim, false);
    this.addBox(innerW + bar * 2, bar, 0.07, centerX, sillY + 0.05, frameZ, trim, false);
    this.addBox(bar, innerH + bar * 2, 0.07, centerX - innerW / 2 - bar / 2, centerY, frameZ, trim, false);
    this.addBox(bar, innerH + bar * 2, 0.07, centerX + innerW / 2 + bar / 2, centerY, frameZ, trim, false);
    // 中竖梃 + 上横档，做出四格
    this.addBox(0.038, innerH, 0.055, centerX, centerY, frameZ, trim, false);
    this.addBox(innerW, 0.032, 0.055, centerX, centerY + innerH * 0.18, frameZ, trim, false);
    // 窗台
    this.addBox(innerW + 0.30, 0.06, 0.26, centerX, sillY - 0.02, z - 0.16, trim, false);
    // 插销
    this.addBox(0.05, 0.018, 0.02, centerX + 0.02, centerY - 0.02, frameZ - 0.03, trim, false);

    if (!broken) return;

    // 缺口：锯齿黑片
    const holeRng = seededRandom(centerX * 13.7 + 3.1);
    const holeW = innerW * (0.42 + holeRng() * 0.16);
    const holeH = innerH * (0.5 + holeRng() * 0.2);
    const cx = centerX + (holeRng() - 0.5) * (innerW - holeW) * 0.7;
    const cy = centerY + (holeRng() - 0.5) * (innerH - holeH) * 0.6;
    const shape = new THREE.Shape();
    const points = 9;
    for (let i = 0; i < points; i += 1) {
      const angle = (i / points) * Math.PI * 2;
      const radius = 0.5 + (holeRng() - 0.5) * 0.34;
      const px = cx + Math.cos(angle) * (holeW / 2) * radius;
      const py = cy + Math.sin(angle) * (holeH / 2) * radius;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
      color: 0x000000, side: THREE.DoubleSide,
    }));
    hole.position.z = faceZ + 0.005;
    markNoRay(hole);
    this.scene.add(hole);

    // 从缺口向外爬的裂纹
    const cracks = [];
    for (let i = 0; i < 5; i += 1) {
      const angle = holeRng() * Math.PI * 2;
      const len = 0.35 + holeRng() * 0.85;
      const sx = cx + Math.cos(angle) * holeW * 0.5;
      const sy = cy + Math.sin(angle) * holeH * 0.5;
      let px = sx;
      let py = sy;
      let a = angle;
      for (let seg = 0; seg < 3; seg += 1) {
        a += (holeRng() - 0.5) * 0.7;
        const step = len / 3;
        const nx = px + Math.cos(a) * step;
        const ny = py + Math.sin(a) * step;
        cracks.push(px, py, 0.002, nx, ny, 0.002);
        px = nx;
        py = ny;
      }
    }
    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
    const crackLines = new THREE.LineSegments(crackGeo, new THREE.LineBasicMaterial({
      color: 0xbfc9c4, transparent: true, opacity: 0.45,
    }));
    crackLines.position.z = faceZ + 0.008;
    markNoRay(crackLines);
    this.scene.add(crackLines);

    // 还挂着没掉的碎玻璃
    for (let i = 0; i < 3; i += 1) {
      const shardRng = seededRandom(i * 31.7 + centerX);
      const wS = 0.10 + shardRng() * 0.16;
      const hS = 0.08 + shardRng() * 0.14;
      const tri = new THREE.Shape();
      tri.moveTo(0, 0);
      tri.lineTo(wS, -hS * 0.3);
      tri.lineTo(wS * 0.35, hS);
      tri.closePath();
      const shard = new THREE.Mesh(new THREE.ShapeGeometry(tri), this.materials.glass);
      shard.position.set(
        cx + (shardRng() - 0.5) * innerW * 0.8,
        cy + (shardRng() - 0.5) * innerH * 0.8,
        faceZ + 0.01,
      );
      shard.rotation.z = shardRng() * Math.PI;
      markNoRay(shard);
      this.scene.add(shard);
    }
  }

  addCurtain(x, broken = false) {
    const { room } = LAYOUT;
    const z = room.maxZ - 0.05;
    for (const side of [-0.55, 0.55]) {
      // 破窗那一扇的右半幅已经撕掉了，只剩贴着窗框的一小条
      const torn = broken && side > 0;
      const w = torn ? 0.26 : 0.72;
      const h = torn ? 1.05 : 2.6;
      const y = torn ? 2.42 : 1.42;
      const offset = torn ? side * 0.72 : side;
      const curtain = this.addBox(w, h, 0.04, x + offset, y, z, this.materials.curtain, false);
      markNoRay(curtain);
      this.curtains.push(curtain);
    }
  }

  buildFurniture() {
    const { desks, room } = LAYOUT;
    for (const x of desks.towardBoard) {
      for (const z of desks.across) this.addDesk(x, z);
    }
    const teacherDesk = this.addBox(0.72, 0.78, 1.7, 8.2, 0.39, 0, this.materials.desk, true);
    this.furnitureVisuals.push(teacherDesk);
    const boardX = room.maxX - 0.07;
    const board = this.addBox(0.08, 1.45, 4.2, boardX, 1.75, 0, this.materials.board, false);
    const frame = this.addBox(0.06, 1.7, 4.5, boardX + 0.05, 1.75, 0, this.materials.trim, false);
    this.furnitureVisuals.push(board, frame);
    markNoRay(board);
    markNoRay(frame);

    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 24),
      new THREE.MeshBasicMaterial({ map: clockTexture(), toneMapped: false }),
    );
    clock.position.set(room.minX + 0.04, 2.25, -2.4);
    clock.rotation.y = Math.PI / 2;
    markNoRay(clock);
    this.scene.add(clock);

    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshBasicMaterial({ map: posterTexture(), toneMapped: false }),
    );
    poster.position.set(room.minX + 0.04, 1.45, 2.6);
    poster.rotation.y = Math.PI / 2;
    markNoRay(poster);
    this.scene.add(poster);
  }

  addDesk(x, z) {
    const { topW, topD, topH } = LAYOUT.desks;
    this.furnitureVisuals.push(this.addBox(topD, topH, topW, x, topH / 2, z, this.materials.desk, true));
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), this.materials.chair);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.06), this.materials.chair);
    back.position.set(0, 0.7, 0.18);
    chair.add(seat, back);
    chair.rotation.y = -Math.PI / 2;
    chair.position.set(x - 0.48, 0, z);
    markNoRay(chair);
    this.scene.add(chair);
    this.furnitureVisuals.push(chair);
  }

  buildDoor() {
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-LAYOUT.door.half, 0, LAYOUT.room.maxZ + LAYOUT.wall / 2);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(LAYOUT.door.half * 2, LAYOUT.door.height, 0.08),
      this.materials.door,
    );
    door.position.set(LAYOUT.door.half, LAYOUT.door.height / 2, 0);
    door.name = 'door-panel';
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xc8c2b4, metalness: 0.7, roughness: 0.3 }),
    );
    handle.position.set(LAYOUT.door.half * 2 - 0.16, 1.15, -0.06);
    this.doorPivot.add(door, handle);
    this.scene.add(this.doorPivot);
  }

  buildCharacters() {
    const customMate = createClassmate(THREE);
    const npc = customMate ? { group: customMate, legs: customMate.userData.legs ?? [], materials: customMate.userData.materials ?? [] } : makePerson(0x242833, 0xc4a48a);
    this.npc = npc.group;
    this.npcLegs = npc.legs;
    this.npcMaterials = npc.materials;
    this.npcPhase = 0;          // 步态相位，按位移推进
    this.npcIdlePhase = 0;      // 站姿呼吸相位
    this.npcSmoothYaw = 0;      // 平滑转向当前角度，会在idle/walking首次时自动对齐
    this.npcState = 'idle';     // 'idle' | 'walking' | 'waiting'
    this.npcWaitReached = false; // 是否第一次到达门口进入等待
    this.npcSaidWait = false;   // 是否已经说过"等等我"
    this.npcTurnTarget = null;  // 等待时面向玩家的目标角度
    this.npcDoorReopen = false; // 玩家1.5m推门标志
    this._npcFootstepAcc = 0;
    this.audioX = 0;
    this.audioZ = 0;
    this.npcPath = [
      new THREE.Vector3(-6.7, 0, LAYOUT.hall.z),
      new THREE.Vector3(0.15, 0, LAYOUT.hall.z),
      new THREE.Vector3(0.15, 0, LAYOUT.room.maxZ - 0.85),
    ];
    this.npcStandPos = new THREE.Vector3(-6.7, 0, LAYOUT.hall.z);
    markNoRay(this.npc);
    this.npc.visible = false;
    this.scene.add(this.npc);

    this.entity = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2438 });
    eyeMat.toneMapped = false;
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), eyeMat);
    this.eyeR = this.eyeL.clone();
    this.eyeL.position.set(-0.11, 1.62, 0);
    this.eyeR.position.set(0.11, 1.62, 0);
    const dark = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    dark.position.y = 1.45;
    this.entityLight = new THREE.PointLight(0xff2233, 0, 7, 2);
    this.entityLight.position.y = 1.6;
    this.entity.add(this.eyeL, this.eyeR, dark, this.entityLight);
    const customEyes = createEyes(THREE);
    if (customEyes) {
      this.entity.add(customEyes);
      this.eyeL.visible = false;
      this.eyeR.visible = false;
      if (customEyes.userData.eyeL) this.eyeL = customEyes.userData.eyeL;
      if (customEyes.userData.eyeR) this.eyeR = customEyes.userData.eyeR;
    }
    markNoRay(this.entity);
    this.entity.visible = false;
    this.scene.add(this.entity);
  }

  buildPickup() {
    this.pickup = cameraModel();
    this.pickup.position.set(LAYOUT.pickup.x, 0.12, LAYOUT.pickup.z);
    this.pickup.visible = false;
    markNoRay(this.pickup);
    this.scene.add(this.pickup);
    this.pickupLight = new THREE.PointLight(0xffe0b0, 0, 2.5, 2);
    this.pickupLight.position.set(LAYOUT.pickup.x, 0.4, LAYOUT.pickup.z);
    this.scene.add(this.pickupLight);
  }

  buildExit() {
    this.exitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.48),
      new THREE.MeshBasicMaterial({ map: exitTexture(), toneMapped: false, side: THREE.DoubleSide }),
    );
    this.exitSign.position.set(50.6, 2.2, LAYOUT.hall.z);
    this.exitSign.rotation.y = -Math.PI / 2;
    this.exitSign.visible = false;
    markNoRay(this.exitSign);
    this.scene.add(this.exitSign);
    this.exitLight = new THREE.PointLight(0x39ff86, 0, 18, 2);
    this.exitLight.position.set(50.6, 2.2, LAYOUT.hall.z);
    this.scene.add(this.exitLight);
  }

  buildProps() {
    const specs = [
      { mesh: bottleMesh(), x: 7.4, z: 2.75, r: 0.18 },
      { mesh: paperMesh(), x: -8.6, z: 0, r: 0.22 },
      { mesh: bookMesh(), x: 3.2, z: -2.75, r: 0.2 },
      { mesh: mopMesh(), x: -8.5, z: 4.7, r: 0.16 },
    ];
    specs.push(...extraProps());
    for (const spec of specs) {
      spec.mesh.position.set(spec.x, 0, spec.z);
      markNoRay(spec.mesh);
      this.scene.add(spec.mesh);
      this.props.push({ mesh: spec.mesh, x: spec.x, z: spec.z, homeX: spec.x, homeZ: spec.z, r: spec.r });
    }
    const trash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1d2420, roughness: 1 }),
    );
    trash.scale.y = 0.75;
    trash.position.set(-8.8, 0.18, -5.15);
    trash.userData.fakeAnomaly = true;
    this.scene.add(trash);
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0x93a0b4, CONFIG.ambient);
    this.scene.add(this.ambient);
    this.scene.add(new THREE.HemisphereLight(0x1b2433, 0x1a120c, CONFIG.hemi));
    this.roomLights = [];
    this.fixtureMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, emissive: 0xffc89a, emissiveIntensity: 0.8 });
    for (const x of [-6, -2, 2, 6]) {
      for (const z of [-3, 3]) this.addRoomLight(x, z);
    }
    this.roomLight = this.roomLights[0];
    this.doorLight = new THREE.PointLight(0xffc59a, CONFIG.doorLight, 8, 2);
    this.doorLight.position.set(0, 2.15, LAYOUT.room.maxZ + 0.45);
    this.scene.add(this.doorLight);
    // 走廊 106 米长，雾的可见距离只有十几米，5 米一盏等于让每帧多算一倍光照。
    // 改成 10 米一盏，近处观感几乎不变，片元光照循环少一半。
    for (let x = LAYOUT.hall.minX + 10; x <= LAYOUT.hall.maxX - 5; x += 10) {
      const lamp = new THREE.PointLight(0x8ea0c0, CONFIG.hallLamp, 14, 2);
      lamp.position.set(x, 2.55, LAYOUT.hall.z);
      this.scene.add(lamp);
      this.hallLamps.push(lamp);
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.06, 0.16),
        this.materials.bulb,
      );
      bulb.position.copy(lamp.position);
      markNoRay(bulb);
      this.scene.add(bulb);
    }
  }

  addRoomLight(x, z) {
    const light = new THREE.PointLight(0xffb27a, CONFIG.roomLight, 12, 2);
    light.position.set(x, 2.72, z);
    this.scene.add(light);
    this.roomLights.push(light);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.26), this.fixtureMat);
    fixture.position.set(x, 3.05, z);
    markNoRay(fixture);
    this.scene.add(fixture);
  }

  addBox(w, h, d, x, y, z, material, collider) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    if (collider) {
      this.staticColliders.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    }
    return mesh;
  }

  addPlane(w, d, x, y, z, material) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return mesh;
  }
}

function makeMaterials() {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.86, metalness: 0 });
  wood.map.repeat.set(6, 5);
  return {
    ground: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 }),
    wood,
    wall: new THREE.MeshStandardMaterial({ map: grainTexture('#3c433c'), color: 0xffffff, roughness: 0.92 }),
    hall: new THREE.MeshStandardMaterial({ map: grainTexture('#2a2e33'), color: 0xffffff, roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 1 }),
    desk: new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.78 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.8 }),
    board: new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.7 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0x6e3438, roughness: 0.95, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9bb7c9,
      transparent: true,
      opacity: 0.22,
      roughness: 0.06,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    door: new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 0.72 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0x22262c, emissive: 0x8ea0c0, emissiveIntensity: 0.3 }),
  };
}

function makePerson(clothColor, skinColor) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.86 });
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.22), cloth);
  torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin);
  head.position.y = 1.66;
  const legGeo = new THREE.BoxGeometry(0.13, 0.62, 0.14);
  legGeo.translate(0, -0.31, 0);
  const legL = new THREE.Mesh(legGeo, cloth);
  const legR = new THREE.Mesh(legGeo, cloth);
  legL.position.set(-0.1, 0.78, 0);
  legR.position.set(0.1, 0.78, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.48, 0.1);
  const armL = new THREE.Mesh(armGeo, cloth);
  const armR = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.28, 1.18, 0);
  armR.position.set(0.28, 1.18, 0);
  group.add(torso, head, legL, legR, armL, armR);
  return { group, legs: [legL, legR], materials: [cloth, skin] };
}

function bottleMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 0.26, 10),
    new THREE.MeshStandardMaterial({ color: 0x8fb8c8, transparent: true, opacity: 0.78, roughness: 0.2 }),
  );
  body.position.y = 0.14;
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: 0xd7d2c6, roughness: 0.4 }),
  );
  cap.position.y = 0.29;
  group.add(body, cap);
  return group;
}

function paperMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.03, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.9 }),
  );
  mesh.position.y = 0.02;
  return mesh;
}

function bookMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.05, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x6d2e2a, roughness: 0.75 }),
  );
  mesh.position.y = 0.03;
  return mesh;
}

function mopMesh() {
  const group = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6),
    new THREE.MeshStandardMaterial({ color: 0xb7a07a, roughness: 0.7 }),
  );
  stick.position.y = 0.7;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x6a6e68, roughness: 1 }),
  );
  head.position.y = 0.08;
  group.add(stick, head);
  return group;
}

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a2c20';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = i % 2 ? '#32261c' : '#463628';
    ctx.fillRect(0, i * 32, 256, 30);
  }
  return canvasTexture(canvas, true);
}

function grainTexture(hex) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i += 1) {
    const shade = 18 + Math.random() * 40;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const texture = canvasTexture(canvas, true);
  texture.repeat.set(3, 2);
  return texture;
}

function clockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e6e0d2';
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('03:17', 128, 132);
  return canvasTexture(canvas, false);
}

function posterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d2c4';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#1d3d2e';
  ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('安全出口', 128, 80);
  ctx.font = '80px sans-serif';
  ctx.fillText('↑', 128, 190);
  ctx.font = '24px "Microsoft YaHei", sans-serif';
  ctx.fillText('本教室', 128, 260);
  return canvasTexture(canvas, false);
}

function exitTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#042216';
  ctx.fillRect(0, 0, 512, 180);
  ctx.strokeStyle = '#5dff9d';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 164);
  ctx.fillStyle = '#5dff9d';
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 256, 96);
  return canvasTexture(canvas, false);
}

function canvasTexture(canvas, repeat) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

function markNoRay(object) {
  object.traverse((child) => {
    child.userData.noRay = true;
  });
}

/** 固定种子的伪随机，让破窗形状每次运行都一样。 */
function seededRandom(seed) {
  let s = Math.floor(Math.abs(seed) * 1000) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function flagged(object, key) {
  let current = object;
  while (current) {
    if (current.userData?.[key]) return true;
    current = current.parent;
  }
  return false;
}

function findTag(object) {
  let current = object;
  while (current) {
    if (current.userData?.anomalyLevel || current.userData?.fakeAnomaly) return current.userData;
    current = current.parent;
  }
  return null;
}

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) materials.add(child.material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if (material.map) material.map.dispose();
    material.dispose();
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

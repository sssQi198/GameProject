import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { LAYOUT } from './layout.js';
import { moveCircle, stepDynamicBodies } from './collision.js';
import { cameraModel, createAnomaly } from './anomalies.js';
import { emit } from './team/bus.js';
import { EVENT, tagPhysical } from './team/contract.js';
import { extraColliders, createSceneExtra } from './team/m1.js';
import { createClassmate, createEyes } from './team/m2.js';
import { extraProps, isFlickerDark, tick as tickRoom } from './team/p3.js';

const FOG = 0x07080c;
/** 门框进深 0.18。所有墙厚用 LAYOUT.wall（0.15），收到门框和相邻墙的外沿，只相接、不穿插。 */
const DOOR_FRAME = { jambW: 0.12, jambD: 0.18, headH: 0.14 };
/** 窗帘：宽 0.72，从 2.72 垂到窗台上方 5 cm。几何原点在顶边中点。 */
const CURTAIN_W = 0.72;
const CURTAIN_TOP = 2.72;
const CURTAIN_HEM = 1.0;
const CURTAIN_H = CURTAIN_TOP - CURTAIN_HEM;
/** 与 generate_furniture_glb.py 同一套偏移。第一关那套桌椅（−7.4, 4）保持原位。 */
const SHOVED_DESK_YAW = [
  { x: -7.4, z: -4, yaw: 0.3 },
  { x: 4.6, z: -1.5, yaw: -0.26 },
  { x: -1.8, z: 1.5, yaw: 0.19 },
  { x: 6.8, z: -4, yaw: 0.14 },
];
const TURNED_CHAIR_YAW = [
  { x: -4.6, z: 4, yaw: 3.05 },
  { x: 1.8, z: -4, yaw: -1.9 },
  { x: 6.8, z: 1.5, yaw: 2.2 },
  { x: -1.8, z: -4, yaw: 0.9 },
];
/** 座面金属框 0.45 见方。转过角度后，轴对齐盒子要包住四个角。 */
const CHAIR_HALF = 0.225;
const CHAIR_HEIGHT = 0.96;

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
    this.supportColliders = [
      {
        minX: LAYOUT.hall.minX - 2,
        maxX: LAYOUT.hall.maxX + 2,
        minY: -4,
        maxY: 0,
        minZ: -12,
        maxZ: LAYOUT.alcove.backZ + 2,
      },
      {
        minX: LAYOUT.room.minX,
        maxX: LAYOUT.room.maxX,
        minY: -4,
        maxY: 0.03,
        minZ: LAYOUT.room.minZ,
        maxZ: LAYOUT.room.maxZ,
      },
    ];
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
    for (const prop of this.props) this.resetItem(prop);
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

  /** 带 physical 标签的物品：三个受力点都受重力，被脚踢到时按接触点的碰撞力运动。 */
  stepItems(dt, player) {
    const bodies = [];
    for (const prop of this.props) {
      if (prop.physical) bodies.push(prop);
    }
    const speed = Math.hypot(player.vx, player.vz);
    let ox = 0;
    let oz = 0;
    if (speed > 0.15) {
      ox = (player.vx / speed) * 0.1;
      oz = (player.vz / speed) * 0.1;
    }
    const foot = 0.24;
    const kinematic = {
      minX: player.x - player.radius + ox,
      maxX: player.x + player.radius + ox,
      minY: player.feetY,
      maxY: player.feetY + foot,
      minZ: player.z - player.radius + oz,
      maxZ: player.z + player.radius + oz,
      vx: player.vx,
      vy: player.vy,
      vz: player.vz,
      kick: true,
    };
    stepDynamicBodies(bodies, this.getColliders(), this.supportColliders, kinematic, dt);
    for (const prop of this.props) this.placeItemMesh(prop);
  }

  placeItemMesh(prop) {
    const rot = prop.rot;
    const pivot = prop.pivotY;
    prop.mesh.position.set(
      prop.x - rot[1] * pivot,
      prop.y - rot[4] * pivot,
      prop.z - rot[7] * pivot,
    );
    prop.mesh.quaternion.set(prop.qx, prop.qy, prop.qz, prop.qw);
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
    this.scene.fog.density = density / Math.max(CONFIG.brightness, 0.05);

    if (this.debugColliders && this._debugDoor !== this.doorOpen) this.setColliderDebug(true);
  }

  updateShowcase(time, camera) {
    camera.position.set(-1.6 + Math.sin(time * 0.18) * 0.25, 1.64, -0.35);
    camera.lookAt(8.6, 1.5, 0.2);
  }

  /**
   * 灯光调节 —— 后续AI接管者注意：
   * – 整体亮度：只改 `CONFIG.brightness`（1 = 原版暗光）
   * – 走廊灯颜色/亮度：调 `CONFIG.hallLamp`（config._lighting）或下方 `this.hallLamps`
   * – 走廊透光（doorLight）：受 `_doorLightReveal` 控制，在 hideNpc() 设为 true
   * - 环境光/雾：调 `CONFIG.ambient` 和 scene.fog.density
   */
  updateLights(env) {
    const menu = env.mood === 'menu';
    const chase = env.mood === 'chase';
    const calm = env.mood === 'calm';
    const bright = Math.max(CONFIG.brightness, 0);
    this.flickerDark = isFlickerDark(env.time, env.mood);
    const base = calm ? CONFIG.roomLight * 0.3 : chase ? 1.2 : CONFIG.roomLight;
    const scaled = base * 0.46;
    const flickerCut = bright > 1 ? 1 : 0.04;
    const raw = menu ? CONFIG.roomLight * 0.42 : this.flickerDark ? scaled * flickerCut : scaled;
    const intensity = raw * bright;
    for (const light of this.roomLights) light.intensity = intensity;
    this.fixtureMat.emissiveIntensity = intensity > 4 ? 0.75 : 0.05;
    // doorLight 走廊透光：_doorLightReveal=true(NPC进教室后)才亮，避免出事前走廊突然亮起
    const door = this._doorLightReveal ? CONFIG.doorLight : (chase ? 0 : 6);
    this.doorLight.intensity = door * bright;
    const lamp = chase ? 0 : calm ? CONFIG.hallLamp * 1.6 : CONFIG.hallLamp;
    for (const light of this.hallLamps) light.intensity = lamp * bright;
    const ambient = calm ? CONFIG.ambient * 2.4 : CONFIG.ambient;
    this.ambient.intensity = ambient * bright;
    if (this.hemi) this.hemi.intensity = CONFIG.hemi * bright;
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
      const targetYaw = Math.atan2(dx, dz);
      const diff = targetYaw - this.npcSmoothYaw;
      let wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turnRate = 3.0;
      const maxTurn = turnRate * dt;
      if (Math.abs(wrapped) <= maxTurn) {
        this.npcSmoothYaw = targetYaw;
      } else {
        this.npcSmoothYaw += Math.sign(wrapped) * maxTurn;
      }
      this.npc.rotation.y = this.npcSmoothYaw;
      this.npcPhase += step / 1.0;
      this.swingBody(this.npcPhase);
      const bounceY = Math.sin(this.npcPhase * Math.PI * 4) * 0.012;
      this.npc.position.y = bounceY;
      this.npc.rotation.x = 0.0;
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

  swingBody(time) {
    const legs = this.npcLegs;
    const arms = this.npcArms;
    const torso = this.npcTorso;
    // time = npcPhase，一次完整步幅(1.0m)对应 phase 增加1，即2π
    const theta = time * Math.PI * 2;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // 腿：摆幅 0.42 rad，与位移同步
    const legSwing = sinT * 0.42;
    if (legs?.[0]) legs[0].rotation.x = legSwing;
    if (legs?.[1]) legs[1].rotation.x = -legSwing;

    // 手臂：用平滑衰减的三角函数替代纯反相，更自然
    // 手臂摆动幅度比腿小，且有相位延迟
    // 使用 sin^3 轮廓模拟自然拮抗摆动，肘在摆臂后段更弯曲
    const armPhase = theta + 0.3;   // 略滞后于腿
    const armRaw = Math.sin(armPhase);
    // 限幅 + 软曲线，避免机械感
    const armSwing = Math.sign(armRaw) * Math.pow(Math.abs(armRaw), 0.9) * 0.22;
    if (arms?.[0]) arms[0].rotation.x = -armSwing;
    if (arms?.[1]) arms[1].rotation.x = armSwing;

    // 躯干：改为整体上下起伏（整个npc的位置y浮动），不单独移动torso
    // 用 2倍步频的单位周期起伏，幅度 0.012m
    if (torso) {
      // 保持 torso 位置归零，起伏改为 npc.position.y
      torso.position.y = 0;
    }
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
    const hh = hall.height;
    // 沿 X 的墙包住转角，沿 Z 的墙收到它的内侧面。
    const span = (x0, x1, z0, z1, height, material) => {
      this.addBox(x1 - x0, height, z1 - z0, (x0 + x1) / 2, height / 2, (z0 + z1) / 2, material, true);
    };

    span(room.minX - t, room.maxX + t, room.minZ - t, room.minZ, h, this.materials.wall);
    span(room.maxX, room.maxX + t, room.minZ, room.maxZ + t, h, this.materials.wall);
    span(room.minX - t, room.minX, room.minZ, room.maxZ + t, h, this.materials.wall);

    const doorHalf = LAYOUT.door.half;
    this.buildCorridorWall();
    this.doorCollider = {
      minX: -doorHalf,
      maxX: doorHalf,
      minY: 0,
      maxY: LAYOUT.door.height,
      minZ: room.maxZ,
      maxZ: room.maxZ + t,
    };

    const faceZ = room.maxZ + t;
    const northOuter = hall.maxZ + t;
    span(hall.minX - t, room.minX - t, room.maxZ, faceZ, hh, this.materials.hall);
    span(room.maxX + t, hall.maxX + t, room.maxZ, faceZ, hh, this.materials.hall);
    span(hall.minX - t, alcove.minX, hall.maxZ, northOuter, hh, this.materials.hall);
    span(alcove.maxX, hall.maxX + t, hall.maxZ, northOuter, hh, this.materials.hall);
    span(hall.minX - t, hall.minX, faceZ, hall.maxZ, hh, this.materials.hall);
    span(hall.maxX, hall.maxX + t, faceZ, hall.maxZ, hh, this.materials.hall);

    const alcoveDepth = alcove.backZ - hall.maxZ;
    span(alcove.minX - t, alcove.minX, northOuter, alcove.backZ, hh, this.materials.hall);
    span(alcove.maxX, alcove.maxX + t, northOuter, alcove.backZ, hh, this.materials.hall);
    span(alcove.minX - t, alcove.maxX + t, alcove.backZ, alcove.backZ + t, hh, this.materials.hall);
    this.addPlane(alcove.maxX - alcove.minX, alcoveDepth, (alcove.minX + alcove.maxX) / 2, 0.02, (hall.maxZ + alcove.backZ) / 2, floorMat);

    this.addBox(room.maxX - room.minX + 1, 0.16, room.maxZ - room.minZ + 1, 0, room.height + 0.08, 0, this.materials.ceiling, false);
    const ceilZ0 = room.maxZ + t;
    const ceilZ1 = hall.maxZ;
    this.addBox(hall.maxX - hall.minX, 0.14, ceilZ1 - ceilZ0, (hall.minX + hall.maxX) / 2, hall.height + 0.05, (ceilZ0 + ceilZ1) / 2, this.materials.ceiling, false);

    // 墙面线脚每 4 米一条，±20 米对调后仍然对齐
    for (let x = hall.minX + 4; x < hall.maxX; x += 4) {
      if (Math.abs(x) < 1.4) continue;
      if (x <= room.minX - t || x >= room.maxX + t) {
        this.addBox(0.08, 1.2, 0.06, x, 1.5, faceZ + 0.04, this.materials.trim, false);
      }
      if (x < alcove.minX - 0.5 || x > alcove.maxX + 0.5) {
        this.addBox(0.08, 1.2, 0.06, x, 1.5, hall.maxZ - 0.04, this.materials.trim, false);
      }
    }
  }

  buildCorridorWall() {
    const { room, door } = LAYOUT;
    const h = room.height;
    const { jambW, headH } = DOOR_FRAME;
    const t = LAYOUT.wall;
    const z = room.maxZ + LAYOUT.wall / 2;
    const outer = door.half + jambW;
    const lintelTop = door.height + headH;
    const lintelH = h - lintelTop;
    this.addBox(outer * 2, lintelH, t, 0, lintelTop + lintelH / 2, z, this.materials.wall, false);
    this.curtains = [];
    this.windowIndex = 0;
    // 窗洞不再铺实墙，只留窗台、窗间墙和过梁
    this.addWindowRun(room.minX, -outer, z, t, h);
    this.addWindowRun(outer, room.maxX, z, t, h);
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
    this.addBox(span, sill, t, mid, sill / 2, northZ, wall, true);
    this.addBox(span, h - winTop, t, mid, winTop + (h - winTop) / 2, northZ, wall, false);
    let cursor = x0;
    for (let i = 0; i < count; i += 1) {
      this.addBox(pier, winTop - sill, t, cursor + pier / 2, (sill + winTop) / 2, northZ, wall, false);
      cursor += pier;
      const center = cursor + winW / 2;
      this.windowIndex = (this.windowIndex || 0) + 1;
      const broken = this.windowIndex === 2 || this.windowIndex === 5;
      this.addWindow(center, (sill + winTop) / 2, winW, winTop - sill, northZ, sill, winTop, broken);
      this.addCurtain(center, sill);
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

  addCurtain(x, sill = 0.95) {
    const { room } = LAYOUT;
    const z = room.maxZ - 0.05;
    const hem = sill + 0.05;
    const top = CURTAIN_TOP;
    const h = top - hem;
    if (!this.curtainGeometry) {
      const geo = new THREE.PlaneGeometry(CURTAIN_W, h, 12, 22);
      geo.translate(0, -h / 2, 0);
      this.curtainGeometry = geo;
    }
    // 从讲台（+X）往后每扇都是软布。脸上那一块布在着色器里按住，避免五官和布对穿。
    for (const side of [-0.55, 0.55]) {
      const outer = side < 0 ? 0 : 1;
      const material = outer === 0 ? this.materials.curtainSoft : this.materials.curtainSoftRight;
      const curtain = new THREE.Mesh(this.curtainGeometry, material);
      curtain.position.set(x + side, top, z);
      const gust = makeCurtainGust(outer);
      curtain.userData.gust = gust;
      curtain.onBeforeRender = () => {
        const data = curtain.material.userData;
        const buf = data.uNodeX?.value;
        if (buf) {
          let i = 0;
          for (const strip of gust.nodes) {
            for (const node of strip) {
              buf[i] = node.x;
              i += 1;
            }
          }
        }
        if (data.uPull) data.uPull.value = gust.pull;
      };
      markNoRay(curtain);
      this.scene.add(curtain);
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
    const pose = chairPose(x, z);
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), this.materials.chair);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.06), this.materials.chair);
    back.position.set(0, 0.7, 0.18);
    chair.add(seat, back);
    chair.rotation.y = -Math.PI / 2;
    chair.position.set(pose.x, 0, pose.z);
    markNoRay(chair);
    this.scene.add(chair);
    this.furnitureVisuals.push(chair);
    const reach = CHAIR_HALF * (Math.abs(Math.cos(pose.yaw)) + Math.abs(Math.sin(pose.yaw)));
    this.staticColliders.push({
      minX: pose.x - reach,
      maxX: pose.x + reach,
      minY: 0,
      maxY: CHAIR_HEIGHT,
      minZ: pose.z - reach,
      maxZ: pose.z + reach,
    });
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
    this.buildDoorFrame();
  }

  buildDoorFrame() {
    const { door, room, wall } = LAYOUT;
    const { jambW, jambD, headH } = DOOR_FRAME;
    const z = room.maxZ + wall / 2;
    const leftX = -door.half - jambW / 2;
    const rightX = door.half + jambW / 2;
    this.addBox(jambW, door.height, jambD, leftX, door.height / 2, z, this.materials.door, true);
    this.addBox(jambW, door.height, jambD, rightX, door.height / 2, z, this.materials.door, true);
    const span = door.half * 2 + jambW * 2;
    this.addBox(span, headH, jambD, 0, door.height + headH / 2, z, this.materials.door, false);
  }

  buildCharacters() {
    const customMate = createClassmate(THREE);
    const npc = customMate ? {
      group: customMate,
      legs: customMate.userData.legs ?? [],
      arms: customMate.userData.arms ?? [],
      torso: customMate.userData.torso ?? null,
      materials: customMate.userData.materials ?? [],
    } : makePerson(0x242833, 0xc4a48a);
    this.npc = npc.group;
    this.npcLegs = npc.legs;
    this.npcArms = npc.arms;
    this.npcTorso = npc.torso;
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
      { mesh: bottleMesh(), x: 7.4, z: 2.75, hx: 0.07, hy: 0.16, hz: 0.07, pivotY: 0.16, mass: 0.45, physical: true },
      { mesh: paperMesh(), x: -8.6, z: 0, hx: 0.14, hy: 0.016, hz: 0.11, pivotY: 0, mass: 0.12, physical: true },
      { mesh: bookMesh(), x: 3.2, z: -2.75, hx: 0.11, hy: 0.025, hz: 0.15, pivotY: 0, mass: 0.55, physical: true },
      { mesh: mopMesh(), x: -8.5, z: 4.7, hx: 0.14, hy: 0.66, hz: 0.06, pivotY: 0.66, mass: 1.1, physical: true },
    ];
    for (const extra of extraProps()) {
      const radius = extra.r ?? 0.2;
      specs.push({
        mesh: extra.mesh,
        x: extra.x,
        z: extra.z,
        hx: extra.hx ?? radius,
        hy: extra.hy ?? radius,
        hz: extra.hz ?? radius,
        pivotY: extra.pivotY ?? (extra.hy ?? radius),
        mass: extra.mass ?? 0.4,
        physical: Boolean(extra.physical) || flagged(extra.mesh, 'physical'),
      });
    }
    for (const spec of specs) {
      markNoRay(spec.mesh);
      this.scene.add(spec.mesh);
      this.addItem(spec);
    }
    const trash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1d2420, roughness: 1 }),
    );
    trash.scale.y = 0.75;
    trash.userData.fakeAnomaly = true;
    this.scene.add(trash);
    this.addItem({
      mesh: trash,
      x: -8.8,
      z: -5.15,
      hx: 0.28,
      hy: 0.21,
      hz: 0.28,
      pivotY: 0,
      mass: 0.8,
      physical: true,
    });
  }

  floorTop(x, z) {
    const room = LAYOUT.room;
    if (x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ) return 0.03;
    return 0;
  }

  /** 中心受力点在碰撞框中心。中心轴是最长的那条棱，两端受力点贴在轴的两头。 */
  addItem(spec) {
    if (spec.physical) tagPhysical(spec.mesh);
    const mass = spec.mass ?? 0.4;
    const hx = spec.hx;
    const hy = spec.hy;
    const hz = spec.hz;
    const axis = hy >= hx && hy >= hz ? 1 : (hx >= hz ? 0 : 2);
    const extent = [hx, hy, hz][axis];
    const end = [0, 0, 0];
    end[axis] = extent;
    const inertia = Math.max(mass * (hx * hx + hy * hy + hz * hz) / 3, 1e-4);
    const item = {
      mesh: spec.mesh,
      hx,
      hy,
      hz,
      pivotY: spec.pivotY,
      mass,
      invMass: 1 / mass,
      invI: 1 / inertia,
      endX: end[0],
      endY: end[1],
      endZ: end[2],
      x: spec.x,
      y: this.floorTop(spec.x, spec.z) + hy,
      z: spec.z,
      vx: 0,
      vy: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      rot: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      forceX: 0,
      forceY: 0,
      forceZ: 0,
      end0X: 0,
      end0Y: 0,
      end0Z: 0,
      end1X: 0,
      end1Y: 0,
      end1Z: 0,
      grounded: true,
      physical: flagged(spec.mesh, 'physical'),
      homeX: spec.x,
      homeZ: spec.z,
    };
    item.homeY = item.y;
    this.resetItem(item);
    this.props.push(item);
    return item;
  }

  resetItem(item) {
    item.x = item.homeX;
    item.y = item.homeY;
    item.z = item.homeZ;
    item.vx = 0;
    item.vy = 0;
    item.vz = 0;
    item.wx = 0;
    item.wy = 0;
    item.wz = 0;
    item.qx = 0;
    item.qy = 0;
    item.qz = 0;
    item.qw = 1;
    item.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    item.forceX = 0;
    item.forceY = 0;
    item.forceZ = 0;
    item.end0X = 0;
    item.end0Y = 0;
    item.end0Z = 0;
    item.end1X = 0;
    item.end1Y = 0;
    item.end1Z = 0;
    item.grounded = true;
    this.placeItemMesh(item);
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0x93a0b4, CONFIG.ambient);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x1b2433, 0x1a120c, CONFIG.hemi);
    this.scene.add(this.hemi);
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
        minY: y - h / 2,
        maxY: y + h / 2,
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

/** 4 条竖条，每条上段、中段、下摆。靠墙的一侧 outer 为 0 或 1。 */
function makeCurtainGust(outer) {
  const nodes = [];
  for (let strip = 0; strip < 4; strip += 1) {
    nodes.push([
      { x: 0, v: 0 },
      { x: 0, v: 0 },
      { x: 0, v: 0 },
    ]);
  }
  return {
    outer,
    nodes,
    drive: 0,
    amp: 3.8 + Math.random() * 1.6,
    speed: 0.45 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
    pull: 0.18 + Math.random() * 0.22,
  };
}

/**
 * 软布：顶边钉死，下摆做竖褶，只往房间（局部 −Z）鼓。
 * 靠窗间墙的那条边不横移，避免摆进墙和窗框。
 * 12 个质点位移和 uPull 由每块窗帘在绘制前写入。
 * 脸上的一块区域位移为 0。
 * outer 为 0 时左缘贴墙，为 1 时右缘贴墙。
 */
function attachCurtainSway(material, outer, sway) {
  const uOuter = { value: outer };
  material.userData.uTime = sway.uTime;
  material.userData.uAmp = sway.uAmp;
  material.userData.uNodeX = sway.uNodeX;
  material.userData.uPull = sway.uPull;
  material.userData.uFace = sway.uFace;
  material.userData.uOuter = uOuter;
  material.customProgramCacheKey = () => 'curtain-flex-lattice';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway.uTime;
    shader.uniforms.uAmp = sway.uAmp;
    shader.uniforms.uNodeX = sway.uNodeX;
    shader.uniforms.uPull = sway.uPull;
    shader.uniforms.uFace = sway.uFace;
    shader.uniforms.uOuter = uOuter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CURTAIN_SWAY_PARS}`)
      .replace('#include <beginnormal_vertex>', CURTAIN_SWAY_NORMAL)
      .replace('#include <begin_vertex>', CURTAIN_SWAY_VERTEX);
  };
}

const CURTAIN_SWAY_PARS = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uNodeX[12];
uniform float uPull;
uniform vec2 uFace;
uniform float uOuter;
const float CURTAIN_W = ${CURTAIN_W.toFixed(4)};
const float CURTAIN_H = ${CURTAIN_H.toFixed(4)};

float curtainFade(float t) {
  return t * t * (3.0 - 2.0 * t);
}

float curtainNode(int strip, int row) {
  if (row < 0) return 0.0;
  return uNodeX[strip * 3 + row];
}

float curtainLattice(float vx, float drop) {
  float s = clamp(vx, 0.0, 1.0) * 3.0;
  float s0 = min(floor(s), 2.0);
  float sf = curtainFade(clamp(s - s0, 0.0, 1.0));
  float h = clamp(drop, 0.0, 1.0) * 3.0;
  float h0 = min(floor(min(h, 2.999)), 2.0);
  float hf = curtainFade(clamp(h - h0, 0.0, 1.0));
  int sa = int(s0);
  int ra = int(h0) - 1;
  float left = mix(curtainNode(sa, ra), curtainNode(sa, ra + 1), hf);
  float right = mix(curtainNode(sa + 1, ra), curtainNode(sa + 1, ra + 1), hf);
  return mix(left, right, sf);
}

vec3 curtainOff(vec3 pos) {
  float vx = clamp(pos.x / CURTAIN_W + 0.5, 0.0, 1.0);
  float vy = pos.y / CURTAIN_H + 1.0;
  float phase = modelMatrix[3].x;
  float drop = max(1.0 - vy, 0.0);
  float hang = drop <= 0.0 ? 0.0 : pow(drop, 1.2);

  float fold = sin(9.0 * vy + phase * 1.7) * 0.040 + sin(3.2 * vy + phase * 0.4) * 0.024;
  float windX = sin(6.0 * vy + uTime * 0.85 + phase) * 0.008 * uAmp;
  float windZ = (sin(uTime * 0.65 + phase) * 0.5 + 0.5) * 0.010 * uAmp
    + (sin(8.0 * vx + uTime * 0.4 + phase) * 0.5 + 0.5) * 0.004 * uAmp;

  float fromOuter = abs(vx - uOuter);
  float edgeT = clamp(fromOuter / 0.55, 0.0, 1.0);
  float skirt = edgeT * edgeT * (3.0 - 2.0 * edgeT);

  float ang = vx * 6.0 * PI;
  float pleatAmt = (1.0 - sin(ang)) * 0.5;
  float gather = cos(ang) * 0.012 * hang;
  float swayX = curtainLattice(vx, drop);
  float neighbor = curtainLattice(clamp(vx + 0.33, 0.0, 1.0), drop);
  float shear = min(abs(neighbor - swayX), 0.08);
  float pleatDepth = pleatAmt * (0.035 * hang + shear * 0.15);
  float hem = pleatAmt * 0.020 * hang;

  float xRaw = (fold + windX) * hang + gather + swayX;
  float yRaw = -hem;
  float zRaw = windZ * hang + pleatDepth + abs(swayX) * uPull;

  float wx = modelMatrix[3].x + pos.x;
  float wy = modelMatrix[3].y + pos.y;
  float faceU = (wx - uFace.x) / 0.32;
  float faceV = (wy - uFace.y) / 0.38;
  float hold = smoothstep(1.0, 2.2, faceU * faceU + faceV * faceV);
  return vec3(xRaw * skirt, yRaw * skirt, -(zRaw * skirt)) * hold;
}
`;

const CURTAIN_SWAY_NORMAL = /* glsl */ `
vec3 curtainHere = curtainOff(position);
vec3 curtainTx = vec3(0.025, 0.0, 0.0) + curtainOff(position + vec3(0.025, 0.0, 0.0)) - curtainHere;
vec3 curtainTy = vec3(0.0, 0.025, 0.0) + curtainOff(position + vec3(0.0, 0.025, 0.0)) - curtainHere;
vec3 objectNormal = normalize(cross(curtainTx, curtainTy));
#ifdef USE_TANGENT
	vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

const CURTAIN_SWAY_VERTEX = /* glsl */ `
vec3 transformed = vec3(position);
transformed += curtainOff(position);
#ifdef USE_ALPHAHASH
	vPosition = vec3(position);
#endif
`;

function makeMaterials() {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.86, metalness: 0 });
  wood.map.repeat.set(6, 5);
  const wall = new THREE.MeshStandardMaterial({ map: grainTexture('#3c433c'), color: 0xffffff, roughness: 0.92 });
  const curtain = new THREE.MeshStandardMaterial({ color: 0x6e3438, roughness: 0.95, side: THREE.DoubleSide });
  const sway = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uNodeX: { value: new Float32Array(12) },
    uPull: { value: 0.35 },
    uFace: { value: new THREE.Vector2(LAYOUT.curtainFace.x, LAYOUT.curtainFace.y) },
  };
  const curtainSoft = curtain.clone();
  const curtainSoftRight = curtain.clone();
  attachCurtainSway(curtainSoft, 0, sway);
  attachCurtainSway(curtainSoftRight, 1, sway);
  return {
    ground: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 }),
    wood,
    wall,
    hall: wall,
    ceiling: new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 1 }),
    desk: new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.78 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 0.8 }),
    board: new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x1a1c1a, roughness: 0.7 }),
    curtain,
    curtainSoft,
    curtainSoftRight,
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
  return { group, legs: [legL, legR], arms: [armL, armR], torso, materials: [cloth, skin] };
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

function sameSpot(spot, x, z) {
  return Math.abs(spot.x - x) < 0.001 && Math.abs(spot.z - z) < 0.001;
}

/** 与 generate_furniture_glb.py 的 jitter 同一条线性同余。 */
function furnitureJitter(seed, amount) {
  let s = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  s = (Math.imul(s, 1103515245) + 12345) >>> 0;
  return ((s / 0xFFFFFFFF) * 2 - 1) * amount;
}

function chairPose(dx, dz) {
  const seed = Math.trunc((dx + 20) * 97 + (dz + 10) * 13);
  const shiftX = furnitureJitter(seed, 0.035);
  const shiftZ = furnitureJitter(seed + 1, 0.045);
  const shoved = SHOVED_DESK_YAW.find((spot) => sameSpot(spot, dx, dz));
  const deskYaw = shoved ? shoved.yaw : furnitureJitter(seed + 2, 0.035);
  const originX = dx + shiftX;
  const originZ = dz + shiftZ;
  const turned = TURNED_CHAIR_YAW.find((spot) => sameSpot(spot, dx, dz));
  if (turned) {
    return {
      x: originX - 0.72,
      z: originZ + furnitureJitter(seed + 4, 0.22),
      yaw: turned.yaw,
    };
  }
  return {
    x: originX - 0.48,
    z: originZ,
    yaw: deskYaw + furnitureJitter(seed + 3, 0.06),
  };
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

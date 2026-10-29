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
    this.doorOpen = false;
    this.doorAngle = 0;
    this.loopEnabled = false;
    this.flickerDark = false;
    this.debugColliders = false;
    this.debugGroup = null;
    this._debugDoor = null;

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
  }

  reset() {
    this.clearAnomalies();
    this.doorOpen = false;
    this.doorAngle = 0;
    this.doorPivot.rotation.y = 0;
    this.loopEnabled = false;
    this.npcDone = false;
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
    this.npcIndex = 1;
    this.npc.visible = true;
    this.setNpcOpacity(1);
    this.npc.position.copy(this.npcPath[0]);
  }

  hideNpc() {
    this.npc.visible = false;
    this.npcDone = true;
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

  setDoorOpen(open, snap = false) {
    this.doorOpen = open;
    if (snap) {
      this.doorAngle = open ? 1.42 : 0;
      this.doorPivot.rotation.y = this.doorAngle;
    }
    emit(EVENT.door, { open });
  }

  spawnUpTo(count) {
    for (let level = 1; level <= count; level += 1) {
      if (this.anomalies.some((item) => item.level === level)) continue;
      const anomaly = createAnomaly(level);
      if (anomaly.parent === 'door') this.doorPivot.add(anomaly.group);
      else this.scene.add(anomaly.group);
      this.anomalies.push(anomaly);
    }
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
      prop.x = clamp(prop.x, -5.45, 5.45);
      prop.z = clamp(prop.z, -4.45, 4.2);
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
    camera.position.set(1.85 + Math.sin(time * 0.18) * 0.22, 1.64, 0.05);
    camera.lookAt(0.15, 1.4, -4.1);
  }

  updateLights(env) {
    const menu = env.mood === 'menu';
    const chase = env.mood === 'chase';
    const calm = env.mood === 'calm';
    this.flickerDark = isFlickerDark(env.time, env.mood);
    const base = calm ? CONFIG.roomLight * 0.3 : chase ? 1.2 : CONFIG.roomLight;
    this.roomLight.intensity = menu ? CONFIG.roomLight * 0.9 : this.flickerDark ? base * 0.04 : base;
    this.fixture.material.emissiveIntensity = this.roomLight.intensity > 8 ? 0.8 : 0.05;
    this.doorLight.intensity = env.phase === 'prologue' || env.phase === 'entering' ? CONFIG.doorLight : chase ? 0 : 6;
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
    const target = this.npcPath[this.npcIndex];
    if (!target) {
      this.hideNpc();
      return;
    }
    const dx = target.x - this.npc.position.x;
    const dz = target.z - this.npc.position.z;
    const dist = Math.hypot(dx, dz);
    const step = 1.05 * (env.npcRate || 1) * dt;
    if (dist <= step) {
      this.npc.position.set(target.x, 0, target.z);
      this.npcIndex += 1;
      if (this.npcIndex >= this.npcPath.length) this.hideNpc();
    } else {
      this.npc.position.x += (dx / dist) * step;
      this.npc.position.z += (dz / dist) * step;
      this.npc.rotation.y = Math.atan2(dx, dz);
      this.swingLegs(env.time * (env.npcRate || 1));
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
    const northZ = room.maxZ + t / 2;
    const leftW = -doorHalf - (room.minX - t / 2);
    const rightW = room.maxX + t / 2 - doorHalf;
    this.addBox(leftW, h, t, (room.minX - t / 2 - doorHalf) / 2, h / 2, northZ, this.materials.wall, true);
    this.addBox(rightW, h, t, (doorHalf + room.maxX + t / 2) / 2, h / 2, northZ, this.materials.wall, true);
    this.doorCollider = {
      minX: -doorHalf,
      maxX: doorHalf,
      minZ: room.maxZ,
      maxZ: room.maxZ + t,
    };

    this.addBox(0.34, hall.height, hall.minZ - (room.maxZ + t) + 0.2, -doorHalf - 0.17, hall.height / 2, (room.maxZ + t + hall.minZ) / 2, this.materials.hall, true);
    this.addBox(0.34, hall.height, hall.minZ - (room.maxZ + t) + 0.2, doorHalf + 0.17, hall.height / 2, (room.maxZ + t + hall.minZ) / 2, this.materials.hall, true);

    const hallSouthZ = hall.minZ - t / 2;
    const hallNorthZ = hall.maxZ + t / 2;
    this.addBox(-hall.minX - doorHalf, hall.height, t, (hall.minX + -doorHalf) / 2, hall.height / 2, hallSouthZ, this.materials.hall, true);
    this.addBox(hall.maxX - doorHalf, hall.height, t, (doorHalf + hall.maxX) / 2, hall.height / 2, hallSouthZ, this.materials.hall, true);
    this.addBox(alcove.minX - hall.minX, hall.height, t, (hall.minX + alcove.minX) / 2, hall.height / 2, hallNorthZ, this.materials.hall, true);
    this.addBox(hall.maxX - alcove.maxX, hall.height, t, (alcove.maxX + hall.maxX) / 2, hall.height / 2, hallNorthZ, this.materials.hall, true);
    this.addBox(t, hall.height, hall.maxZ - hall.minZ + t, hall.minX - t / 2, hall.height / 2, hall.z, this.materials.hall, true);
    this.addBox(t, hall.height, hall.maxZ - hall.minZ + t, hall.maxX + t / 2, hall.height / 2, hall.z, this.materials.hall, true);

    const alcoveDepth = alcove.backZ - hall.maxZ;
    this.addBox(t, hall.height, alcoveDepth, alcove.minX - t / 2, hall.height / 2, (hall.maxZ + alcove.backZ) / 2, this.materials.hall, true);
    this.addBox(t, hall.height, alcoveDepth, alcove.maxX + t / 2, hall.height / 2, (hall.maxZ + alcove.backZ) / 2, this.materials.hall, true);
    this.addBox(alcove.maxX - alcove.minX + t, hall.height, t, (alcove.minX + alcove.maxX) / 2, hall.height / 2, alcove.backZ + t / 2, this.materials.hall, true);
    this.addPlane(alcove.maxX - alcove.minX, alcoveDepth, (alcove.minX + alcove.maxX) / 2, 0.02, (hall.maxZ + alcove.backZ) / 2, floorMat);

    this.addBox(room.maxX - room.minX + 1, 0.16, room.maxZ - room.minZ + 1, 0, room.height + 0.08, 0, this.materials.ceiling, false);
    this.addBox(hall.maxX - hall.minX, 0.14, hall.maxZ - hall.minZ, (hall.minX + hall.maxX) / 2, hall.height + 0.05, hall.z, this.materials.ceiling, false);

    // 墙面重复线脚，传送 24 米后花纹对齐
    for (let x = hall.minX + 4; x < hall.maxX; x += 4) {
      if (Math.abs(x) < 1.4) continue;
      this.addBox(0.08, 1.2, 0.06, x, 1.5, hall.minZ + 0.04, this.materials.trim, false);
      if (x < alcove.minX - 0.5 || x > alcove.maxX + 0.5) {
        this.addBox(0.08, 1.2, 0.06, x, 1.5, hall.maxZ - 0.04, this.materials.trim, false);
      }
    }
  }

  buildFurniture() {
    const { desks } = LAYOUT;
    for (const x of desks.cols) {
      for (const z of desks.rows) this.addDesk(x, z);
    }
    this.addBox(1.9, 0.78, 0.78, 0, 0.39, -3.35, this.materials.desk, true);
    this.addBox(3.3, 1.35, 0.08, 0, 1.75, -4.9, this.materials.board, false);
    this.addBox(3.5, 1.55, 0.1, 0, 1.75, -4.98, this.materials.trim, false);

    const curtainMat = this.materials.curtain;
    this.curtainFar = this.addBox(0.06, 2.55, 2.3, 5.9, 1.55, -1.7, curtainMat, false);
    this.curtainNear = this.addBox(0.08, 2.7, 2.5, 5.86, 1.5, 0.7, curtainMat, false);

    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 24),
      new THREE.MeshBasicMaterial({ map: clockTexture(), toneMapped: false }),
    );
    clock.position.set(-5.92, 2.25, -1.1);
    clock.rotation.y = Math.PI / 2;
    this.scene.add(clock);

    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshBasicMaterial({ map: posterTexture(), toneMapped: false }),
    );
    poster.position.set(-5.92, 1.5, 2.2);
    poster.rotation.y = Math.PI / 2;
    this.scene.add(poster);
  }

  addDesk(x, z) {
    const { topW, topD, topH } = LAYOUT.desks;
    this.addBox(topW, topH, topD, x, topH / 2, z, this.materials.desk, true);
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), this.materials.chair);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.06), this.materials.chair);
    back.position.set(0, 0.7, 0.18);
    chair.add(seat, back);
    chair.position.set(x, 0, z + 0.48);
    markNoRay(chair);
    this.scene.add(chair);
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
    this.npcPath = [
      new THREE.Vector3(6.5, 0, LAYOUT.hall.z),
      new THREE.Vector3(0.15, 0, LAYOUT.hall.z),
      new THREE.Vector3(0.15, 0, 4.15),
    ];
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
      { mesh: bottleMesh(), x: 4.55, z: 3.7, r: 0.18 },
      { mesh: paperMesh(), x: -4.3, z: -0.15, r: 0.22 },
      { mesh: bookMesh(), x: 2.15, z: -2.45, r: 0.2 },
      { mesh: mopMesh(), x: -5.25, z: 4.15, r: 0.16 },
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
    trash.position.set(5.15, 0.18, -4.15);
    trash.userData.fakeAnomaly = true;
    this.scene.add(trash);
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0x93a0b4, CONFIG.ambient);
    this.scene.add(this.ambient);
    this.scene.add(new THREE.HemisphereLight(0x1b2433, 0x1a120c, CONFIG.hemi));
    this.roomLight = new THREE.PointLight(0xffb27a, CONFIG.roomLight, 16, 2);
    this.roomLight.position.set(0, 2.65, 0.4);
    this.scene.add(this.roomLight);
    this.fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2a2a28, emissive: 0xffc89a, emissiveIntensity: 0.8 }),
    );
    this.fixture.position.set(0, 3.02, 0.4);
    markNoRay(this.fixture);
    this.scene.add(this.fixture);
    this.doorLight = new THREE.PointLight(0xffc59a, CONFIG.doorLight, 8, 2);
    this.doorLight.position.set(0, 2.1, 6.4);
    this.scene.add(this.doorLight);
    for (let x = LAYOUT.hall.minX + 8; x < LAYOUT.hall.maxX - 4; x += 8) {
      const lamp = new THREE.PointLight(0x8ea0c0, CONFIG.hallLamp, 7, 2);
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

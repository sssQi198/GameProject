import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { LAYOUT } from './layout.js';
import { anomalyHint, anomalyLine } from './anomalies.js';
import { DemoDirector } from './demo.js';
import { copy } from './team/p1.js';
import { lookHoldSeconds } from './team/p2.js';
import { emit } from './team/bus.js';
import { EVENT } from './team/contract.js';

const LEVELS = 5;

/**
 * 状态：menu → prologue → level → corridor → … → finaleLook → chase → epilogue → win
 * 拍照失败或被追上会停在 lose，进度留在终局。
 */
export class Game {
  constructor({ scene, camera, canvas, hud, audio, level, player }) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.hud = hud;
    this.audio = audio;
    this.level = level;
    this.player = player;
    this.demo = new DemoDirector(this);
    this.phase = 'menu';
    this.paused = false;
    this.demoActive = false;
    this.intentionalUnlock = false;
    this.levelIndex = 0;
    this.cleared = false;
    this.hasCamera = false;
    this.wasInside = false;
    this.time = 0;
    this.clock = 0;
    this.lineT = 0;
    this.pendingLine = null;
    this.photoLock = 0;
    this.lookT = 0;
    this.epilogueT = 0;
    this.endingFade = 0;
    this.saidEnd = false;
    this.notedNpc = false;
    this.prepareShoot = false;
    this.menuNote = '';
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.player.onStep = () => {
      if (this.phase === 'menu' || this.paused) return;
      this.audio.footstep(this.level.isInsideRoom(this.player.x, this.player.z));
    };
    this.hud.showMenu('');
    this.player.setLamp(0);
  }

  start(asDemo = false) {
    this.paused = false;
    this.demoActive = asDemo;
    this.levelIndex = 0;
    this.cleared = false;
    this.hasCamera = false;
    this.wasInside = false;
    this.time = 0;
    this.lineT = 0;
    this.pendingLine = null;
    this.photoLock = 0;
    this.lookT = 0;
    this.epilogueT = 0;
    this.endingFade = 0;
    this.saidEnd = false;
    this.notedNpc = false;
    this.prepareShoot = false;
    this.menuNote = '';
    this.level.reset();
    this.player.setScripted(asDemo);
    this.player.reset(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.yaw);
    this.player.speedScale = 1;
    this.player.setControl(!asDemo);
    this.player.setLamp(CONFIG.lampDim);
    this.level.beginPrologue();
    this.level.setDoorOpen(true, true);
    this.phase = 'prologue';
    this.hud.showPlay();
    this.hud.setDemo(asDemo);
    this.hud.hidePanel();
    this.hud.setRecord(0, LEVELS);
    this.hud.setObjective(copy.follow);
    this.hud.setPrompt('');
    this.hud.setSubtitle('');
    this.hud.setDanger(0);
    this.hud.setChase(false);
    this.hud.setAimHot(false);
    this.audio.unlock();
    this.audio.setMood('play');
    this.audio.stopHeartbeat();
    this.say(copy.wait, 2.2);
    if (asDemo) this.demo.start();
    else this.requestLock();
  }

  startDemo() {
    this.start(true);
  }

  finishDemo() {
    this.returnToMenu();
    this.menuNote = '演示结束。可以开始自己的一局。';
    this.hud.showMenu(this.menuNote);
  }

  returnToMenu() {
    this.demo.stop();
    this.demoActive = false;
    this.paused = false;
    this.phase = 'menu';
    this.menuNote = '';
    this.player.setControl(false);
    this.player.setScripted(false);
    this.player.endLookLock();
    this.player.clearCourse();
    this.player.setLamp(0);
    this.level.reset();
    this.audio.setMood('idle');
    this.audio.stopHeartbeat();
    this.hud.showMenu(this.menuNote);
    this.hud.setDanger(0);
    this.hud.setChase(false);
    this.hud.setAimHot(false);
    this.intentionalUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (!locked && !this.intentionalUnlock && this.isLive() && !this.demoActive && !this.paused) {
      this.pause();
    }
    this.intentionalUnlock = false;
  }

  onKey(code) {
    if (code === 'KeyM') {
      this.audio.unlock();
      this.hud.syncMute(this.audio.toggleMute());
      return;
    }
    if (code !== 'Escape') return;
    if (this.demoActive) {
      this.finishDemo();
      return;
    }
    if (document.pointerLockElement) return;
    if (this.paused) this.resume();
    else if (this.isLive()) this.pause();
  }

  pause() {
    if (this.paused || !this.isLive()) return;
    this.paused = true;
    this.player.setControl(false);
    this.intentionalUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showPanel('pause', copy.pauseTitle, copy.pauseBody);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hud.hidePanel();
    if (!this.demoActive && this.phase !== 'finaleLook') this.player.setControl(true);
    this.requestLock();
  }

  retryFinale() {
    this.hud.hidePanel();
    this.paused = false;
    this.player.reset(0.4, LAYOUT.hall.z, -Math.PI / 2);
    this.wasInside = false;
    this.player.setLamp(this.hasCamera ? CONFIG.lamp : CONFIG.lampDim);
    this.beginFinale();
    if (!this.demoActive) {
      this.player.setControl(false);
      this.requestLock();
    }
  }

  requestLock() {
    if (this.demoActive) return;
    const lock = this.canvas.requestPointerLock?.();
    if (lock?.catch) lock.catch(() => {});
  }

  isLive() {
    return !['menu', 'win', 'lose'].includes(this.phase);
  }

  say(text, seconds = 2.4) {
    this.lineT = seconds;
    this.hud.setSubtitle(text);
  }

  update(dt) {
    this.clock += dt;
    this.audio.update(dt);
    if (this.phase === 'menu') {
      this.level.update(dt, this.env());
      this.level.updateShowcase(this.clock, this.camera);
      return;
    }
    if (this.paused) return;

    this.time += dt;
    if (this.photoLock > 0) this.photoLock -= dt;
    if (this.demoActive) this.demo.update(dt);
    this.player.speedScale = this.phase === 'prologue' ? CONFIG.prologueSpeed / CONFIG.walkSpeed : 1;
    this.player.update(dt, this.level.getColliders());
    this.updateZones();
    this.updateFlow(dt);
    this.level.bumpProps(this.player.x, this.player.z, this.player.radius);
    this.level.update(dt, this.env());
    this.updatePresentation();
    this.hud.setTime(this.time);

    if (this.pendingLine) {
      this.pendingLine.t -= dt;
      if (this.pendingLine.t <= 0) {
        const line = this.pendingLine;
        this.pendingLine = null;
        if (!(line.text.includes('相机') && this.hasCamera)) this.say(line.text, line.ttl);
      }
    }
    if (this.lineT > 0) {
      this.lineT -= dt;
      if (this.lineT <= 0) this.hud.setSubtitle('');
    }
  }

  env() {
    return {
      mood: this.mood(),
      phase: this.phase,
      time: this.clock,
      audio: this.audio,
      npcMode: this.npcMode(),
      npcRate: this.demoActive ? 1.65 : 1,
      classmateFade: this.endingFade,
    };
  }

  mood() {
    if (this.phase === 'menu') return 'menu';
    if (this.phase === 'finaleLook' || this.phase === 'finaleChase' || this.phase === 'lose') return 'chase';
    if (this.phase === 'epilogue' || this.phase === 'win') return 'calm';
    if (this.phase === 'level' || this.phase === 'entering') return 'play';
    return 'hall';
  }

  npcMode() {
    if (this.phase === 'epilogue' || this.phase === 'win') return 'ending';
    if ((this.phase === 'prologue' || (this.phase === 'entering' && this.levelIndex === 0)) && !this.level.npcDone) {
      return 'walk';
    }
    return 'hide';
  }

  updateZones() {
    const inside = this.level.isInsideRoom(this.player.x, this.player.z);
    if (inside && !this.wasInside) this.onEnter();
    if (!inside && this.wasInside) this.onExit();
    this.wasInside = inside;
  }

  onEnter() {
    if (this.phase === 'prologue' || this.phase === 'corridor') this.phase = 'entering';
  }

  onExit() {
    if (this.phase === 'entering') {
      this.phase = this.levelIndex === 0 ? 'prologue' : 'corridor';
      return;
    }
    if (this.phase === 'level' && this.cleared) this.phase = 'leaving';
  }

  updateFlow(dt) {
    if (this.phase === 'entering' && this.player.z < 3.9) this.beginLevel(this.levelIndex + 1);
    if (this.phase === 'leaving' && this.level.isInsideRoom(this.player.x, this.player.z)) this.phase = 'level';
    if (this.phase === 'leaving' && this.player.z > 7.35) {
      if (this.levelIndex >= LEVELS) this.beginFinale();
      else this.enterCorridor();
    }
    if (this.phase === 'corridor' && this.level.loopEnabled) {
      if (this.player.x > LAYOUT.loopEdge) this.player.x -= LAYOUT.loopSpan;
      if (this.player.x < -LAYOUT.loopEdge) this.player.x += LAYOUT.loopSpan;
    }
    if (this.phase === 'prologue' && this.level.npcDone && !this.notedNpc) {
      this.notedNpc = true;
      this.say(copy.doorStillOpen, 2.2);
    }
    if (this.phase === 'finaleLook') {
      this.lookT += dt;
      const need = lookHoldSeconds();
      if (this.lookT >= need) this.beginChase();
    }
    if (this.phase === 'finaleChase') this.updateChase(dt);
    if (this.phase === 'epilogue') this.updateEpilogue(dt);

    if (this.prepareShoot) {
      const point = this.level.getAnomalyAimPoint(this.levelIndex);
      if (point) this.player.facePoint(point.x, point.y, point.z);
      this.tryPhoto();
      this.prepareShoot = false;
    } else if (this.player.consumeInteract()) {
      this.onInteract();
    }
  }

  beginLevel(index) {
    this.phase = 'level';
    this.levelIndex = index;
    this.cleared = false;
    this.level.loopEnabled = false;
    this.level.spawnUpTo(index);
    this.level.setDoorOpen(false);
    this.level.hideNpc();
    if (!this.hasCamera) this.level.revealPickup();
    this.hud.setRecord(index - 1, LEVELS);
    this.hud.setObjective(anomalyHint(index));
    this.audio.door();
    if (index === 1) {
      this.say(copy.someoneGone, 2.2);
      this.pendingLine = { t: 2.3, text: copy.cameraOnFloor, ttl: 2.4 };
    } else {
      this.say(copy.roomChanged, 2.3);
    }
  }

  enterCorridor() {
    this.phase = 'corridor';
    this.level.loopEnabled = true;
    this.level.setDoorOpen(true);
    this.hud.setObjective(copy.backToDoor);
    this.say(copy.corridorLoop, 2.6);
  }

  beginFinale() {
    this.phase = 'finaleLook';
    this.lookT = 0;
    this.level.loopEnabled = false;
    this.level.setDoorOpen(false);
    this.level.showExit(true);
    const z = clamp(this.player.z, LAYOUT.hall.minZ + 0.45, LAYOUT.hall.maxZ - 0.45);
    this.level.placeEntity(this.player.x - CONFIG.entityGap, z);
    this.player.setControl(false);
    const eyes = this.level.entityEye();
    this.player.beginLookLock(eyes);
    emit(EVENT.lookLock, { target: eyes });
    this.audio.startHeartbeat();
    this.audio.setMood('chase');
    this.hud.setObjective(copy.runToExit);
    this.hud.setChase(false);
    this.say(copy.itCame, 1.5);
  }

  beginChase() {
    if (this.phase !== 'finaleLook') return;
    this.phase = 'finaleChase';
    this.player.endLookLock();
    emit(EVENT.lookUnlock, {});
    this.player.clearInteract();
    if (!this.demoActive) this.player.setControl(true);
    this.hud.setChase(true);
    this.say(copy.turnAndSprint, 2.4);
  }

  updateChase(dt) {
    this.level.stepEntity(this.player.x, this.player.z, dt);
    const dist = Math.hypot(
      this.player.x - this.level.entity.position.x,
      this.player.z - this.level.entity.position.z,
    );
    if (dist < CONFIG.entityCatch) this.lose();
    else if (this.player.x >= LAYOUT.exitX && this.player.z < LAYOUT.hall.maxZ + 0.4) this.beginEpilogue();
  }

  updateEpilogue(dt) {
    this.epilogueT += dt;
    const dx = this.player.x - LAYOUT.classmateEnd.x;
    const dz = this.player.z - LAYOUT.classmateEnd.z;
    if (Math.hypot(dx, dz) < 2.8 || this.epilogueT > 6.5) {
      this.endingFade = Math.min(1, this.endingFade + dt * 0.55);
    }
    if (this.endingFade > 0.15 && !this.saidEnd) {
      this.saidEnd = true;
      this.say(copy.stillAhead, 4);
    }
    if (this.endingFade >= 1 && this.epilogueT > 2) this.win();
  }

  onInteract() {
    if (!this.hasCamera && this.level.nearPickup(this.player.x, this.player.z)) {
      this.pickupCamera();
      return;
    }
    if (this.phase === 'level' && this.hasCamera && !this.cleared) this.tryPhoto();
  }

  pickupCamera() {
    this.hasCamera = true;
    this.level.hidePickup();
    this.audio.pickup();
    this.player.setLamp(CONFIG.lamp);
    this.say(copy.photoHint, 2.2);
  }

  tryPhoto() {
    if (this.photoLock > 0 || this.phase !== 'level' || !this.hasCamera || this.cleared) return;
    this.photoLock = 0.4;
    this.camera.updateMatrixWorld(true);
    this.raycaster.far = CONFIG.photoRange;
    this.raycaster.setFromCamera(this.center, this.camera);
    const aim = this.level.aim(this.raycaster);
    if (aim.kind === 'anomaly' && aim.level === this.levelIndex) this.succeedPhoto();
    else {
      this.audio.shutter(false);
      this.audio.photoFail();
      emit(EVENT.photoFail, { level: this.levelIndex });
      this.say(copy.photoMiss, 1.6);
    }
  }

  succeedPhoto() {
    this.cleared = true;
    emit(EVENT.photoOk, { level: this.levelIndex });
    this.hud.setRecord(this.levelIndex, LEVELS);
    this.hud.flash();
    this.audio.shutter(true);
    if (this.levelIndex === 4) this.audio.breath();
    this.level.setDoorOpen(true);
    this.audio.door();
    this.hud.setObjective(copy.doorOpen);
    this.say(anomalyLine(this.levelIndex), 3.1);
  }

  forceCurrentPhoto() {
    if (this.phase !== 'level' || this.cleared) return;
    this.photoLock = 0;
    this.succeedPhoto();
  }

  win() {
    if (this.phase === 'win') return;
    this.phase = 'win';
    this.player.setControl(false);
    this.audio.stopHeartbeat();
    this.audio.setMood('calm');
    this.audio.win();
    this.hud.setChase(false);
    this.hud.setDanger(0);
    this.hud.showPanel('win', copy.winTitle, copy.stillAhead);
  }

  lose() {
    if (this.phase === 'lose' || this.phase === 'win') return;
    this.phase = 'lose';
    this.player.setControl(false);
    this.player.endLookLock();
    this.player.clearCourse();
    this.level.hideEntity();
    this.audio.stopHeartbeat();
    this.audio.lose();
    this.hud.setChase(false);
    this.hud.showPanel('lose', copy.loseTitle, copy.loseBody);
  }

  updatePresentation() {
    let lamp = CONFIG.lampDim;
    if (this.phase === 'finaleChase' || this.phase === 'finaleLook') lamp = CONFIG.lampChase;
    else if (this.hasCamera) lamp = CONFIG.lamp;
    if (this.phase === 'epilogue' || this.phase === 'win') lamp = CONFIG.lamp * 0.7;
    this.player.setLamp(lamp);

    const aiming = this.phase === 'level' && this.hasCamera && !this.cleared;
    let hot = false;
    if (aiming) {
      this.camera.updateMatrixWorld(true);
      this.raycaster.far = CONFIG.photoRange;
      this.raycaster.setFromCamera(this.center, this.camera);
      const aim = this.level.aim(this.raycaster);
      hot = aim.kind === 'anomaly' && aim.level === this.levelIndex;
    }
    this.hud.setAimHot(hot);

    if (!this.hasCamera && this.level.nearPickup(this.player.x, this.player.z)) this.hud.setPrompt('E  拾起相机');
    else if (hot) this.hud.setPrompt('E  拍照记录');
    else if (this.cleared && this.phase === 'level') this.hud.setPrompt('门开了');
    else this.hud.setPrompt('');

    if (this.phase === 'finaleChase') {
      const dx = this.player.x - this.level.entity.position.x;
      const dz = this.player.z - this.level.entity.position.z;
      const dist = Math.hypot(dx, dz);
      this.hud.setDanger(clamp(1 - (dist - CONFIG.entityCatch) / 6, 0, 1));
    } else if (this.phase !== 'lose') {
      this.hud.setDanger(0);
    }
  }

  beginEpilogue() {
    if (this.phase === 'epilogue' || this.phase === 'win') return;
    this.phase = 'epilogue';
    this.epilogueT = 0;
    this.endingFade = 0;
    this.saidEnd = false;
    this.level.hideEntity();
    this.audio.stopHeartbeat();
    this.audio.setMood('calm');
    this.hud.setChase(false);
    this.hud.setDanger(0);
    this.hud.setObjective(copy.aheadPerson);
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

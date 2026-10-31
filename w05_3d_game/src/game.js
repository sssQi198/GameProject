import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { LAYOUT } from './layout.js';
import { anomalyHint, anomalyLine } from './anomalies.js';
import { DemoDirector } from './demo.js';
import { copy, introDialog, skipHint, introAftermath } from './team/p1.js';
import { lookHoldSeconds } from './team/p2.js';
import { emit } from './team/bus.js';
import { EVENT } from './team/contract.js';

const LEVELS = 5;
const CAMERA_DRAW_TIME = 0.45;
const CAMERA_LOWER_TIME = 0.4;
const CAMERA_SHOOT_TIME = 0.35;

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
    this.cameraState = 'none';
    this.cameraAnimT = 0;
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
    this.saidWait = false;
    this.prepareShoot = false;
    this.menuNote = '';
    this.pointerLocked = false;
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.player.onStep = () => {
      if (this.phase === 'menu' || this.paused) return;
      this.audio.footstep(this.level.isInsideRoom(this.player.x, this.player.z));
    };
    this.canvas.addEventListener('click', () => this.tryRelock());
    this.hud.showMenu('');
    this.player.setLamp(0);
  }

  start(asDemo = false) {
    this.paused = false;
    this.demoActive = asDemo;
    this.levelIndex = 0;
    this.cleared = false;
    this.hasCamera = false;
    this.cameraState = 'none';
    this.cameraAnimT = 0;
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
    this.saidWait = false;
    this.prepareShoot = false;
    this.menuNote = '';
    this.introCooldown = 0;
    this.introIndex = 0;
    this.introPhase = 0;
    this.introWait = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeT = 0;
    this.controlHints = [];
    this.level.reset();
    this.player.setScripted(asDemo);
    this.player.reset(LAYOUT.spawn.x, LAYOUT.spawn.z, LAYOUT.spawn.yaw);
    this.player.speedScale = 1;
    this.player.setLamp(CONFIG.lampDim);
    this.level.beginPrologue();
    if (asDemo) {
      // 演示模式直接跳过 intro，全开门
      this.level.setDoorOpen(true, true);
      this.phase = 'prologue';
      this.player.setControl(false);
      this.demo.start();
    } else {
      // 正常模式：先播放intro对话，门虚掩，NPC 站桩
      this.level.setDoorAjar(true);
      this.phase = 'intro';
      this.player.setControl(false);
      this.requestLock();
    }
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
    this.setCameraState('none');
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
    const wasLocked = this.pointerLocked;
    this.pointerLocked = locked;
    if (!locked && wasLocked && !this.intentionalUnlock && this.isLive() && !this.demoActive && !this.paused) {
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
    if (!this.demoActive && this.phase !== 'finaleLook' && this.phase !== 'intro') this.player.setControl(true);
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
    requestAnimationFrame(() => {
      if (!this.isLive() || this.paused || this.demoActive) return;
      const lock = this.canvas.requestPointerLock?.();
      if (lock?.catch) {
        lock.catch(() => {
          // Esc 退出后浏览器有约 1.25s 的重锁冷却；失败时提示玩家点击画面
          if (this.isLive() && !this.paused && !this.demoActive) this.say('点击画面锁定鼠标视角', 2.5);
        });
      }
    });
  }

  /** 游戏中指针未锁定时，点击画布重新锁定鼠标。 */
  tryRelock() {
    if (this.demoActive || this.paused || !this.isLive()) return;
    if (document.pointerLockElement === this.canvas) return;
    this.requestLock();
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
    this.updateCameraState(dt);
    if (this.demoActive) this.demo.update(dt);
    this.player.speedScale = this.phase === 'prologue' ? CONFIG.prologueSpeed / CONFIG.walkSpeed : 1;
    this.player.update(dt, this.level.getColliders());
    // 摄像机抖动叠加偏移（序章出事时）
    if (this.shakeX !== 0 || this.shakeY !== 0) {
      this.camera.position.x += this.shakeX;
      this.camera.position.y += this.shakeY;
    }
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
    if (this.phase === 'intro') return 'hall';
    if (this.phase === 'finaleLook' || this.phase === 'finaleChase' || this.phase === 'lose') return 'chase';
    if (this.phase === 'epilogue' || this.phase === 'win') return 'calm';
    if (this.phase === 'level' || this.phase === 'entering') return 'play';
    return 'hall';
  }

  npcMode() {
    if (this.phase === 'intro') return 'idle';
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

  updateIntro(dt) {
    // introPhase: 0=对话, 1=npc走进教室, 2=等待后出事(flash/声), 3=显示"发生什么了"并解锁玩家, 4=进入prologue
    if (this.introPhase === 0) {
      // 对话序列
      if (this.introCooldown > 0) {
        this.introCooldown -= dt;
        return;
      }
      if (this.introIndex < introDialog.length) {
        this.say(introDialog[this.introIndex], 2.4);
        this.introIndex += 1;
        this.introCooldown = 2.7;
        this.hud.setPrompt(skipHint);
      }
      if (this.player.consumeInteract() || this.introIndex >= introDialog.length) {
        // E 跳过或全部播完 → NPC 直接走进教室，玩家仍不可操作
        this.introPhase = 1;
        this.hud.setPrompt('');
        this.level.setDoorOpen(true); // NPC 开始走时开门，以免被门阻挡
        this.level.setNpcState('walking');
      }
      return;
    }

    if (this.introPhase === 1) {
      // 等待 NPC 走完 (npcDone)
      if (this.level.npcDone) {
        this.introPhase = 2;
        this.introWait = 1.8; // NPC 进门后再等一会才出事
      }
      return;
    }

    if (this.introPhase === 2) {
      this.introWait -= dt;
      if (this.introWait <= 0) {
        this.introPhase = 3;
        this.introWait = 0.9; // 闪光+抖动持续时间，结束后显示文字
        // 出事！闪光 + 多层次的物品倒地/撞击声
        this.level.triggerFlash(0.6);
        // 第一声：重物掉落（低频闷响）
        this.audio.burst({ duration: 0.9, gain: 0.70, type: 'lowpass', freq: 350, q: 0.4 });
        // 第二声：金属/器皿撞击（中高频）
        this.audio.burst({ duration: 0.6, gain: 0.56, type: 'bandpass', freq: 180, q: 0.5 });
        // 200ms后：连串物品倒地的细碎声
        setTimeout(() => {
          try { this.audio.burst({ duration: 0.4, gain: 0.6, type: 'highpass', freq: 900, q: 0.6 }); } catch (e) {}
        }, 200);
        // 450ms后：一声较远的撞击（回声感）
        setTimeout(() => {
          try { this.audio.burst({ duration: 0.55, gain: 0.44, type: 'lowpass', freq: 260, q: 0.8 }); } catch (e) {}
        }, 450);
        // 开始摄像机抖动
        this.shakeT = 0.6;  // 抖动持续 0.6 秒
      }
      return;
    }

    if (this.introPhase === 3) {
      this.introWait -= dt;
      // 抖动衰减
      if (this.shakeT > 0) {
        this.shakeT = Math.max(0, this.shakeT - dt);
        // 生成随机偏移，随剩余时间衰减
        const intensity = this.shakeT / 0.6 * 0.04; // 最大偏移 0.04 单位，约 4 厘米
        this.shakeX = (Math.random() - 0.5) * 2 * intensity;
        this.shakeY = (Math.random() - 0.5) * 2 * intensity;
      } else {
        this.shakeX = 0;
        this.shakeY = 0;
      }
      if (this.introWait <= 0) {
        this.introPhase = 4;
        // 抖动结束后显示"发生什么了" 并同时解锁玩家控制
        this.say(introAftermath, 3.5);
        this.hud.setPrompt('');
        this.player.setControl(true);
        this.level.setNpcState('idle');
      }
      return;
    }

    if (this.introPhase === 4) {
      // 文字对话结束后，进入 prologue
      if (this.lineT <= 0) {
        this.hud.setSubtitle('');
        // 进入 prologue
        this.phase = 'prologue';
        this.requestLock();
      }
      return;
    }
  }

  beginProloguePhase() {
    // 已被新的 introPhase 流程取代，但保留引用以防外部调用
    this.phase = 'prologue';
    this.hud.setPrompt('');
    this.hud.setSubtitle('');
    this.level.setNpcState('walking');
    this.player.setControl(true);
    this.requestLock();
  }

  updateFlow(dt) {
    if (this.phase === 'intro') {
      this.updateIntro(dt);
      return;
    }
    if (this.phase === 'entering' && this.player.z < LAYOUT.room.maxZ - 2.1) this.beginLevel(this.levelIndex + 1);
    if (this.phase === 'leaving' && this.level.isInsideRoom(this.player.x, this.player.z)) this.phase = 'level';
    if (this.phase === 'leaving' && this.player.z > 7.35) {
      if (this.levelIndex >= LEVELS) this.beginFinale();
      else this.enterCorridor();
    }
    this.wrapCorridor();
    // 序章不再有等待/推门 NPC 逻辑 — NPC 已先进教室出事，玩家追赶
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
      if (this.cameraState === 'holstered') this.setCameraState('raised');
      const point = this.level.getAnomalyAimPoint(this.levelIndex);
      if (point) this.player.facePoint(point.x, point.y, point.z);
      this.tryPhoto();
      this.prepareShoot = false;
    } else {
      if (this.player.consumeInteract()) this.onInteract();
      if (this.player.consumeShoot()) this.onShoot();
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

  wrapCorridor() {
    if (this.phase === 'finaleLook' || this.phase === 'finaleChase' || this.phase === 'epilogue' || this.phase === 'win' || this.phase === 'lose') return;
    if (this.player.z <= LAYOUT.room.maxZ) return;
    const x = this.player.x;
    let wrapped = x;
    if (x > LAYOUT.loopMax) wrapped = LAYOUT.loopMin;
    else if (x < LAYOUT.loopMin) wrapped = LAYOUT.loopMax;
    if (wrapped === x) return;
    this.player.x = wrapped;
    this.player.camera.position.x += wrapped - x;
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
    this.autoLowerCamera();
    this.say(copy.itCame, 1.5);
  }

  beginChase() {
    if (this.phase !== 'finaleLook') return;
    this.phase = 'finaleChase';
    this.player.endLookLock();
    emit(EVENT.lookUnlock, {});
    this.player.clearInteract();
    this.player.clearShoot();
    // 注视期间玩家可能又拿出了相机，追逐开启时再收一次；之后仍可按 E 拿出
    this.autoLowerCamera();
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

  setCameraState(state) {
    this.cameraState = state;
    this.cameraAnimT = 0;
    this.hasCamera = state !== 'none';
    this.hud.setCameraState?.(state);
    this.player.setCameraRigState?.(state);
  }

  updateCameraState(dt) {
    this.cameraAnimT += dt;
    if (this.cameraState === 'drawing' && this.cameraAnimT >= CAMERA_DRAW_TIME) this.setCameraState('raised');
    else if (this.cameraState === 'lowering' && this.cameraAnimT >= CAMERA_LOWER_TIME) this.setCameraState('holstered');
    else if (this.cameraState === 'shooting' && this.cameraAnimT >= CAMERA_SHOOT_TIME) this.setCameraState('raised');
  }

  /** 阶段完成与终局开启时自动收起相机，与玩家按 E 收起等价；不限制之后再拿出。 */
  autoLowerCamera() {
    if (this.cameraState === 'raised' || this.cameraState === 'shooting' || this.cameraState === 'drawing') {
      this.setCameraState('lowering');
      this.audio.cameraDown();
    }
  }

  onInteract() {
    if (this.cameraState === 'none') {
      if (this.level.nearPickup(this.player.x, this.player.z)) this.pickupCamera();
      return;
    }
    if (this.cameraState === 'holstered') {
      this.setCameraState('drawing');
      this.audio.cameraUp();
      return;
    }
    if (this.cameraState === 'raised') {
      this.setCameraState('lowering');
      this.audio.cameraDown();
    }
  }

  onShoot() {
    if (this.cameraState !== 'raised' || !this.isLive()) return;
    this.setCameraState('shooting');
    // 只有「关卡进行中且未拍中」时按快门才参与判定；其余时刻（转移关卡、
    // 走廊、终局等）只保留快门声与后坐反应，不发射线、不发事件、不碰判定。
    if (this.phase === 'level' && !this.cleared && this.photoLock <= 0) this.tryPhoto();
    else this.audio.shutter(false);
  }

  pickupCamera() {
    this.setCameraState('holstered');
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
    this.audio.shutter(true);
    if (this.levelIndex === 4) this.audio.breath();
    this.level.setDoorOpen(true);
    this.audio.door();
    this.hud.setObjective(copy.doorOpen);
    this.say(anomalyLine(this.levelIndex), 3.1);
    this.autoLowerCamera();
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
    if (this.cameraState !== 'none') this.setCameraState('holstered');
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
    if (this.cameraState !== 'none') this.setCameraState('holstered');
    this.hud.showPanel('lose', copy.loseTitle, copy.loseBody);
  }

  updatePresentation() {
    let lamp = CONFIG.lampDim;
    if (this.phase === 'finaleChase' || this.phase === 'finaleLook') lamp = CONFIG.lampChase;
    else if (this.hasCamera) lamp = CONFIG.lamp;
    if (this.phase === 'epilogue' || this.phase === 'win') lamp = CONFIG.lamp * 0.7;
    this.player.setLamp(lamp);

    const aiming = this.phase === 'level'
      && (this.cameraState === 'raised' || this.cameraState === 'shooting')
      && !this.cleared;
    let hot = false;
    if (aiming) {
      this.camera.updateMatrixWorld(true);
      this.raycaster.far = CONFIG.photoRange;
      this.raycaster.setFromCamera(this.center, this.camera);
      const aim = this.level.aim(this.raycaster);
      hot = aim.kind === 'anomaly' && aim.level === this.levelIndex;
    }
    this.hud.setAimHot(hot);

    const cs = this.cameraState;
    if (cs === 'drawing') this.hud.setPrompt('拿出相机……');
    else if (cs === 'lowering') this.hud.setPrompt('收起相机……');
    else if (cs === 'shooting') this.hud.setPrompt('拍摄中……');
    else if (cs === 'none' && this.level.nearPickup(this.player.x, this.player.z)) this.hud.setPrompt('E  拾起相机');
    else if (this.cleared && this.phase === 'level') this.hud.setPrompt('门开了');
    else if (cs === 'holstered') this.hud.setPrompt('E  拿出相机');
    else if (cs === 'raised') this.hud.setPrompt(hot ? 'F  拍摄记录' : 'F  拍摄 · E  收起相机');
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

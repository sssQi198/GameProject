import * as THREE from '../vendor/three.module.js';
import { CONFIG } from './config.js';
import { LAYOUT } from './layout.js';
import { anomalyHint, anomalyLine } from './anomalies.js';
import { DemoDirector } from './demo.js';
import { SAFEHOUSE } from './safehouse.js';
import { copy, introDialog, skipHint, introAftermath } from './team/p1.js';
import { lookHoldSeconds } from './team/p2.js';
import { emit } from './team/bus.js';
import { EVENT } from './team/contract.js';

const LEVELS = 5;
const CAMERA_DRAW_TIME = 0.45;
const CAMERA_LOWER_TIME = 0.4;
const CAMERA_SHOOT_TIME = 0.35;
/**
 * 逃跑方向的朝向角（yaw）。走廊沿 +X 通向 EXIT，yaw = 0 朝 -Z、
 * 所以 +X 是 -π/2。终局强迫回头之后镜头会自动转回这个角度。
 */
const ESCAPE_YAW = -Math.PI / 2;

/**
 * 终局时间轴（秒）。下标 = endStage，值是这一阶段停留多久。
 *
 * 这张表是唯一真相表：所有演出都由 endT 推进，**不**去问「镜头转完了吗」
 * 「门开到几度了」。player.js 的 autoTurn 在差 0.02 弧度时会直接吸附到位，
 * 拿它当阶段开关会在低帧率下跳阶段；用固定时长则无论 30 帧还是 144 帧，
 * 每一段演出的时长都一样。
 */
export const END_STAGE = [
  1.10, // 0  跑到门前：门光涨满、走廊灯灭
  0.55, // 1  白光吞屏
  0.35, // 2  全白换场（只有在这一段可以瞬移）
  0.70, // 3  显影：安全屋亮起来
  2.40, // 4  低头喘气
  1.30, // 5  听到门响，回头：同学已经背对着他把门带上
  0.90, // 6  他把门关实（全程背影，一次都没露脸）
  4.80, // 7  主角发问
  2.60, // 8  同学应答，慢慢转过来
  2.10, // 9  揭示：红眼先在脸上亮起来，0.5 秒后嘴才开始咧开、露出尖牙
  0.45, // 10 尖叫 + 飞扑、后仰
  0.35, // 11 黑场
  1.20, // 12 纯黑，然后出结束卡
];
const END_LAST = END_STAGE.length - 1;
/**
 * 低头喘气的一拍（秒）。**声音和镜头共用这一个数**（第二十七轮）：
 * `audio.pant()` 每 `END_BREATH_PERIOD` 秒起一拍，`applyEndingCamera()` 的
 * 俯仰摆动也走同一个周期，于是「一拍 = 头低一次」。
 */
export const END_BREATH_PERIOD = 1.05;
/** 第 4 段里第一声吸气落在哪儿（和 `cueEnd('pant', …)` 的偏移对齐）。 */
export const END_PANT_AT = 0.02;
/**
 * 呼气相对本拍吸气起点的偏移（秒），必须和 `audio.js` 的 `pant()` 里 `EXHALE_AT` 一致。
 * 镜头把「头低到最低的那一下」对在呼气上：吸气时抬头、呼气时沉下去。
 */
export const END_EXHALE_AT = 0.30;
/**
 * 飞扑落点离镜头的距离（米）。0.55 的头部中心 ⇒ 脸面约 0.42，
 * 一张 0.26 米高的脸在 70° 竖直 FOV 下占半个画面高度：
 * 「最后定格时脸上剩一半，然后黑屏」就是靠这个数调出来的。
 */
const MATE_LUNGE_GAP = 0.55;

/**
 * 开场衔接（第二十一轮）：点「开始」之后不直接进序章，而是
 * 标题 → 渐黑 → 屏幕正中浮出「按 F11 获得沉浸式体验」 → 再黑 → 慢淡进序章、BGM 渐起。
 *
 * 时间单位是秒，全部相对点击那一刻。`go` 之前一直是 boot 相位（只推黑幕/字幕、不跑游戏），
 * `go` 那一帧在全黑里调 start('intro')，之后交给 updateBootFade() 把黑幕退掉。
 */
const BOOT = {
  curtainIn: 0.85, // 标题页 → 全黑
  hintStart: 0.95, // 字幕开始浮出
  hintIn: 0.40, // 浮出用时
  hintHold: 3.30, // 到这一刻开始淡出（全亮约 1.95s，够看清这行字）
  hintOut: 0.45, // 淡出用时
  go: 3.85, // 全黑里开新一局（此时字幕已经完全退掉）
  fadeIn: 1.70, // 黑幕退掉、露出序章画面
  musicTau: 1.25, // BGM 渐起的斜坡时间常数
};

/**
 * 状态：menu → boot → prologue → level → corridor → … → finaleLook → finaleChase → ending → badEnd
 * 拍照失败或被追上会停在 lose，进度留在终局。
 */
export class Game {
  constructor({ scene, camera, canvas, hud, audio, level, player, safehouse }) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.hud = hud;
    this.audio = audio;
    this.level = level;
    this.player = player;
    this.safehouse = safehouse;
    this.demo = new DemoDirector(this);
    this.phase = 'menu';
    /** 开场衔接的计时（见 BOOT）：bootT 是 boot 相位内的秒数，bootFade ≥ 0 表示正在退黑幕。 */
    this.bootT = 0;
    this.bootStarted = false;
    this.bootFade = -1;
    this.paused = false;
    this.demoActive = false;
    this.intentionalUnlock = false;
    this.levelIndex = 0;
    this.cleared = false;
    /** 走廊里已经铺好、正等玩家走进来的关卡号（0 = 还没铺） */
    this.aheadLevel = 0;
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
    this.turning = false;
    // 终局（ending）专用状态：阶段号、段内计时、已经播过的一次性音效、
    // 以及倒地前的位置快照。endT 每进一段就归零，所以段内动画都从 0 起算。
    this.endStage = 0;
    this.endT = 0;
    this.endCues = new Set();
    this.endFromX = 0;
    this.endFallX = undefined;
    this.endMateYaw = undefined;
    // 抖动偏移。start() 里也会重置，但 ?ending 这类调试入口不走 start()，
    // 拿到的就是 undefined；game.update 里「!== 0 就累加」会把相机位置
    // 通过 += undefined 变成 NaN，整帧黑屏。所以构造时就给 0。
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeT = 0;
    this.l5ShakeT = 0;
    // main.js 每帧把 CONFIG.exposure 写回渲染器，所以曝光只能改 CONFIG 再还原；
    // 记一份原始值，避免调试面板改过之后还原成错的。debug.js 也可能改它。
    this.baseExposure = CONFIG.exposure;
    this.notedNpc = false;
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

  /**
   * 开场衔接（第二十一轮）：点「开始」走这里，不直接 start()。
   * 标题页先渐黑 → 正中浮出「按 F11 获得沉浸式体验」 → 再黑 → 在黑里开局 → 慢慢淡进序章、BGM 渐起。
   */
  beginBoot() {
    if (this.phase === 'boot') return;
    this.paused = false;
    this.demoActive = false;
    this.phase = 'boot';
    this.bootT = 0;
    this.bootStarted = false;
    this.bootFade = -1;
    this.hud.hidePanel();
    this.hud.clearCut();
    this.hud.setBoot(0);
    this.hud.setBootHint(0);
    this.audio.unlock();
    // 标题页那首循环曲先压下去：黑幕里留一段安静，后面的 BGM 才有「渐起」的余地。
    // 这里只用 duckMusic（临时压制）——别用 holdMusic：start() 里的 restoreMusic() 会清掉那个 flag，
    // 结果开局那一帧 p3.js 就用 0.08s 把 BGM 拽满，「渐起」变成「突然响起」。
    this.audio.duckMusic(0.5);
    // 指针锁留在点击这个手势里请求（浏览器只认 transient activation），
    // 拖到 3.3 秒之后才请求有被拒的风险；就算这里失败，start() 和点击画布还会再试。
    this.requestLock();
  }

  /** boot 相位：只推黑幕和那行字幕；到 BOOT.go 那一帧在全黑里开局。 */
  updateBoot(dt) {
    this.bootT += dt;
    const t = this.bootT;
    this.hud.setBoot(t < BOOT.go ? ease01(clamp(t / BOOT.curtainIn, 0, 1)) : 1);
    let hint = 0;
    if (t >= BOOT.hintStart && t < BOOT.go) {
      const rise = ease01(clamp((t - BOOT.hintStart) / BOOT.hintIn, 0, 1));
      const fall = ease01(clamp((t - BOOT.hintHold) / BOOT.hintOut, 0, 1));
      hint = rise * (1 - fall);
    }
    this.hud.setBootHint(hint);
    if (this.bootStarted || t < BOOT.go) return;
    this.bootStarted = true;
    this.hud.setBootHint(0);
    this.hud.setBoot(1);
    // 全黑里开局：start() 会把相位推到 intro（序章对话），同时把 BGM 的渐起斜坡排好
    this.start(false, { musicTau: BOOT.musicTau });
    this.hud.setPlayChromeVisible(false);
    this.bootFade = 0;
  }

  /** 开局之后的退黑幕：1 → 0；退完把 HUD 露出来、把 BGM 的斜坡收回正常速度。 */
  updateBootFade(dt) {
    this.bootFade += dt;
    const k = clamp(this.bootFade / BOOT.fadeIn, 0, 1);
    this.hud.setBoot(1 - ease01(k));
    if (k < 1) return;
    this.bootFade = -1;
    this.hud.setBoot(0);
    this.hud.setBootHint(0);
    this.hud.setPlayChromeVisible(true);
    // 渐起到这里基本到位了，把 1.25s 的长斜坡收回来（后面进关的调整不该这么拖）
    this.audio.setMusicTau(0.08);
  }

  start(asDemo = false, opts = {}) {
    this.paused = false;
    // 上一局如果是在追逐里结束的，BGM 被 stopMusic() 真停掉了：新一局必须接回来。
    // restoreMusic() 只负责「解除封锁 + 从暂停处接回 + 压回静音起步」，淡起来交给下面那行 setMood。
    this.audio.restoreMusic();
    // 从结束卡点「再来一次」时，上一局可能正停在终局的黑场/白场里：
    // 不清掉这些残留，新的一局会从满屏纯白开始，而且操作被锁着。
    this.abortEnding();
    // 演示收尾那层白光（z-6）要单独清：abortEnding 只管白/黑两层，
    // 不清掉它，新开一局会被一层白蒙住。
    this.hud.clearCut();
    this.demoActive = asDemo;
    this.levelIndex = 0;
    this.cleared = false;
    this.aheadLevel = 0;
    this.hasCamera = false;
    this.cameraState = 'none';
    this.cameraAnimT = 0;
    this.wasInside = false;
    this.time = 0;
    this.lineT = 0;
    this.pendingLine = null;
    this.photoLock = 0;
    this.lookT = 0;
    this.turning = false;
    this.notedNpc = false;
    this.prepareShoot = false;
    this.menuNote = '';
    this.introCooldown = 0;
    this.introIndex = 0;
    this.introPhase = 0;
    this.introWait = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeT = 0;
    this.l5ShakeT = 0; // 第5关拍照后颤抖计时
    this.entityStepAcc = 0; // 追逐中怪物已走的距离，攒够一个步幅就响一声
    this.entityStepSide = 1; // 左右脚交替（声音声像 ±0.28）
    this.entryClosing = false;
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
      // 正常模式：先播放 intro 对话。门关着，等同学走到门口再开。
      this.level.setDoorOpen(false, true);
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
    // 开场衔接那边会传一个更大的 musicTau，让 BGM 跟着黑幕一起「渐起」
    this.audio.setMood('play', opts.musicTau || 0.5);
    this.audio.stopHeartbeat();
    this.audio.stopScare();
  }

  startDemo() {
    this.start(true);
  }

  finishDemo() {
    // 定稿 ④：不走文字提示。此刻白光已经满屏并保持了 1.0 s（demo.js 末尾的
    // wait），这里把白光搬到 z-6 那层顶住标题页，再把它淡掉——观众看到的是
    // 「一片白 → 标题」，没有弹字、也没有硬切。
    this.hud.setCut(1);
    this.returnToMenu();
    this.hud.dissolveCut(620);
  }

  returnToMenu() {
    this.demo.stop();
    // 终局演到一半从面板退出/演示结束时也走这里：白色蒙版、脚本镜头、曝光
    // 都必须在回到主菜单时归位，否则下一次开局直接是满屏纯白。
    this.abortEnding();
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
    // 追逐时被停掉的默认 BGM 要接回标题页；开场衔接残留的黑幕/字幕也一并清掉
    this.audio.restoreMusic();
    this.audio.setMood('idle');
    this.audio.stopHeartbeat();
    this.bootFade = -1;
    this.bootStarted = false;
    this.hud.setBoot(0);
    this.hud.setBootHint(0);
    this.hud.setPlayChromeVisible(true);
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
    this.hud.showPanel('pause');
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hud.hidePanel();
    // 终局是纯演出，松手交给玩家就等于「跳过」——用户明确要求不能跳过
    if (!this.demoActive && this.phase !== 'finaleLook' && this.phase !== 'intro' && this.phase !== 'ending') this.player.setControl(true);
    this.requestLock();
  }

  retryFinale() {
    this.hud.hidePanel();
    this.hud.clearFade();
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
      // boot 相位也要锁：指针锁必须在点击那个手势里请求，等 3.3 秒再请求就可能被拒。
      // 所以这里的判据比 isLive() 宽一档（boot 不算「在玩」，但可以锁）。
      if (!this.canLock() || this.paused) return;
      const lock = this.canvas.requestPointerLock?.();
      if (lock?.catch) {
        lock.catch(() => {
          // Esc 退出后浏览器有约 1.25s 的重锁冷却；失败时提示玩家点击画面
          if (this.canLock() && !this.paused) this.say('点击画面锁定鼠标视角', 2.5);
        });
      }
    });
  }

  /** 当前相位允许抓指针锁：正式游玩各相位 + 开场衔接（boot）。 */
  canLock() {
    return this.isLive() || this.phase === 'boot';
  }

  /** 游戏中指针未锁定时，点击画布重新锁定鼠标。 */
  tryRelock() {
    if (this.demoActive || this.paused || !this.isLive()) return;
    if (document.pointerLockElement === this.canvas) return;
    this.requestLock();
  }

  isLive() {
    // boot 也算「不在玩」：开场衔接里玩家按 Esc 不该弹出暂停面板
    return !['menu', 'boot', 'lose', 'badEnd'].includes(this.phase);
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
    // 开场衔接：只推黑幕和字幕，游戏本身还没开始（这一帧不跑 level/player）
    if (this.phase === 'boot') {
      this.updateBoot(dt);
      return;
    }
    // 开局之后的那一段退黑幕：放在暂停判断之前，免得暂停时画面卡在半黑里
    if (this.bootFade >= 0) this.updateBootFade(dt);
    if (this.paused) return;

    this.time += dt;
    if (this.photoLock > 0) this.photoLock -= dt;
    this.updateCameraState(dt);
    if (this.demoActive) this.demo.update(dt);
    this.player.speedScale = this.phase === 'prologue' ? CONFIG.prologueSpeed / CONFIG.walkSpeed : 1;
    this.player.update(dt, this.level.getColliders());
    // 摄像机抖动叠加偏移（序章出事时）。这里做一次有限性检查：
    // 只要 shakeX/shakeY 里漏进一个 undefined/NaN，下面 += 就会把相机坐标写成
    // NaN，three.js 会静默画出一帧全黑，很难查。宁可不抖。
    const shakeX = Number.isFinite(this.shakeX) ? this.shakeX : 0;
    const shakeY = Number.isFinite(this.shakeY) ? this.shakeY : 0;
    if (shakeX !== 0 || shakeY !== 0) {
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
    }
    // 第5关拍照后教室颤抖
    if (this.l5ShakeT > 0) {
      this.l5ShakeT = Math.max(0, this.l5ShakeT - dt);
      const intensity = this.l5ShakeT / 2.0 * 0.035;
      this.camera.position.x += (Math.random() - 0.5) * 2 * intensity;
      this.camera.position.y += (Math.random() - 0.5) * 2 * intensity;
      if (this.l5ShakeT <= 0) this.l5ShakeT = 0;
    }
    this.updateZones();
    this.updateFlow(dt);
    this.level.stepItems(dt, this.player);
    // 终局期间 level 停在「被藏起来」的状态，走廊/教室不该再被更新：
    // 它的 update 会按 env().mood 重写雾、并且每帧推 NPC 和道具。
    if (this.phase === 'ending' || this.phase === 'badEnd') {
      this.applyEndingCamera();
      if (this.safehouse) this.safehouse.update(dt);
      // 安全屋的三盏灯是常驻点光源池里的副本（第二十三轮起灯全走池子），
      // 而池子平时由 level.update 的尾巴刷新 —— 这一段恰恰不调 level.update，
      // 不手工刷新一次的话池子里还是走廊那几盏灯的位置，安全屋会整间全黑。
      this.level.updatePointPool(this.env(), this.camera.position);
    } else {
      this.level.update(dt, this.env());
    }
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
      playerX: this.player.x,
      playerZ: this.player.z,
      playerYaw: this.player.yaw,
      levelIndex: this.levelIndex,
    };
  }

  mood() {
    if (this.phase === 'menu') return 'menu';
    if (this.phase === 'intro') return 'hall';
    if (this.phase === 'finaleLook' || this.phase === 'finaleChase' || this.phase === 'lose') return 'chase';
    // 安全屋是「明亮、给人安全感」的房间：雾最淡、半球光最亮的一档
    if (this.phase === 'ending' || this.phase === 'badEnd') return 'calm';
    if (this.phase === 'level' || this.phase === 'entering') return 'play';
    return 'hall';
  }

  npcMode() {
    if (this.phase === 'intro') return 'idle';
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
    if (this.phase === 'prologue') {
      // 序章：第一次走进教室 → 第 1 关。进门就关门，人可以继续走。
      this.aheadLevel = 1;
      this.phase = 'entering';
      this.sealEntry();
      return;
    }
    if (this.phase !== 'corridor') return;
    if (!this.aheadLevel) {
      // 出门又立刻折回来：走廊还没走到中段，下一关没铺，房间当然还是原来那间。
      // 以前这里会把 phase 变成 entering，进屋 2.1 m 就直接跳下一关——
      // 玩家一好奇"退回去看看"就把关跳了，而且换场是当着他的面发生的。
      this.phase = 'level';
      this.hud.setObjective(copy.backToDoor);
      this.say(copy.corridorAgain, 2.4);
      return;
    }
    this.phase = 'entering';
    this.sealEntry();
  }

  /**
   * 一进教室就关门。人不停，也不收成黑屏。
   * 门合严之后 updateEntrySeal 才把这一关定下来并放出异常。
   */
  sealEntry() {
    if (this.entryClosing) return;
    this.entryClosing = true;
    this.level.setDoorOpen(false);
    this.audio.door();
  }

  onExit() {
    if (this.phase === 'entering') {
      this.phase = this.levelIndex === 0 ? 'prologue' : 'corridor';
      // 门还没合上就退回去：重新打开，这次进门不算数。
      if (this.entryClosing) this.level.setDoorOpen(true);
      this.entryClosing = false;
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
    // 进门后等人把教室定下来：门合上就放异常，中间不黑屏、也不锁移动。
    if (this.phase === 'entering') this.updateEntrySeal();
    if (this.phase === 'leaving' && this.level.isInsideRoom(this.player.x, this.player.z)) this.phase = 'level';
    // 走廊中段换场：走出教室门十几米、背对着教室的时候，才把下一关的场景真的铺进来。
    // 铺完之后玩家走回门口进屋，剩下的只有状态切换——不会再有"站在房间里看它变样"。
    // 门在讲台一端。刚走出东侧门口时人还对着门洞，不能在那儿换场。
    const doorClear = Math.hypot(this.player.x - LAYOUT.door.x, this.player.z - LAYOUT.room.maxZ);
    if (this.phase === 'corridor' && !this.aheadLevel && this.levelIndex < LEVELS
      && this.player.z > LAYOUT.room.maxZ
      && Math.abs(this.player.x) >= LAYOUT.hallSwapX
      && doorClear >= 14) {
      this.installLevel(this.levelIndex + 1, false);
    }
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
      if (this.turning) {
        // 镜头正自己往逃跑方向转；转到位才交还操作（这期间怪物也是停着的）
        if (!this.player.autoTurn) this.finishTurnBack();
      } else if (this.lookT >= lookHoldSeconds()) {
        this.beginChase();
      }
    }
    if (this.phase === 'finaleChase') this.updateChase(dt);
    if (this.phase === 'ending') {
      this.updateEnding(dt);
      return;
    }
    if (this.phase === 'badEnd') return;

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

  /**
   * 把第 index 关的进度和提示换上。
   * spawn 为 false 时先不放异常。调试跳关走默认，当场放好。
   */
  installLevel(index, spawn = true) {
    this.levelIndex = index;
    this.aheadLevel = index;
    this.cleared = false;
    if (spawn) this.level.spawnUpTo(index);
    this.level.hideNpc();
    if (!this.hasCamera) this.level.revealPickup();
    this.hud.setRecord(index - 1, LEVELS);
    this.hud.setObjective(anomalyHint(index));
  }

  /**
   * 门合严之后把这一关定下来，异常当场放好。
   * 人退回走廊时，onExit 会重新开门，这次进门不算数。
   */
  updateEntrySeal() {
    if (!this.entryClosing) return;
    if (this.level.doorAngle > 0.05) return;
    this.enterLevelNow(this.aheadLevel || this.levelIndex, true);
  }

  /**
   * 玩家已经走进教室：定 phase、关门、播报，并放出这一关的异常。
   * quietDoor：门已经在合上，不要再响一次。
   * spawn：false 时先不放异常。
   */
  enterLevelNow(index = this.aheadLevel || this.levelIndex, quietDoor = false, spawn = true) {
    this.installLevel(index, spawn);
    this.aheadLevel = 0;
    this.phase = 'level';
    this.cleared = false;
    this.level.loopEnabled = false;
    if (!quietDoor) {
      this.level.setDoorOpen(false);
      this.audio.door();
    }
    if (index === 1) {
      this.say(copy.someoneGone, 2.2);
      this.pendingLine = { t: 2.3, text: copy.cameraOnFloor, ttl: 2.4 };
    } else {
      this.say(copy.roomChanged, 2.3);
    }
  }

  /** 兜底入口：装好并当作已经进门。调试跳关（devtools.jumpToLevel）走这条。 */
  beginLevel(index) {
    this.enterLevelNow(index);
  }

  wrapCorridor() {
    if (this.phase === 'finaleLook' || this.phase === 'finaleChase' || this.phase === 'ending' || this.phase === 'badEnd' || this.phase === 'lose') return;
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
    // 进走廊时 aheadLevel 一定是空的：上一关已经进门落位（enterLevelNow 会清零）。
    // 这里再清一次，是为了兜住"出门→折回→再出门"这种反复横跳的路径。
    this.aheadLevel = 0;
    this.level.loopEnabled = true;
    this.level.setDoorOpen(true);
    this.hud.setObjective(copy.backToDoor);
    this.say(copy.corridorLoop, 2.6);
    // 走廊里只做"建场景"这一步：把下一关的异常建好但不挂进场景。
    // 走到中段才 spawnUpTo 挂上去（installLevel），那时玩家已经背对教室十几米，
    // 换场看不见；建网格/纹理/点光着色器编译的开销全部落在走路的时候。
    if (this.levelIndex < LEVELS) this.level.prewarm(this.levelIndex + 1);
  }

  beginFinale() {
    this.phase = 'finaleLook';
    this.lookT = 0;
    this.turning = false;
    this.level.loopEnabled = false;
    this.level.setDoorOpen(false);
    this.level.showExit(true);
    // 追逐阶段绝不带红眼：那是最后一幕才揭示的东西
    this.level.showClassmateEyes(false);
    this.level.turnClassmate(false);
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

  /**
   * 注视结束 → 镜头自动转回逃跑方向。
   * 玩家被强迫看完身后的怪物之后不用自己转身：镜头自己拧回 +X（EXIT 那头），
   * 转到位才把操作权交回去，所以接下来只要按 W 往前跑。
   */
  beginChase() {
    if (this.phase !== 'finaleLook') return;
    this.turning = true;
    this.player.endLookLock();
    this.player.beginAutoTurn(ESCAPE_YAW, 0);
    this.player.clearInteract();
    this.player.clearShoot();
    // 注视期间玩家可能又拿出了相机，这里再收一次；之后仍可按 E 拿出
    this.autoLowerCamera();
    // 转身这 0.73 秒把环境低频抽空：真空之后再落 stinger，起跑那一下才有重量
    this.audio.duckAmbient(true);
    // 追逐开始就把尽头那扇门点亮：它同时也是「该往哪跑」的路标。
    // 第十七轮起门本身是一盏「刺眼」的灯，起跑时 0.45 就够在雾里留下一个光点，
    // 越跑越亮（见 updateChase），抵到门口时已经是压不住的白。
    this.level.setExitGlow(0.35);
    this.level.setDoorGlow(0.45);
  }

  /** 视角已经转回逃跑方向：交还操作，追逐正式开始，怪物起步。 */
  finishTurnBack() {
    this.turning = false;
    this.phase = 'finaleChase';
    emit(EVENT.lookUnlock, {});
    if (!this.demoActive) this.player.setControl(true);
    this.hud.setChase(true);
    // 正中「快跑！」闪一下就没了，常驻的只有上面那行「按住 Shift 冲刺」
    this.hud.flashChase();
    // 与「快跑！」同一帧落地：环境低频回来 + 一记下潜
    this.audio.duckAmbient(false);
    this.audio.stinger();
    this.entityStepAcc = 0;
    this.entityStepSide = 1;
  }

  updateChase(dt) {
    const beforeX = this.level.entity.position.x;
    const beforeZ = this.level.entity.position.z;
    this.level.stepEntity(this.player.x, this.player.z, dt);
    const dist = Math.hypot(
      this.player.x - this.level.entity.position.x,
      this.player.z - this.level.entity.position.z,
    );
    // 怪物一步 1.5 米（4.45m/s ⇒ 约 3 步/秒），按实际走过的距离累积，
    // 不会因为掉帧或多算一帧而变调。之前整段追逐它一声不响。
    const moved = Math.hypot(
      this.level.entity.position.x - beforeX,
      this.level.entity.position.z - beforeZ,
    );
    this.entityStepAcc += moved;
    if (this.entityStepAcc >= 1.5) {
      this.entityStepAcc -= 1.5;
      this.entityStepSide = -this.entityStepSide;
      this.audio.monsterStep(dist, 0.28 * this.entityStepSide);
    }
    // 门越跑越亮：起点只留一个隔着几十米也看得见的光点，抵到门口就是「门内透出来的强光」
    const toDoor = Math.max(0, LAYOUT.doorwayX - this.player.x);
    this.level.setDoorGlow(0.45 + 0.55 * clamp(1 - toDoor / 34, 0, 1));
    // 跑到走廊尽头那扇发光的门 = 进入终局。门在墙里（x≈65.88），
    // 玩家会被墙挡在 65.66 左右，所以判定线取 64.9，先于撞墙触发。
    if (dist < CONFIG.entityCatch) this.lose();
    else if (this.player.x >= LAYOUT.doorwayX) this.beginEnding();
  }

  // ───────────────────────── 终局：走廊尽头的门 → 安全屋 ─────────────────────────

  /**
   * 跑到那扇发光的门：从这里开始玩家不再有操作，全程固定剧情。
   * 顺序有讲究：先锁镜头（门是最亮的参照物），再关掉走廊的灯，
   * 玩家在黑暗里只能跟着门走，这一幕才像「逃」。
   */
  beginEnding() {
    if (this.phase === 'ending' || this.phase === 'badEnd' || this.phase === 'lose') return;
    this.phase = 'ending';
    this.endStage = 0;
    this.endT = 0;
    this.endCues = new Set();
    this.endFromX = this.player.x;
    this.endFallX = undefined;
    this.endLungeTo = null;
    this.player.setControl(false);
    this.player.setScripted(true);
    this.player.clearInteract();
    this.player.clearShoot();
    this.player.clearCourse();
    this.player.endAutoTurn();
    this.player.endLookLock();
    this.autoLowerCamera();
    this.level.loopEnabled = false;
    this.level.setExitGlow(0.35);
    // 门光不再归零：追逐的最后一段它已经是满的，抵到门口这一刻必须是「强光扑面」，
    // 归零再涨会给玩家看到一次「门自己灭了又亮」的闪烁。
    this.level.setDoorGlow(1);
    this.level.openEndDoor(0);
    this.level.setHallLampScale(0);
    const aim = this.level.endDoorAimPoint();
    this.player.beginLookLock(aim);
    emit(EVENT.lookLock, { target: aim });
    this.hud.setChase(false);
    this.hud.setDanger(0);
    this.hud.setObjective('');
    this.hud.setPrompt('');
    this.hud.setSubtitle('');
    this.audio.setTension(0);
  }

  /**
   * 每帧推进：把这一帧的时间按「本段还剩多少」切开，先跑连续演出再切段。
   *
   * 关键是「切段」必须发生在该段拿到一次 t≈段长 的更新之后：白光要在 t=段长 那一帧
   * 正好退到 0、黑幕要正好涨到 1，否则会永久残留一层 2% 的白（肉眼可见的灰）。
   * 跨段的那一帧剩下的时间算给新段，不会把整帧都记到新段头上。
   */
  updateEnding(dt) {
    if (this.debugHold) return;
    let left = dt * (this.debugFast ? 6 : 1);
    for (let guard = 0; guard < 32 && left > 1e-9; guard += 1) {
      const dur = END_STAGE[this.endStage];
      const room = Math.max(0, dur - this.endT);
      const step = Math.min(left, room);
      this.endT += step;
      left -= step;
      this.updateEndStage(step);
      if (this.phase !== 'ending') return;
      if (this.endT < dur - 1e-9) break;
      if (this.endStage >= END_LAST) {
        // 最后一段是纯黑留白，走完才出结束卡
        this.endT = dur;
        this.badEnd();
        return;
      }
      this.endStage += 1;
      this.endT = 0;
      this.enterEndStage();
    }
  }

  /** 一次性音效/瞬移的开关：同一段里只会响一次，debugFast 也不会连响。 */
  cueEnd(key, at, fn) {
    if (this.endT < at || this.endCues.has(key)) return false;
    this.endCues.add(key);
    fn();
    return true;
  }

  /** 进入某一段时要做的「一次性」动作（瞬移、换场景、换环境）。 */
  enterEndStage() {
    switch (this.endStage) {
      case 1: {
        // 白光涨起来的同时把环境低频抽走：这一下听觉上的「捂耳朵」比画面更早
        this.audio.duckAmbient(true);
        this.audio.tone(1960, 0.5, 0.05, 'sine');
        this.audio.stopHeartbeat();
        break;
      }
      case 2: {
        // 全白换场。整段演出里只有这一处可以瞬移，而且这一帧的 alpha 恒为 1
        this.player.endLookLock();
        this.player.endAutoTurn();
        this.player.reset(SAFEHOUSE.spawn.x, SAFEHOUSE.spawn.z, SAFEHOUSE.spawn.yaw);
        this.player.setScripted(true);
        this.player.setControl(false);
        this.level.setVisible(false);
        this.level.setHallLampScale(0);
        if (this.safehouse) {
          this.safehouse.reset();
          this.safehouse.show();
          this.safehouse.setMateVisible(false);
        }
        this.hud.fadeWhite(1);
        break;
      }
      case 5: {
        // 站直、抬眼看门。门在 −X 方向，yaw = +π/2 就是面朝 −X。
        // 真正的「回头」推迟到 t=0.30（cueEnd 'look-back'）：先有门响，再回头。
        break;
      }
      case 6: {
        this.player.endAutoTurn();
        break;
      }
      case 7: {
        // 镜头对准他胸口：他背对着，这个高度正好把人和门框一起框进来
        this.aimAtMate(-0.04);
        this.say(copy.safeWhere, 4.0);
        break;
      }
      case 8: {
        this.say(copy.safeIsThatSo, 1.9);
        if (this.safehouse) {
          const p = this.safehouse.mateChestPoint();
          // 同学朝向约定：本地 +Z 是脸，yaw = atan2(dx, dz)
          this.endMateYaw = Math.atan2(this.player.x - p.x, this.player.z - p.z);
        }
        break;
      }
      case 9: {
        // 红眼亮起来的那一下才起心跳：先「看见」，再「听见」
        this.audio.stinger();
        this.audio.startHeartbeat();
        break;
      }
      case 10: {
        this.endFallX = this.player.x;
        // 落点必须用「躺下之后」的镜头算：这一刻镜头还要往后倒 0.55 米、抬 0.30 弧度
        this.endLungeTo = this.mateLungePoint();
        // 同学扑上来的那一口：真人尖叫采样（assets/audio/scream.ogg，CC0）
        this.audio.scream(0.62);
        // q 不能省：burst 里直接写 filter.Q.value = q，漏了它赋 NaN 会抛异常，
        // 把紧跟其后的 audio.lose() 一起吞掉（追逐伴奏不收、被抓的两个下坠音也没声）。
        this.audio.burst({ duration: 0.4, gain: 0.5, type: 'lowpass', freq: 700, q: 0.7 });
        this.audio.lose();
        break;
      }
      case 12: {
        this.hud.setSubtitle('');
        break;
      }
      default:
        break;
    }
  }

  /** 本段的连续演出。所有进度都从 endT 推，不读任何「转完了吗」的状态。 */
  updateEndStage(dt) {
    const t = this.endT;
    const ease = (k) => k * k * (3 - 2 * k);
    switch (this.endStage) {
      case 0: {
        // 门光在追逐里已经涨满，这里只管把门开一条缝、让他扑到门口：
        // 光要先有地方漏出来。再叠一层 0.94→1 的微涨，门口那一下才「还在变亮」
        const k = ease(Math.min(1, t / 0.90));
        this.level.setDoorGlow(0.94 + 0.06 * k);
        this.level.openEndDoor(0.12 * k);
        // 第二十七轮：这里原来有「到达门口的一口气」（`breath-arrive`）。
        // 用户说的是「从靠近发光门到刚进安全屋这段时间的喘息声很混乱」——
        // 走得最急的门口那一声 + 白光那一下 + 落地后的喘气串，三样挤在 3 秒里。
        // 现在门口**不出喘气声**（跑急了的呼吸交给脚步/心跳），
        // 喘气只留在刚进安全屋、低头那一段，且跟着镜头的节拍走。
        break;
      }
      case 1: {
        // 白光是「被吞掉」而不是「淡出」：0.45 秒涨满，再按住 0.10 秒
        this.hud.fadeWhite(Math.min(1, t / 0.45));
        // 身体还在往门口倾，脚不动，只是重心往前 15 厘米
        this.player.x = this.endFromX + 0.15 * ease(Math.min(1, t / 0.45));
        break;
      }
      case 2: {
        this.hud.fadeWhite(1);
        break;
      }
      case 3: {
        // 显影：雾退、环境光亮起来、曝光抬一点 —— 「安全感」全靠这三个数
        const e = ease(Math.min(1, t / 0.70));
        this.hud.fadeWhite(1 - Math.min(1, t / 0.70));
        this.scene.fog.density = CONFIG.fogCalm + (CONFIG.fogSafe - CONFIG.fogCalm) * e;
        this.level.setHemi(CONFIG.hemi + (CONFIG.hemiSafe - CONFIG.hemi) * e);
        CONFIG.exposure = this.baseExposure + (CONFIG.exposureSafe - this.baseExposure) * e;
        // 先换 mood 再解除压暗：setMood 自己会把 ambientDucked 复位
        this.cueEnd('safe-room', 0, () => {
          this.audio.setMood('calm');
          this.audio.duckAmbient(false);
          this.audio.startDrone();
        });
        break;
      }
      case 4: {
        // 低头喘气本身在 applyEndingCamera 里做（要叠在 syncCamera 之后才有效）。
        // 喘气：只在**刚进新场景**这几秒里出现，而且**一拍 = 镜头低头一次** ——
        // `pant()` 的节拍就是 END_BREATH_PERIOD，呼气落在头沉到最低的那一下。
        // 这一段镜头的摆动一共低三次头（0.32 / 1.37 / 2.42 秒，第三下已经跨到
        // 第 5 段开头 0.02 秒），所以第二十八轮把 `total` 从 2.30 提到 3.40：
        // 2.30 只排得下 2 拍（0 / 1.05 秒），2.10 秒那拍被 `pant()` 的收尾判断切掉，
        // 第三下低头就是哑的、之后近 1.1 秒死寂 —— 用户听到的「不够连贯」。
        // 3.40 排三拍（0 / 1.05 / 2.10 秒），第三拍的呼气从 2.40 秒拖到 3.30 秒，
        // 正好是「还没喘匀就听见门响」；第四拍（3.15 秒）仍被切掉。
        this.cueEnd('pant', END_PANT_AT, () => this.audio.pant(3.40, { period: END_BREATH_PERIOD }));
        break;
      }
      case 5: {
        // 「听到门响再回头」：t=0 门里先传来一声响（主角还背对着门，看不见），
        // 0.30 秒后他才回头 —— 而这一眼里，同学**已经**背对着他把门往回带了。
        // 脸一次都不露：他始终面朝门（yaw = −π/2），头也不回。
        this.cueEnd('mate-place', 0, () => {
          if (!this.safehouse) return;
          this.safehouse.placeMate(SAFEHOUSE.mateStation.x, SAFEHOUSE.mateStation.z, -Math.PI / 2);
          this.safehouse.setMateVisible(true);
          this.safehouse.setMateOpacity(1);
        });
        this.cueEnd('door-creak', 0.02, () => this.audio.door());
        this.cueEnd('look-back', 0.30, () => this.player.beginAutoTurn(Math.PI / 2, -0.05));
        // 门在半掩着往回带：0.95 → 0.45。抬头那一下正好看见门还在动
        if (this.safehouse) {
          const k = ease(clamp((t - 0.30) / 1.00, 0, 1));
          this.safehouse.openDoor(0.95 - 0.50 * k);
        }
        break;
      }
      case 6: {
        if (!this.safehouse) break;
        // 门关实：0.45 → 0，0.55 秒，然后留 0.35 秒的静止（他背对着站住）。
        // 整段没有一步走动、没有一次转身：从玩家抬头到黑屏，他都是那个背影。
        const k = ease(Math.min(1, t / 0.55));
        this.safehouse.openDoor(0.45 * (1 - k));
        this.cueEnd('mate-step', 0.12, () => this.audio.footstep(true));
        this.cueEnd('mate-door-close', 0.58, () => this.audio.door());
        break;
      }
      case 7: {
        // 主角开口的这 4.2 秒他一直背对着门站着（不回头）。
        // 阶段 6 只来得及转 0.5 秒，剩下的零点几弧度在这里收干净，
        // 否则说话期间他会是个「斜着站」的怪姿势。
        if (this.safehouse) this.safehouse.turnMate(-Math.PI / 2, 3.2, dt);
        break;
      }
      case 8: {
        // 先愣 1.55 秒（只有呼吸声），然后才慢慢转过来 ——「是吗……」之后的那段沉默
        if (t > 1.55 && this.safehouse) {
          const target = this.endMateYaw ?? Math.PI / 2;
          this.safehouse.turnMate(target, 2.9, dt);
        }
        break;
      }
      case 9: {
        // 两个通道，先亮眼再咧嘴：
        //   0.05–0.85 秒  红点 + 光晕 + 眼灯在**原地**涨起来（不移动、不缩放）
        //   0.55–1.90 秒  嘴从一道缝咧到最大，尖牙跟着淡入
        // 收尾留 0.2 秒静止：全亮的红眼 + 咧开的嘴，正好让人看清再扑。
        if (this.safehouse) {
          const eyes = ease(clamp((t - 0.05) / 0.80, 0, 1));
          const mouth = ease(clamp((t - 0.55) / 1.35, 0, 1));
          this.safehouse.setReveal(eyes, mouth);
          if (this.endMateYaw !== undefined) this.safehouse.turnMate(this.endMateYaw, 2.9, dt);
        }
        break;
      }
      case 10: {
        // 飞扑：他扑过来的同时镜头后仰、抖动（相机部分在 applyEndingCamera）
        if (this.safehouse) this.safehouse.lunge(ease(Math.min(1, t / 0.35)), this.endLungeTo);
        break;
      }
      case 11: {
        this.hud.fadeBlack(Math.min(1, t / 0.35));
        break;
      }
      default:
        break;
    }
  }

  /** 把镜头对准同学胸口上方一点（他背对时看后颈，转身后看脸）。 */
  aimAtMate(pitchBias = 0) {
    if (!this.safehouse) return;
    const p = this.safehouse.mateChestPoint();
    const dx = p.x - this.player.x;
    const dz = p.z - this.player.z;
    const dist = Math.max(0.2, Math.hypot(dx, dz));
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(p.y - this.player.eyeY(), dist) + pitchBias;
    this.player.beginAutoTurn(yaw, pitch);
  }

  /**
   * 飞扑落点：把**同学的头**放到镜头正前方 0.55 米的那条视线上。
   *
   * 旧做法是沿 +X 固定推 1.6 米，看起来像「从旁边擦过去」——他本来就站在
   * 玩家斜前方 0.25 米的偏位上，推到尽头时人还在画面的侧边，于是观众看到的
   * 是「半个身子往边上扑」。现在落点由最终镜头姿态反推：
   * 头（高度 headHeight）正好压在视线上 0.55 米处，脸到镜片约 0.42 米，
   * 一张 0.26 米高的脸占满半个画面高度，最后定格就是「半张脸」再黑屏。
   */
  mateLungePoint() {
    if (!this.safehouse) return null;
    const camX = (this.endFallX ?? this.player.x) + 0.55;
    const camZ = this.player.z;
    const camY = this.player.eyeY();
    const yaw = this.player.yaw;
    // 与 applyEndingCamera 的 stage≥10 增量保持一致：0.08 + 0.22·p，p 取段末值
    const pitch = this.player.pitch + 0.08 + 0.22 * (1 - Math.exp(-9 * END_STAGE[10]));
    const flat = Math.cos(pitch) * MATE_LUNGE_GAP;
    const headY = this.safehouse.headHeight();
    return {
      x: camX - Math.sin(yaw) * flat,
      y: Math.max(0, camY + Math.sin(pitch) * MATE_LUNGE_GAP - headY),
      z: camZ - Math.cos(yaw) * flat,
    };
  }

  /**
   * 终局的镜头附加量。必须在 player.update() 之后调用：syncCamera 每帧都会
   * 用 player 的 x/z/eyeY/yaw/pitch 整体覆盖相机，所以这里只能加「增量」，
   * 而且不能累积（下一帧就会被清掉）。
   */
  applyEndingCamera() {
    if (this.phase !== 'ending' && this.phase !== 'badEnd') return;
    const stage = this.endStage;
    const t = this.endT;
    const ease = (k) => k * k * (3 - 2 * k);
    let pitch = 0;

    if (stage === 4 || stage === 5) {
      // 低头 0.55 弧度，再叠一个 1.05 秒的呼吸起伏。
      // 第五段前 0.30 秒保持低头（那声门响就是在这时候传来，他还没抬头），
      // 然后用 0.42 秒把头抬起来：抬头和转身同时发生，呼吸跟着收掉。
      //
      // 第二十七轮：声音和镜头**共用一条时间轴**（用户要的是「频率和主视角低头频率一致」）。
      // `tb` 是「从第 4 段开头算起」的连续时间 —— 第 5 段接着往下数，不再从 0 重启，
      // 所以跨段时相位不会跳。相位锚点 = 第一拍吸气 + 呼气偏移：
      // `cos` 在锚点处正好是 1，于是「呼气起、头沉到最低」落在同一瞬间，
      // 一拍一次，和 `pant()` 的节拍严丝合缝（sin 的极值在锚点后 1/4 拍，会对歪）。
      const tb = stage === 4 ? t : END_STAGE[4] + t;
      const phase = ((tb - (END_PANT_AT + END_EXHALE_AT)) / END_BREATH_PERIOD) * Math.PI * 2;
      // 低头只用 0.30 秒收完：要在第一拍呼气（0.32 秒）之前把脑袋放到位，
      // 否则低头那一下的加速会把第一拍的最低点往后拖，又对不齐。
      const k = stage === 4 ? Math.min(1, t / 0.30) : clamp((t - 0.30) / 0.42, 0, 1);
      const base = -0.55 * (stage === 4 ? ease(k) : 1 - ease(k));
      const breathe = stage === 4 ? k : 1 - k;
      pitch = base - Math.cos(phase) * 0.085 * breathe;
      this.camera.position.y -= Math.cos(phase) * 0.012 * breathe;
    } else if (stage === 9) {
      // 他抬起眼的那一下，镜头也跟着微微上扬
      pitch = 0.08 * ease(Math.min(1, t / 0.85));
    } else if (stage >= 10) {
      // 飞扑之后：人被撞得往后倒，镜头翻上去，最后定格
      const p = 1 - Math.exp(-9 * (stage === 10 ? t : END_STAGE[10]));
      const fallX = (this.endFallX ?? this.player.x) + 0.55 * p;
      this.camera.position.x += fallX - this.player.x;
      this.player.x = fallX;
      pitch = 0.08 + 0.22 * p;
      if (stage === 10) {
        // 14 Hz 的手持抖动，振幅 0.06 秒内起来，避免第一帧跳变
        const amp = 0.055 * Math.min(1, t / 0.06);
        this.camera.position.x += Math.sin(t * 88) * amp;
        this.camera.position.y += Math.sin(t * 96 + 1.1) * amp * 0.8;
        this.camera.rotation.z += Math.sin(t * 74) * 0.014;
      }
    }
    this.camera.rotation.x += pitch;
  }

  /** 结局卡。黑场保持不动：结束卡的 z-index 比黑幕高，会盖在黑幕上面。 */
  badEnd() {
    if (this.phase !== 'ending') return;
    this.phase = 'badEnd';
    this.player.setControl(false);
    this.player.endLookLock();
    this.player.endAutoTurn();
    this.audio.stopHeartbeat();
    this.audio.setMood('idle');
    this.hud.setChase(false);
    this.hud.setDanger(0);
    this.hud.setPrompt('');
    this.hud.setSubtitle('');
    this.hud.fadeBlack(1);
    this.hud.showPanel('badEnd', copy.badTitle, copy.badBody);
    this.releaseLock();
  }

  /**
   * 所有「中途离开终局」的出口都必须走这里：结束卡的重开/回主菜单、Esc 菜单里
   * 的回主菜单、演示收尾。少清一样，下一局就会从满屏纯白开始，而且 WASD 不响应。
   */
  abortEnding() {
    const inEnding = this.phase === 'ending' || this.phase === 'badEnd' || this.endStage > 0;
    this.endStage = 0;
    this.endT = 0;
    this.endCues = new Set();
    this.endFallX = undefined;
    this.endMateYaw = undefined;
    // 调试用的冻结开关必须一起清：演示收尾会拿 debugHold 冻住终局，
    // 不清的话下一次真正播终局会停在第一段不动。
    this.debugHold = false;
    this.debugFast = false;
    this.hud.clearFade();
    if (this.safehouse) {
      this.safehouse.setVisible(false);
      this.safehouse.reset();
    }
    this.level.setVisible(true);
    this.scene.fog.density = CONFIG.fogCalm;
    this.level.setHemi(null);
    this.level.setHallLampScale(1);
    this.level.setDoorGlow(0);
    this.level.openEndDoor(0);
    CONFIG.exposure = this.baseExposure;
    this.player.endLookLock();
    this.player.endAutoTurn();
    if (inEnding) {
      this.player.setScripted(false);
      this.player.setControl(true);
      this.audio.stopHeartbeat();
      if (this.safehouse) this.safehouse.setMateVisible(false);
    }
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
    // 第 1 关捡起相机后补一句心声：先说操作（E/F），再说"我该拍下来"，
    // 让第一次玩的人知道这一关的正事是拍照，而不只是继续往前走。
    if (this.levelIndex === 1) this.pendingLine = { t: 2.4, text: copy.cameraMind, ttl: 3.0 };
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
    // 第二十六轮：这里原来给第四关补了一声喘气（`levelIndex === 4` → breath()），
    // 但第四关拍完是「拍到就走」，喘气跟这一下的情绪不搭，用户明确要求删掉。
    // 第五关的怒吼/颤抖不在这里，见下面 levelIndex === 5 那段。
    // 第5关：眼睛被拍 → 怒吼 + 颤抖
    if (this.levelIndex === 5) {
      this.level.notifyAnomalyPhoto(5);
      // 低频怒吼（叠加2层，营造厚重感）
      const roar = () => {
        this.audio.burst({ duration: 1.2, gain: 0.55, type: 'lowpass', freq: 120, q: 0.4 });
        this.audio.burst({ duration: 0.9, gain: 0.35, type: 'bandpass', freq: 260, q: 0.6 });
        this.audio.tone(55, 0.6, 0.12, 'sawtooth');
        this.audio.tone(98, 0.5, 0.08, 'sine');
      };
      roar();
      // 颤抖效果：启动一个短暂的位置抖动
      this.l5ShakeT = 2.0;
    }
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

  /** 旧版「逃出去了」结局路径：现在正片走 ending / badEnd，这里保留给 devtools 兜底。 */
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
    this.hud.showPanel('win');
  }

  lose() {
    if (this.phase === 'lose') return;
    this.phase = 'lose';
    this.player.setControl(false);
    this.player.endLookLock();
    this.player.clearCourse();
    this.level.hideEntity();
    this.audio.stopHeartbeat();
    this.audio.lose();
    this.hud.setChase(false);
    if (this.cameraState !== 'none') this.setCameraState('holstered');
    this.hud.showPanel('lose');
    this.releaseLock();
  }

  /**
   * 面板一出来就把鼠标还给玩家：被抓、结局卡都不用先按 Esc 才能点按钮。
   * 这里必须自己置 intentionalUnlock，否则 pointerlockchange 会当成玩家按了 Esc 而弹暂停。
   */
  releaseLock() {
    this.intentionalUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  updatePresentation() {
    let lamp = CONFIG.lampDim;
    if (this.phase === 'finaleChase' || this.phase === 'finaleLook') lamp = CONFIG.lampChase;
    else if (this.hasCamera) lamp = CONFIG.lamp;
    // 终局在明亮的安全屋里：手电只当个暖光点缀，别再打满
    if (this.phase === 'ending' || this.phase === 'badEnd') lamp = CONFIG.lamp * 0.6;
    this.player.setLamp(lamp);

    // 终局是固定演出：没有准星、没有「E 拿出相机」、没有红色暗角
    if (this.phase === 'ending' || this.phase === 'badEnd') {
      this.hud.setAimHot(false);
      this.hud.setPrompt('');
      this.hud.setDanger(0);
      this.audio.setTension(0);
      return;
    }

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
      const danger = clamp(1 - (dist - CONFIG.entityCatch) / 6, 0, 1);
      this.hud.setDanger(danger);
      // 同一份压力喂给声音：心跳 97 → 150 bpm，低频 drone 48 → 58Hz
      this.audio.setTension(danger);
    } else if (this.phase !== 'lose') {
      this.hud.setDanger(0);
      this.audio.setTension(0);
    }
  }

  /** 调试：直接跳到终局（?ending），用来检查安全屋那一段演出。 */
  debugPlayEnding(mode = '') {
    this.demoActive = false;
    this.paused = false;
    this.hasCamera = true;
    this.debugHold = false;
    this.debugFast = false;
    this.level.reset();
    this.hud.clearFade();
    this.hud.hidePanel();
    this.level.showExit(true);
    this.level.setExitGlow(0.16);
    this.level.loopEnabled = false;
    this.player.reset(LAYOUT.doorwayX - 1.2, LAYOUT.hall.z, -Math.PI / 2);
    this.player.setScripted(true);
    this.player.setControl(false);
    this.hud.showPlay();
    this.hud.setRecord(5, 5);
    this.beginEnding();
    if (mode === 'fast') {
      this.debugFast = true;
      return;
    }
    // 跳过前面几段，直接把安全屋摆好：这些动作要很多帧才走完，
    // 快进只能跳到「段」，站位得单独摆。
    if (mode === 'safe' || mode === 'reveal') {
      const skip = END_STAGE.slice(0, mode === 'reveal' ? 9 : 3).reduce((a, b) => a + b, 0);
      this.updateEnding(skip + 0.02);
      this.hud.fadeWhite(0);
      if (this.safehouse) {
        this.safehouse.setMateVisible(true);
        this.safehouse.openDoor(0);
        this.safehouse.walkMate(1.0, 1.12);
        this.safehouse.setMateYaw(this.endMateYaw ?? Math.PI / 2);
        if (mode === 'reveal') this.safehouse.setReveal(1, 1);
        this.aimAtMate(-0.04);
      }
      this.debugHold = true;
    }
  }

  /** 调试：用固定步长把整段终局跑完，记录段号（?ending=sim，不需要真实渲染）。 */
  debugSimulateEnding() {
    this.debugPlayEnding('');
    const trace = [];
    let last = -1;
    for (let i = 0; i < 400; i += 1) {
      this.updateEnding(0.05);
      this.applyEndingCamera();
      if (this.endStage !== last) {
        last = this.endStage;
        trace.push(`${i}:${this.endStage}`);
      }
      if (this.phase === 'badEnd') break;
    }
    document.body.dataset.endTrace = trace.join(',');
    document.body.dataset.endFinal = `phase=${this.phase}`
      + ` stage=${this.endStage}`
      + ` white=${this.hud.fadeShown.white}`
      + ` black=${this.hud.fadeShown.black}`
      + ` mate=${this.safehouse ? this.safehouse.mateYaw().toFixed(2) : 'none'}`;
  }

}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** 平滑阶跃（smoothstep），只给开场衔接的黑幕/字幕用。 */
function ease01(k) {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
}

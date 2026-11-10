import { LAYOUT } from './layout.js';

/**
 * 菜单上的 Watch Demo。走真实碰撞、拍照和追逐，不播录像。
 * 路径点跟 layout.js 的通道对齐；卡住超过 8 秒会拉到目标点，避免演示死锁。
 */
export class DemoDirector {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.index = 0;
    this.wait = 0;
    this.armed = false;
    this.retried = false;
  }

  start() {
    this.active = true;
    this.index = 0;
    this.wait = 0;
    this.armed = false;
    this.retried = false;
    this.held = false;
  }

  stop() {
    this.active = false;
    this.game.player.clearCourse();
  }

  /**
   * 调试用：把导演直接推到最后的收尾三步（waitStage 1 → holdWhite → wait 1.0）。
   * 演示要跑五关，无头浏览器一帧都推不动，所以「白光保持 1.0 s 再淡回标题」这一段
   * 只能从半路切入来验：`_probe/demotail.mjs` 用假 game 调这个方法，再按 0.05 s
   * 喂 dt。走的仍是 STEPS 里那三步和同一个 update()，不是另写一套收尾逻辑。
   */
  jumpToTail() {
    this.active = true;
    this.index = Math.max(0, STEPS.length - 3);
    this.wait = 0;
    this.armed = false;
    this.held = false;
    this.retried = false;
  }

  update(dt) {
    if (!this.active) return;
    // 演示在「白光吞屏」这一刻把终局冻住。不冻的话，第 1 段只剩 0.55 s，
    // 接着第 2 段换场、第 3 段开始「显影」，安全屋就会从白光里透出来——
    // 观众会看见后面还有什么，演示的全部悬念就没了。冻住后画面停在纯白，
    // 一直到最后淡回标题。
    const game = this.game;
    if (
      !this.held
      && game.phase === 'ending'
      && game.endStage >= 1
      && (game.endStage >= 2 || (game.hud.fadeShown?.white ?? 0) >= 0.999)
    ) {
      this.held = true;
      game.debugHold = true;
    }
    const step = STEPS[this.index];
    if (!step) {
      this.active = false;
      this.game.finishDemo();
      return;
    }
    if (this.run(step, dt)) {
      this.index += 1;
      this.wait = 0;
      this.armed = false;
      if (step.type === 'move') this.game.player.clearCourse();
    }
  }

  run(step, dt) {
    const game = this.game;
    if (step.type === 'wait') {
      this.wait += dt;
      return this.wait >= step.time;
    }
    if (step.type === 'say') {
      game.say(step.text, step.time ?? 2);
      return true;
    }
    if (step.type === 'waitPhase') return game.phase === step.phase;
    if (step.type === 'waitStage') {
      return game.phase === 'ending' && game.endStage >= step.stage;
    }
    // 等「白光已经满屏、终局已经冻住」再开始计时，这样白色是实打实停了 1.0 s
    if (step.type === 'holdWhite') return this.held;
    if (step.type === 'interact') {
      game.player.queueInteract();
      return true;
    }
    if (step.type === 'shoot') {
      game.prepareShoot = true;
      return true;
    }
    if (step.type === 'finale') {
      game.player.clearCourse();
      const live = ['finaleLook', 'finaleChase', 'ending', 'badEnd'];
      if (!live.includes(game.phase)) game.beginFinale();
      return true;
    }
    if (step.type === 'waitCleared') {
      this.wait += dt;
      if (game.cleared) return true;
      if (this.wait > 1.1 && !this.retried) {
        this.retried = true;
        game.prepareShoot = true;
      }
      if (this.wait > 2.6) {
        console.warn('演示射线没有打中异常，改走保底过关。');
        game.forceCurrentPhoto();
        return true;
      }
      return false;
    }
    if (step.type === 'move') {
      this.wait += dt;
      const point = this.point(step);
      if (!this.armed) {
        game.player.setCourse(point.x, point.z, step.speed ?? 3.4);
        this.armed = true;
      }
      if (game.player.courseDone || game.phase === 'ending' || game.phase === 'badEnd' || game.phase === 'lose') return true;
      if (this.wait > 8) {
        game.player.x = point.x;
        game.player.z = point.z;
        game.player.clearCourse();
        return true;
      }
    }
    return false;
  }

  point(step) {
    if (step.to === 'hall') return { x: step.x ?? LAYOUT.door.x, z: LAYOUT.hall.z };
    if (step.to === 'inside') return { x: step.x ?? LAYOUT.door.x, z: LAYOUT.room.maxZ - 2.45 };
    if (step.to === 'pickup') return { ...LAYOUT.pickup };
    if (step.to === 'aisle') {
      const stand = this.game.level.getAnomalyStand(1);
      return { x: 0, z: stand.z };
    }
    if (step.to === 'stand') return { ...this.game.level.getAnomalyStand(1) };
    // 门在墙里（x≈65.88），判定线 64.9：目标点要越过判定线，才跑得进终局
    if (step.to === 'ending') return { x: LAYOUT.doorwayX + 0.25, z: LAYOUT.hall.z };
    return { x: step.x, z: step.z };
  }
}

const STEPS = [
  { type: 'say', text: '就在这间。', time: 1.6 },
  { type: 'wait', time: 0.35 },
  { type: 'move', to: 'hall', speed: 3.6 },
  { type: 'move', to: 'inside', speed: 3.6 },
  { type: 'waitPhase', phase: 'level' },
  { type: 'move', to: 'pickup', speed: 3.2 },
  { type: 'interact' },
  { type: 'wait', time: 0.4 },
  { type: 'move', to: 'aisle', speed: 3.4 },
  { type: 'move', to: 'stand', speed: 3.2 },
  { type: 'shoot' },
  { type: 'waitCleared' },
  { type: 'wait', time: 1.05 },
  { type: 'move', to: 'aisle', speed: 3.6 },
  { type: 'move', to: 'inside', speed: 3.6 },
  { type: 'move', to: 'hall', speed: 3.8 },
  { type: 'finale' },
  { type: 'waitPhase', phase: 'finaleChase' },
  { type: 'move', to: 'ending', speed: 5.6 },
  // 演示在「白光吞屏」这一帧收尾：终局被冻住，所以安全屋（和同学）一帧都不露
  { type: 'waitStage', stage: 1 },
  { type: 'holdWhite' },
  { type: 'wait', time: 1.0 },
];

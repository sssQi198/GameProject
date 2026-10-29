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
  }

  stop() {
    this.active = false;
    this.game.player.clearCourse();
  }

  update(dt) {
    if (!this.active) return;
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
      if (game.phase !== 'finaleLook' && game.phase !== 'finaleChase' && game.phase !== 'epilogue' && game.phase !== 'win') {
        game.beginFinale();
      }
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
      if (game.player.courseDone || game.phase === 'win') return true;
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
    if (step.to === 'hall') return { x: step.x ?? 0, z: LAYOUT.hall.z };
    if (step.to === 'inside') return { x: step.x ?? 0, z: 3.55 };
    if (step.to === 'pickup') return { ...LAYOUT.pickup };
    if (step.to === 'aisle') {
      const stand = this.game.level.getAnomalyStand(1);
      return { x: stand.x, z: 4.05 };
    }
    if (step.to === 'stand') return { ...this.game.level.getAnomalyStand(1) };
    if (step.to === 'ending') return { ...LAYOUT.classmateEnd };
    return { x: step.x, z: step.z };
  }
}

const STEPS = [
  { type: 'say', text: '就在这间。', time: 1.6 },
  { type: 'wait', time: 0.35 },
  { type: 'move', to: 'hall', x: 0.1, speed: 3.6 },
  { type: 'move', to: 'inside', x: 0.1, speed: 3.6 },
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
  { type: 'move', to: 'inside', x: 0, speed: 3.6 },
  { type: 'move', to: 'hall', x: 0, speed: 3.8 },
  { type: 'finale' },
  { type: 'waitPhase', phase: 'finaleChase' },
  { type: 'move', to: 'ending', speed: 5.6 },
  { type: 'waitPhase', phase: 'win' },
  { type: 'wait', time: 1.6 },
];

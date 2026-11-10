/**
 * 终局状态机的端到端校验：直接用真的 Game（依赖全部用假的），
 * 只验证「注视 → 自动转回逃跑方向 → 交还操作 → 怪物起步」这条链。
 *
 * 不渲染、不碰 DOM、不用 WebGL。怪物用假 level 按 CONFIG.entitySpeed 线性逼近。
 */
import * as THREE from '../vendor/three.module.js';
import { CONFIG } from '../src/config.js';
import { LAYOUT } from '../src/layout.js';
import { Player } from '../src/player.js';
import { Game } from '../src/game.js';

globalThis.window = {
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {},
  devicePixelRatio: 1,
};
globalThis.document = {
  pointerLockElement: null,
  exitPointerLock() {},
  body: { dataset: {} },
  addEventListener() {},
  removeEventListener() {},
};

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
function wrap(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

function recorder() {
  const log = [];
  const state = {};
  const target = { log, state };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      const fn = (...args) => {
        log.push([key, args]);
        state[key] = args[0];
      };
      t[key] = fn;
      return fn;
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  });
}

class FakeLevel {
  constructor() {
    this.entity = new THREE.Group();
    this.entity.position.set(0, 0, 0);
    this.entityLight = { intensity: 12 };
    this.loopEnabled = false;
    this.npcDone = true;
    this.stepCalls = 0;
  }
  isInsideRoom() { return false; }        // 终局在走廊里
  nearPickup() { return false; }
  getColliders() { return []; }
  update() {}
  updateShowcase() {}
  stepItems() {}
  spawnUpTo() {}
  setDoorOpen() {}
  showExit() {}
  setExitGlow() {}
  setDoorGlow() {}
  openEndDoor() {}
  setHallLampScale() {}
  setHemi() {}
  setVisible() {}
  endDoorAimPoint() { return new THREE.Vector3(LAYOUT.doorCenterX, 1.35, LAYOUT.hall.z); }
  showClassmateEyes() {}
  turnClassmate() {}
  hideNpc() {}
  revealPickup() {}
  setNpcState() {}
  aim() { return { kind: 'none', level: 0 }; }
  getAnomalyAimPoint() { return null; }
  placeEntity(x, z) { this.entity.position.set(x, 0, z); }
  entityEye() {
    const p = this.entity.position;
    return new THREE.Vector3(p.x, 1.62, p.z);
  }
  hideEntity() { this.entity.visible = false; }
  /** 和 level.stepEntity 一致：沿直线逼近玩家，靠到 0 就停 */
  stepEntity(px, pz, dt) {
    this.stepCalls += 1;
    const e = this.entity.position;
    const dx = px - e.x;
    const dz = pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const step = Math.min(CONFIG.entitySpeed * dt, d);
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
    this.entity.rotation.y = Math.atan2(dx, dz);
  }
}

function makeGame() {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  const player = new Player(camera);
  player.reset(0.4, LAYOUT.hall.z, -Math.PI / 2); // 刚出教室：面朝 +X（EXIT）
  player.setLamp(0);
  const level = new FakeLevel();
  const hud = recorder();
  const audio = recorder();
  const canvas = {
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    requestPointerLock() {},
    style: {},
  };
  const game = new Game({ scene: new THREE.Scene(), camera, canvas, hud, audio, level, player });
  game.levelIndex = 5;
  game.time = 0;
  game.clock = 0;
  return { game, player, level, hud, audio, camera };
}

// ── 0. demoActive 下不抢操作权（演示由 setCourse 自己走路）──
{
  const { game, player } = makeGame();
  game.demoActive = true;
  game.phase = 'finaleLook';
  game.turning = true;
  player.setControl(false);
  game.finishTurnBack();
  ok(game.phase === 'finaleChase' && player.controlEnabled === false,
    '演示模式下 finishTurnBack 不交还操作', `control=${player.controlEnabled}`);
}

// ── 1. 真状态机：10 秒，站住不动，看它怎么走 ──
const { game, player, level, hud } = makeGame();
const STEP = 1 / 60;
game.beginFinale();

const startX = player.x;
const startEntityX = level.entity.position.x;
ok(game.phase === 'finaleLook' && game.turning === false, 'beginFinale 进 finaleLook，还没开始转');
ok(player.controlEnabled === false, '注视期间没收操作');
ok(Math.abs(startEntityX - (startX - CONFIG.entityGap)) < 1e-6, '怪物放在玩家正后方',
  `entityX=${startEntityX.toFixed(2)}`);
ok(player.lookTarget !== null, '镜头被锁到身后的眼睛上');

const trace = [];
let turningAt = null;
let chaseAt = null;
let loseAt = null;
let entityMovedWhileTurning = 0;
let controlDuringLook = 0;
let ctlAtChase = null;
let hudChaseAtChase = null;
let prevEntityX = startEntityX;

for (let i = 0; i < 600; i += 1) {
  const t = i * STEP;
  game.update(STEP);
  const ex = level.entity.position.x;
  if (game.turning && Math.abs(ex - prevEntityX) > 1e-9) entityMovedWhileTurning = 1;
  if (game.phase === 'finaleLook' && player.controlEnabled) controlDuringLook += 1;
  if (turningAt === null && game.turning) turningAt = t;
  if (chaseAt === null && game.phase === 'finaleChase') {
    chaseAt = t;
    // 进追逐那一帧的快照（后面判负会把这两个都改回去）
    ctlAtChase = player.controlEnabled;
    hudChaseAtChase = hud.state.setChase;
  }
  if (loseAt === null && game.phase === 'lose') loseAt = t;
  if (i % 6 === 0) trace.push({ t: +t.toFixed(2), phase: game.phase, turning: game.turning, ctl: player.controlEnabled, ex: +ex.toFixed(2), dist: +Math.hypot(player.x - ex, player.z - level.entity.position.z).toFixed(2) });
  prevEntityX = ex;
  if (loseAt !== null) break;
}

ok(turningAt !== null, '注视结束后会进入自动转向', `t=${turningAt?.toFixed(2)}s`);
ok(turningAt !== null && Math.abs(turningAt - 1.25) < 0.08, '转向在注视保持时间（1.25s）之后才开始',
  `t=${turningAt?.toFixed(2)}s`);
ok(entityMovedWhileTurning === 0, '转向期间怪物一步没动（freeze）');
ok(controlDuringLook === 0, 'finaleLook 全程没有提前交还操作');
ok(chaseAt !== null, '转向结束会进 finaleChase', `t=${chaseAt?.toFixed(2)}s`);
ok(chaseAt !== null && chaseAt - turningAt > 0.4 && chaseAt - turningAt < 1.2,
  '转向是"转完才进追逐"，不是一进追逐就瞬转',
  `${(chaseAt - turningAt).toFixed(2)}s`);
ok(player.yaw === -Math.PI / 2, '交还操作时镜头正对逃跑方向 +X', `yaw=${player.yaw.toFixed(4)}`);
ok(game.turning === false, '进追逐后 turning 复位');
ok(ctlAtChase === true, '进追逐那一帧就交还操作', `control=${ctlAtChase}`);
ok(hudChaseAtChase === true, '进追逐那一帧 HUD 切成追逐态', `setChase=${hudChaseAtChase}`);
{
  // 正中「快跑！」只许在第一帧闪一次，而且必须在 setChase(true) 之后（先亮提示再闪字）
  const flashes = hud.log.map((entry, i) => (entry[0] === 'flashChase' ? i : -1)).filter((i) => i >= 0);
  const chaseToggles = hud.log.map((entry, i) => (entry[0] === 'setChase' ? i : -1)).filter((i) => i >= 0);
  const lastToggle = flashes.length ? chaseToggles.filter((i) => i < flashes[0]).pop() ?? -1 : -1;
  ok(flashes.length === 1, '整段只闪一次「快跑！」', `${flashes.length} 次`);
  ok(flashes.length === 1 && lastToggle >= 0 && lastToggle < flashes[0]
    && hud.log[lastToggle][1][0] === true, '闪字发生在 setChase(true) 之后');
}
ok(Math.abs(player.x - startX) < 1e-9, '转身过程没有挪动玩家', `x=${player.x}`);
ok(level.entity.position.x > startEntityX + 0.5, '追逐开始后怪物才开始逼近',
  `entityX: ${startEntityX.toFixed(2)} → ${level.entity.position.x.toFixed(2)}`);
ok(loseAt !== null, '站着不动会被追上（判负正常）', `t=${loseAt?.toFixed(2)}s`);
ok(game.phase === 'lose' && level.entity.visible === false, '判负时怪物隐藏');

console.log('\n时间线（每 0.1s）：');
for (const r of trace) console.log(`  t=${String(r.t).padEnd(5)} ${r.phase.padEnd(11)} turning=${String(r.turning).padEnd(5)} ctl=${String(r.ctl).padEnd(5)} entityX=${String(r.ex).padStart(6)} dist=${r.dist}`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
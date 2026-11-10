/**
 * 关卡推进的端到端校验：走廊中段换场，而不是"出门再进屋就跳关"。
 *
 * 验的就是这次改的三件事：
 *   ① 站在门口走出走进不会推进关卡（房间还是原来那间，也不会有换场顿挫）；
 *   ② 走廊里走够远（|x| ≥ LAYOUT.hallSwapX）才把下一关铺进来，玩家仍可自由走路；
 *   ③ 铺好之后再进屋，只剩状态切换：levelIndex 前进、关门、播报，且不会重复 spawn。
 * 另外覆盖第 1 关捡相机后的心声字幕。
 *
 * 不渲染、不碰 WebGL：用假 level（只把 isInsideRoom 做成真的），走真实的 Game.update。
 */
import * as THREE from '../vendor/three.module.js';
import { LAYOUT } from '../src/layout.js';
import { Player } from '../src/player.js';
import { Game } from '../src/game.js';
import { copy } from '../src/team/p1.js';

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

/** 记录调用的假 HUD / 音频：log 保序，state 存最后一次的值 */
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
    this.entityLight = { intensity: 12 };
    this.loopEnabled = false;
    this.npcDone = true;
    this.doorOpen = false;
    this.spawned = [];
    this.prewarmed = [];
  }
  /** 和 level.js 的判定一致（收一点边，避免贴墙抖动） */
  isInsideRoom(x, z) {
    const r = LAYOUT.room;
    return x > r.minX + 0.08 && x < r.maxX - 0.08 && z > r.minZ + 0.08 && z < r.maxZ - 0.05;
  }
  spawnUpTo(count) {
    if (!this.spawned.includes(count)) this.spawned.push(count);
  }
  prewarm(level) {
    this.prewarmed.push(level);
  }
  setDoorOpen(open) { this.doorOpen = open; }
  nearPickup() { return this.pickupNear === true; }
  hidePickup() { this.pickupNear = false; }
  revealPickup() { this.pickupNear = true; }
  getColliders() { return []; }
  update() {}
  updateShowcase() {}
  stepItems() {}
  hideNpc() {}
  showExit() {}
  setExitGlow() {}
  setDoorGlow() {}
  openEndDoor() {}
  setHallLampScale() {}
  setHemi() {}
  setVisible() {}
  setNpcState() {}
  showClassmateEyes() {}
  turnClassmate() {}
  triggerFlash() {}
  aim() { return { kind: 'none', level: 0 }; }
  getAnomalyAimPoint() { return null; }
  getAnomalyStand() { return { x: 0, z: 0 }; }
  placeEntity(x, z) { this.entity.position.set(x, 0, z); }
  hideEntity() { this.entity.visible = false; }
  entityEye() {
    const p = this.entity.position;
    return new THREE.Vector3(p.x, 1.62, p.z);
  }
  stepEntity() {}
}

function makeGame() {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 120);
  const player = new Player(camera);
  player.reset(0.4, LAYOUT.hall.z, -Math.PI / 2);
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
  game.time = 0;
  game.clock = 0;
  return { game, player, level, hud, audio };
}

const STEP = 1 / 60;
/** 把玩家瞬移到 (x,z) 再推一帧：走真实的 updateZones → onEnter/onExit → updateFlow */
function frame(game, player, x, z, steps = 1) {
  player.x = x;
  player.z = z;
  for (let i = 0; i < steps; i += 1) game.update(STEP);
}

// ── 1. 站在门口：出去又立刻回来，不许跳关 ──
const { game, player, level, hud } = makeGame();
// 先站进门内，让 wasInside=true（构造函数里是 menu，menu 阶段 update 直接返回，不走 updateZones）
game.phase = 'level';
game.beginLevel(1);
game.cleared = true;
frame(game, player, 0, LAYOUT.room.maxZ - 2.0);
ok(game.phase === 'level' && game.levelIndex === 1 && game.aheadLevel === 0,
  'beginLevel(1) 落在第 1 关', `phase=${game.phase} lv=${game.levelIndex}`);
ok(level.spawned.join(',') === '1', '第 1 关的异常被装上', `spawned=[${level.spawned}]`);
ok(level.doorOpen === false, '进门就关门');

frame(game, player, 0.4, 7.4); // 出门
ok(game.phase === 'corridor', '出门进走廊', `phase=${game.phase}`);
ok(level.doorOpen === true, '走廊里门是开的');
ok(hud.state.setSubtitle === copy.corridorLoop && copy.corridorLoop === '试着离开吧……',
  '走廊提示换成「试着离开吧……」', `subtitle=${hud.state.setSubtitle}`);
ok(hud.state.setObjective === copy.backToDoor, '走廊里目标是回到那扇门', `objective=${hud.state.setObjective}`);
ok(level.prewarmed.includes(2), '走廊里预建第 2 关（不挂场景）', `prewarmed=[${level.prewarmed}]`);
ok(level.spawned.join(',') === '1', '刚出门还不许装第 2 关', `spawned=[${level.spawned}]`);

frame(game, player, 0.4, LAYOUT.room.maxZ - 2.0); // 立刻折回
ok(game.phase === 'level' && game.levelIndex === 1,
  '① 出门又马上进来：还是第 1 关，不推进', `phase=${game.phase} lv=${game.levelIndex}`);
ok(level.spawned.join(',') === '1', '折回不会装下一关', `spawned=[${level.spawned}]`);
ok(hud.state.setSubtitle === copy.corridorAgain, '折回时给一句「还是这间」的提示',
  `subtitle=${hud.state.setSubtitle}`);
ok(hud.state.setObjective === copy.backToDoor, '折回后目标仍是回到那扇门');
ok(game.cleared === true, '折回不会清掉"已拍照"状态');

// ── 2. 走廊里没走够远，不许换场 ──
frame(game, player, 0.4, 9.0); // 再出门
ok(game.phase === 'corridor', '再出门回到走廊');
frame(game, player, 6.0, 9.0);
ok(game.aheadLevel === 0 && level.spawned.join(',') === '1',
  '② 只走到 x=6（教室外墙以内）还不换场', `ahead=${game.aheadLevel} spawned=[${level.spawned}]`);

// ── 3. 走过教室外墙十几米：换场发生，但玩家还能走 ──
frame(game, player, LAYOUT.hallSwapX, 9.0);
ok(game.phase === 'corridor', '换场那一帧不打断走路', `phase=${game.phase}`);
ok(game.aheadLevel === 2 && game.levelIndex === 2,
  '③ 走到 x=hallSwapX 就把第 2 关铺进来', `ahead=${game.aheadLevel} lv=${game.levelIndex}`);
ok(level.spawned.join(',') === '1,2', '第 2 关挂进场景', `spawned=[${level.spawned}]`);
ok(level.doorOpen === true, '换场时门还开着（否则玩家进不去）');
ok(game.cleared === false, '换场后本关重新回到"未拍"状态');

const spawnCountAtSwap = level.spawned.length;
ok(spawnCountAtSwap === 2, '只装了一次', `${spawnCountAtSwap} 次`);

// 换场后继续在走廊里走：不许重复装
frame(game, player, 19.0, 9.0, 4);
ok(level.spawned.length === spawnCountAtSwap, '走廊里再走不会重复装第 2 关',
  `spawned=[${level.spawned}]`);
ok(game.phase === 'corridor' && game.aheadLevel === 2, '走到走廊尽头仍是"已铺好等玩家进门"');

// ── 4. 进屋：只剩状态切换 ──
frame(game, player, 0.4, 9.0);
frame(game, player, 0.4, LAYOUT.room.maxZ - 1.0); // 刚跨过门线
ok(game.phase === 'entering', '进门先进入 entering（走进去这 2 m）', `phase=${game.phase}`);
ok(game.levelIndex === 2 && level.spawned.length === 2, '进屋路上不再有场景替换');
frame(game, player, 0.4, LAYOUT.room.maxZ - 2.2);
ok(game.phase === 'level' && game.levelIndex === 2 && game.aheadLevel === 0,
  '落位进第 2 关', `phase=${game.phase} lv=${game.levelIndex} ahead=${game.aheadLevel}`);
ok(level.doorOpen === false, '落位时关门');
ok(level.spawned.length === 2, '落位不会重新 spawn', `spawned=[${level.spawned}]`);
ok(hud.state.setSubtitle === copy.roomChanged, '进屋播「这间教室和刚才不一样」',
  `subtitle=${hud.state.setSubtitle}`);

// ── 5. 一路推到第 5 关：每关只装一次 ──
for (let n = 2; n <= 4; n += 1) {
  game.cleared = true;
  frame(game, player, 0.4, 7.4);            // 出门
  frame(game, player, 0.4, 9.0);            // 走廊
  frame(game, player, -LAYOUT.hallSwapX, 9.0); // 往另一头走，换场
  frame(game, player, 0.4, 9.0);
  frame(game, player, 0.4, LAYOUT.room.maxZ - 1.0);
  frame(game, player, 0.4, LAYOUT.room.maxZ - 2.2);
  ok(game.levelIndex === n + 1 && game.phase === 'level',
    `第 ${n} → ${n + 1} 关推进正常`, `lv=${game.levelIndex} phase=${game.phase}`);
}
ok(level.spawned.join(',') === '1,2,3,4,5', '五关各装一次，没有重复',
  `spawned=[${level.spawned}]`);

// ── 6. 第 5 关拍完出门：走终局，不许装第 6 关 ──
game.cleared = true;
frame(game, player, 0.4, 7.4);
frame(game, player, 0.4, 9.0);
ok(game.phase === 'finaleLook', '第 5 关拍完出门直接进终局', `phase=${game.phase}`);
ok(level.spawned.length === 5, '终局不会去装第 6 关', `spawned=[${level.spawned}]`);

// ── 7. 第 1 关捡相机：操作提示之后补一句心声 ──
{
  const g = makeGame();
  g.player.x = LAYOUT.pickup.x;
  g.player.z = LAYOUT.pickup.z;
  g.game.beginLevel(1);
  g.game.hasCamera = false;
  g.game.cameraState = 'none';
  g.level.pickupNear = true;
  g.game.onInteract();
  ok(g.game.cameraState === 'holstered' && g.game.hasCamera === true,
    '捡相机：切到 holstered、hasCamera 置真',
    `cameraState=${g.game.cameraState} hasCamera=${g.game.hasCamera}`);
  ok(g.hud.state.setSubtitle === copy.photoHint, '先给操作提示', `subtitle=${g.hud.state.setSubtitle}`);
  ok(g.game.pendingLine && g.game.pendingLine.text === copy.cameraMind,
    '排了一句心声「有奇怪的东西……我该拍下来」',
    `pending=${g.game.pendingLine?.text}`);
  for (let i = 0; i < 160; i += 1) g.game.update(STEP); // 2.6 s
  ok(g.hud.state.setSubtitle === copy.cameraMind, '心声在操作提示之后显示出来',
    `subtitle=${g.hud.state.setSubtitle}`);
}

// ── 8. 心声只属于第 1 关 ──
{
  const g = makeGame();
  g.game.beginLevel(2);
  g.game.hasCamera = false;
  g.game.cameraState = 'none';
  g.level.pickupNear = true;
  g.game.onInteract();
  ok(g.game.pendingLine === null, '第 2 关（调试给相机）不会播第 1 关的心声');
}

// ── 9. 序章第一次进屋：door 口不装，落位时才装（且只装一次） ──
{
  const g = makeGame();
  g.game.phase = 'prologue';
  g.player.x = 0.4;
  g.player.z = 8.0;
  g.game.update(STEP); // wasInside=false
  g.player.x = 0.4;
  g.player.z = LAYOUT.room.maxZ - 1.0;
  g.game.update(STEP);
  ok(g.game.phase === 'entering' && g.game.aheadLevel === 1, '序章跨过门线进入 entering',
    `phase=${g.game.phase} ahead=${g.game.aheadLevel}`);
  ok(g.level.spawned.length === 0, '序章刚进门时还没有装第 1 关', `spawned=[${g.level.spawned}]`);
  g.player.z = LAYOUT.room.maxZ - 2.2;
  g.game.update(STEP);
  ok(g.game.phase === 'level' && g.game.levelIndex === 1, '落位进第 1 关',
    `phase=${g.game.phase} lv=${g.game.levelIndex}`);
  ok(g.level.spawned.join(',') === '1', '第 1 关在这一步装上', `spawned=[${g.level.spawned}]`);
  ok(g.level.doorOpen === false, '落位关门');
  ok(g.hud.state.setSubtitle === copy.someoneGone, '播「……人呢？」', `subtitle=${g.hud.state.setSubtitle}`);
  for (let i = 0; i < 170; i += 1) g.game.update(STEP);
  ok(g.hud.state.setSubtitle === copy.cameraOnFloor, '随后提示地上有相机',
    `subtitle=${g.hud.state.setSubtitle}`);
}

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
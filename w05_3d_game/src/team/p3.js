/**
 * P3 杂物、灯闪、窗帘。
 * level.curtains 是走廊墙一侧的窗帘。curtainNear / curtainFar 仍指向靠门的两块。
 * 软布在着色器里动。每块窗帘是 4 条竖条、每条 3 个质点。
 * 靠里的上段每帧受一个较小的力，方向慢慢变，各块窗帘节奏不同。
 * 脸上那一块由着色器按住，窗帘本身照常摆。
 * 杂物不要挡拍照：网格会自动标 userData.noRay。
 * 想被踢动：mesh.userData.physical = true，或 extraProps 里写 physical: true。
 * 带这个标签的物品受重力，踢到时按碰撞力翻滚。
 * 监听拍照成功好做「灯稳 1 秒」：on(EVENT.photoOk, ...)
 */
import { EVENT } from './contract.js';
import { on } from './bus.js';
import { CONFIG } from '../config.js';

/**
 * 终局追逐的“越近越压迫”反馈，作用在背景音乐和屏幕上：
 * - 背景音乐（horror-music.mp4 循环）整体调高音量；
 * - 追逐时怪物越近，背景音乐越响；
 * - 屏幕叠加一层红色径向光，越近越浓。
 * 全部挂在 p3 的每帧 tick 钩子上，不改 game.js / audio.js / hud.js。
 */
const PROX_FAR = 10;            // 从这个距离开始有亲密度加成（更早进入变化）
const PROX_NEAR = 1.45;         // 被抓的距离，加成拉满
const MUSIC_GAIN_MULT = 2.0;    // 背景音乐整体倍率（调高 BGM，原 0.18/0.23 → 0.36/0.46）
const PROX_MUSIC_ADD = 0.40;    // 追逐时，怪物越近额外增加的音乐增益（越近越响，更明显）
const MUSIC_GAIN_MAX = 1.0;     // 音乐增益上限，防止与其它层叠加削顶

let proxOverlay = null;         // 惰性创建的红光遮罩层
let proxDisplay = 0;            // 平滑后的亲密度（越近越大）

/**
 * 与 audio.js setMood 的音乐音量保持一致：menu 0.12 / 其余 0.18。
 * （chase 那一档已作废：第二十一轮起追逐段不再播默认 BGM，只放追逐伴奏。）
 */
function musicBase(mood) {
  if (mood === 'menu') return 0.12;
  if (mood === 'chase') return 0.23;
  return 0.18;
}

/** 每帧把背景音乐音量定到目标值：基础音量 × 倍率，追逐时再按距离叠加。 */
function stepMusicGain(env, p) {
  const audio = env.audio;
  if (!audio?.musicGain || !audio.ctx) return; // 尚未 unlock，还没有音乐节点
  // 第二十一轮：audio.js 在追逐一开始就把默认 BGM 真的 pause 了（musicOff），
  // 之后到安全屋、结局都不再放。这里每帧 setTargetAtTime 会把音量硬拽回 0.36，
  // 所以必须先让路：关掉的、正在追逐的，一律按 0 写，别去抬它。
  if (audio.musicOff || env.mood === 'chase') {
    audio.musicGain.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, 0.12);
    return;
  }
  // 开场衔接的淡入段：斜坡时间常数由 audio.js 给（setMood 的 musicTau）。
  // 第二十一轮修过一次坑：原先靠 musicHold 让路，可 restoreMusic() 会把 hold 清掉，
  // 于是开局那一帧就被这里用 0.08s 拽到满值——听上去是「突然响起」而不是「渐起」。
  // 现在不靠 hold，改成跟着 audio.musicTau 走：开局传 1.25 就是 1.25 的指数上升。
  if (audio.musicHold) return;
  let target = musicBase(env.mood) * MUSIC_GAIN_MULT;
  if (env.mood === 'chase') target += p * PROX_MUSIC_ADD;
  target = Math.min(target, MUSIC_GAIN_MAX);
  audio.musicGain.gain.setTargetAtTime(target, audio.ctx.currentTime, audio.musicTau || 0.08);
}

/** 屏幕上的红光：越近越浓。用 screen 混合，呈“红色灯光逼近”的加色效果。 */
function ensureProxOverlay() {
  if (proxOverlay) return proxOverlay;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.zIndex = '1';
  el.style.pointerEvents = 'none';
  el.style.mixBlendMode = 'screen';
  el.style.background = 'radial-gradient(ellipse at center, rgba(150,8,8,0) 30%, rgba(200,0,0,0.85) 100%)';
  el.style.opacity = '0';
  document.body.appendChild(el);
  proxOverlay = el;
  return el;
}

function stepProxOverlay(p) {
  if (p <= 0.0005 && !proxOverlay) return; // 未逼近前不创建
  const el = ensureProxOverlay();
  const value = Math.round(Math.max(0, Math.min(1, p)) * 200) / 200;
  if (el._prox === value) return;
  el._prox = value;
  el.style.opacity = String(value);
}

/** 追逐阶段里，越近 target 越大；其余阶段归 0。 */
function proximityTarget(level, env) {
  if (env.phase !== 'finaleChase') return 0;
  const dx = env.playerX - level.entity.position.x;
  const dz = env.playerZ - level.entity.position.z;
  const dist = Math.hypot(dx, dz);
  return Math.min(1, Math.max(0, (PROX_FAR - dist) / (PROX_FAR - PROX_NEAR)));
}

/** 每帧把“迫近压迫感”平滑推进，再分别作用到背景音乐音量和屏幕红光上。 */
function stepProximity(level, dt, env) {
  const target = proximityTarget(level, env);
  const k = 1 - Math.exp(-6 * dt);
  proxDisplay += (target - proxDisplay) * k;
  stepMusicGain(env, proxDisplay);
  stepProxOverlay(proxDisplay);
}

/**
 * 「注视」阶段一开始，就把怪物再往后放约 1 秒的追逐脚程，多给玩家反应时间。
 * placeEntity 把怪物放在 player.x - entityGap（z 相同，y=0）。这里只沿 X 把它再推远
 * entitySpeed 米（≈ 怪物 1 秒的路程），z 和 y 不动，因此强制注视的方向不变，只是更远。
 */
let finaleEntityPushed = false;

function pushFinaleEntityBack(level, env) {
  if (env.phase !== 'finaleLook') {
    finaleEntityPushed = false;
    return;
  }
  if (finaleEntityPushed || !level.entity) return;
  finaleEntityPushed = true;
  const dx = level.entity.position.x - env.playerX;
  const sign = dx === 0 ? -1 : Math.sign(dx);
  level.entity.position.x = env.playerX + sign * (CONFIG.entityGap + CONFIG.entitySpeed);
}

/** 一轮里被抽中的灯一起灭、一起亮。灭的时长只决定“闪一下”好不好认，不占 1–3 秒的轮间隔。 */
const FLICKER_GAP_MIN = 1;
const FLICKER_GAP_MAX = 3;
const FLICKER_PICK_MIN = 3;
const FLICKER_PICK_MAX = 5;
const FLICKER_BLINKS_MIN = 1;
const FLICKER_BLINKS_MAX = 3;
const FLICKER_OFF_MIN = 0.08;
const FLICKER_OFF_MAX = 0.14;
const FLICKER_ON_MIN = 0.07;
const FLICKER_ON_MAX = 0.18;
const FLICKER_HOLD_MOODS = new Set(['menu', 'chase', 'calm']);

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickIndices(total, count) {
  const pool = [];
  for (let i = 0; i < total; i += 1) pool.push(i);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, count);
}

function clearMask(mask) {
  for (let i = 0; i < mask.length; i += 1) mask[i] = false;
}

function ensureFlicker(level) {
  if (level._flicker) return level._flicker;
  const total = level.roomLights?.length ?? 8;
  const state = {
    phase: 'gap',
    timer: rand(FLICKER_GAP_MIN, FLICKER_GAP_MAX),
    selected: [],
    blinksLeft: 0,
    mask: new Array(total).fill(false),
  };
  level._flicker = state;
  level.flickerMask = state.mask;
  return state;
}

function beginRound(state) {
  const total = state.mask.length;
  const count = Math.min(total, randInt(FLICKER_PICK_MIN, FLICKER_PICK_MAX));
  state.selected = pickIndices(total, count);
  state.blinksLeft = randInt(FLICKER_BLINKS_MIN, FLICKER_BLINKS_MAX);
  state.phase = 'dark';
  state.timer = rand(FLICKER_OFF_MIN, FLICKER_OFF_MAX);
}

/**
 * 教室灯按轮闪。
 * 每轮从全部教室灯里抽 3–5 盏，这几盏一起闪 1–3 下。
 * 这一轮结束后，再隔 1–3 秒才开始下一轮。
 * 菜单、追逐、结局不闪，进行中的一轮会直接作废。
 * level.flickerDark：这一帧有灯正处于灭。level.flickerMask：哪几盏该灭。
 */
export function stepFlicker(level, dt, mood) {
  const state = ensureFlicker(level);
  if (FLICKER_HOLD_MOODS.has(mood)) {
    clearMask(state.mask);
    if (state.phase !== 'gap') {
      state.phase = 'gap';
      state.timer = rand(FLICKER_GAP_MIN, FLICKER_GAP_MAX);
      state.selected = [];
      state.blinksLeft = 0;
    }
    level.flickerDark = false;
    level.flickerMask = state.mask;
    return;
  }

  const showDark = state.phase === 'dark';
  clearMask(state.mask);
  if (showDark) {
    for (const index of state.selected) state.mask[index] = true;
  }
  level.flickerDark = showDark;
  level.flickerMask = state.mask;

  state.timer -= dt;
  if (state.timer > 0) return;

  if (state.phase === 'dark') {
    state.blinksLeft -= 1;
    if (state.blinksLeft <= 0) {
      state.phase = 'gap';
      state.timer = rand(FLICKER_GAP_MIN, FLICKER_GAP_MAX);
      state.selected = [];
    } else {
      state.phase = 'lit';
      state.timer = rand(FLICKER_ON_MIN, FLICKER_ON_MAX);
    }
    return;
  }

  if (state.phase === 'lit') {
    state.phase = 'dark';
    state.timer = rand(FLICKER_OFF_MIN, FLICKER_OFF_MAX);
    return;
  }

  beginRound(state);
}

/** 返回 { mesh, x, z, r }。也可给 hx、hy、hz、mass、pivotY、physical。mesh 原点默认在地面。 */
export function extraProps() {
  return [];
}

const STRIPS = 4;
const ROWS = 3;
const PIN = 12;
const LINK = 30;
const SIDE = 18;
const REST = 1;
const OUTER_REST = 40;
const DAMP = 1.15;
const SOFT_LIMIT = 0.12;
const LIMIT_K = 90;
const HARD_LIMIT = 0.15;

function stepCurtain(gust, step) {
  const force = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let s = 0; s < STRIPS; s += 1) {
    const pinnedEdge = (gust.outer === 0 && s === 0) || (gust.outer === 1 && s === STRIPS - 1);
    for (let r = 0; r < ROWS; r += 1) {
      const node = gust.nodes[s][r];
      const above = r === 0 ? 0 : gust.nodes[s][r - 1].x;
      let f = -(pinnedEdge ? OUTER_REST : REST) * node.x;
      f += (r === 0 ? PIN : LINK) * (above - node.x);
      if (r < ROWS - 1) f += LINK * (gust.nodes[s][r + 1].x - node.x);
      if (s > 0) f += SIDE * (gust.nodes[s - 1][r].x - node.x);
      if (s < STRIPS - 1) f += SIDE * (gust.nodes[s + 1][r].x - node.x);
      if (node.x > SOFT_LIMIT) f -= LIMIT_K * (node.x - SOFT_LIMIT);
      else if (node.x < -SOFT_LIMIT) f -= LIMIT_K * (node.x + SOFT_LIMIT);
      f -= DAMP * node.v;
      const driven = r === 0 && s === (gust.outer === 0 ? 2 : 1);
      if (driven) f += gust.drive;
      force[s][r] = f;
    }
  }
  for (let s = 0; s < STRIPS; s += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const node = gust.nodes[s][r];
      node.v += force[s][r] * step;
      node.x += node.v * step;
      if (node.x > HARD_LIMIT) {
        node.x = HARD_LIMIT;
        if (node.v > 0) node.v = 0;
      } else if (node.x < -HARD_LIMIT) {
        node.x = -HARD_LIMIT;
        if (node.v < 0) node.v = 0;
      }
    }
  }
}

export function tick(level, dt, env) {
  pushFinaleEntityBack(level, env);
  stepProximity(level, dt, env);

  const cloth = level.materials?.curtainSoft?.userData;
  if (!cloth?.uTime || !cloth?.uAmp) return;
  cloth.uTime.value = env.time;
  const target = level.flickerDark ? 1.8 : 1;
  cloth.uAmp.value += (target - cloth.uAmp.value) * Math.min(1, dt * 2);

  const step = Math.min(dt, 0.05);
  for (const curtain of level.curtains || []) {
    const gust = curtain.userData.gust;
    if (!gust?.nodes) continue;
    gust.drive = gust.amp * Math.sin(env.time * gust.speed + gust.phase);
    stepCurtain(gust, step);
  }
}

on(EVENT.photoOk, () => {
  // 拍照成功后可在这里把灯稳住。默认不改现有灯光。
});

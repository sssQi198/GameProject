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

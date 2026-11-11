/**
 * 追逐段走廊灯「灯池」的纯数值校验（不需要 WebGL）。
 *
 * 检查四件事：
 *   1. 灯怎么排、哪两盏会闪（跟 level.js 建灯的那段循环一致）
 *   2. 灯下比灯间亮多少（用 three 自己的距离衰减公式算地面照度）
 *   3. 灯间那段暗区有多宽 —— 要「一小段」，不能整条走廊都黑
 *   4. 闪灯确实在抖、两盏不同步、不闪的灯恒定
 *
 * 不做渲染，所以这里只验证「算出来对不对」，实际观感仍要在浏览器里看。
 */
import { CONFIG } from '../src/config.js';
import { LAYOUT } from '../src/layout.js';
import { HALL_FLICKER_X, hallChaseLamp, hallFlicker } from '../src/hallglow.js';

const STEP = 1 / 60;
const LAMP_Y = 2.55; // 和 buildLights 里的灯高一致
const SPACING = 10;

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}

// ── 1. 灯的排布 ──
const lampX = [];
for (let x = LAYOUT.hall.minX + 10; x <= LAYOUT.hall.maxX - 5; x += 10) lampX.push(x);
const flickerIdx = lampX.filter((x) => HALL_FLICKER_X.some((t) => Math.abs(x - t) < 0.01));
console.log(`走廊灯 ${lampX.length} 盏：x = ${lampX.join(', ')}`);
ok(lampX.length === 10, '走廊灯 10 盏', `实际 ${lampX.length}`);
ok(flickerIdx.length === 2, '追逐时闪 2 盏', `x = ${flickerIdx.join(', ')}`);
ok(
  flickerIdx.every((x) => x >= 0 && x <= LAYOUT.exitX),
  '闪灯都在逃跑路线上（0 → EXIT 52.2）',
  flickerIdx.join(', '),
);

// ── 2. three 的点光衰减（decay = 2，带 distance 窗口）──
function attenuation(d, distance) {
  let f = 1 / Math.max(d * d, 0.01);
  if (distance > 0) {
    const w = Math.max(0, Math.min(1, 1 - (d / distance) ** 4));
    f *= w * w;
  }
  return f;
}

/** 地面点 (x, 0, hall.z) 的总照度：所有灯求和，NdotL = 灯高 / 距离。 */
function floorIlluminance(x, states) {
  let sum = 0;
  for (let i = 0; i < lampX.length; i += 1) {
    const d = Math.hypot(x - lampX[i], LAMP_Y);
    sum += states[i].intensity * attenuation(d, states[i].distance) * (LAMP_Y / d);
  }
  return sum;
}

const chaseStates = lampX.map((_, i) => hallChaseLamp(0, i, flickerIdx.includes(lampX[i])));
const normalStates = lampX.map(() => ({ intensity: CONFIG.hallLamp, distance: CONFIG.hallLampReach }));

// ── 3. 参数：追逐和走廊用同一个点亮距离，追逐只是更亮 ──
ok(
  chaseStates.every((s) => Math.abs(s.intensity - CONFIG.hallLamp * CONFIG.hallPoolGain) < 1e-9),
  '追逐时灯亮度 = hallLamp × hallPoolGain',
  `${chaseStates[0].intensity.toFixed(1)}（平时 ${CONFIG.hallLamp}）`,
);
ok(
  chaseStates.every((s) => s.distance === CONFIG.hallLampReach),
  '追逐点亮距离和走廊相同',
  `${CONFIG.hallLampReach} m`,
);
ok(
  CONFIG.hallLampReach >= 20 && CONFIG.hallLampReach < 30,
  '距离够到前面下一盏（20 米），再下一盏（30 米）不亮',
  `${CONFIG.hallLampReach} m`,
);

// ── 4. 地面照度：灯下仍然比灯间亮，但 20 米处的下一盏已经在范围内 ──
const ambientFloor = CONFIG.ambient + CONFIG.hemi; // 环境光 + 半球光（朝上的面拿满）
const poolE = floorIlluminance(lampX[4], chaseStates); // x = 10 正下方
const gapE = floorIlluminance(lampX[4] + SPACING / 2, chaseStates); // x = 15 两灯正中
const normalPoolE = floorIlluminance(lampX[4], normalStates);
const nextLampE = floorIlluminance(lampX[4] + SPACING * 2, chaseStates);

console.log('\n离灯距离(m)  照度(追逐)   照度(平时)   追逐/平时');
for (const off of [0, 1, 2, 3, 3.5, 4, 4.5, 5, 10, 20]) {
  const chase = floorIlluminance(lampX[4] + off, chaseStates);
  const normal = floorIlluminance(lampX[4] + off, normalStates);
  console.log(
    `${off.toFixed(1).padStart(10)}  ${chase.toFixed(2).padStart(10)}  ` +
    `${normal.toFixed(2).padStart(10)}  ${(chase / Math.max(normal, 1e-6)).toFixed(1).padStart(8)}×`,
  );
}

ok(nextLampE > ambientFloor, '前面下一盏（20 米）脚下还有这盏灯的光', `E=${nextLampE.toFixed(3)}`);
ok(poolE > normalPoolE * 1.5, '灯下比平时更亮', `${poolE.toFixed(1)} vs ${normalPoolE.toFixed(1)}`);
ok(poolE / ambientFloor > 10, '灯下是环境光的十几倍（肉眼是「一坨亮」）',
  `${(poolE / ambientFloor).toFixed(0)}× 环境光`);
ok(poolE > gapE, '灯下仍比两灯正中更亮', `${poolE.toFixed(1)} > ${gapE.toFixed(1)}`);

// ── 5. 闪烁 ──
const SECONDS = 4;
const frames = Math.round(SECONDS / STEP);
const traces = flickerIdx.map(() => []);
const stillLamps = [];
for (let f = 0; f < frames; f += 1) {
  const t = f * STEP;
  for (let i = 0; i < lampX.length; i += 1) {
    const isFlicker = flickerIdx.includes(lampX[i]);
    const s = hallChaseLamp(t, i, isFlicker);
    if (isFlicker) traces[flickerIdx.indexOf(lampX[i])].push(s.on);
    else if (f === 0) stillLamps.push(s.intensity);
    else if (Math.abs(s.intensity - stillLamps[stillLamps.length - 1]) > 1e-9) {
      stillLamps.push(NaN); // 不闪的灯一旦变动就记一个脏值
    }
  }
}
ok(!stillLamps.some(Number.isNaN), '除了那两盏，其余灯全程恒定');

const stats = traces.map((trace) => {
  let transitions = 0;
  let offFrames = 0;
  const runs = []; // 每段「灭」：{ start, len }
  for (let i = 0; i < trace.length; i += 1) {
    if (trace[i] < 1) {
      offFrames += 1;
      const last = runs[runs.length - 1];
      if (last && last.start + last.len === i) last.len += 1;
      else runs.push({ start: i, len: 1 });
    }
    if (i > 0 && trace[i] !== trace[i - 1]) transitions += 1;
  }
  // 相邻两段「灭」之间亮了几帧（要能看出「闪了两下」，不是一直黑到底）
  const gaps = runs.slice(1).map((r, i) => r.start - (runs[i].start + runs[i].len));
  return { transitions, offFrames, runs, gaps, offRatio: offFrames / trace.length };
});
stats.forEach((s, i) => {
  const lamp = flickerIdx[i];
  ok(s.transitions >= 3, `x = ${lamp} 那盏在 ${SECONDS}s 内反复开关`, `${s.transitions} 次跳变`);
  ok(s.offRatio > 0.02 && s.offRatio < 0.5, `x = ${lamp} 那盏大部分时间是亮的`,
    `${(s.offRatio * 100).toFixed(1)}% 的时间在灭`);
  // 60fps 下单帧黑一下根本看不见：每次「灭」至少要连续 3 帧（≈50ms）
  const shortest = Math.min(...s.runs.map((r) => r.len));
  ok(s.runs.length >= 2 && shortest >= 3, `x = ${lamp} 那盏每次灭都够久（≥3 帧，肉眼看得见）`,
    `灭 ${s.runs.length} 次，最短 ${shortest} 帧`);
  ok(s.gaps.length >= 1 && Math.min(...s.gaps) >= 3, `x = ${lamp} 那盏是「闪两下」而不是一直黑着`,
    `两次灭之间亮了 ${s.gaps.join('/')} 帧`);
});

// 两盏不同步：把两段「灭」的帧号拿出来比
const offSets = traces.map((trace) => new Set(trace.map((v, i) => (v < 1 ? i : -1)).filter((i) => i >= 0)));
const diff = [...offSets[0]].filter((i) => !offSets[1].has(i)).length
  + [...offSets[1]].filter((i) => !offSets[0].has(i)).length;
ok(diff > 2, '两盏闪灯不同步（不是一起开一起关）', `相差 ${diff} 帧`);

// 灭的时候灯管本体也跟着暗（只剩一点余辉）
const onState = hallChaseLamp(0, flickerIdx.length ? 0 : 1, false);
const offState = { ...onState, intensity: onState.intensity * 0.04 };
ok(offState.intensity < onState.intensity * 0.1, '灭的时候只留余辉，不是全黑开关');
ok(hallFlicker(0, 0) === 1 || hallFlicker(0, 0) < 1, '闪烁曲线有定义（0–1）');
ok(
  [0, 0.3, 1, 2.5, 5, 9.7].every((t) => hallFlicker(t, 0) > 0 && hallFlicker(t, 0) <= 1),
  '闪烁曲线恒在 (0, 1] 内',
);

// ── 6. 可选：墙壁亮度剖面（`node _probe/hallglow.mjs --profile`）──
//    用来判断「灯下一坨亮、灯间一小段暗」在画面上到底多亮多暗：
//    按 Lambert 出射亮度 ρE/π（墙 0x74716c × 贴图、地面 0x1a1c20）再走 ACES 转 sRGB，
//    得到的是 0–255 的像素值，比干看照度直观。
if (process.argv.includes('--profile')) {
  const ACES = (x) => {
    const c = x * 0.95 / 0.6; // exposure / 0.6（three 的 ACESFilmic 实现）
    const a = c * (c + 0.0245786) - 0.000090537;
    const b = c * (0.983729 * c + 0.432951) + 0.238081;
    return a / b;
  };
  const toSrgb = (x) => Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055));
  /** 某个面上一点的总照度（法线朝哪，NdotL 就按哪算）。 */
  const shade = (px, py, pz, nx, ny, nz, states) => {
    let e = CONFIG.ambient + CONFIG.hemi * ((ny + 1) / 2); // 环境光 + 半球光
    for (let i = 0; i < lampX.length; i += 1) {
      const dx = px - lampX[i];
      const dy = py - LAMP_Y;
      const dz = pz - LAYOUT.hall.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-4) continue;
      const cos = (nx * -dx + ny * -dy + nz * -dz) / d;
      if (cos <= 0) continue;
      e += states[i].intensity * attenuation(d, states[i].distance) * cos;
    }
    return e;
  };
  const WALL_RHO = 0.068; // 0x74716c × 贴图（估计值）
  const FLOOR_RHO = 0.012; // 0x1a1c20
  const px = (e, rho) => toSrgb(ACES((e * rho) / Math.PI));
  console.log('\n墙(z=10.15)  追逐   平时 | 地面  追逐   平时');
  for (let off = 0; off <= 5; off += 1) {
    const wx = lampX[4] + off;
    const eW = shade(wx, 1.5, 10.15, 0, 0, -1, chaseStates);
    const eWn = shade(wx, 1.5, 10.15, 0, 0, -1, normalStates);
    const eF = shade(wx, 0, LAYOUT.hall.z, 0, 1, 0, chaseStates);
    const eFn = shade(wx, 0, LAYOUT.hall.z, 0, 1, 0, normalStates);
    console.log(
      `       ${off.toFixed(0)} m   ${String(px(eW, WALL_RHO)).padStart(4)}  ${String(px(eWn, WALL_RHO)).padStart(4)}`
      + `   |        ${String(px(eF, FLOOR_RHO)).padStart(4)}  ${String(px(eFn, FLOOR_RHO)).padStart(4)}`,
    );
  }
}

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
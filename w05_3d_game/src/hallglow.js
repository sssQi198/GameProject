/**
 * 追逐段的走廊灯「灯池」。
 *
 * 平时走廊是 10 米一盏、半径 14 米 —— 光摊平，整条走廊一个亮度，
 * 只靠雾远近拉开层次。追逐要的是相反的观感：灯下一小片很亮，
 * 两盏灯中间有一小段明显更暗的路，其中一两盏还在抖。
 *
 * 做法只有一条：把光半径收到比「两灯中点到灯」的距离（√(5² + 2.55²) ≈ 5.6 米）
 * 还小，中点就一盏灯的光都拿不到，只剩环境光；灯正下方拿满。
 * 衰减窗口在半径边缘是平滑收尾（three 的 `pow2(saturate(1 - pow4(d/D)))`），
 * 不会切出一圈硬边。
 *
 * 这里只算纯数值、不碰 THREE，`_probe/hallglow.mjs` 可以直接验。
 */
import { CONFIG } from './config.js';

/** 追逐时闪烁的两盏灯在走廊里的 x：跑起来正好先后经过（走廊 10 米一盏）。 */
export const HALL_FLICKER_X = [10, 30];

/** 玩家越过灯位多少米之后，这盏灯就永久熄灭（走廊在身后一节节黑掉）。 */
export const HALL_LAMP_KILL_DIST = 1.2;

/** 闪烁节奏：每 PERIOD 秒抖一次，一次抖 BURST 秒。 */
const PERIOD = 3.6;
const BURST = 0.55;
/**
 * 抖动窗口切成 5 格，每格 0.11 秒（60fps 下 6–7 帧）。
 * 按格子整段熄灭，而不是逐帧随机 —— 单帧黑一下人眼几乎看不见，
 * 亮灭要连续 3 帧以上才看得出「灯管接触不良」。
 */
const SLOT = BURST / 5;
/** 灭的时候留一点点余辉，完全黑会像关了开关而不是灯管坏了。 */
const OFF = 0.04;
/** 每盏灯一套「亮灭」格子（1 = 亮）。都是断两次、每次一格，两次之间隔着一格亮。 */
const PATTERNS = ['01101', '10110', '01011', '11010'];

/**
 * 闪灯曲线，返回 0–1 的亮度系数。
 *
 * 不用 Math.random：每帧随机等于给画面撒噪点，看不出「灯管接触不良」的节拍；
 * 而且每帧都可能翻，人眼只看到抖动噪点，不会看到「灭了一下」。
 * 不同 seed 取不同格子表、再错开相位，两盏灯就不会一起闪。
 */
export function hallFlicker(t, seed = 0) {
  const p = (((t + seed * 1.7) % PERIOD) + PERIOD) % PERIOD;
  if (p >= BURST) return 1;
  const pattern = PATTERNS[Math.abs(seed) % PATTERNS.length];
  const slot = Math.min(pattern.length - 1, Math.floor(p / SLOT));
  return pattern[slot] === '1' ? 1 : OFF;
}

/**
 * 第 index 盏走廊灯在 t 时刻的状态。
 * intensity 是未乘 CONFIG.brightness 的裸值，distance / bulb 直接赋给灯和灯管网格。
 */
export function hallChaseLamp(t, index, flicker) {
  const k = flicker ? hallFlicker(t, index) : 1;
  return {
    intensity: CONFIG.hallLamp * CONFIG.hallPoolGain * k,
    distance: CONFIG.hallPoolRadius,
    /** 灯管自发光（正常 0.9）：追随时整体更亮，闪的那盏跟着压暗 */
    bulb: 1.6 * k,
    on: k,
  };
}

/**
 * 这盏灯是否已经被玩家甩在身后（追逐中永久熄灭）。
 * 只判断 x：走廊是沿 x 的长条，玩家只会朝 +x 跑。
 */
export function hallLampPassed(playerX, lampX) {
  return Number.isFinite(playerX) && playerX > lampX + HALL_LAMP_KILL_DIST;
}

/**
 * 灯灭那一声的声像：灯在右侧就 +，左侧就 −，10 米外打满。
 * 灭掉的灯基本都在身后，所以数值很小，只求「听见是那一盏」。
 */
export function hallLampPan(playerX, lampX, span = 10) {
  if (!Number.isFinite(playerX)) return 0;
  return Math.max(-1, Math.min(1, (lampX - playerX) / span));
}
/**
 * P3 杂物、灯闪、窗帘。
 * level.curtainNear / level.curtainFar 是两块窗帘网格。
 * 杂物不要挡拍照：网格会自动标 userData.noRay。
 * 监听拍照成功好做「灯稳 1 秒」：on(EVENT.photoOk, ...)
 */
import { EVENT } from './contract.js';
import { on } from './bus.js';

export function isFlickerDark(time, mood) {
  if (mood === 'menu' || mood === 'chase' || mood === 'calm') return false;
  return Math.sin(time * 13) > 0.72 && Math.sin(time * 3.7 + 2) > 0;
}

/** 返回 { mesh, x, z, r }。mesh 的原点在地面。 */
export function extraProps() {
  return [];
}

export function tick(level, dt, env) {
  const sway = Math.sin(env.time * 0.7) * 0.012;
  if (level.curtainNear) level.curtainNear.rotation.y = sway;
  if (level.curtainFar) level.curtainFar.rotation.z = sway * 0.4;
  void dt;
}

on(EVENT.photoOk, () => {
  // 拍照成功后可在这里把灯稳住。默认不改现有灯光。
});

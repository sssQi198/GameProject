/**
 * P2 移动与摄像机。
 * 走路速度在 config.js。这里管终局「看向眼睛」的时长和跟随快慢。
 * 强制注视开始时会收到 EVENT.lookLock，交还操作时收到 EVENT.lookUnlock。
 */
export function lookHoldSeconds() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 0.45 : 1.25;
}

/** 越大，镜头越快拧到眼睛上。大约 7 时，0.5 秒内到位。 */
export function lookResponsiveness() {
  return 7;
}

/**
 * 场景尺寸的唯一来源。改走廊 / 课桌 / 异常位置时先改这里，
 * level.js、anomalies.js、demo 路径都读这些数。
 */
export const LAYOUT = {
  /** 内空：宽 20（X），深 12（Z）。黑板在 +X，钟在 −X，窗和窗帘在 +Z。 */
  room: { minX: -10, maxX: 10, minZ: -6, maxZ: 6, height: 3.2 },
  wall: 0.15,
  door: { half: 0.8, height: 2.46 },
  hall: {
    z: 8.6,
    minZ: 7.05,
    maxZ: 10.15,
    minX: -40,
    maxX: 66,
    height: 2.9,
  },
  /** 追逐终点：北墙开口（转角）前的触发线 */
  exitX: 52.2,
  alcove: { minX: 51.4, maxX: 56.8, backZ: 14.1 },
  classmateEnd: { x: 56.4, z: 8.6 },
  /** 走廊循环：走到 +20 送到 −20，走到 −20 送到 +20 */
  loopMax: 20,
  loopMin: -20,
  pickup: { x: 0.85, z: 5.15 },
  /** 第 1 关拍照站位：后排课桌旁的横向过道 */
  photoStand: { x: -6.0, z: 2.75 },
  seat: { x: -7.85, z: 4.0 },
  /** 黑板写字面，贴在 +X 墙内侧，朝向 −X */
  board: { x: 9.84, y: 1.74, z: 0 },
  /** 靠门右侧第一扇窗的窗帘上 */
  curtainFace: { x: 2.08, y: 1.56, z: 5.78 },
  echo: { x: 0.2, z: -2.75 },
  desks: {
    /** 沿 Z，与黑板平行 */
    across: [-4.0, -1.5, 1.5, 4.0],
    /** 沿 X，越大越靠近黑板 */
    towardBoard: [-7.4, -4.6, -1.8, 1.8, 4.6, 6.8],
    topW: 1.16,
    topD: 0.62,
    topH: 0.78,
  },
  spawn: { x: -8.2, z: 8.6, yaw: -Math.PI / 2 },
};

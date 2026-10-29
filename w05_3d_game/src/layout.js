/**
 * 场景尺寸的唯一来源。改走廊 / 课桌 / 异常位置时先改这里，
 * level.js、anomalies.js、demo 路径都读这些数。
 */
export const LAYOUT = {
  room: { minX: -6, maxX: 6, minZ: -5, maxZ: 5, height: 3.2 },
  wall: 0.42,
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
  loopEdge: 12,
  loopSpan: 24,
  pickup: { x: -1.6, z: 4.05 },
  /** 第 1 关拍照站位：中列与右列课桌之间的通道 */
  photoStand: { x: 1.28, z: 1.58 },
  seat: { x: 3.72, z: 3.2 },
  board: { x: 0, y: 1.74, z: -4.84 },
  curtainFace: { x: 5.8, y: 1.56, z: 0.42 },
  echo: { x: -2.28, z: -2.02 },
  desks: {
    cols: [-3.75, 0, 3.75],
    rows: [-0.95, 1.05, 2.85],
    topW: 1.16,
    topD: 0.62,
    topH: 0.78,
  },
  spawn: { x: -8.2, z: 8.6, yaw: -Math.PI / 2 },
};

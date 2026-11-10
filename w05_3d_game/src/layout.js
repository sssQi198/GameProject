/**
 * 场景尺寸的唯一来源。改走廊 / 课桌 / 异常位置时先改这里，
 * level.js、anomalies.js、demo 路径都读这些数。
 */
export const LAYOUT = {
  /** 内空：宽 20（X），深 12（Z）。前黑板在 +X 讲台，后黑板在 −X，窗和窗帘在 +Z。 */
  room: { minX: -10, maxX: 10, minZ: -6, maxZ: 6, height: 3.2 },
  wall: 0.15,
  /**
   * 教室门开在北墙靠讲台（+X）的一端，仍通向北侧走廊。
   * x 是门洞中心。half 是半宽。
   */
  door: { x: 8.6, half: 0.8, height: 2.46 },
  hall: {
    z: 8.6,
    minZ: 7.05,
    maxZ: 10.15,
    minX: -40,
    maxX: 66,
    height: 2.9,
  },
  /**
   * 旧版“朝北墙开口转弯”的触发线，现在只剩 EXIT 灯箱和几个探针在用，不再是终点。
   *
   * 第十七轮：北墙上那个 5.4m 宽的开口（原来的 alcove，x 51.4–56.8、z 10.15–14.1）
   * 已经封死。追逐走廊现在是纯线性的一条直廊，从教室门一直到东端那扇发光的门，
   * 中途没有侧室——那处凹进去的空间是「转角版」尾声的残留，会把直线的视线打断。
   */
  exitX: 52.2,
  /** 旧尾声站位。终局已改成走廊尽头那扇发光的门（见 doorwayX），这里只是留档，运行时不读。 */
  classmateEnd: { x: 51.9, z: 8.6 },
  /**
   * 终局那扇发光的门：走廊东端墙上。
   * doorwayX 是「跑到这里就算进门」的触发线；门面中心在 doorCenterX。
   */
  doorwayX: 64.9,
  doorCenterX: 65.88,
  /** 走廊循环：走到 +20 送到 −20，走到 −20 送到 +20 */
  loopMax: 20,
  loopMin: -20,
  /**
   * 走廊中段换场的触发距离：玩家走到 |x| 超过这个值，并且离门洞至少 14 米，
   * 才把下一关铺进来。教室外墙在 x=±10，取 13 是走过窗户之后。
   * 门在讲台一端（door.x），刚出门朝东走时门洞还在眼前，所以另外要求离门 14 米。
   */
  hallSwapX: 13,
  /** 进门后脚边。x 跟门洞中心对齐，门挪到讲台一端时一起动。 */
  pickup: { x: 8.6, z: 5.15 },
  /** 第 2 关拍照站位：南墙前的过道，面朝墙根的羊头骨。 */
  photoStand: { x: 0, z: -2.5 },
  /**
   * 第 2 关羊头骨。第 5 关裂口从南墙（z = minZ）根部裂上来，
   * 头骨摆在这道墙和地板的夹角。高度按缩放在 createRamSkull 里算，底边落在地板上。
   */
  skull: { x: 0, z: -5.99 },
  /** 第 1 关的字贴在后黑板（−X）内侧，朝向 +X。前黑板保持空白。 */
  board: { x: -9.84, y: 1.74, z: 0 },
  /** 靠门右侧第一扇窗的窗帘上 */
  curtainFace: { x: 2.08, y: 1.56, z: 5.78 },
  echo: { x: 0.2, z: -2.75 },
  /** 第 3 关通灵阵。环和蜡烛半径都从教室中心量。 */
  ritual: { x: 0, z: 0, ring: 1.72, candle: 2.04 },
  desks: {
    /** 沿 Z，与黑板平行 */
    across: [-4.0, -1.5, 1.5, 4.0],
    /** 沿 X，越大越靠近黑板 */
    towardBoard: [-7.4, -4.6, -1.8, 1.8, 4.6, 6.8],
    topW: 1.16,
    topD: 0.62,
    topH: 0.78,
  },
  /**
   * 第 3 关从教室正中拖开的四套桌椅。只在地面上转 yaw，四脚着地。
   * 姿态要和 generate_furniture_glb.py 里的 DESK_PILES / CHAIR_PILES 一致。
   */
  ritualCenterDesks: [
    { x: -1.8, z: -1.5 },
    { x: -1.8, z: 1.5 },
    { x: 1.8, z: -1.5 },
    { x: 1.8, z: 1.5 },
  ],
  ritualDeskPiles: [
    { x: -2.72, z: -2.05, pitch: 0, yaw: 0.38, roll: 0 },
    { x: -2.78, z: 2.05, pitch: 0, yaw: -0.46, roll: 0 },
    { x: 2.75, z: -2.08, pitch: 0, yaw: 0.52, roll: 0 },
    { x: 2.68, z: 2.02, pitch: 0, yaw: -0.33, roll: 0 },
  ],
  ritualChairPiles: [
    { x: -3.88, z: -2.82, pitch: 0, yaw: 2.15, roll: 0 },
    { x: -3.92, z: 2.82, pitch: 0, yaw: -0.85, roll: 0 },
    { x: 3.88, z: -2.88, pitch: 0, yaw: 1.65, roll: 0 },
    { x: 3.82, z: 2.78, pitch: 0, yaw: -2.35, roll: 0 },
  ],
  /**
   * 开场对话站位。朝 +X 看走廊，门在左前方。
   * x 靠到门口附近，对话时门就在视野里，不用先走一段黑走廊。
   * 同学在玩家前方 1.5 米，仍背对玩家。
   */
  spawn: { x: 2.2, z: 8.6, yaw: -Math.PI / 2 },
  npcStand: { x: 3.7, z: 8.6 },
};

/** 五支蜡烛，放在五芒星朝上的五个顶点外侧。 */
export function ritualCandles() {
  const { x, z, candle } = LAYOUT.ritual;
  const spots = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    spots.push({
      x: x + Math.cos(angle) * candle,
      z: z + Math.sin(angle) * candle,
    });
  }
  return spots;
}

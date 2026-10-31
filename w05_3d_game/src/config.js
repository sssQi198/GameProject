/** 手感与气氛。`?debug` 面板改的就是这些字段，每帧读取。 */
export const CONFIG = {
  walkSpeed: 3.2,
  sprintSpeed: 5.5,
  prologueSpeed: 2.35,
  lookSensitivity: 0.00215,
  /** 视角追随鼠标的速度（每秒收敛比例）。调大更跟手，调小更顺滑。 */
  lookSmoothing: 55,
  playerRadius: 0.34,
  eyeHeight: 1.62,
  photoRange: 8.5,
  /**
   * 场景亮度。1 是当前气氛。
   * 调试时只改这个数，环境光、教室灯、走廊灯和雾会一起变。改回气氛时设为 1。
   */
  brightness: 1,
  exposure: 0.95,
  ambient: 0.30,
  hemi: 0.40,
  roomLight: 22,
  doorLight: 14,
  hallLamp: 16,
  lampDim: 0.35,
  lamp: 0.7,
  lampChase: 1.1,
  fogMenu: 0.045,
  fogRoom: 0.05,
  fogHall: 0.11,
  fogChase: 0.085,
  fogCalm: 0.028,
  entitySpeed: 4.45,
  entityCatch: 1.45,
  entityGap: 7.2,
  lookTurn: 0.7,
};

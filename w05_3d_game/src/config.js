/** 手感与气氛。`?debug` 面板改的就是这些字段，每帧读取。 */
export const CONFIG = {
  walkSpeed: 3.2,
  sprintSpeed: 5.5,
  prologueSpeed: 2.35,
  /**
   * 鼠标灵敏度（每像素转过的弧度）。原本 0.00215，现按 50% 收紧到 0.001075。
   * 想调回去就把这个数乘 2。
   */
  lookSensitivity: 0.001075,
  /** 视角追随鼠标的速度（每秒收敛比例）。调大更跟手，调小更顺滑。 */
  lookSmoothing: 55,
  playerRadius: 0.34,
  eyeHeight: 1.62,
  /** 向下加速度（米/秒²）。比 9.8 大一些，离地后会很快落回地面。 */
  gravity: 22,
  photoRange: 8.5,
  /**
   * 场景亮度。1 是当前气氛。
   * 调试时只改这个数，环境光、教室灯、走廊灯和雾会一起变。改回气氛时设为 1。
   */
  brightness: 1,
  exposure: 0.95,
  ambient: 0.225,
  hemi: 0.30,
  roomLight: 15.75,
  hallLamp: 36,
  /**
   * 追逐时走廊灯的「灯池」：半径收到 5.5 米（比两灯中点到灯的 5.6 米还小），
   * 于是灯下很亮、两灯之间那一小段只剩环境光，暗得下来。
   * 想更亮就调 hallPoolGain，想灯池更窄/间隙更宽就调小 hallPoolRadius。
   */
  hallPoolRadius: 5.5,
  hallPoolGain: 2,
  lampDim: 0.35,
  lamp: 0.7,
  lampChase: 1.1,
  fogMenu: 0.045,
  fogRoom: 0.05,
  fogHall: 0.11,
  fogChase: 0.085,
  fogCalm: 0.028,
  /** 安全屋（终局）：雾几乎抽干、环境光抬起来、曝光顶到 1.12 —— 三件事一起做才有「安全」的错觉 */
  fogSafe: 0.010,
  hemiSafe: 0.62,
  exposureSafe: 1.12,
  entitySpeed: 4.45,
  entityCatch: 1.45,
  entityGap: 7.2,
  lookTurn: 0.7,
};

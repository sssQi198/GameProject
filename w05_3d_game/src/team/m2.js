/**
 * M2 人物与异常。
 * anomalyFactory[关卡] 设成函数后，替换该关的程序化异常。
 * 函数返回 { level, id, group, stand:{x,z}, aimY, update(dt, env), parent? }。
 * group 必须用 tagAnomaly(group, level, id) 打过标记，否则拍不到。
 * parent === 'door' 时会挂到门轴上，随门打开。
 *
 * createClassmate / createEyes 返回 null 就继续用程序化模型。
 * 同学：脚底在原点。userData.legs = [左腿, 右腿]，userData.materials 用于尾声淡出。
 * 眼睛：本地高度约 1.62。userData.eyeL / eyeR 会跟着心跳缩放。
 */
export const anomalyFactory = {
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
};

export function createClassmate() {
  return null;
}

export function createEyes() {
  return null;
}

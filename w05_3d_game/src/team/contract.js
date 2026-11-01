/**
 * 五人共用的联调约定。改玩法前先看这里，不要另起一套标记名。
 *
 * 拍照：网格或父级 userData.anomalyLevel = 1..5，userData.anomalyId 为短名字。
 * 假异常：userData.fakeAnomaly = true。拍到会提示没记录到新异常。
 * 不挡拍照：userData.noRay = true（杂物、同学、眼睛的黑暗罩）。
 */

export const TAG = {
  anomalyLevel: 'anomalyLevel',
  anomalyId: 'anomalyId',
  fakeAnomaly: 'fakeAnomaly',
  noRay: 'noRay',
};

export const EVENT = {
  door: 'door',
  photoOk: 'photo-ok',
  photoFail: 'photo-fail',
  lookLock: 'look-lock',
  lookUnlock: 'look-unlock',
};

/** M2 / P1 给异常根节点打标记。P1 的射线只认这个标记。 */
export function tagAnomaly(group, level, id) {
  group.name = `anomaly-${id}`;
  group.userData[TAG.anomalyLevel] = level;
  group.userData[TAG.anomalyId] = id;
  return group;
}

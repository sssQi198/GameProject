/**
 * M1 场景。走廊比例以 layout.js 为准，不要在这里改房间尺寸。
 * extraColliders 追加水平碰撞盒 { minX, maxX, minZ, maxZ }。
 * createSceneExtra 返回的 Group 会加进场景，程序化教室仍然保留。
 */
export function extraColliders() {
  return [];
}

export function createSceneExtra() {
  return null;
}

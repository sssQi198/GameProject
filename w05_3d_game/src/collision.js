function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** 把圆心推出所有轴对齐盒子。盒子是 {minX,maxX,minZ,maxZ}。 */
export function pushOut(x, z, radius, boxes) {
  let cx = x;
  let cz = z;
  const r2 = radius * radius;
  for (let iter = 0; iter < 4; iter += 1) {
    let hit = false;
    for (const b of boxes) {
      const closestX = clamp(cx, b.minX, b.maxX);
      const closestZ = clamp(cz, b.minZ, b.maxZ);
      let dx = cx - closestX;
      let dz = cz - closestZ;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;
      hit = true;
      if (d2 < 1e-8) {
        const left = cx - b.minX;
        const right = b.maxX - cx;
        const down = cz - b.minZ;
        const up = b.maxZ - cz;
        const m = Math.min(left, right, down, up);
        if (m === left) cx = b.minX - radius - 1e-3;
        else if (m === right) cx = b.maxX + radius + 1e-3;
        else if (m === down) cz = b.minZ - radius - 1e-3;
        else cz = b.maxZ + radius + 1e-3;
      } else {
        const d = Math.sqrt(d2);
        const pen = radius - d + 1e-3;
        cx += (dx / d) * pen;
        cz += (dz / d) * pen;
      }
    }
    if (!hit) break;
  }
  return { x: cx, z: cz };
}

/** 分步移动，避免高速穿过薄墙。 */
export function moveCircle(x, z, dx, dz, radius, boxes) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / Math.max(radius * 0.65, 0.05)));
  let cx = x;
  let cz = z;
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i += 1) {
    cx += sx;
    cz += sz;
    const p = pushOut(cx, cz, radius, boxes);
    cx = p.x;
    cz = p.z;
  }
  return { x: cx, z: cz };
}

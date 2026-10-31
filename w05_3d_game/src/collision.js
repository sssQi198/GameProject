import { CONFIG } from './config.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

const CONTACT_SLOP = 0.001;
const SIDE_RESTITUTION = 0.12;
const GROUND_DRAG = 2.8;
const TERMINAL_VELOCITY = -32;
const SPEED_CAP = 36;
const ANGULAR_CAP = 8;
const END_PAD = 0.008;
/** 脚的等效质量。越重的物品被踢出去越慢。 */
const KICK_MASS = 2.5;
/** 小于墙厚的一半。单步再大，薄墙会把物品从另一面挤出去。 */
const SOLID_STEP = 0.06;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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

/**
 * 两个轴对齐盒子的重叠。法线把 a 推出 b。
 * horizontal 时仍要求竖直方向有重叠，但只沿 XZ 分开，避免站立的人把地上的东西踩进地板。
 */
export function boxSeparation(a, b, horizontal = false) {
  const aMinY = a.minY ?? 0;
  const aMaxY = a.maxY ?? 3.2;
  const bMinY = b.minY ?? 0;
  const bMaxY = b.maxY ?? 3.2;
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;

  const aCenterX = (a.minX + a.maxX) * 0.5;
  const aCenterY = (aMinY + aMaxY) * 0.5;
  const aCenterZ = (a.minZ + a.maxZ) * 0.5;
  const bCenterX = (b.minX + b.maxX) * 0.5;
  const bCenterY = (bMinY + bMaxY) * 0.5;
  const bCenterZ = (b.minZ + b.maxZ) * 0.5;

  let axis = 0;
  let depth = overlapX;
  if (!horizontal && overlapY < depth) {
    axis = 1;
    depth = overlapY;
  }
  if (overlapZ < depth) {
    axis = 2;
    depth = overlapZ;
  }

  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (axis === 0) nx = aCenterX >= bCenterX ? 1 : -1;
  else if (axis === 1) ny = aCenterY >= bCenterY ? 1 : -1;
  else nz = aCenterZ >= bCenterZ ? 1 : -1;
  return { nx, ny, nz, depth };
}

function ensureRotation(body) {
  if (!body.rot) body.rot = IDENTITY.slice();
}

function quatToMat(body) {
  const x = body.qx || 0;
  const y = body.qy || 0;
  const z = body.qz || 0;
  const w = body.qw ?? 1;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  body.rot = [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ];
}

function syncBody(body) {
  ensureRotation(body);
  const rot = body.rot;
  const hx = Math.abs(rot[0]) * body.hx + Math.abs(rot[1]) * body.hy + Math.abs(rot[2]) * body.hz;
  const hy = Math.abs(rot[3]) * body.hx + Math.abs(rot[4]) * body.hy + Math.abs(rot[5]) * body.hz;
  const hz = Math.abs(rot[6]) * body.hx + Math.abs(rot[7]) * body.hy + Math.abs(rot[8]) * body.hz;
  body.minX = body.x - hx;
  body.maxX = body.x + hx;
  body.minY = body.y - hy;
  body.maxY = body.y + hy;
  body.minZ = body.z - hz;
  body.maxZ = body.z + hz;
  if (body.endX == null) return;
  const positive = endWorld(body, 1);
  const negative = endWorld(body, -1);
  body.ax = positive.x;
  body.ay = positive.y;
  body.az = positive.z;
  body.bx = negative.x;
  body.by = negative.y;
  body.bz = negative.z;
}

function endWorld(body, sign) {
  const ox = body.endX * sign;
  const oy = body.endY * sign;
  const oz = body.endZ * sign;
  const rot = body.rot;
  return {
    x: body.x + rot[0] * ox + rot[1] * oy + rot[2] * oz,
    y: body.y + rot[3] * ox + rot[4] * oy + rot[5] * oz,
    z: body.z + rot[6] * ox + rot[7] * oy + rot[8] * oz,
  };
}

function pointVelocity(body, rx, ry, rz) {
  const wx = body.wx || 0;
  const wy = body.wy || 0;
  const wz = body.wz || 0;
  return {
    x: body.vx + (wy * rz - wz * ry),
    y: body.vy + (wz * rx - wx * rz),
    z: body.vz + (wx * ry - wy * rx),
  };
}

/** 接触点沿法线方向的等效逆质量，含转动。 */
function invMassAtPoint(body, rx, ry, rz, nx, ny, nz) {
  const cx = ry * nz - rz * ny;
  const cy = rz * nx - rx * nz;
  const cz = rx * ny - ry * nx;
  const angular = body.invI ? (cx * cx + cy * cy + cz * cz) * body.invI : 0;
  return body.invMass + angular;
}

function overlapCenter(body, other) {
  const minY = other.minY ?? 0;
  const maxY = other.maxY ?? 3.2;
  return {
    x: (Math.max(body.minX, other.minX) + Math.min(body.maxX, other.maxX)) * 0.5,
    y: (Math.max(body.minY, minY) + Math.min(body.maxY, maxY)) * 0.5,
    z: (Math.max(body.minZ, other.minZ) + Math.min(body.maxZ, other.maxZ)) * 0.5,
  };
}

/** 接触靠近哪一端，就把同一股力记到那个受力点。中心受力点另算。 */
function rememberEndForce(body, px, py, pz, fx, fy, fz) {
  if (!body.endX && !body.endY && !body.endZ) return;
  const pos = endWorld(body, 1);
  const neg = endWorld(body, -1);
  const dPos = (px - pos.x) ** 2 + (py - pos.y) ** 2 + (pz - pos.z) ** 2;
  const dNeg = (px - neg.x) ** 2 + (py - neg.y) ** 2 + (pz - neg.z) ** 2;
  const dCenter = (px - body.x) ** 2 + (py - body.y) ** 2 + (pz - body.z) ** 2;
  if (dPos <= dNeg && dPos < dCenter) {
    body.end0X += fx;
    body.end0Y += fy;
    body.end0Z += fz;
  } else if (dNeg < dCenter) {
    body.end1X += fx;
    body.end1Y += fy;
    body.end1Z += fz;
  }
}

/** 冲量打在接触点上。中心改线速度，力臂变成转动。 */
function applyContact(body, px, py, pz, nx, ny, nz, impulse, dt) {
  if (impulse === 0) return;
  const jx = nx * impulse;
  const jy = ny * impulse;
  const jz = nz * impulse;
  body.vx += jx * body.invMass;
  body.vy += jy * body.invMass;
  body.vz += jz * body.invMass;
  const rx = px - body.x;
  const ry = py - body.y;
  const rz = pz - body.z;
  if (body.invI) {
    body.wx += (ry * jz - rz * jy) * body.invI;
    body.wy += (rz * jx - rx * jz) * body.invI;
    body.wz += (rx * jy - ry * jx) * body.invI;
  }
  const scale = 1 / Math.max(dt, 1e-4);
  body.forceX += jx * scale;
  body.forceY += jy * scale;
  body.forceZ += jz * scale;
  rememberEndForce(body, px, py, pz, jx * scale, jy * scale, jz * scale);
}

function contactImpulse(rel, invSum, normalY, depth) {
  if (invSum <= 0) return 0;
  const intoFloor = Math.abs(normalY) > 0.65;
  const restitution = intoFloor ? 0 : SIDE_RESTITUTION;
  const closing = rel < 0 ? rel * (1 + restitution) : 0;
  // 侧面穿插即使相对速度是 0，也要有一股把受力点推开的力。地面只抵消下压。
  const bias = intoFloor ? 0 : Math.min(1.6, 6 * Math.max(depth - CONTACT_SLOP, 0));
  if (closing === 0 && bias === 0) return 0;
  const impulse = -(closing - bias) / invSum;
  return impulse > 0 ? impulse : 0;
}

function solvePointImpulse(body, point, ovx, ovy, ovz, otherInvMass, nx, ny, nz, depth, dt) {
  const rx = point.x - body.x;
  const ry = point.y - body.y;
  const rz = point.z - body.z;
  const vel = pointVelocity(body, rx, ry, rz);
  const rel = (vel.x - ovx) * nx + (vel.y - ovy) * ny + (vel.z - ovz) * nz;
  const inv = invMassAtPoint(body, rx, ry, rz, nx, ny, nz) + otherInvMass;
  const impulse = contactImpulse(rel, inv, ny, depth);
  if (impulse === 0) return rel;
  applyContact(body, point.x, point.y, point.z, nx, ny, nz, impulse, dt);
  return rel;
}

/**
 * 脚踢到矮东西时，碰撞力多给一点向上的分量。
 * 只在正在撞上去、而且物品本身不高时生效，随后重力把它拉回地面。
 */
function applyKickLift(body, point, ovx, ovz, rel, dt) {
  if (rel >= -0.35) return;
  const horiz = Math.hypot(ovx, ovz);
  if (horiz < 0.8) return;
  const height = Math.max(body.maxY - body.minY, 0.02);
  const along = clamp((point.y - body.minY) / height, 0, 1);
  const scoop = (1 - along) * clamp((0.5 - height) / 0.5, 0, 1);
  if (scoop <= 0.05) return;
  const wantVy = Math.min(3.4, horiz * 1.35 * scoop);
  if (body.vy >= wantVy) return;
  applyContact(body, point.x, point.y, point.z, 0, 1, 0, (wantVy - body.vy) * body.mass, dt);
}

function bodyCorners(body) {
  const rot = body.rot;
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = sx * body.hx;
        const ly = sy * body.hy;
        const lz = sz * body.hz;
        corners.push({
          x: body.x + rot[0] * lx + rot[1] * ly + rot[2] * lz,
          y: body.y + rot[3] * lx + rot[4] * ly + rot[5] * lz,
          z: body.z + rot[6] * lx + rot[7] * ly + rot[8] * lz,
        });
      }
    }
  }
  return corners;
}

/**
 * 站在表面上时，反作用力打在真正挨着表面的角上。
 * 重心不在支撑范围内时，重力和这个力会把物品掀翻，而不是让它斜着停住。
 */
function resolveStanding(body, box, dt) {
  const floorY = box.maxY ?? 0;
  ensureRotation(body);
  const inside = [];
  let lowest = Infinity;
  for (const corner of bodyCorners(body)) {
    if (corner.x < box.minX - END_PAD || corner.x > box.maxX + END_PAD) continue;
    if (corner.z < box.minZ - END_PAD || corner.z > box.maxZ + END_PAD) continue;
    inside.push(corner);
    if (corner.y < lowest) lowest = corner.y;
  }
  if (inside.length === 0) {
    if (body.minY >= floorY) return;
    body.y += floorY - body.minY;
    if (body.vy < 0) body.vy = 0;
    body.grounded = true;
    syncBody(body);
    return;
  }
  if (lowest < floorY) {
    const lift = floorY - lowest;
    body.y += lift;
    for (const corner of inside) corner.y += lift;
    syncBody(body);
  }
  const active = inside.filter((corner) => corner.y <= floorY + 0.015);
  if (active.length === 0) return;
  // 反作用力打在挨着地面的那些角的中心。正放时力通过重心，没有力矩；
  // 歪过支点之后，力臂会把它按重力的方向掀倒。
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const corner of active) {
    cx += corner.x;
    cy += corner.y;
    cz += corner.z;
  }
  const n = active.length;
  cx /= n;
  cy /= n;
  cz /= n;
  const rx = cx - body.x;
  const ry = cy - body.y;
  const rz = cz - body.z;
  // 贴着一整面时，支撑力从重心正下方穿过，避免角上的误差把它越晃越转。
  if (Math.hypot(rx, rz) < 0.035) {
    if (body.vy < -0.01) {
      applyContact(body, body.x, cy, body.z, 0, 1, 0, -body.vy * body.mass, dt);
    }
    body.grounded = true;
    return;
  }
  const vel = pointVelocity(body, rx, ry, rz);
  if (vel.y < -0.01) {
    const inv = invMassAtPoint(body, rx, ry, rz, 0, 1, 0);
    applyContact(body, cx, cy, cz, 0, 1, 0, -vel.y / inv, dt);
  }
  body.grounded = true;
}

function resolveDynamicHit(body, box, ovx, ovy, ovz, otherInvMass, nx, ny, nz, depth, dt, kick) {
  const point = overlapCenter(body, box);
  const usedInv = kick ? 1 / KICK_MASS : otherInvMass;
  const invSum = body.invMass + usedInv;
  if (invSum <= 0) return;
  let push = Math.max(depth - CONTACT_SLOP, 0) * (body.invMass / invSum);
  if (kick) push = Math.min(push, SOLID_STEP);
  body.x += nx * push;
  body.y += ny * push;
  body.z += nz * push;
  syncBody(body);
  const rel = solvePointImpulse(body, point, ovx, ovy, ovz, usedInv, nx, ny, nz, depth, dt);
  if (kick) applyKickLift(body, point, ovx, ovz, rel, dt);
}

/** 上一处还在墙外的位置。穿进墙里时只许退回这一侧。 */
function rememberOrigin(body) {
  body.originX = body.x;
  body.originY = body.y;
  body.originZ = body.z;
}

function overlapsAny(body, boxes) {
  for (const box of boxes) {
    if (boxSeparation(body, box, false)) return true;
  }
  return false;
}

/**
 * 从实心盒子里退出的方向。
 * 优先退回进入前的那一侧；人把物品挤过墙中线时，不能改从另一面弹出去。
 */
function outsideExit(body, box) {
  if (body.originX == null) return null;
  const minY = box.minY ?? 0;
  const maxY = box.maxY ?? 3.2;
  const options = [];
  if (body.originX <= box.minX) options.push({ nx: -1, ny: 0, nz: 0, depth: body.maxX - box.minX });
  if (body.originX >= box.maxX) options.push({ nx: 1, ny: 0, nz: 0, depth: box.maxX - body.minX });
  if (body.originY <= minY) options.push({ nx: 0, ny: -1, nz: 0, depth: body.maxY - minY });
  if (body.originY >= maxY) options.push({ nx: 0, ny: 1, nz: 0, depth: maxY - body.minY });
  if (body.originZ <= box.minZ) options.push({ nx: 0, ny: 0, nz: -1, depth: body.maxZ - box.minZ });
  if (body.originZ >= box.maxZ) options.push({ nx: 0, ny: 0, nz: 1, depth: box.maxZ - body.minZ });
  let best = null;
  for (const option of options) {
    if (option.depth <= CONTACT_SLOP) continue;
    if (!best || option.depth < best.depth) best = option;
  }
  return best;
}

function applySolidExit(body, box, out, dt) {
  const depth = Math.max(out.depth - CONTACT_SLOP, 0);
  body.x += out.nx * depth;
  body.y += out.ny * depth;
  body.z += out.nz * depth;
  syncBody(body);
  const point = {
    x: out.nx === 0 ? body.x : (out.nx > 0 ? box.maxX : box.minX),
    y: out.ny === 0 ? body.y : (out.ny > 0 ? (box.maxY ?? 3.2) : (box.minY ?? 0)),
    z: out.nz === 0 ? body.z : (out.nz > 0 ? box.maxZ : box.minZ),
  };
  solvePointImpulse(body, point, 0, 0, 0, 0, out.nx, out.ny, out.nz, 0, dt);
  const vn = body.vx * out.nx + body.vy * out.ny + body.vz * out.nz;
  if (vn < 0) {
    body.vx -= out.nx * vn;
    body.vy -= out.ny * vn;
    body.vz -= out.nz * vn;
  }
}

function resolveAgainst(body, box, ovx, ovy, ovz, otherInvMass, horizontal, dt) {
  const sep = boxSeparation(body, box, horizontal);
  if (!sep) return;
  const { nx, ny, nz, depth } = sep;
  if (!horizontal && ny > 0.65) {
    resolveStanding(body, box, dt);
    return;
  }
  if (!horizontal) {
    const out = outsideExit(body, box);
    if (out) {
      applySolidExit(body, box, out, dt);
      return;
    }
  }
  resolveDynamicHit(body, box, ovx, ovy, ovz, otherInvMass, nx, ny, nz, depth, dt, Boolean(box.kick));
}

function resolvePair(a, b, dt) {
  const sep = boxSeparation(a, b, false);
  if (!sep) return;
  const { nx, ny, nz, depth } = sep;
  if (ny > 0.65) {
    resolveStanding(a, b, dt);
    return;
  }
  if (ny < -0.65) {
    resolveStanding(b, a, dt);
    return;
  }
  const point = overlapCenter(a, b);
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return;
  const push = Math.max(depth - CONTACT_SLOP, 0);
  const shareA = a.invMass / invSum;
  const shareB = b.invMass / invSum;
  a.x += nx * push * shareA;
  a.y += ny * push * shareA;
  a.z += nz * push * shareA;
  b.x -= nx * push * shareB;
  b.y -= ny * push * shareB;
  b.z -= nz * push * shareB;
  syncBody(a);
  syncBody(b);
  const ra = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z };
  const rb = { x: point.x - b.x, y: point.y - b.y, z: point.z - b.z };
  const va = pointVelocity(a, ra.x, ra.y, ra.z);
  const vb = pointVelocity(b, rb.x, rb.y, rb.z);
  const rel = (va.x - vb.x) * nx + (va.y - vb.y) * ny + (va.z - vb.z) * nz;
  const inv = invMassAtPoint(a, ra.x, ra.y, ra.z, nx, ny, nz)
    + invMassAtPoint(b, rb.x, rb.y, rb.z, -nx, -ny, -nz);
  const impulse = contactImpulse(rel, inv, ny, depth);
  if (impulse === 0) return;
  applyContact(a, point.x, point.y, point.z, nx, ny, nz, impulse, dt);
  applyContact(b, point.x, point.y, point.z, -nx, -ny, -nz, impulse, dt);
}

function capSpeed(body) {
  const speed = Math.hypot(body.vx, body.vy, body.vz);
  if (speed <= SPEED_CAP) return;
  const scale = SPEED_CAP / speed;
  body.vx *= scale;
  body.vy *= scale;
  body.vz *= scale;
}

function integrateOrientation(body, dt) {
  if (body.qw == null) return;
  const hx = body.wx * dt * 0.5;
  const hy = body.wy * dt * 0.5;
  const hz = body.wz * dt * 0.5;
  const x = body.qx;
  const y = body.qy;
  const z = body.qz;
  const w = body.qw;
  body.qx = x + (hx * w + hy * z - hz * y);
  body.qy = y + (hy * w + hz * x - hx * z);
  body.qz = z + (hz * w + hx * y - hy * x);
  body.qw = w + (-hx * x - hy * y - hz * z);
  const len = Math.hypot(body.qx, body.qy, body.qz, body.qw) || 1;
  body.qx /= len;
  body.qy /= len;
  body.qz /= len;
  body.qw /= len;
  quatToMat(body);
}

function capAngular(body) {
  if (body.wx == null) return;
  const speed = Math.hypot(body.wx, body.wy, body.wz);
  if (speed <= ANGULAR_CAP) return;
  const scale = ANGULAR_CAP / speed;
  body.wx *= scale;
  body.wy *= scale;
  body.wz *= scale;
}

function applyOffsetForce(body, rx, ry, rz, fx, fy, fz, dt) {
  if (!body.invI) return;
  body.wx += (ry * fz - rz * fy) * body.invI * dt;
  body.wy += (rz * fx - rx * fz) * body.invI * dt;
  body.wz += (rx * fy - ry * fx) * body.invI * dt;
}

/** 中心和两端各受一份重力。三份一起拉，下落加速度仍是 g。 */
function applyGravity(body, dt) {
  const weight = -body.mass * CONFIG.gravity;
  body.forceX = 0;
  body.forceY = weight;
  body.forceZ = 0;
  body.end0X = 0;
  body.end0Y = weight;
  body.end0Z = 0;
  body.end1X = 0;
  body.end1Y = weight;
  body.end1Z = 0;
  if (body.endX || body.endY || body.endZ) {
    ensureRotation(body);
    const positive = endWorld(body, 1);
    const negative = endWorld(body, -1);
    applyOffsetForce(body, positive.x - body.x, positive.y - body.y, positive.z - body.z, 0, weight, 0, dt);
    applyOffsetForce(body, negative.x - body.x, negative.y - body.y, negative.z - body.z, 0, weight, 0, dt);
  }
  const pullY = (body.forceY + body.end0Y + body.end1Y) / 3;
  body.vy = Math.max(body.vy + pullY * body.invMass * dt, TERMINAL_VELOCITY);
}

/**
 * 动态物品有三个受力点：碰撞框中心，以及中心轴两端。三个点都受重力。
 * 碰撞力打在接触点上，偏离中心就产生转动；靠近哪一端，力就记在那一端。
 */
function moveBody(body, staticBoxes, supportBoxes, dt) {
  const dist = Math.hypot(body.vx, body.vy, body.vz) * dt;
  const steps = Math.min(40, Math.max(1, Math.ceil(dist / SOLID_STEP)));
  const h = dt / steps;
  body.grounded = false;
  for (let i = 0; i < steps; i += 1) {
    body.x += body.vx * h;
    body.y += body.vy * h;
    body.z += body.vz * h;
    syncBody(body);
    for (let n = 0; n < 2; n += 1) {
      for (const box of supportBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, h);
      for (const box of staticBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, h);
    }
    if (!overlapsAny(body, staticBoxes)) rememberOrigin(body);
  }
}

export function stepDynamicBodies(bodies, staticBoxes, supportBoxes, kinematic, dt) {
  if (dt <= 0 || bodies.length === 0) return;
  for (const body of bodies) {
    if (body.qw != null) quatToMat(body);
    syncBody(body);
    if (!overlapsAny(body, staticBoxes)) rememberOrigin(body);
    applyGravity(body, dt);
    moveBody(body, staticBoxes, supportBoxes, dt);
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (const body of bodies) {
      if (kinematic) {
        resolveAgainst(body, kinematic, kinematic.vx || 0, kinematic.vy || 0, kinematic.vz || 0, kinematic.invMass || 0, true, dt);
      }
    }
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) resolvePair(bodies[i], bodies[j], dt);
    }
    for (const body of bodies) {
      for (let n = 0; n < 2; n += 1) {
        for (const box of supportBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, dt);
        for (const box of staticBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, dt);
      }
      if (!overlapsAny(body, staticBoxes)) rememberOrigin(body);
    }
  }

  for (const body of bodies) {
    capSpeed(body);
    capAngular(body);
    if (body.grounded) {
      const drag = Math.exp(-GROUND_DRAG * dt);
      const nextVx = body.vx * drag;
      const nextVz = body.vz * drag;
      body.forceX += body.mass * (nextVx - body.vx) / dt;
      body.forceZ += body.mass * (nextVz - body.vz) / dt;
      body.vx = nextVx;
      body.vz = nextVz;
      const spinNow = Math.hypot(body.wx || 0, body.wy || 0, body.wz || 0);
      const up = Math.abs(body.rot?.[4] ?? 1);
      const settled = up > 0.96 || up < 0.12;
      if (settled && Math.hypot(body.vx, body.vz) < 0.04 && Math.abs(body.vy) < 0.08 && spinNow < 0.4) {
        body.vx = 0;
        body.vy = 0;
        body.vz = 0;
      }
    }
    if (body.wx != null) {
      const spin = Math.hypot(body.wx, body.wy, body.wz);
      const up = Math.abs(body.rot?.[4] ?? 1);
      const sliding = Math.hypot(body.vx, body.vz);
      const settled = body.grounded && sliding < 0.3 && (up > 0.92 || up < 0.25);
      const rate = !body.grounded ? 0.35 : (settled ? 14 : 1.1);
      const spinDrag = Math.exp(-rate * dt);
      body.wx *= spinDrag;
      body.wy *= spinDrag;
      body.wz *= spinDrag;
      if (spin < 0.15 && (!body.grounded || settled)) {
        body.wx = 0;
        body.wy = 0;
        body.wz = 0;
      }
      integrateOrientation(body, dt);
    }
    syncBody(body);
    // 转过之后包围盒可能又扎进墙里，再沿进来的一侧推出去。
    for (const box of supportBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, dt);
    for (const box of staticBoxes) resolveAgainst(body, box, 0, 0, 0, 0, false, dt);
    syncBody(body);
  }
}

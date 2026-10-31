/**
 * M1 场景：随机恐怖装饰。
 *
 * 只在桌面、地面、墙面加很淡的痕迹（污渍、抓痕、手印），用来把教室"弄脏"，
 * 不参与玩法：
 * - 全部标记 userData.noRay，拍照射线会直接跳过，不会挡住异常判定；
 * - 不写任何文字、不画脸和眼睛，避免和黑板异常、窗帘脸混淆；
 * - 与每个异常锚点、每处拍照站位都保留安全距离，保证异常始终是最显眼的那一个；
 * - 用 InstancedMesh 合批，总共 4 个 draw call。
 *
 * 随机数用固定种子，默认每次都一样，方便复现和录演示；
 * 想换一批可以用 ?decorSeed=123 覆盖。
 */

const ANOMALY_ANCHORS = [
  { x: -7.85, z: 4.0, r: 2.0, note: 'level 1 seated figure' },
  { x: 9.84, z: 0, r: 2.2, note: 'level 2 blackboard' },
  { x: 2.08, z: 5.78, r: 1.8, note: 'level 3 curtain face' },
  { x: 0.2, z: -2.75, r: 1.6, note: 'level 4 second camera' },
  { x: 0, z: 6.0, r: 2.2, note: 'level 5 door gap' },
];

const PHOTO_STANDS = [
  { x: -6.0, z: 2.75, r: 1.3 },
  { x: 6.2, z: 0, r: 1.3 },
  { x: 2.08, z: 2.75, r: 1.3 },
  { x: -1.05, z: -2.75, r: 1.3 },
  { x: 0, z: 4.2, r: 1.3 },
];

const AVOID = [...ANOMALY_ANCHORS, ...PHOTO_STANDS];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readSeed() {
  const param = new URLSearchParams(location.search).get('decorSeed');
  if (param === null || param === '') return 20251031;
  const parsed = Number(param);
  return Number.isFinite(parsed) ? parsed >>> 0 : 20251031;
}

function tooClose(x, z, extra = 0) {
  for (const spot of AVOID) {
    if (Math.hypot(x - spot.x, z - spot.z) < spot.r + extra) return true;
  }
  return false;
}

/** 径向渐变污渍，边缘不规则。 */
function stainTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46, 10 + (i % 3) * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 几道浅色划痕。 */
function scratchTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  const rand = mulberry32(9001);
  for (let i = 0; i < 9; i += 1) {
    const x = 20 + rand() * 88;
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.globalAlpha = 0.25 + rand() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 20 + rand() * 60);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 18, 120, x + (rand() - 0.5) * 26, 190 + rand() * 46);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 按在墙上的手印。 */
function handTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(64, 82, 26, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  const fingers = [
    { x: 40, y: 44, rx: 8, ry: 20, rot: 0.16 },
    { x: 56, y: 34, rx: 8.5, ry: 24, rot: 0.06 },
    { x: 73, y: 34, rx: 8.5, ry: 24, rot: -0.06 },
    { x: 89, y: 44, rx: 7.5, ry: 20, rot: -0.16 },
  ];
  for (const f of fingers) {
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.rx, f.ry, f.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(96, 88, 7, 16, -0.9, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 一张踩脏的作业纸：横线 + 污点。 */
function paperTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(31415);

  ctx.fillStyle = '#c9c4b2';
  ctx.fillRect(0, 0, 128, 180);

  // 纸上的横线
  ctx.strokeStyle = 'rgba(70,74,80,0.35)';
  ctx.lineWidth = 1;
  for (let y = 26; y < 168; y += 14) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(114, y);
    ctx.stroke();
  }
  // 划掉的字迹
  ctx.strokeStyle = 'rgba(40,42,48,0.55)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 7; i += 1) {
    const x = 20 + rand() * 70;
    const y = 30 + rand() * 120;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 + rand() * 14, y + 3);
    ctx.stroke();
  }
  // 脏污和褶皱
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = `rgba(58,48,38,${0.05 + rand() * 0.16})`;
    ctx.beginPath();
    ctx.arc(rand() * 128, rand() * 180, 3 + rand() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60,54,44,0.25)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, rand() * 180);
    ctx.lineTo(128, rand() * 180);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 收集实例矩阵，最后一次性建 InstancedMesh。 */
function makeBatch(THREE, geometry, material, entries) {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  entries.forEach((entry, index) => {
    euler.set(entry.rx || 0, entry.ry || 0, entry.rz || 0, 'YXZ');
    quaternion.setFromEuler(euler);
    position.set(entry.x, entry.y, entry.z);
    scale.set(entry.sx, entry.sy, 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.noRay = true;
  return mesh;
}

export function createSceneExtra(THREE, LAYOUT) {
  const group = new THREE.Group();
  group.name = 'M1_RoomGrime';
  group.userData.noRay = true;

  const random = mulberry32(readSeed());
  const room = LAYOUT.room;
  const desks = LAYOUT.desks;

  const stains = [];
  const deskStains = [];
  const scratches = [];
  const hands = [];

  // 1) 地面：干掉的污渍
  let guard = 0;
  while (stains.length < 9 && guard < 400) {
    guard += 1;
    const x = room.minX + 0.8 + random() * (room.maxX - room.minX - 1.6);
    const z = room.minZ + 0.8 + random() * (room.maxZ - room.minZ - 2.4);
    if (tooClose(x, z, 0.2)) continue;
    stains.push({
      x,
      y: 0.036,
      z,
      rx: -Math.PI / 2,
      sx: 0.45 + random() * 0.6,
      sy: 0.4 + random() * 0.55,
      rz: random() * Math.PI * 2,
    });
  }

  // 2) 桌面：小块印子，避开异常所在的那张桌子
  guard = 0;
  while (deskStains.length < 11 && guard < 500) {
    guard += 1;
    const x = desks.towardBoard[Math.floor(random() * desks.towardBoard.length)];
    const z = desks.across[Math.floor(random() * desks.across.length)];
    if (tooClose(x, z, 0.9)) continue;
    deskStains.push({
      x: x + (random() - 0.5) * 0.34,
      y: 0.783,
      z: z + (random() - 0.5) * 0.72,
      rx: -Math.PI / 2,
      sx: 0.10 + random() * 0.13,
      sy: 0.08 + random() * 0.11,
      rz: random() * Math.PI * 2,
    });
  }

  // 3) 墙面：抓痕 + 手印
  const walls = [
    { x: room.minX + 0.01, ry: Math.PI / 2, axis: 'z' },
    { x: room.maxX - 0.01, ry: -Math.PI / 2, axis: 'z' },
    { z: room.minZ + 0.01, ry: 0, axis: 'x' },
  ];

  const wallPoint = (wall) => {
    const t = room.minZ + 0.9 + random() * (room.maxZ - room.minZ - 2.3);
    if (wall.axis === 'z') return { x: wall.x, z: t };
    return { x: t, z: wall.z };
  };

  guard = 0;
  while (scratches.length < 7 && guard < 400) {
    guard += 1;
    const wall = walls[Math.floor(random() * walls.length)];
    const point = wallPoint(wall);
    // 右墙是黑板那一面，整段留白，不跟第 2 关的字抢注意力
    if (wall.x > 0 && Math.abs(point.z) < 3.0) continue;
    if (tooClose(point.x, point.z, 0.3)) continue;
    scratches.push({
      x: point.x,
      y: 0.9 + random() * 1.1,
      z: point.z,
      ry: wall.ry,
      sx: 0.22 + random() * 0.26,
      sy: 0.5 + random() * 0.7,
      rz: (random() - 0.5) * 0.5,
    });
  }

  guard = 0;
  while (hands.length < 3 && guard < 400) {
    guard += 1;
    const wall = walls[Math.floor(random() * walls.length)];
    const point = wallPoint(wall);
    if (wall.x > 0 && Math.abs(point.z) < 3.0) continue;
    if (tooClose(point.x, point.z, 0.45)) continue;
    hands.push({
      x: point.x,
      y: 1.15 + random() * 0.6,
      z: point.z,
      ry: wall.ry,
      sx: 0.24,
      sy: 0.24,
      rz: (random() - 0.5) * 0.35,
    });
  }

  const planeGeometry = new THREE.PlaneGeometry(1, 1);

  if (stains.length) {
    group.add(makeBatch(THREE, planeGeometry, new THREE.MeshBasicMaterial({
      map: stainTexture(THREE),
      color: 0x0a0807,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }), stains));
  }

  if (deskStains.length) {
    group.add(makeBatch(THREE, planeGeometry, new THREE.MeshBasicMaterial({
      map: stainTexture(THREE),
      color: 0x120d0b,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }), deskStains));
  }

  if (scratches.length) {
    group.add(makeBatch(THREE, planeGeometry, new THREE.MeshBasicMaterial({
      map: scratchTexture(THREE),
      color: 0xb8b2a3,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }), scratches));
  }

  if (hands.length) {
    group.add(makeBatch(THREE, planeGeometry, new THREE.MeshBasicMaterial({
      map: handTexture(THREE),
      color: 0x1b0c0b,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }), hands));
  }

  // 4) 天花板上垂下来的破布条
  const strips = [];
  guard = 0;
  while (strips.length < 6 && guard < 300) {
    guard += 1;
    const x = room.minX + 1.2 + random() * (room.maxX - room.minX - 2.4);
    const z = room.minZ + 1.0 + random() * (room.maxZ - room.minZ - 2.0);
    if (tooClose(x, z, 0.6)) continue;
    const len = 0.28 + random() * 0.62;
    strips.push({
      x,
      y: 3.16 - len / 2,
      z,
      rz: (random() - 0.5) * 0.22,
      ry: random() * Math.PI,
      sx: 0.05 + random() * 0.06,
      sy: len,
    });
  }

  // 5) 地上散落的纸
  const papers = [];
  guard = 0;
  while (papers.length < 9 && guard < 300) {
    guard += 1;
    const x = room.minX + 0.9 + random() * (room.maxX - room.minX - 1.8);
    const z = room.minZ + 0.9 + random() * (room.maxZ - room.minZ - 2.2);
    if (tooClose(x, z, 0.5)) continue;
    papers.push({
      x,
      y: 0.038,
      z,
      rx: -Math.PI / 2,
      rz: random() * Math.PI * 2,
      sx: 0.19 + random() * 0.06,
      sy: 0.26 + random() * 0.08,
    });
  }

  if (strips.length) {
    // 布条用竖直的薄盒，绕 Z 轻微倾斜
    const stripGeo = new THREE.BoxGeometry(1, 1, 0.012);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x231f1b, roughness: 0.98 });
    group.add(makeBatch(THREE, stripGeo, stripMat, strips));
  }

  if (papers.length) {
    group.add(makeBatch(THREE, planeGeometry, new THREE.MeshBasicMaterial({
      map: paperTexture(THREE),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    }), papers));
  }

  const total = stains.length + deskStains.length + scratches.length + hands.length
    + strips.length + papers.length;
  document.body.dataset.decor = String(total);
  console.info(`[M1] room grime: floor ${stains.length} / desk ${deskStains.length} / scratch ${scratches.length} / hand ${hands.length} / strip ${strips.length} / paper ${papers.length}`);

  return group;
}

/** 装饰不改碰撞。 */
export function extraColliders() {
  return [];
}

import * as THREE from '../vendor/three.module.js';
import { LAYOUT, ritualCandles } from './layout.js';
import { hints, successLines } from './team/p1.js';
import { anomalyFactory } from './team/m2.js';
import { tagAnomaly } from './team/contract.js';
import { disposeCharacter, loadCharacter } from './character-model.js';

export function anomalyHint(level) {
  return hints[level] ?? '';
}

export function anomalyLine(level) {
  return successLines[level] ?? '';
}

/**
 * 每一关只多一个可拍照目标。旧的留在场景里，但打中它们不算过关。
 * 挂到网格上的 userData.anomalyLevel 是拍照射线要认的标记。
 */
export function createAnomaly(level) {
  const custom = anomalyFactory[level];
  if (typeof custom === 'function') return custom(level);
  switch (level) {
    case 1: return createSeat();
    case 2: return createBoard();
    case 3: return createSummoningCircle();
    case 4: return createRedDoll();
    case 5: return createFleshWall();
    default: throw new Error(`没有第 ${level} 关异常`);
  }
}

function tag(group, level, id) {
  return tagAnomaly(group, level, id);
}

/** 固定种子的随机数，保证每次看到的痕迹位置一致。 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 轴对齐盒子，中心定位。 */
function addBox(group, mat, w, h, d, x, y, z, rotZ = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (rotZ) mesh.rotation.z = rotZ;
  group.add(mesh);
  return mesh;
}

function addSphere(group, mat, r, x, y, z, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  group.add(mesh);
  return mesh;
}

/* ---------------------------------------------------------------- 第 1 关 */

/**
 * 后排坐着的人影：校服、趴在桌上的头、摊在桌面上的手。
 * 身体朝 +X（面向黑板），原点在椅子上。
 */
function createSeat() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.seat.x, 0, LAYOUT.seat.z);

  const uniform = new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.93 });
  const uniformDark = new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x7d6757, roughness: 0.88 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.98 });
  const collar = new THREE.MeshStandardMaterial({ color: 0x9a978c, roughness: 0.8 });

  // 腿
  addBox(group, uniformDark, 0.34, 0.13, 0.15, 0.14, 0.47, -0.11);
  addBox(group, uniformDark, 0.34, 0.13, 0.15, 0.14, 0.47, 0.11);
  addBox(group, uniformDark, 0.13, 0.40, 0.14, 0.30, 0.24, -0.11);
  addBox(group, uniformDark, 0.13, 0.40, 0.14, 0.30, 0.24, 0.11);
  addBox(group, uniformDark, 0.21, 0.08, 0.15, 0.38, 0.05, -0.11);
  addBox(group, uniformDark, 0.21, 0.08, 0.15, 0.38, 0.05, 0.11);

  // 髋部与躯干
  addBox(group, uniform, 0.30, 0.20, 0.36, -0.01, 0.56, 0);
  const torso = addBox(group, uniform, 0.26, 0.44, 0.38, 0.06, 0.86, 0, -0.30);
  const shoulder = addBox(group, uniform, 0.23, 0.10, 0.40, 0.16, 1.03, 0, -0.30);
  addBox(group, collar, 0.19, 0.05, 0.30, 0.20, 1.09, 0, -0.30);
  addBox(group, uniformDark, 0.26, 0.30, 0.02, 0.06, 0.86, -0.195, -0.30);

  // 手臂：前臂平摊在桌面上
  for (const side of [-1, 1]) {
    addBox(group, uniform, 0.12, 0.30, 0.12, 0.17, 0.99, side * 0.17, -0.55);
    addBox(group, uniform, 0.30, 0.10, 0.11, 0.34, 0.85, side * 0.17);
    addBox(group, skin, 0.11, 0.06, 0.12, 0.50, 0.83, side * 0.17);
  }

  // 头：扣在桌面上，头发盖住后颈
  addBox(group, skin, 0.09, 0.10, 0.09, 0.28, 0.99, 0, -0.7);
  const head = addSphere(group, skin, 0.115, 0.43, 0.90, 0, [1.05, 0.95, 1]);
  const hairCap = addSphere(group, hair, 0.122, 0.415, 0.925, 0, [1.05, 0.85, 1.02]);
  hairCap.rotation.z = -0.25;
  addBox(group, hair, 0.16, 0.12, 0.02, 0.47, 0.86, 0, -0.3);

  tag(group, 1, 'seat');
  const baseShoulderY = 1.03;

  return {
    level: 1,
    id: 'seat',
    group,
    stand: { ...LAYOUT.photoStand },
    aimY: 0.95,
    head,
    update(dt, env) {
      const target = baseShoulderY + (env.flickerDark ? 0.045 : 0);
      shoulder.position.y += (target - shoulder.position.y) * Math.min(1, dt * 9);
      torso.rotation.z = -0.30 + Math.sin(env.time * 1.1) * 0.012;
      head.position.y = 0.90 + Math.sin(env.time * 1.6) * 0.004;
    },
  };
}

/* ---------------------------------------------------------------- 第 2 关 */

/**
 * 黑板：只有一行字，笔画歪斜、粗细不匀，字里往外渗血。
 * 不再做重复的第二行，也不再画下方的计数划痕。
 */
function createBoard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  const rand = seeded(20251031);

  ctx.fillStyle = '#141c17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 擦不干净的陈年粉笔灰
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#dfe6dc';
  for (let i = 0; i < 70; i += 1) {
    ctx.fillRect(rand() * canvas.width, rand() * canvas.height, 20 + rand() * 46, 2 + rand() * 2);
  }
  ctx.globalAlpha = 1;

  // 被擦过又没擦掉的一片
  const smear = ctx.createLinearGradient(140, 0, 760, 0);
  smear.addColorStop(0, 'rgba(205,215,205,0)');
  smear.addColorStop(0.45, 'rgba(205,215,205,0.08)');
  smear.addColorStop(1, 'rgba(205,215,205,0)');
  ctx.fillStyle = smear;
  ctx.fillRect(140, 128, 640, 116);

  const text = '你把它带进来了';
  const baseY = 188;
  const fontOf = (size) => `${size}px "STKaiti", "KaiTi", "STSong", "Microsoft YaHei", sans-serif`;

  // 量出每个字的宽度，好逐个歪着画
  ctx.font = fontOf(88);
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let cursor = 512 - total / 2;

  // 每个字各自的旋转、缩放、上下漂移：基线不平，大小不匀
  const glyphs = [...text].map((ch, i) => ({
    ch,
    size: 88 * (0.82 + rand() * 0.34),
    rot: (rand() - 0.5) * 0.34,
    dx: (rand() - 0.5) * 18,
    dy: (rand() - 0.5) * 32,
    weight: 0.6 + rand() * 0.4,
    x: 0,
  }));
  let drift = 0;
  for (let i = 0; i < glyphs.length; i += 1) {
    glyphs[i].x = cursor + widths[i] / 2;
    cursor += widths[i];
    drift += (rand() - 0.5) * 7;
    glyphs[i].dy += drift;
  }

  // 先垫一层暗红晕，让字像是从血里浮出来
  ctx.globalAlpha = 0.45;
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x + g.dx + 2, baseY + g.dy + 3);
    ctx.rotate(g.rot);
    ctx.font = fontOf(g.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(96,10,14,0.85)';
    ctx.fillText(g.ch, 2, 3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 主笔画：粉笔白，笔画粗细不匀
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x + g.dx, baseY + g.dy);
    ctx.rotate(g.rot);
    ctx.font = fontOf(g.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5 * g.weight;
    ctx.fillStyle = 'rgba(232,226,210,1)';
    ctx.fillText(g.ch, -1.6, 1.6);
    ctx.globalAlpha = 0.7 * g.weight;
    ctx.fillStyle = 'rgba(228,222,204,1)';
    ctx.fillText(g.ch, 1.2, -1.1);
    ctx.globalAlpha = 0.92 * g.weight;
    ctx.fillStyle = 'rgba(238,233,220,1)';
    ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 有两个字被袖子抹开了一半：不是挖空，是糊上一层粉笔灰
  for (const g of glyphs) {
    if (g.ch !== '把' && g.ch !== '了') continue;
    ctx.save();
    ctx.translate(g.x + g.dx, baseY + g.dy);
    ctx.rotate(g.rot + 0.16);
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = 0.10 + i * 0.03;
      ctx.fillStyle = '#ded9c8';
      ctx.fillRect(-g.size * 0.34 + i * 6, -g.size * 0.26 + i * 9, g.size * 0.62, 7 + i * 3);
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(20,28,23,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-g.size * 0.3, -g.size * 0.2 + i * 26);
      ctx.lineTo(g.size * 0.3, -g.size * 0.24 + i * 26);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 血迹：从字里往下淌
  const drip = (x, top, len, width, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(104,9,13,0.95)';
    ctx.beginPath();
    ctx.moveTo(x - width / 2, top);
    ctx.quadraticCurveTo(x - width * 0.45, top + len * 0.72, x - width * 0.16, top + len * 0.95);
    ctx.quadraticCurveTo(x, top + len * 1.06, x + width * 0.16, top + len * 0.95);
    ctx.quadraticCurveTo(x + width * 0.45, top + len * 0.72, x + width / 2, top);
    ctx.closePath();
    ctx.fill();
    // 滴头
    ctx.beginPath();
    ctx.arc(x, top + len, width * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  // 沿基线撒 15 处血迹，长短不一
  for (let i = 0; i < 15; i += 1) {
    const x = 262 + rand() * 500;
    const top = 150 + rand() * 60;
    const len = 10 + rand() * 86;
    const width = 2.2 + rand() * 5;
    drip(x, top, len, width, 0.55 + rand() * 0.4);
  }

  // 三处拖到底的长痕
  for (const x of [312, 505, 688]) {
    drip(x, 176 + rand() * 26, 150 + rand() * 60, 3.4 + rand(), 0.5);
  }

  // 溅点
  for (let i = 0; i < 40; i += 1) {
    const x = 240 + rand() * 545;
    const y = 130 + rand() * 150;
    const r = 0.8 + rand() * 2.6;
    ctx.globalAlpha = 0.25 + rand() * 0.45;
    ctx.fillStyle = 'rgba(96,8,12,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 1 });
  mat.toneMapped = false;

  const group = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.95), mat);
  group.add(plane);
  group.position.set(LAYOUT.board.x, LAYOUT.board.y, LAYOUT.board.z);
  group.rotation.y = -Math.PI / 2;
  tag(group, 2, 'board');

  let scratchIn = 0;
  return {
    level: 2,
    id: 'board',
    group,
    stand: { x: 6.2, z: 0 },
    aimY: 0,
    update(dt, env) {
      const wave = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(env.time * 2.4));
      mat.opacity = env.flickerDark ? 1 : wave;
      plane.position.z = Math.sin(env.time * 0.9) * 0.004;
      if (env.flickerDark) {
        scratchIn += dt;
        if (scratchIn > 3.2) {
          scratchIn = 0;
          env.audio?.scratch();
        }
      }
    },
  };
}

/* ---------------------------------------------------------------- 第 3 关 */

/**
 * 通灵阵。正中一块红色五芒星，五支蜡烛点在星角外侧。
 * 圈、星和蜡烛的摆法参照恐鬼症的召唤阵，线画成手绘红粉笔。
 */
function createSummoningCircle() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.ritual.x, 0, LAYOUT.ritual.z);

  const meshRadius = 2.35;
  const decalMat = new THREE.MeshBasicMaterial({
    map: summoningCircleTexture(meshRadius),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  decalMat.polygonOffset = true;
  decalMat.polygonOffsetFactor = -2;
  decalMat.polygonOffsetUnits = -2;
  const decal = new THREE.Mesh(new THREE.CircleGeometry(meshRadius, 72), decalMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.046;
  decal.renderOrder = 2;

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff140c,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.85, 48), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.044;
  glow.renderOrder = 1;

  const heart = new THREE.PointLight(0xff2218, 6, 4.8, 2);
  heart.position.set(0, 0.42, 0);

  const candles = ritualCandles().map((spot, index) => addRitualCandle(
    group,
    spot.x - LAYOUT.ritual.x,
    spot.z - LAYOUT.ritual.z,
    index,
  ));

  group.add(glow, decal, heart);
  tag(group, 3, 'ritual');

  return {
    level: 3,
    id: 'ritual',
    group,
    stand: { x: LAYOUT.ritual.x, z: LAYOUT.ritual.z + 3.5 },
    aim: { x: 0, y: 0.28, z: 0 },
    update(_dt, env) {
      const dark = env.flickerDark ? 1 : 0;
      const pulse = 0.16 + Math.sin(env.time * 1.7) * 0.05 + dark * 0.22;
      glowMat.opacity = pulse;
      heart.intensity = 4.5 + Math.sin(env.time * 2.1) * 0.8 + dark * 4;
      for (const candle of candles) {
        const flick = 0.72
          + Math.sin(env.time * 13 + candle.phase) * 0.16
          + Math.sin(env.time * 27 + candle.phase * 1.7) * 0.08;
        candle.flame.scale.y = 1.15 + flick * 0.55;
        candle.flame.position.y = candle.flameBase + Math.sin(env.time * 17 + candle.phase) * 0.004;
        candle.glow.scale.setScalar(0.85 + flick * 0.35);
        candle.light.intensity = (3.2 + flick * 2.2) * (1 + dark * 0.65);
      }
    },
  };
}

function addRitualCandle(group, x, z, index) {
  const height = [0.16, 0.12, 0.18, 0.11, 0.15][index];
  const wax = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.74 });
  const waxDark = new THREE.MeshStandardMaterial({ color: 0xb7a78e, roughness: 0.8 });
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc56a, toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff5a18,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    toneMapped: false,
  });

  const candle = new THREE.Group();
  candle.position.set(x, 0, z);
  candle.rotation.y = index * 0.9;
  candle.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.05;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, height, 8), wax);
  body.position.y = height / 2;
  const melt = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), waxDark);
  melt.scale.set(0.75, 1.35, 0.75);
  melt.position.set(0.02, height * 0.62, 0);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.018, 8), waxDark);
  lip.position.y = height - 0.006;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.022, 4), wickMat);
  wick.position.y = height + 0.012;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), flameMat);
  flame.scale.set(0.65, 1.45, 0.65);
  const flameBase = height + 0.032;
  flame.position.y = flameBase;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glowMat);
  glow.position.y = flameBase;
  const light = new THREE.PointLight(0xff9340, 4.2, 2.1, 2);
  light.position.y = height + 0.05;
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 8),
    new THREE.MeshStandardMaterial({ color: 0x6d5b46, roughness: 0.92 }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.047;

  candle.add(body, melt, lip, wick, flame, glow, light, puddle);
  group.add(candle);
  return { flame, glow, light, phase: index * 1.3, flameBase };
}

function summoningCircleTexture(meshRadius) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = seeded(3107);
  const cx = size / 2;
  const cy = size / 2;
  const ppm = (size / 2) / meshRadius;
  const ring = LAYOUT.ritual.ring * ppm;

  const strokeRing = (radius, width, color, amp) => {
    ctx.beginPath();
    const steps = 220;
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      const wobble = Math.sin(t * 5 + 0.4) * amp + Math.sin(t * 11 + 1.7) * amp * 0.45;
      const r = radius + wobble;
      const x = cx + Math.cos(t) * r;
      const y = cy + Math.sin(t) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokeRing(ring * 1.12, 26, 'rgba(90, 0, 8, 0.28)', 2.4);
  strokeRing(ring * 1.12, 5, 'rgba(196, 28, 32, 0.75)', 2.2);
  strokeRing(ring, 34, 'rgba(110, 6, 10, 0.38)', 2.8);
  strokeRing(ring, 14, 'rgba(196, 22, 28, 0.96)', 2.6);
  strokeRing(ring, 4, 'rgba(255, 92, 84, 0.9)', 2.4);

  const inner = ring * 0.382;
  strokeRing(inner, 16, 'rgba(120, 8, 12, 0.4)', 1.4);
  strokeRing(inner, 6, 'rgba(210, 30, 34, 0.92)', 1.3);
  strokeRing(inner, 2, 'rgba(255, 120, 110, 0.75)', 1.2);

  const points = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5);
    points.push([cx + Math.cos(angle) * ring, cy + Math.sin(angle) * ring]);
  }

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i <= 5; i += 1) {
    const point = points[(i * 2) % 5];
    ctx.lineTo(point[0], point[1]);
  }
  ctx.fillStyle = 'rgba(70, 0, 6, 0.28)';
  ctx.fill('evenodd');

  const chalkLine = (a, b, width, color) => {
    ctx.beginPath();
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 2.4;
      const y = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * 2.4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  for (let i = 0; i < 5; i += 1) {
    const a = points[i];
    const b = points[(i + 2) % 5];
    chalkLine(a, b, 18, 'rgba(120, 8, 12, 0.35)');
    chalkLine(a, b, 9, 'rgba(188, 18, 24, 0.96)');
    chalkLine(a, b, 2.6, 'rgba(255, 86, 78, 0.88)');
  }

  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2 / 5);
    drawRitualGlyph(
      ctx,
      cx + Math.cos(angle) * ring * 1.06,
      cy + Math.sin(angle) * ring * 1.06,
      angle,
      i,
    );
  }

  ctx.fillStyle = 'rgba(176, 16, 22, 0.8)';
  for (let i = 0; i < 46; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = ring * (0.92 + rand() * 0.22);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1 + rand() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawRitualGlyph(ctx, x, y, angle, kind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.strokeStyle = 'rgba(214, 36, 40, 0.92)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 11);
  } else if (kind === 1) {
    for (const dx of [-8, 0, 8]) {
      ctx.moveTo(dx, -10);
      ctx.lineTo(dx, 10);
    }
  } else if (kind === 2) {
    ctx.moveTo(-10, 6);
    ctx.lineTo(0, -8);
    ctx.lineTo(10, 6);
  } else if (kind === 3) {
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
  } else {
    ctx.moveTo(-8, -8);
    ctx.bezierCurveTo(8, -8, -8, 8, 8, 8);
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- 第 4 关 */

/**
 * 木偶关节。球关节能撑住姿势，但身体必须落在脚上：
 * 两只鞋底同时着地，重心在两脚之间。髋不往侧边踢，身体不绕脚底转，
 * 否则髋球会离开腿，或者整个人悬空。
 * 不冲刺时停在一副姿势上，直到下一次瞬移才换成下一副。
 * 冲刺是原地换步：支撑腿伸直踩地，另一条腿屈膝前摆，手臂随步摆动。
 * 面向玩家时局部 +Z 朝前。rotation.x > 0 把下垂的肢体拨向身后，头的 rotation.x > 0 是低头。
 * 肩和髋单轴不超过 ±0.8，关节球才不会转出坑。头、肘、腕、膝可以再弯一些。
 */
const PUPPET_KEYS = [
  'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR',
  'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR',
  'head', 'body',
];
const PUPPET_LIMIT = {
  legL: 0.8, legR: 0.8, armL: 0.8, armR: 0.8, body: 0.04, head: 1.05,
  shinL: 1.35, shinR: 1.35, footL: 0.85, footR: 0.85,
  foreL: 1.45, foreR: 1.45, handL: 1.2, handR: 1.2,
};
const PUPPET_HOLDS = ['cock', 'slack', 'reach', 'bow', 'cockRight', 'reachRight', 'twitch', 'freeze'];

function makePuppetPose() {
  const pose = {};
  for (const key of PUPPET_KEYS) pose[key] = [0, 0, 0];
  return pose;
}

function zeroPuppetPose(pose) {
  for (const key of PUPPET_KEYS) {
    const row = pose[key];
    row[0] = 0;
    row[1] = 0;
    row[2] = 0;
  }
}

function setPuppet(pose, key, x, y, z) {
  const row = pose[key];
  row[0] = x;
  row[1] = y;
  row[2] = z;
}

function clampPuppet(value, limit) {
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
}

function applyPuppetPose(limbs, pose) {
  for (const key of PUPPET_KEYS) {
    const node = limbs[key];
    if (!node) continue;
    const row = pose[key];
    const limit = PUPPET_LIMIT[key];
    node.rotation.set(
      clampPuppet(row[0], limit),
      clampPuppet(row[1], limit),
      clampPuppet(row[2], limit),
    );
  }
}

/**
 * 静止姿势。返回值是整个人要下降的高度，用来把抬起的鞋底重新踩回地面。
 * 双脚站立时膝只向前弯，两条腿保持平行。单脚姿势把一条腿抬向外侧，另一只脚踩实。
 * 肘弯在前臂的 z 上，从正面能看见小臂垂下来。脚的 x 把鞋底转平。
 */
function sampleHeld(id, pose) {
  zeroPuppetPose(pose);
  if (id === 'cock') {
    setPuppet(pose, 'armL', 0, 0, -0.72);
    setPuppet(pose, 'foreL', -0.2, 0, 1.4);
    setPuppet(pose, 'handL', 0.55, 0.45, 0.7);
    setPuppet(pose, 'armR', 0, 0, 0.4);
    setPuppet(pose, 'foreR', -0.15, 0, -0.85);
    setPuppet(pose, 'handR', -0.45, -0.35, -0.55);
    setPuppet(pose, 'head', 0.2, -0.6, 1.02);
    return 0;
  }
  if (id === 'slack') {
    setPuppet(pose, 'legL', -0.68, 0, 0);
    setPuppet(pose, 'legR', -0.68, 0, 0);
    setPuppet(pose, 'shinL', 1.22, 0, 0);
    setPuppet(pose, 'shinR', 1.22, 0, 0);
    setPuppet(pose, 'footL', -0.54, 0, 0);
    setPuppet(pose, 'footR', -0.54, 0, 0);
    setPuppet(pose, 'armL', 0, 0, -0.38);
    setPuppet(pose, 'armR', 0, 0, 0.34);
    setPuppet(pose, 'foreL', -0.15, 0, 1.4);
    setPuppet(pose, 'foreR', -0.15, 0, -1.35);
    setPuppet(pose, 'handL', 0.7, 0.4, 0.65);
    setPuppet(pose, 'handR', -0.55, -0.35, -0.6);
    setPuppet(pose, 'head', 0.9, 0.4, 0.6);
    return 0.154;
  }
  if (id === 'reach') {
    setPuppet(pose, 'legL', 0, 0, -0.78);
    setPuppet(pose, 'shinL', 0, 0, 1.28);
    setPuppet(pose, 'footL', 0, 0, -0.52);
    setPuppet(pose, 'armL', 0, 0, -0.78);
    setPuppet(pose, 'foreL', -0.1, 0, 0.75);
    setPuppet(pose, 'handL', 0.4, 0.3, 0.45);
    setPuppet(pose, 'armR', 0, 0, 0.22);
    setPuppet(pose, 'foreR', -0.15, 0, -1.4);
    setPuppet(pose, 'handR', 0.35, -0.4, -0.5);
    setPuppet(pose, 'head', 0.25, 0.5, 0.9);
    return 0;
  }
  if (id === 'bow') {
    setPuppet(pose, 'legL', -0.78, 0, 0);
    setPuppet(pose, 'legR', -0.78, 0, 0);
    setPuppet(pose, 'shinL', 1.35, 0, 0);
    setPuppet(pose, 'shinR', 1.35, 0, 0);
    setPuppet(pose, 'footL', -0.57, 0, 0);
    setPuppet(pose, 'footR', -0.57, 0, 0);
    setPuppet(pose, 'armL', 0, 0, -0.22);
    setPuppet(pose, 'armR', 0, 0, 0.2);
    setPuppet(pose, 'foreL', -0.12, 0, 1.42);
    setPuppet(pose, 'foreR', -0.12, 0, -1.38);
    setPuppet(pose, 'handL', 0.65, 0.35, 0.55);
    setPuppet(pose, 'handR', -0.5, -0.3, -0.5);
    setPuppet(pose, 'head', 1.02, 0.2, 0.4);
    return 0.189;
  }
  if (id === 'cockRight') {
    setPuppet(pose, 'armL', 0, 0, -0.28);
    setPuppet(pose, 'foreL', -0.12, 0, 0.55);
    setPuppet(pose, 'handL', 0.3, 0.2, 0.25);
    setPuppet(pose, 'armR', 0, 0, 0.72);
    setPuppet(pose, 'foreR', -0.2, 0, -1.4);
    setPuppet(pose, 'handR', -0.55, -0.45, -0.7);
    setPuppet(pose, 'head', 0.2, 0.6, -1.02);
    return 0;
  }
  if (id === 'reachRight') {
    setPuppet(pose, 'legR', 0, 0, 0.78);
    setPuppet(pose, 'shinR', 0, 0, -1.28);
    setPuppet(pose, 'footR', 0, 0, 0.52);
    setPuppet(pose, 'armR', 0, 0, 0.78);
    setPuppet(pose, 'foreR', -0.1, 0, -0.75);
    setPuppet(pose, 'handR', 0.4, -0.3, -0.45);
    setPuppet(pose, 'armL', 0, 0, -0.22);
    setPuppet(pose, 'foreL', -0.15, 0, 1.4);
    setPuppet(pose, 'handL', 0.35, 0.4, 0.5);
    setPuppet(pose, 'head', 0.25, -0.5, -0.9);
    return 0;
  }
  if (id === 'twitch') {
    setPuppet(pose, 'legL', 0, 0, -0.72);
    setPuppet(pose, 'shinL', 0, 0, 1.2);
    setPuppet(pose, 'footL', 0, 0, -0.48);
    setPuppet(pose, 'armL', 0, 0, -0.75);
    setPuppet(pose, 'foreL', -0.12, 0, 1.42);
    setPuppet(pose, 'handL', 0.5, 0.2, 0.55);
    setPuppet(pose, 'armR', 0.62, 0, 0.18);
    setPuppet(pose, 'foreR', -0.1, 0, -0.3);
    setPuppet(pose, 'handR', -0.3, 0.4, -0.4);
    setPuppet(pose, 'head', -0.5, 0.65, -1.0);
    return 0;
  }
  if (id === 'freeze') {
    setPuppet(pose, 'armL', 0, 0, -0.78);
    setPuppet(pose, 'armR', 0, 0, 0.78);
    setPuppet(pose, 'foreL', -0.1, 0, 1.15);
    setPuppet(pose, 'foreR', -0.1, 0, -1.15);
    setPuppet(pose, 'handL', 0.45, 0.35, 0.5);
    setPuppet(pose, 'handR', -0.4, -0.3, -0.5);
    setPuppet(pose, 'head', 0.25, -0.45, 0.98);
    return 0;
  }
  setPuppet(pose, 'head', 0.2, 0, 0.45);
  return 0;
}

function sampleCharge(phase, pose) {
  zeroPuppetPose(pose);
  const liftL = Math.max(0, Math.sin(phase));
  const liftR = Math.max(0, Math.sin(phase + Math.PI));
  const arm = Math.sin(phase - 0.7);
  setPuppet(pose, 'legL', -liftL * 0.72, 0, 0);
  setPuppet(pose, 'legR', -liftR * 0.72, 0, 0);
  setPuppet(pose, 'shinL', liftL * 1.1, 0, 0);
  setPuppet(pose, 'shinR', liftR * 1.1, 0, 0);
  setPuppet(pose, 'footL', liftL * 0.42, 0, 0);
  setPuppet(pose, 'footR', liftR * 0.42, 0, 0);
  setPuppet(pose, 'armL', -0.12 + arm * 0.55, 0, 0.28);
  setPuppet(pose, 'armR', -0.12 - arm * 0.55, 0, -0.28);
  setPuppet(pose, 'foreL', -0.22, 0, 0.55 + Math.max(0, -arm) * 0.7);
  setPuppet(pose, 'foreR', -0.22, 0, -(0.55 + Math.max(0, arm) * 0.7));
  setPuppet(pose, 'handL', 0.55, 0, Math.sin(phase) * 0.4);
  setPuppet(pose, 'handR', 0.5, 0, -Math.sin(phase) * 0.38);
  setPuppet(pose, 'head', 0.15 + Math.abs(Math.sin(phase)) * 0.22, 0, Math.sin(phase) * 0.48);
}

/**
 * 红色人偶瞬移惊吓异常。外形用 assets/models/puppet_v03.glb（木人偶），
 * 脚底在本地 Y=0。瞬移和冲刺的时机不变。
 * - 每 4 次灯灭触发一次瞬移
 * - 第 3/6/9… 次瞬移为"冲刺贴脸"：从玩家视野前方约 2m 处以 3.4m/s 冲向玩家面前急停
 * - 不冲刺时姿势不动。每次瞬移到新位置才换下一副静止姿势
 * - 冲刺时支撑脚踩地，另一条腿屈膝前摆，停下后停在这次换好的姿势上
 * - 躯干不跟着玩家转。只有头在脖子限度内转向玩家
 */
function createRedDoll() {
  const EYE_H = 1.62;
  const groundY = 0;
  const group = new THREE.Group();
  const limbs = {
    legL: null, legR: null, shinL: null, shinR: null, footL: null, footR: null,
    armL: null, armR: null, foreL: null, foreR: null, handL: null, handR: null,
    head: null, body: null,
  };
  const pose = makePuppetPose();

  const whenReady = loadCharacter('/assets/models/puppet_v03.glb').then((bound) => {
    if (group.userData.disposed) {
      disposeCharacter(bound);
      return;
    }
    group.add(bound.root);
    limbs.legL = bound.legs[0] ?? null;
    limbs.legR = bound.legs[1] ?? null;
    limbs.shinL = bound.shins[0] ?? null;
    limbs.shinR = bound.shins[1] ?? null;
    limbs.footL = bound.feet[0] ?? null;
    limbs.footR = bound.feet[1] ?? null;
    limbs.armL = bound.arms[0] ?? null;
    limbs.armR = bound.arms[1] ?? null;
    limbs.foreL = bound.forearms[0] ?? null;
    limbs.foreR = bound.forearms[1] ?? null;
    limbs.handL = bound.hands[0] ?? null;
    limbs.handR = bound.hands[1] ?? null;
    limbs.head = bound.head ?? null;
    limbs.body = bound.body ?? null;
    document.body.dataset.puppetModel = 'glb';
  }).catch((error) => {
    console.warn('木偶 GLB 加载失败，第 4 关人偶没有模型。', error);
    document.body.dataset.puppetModel = 'fallback';
  });

  tagAnomaly(group, 4, 'doll');

  // ── 预定义安全角落位置 ──
  const CORNERS = [
    { x: 0, z: -5.4 },
    { x: -9.4, z: 2.5 },
    { x: 9.4, z: -5.4 },
    { x: -9.4, z: -4.5 },
    { x: 5.0, z: 5.4 },
  ];

  // ── 状态 ──
  let flickerCount = 0;
  let lastFlicker = false;
  let teleportPhase = 0;          // 瞬移阶段，%3==2 为冲刺贴脸
  let cornerIndex = 0;
  let firstFlicker = true;

  // 冲刺状态
  let charging = false;           // 是否正在冲刺中
  let chargeFromX = 0;
  let chargeFromZ = 0;
  let chargeTargetX = 0;
  let chargeTargetZ = 0;
  let chargeProgress = 0;         // 0..1 归一化进度
  let chargeMaxDist = 0;          // 总距离
  const CHARGE_SPEED = 3.4;       // m/s 冲刺速度
  const LAUNCH_DIST = 1.8;        // 出现距离玩家多远

  // 每次瞬移换一副静止姿势，不冲刺时就停在这一副上
  let holdI = -1;

  function woodClick(env) {
    const audio = env.audio;
    if (!audio?.burst || !group.visible) return;
    const dist = Math.hypot((env.playerX ?? 0) - group.position.x, (env.playerZ ?? 0) - group.position.z);
    const gain = 0.09 * Math.max(0, 1 - dist / 8);
    if (gain < 0.015) return;
    try {
      audio.burst({ duration: 0.025, gain, type: 'highpass', freq: 2200, q: 0.9 });
      audio.tone(210, 0.035, gain * 0.4, 'triangle');
    } catch (e) { /* 音效出错不影响动作 */ }
  }

  function advanceHold(env) {
    holdI = (holdI + 1) % PUPPET_HOLDS.length;
    woodClick(env);
  }

  // 躯干朝房间里，不跟着玩家转。
  function faceIntoRoom(x, z) {
    group.rotation.y = Math.atan2(-x, -z);
  }

  // 头的局部 +Z 是脸。只改 yaw，点头和侧倾留在当前姿势上。
  function lookHead(px, pz) {
    const head = limbs.head;
    if (!head || !group.visible) return;
    let yaw = Math.atan2(px - group.position.x, pz - group.position.z) - group.rotation.y;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const limit = PUPPET_LIMIT.head;
    head.rotation.y = clampPuppet(yaw, limit);
  }

  function poseStanding() {
    if (!group.visible || holdI < 0) {
      zeroPuppetPose(pose);
      applyPuppetPose(limbs, pose);
      group.position.y = groundY;
      group.userData.puppetAct = 'hidden';
      return;
    }
    const id = PUPPET_HOLDS[holdI];
    const drop = sampleHeld(id, pose);
    applyPuppetPose(limbs, pose);
    group.position.y = groundY - drop;
    group.userData.puppetAct = id;
  }

  group.visible = false;
  group.scale.setScalar(1.0);
  group.position.set(CORNERS[0].x, groundY, CORNERS[0].z);
  group.rotation.y = 0;

  return {
    level: 4,
    id: 'doll',
    group,
    whenReady,
    stand: { x: -1, z: 2.5 },
    aimY: EYE_H,
    update(dt, env) {
      const px = env.playerX ?? 0;
      const pz = env.playerZ ?? 0;
      const audio = env.audio;

      // ===== 1. 冲刺动画播放（每帧执行，优先级最高） =====
      if (charging) {
        const step = CHARGE_SPEED * dt;
        const remaining = chargeMaxDist * (1 - chargeProgress);
        if (step >= remaining) {
          // 到达目标（玩家脸前）
          group.position.set(chargeTargetX, groundY, chargeTargetZ);
          charging = false;
          chargeProgress = 1;
        } else {
          chargeProgress += step / chargeMaxDist;
          const t = chargeProgress;
          // 缓入缓出：前快后慢，在到达时平滑停止
          const easedT = t < 0.7 ? t / 0.7 * 0.85 : 0.85 + (t - 0.7) / 0.3 * 0.15;
          const cx = chargeFromX + (chargeTargetX - chargeFromX) * easedT;
          const cz = chargeFromZ + (chargeTargetZ - chargeFromZ) * easedT;
          group.position.set(cx, groundY, cz);
          const stride = chargeProgress * Math.max(chargeMaxDist, 0.4) * 8;
          sampleCharge(stride, pose);
          applyPuppetPose(limbs, pose);
          group.position.y = groundY;
          lookHead(px, pz);
          group.userData.puppetAct = 'charge';
          return;
        }
      }

      // ===== 2. 灯灭上升沿检测 =====
      const flickerRise = env.flickerDark && !lastFlicker;
      lastFlicker = env.flickerDark;

      if (flickerRise) {
        flickerCount++;

        if (firstFlicker) {
          firstFlicker = false;
          group.visible = true;
          cornerIndex = 0;
          group.position.set(CORNERS[cornerIndex].x, groundY, CORNERS[cornerIndex].z);
          faceIntoRoom(CORNERS[cornerIndex].x, CORNERS[cornerIndex].z);
          advanceHold(env);
        }

        // 每 4 次灯灭触发一次瞬移
        if (flickerCount % 4 === 0) {
          const isClosePhase = teleportPhase % 3 === 2;
          // 第5关禁用冲刺，只做角落瞬移
          const inLevel5 = (env.levelIndex ?? 0) === 5;

          if (isClosePhase && !inLevel5) {
            // ── 冲刺贴脸（基于玩家视角方向） ──
            let launchX = px;
            let launchZ = pz;
            let faceX = px;
            let faceZ = pz;
            let foundClose = false;

            // 获取玩家视角朝向的 yaw 角度（弧度）
            const playerYaw = env.playerYaw ?? 0;

            const FINAL_DISTANCES = [0.55, 0.65, 0.75, 0.85, 1.0, 1.2, 1.5];
            // 以玩家视角方向为中心，小角度偏移，确保正面冲来
            const angleOffsets = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2];
            for (const dist of FINAL_DISTANCES) {
              for (const aOff of angleOffsets) {
                const angle = playerYaw - aOff;
                const nx = px + -Math.sin(angle) * dist;
                const nz = pz + -Math.cos(angle) * dist;

                if (nx < LAYOUT.room.minX + 0.3 || nx > LAYOUT.room.maxX - 0.3) continue;
                if (nz < LAYOUT.room.minZ + 0.3 || nz > LAYOUT.room.maxZ - 0.3) continue;

                let blocked = false;
                const desks = LAYOUT.desks;
                for (const x0 of desks.towardBoard) {
                  for (const z0 of desks.across) {
                    const dx = nx - x0;
                    const dz = nz - z0;
                    const halfDesk = Math.max(desks.topW, desks.topD) * 0.55;
                    if (Math.abs(dx) < halfDesk && Math.abs(dz) < halfDesk) { blocked = true; break; }
                  }
                  if (blocked) break;
                }
                if (!blocked) {
                  const dx = nx - 8.2;
                  const dz = nz - 0;
                  if (Math.abs(dx) < 0.4 && Math.abs(dz) < 0.9) blocked = true;
                }
                if (!blocked) {
                  faceX = nx;
                  faceZ = nz;
                  // 发射位置：沿 player → face 方向向外延伸 LAUNCH_DIST 米
                  const dirFromPlayerX = faceX - px;
                  const dirFromPlayerZ = faceZ - pz;
                  const distToFace = Math.hypot(dirFromPlayerX, dirFromPlayerZ);
                  if (distToFace > 0.01) {
                    const norm = LAUNCH_DIST / distToFace;
                    launchX = px + dirFromPlayerX * norm;
                    launchZ = pz + dirFromPlayerZ * norm;
                  } else {
                    launchX = px;
                    launchZ = pz - LAUNCH_DIST;
                  }
                  // 确保发射位置在教室范围内
                  launchX = Math.max(LAYOUT.room.minX + 0.3, Math.min(LAYOUT.room.maxX - 0.3, launchX));
                  launchZ = Math.max(LAYOUT.room.minZ + 0.3, Math.min(LAYOUT.room.maxZ - 0.3, launchZ));

                  foundClose = true;
                  break;
                }
              }
              if (foundClose) break;
            }

            if (!foundClose) {
              // 兜底：角落
              cornerIndex = (cornerIndex + 1) % CORNERS.length;
              group.position.set(CORNERS[cornerIndex].x, groundY, CORNERS[cornerIndex].z);
              faceIntoRoom(CORNERS[cornerIndex].x, CORNERS[cornerIndex].z);
              advanceHold(env);
            } else {
              // 开始冲刺
              group.position.set(launchX, groundY, launchZ);
              group.rotation.y = Math.atan2(faceX - launchX, faceZ - launchZ);
              group.visible = true;
              charging = true;
              chargeFromX = launchX;
              chargeFromZ = launchZ;
              chargeTargetX = faceX;
              chargeTargetZ = faceZ;
              chargeProgress = 0;
              chargeMaxDist = Math.hypot(faceX - launchX, faceZ - launchZ);
              advanceHold(env);

              // 突脸音效：只在第四关小人真正冲过来的这一刻响一次
              // （第五关已在上面的 inLevel5 分支禁用了冲刺，这里再显式判一次关卡）
              if (audio && (env.levelIndex ?? 0) === 4) {
                let played = false;
                if (typeof audio.playScare === 'function') {
                  try {
                    played = audio.playScare() !== false;
                  } catch (e) { played = false; }
                }
                if (!played) {
                  try {
                    // 兜底：音效还没解码好时先用原来的合成音顶上，别让突脸没声音
                    audio.burst({ duration: 0.08, gain: 0.15, type: 'highpass', freq: 3000, q: 0.4 });
                    audio.burst({ duration: 0.12, gain: 0.25, type: 'bandpass', freq: 800, q: 0.6, delay: 0.02 });
                    audio.burst({ duration: 0.2, gain: 0.35, type: 'bandpass', freq: 400, q: 0.5, delay: 0.06 });
                    audio.tone(110, 0.35, 0.10, 'sawtooth');
                    audio.tone(55, 0.4, 0.06, 'sine');
                  } catch (e) { /* 音效出错不影响核心逻辑 */ }
                }
              }
            }
          } else {
            // ── 角落瞬移。躯干朝房间里，不跟着玩家转 ──
            cornerIndex = (cornerIndex + 1) % CORNERS.length;
            group.position.set(CORNERS[cornerIndex].x, groundY, CORNERS[cornerIndex].z);
            faceIntoRoom(CORNERS[cornerIndex].x, CORNERS[cornerIndex].z);
            advanceHold(env);
          }

          teleportPhase++;
        }
      }

      // ===== 3. 提线动作。刚起步的冲刺只摆出第一步。头单独转向玩家 =====
      if (charging) {
        sampleCharge(0, pose);
        applyPuppetPose(limbs, pose);
        lookHead(px, pz);
        group.userData.puppetAct = 'charge';
        return;
      }
      poseStanding();
      lookHead(px, pz);
    },
  };
}

/* ---------------------------------------------------------------- 第 5 关 */

/**
 * 血肉教室：整个教室被活体器官覆盖的沉浸式场景。
 * 六面墙血肉纹理 + 3D 器官（心脏/肌肉束/血管/肋骨/脂肪/肺叶）+ 天花板裂缝红眼（拍照目标）
 */
function createFleshWall() {
  const group = new THREE.Group();
  const { room, door } = LAYOUT;
  const xMin = room.minX, xMax = room.maxX;
  const zMin = room.minZ, zMax = room.maxZ;
  const yCeil = room.height;

  // ---- 工具函数：带种子的伪随机（确保每帧视觉效果一致） ----
  const seedVal = 20251031;
  let rngState = seedVal;
  function rng() {
    rngState = (rngState * 16807 + 0) % 2147483647;
    return (rngState - 1) / 2147483646;
  }

  // ========== 1. 高品质 CanvasTexture 血肉纹理（512×512） ==========
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;

  // 辅助函数
  function smoothNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const h = (ix * 374761393 + iy * 668265263) & 0x7FFFFFFF;
    const h2 = ((ix + 1) * 374761393 + iy * 668265263) & 0x7FFFFFFF;
    const h3 = (ix * 374761393 + (iy + 1) * 668265263) & 0x7FFFFFFF;
    const h4 = ((ix + 1) * 374761393 + (iy + 1) * 668265263) & 0x7FFFFFFF;
    const r1 = (h ^ (h >> 13)) * 1274126177 & 0x7FFFFFFF;
    const r2 = (h2 ^ (h2 >> 13)) * 1274126177 & 0x7FFFFFFF;
    const r3 = (h3 ^ (h3 >> 13)) * 1274126177 & 0x7FFFFFFF;
    const r4 = (h4 ^ (h4 >> 13)) * 1274126177 & 0x7FFFFFFF;
    const n00 = (r1 & 0x7FFFFFFF) / 0x7FFFFFFF;
    const n10 = (r2 & 0x7FFFFFFF) / 0x7FFFFFFF;
    const n01 = (r3 & 0x7FFFFFFF) / 0x7FFFFFFF;
    const n11 = (r4 & 0x7FFFFFFF) / 0x7FFFFFFF;
    return n00*(1-fx)*(1-fy) + n10*fx*(1-fy) + n01*(1-fx)*fy + n11*fx*fy;
  }

  function fbm(x, y, oct, lac, gain) {
    let v = 0, amp = 0.5, freq = 1;
    for (let k = 0; k < oct; k++) {
      v += amp * smoothNoise(x * freq, y * freq);
      freq *= lac;
      amp *= gain;
    }
    return v;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.round(v)));
  }

  function setPx(x, y, r, g, b) {
    const idx = ((y % H) * W + (x % W)) * 4;
    data[idx] = clamp(r, 0, 255);
    data[idx + 1] = clamp(g, 0, 255);
    data[idx + 2] = clamp(b, 0, 255);
    data[idx + 3] = 255;
  }

  function getPx(x, y) {
    const idx = ((y % H) * W + (x % W)) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }

  // 1a) 基底：肌肉组织底色
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / W * 6, y / H * 6, 3, 2.5, 0.6);
      const r = 45 + Math.round(n * 35);
      const g = 10 + Math.round(n * 15);
      const b = 18 + Math.round(n * 20);
      setPx(x, y, r, g, b);
    }
  }

  // 1b) 横向肌肉纤维
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ny = y / H * 12 + fbm(x / W * 20, y / H * 8, 2, 2, 0.4) * 2;
      let fib = Math.abs(((ny % 1) + 1) % 1 - 0.5) * 2;
      fib = Math.max(0, 1 - fib * 2);
      fib = fib ** 0.3;
      const [cr, cg, cb] = getPx(x, y);
      const bright = Math.round(fib * 20);
      setPx(x, y, cr + bright, cg + Math.round(bright / 3), cb + Math.round(bright / 4));
    }
  }

  // 1c) 主血管网络
  for (let i = 0; i < 25; i++) {
    let vx = rng() * W, vy = rng() * H;
    let angle = rng() * Math.PI * 2;
    const len = 20 + Math.floor(rng() * 40);
    const thick = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < len; j++) {
      angle += (rng() - 0.5) * 0.6;
      vx += Math.cos(angle) * 2;
      vy += Math.sin(angle) * 2;
      for (let tx = -thick; tx <= thick; tx++) {
        for (let ty = -thick; ty <= thick; ty++) {
          const d = Math.sqrt(tx * tx + ty * ty);
          if (d > thick) continue;
          const px = Math.round(vx + tx), py = Math.round(vy + ty);
          const [cr, cg, cb] = getPx(px, py);
          const darkness = 1 - d / thick;
          setPx(px, py,
            cr - Math.round(darkness * 25),
            cg - Math.round(darkness * 8),
            cb - Math.round(darkness * 5),
          );
        }
      }
      // 分支
      if (j > 5 && rng() > 0.8) {
        const ba = angle + (rng() - 0.5) * 3;
        let bx = vx, by = vy;
        for (let k = 0; k < 5 + Math.floor(rng() * 7); k++) {
          bx += Math.cos(ba) * 2;
          by += Math.sin(ba) * 2;
          for (let t = -2; t <= 2; t++) {
            for (let tt = -2; tt <= 2; tt++) {
              const [cr, cg, cb] = getPx(Math.round(bx + t), Math.round(by + tt));
              setPx(Math.round(bx + t), Math.round(by + tt), cr - 8, cg - 3, cb - 2);
            }
          }
        }
      }
    }
  }

  // 1d) 毛细血管
  for (let i = 0; i < 100; i++) {
    let vx = rng() * W, vy = rng() * H;
    let angle = rng() * Math.PI * 2;
    const len = 8 + Math.floor(rng() * 12);
    for (let j = 0; j < len; j++) {
      angle += (rng() - 0.5) * 1.6;
      vx += Math.cos(angle) * 1.5;
      vy += Math.sin(angle) * 1.5;
      const [cr, cg, cb] = getPx(Math.round(vx), Math.round(vy));
      setPx(Math.round(vx), Math.round(vy), cr - 5, cg - 2, cb - 2);
    }
  }

  // 1e) 脂肪淡黄斑点
  for (let i = 0; i < 16; i++) {
    const fx = Math.round(rng() * W), fy = Math.round(rng() * H);
    const rad = 6 + Math.floor(rng() * 14);
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > rad) continue;
        const factor = 1 - d / rad;
        const n = fbm((fx + x) / W * 12, (fy + y) / H * 12, 2, 2, 0.3) * 0.3;
        const [cr, cg, cb] = getPx(fx + x, fy + y);
        setPx(fx + x, fy + y,
          cr + Math.round(factor * (25 + n * 20)),
          cg + Math.round(factor * (30 + n * 25)),
          cb + Math.round(factor * (15 + n * 10)),
        );
      }
    }
  }

  // 1f) 局部瘀伤
  for (let i = 0; i < 8; i++) {
    const sx = Math.round(rng() * W), sy = Math.round(rng() * H);
    const rad = 15 + Math.floor(rng() * 20);
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > rad) continue;
        const factor = (1 - d / rad) ** 0.8;
        const [cr, cg, cb] = getPx(sx + x, sy + y);
        setPx(sx + x, sy + y,
          cr - Math.round(factor * 20),
          cg - Math.round(factor * 10),
          cb - Math.round(factor * 5),
        );
      }
    }
  }

  // 1g) 湿润高光
  for (let i = 0; i < 6; i++) {
    const hx = Math.round(rng() * W), hy = Math.round(rng() * H);
    const rad = 4 + Math.floor(rng() * 6);
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > rad) continue;
        const factor = (1 - d / rad) ** 0.5;
        const [cr, cg, cb] = getPx(hx + x, hy + y);
        setPx(hx + x, hy + y,
          cr + Math.round(factor * 25),
          cg + Math.round(factor * 12),
          cb + Math.round(factor * 6),
        );
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // ---- 纹理增强：顶部加深（对应天花板、墙壁上半更暗） ----
  // 在现有纹理上再做一步局部调整
  const imgData2 = ctx.getImageData(0, 0, W, H);
  const data2 = imgData2.data;
  for (let y = 0; y < H; y++) {
    // y=0 是顶部（对应天花板），y=H 是底部（对应下半墙地板区域）
    const topFactor = 1 - y / H;
    const darken = 0.85 + topFactor * 0.15; // 顶部变暗 15%
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      data2[idx] = Math.round(data2[idx] * darken);
      data2[idx + 1] = Math.round(data2[idx + 1] * (darken * 0.8));
      data2[idx + 2] = Math.round(data2[idx + 2] * (darken * 0.85));
    }
  }
  // 增加高光斑（模拟潮湿反光）
  const seedHL = 20251101;
  let rngHL = seedHL;
  function rngHLFn() {
    rngHL = (rngHL * 16807 + 0) % 2147483647;
    return (rngHL - 1) / 2147483646;
  }
  for (let i = 0; i < 10; i++) {
    const hlx = Math.round(rngHLFn() * W), hly = Math.round(rngHLFn() * H * 0.6);
    const rad = 5 + Math.floor(rngHLFn() * 8);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rad) continue;
        const factor = (1 - d / rad) ** 0.6;
        const idx = ((hly + dy) % H * W + (hlx + dx) % W) * 4;
        data2[idx] = Math.min(255, data2[idx] + Math.round(factor * 30));
        data2[idx + 1] = Math.min(255, data2[idx + 1] + Math.round(factor * 12));
        data2[idx + 2] = Math.min(255, data2[idx + 2] + Math.round(factor * 8));
      }
    }
  }
  ctx.putImageData(imgData2, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4.5);

  // 纹理流动动画状态
  let flowTime = 0;
  // 天花板呼吸偏移量
  let ceilBreath = 0;

  const fleshMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  // 天花板专用材质：clone fleshMat 但纹理 repeat 不同（天花板 20m × 12m）
  const ceilTexture = texture.clone();
  ceilTexture.repeat.set(10, 6);  // 20:12 ≈ 10:6 比例，适合天花板尺寸
  const ceilMat = new THREE.MeshBasicMaterial({
    map: ceilTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -4,
  });


  
  // ========== 2. 四面墙壁与天花板（全部血肉覆盖） ==========
  // 2a) 天花板：单层水平面，旋转烘焙进几何体，
  //     使几何体局部 +Y == 世界竖直方向（update() 的 setY 呼吸波才成立）
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  ceilGeo.rotateX(-Math.PI / 2);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.position.set(0, yCeil - 0.04, (zMin + zMax) / 2);  // 原教室天花板底面在 y=3.20，这里 3.16，留 4cm
  group.add(ceil);

  // 2b) 地板：整片血肉覆盖。
  //     y 必须高于教室自带地板的 0.03（level.js:813 的 roomFloor），
  //     原来放在 0.01 是**压在木地板底下**的 —— 所以玩家一直看到的其实是木地板。
  //     染色也从近黑 0x1a080a 改成不提色（白色 = 与墙面同一份血肉），
  //     想让地板比墙暗一档，把下一行的注释打开即可。
  const floorMat = fleshMat.clone();
  // floorMat.color.setHex(0xb49a92);   // 想暗一档就打开这行
  const floorGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0.04, (zMin + zMax) / 2);
  group.add(floor);

  // 门参数
  const doorHalf = door.half;
  const doorH = door.height;

  // 四面墙尺寸
  const totalW = xMax - xMin;   // 前/后墙宽 = 20m
  const sideW = zMax - zMin;   // 左/右墙宽 = 12m
  const halfZ = (zMin + zMax) / 2;

  // 门这块墙是几块平面拼起来的。若共用 fleshMat 会有两个毛病：
  //   1) "门上方"原来取整墙宽 20m，跟左右两块共面重叠 → 逐像素打架，贴图闪变；
  //   2) 共用同一个 repeat(6,4.5)，尺寸不同的块贴图密度差一个数量级 → 被拉糊、
  //      而且纵向压缩后 mipmap 一糊，看起来"不流动"。
  // 所以每块单独 clone 一份纹理，按前墙的密度（横 0.3 次/米、纵 1.40625 次/米）
  // 设 repeat，接缝处纹理才连续、流动速度也一致。
  const doorTextures = [];
  function fleshMatFor(w, h) {
    const tex = texture.clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.3 * w, 1.40625 * h);
    doorTextures.push(tex);
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  }

  // ---- 后墙：必须给窗户留洞，否则整排窗会被血肉从内侧糊死 ----
  // 窗位必须和 level.js 的 addWindowRun 严格对齐，否则会露出实墙或切到窗框。
  // 常量抄自 level.js:868-873 与 DOOR_FRAME（jambW = 0.12）。
  const WIN = { count: 3, w: 1.9, sill: 0.95, top: 2.28, jamb: 0.12 };
  function windowGaps() {
    const outer = doorHalf + WIN.jamb;
    const gaps = [];
    const runs = [[xMin, -outer], [outer, xMax]];
    for (const [x0, x1] of runs) {
      const pier = ((x1 - x0) - WIN.count * WIN.w) / (WIN.count + 1);
      for (let i = 0; i < WIN.count; i += 1) {
        const xa = x0 + (i + 1) * pier + i * WIN.w;
        gaps.push([xa, xa + WIN.w]);
      }
    }
    return gaps;
  }

  function buildBackWall() {
    // 13 块分片共用一份纹理：repeat 设成 1，UV 按世界坐标烘进几何体
    // （横向 0.3 次/米、纵向 1.40625 次/米，与前墙同密度）。
    // 这样只多一张纹理、图案跨缝连续、流动也只需要动一份 offset。
    const backTex = texture.clone();
    backTex.needsUpdate = true;
    backTex.repeat.set(1, 1);
    backTex.wrapS = THREE.RepeatWrapping;
    backTex.wrapT = THREE.RepeatWrapping;
    const backMat = new THREE.MeshBasicMaterial({ map: backTex, side: THREE.DoubleSide });
    doorTextures.push(backTex);

    const U = 0.3;
    const V = 1.40625;
    const zBack = zMax - 0.01;

    function panel(xa, xb, ya, yb) {
      const w = xb - xa;
      const h = yb - ya;
      if (w < 1e-4 || h < 1e-4) return;
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      const u0 = U * xa;
      const u1 = U * xb;
      const v0 = V * ya;
      const v1 = V * yb;
      // PlaneGeometry 的 uv 顺序：(0,1) (1,1) (0,0) (1,0)
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      uv.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, backMat);
      mesh.position.set((xa + xb) / 2, (ya + yb) / 2, zBack);
      group.add(mesh);
    }

    // 按 y 切 4 条横带，每条带内按 x 扣掉该带的缺口
    const gaps = windowGaps();
    const doorGap = [[-doorHalf, doorHalf]];
    const bands = [
      [0, WIN.sill, doorGap],
      [WIN.sill, WIN.top, doorGap.concat(gaps)],
      [WIN.top, doorH, doorGap],
      [doorH, yCeil, []],
    ];
    for (const [ya, yb, bandGaps] of bands) {
      if (yb - ya < 1e-4) continue;
      const sorted = bandGaps.slice().sort((p, q) => p[0] - q[0]);
      let cursor = xMin;
      for (const [g0, g1] of sorted) {
        if (g0 > cursor + 1e-6) panel(cursor, g0, ya, yb);
        if (g1 > cursor) cursor = g1;
      }
      if (xMax > cursor + 1e-6) panel(cursor, xMax, ya, yb);
    }
  }

  // 2c) 四面墙壁：全部血肉覆盖
  for (const wall of [
    { w: totalW, x: 0, z: zMin + 0.01, ry: Math.PI },           // 前墙（zMin）
    { w: sideW, x: xMin + 0.01, z: halfZ, ry: Math.PI / 2 },    // 左墙
    { w: sideW, x: xMax - 0.01, z: halfZ, ry: -Math.PI / 2 },   // 右墙
  ]) {
    const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(wall.w, yCeil), fleshMat);
    wallMesh.position.set(wall.x, yCeil / 2, wall.z);
    wallMesh.rotation.y = wall.ry;
    group.add(wallMesh);
  }
  // 后墙（zMax）—— 避开门，并且必须给 6 扇窗留洞（否则从走廊看进去是一块血肉板）
  buildBackWall();

  // ---- 垂直向下流淌的血液（随机分布在整个天花板下，贴墙处密度增大） ----
  const dripMatRed = new THREE.MeshBasicMaterial({
    color: 0x8a0c10,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const darkDripMat = new THREE.MeshBasicMaterial({
    color: 0x3a0508,
    transparent: true,
    side: THREE.DoubleSide,
  });

  /**
   * 在教室天花板下随机生成垂直血条。
   * 密度在 x 和 z 两个方向上通过权重函数控制，越靠近墙壁密度越大。
   * 每个血条用两个交叉的 PlaneGeometry 形成十字，确保从任意角度可见。
   */
  function addRandomDrips(count, xMin_, xMax_, zMin_, zMax_) {
    const halfLenX = (xMax_ - xMin_) / 2;
    const halfLenZ = (zMax_ - zMin_) / 2;
    const midX = (xMin_ + xMax_) / 2;
    const midZ = (zMin_ + zMax_) / 2;

    for (let i = 0; i < count; i++) {
      // 使用权重函数让随机位置倾向于靠近墙壁：
      // 在 [0,1] 区间，偏 0 或偏 1 的概率增大
      const ux = rng() ** 0.5;
      const signX = rng() > 0.5 ? 1 : -1;
      const tx = signX * ux * halfLenX;
      const x = midX + tx;

      const uz = rng() ** 0.5;
      const signZ = rng() > 0.5 ? 1 : -1;
      const tz = signZ * uz * halfLenZ;
      const z = midZ + tz;

      // 避开门口的通道（后墙门附近）
      if (x > -0.9 && x < 0.9 && z > zMax - 1.5) continue;
      // 裂缝正前方不挂血条：这些亮红细条会横在裂口前面，把 L 形转角切成
      // 看起来不连贯的几段（实测 x≈±1.6、z≈-5.8 那几条正好压在裂口上）。
      if (Math.abs(x) < 3.5 && z < -2.4) continue;

      const stripH = 0.6 + rng() * 2.2;
      const stripW = 0.012 + rng() * 0.04;
      const yTop = yCeil - 0.06 - rng() * 0.3;
      const yPos = yTop - stripH / 2;
      const opacity = 0.15 + rng() * 0.35;
      const rotY = rng() * Math.PI; // 随机朝向

      // 十字交叉的两个平面
      const geo = new THREE.PlaneGeometry(stripW, stripH);
      const m1 = new THREE.Mesh(geo, dripMatRed.clone());
      m1.position.set(x, yPos, z);
      m1.rotation.y = rotY;
      m1.material.opacity = opacity;
      group.add(m1);

      const m2 = new THREE.Mesh(geo, dripMatRed.clone());
      m2.position.set(x, yPos, z);
      m2.rotation.y = rotY + Math.PI / 2;
      m2.material.opacity = opacity * 0.7;
      group.add(m2);

      // 末端变淡延伸
      if (rng() > 0.5 && stripH > 1.0) {
        const extH = 0.15 + rng() * 0.4;
        const extW = stripW * (0.3 + rng() * 0.5);
        const extGeo = new THREE.PlaneGeometry(extW, extH);
        const ey = yPos - stripH / 2 - extH / 2;
        const e1 = new THREE.Mesh(extGeo, dripMatRed.clone());
        e1.position.set(x + (rng() - 0.5) * 0.03, ey, z);
        e1.rotation.y = rotY;
        e1.material.opacity = opacity * 0.4;
        group.add(e1);
        const e2 = new THREE.Mesh(extGeo, dripMatRed.clone());
        e2.position.set(x + (rng() - 0.5) * 0.03, ey, z);
        e2.rotation.y = rotY + Math.PI / 2;
        e2.material.opacity = opacity * 0.3;
        group.add(e2);
      }
    }

    // 天花板附近的暗红色宽短血渍
    const stainCount = Math.floor(count * 0.3);
    for (let i = 0; i < stainCount; i++) {
      const ux = rng() ** 0.5;
      const signX = rng() > 0.5 ? 1 : -1;
      const x = midX + signX * ux * halfLenX;
      const uz = rng() ** 0.5;
      const signZ = rng() > 0.5 ? 1 : -1;
      const z = midZ + signZ * uz * halfLenZ;
      if (x > -0.9 && x < 0.9 && z > zMax - 1.5) continue;
      // 裂缝正前方不挂血条：这些亮红细条会横在裂口前面，把 L 形转角切成
      // 看起来不连贯的几段（实测 x≈±1.6、z≈-5.8 那几条正好压在裂口上）。
      if (Math.abs(x) < 3.5 && z < -2.4) continue;

      const stainH = 0.02 + rng() * 0.08;
      const stainW = 0.04 + rng() * 0.1;
      const yPos = yCeil - 0.09 - rng() * 0.35;
      const sRotY = rng() * Math.PI;
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(stainW, stainH), darkDripMat.clone());
      s1.position.set(x, yPos, z);
      s1.rotation.y = sRotY;
      s1.material.opacity = 0.3 + rng() * 0.3;
      group.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(stainW * 0.5, stainH * 0.5), darkDripMat.clone());
      s2.position.set(x, yPos, z);
      s2.rotation.y = sRotY + Math.PI / 2;
      s2.material.opacity = 0.2 + rng() * 0.2;
      group.add(s2);
    }
  }
  // 生成约 300 条随机血条（密度在贴墙处自然增大）
  addRandomDrips(300, xMin, xMax, zMin, zMax);

  // 裂缝里那套眼睛的引用。IIFE 内部建好之后挂到这里，
  // 外层的 update() / onPhoto() 才能驱动待机动画和拍后淡出。
  let eyeRig = null;
  // 眼睛、巨脸、牙、裂缝翻边四个 glb 的加载 Promise；level.js 用它触发一次着色器预编译。
  let eyesModelReady = null;
  let faceModelReady = null;
  let teethModelReady = null;
  let crackDecorReady = null;

  // ---- L 形裂缝本体 + 触手封边（重写版） --------------------------------
  // 上一版有三个硬伤，这里逐条解决：
  //  1) 裂缝看不见：旧的多边形裂缝与前墙共面（都在 zMin+0.01），被墙挡住或闪面。
  //     现在裂缝条带放在墙面前方 7cm，天花板那条放在天花板下方 7cm，一定在遮盖面之前。
  //  2) 蓝绿偏色：所有颜色只动红通道，G/B 恒 <= 8；并关掉雾（fog:false），
  //     避免暗红被雾色 0x07080c 洗成灰蓝。
  //  3) 边缘太规整：裂缝外圈做成暗血红"翻肉"，再由触手从边缘向外生长盖住边界，
  //     没有一条清晰的轮廓线。
  (function addCrackAndTentacles() {
    const RNG = seeded(20251102);

    // ---- 几何锚点 -------------------------------------------------------
    const WALL_FACE_Z = zMin + 0.01;       // 前墙血肉面所在 z
    const CEIL_FACE_Y = yCeil - 0.04;      // 天花板血肉面所在 y
    const CRACK_Z = WALL_FACE_Z + 0.07;    // 裂缝贴在前墙前方（相机在 +z 一侧）
    const CRACK_Y = CEIL_FACE_Y - 0.07;    // 裂缝贴在天花板下方（相机在下方）

    // ---- 颜色工具：只动红通道，杜绝蓝绿 --------------------------------
    function fleshHex(rMin, rMax) {
      const r = rMin + Math.floor(RNG() * Math.max(1, rMax - rMin));
      const gb = Math.floor(RNG() * 9);    // 0~8，肉眼分辨不出，但保住"血肉"层次
      return (Math.min(255, r) << 16) | (gb << 8) | gb;
    }
    function flatMat(hex) {
      return new THREE.MeshBasicMaterial({
        color: hex,
        side: THREE.DoubleSide,
        fog: false,          // 关键：不让雾把暗红洗成灰蓝
        depthWrite: true,    // 不透明，不需要排序，杜绝半透明混合异常
      });
    }
    // 带顶点色的版本：管状物靠"沿长度明暗渐变"造出体积感，
    // 否则纯 BasicMaterial 的管子看起来只是一块扁红片。
    function flatMatVC(hex) {
      return new THREE.MeshBasicMaterial({
        color: hex,
        side: THREE.DoubleSide,
        fog: false,
        depthWrite: true,
        vertexColors: true,
      });
    }

    // ---- 条带几何：两条等长边界线之间逐段拼四边形 ----------------------
    // 不用扇形三角化，任意不规则形状都不会自交出错。
    function ribbonGeometry(left, right) {
      const pos = [];
      const idx = [];
      const n = Math.min(left.length, right.length);
      for (let i = 0; i < n; i++) {
        pos.push(left[i][0], left[i][1], left[i][2]);
        pos.push(right[i][0], right[i][1], right[i][2]);
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      return geo;
    }

    // 程序化翻边 / 触手 / 肉芽都挂在这个 group 里。crack_decor_v01.glb 载入
    // 成功后整组换掉；深渊（throat）、背板、天花板封口、脸/眼/牙不在里面。
    const crackDecorRoot = new THREE.Group();
    crackDecorRoot.name = 'crack-decor-procedural';
    group.add(crackDecorRoot);

    // 把条带按半宽系数放大，并朝相机方向微移，避免共面闪面
    function addBand(left, right, grow, offZ, offY, mat, parent) {
      const l = [];
      const r = [];
      for (let i = 0; i < left.length; i++) {
        const cx = (left[i][0] + right[i][0]) / 2;
        l.push([cx + (left[i][0] - cx) * grow, left[i][1] + offY, left[i][2] + offZ]);
        r.push([cx + (right[i][0] - cx) * grow, right[i][1] + offY, right[i][2] + offZ]);
      }
      (parent || crackDecorRoot).add(new THREE.Mesh(ribbonGeometry(l, r), mat));
    }

    // 环形条带：只画 [gIn, gOut] 这一圈，中间留空。
    // 裂缝的三层带必须改成环形，否则实心带会把中心糊住，
    // 后面想"镶进去"的脸和眼睛就全被挡在带子后面了。
    function addRing(left, right, gIn, gOut, offZ, offY, mat) {
      const lOuter = [];
      const lInner = [];
      const rInner = [];
      const rOuter = [];
      for (let i = 0; i < left.length; i++) {
        const cx = (left[i][0] + right[i][0]) / 2;
        const dz = left[i][2] + offZ;
        const dy = left[i][1] + offY;
        // 左半边（cx 左侧）
        lOuter.push([cx + (left[i][0] - cx) * gOut, dy, dz]);
        lInner.push([cx + (left[i][0] - cx) * gIn, dy, dz]);
        // 右半边（cx 右侧）
        rInner.push([cx + (right[i][0] - cx) * gIn, dy, dz]);
        rOuter.push([cx + (right[i][0] - cx) * gOut, dy, dz]);
      }
      crackDecorRoot.add(new THREE.Mesh(ribbonGeometry(lOuter, lInner), mat));
      crackDecorRoot.add(new THREE.Mesh(ribbonGeometry(rInner, rOuter), mat));
    }

    // 把一条边界线按半宽系数缩放（用于生成开口轮廓）
    function scaleEdge(edge, other, g) {
      return edge.map((p, i) => {
        const cx = (edge[i][0] + other[i][0]) / 2;
        return [cx + (p[0] - cx) * g, p[1], p[2]];
      });
    }

    // ---- 前墙那条臂：从地板一直裂到天花板转角 --------------------------
    const wallSteps = 18;
    const wallY0 = 0.0;                            // 下界延伸到地板
    const wallY1 = CEIL_FACE_Y - 0.03;             // 停在天花板下方，不被天花板盖住
    const wallLeftEdge = [];
    const wallRightEdge = [];
    for (let i = 0; i <= wallSteps; i += 1) {
      const t = i / wallSteps;
      const y = wallY0 + (wallY1 - wallY0) * t;
      // 中心线轻微左右游走，避免一条直线
      const cx = Math.sin(t * 5.1 + 1.1) * 0.14 + (RNG() - 0.5) * 0.08;
      // 半宽：中段最宽，但两端不收死——转角处要和天花板那条接上，不留腰缩
      const taper = Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.65 + 0.35;
      const halfW = (0.52 + 0.84 * taper) * (1 + (RNG() - 0.5) * 0.4);
      wallLeftEdge.push([cx - halfW, y, CRACK_Z]);
      wallRightEdge.push([cx + halfW, y, CRACK_Z]);
    }

    // ---- 天花板那条臂：从转角往教室内延伸 ------------------------------
    const ceilSteps = 16;
    const ceilZ0 = WALL_FACE_Z + 0.05;
    const ceilZ1 = WALL_FACE_Z + 2.60;
    const ceilLeftEdge = [];
    const ceilRightEdge = [];
    for (let i = 0; i <= ceilSteps; i += 1) {
      const t = i / ceilSteps;
      const z = ceilZ0 + (ceilZ1 - ceilZ0) * t;
      const cx = Math.sin(t * 4.3 + 0.4) * 0.13 + (RNG() - 0.5) * 0.08;
      const taper = Math.sin(Math.pow(t, 0.8) * Math.PI) * 0.55 + 0.45;
      // 末端 16% 收到 0：裂缝在教室内侧收成一个尖，再交给触手盖住
      const endTaper = Math.min(1, (1 - t) / 0.16);
      const halfW = (0.44 + 0.68 * taper) * endTaper * (1 + (RNG() - 0.5) * 0.4);
      ceilLeftEdge.push([cx - halfW, CRACK_Y, z]);
      ceilRightEdge.push([cx + halfW, CRACK_Y, z]);
    }

    // ---- 裂缝本体：三层条带，越靠中心越黑 ------------------------------
    // 外圈是血泡翻边，中圈深红，内核近黑，看上去就是被撕开的口子。
    const matMargin = flatMat(0x3c0709);
    const matBody = flatMat(0x140102);
    const matCore = flatMat(0x020000);
    // 三层改「环形」：外轮廓不变，但中心留出真开口（内边界 0.30 半宽），
    // 深渊、脸、眼睛才能镶进去而不是贴在表面。
    // 前墙臂（朝相机 = +z）
    addRing(wallLeftEdge, wallRightEdge, 1.05, 1.85, 0.000, 0, matMargin);
    addRing(wallLeftEdge, wallRightEdge, 0.65, 1.05, 0.014, 0, matBody);
    addRing(wallLeftEdge, wallRightEdge, 0.34, 0.65, 0.028, 0, matCore);
    // 天花板臂（朝相机 = -y）
    addRing(ceilLeftEdge, ceilRightEdge, 1.05, 1.85, 0, -0.000, matMargin);
    addRing(ceilLeftEdge, ceilRightEdge, 0.65, 1.05, 0, -0.014, matBody);
    addRing(ceilLeftEdge, ceilRightEdge, 0.34, 0.65, 0, -0.028, matCore);

    // 转角补片：把前墙臂顶端和天花板臂近端直接连起来，避免 L 形在拐角处裂开
    const wEndL = wallLeftEdge[wallLeftEdge.length - 1];
    const wEndR = wallRightEdge[wallRightEdge.length - 1];
    const cEndL = ceilLeftEdge[0];
    const cEndR = ceilRightEdge[0];
    addBand([wEndL, cEndL], [wEndR, cEndR], 1.85, 0.000, 0, matMargin);
    addBand([wEndL, cEndL], [wEndR, cEndR], 1.05, 0.014, 0, matBody);
    addBand([wEndL, cEndL], [wEndR, cEndR], 0.55, 0.028, 0, matCore);

    // ---- 深渊：把竖直臂的开口沿 z 挤出 9cm 做真凹槽 --------------------
    // 前壁就是 core 环所在的开口平面（CRACK_Z + 0.028），退到 -5.982，
    // 正好用满前墙那 8cm 厚度，不突出墙面。
    const AP = 0.34;                                    // 开口半宽系数（与 core 环内边界一致）
    const Z_THROAT_FRONT = CRACK_Z + 0.028;
    const Z_THROAT_BACK = -5.982;
    const apWallL = scaleEdge(wallLeftEdge, wallRightEdge, AP)
      .map((p) => [p[0], p[1], Z_THROAT_FRONT]);
    const apWallR = scaleEdge(wallRightEdge, wallLeftEdge, AP)
      .map((p) => [p[0], p[1], Z_THROAT_FRONT]);
    const apWallLBack = apWallL.map((p) => [p[0], p[1], Z_THROAT_BACK]);
    const apWallRBack = apWallR.map((p) => [p[0], p[1], Z_THROAT_BACK]);

    // 洞壁用顶点色做纵深衰减：靠开口一端略亮、往深处趋于全黑。
    // 一整片同色的槽看起来是块灰板，只有明暗梯度才读得出"这是个往里去的洞"。
    // ribbonGeometry 的顶点是 (front, back) 交替排列，所以偶数顶点是前端。
    function depthRamp(geo) {
      const cnt = geo.attributes.position.count;
      const col = new Float32Array(cnt * 3);
      for (let v = 0; v < cnt; v += 1) {
        const k = v % 2 === 0 ? 1.0 : 0.10;
        col[v * 3] = k;
        col[v * 3 + 1] = k;
        col[v * 3 + 2] = k;
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return geo;
    }
    const matThroat = flatMatVC(0x180608);
    group.add(new THREE.Mesh(depthRamp(ribbonGeometry(apWallL, apWallLBack)), matThroat));
    group.add(new THREE.Mesh(depthRamp(ribbonGeometry(apWallR, apWallRBack)), matThroat));
    // 背板：挡住凹槽后面的血肉墙，让最深处是纯黑
    group.add(new THREE.Mesh(ribbonGeometry(apWallLBack, apWallRBack), flatMat(0x010000)));

    // 天花板那条臂不挖深渊（眼睛在竖直段），用一条填实的暗带把开口封住，
    // 否则透过开口会看到后面的天花板血肉。
    addBand(ceilLeftEdge, ceilRightEdge, AP, 0, -0.028, matCore, group);

    // ---- 触手：从裂缝边缘向外生长，把边界盖住 --------------------------
    function growTentacle(start, dir, len, radius, mat) {
      // 直角交汇区（|x|<0.95 且 y>=3.0 且 z<=-5.5）不放触手：亮红细管横在这儿
      // 会把本该连续的黑裂口切断，看起来就像"几条小血管把转角切成几段"。
      // 转角本身的接缝交给补片条带。
      if (Math.abs(start[0]) < 0.95 && start[1] >= 3.0 && start[2] <= -5.5) return;
      const pts = [new THREE.Vector3(start[0], start[1], start[2])];
      const segs = 3 + Math.floor(RNG() * 3);      // 3~5 段
      let px = start[0];
      let py = start[1];
      let pz = start[2];
      let dx = dir[0];
      let dy = dir[1];
      let dz = dir[2];
      for (let s = 1; s <= segs; s += 1) {
        dx += (RNG() - 0.5) * 0.85;
        dy += (RNG() - 0.5) * 0.60;
        dz += (RNG() - 0.5) * 0.45 + 0.20;         // 略微朝教室内立起来
        const m = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const step = len / segs;
        px += (dx / m) * step;
        py += (dy / m) * step;
        pz += (dz / m) * step;
        // 夹紧在房间内，避免钻到墙里或穿出天花板
        px = Math.min(xMax - 0.25, Math.max(xMin + 0.25, px));
        py = Math.min(CEIL_FACE_Y - 0.06, Math.max(0.05, py));
        pz = Math.max(WALL_FACE_Z + 0.02, pz);
        pts.push(new THREE.Vector3(px, py, pz));
      }
      const TS = 5;
      const RS = 4;
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, TS, radius, RS, false);
      // 沿长度加一条明暗渐变：根部暗、尖端亮，管子才有立体感
      const cnt = geo.attributes.position.count;
      const vcol = new Float32Array(cnt * 3);
      for (let v = 0; v < cnt; v += 1) {
        const seg = Math.floor(v / (RS + 1));
        const k = 0.30 + 0.95 * (seg / TS);
        vcol[v * 3] = k;
        vcol[v * 3 + 1] = k;
        vcol[v * 3 + 2] = k;
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
      crackDecorRoot.add(new THREE.Mesh(geo, mat));
    }

    // 材质池：复用，避免每根触手一个材质。
    // 颜色必须比血肉墙底（约 RGB 58,20,26）明显更亮，否则 10 米外完全糊在墙上。
    const tentMats = [];
    for (let i = 0; i < 6; i += 1) tentMats.push(flatMatVC(fleshHex(0x6a, 0xa8)));
    const pickTentMat = () => tentMats[Math.floor(RNG() * tentMats.length)];

    // 前墙臂：左右两侧各撒一批。半径 3~8cm 才够在玩家站位处成像素。
    for (let i = 1; i < wallSteps; i += 1) {
      if (RNG() < 0.72) {
        growTentacle(
          wallLeftEdge[i], [-1, (RNG() - 0.5) * 0.9, 0.45],
          0.20 + RNG() * 0.42, 0.030 + RNG() * 0.050, pickTentMat(),
        );
      }
      if (RNG() < 0.72) {
        growTentacle(
          wallRightEdge[i], [1, (RNG() - 0.5) * 0.9, 0.45],
          0.20 + RNG() * 0.42, 0.030 + RNG() * 0.050, pickTentMat(),
        );
      }
    }
    // 天花板臂：两侧各撒一批（朝下生长，别穿进天花板）
    for (let i = 1; i < ceilSteps; i += 1) {
      if (RNG() < 0.62) {
        growTentacle(
          ceilLeftEdge[i], [-1, -0.55, 0.25],
          0.16 + RNG() * 0.34, 0.022 + RNG() * 0.026, pickTentMat(),
        );
      }
      if (RNG() < 0.62) {
        growTentacle(
          ceilRightEdge[i], [1, -0.55, 0.25],
          0.16 + RNG() * 0.34, 0.022 + RNG() * 0.026, pickTentMat(),
        );
      }
    }
    // 转角接缝不再补"竖直向上"的触手：那会在直角中心堆出一撮亮红疙瘩，
    // 反而把连续的黑裂口切断。接缝交给下方的转角补片条带 + 后面贴天花板铺开的须。

    // ---- 两端过渡：别让裂缝在上下界被"切一刀" --------------------------
    // 下界（y=0 贴地板）：沿底边撒一圈，一半往地板里钻成铺开的根须，
    // 一半沿墙根向左右两侧铺开，把裂缝口和地面血肉缝起来。
    for (let k = 0; k <= 13; k += 1) {
      const s = k / 13;
      const L0 = wallLeftEdge[0];
      const R0 = wallRightEdge[0];
      const sx = L0[0] + (R0[0] - L0[0]) * s;
      growTentacle(
        [sx, 0.06 + RNG() * 0.05, CRACK_Z],
        RNG() < 0.5
          ? [(RNG() - 0.5) * 0.7, -0.75, 0.85]                           // 往地板里钻
          : [(s < 0.5 ? -1 : 1) * 0.95, -0.30, 0.50],                     // 沿墙根铺开
        0.30 + RNG() * 0.50,
        0.038 + RNG() * 0.045,
        pickTentMat(),
      );
    }
    // 上界（转角，y≈CRACK_Y）：再补一圈贴着天花板铺开的须，
    // 让竖缝顶端不是硬边，而是化进天花板血肉里。
    for (let k = 0; k <= 6; k += 1) {
      const s = k / 6;
      const LT = wallLeftEdge[wallSteps];
      const RT = wallRightEdge[wallSteps];
      const sx = LT[0] + (RT[0] - LT[0]) * s;
      growTentacle(
        [sx, CRACK_Y + 0.015, CRACK_Z - 0.01],
        [(RNG() - 0.5) * 1.1, 0.55, 0.60],
        0.20 + RNG() * 0.34,
        0.028 + RNG() * 0.030,
        pickTentMat(),
      );
    }
    // 天花板臂末端（z≈-3.39）：往教室内侧再铺一层，别在头顶断头
    for (let k = 0; k <= 10; k += 1) {
      const s = k / 10;
      const LE = ceilLeftEdge[ceilSteps];
      const RE = ceilRightEdge[ceilSteps];
      const sx = LE[0] + (RE[0] - LE[0]) * s;
      growTentacle(
        [sx, CRACK_Y - 0.010, LE[2] - 0.02],
        [(RNG() - 0.5) * 1.1, -0.40, 1.00],
        0.26 + RNG() * 0.44,
        0.030 + RNG() * 0.036,
        pickTentMat(),
      );
    }

    // ---- 沿边缘的肉芽：小、贴边，不散布到整面墙 ------------------------
    const bumpMat = flatMat(0x5e0a0c);
    for (let i = 0; i < 14; i += 1) {
      let bx;
      let by;
      let bz;
      if (i % 3 !== 0) {
        const k = 1 + Math.floor(RNG() * (wallSteps - 1));
        const side = RNG() > 0.5 ? wallLeftEdge[k] : wallRightEdge[k];
        bx = side[0] + (RNG() - 0.5) * 0.04;
        by = side[1];
        bz = CRACK_Z + 0.02;
      } else {
        const k = 1 + Math.floor(RNG() * (ceilSteps - 1));
        const side = RNG() > 0.5 ? ceilLeftEdge[k] : ceilRightEdge[k];
        bx = side[0] + (RNG() - 0.5) * 0.04;
        by = CRACK_Y - 0.015;
        bz = side[2];
      }
      const rad = 0.022 + RNG() * 0.038;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(rad, 7, 5), bumpMat);
      bump.position.set(bx, by, bz);
      crackDecorRoot.add(bump);
    }

    // ---- 建模稿：L 形三层翻边 + 触手 + 肉芽 --------------------------------
    // crack_decor_v01.glb 的原点在 L 形转角 = 世界 (0, 3.09, -5.92)，
    // 墙臂沿 -Y（Blender）/ 世界向下，天花板臂伸进房间；整件放在这里不旋转。
    // 载入成功就换掉上面那一整组程序化翻边/触手/肉芽；深渊、背板、
    // 天花板封口、脸、眼睛、牙都不动。失败保留程序化版本。
    crackDecorReady = loadCharacter('/assets/models/crack_decor_v01.glb').then((bound) => {
      if (group.userData.disposed) {
        disposeCharacter(bound);
        return;
      }
      const model = bound.root;
      model.position.set(0, CRACK_Y, CRACK_Z);
      const glbMaterials = new Set();
      const glbTextures = new Set();
      model.traverse((node) => {
        if (!node.isMesh) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          if (!material) continue;
          glbMaterials.add(material);
          if (material.map) glbTextures.add(material.map);
        }
      });
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
        // 顶点色 + 细节贴图就是最终颜色（暗红到近黑），别让 ACES 再压一遍
        toneMapped: false,
        map: glbTextures.values().next().value ?? null,
      });
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.material = mat;
      });
      for (const material of glbMaterials) material.dispose();
      for (const child of [...crackDecorRoot.children]) {
        crackDecorRoot.remove(child);
        if (child.geometry) child.geometry.dispose();
      }
      group.remove(crackDecorRoot);
      group.add(model);
      if (document.body) document.body.dataset.crackDecor = 'glb';
    }).catch((error) => {
      console.warn('裂缝翻边 GLB 加载失败，保留程序化翻边。', error);
      if (document.body) document.body.dataset.crackDecor = 'fallback';
    });

    // ============ 裂缝深处：黑色巨脸 + 两只红色发光眼 ============
    // 全部塞在开口后面那 9cm 凹槽里，最靠前的点不超过 FACE_FRONT(-5.941)；
    // 眼睛前极 -5.894，仍比开口平面(-5.892)靠里，不凸出墙面。
    const EYE_Y = 2.42;
    // 半径比原来 +50%（0.058 → 0.087）。为了不凸出开口，球心相应后退到 -5.981，
    // 这样前极 = -5.894，仍在开口平面(-5.892)之后。
    const EYE_R = 0.087;
    const EYE_Z = -5.981;
    const EYE_DX = 0.19;
    const FACE_FRONT = -5.941;

    // 裂缝的中心线在眼睛高度上**不在 x=0**：墙臂那条
    // `cx = sin(t*5.1+1.1)*0.14 + 抖动` 把它推到了约 -0.14。
    // 眼睛若照 x=0 摆，右眼外缘(+0.25)会顶到开口右缘(约 +0.22)被洞壁切掉。
    // 所以先取该高度处真正的中心线，整张脸 + 两眼都跟着它走。
    function centerXAt(y) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < wallLeftEdge.length; i += 1) {
        const d = Math.abs(wallLeftEdge[i][1] - y);
        if (d < bestD) { bestD = d; best = i; }
      }
      return (wallLeftEdge[best][0] + wallRightEdge[best][0]) / 2;
    }
    const EYE_CX = centerXAt(EYE_Y);

    const innerRoot = new THREE.Group();
    innerRoot.position.x = EYE_CX;
    group.add(innerRoot);

    // 脸单独一层：可以整体做极缓慢的前后"呼吸"，不会带着眼睛一起动
    const faceRoot = new THREE.Group();
    innerRoot.add(faceRoot);

    // ---- 黑色巨脸：极暗的几块板，只暗示"后面有个大东西" ----
    // 用顶点色做"自上而下"的明暗：顶面略亮、底面更黑。
    // 这样不靠灯光也能读出眉弓/鼻梁/颧骨的结构，同时整体仍然是近黑。
    function faceShade(geo, bottomK, topK) {
      const pos = geo.attributes.position;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const span = maxY - minY;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 1) {
        const t = span > 1e-6 ? (pos.getY(i) - minY) / span : 0.5;
        const k = bottomK + (topK - bottomK) * t;
        col[i * 3] = k;
        col[i * 3 + 1] = k;
        col[i * 3 + 2] = k;
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return geo;
    }
    const faceMat = flatMatVC(0x050303);
    const faceHi = flatMatVC(0x0a0808);
    function faceBox(w, h, d, x, y, frontZ, mat) {
      const geo = faceShade(new THREE.BoxGeometry(w, h, d), 0.30, 1.35);
      const m = new THREE.Mesh(geo, mat || faceMat);
      m.position.set(x, y, frontZ - d / 2);
      faceRoot.add(m);
      return m;
    }
    // 主板（底）：比开口宽，被洞壁裁掉两侧 → 读作"一张大脸贴在洞后"
    faceBox(1.15, 1.62, 0.020, 0, 2.42, -5.958);
    // 颅顶
    faceBox(1.00, 0.30, 0.020, 0, 2.95, -5.958);
    // 眉弓（左右）：下沿 2.5175，要压在眼球顶(2.507)之上
    faceBox(0.34, 0.085, 0.017, -0.20, 2.56, FACE_FRONT);
    faceBox(0.34, 0.085, 0.017, 0.20, 2.56, FACE_FRONT);
    // 鼻梁：x 只有 ±0.055，离眼睛(内缘 0.103)还远
    faceBox(0.11, 0.44, 0.014, 0, 2.33, -5.943);
    // 颧骨：往外下方挪（原 2.30/±0.33 会压到眼球下外侧）
    faceBox(0.26, 0.15, 0.014, -0.36, 2.24, -5.945);
    faceBox(0.26, 0.15, 0.014, 0.36, 2.24, -5.945);
    // 下颌：加宽到 0.95，让那条咧嘴正好落在颌骨上
    faceBox(0.95, 0.20, 0.018, 0, 1.92, -5.956);

    // 建模稿 assets/models/face_v01.glb：原点在脸心，正面朝 +Z，
    // 1.15 × 1.7 × 0.04 m。放到 (0, 2.45, -5.9635)，最前面落在 z=-5.945，
    // 仍在开口后面。faceRoot 只负责前后呼吸，不要把基准 z 写在它身上。
    // 材质改成不吃光、不进雾的顶点色，否则近黑会被 ACES 和雾洗没。
    const proceduralFace = faceRoot.children.slice();
    faceModelReady = loadCharacter('/assets/models/face_v01.glb').then((bound) => {
      if (group.userData.disposed) {
        disposeCharacter(bound);
        return;
      }
      const model = bound.root;
      model.position.set(0, 2.45, -5.9635);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0d0809,
        vertexColors: true,
        toneMapped: false,
        fog: false,
      });
      const glbMaterials = new Set();
      model.traverse((node) => {
        if (!node.isMesh) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          if (material) glbMaterials.add(material);
        }
        node.material = mat;
      });
      for (const material of glbMaterials) material.dispose();
      for (const mesh of proceduralFace) {
        faceRoot.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
      }
      faceMat.dispose();
      faceHi.dispose();
      faceRoot.add(model);
      if (document.body) document.body.dataset.faceModel = 'glb';
    }).catch((error) => {
      console.warn('黑色巨脸 GLB 加载失败，保留程序化脸。', error);
      if (document.body) document.body.dataset.faceModel = 'fallback';
    });

    // ---- 眼睛 ----
    const eyesRoot = new THREE.Group();
    eyesRoot.position.set(0, EYE_Y, EYE_Z);
    innerRoot.add(eyesRoot);

    const eyeBase = new THREE.Color(0xff2030);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: eyeBase.clone(),
      toneMapped: false,      // 不加这句，ACES 会把红压成灰
    });
    const eyeGeo = new THREE.SphereGeometry(EYE_R, 16, 12);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-EYE_DX, 0, 0);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(EYE_DX, 0, 0);
    eyesRoot.add(eyeL, eyeR);

    // 建模稿 assets/models/eyes_v01.glb：两只独立的球，各自以球心为原点，
    // 直径 0.174 m、中心距 0.38 m，正好对上这里的 EYE_R / EYE_DX。
    // 载入成功就换掉程序化球；失败保留现在的球，拍照判定不受影响。
    // 材质统一用 eyeMat：glb 自带的是自发光 StandardMaterial，ACES 会把红压灰，
    // 而且拍后淡出改的就是 eyeMat.color。
    eyesModelReady = loadCharacter('/assets/models/eyes_v01.glb').then((bound) => {
      if (group.userData.disposed) {
        disposeCharacter(bound);
        return;
      }
      const model = bound.root;
      const meshes = [];
      const glbMaterials = new Set();
      model.traverse((node) => {
        if (!node.isMesh) return;
        meshes.push(node);
        if (node.material) glbMaterials.add(node.material);
      });
      if (meshes.length !== 2) {
        console.warn('eyes_v01.glb 应该正好两只眼睛，实际 ' + meshes.length + ' 个网格，保留程序化球。');
        disposeCharacter(bound);
        return;
      }
      for (const material of glbMaterials) material.dispose();
      for (const mesh of meshes) mesh.material = eyeMat;
      eyesRoot.remove(eyeL, eyeR);
      eyeGeo.dispose();
      eyesRoot.add(model);
      if (document.body) document.body.dataset.eyesModel = 'glb';
    }).catch((error) => {
      console.warn('眼睛 GLB 加载失败，保留程序化球。', error);
      if (document.body) document.body.dataset.eyesModel = 'fallback';
    });

    // 光晕：加性混合、不写深度，只往周围染红，不产生几何轮廓
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff2434,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const haloGeo = new THREE.SphereGeometry(EYE_R * 1.9, 12, 10);
    const haloL = new THREE.Mesh(haloGeo, haloMat);
    haloL.position.copy(eyeL.position);
    const haloR = new THREE.Mesh(haloGeo, haloMat);
    haloR.position.copy(eyeR.position);
    eyesRoot.add(haloL, haloR);

    // 红色点光。注意：裂缝与整面血肉墙都是 MeshBasicMaterial（不吃光），
    // 所以这盏灯真正照亮的是教室的课桌/地板，让屋里也染上红光。
    const eyeLight = new THREE.PointLight(0xff2233, 1.2, 3.2, 2);
    eyeLight.position.set(0, 0, 0.03);
    eyesRoot.add(eyeLight);

    // ============ 咧嘴笑：横在眼睛下方的一排牙 ============
    // 上一版把牙排在眼睛左右（竖着的一张"口"），看起来像伤口上长的刺。
    // 这一版改成横在眼睛下面的咧嘴：两排牙分别朝下/朝上，交错咬合，嘴角上扬。
    //
    // 位置约束（实测得出，别随手改）：
    //  · 笑口最高处在嘴角：y = 1.94 + 0.20 = 2.14，上排牙根再 +0.115 → 2.255，
    //    而眼球下沿是 2.42 - 0.087 = 2.333，还差 0.078 —— 不会咬到眼睛；
    //  · 裂缝三层环在 z = -5.892 ~ -5.92，牙压在 -5.885 之前，否则会被环挡住；
    //  · 半宽 0.46×0.94 ≈ 0.43，正好卡在 y≈1.94 处开口半宽 0.46 之内 —— 咧满整个洞。
    const teethRoot = new THREE.Group();
    innerRoot.add(teethRoot);
    const toothMat = flatMatVC(0x4a2a20);
    const upVec = new THREE.Vector3(0, 1, 0);

    const GRIN_Y0 = 1.94;        // 笑口中央（最低处）
    const GRIN_LIFT = 0.20;      // 嘴角比中央抬高多少（决定"咧"的程度）
    const GRIN_HALF = 0.46;      // 半宽
    const GRIN_Z = -5.885;
    const grinY = (u) => GRIN_Y0 + GRIN_LIFT * u * u;   // 抛物线：中间低、两边高

    function addTooth(x, yBase, yTip, radius) {
      const base = new THREE.Vector3(x, yBase, GRIN_Z + (RNG() - 0.5) * 0.006);
      const tip = new THREE.Vector3(x * 0.985, yTip, GRIN_Z + 0.014 + (RNG() - 0.5) * 0.006);
      const dir = new THREE.Vector3().subVectors(tip, base);
      const len = dir.length();
      dir.normalize();
      // 复用脸的明暗函数：锥体 apex 在局部 +Y，所以牙尖自然更亮
      const geo = faceShade(new THREE.ConeGeometry(radius, len, 7), 0.75, 2.0);
      const tooth = new THREE.Mesh(geo, toothMat);
      tooth.position.copy(base).addScaledVector(dir, len / 2);
      tooth.quaternion.setFromUnitVectors(upVec, dir);
      teethRoot.add(tooth);
    }

    // 上排：牙根在上、牙尖朝下
    const UPPER_TEETH = 9;
    for (let k = 0; k < UPPER_TEETH; k += 1) {
      const u = -1 + (2 * k) / (UPPER_TEETH - 1);
      const y = grinY(u) + (RNG() - 0.5) * 0.012;
      addTooth(u * GRIN_HALF * 0.94, y + 0.115, y - 0.030, 0.028 + RNG() * 0.012);
    }
    // 下排：牙根在下、牙尖朝上，与上排错开半格形成咬合
    const LOWER_TEETH = 8;
    for (let k = 0; k < LOWER_TEETH; k += 1) {
      const u = -1 + (2 * k + 1) / LOWER_TEETH;
      const y = grinY(u) + (RNG() - 0.5) * 0.012;
      addTooth(u * GRIN_HALF * 0.94, y - 0.125, y + 0.040, 0.026 + RNG() * 0.012);
    }

    // 建模稿 assets/models/teeth_v01.glb：一排 0.90 m 宽的咧嘴牙，
    // 上排 9 颗朝下、下排 8 颗朝上，原点在包围盒中心。
    // 放到 (0, 2.035, -5.900)，最前面 -5.870，和原程序化牙尖一样靠前。
    // 载入成功就换掉这 17 个锥体；失败保留程序化牙。
    teethModelReady = loadCharacter('/assets/models/teeth_v01.glb').then((bound) => {
      if (group.userData.disposed) {
        disposeCharacter(bound);
        return;
      }
      const model = bound.root;
      model.position.set(0, 2.035, -5.900);
      const glbMaterials = new Set();
      model.traverse((node) => {
        if (!node.isMesh) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of list) {
          if (material) glbMaterials.add(material);
        }
        // 和程序化牙同一块材质：颜色、雾和顶点色处理完全一致，
        // 拍后淡出 / 灯灭时也不用再改。
        node.material = toothMat;
      });
      for (const material of glbMaterials) material.dispose();
      for (const tooth of [...teethRoot.children]) {
        teethRoot.remove(tooth);
        if (tooth.geometry) tooth.geometry.dispose();
      }
      teethRoot.add(model);
      if (document.body) document.body.dataset.teethModel = 'glb';
    }).catch((error) => {
      console.warn('咧嘴牙 GLB 加载失败，保留程序化牙。', error);
      if (document.body) document.body.dataset.teethModel = 'fallback';
    });

    // ---- 拍照命中球 ----
    // 整个 group 不再挂 anomalyLevel，只有这个球带标签：
    // 必须瞄到眼睛才算拍到。visible=false 不影响射线
    // （three.js 的 intersect() 只判 layers，不判 visible）。
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 8, 6),
      new THREE.MeshBasicMaterial(),
    );
    hitbox.visible = false;
    hitbox.position.set(EYE_CX, EYE_Y, EYE_Z + 0.05);
    group.add(hitbox);            // 挂在 group 上而不是 eyesRoot，免得被心跳缩放影响
    tagAnomaly(hitbox, 5, 'flesh-eyes');

    // 交出引用给外层的 update() / onPhoto()
    eyeRig = {
      root: eyesRoot,
      face: faceRoot,
      teeth: teethRoot,
      mat: eyeMat,
      base: eyeBase,
      halo: haloMat,
      light: eyeLight,
      cx: EYE_CX,
      z0: EYE_Z,
      fade: 0,
      fadeActive: false,
      breathT: 2.6,      // 进关后 2.6 秒来第一口"呼吸"
    };
  })();

  // ========== 3. 立体血管（TubeGeometry，贴附天花板和上半墙） ==========
  const veins = [];
  const tubeMat1 = new THREE.MeshBasicMaterial({
    color: 0x3a0a0a,
    transparent: true, opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const tubeMat2 = new THREE.MeshBasicMaterial({
    color: 0x4a0a12,
    transparent: true, opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const tubeMat3 = new THREE.MeshBasicMaterial({
    color: 0x2a0510,
    transparent: true, opacity: 0.6,
    side: THREE.DoubleSide,
  });

  const numVeins = 15;
  for (let i = 0; i < numVeins; i++) {
    const surface = Math.floor(rng() * 4); // 0=天花板, 1=前墙上半, 2=左墙上半, 3=右墙上半
    const pts = [];
    const nSegs = 3 + Math.floor(rng() * 4);

    if (surface === 0) {
      let cx = xMin + 1 + rng() * (xMax - xMin - 2);
      let cz = zMin + 1 + rng() * (zMax - zMin - 2);
      // 裂缝占的这一片（x±3.8、z<-2.9）不放血管：否则天花板血管会从裂缝条带里
      // 穿出来，在 L 形直角转角处把裂口切成看起来不连贯的几段。
      if (Math.abs(cx) < 3.8 && cz < -2.9) {
        cx = cx >= 0
          ? Math.min(xMax - 1.5, cx + 4.4)
          : Math.max(xMin + 1.5, cx - 4.4);
        cz = Math.max(0.5, Math.min(zMax - 1.5, cz + 6.0));
      }
      const dir = rng() * Math.PI * 2;
      const len = 1 + rng() * 2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const angle = dir + t * 0.8 + Math.sin(t * Math.PI * 2) * 0.5;
        const rad = t * len;
        pts.push(new THREE.Vector3(
          cx + Math.cos(angle) * rad,
          yCeil - 0.06,                       // 抬到裂缝条带之上：被翻边挡住而不是穿出来
          cz + Math.sin(angle) * rad,
        ));
      }
    } else if (surface === 1) {
      let x0 = xMin + 0.5 + rng() * (xMax - xMin - 1);
      // 前墙血管也避开裂缝正后方，免得从撕裂口的锯齿缝里透出来
      if (Math.abs(x0) < 3.8) {
        x0 = x0 >= 0
          ? Math.min(xMax - 1.2, x0 + 4.4)
          : Math.max(xMin + 1.2, x0 - 4.4);
      }
      const y0 = 0.1 + rng() * (yCeil - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dx = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          x0 + dx,
          Math.max(0, Math.min(yCeil - 0.12, y0 + dy)),
          zMin + 0.05,
        ));
      }
    } else if (surface === 2) {
      const z0 = zMin + 0.5 + rng() * (zMax - zMin - 1);
      const y0 = 0.1 + rng() * (yCeil - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dz = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          xMin + 0.05,
          Math.max(0, Math.min(yCeil - 0.12, y0 + dy)),
          z0 + dz,
        ));
      }
    } else {
      const z0 = zMin + 0.5 + rng() * (zMax - zMin - 1);
      const y0 = 0.1 + rng() * (yCeil - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dz = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          xMax - 0.05,
          Math.max(0, Math.min(yCeil - 0.12, y0 + dy)),
          z0 + dz,
        ));
      }
    }

    if (pts.length < 3) continue;

    const radius = 0.015 + rng() * 0.02;
    const tubeGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts),
      nSegs * 3,
      radius,
      5, false,
    );

    const matChoice = [tubeMat1, tubeMat2, tubeMat3][Math.floor(rng() * 3)];
    const veinGroup = new THREE.Group();
    const veinMesh = new THREE.Mesh(tubeGeo, matChoice);
    veinGroup.add(veinMesh);

    if (rng() > 0.5) {
      const branchStart = 1 + Math.floor(rng() * (nSegs - 2));
      const bStart = pts[branchStart];
      const bDir = rng() * Math.PI * 2;
      const bLen = 0.2 + rng() * 0.4;
      const bPts = [];
      for (let j = 0; j <= 3; j++) {
        const t = j / 3;
        bPts.push(new THREE.Vector3(
          bStart.x + Math.cos(bDir + t * 0.5) * t * bLen,
          bStart.y + Math.sin(bDir * 0.5 + t) * t * bLen * 0.3,
          bStart.z + Math.sin(bDir + t * 0.8) * t * bLen * 0.3,
        ));
      }
      if (bPts.length >= 3) {
        const bGeo = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(bPts),
          3, radius * 0.5, 4, false,
        );
        veinGroup.add(new THREE.Mesh(bGeo, matChoice));
      }
    }

    group.add(veinGroup);
    veins.push({
      group: veinGroup,
      phase: rng() * Math.PI * 2,
      freq: 1 + rng() * 0.5,
      amp: 0.02 + rng() * 0.04,
    });
  }

  // ========== 4. 毛细血管网 ==========
  // 注意：裂缝那一带（x±3.8、z<-2.9）不铺毛细血管。它们是一堆亮红细线段，
  // 正好横在 L 形直角转角那个高度上，会把连续的黑裂口切成看起来不连贯的几段。
  const capPoints = [];
  const capCount = 200;
  for (let i = 0; i < capCount; i++) {
    const sx = xMin + rng() * (xMax - xMin);
    const sz = zMin + rng() * (zMax - zMin);
    const angle = rng() * Math.PI * 2;
    const len = 0.05 + rng() * 0.15;
    const ex = sx + Math.cos(angle) * len;
    const ez = sz + Math.sin(angle) * len;
    if (Math.abs(sx) < 3.8 && sz < -2.9) continue;
    if (Math.abs(ex) < 3.8 && ez < -2.9) continue;
    capPoints.push(sx, yCeil - 0.09, sz);
    capPoints.push(ex, yCeil - 0.09, ez);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPoints, 3));
  const capLines = new THREE.LineSegments(capGeo, new THREE.LineBasicMaterial({
    color: 0x4a0a12, transparent: true, opacity: 0.25,
  }));
  // 毛细血管必须标 noRay：LineSegments 在 three.js 里按"到射线的距离"判命中，
  // 默认阈值 1 米（raycaster.params.Line.threshold）。它铺满整个天花板，
  // 拍照射线会在 0 米处被它挡住 → level.aim() 遇到第一个非 noRay 命中就返回
  // none，整关根本拍不过。
  capLines.userData.noRay = true;
  group.add(capLines);

  // ========== 5. 血雾粒子 ==========
  const mistCount = 80;
  const mistPositions = [];
  const mistPhase = [];
  for (let i = 0; i < mistCount; i++) {
    mistPositions.push(
      xMin + rng() * (xMax - xMin),
      rng() * yCeil,
      zMin + rng() * (zMax - zMin),
    );
    mistPhase.push(rng() * Math.PI * 2);
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(mistPositions, 3));
  const mistMat = new THREE.PointsMaterial({
    color: 0x3a0a12, size: 0.03, transparent: true, opacity: 0.08,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  // 血雾同理：Points 的射线阈值也是 1 米，粒子铺满整个房间，
  // 不标 noRay 的话射线在离相机 0 米处就被吸住，拍照永远判 none。
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.userData.noRay = true;
  group.add(mistPoints);
  const mistMat2 = new THREE.PointsMaterial({
    color: 0x5a1020, size: 0.06, transparent: true, opacity: 0.12,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mistPoints2 = new THREE.Points(mistGeo.clone(), mistMat2);
  mistPoints2.userData.noRay = true;
  group.add(mistPoints2);

  // ========== 标签 ==========
  // 注意：group 本身**不挂** anomalyLevel。拍照目标已经收窄到裂缝里的眼睛
  // （命中球在 addCrackAndTentacles 里单独 tagAnomaly），所以瞄墙面不再算过关。
  group.name = 'anomaly-flesh-wall';

  // ========== 状态变量 ==========
  let photoReactActive = false;
  let photoReactT = 0;

  // ========== 返回对象 ==========
  return {
    level: 5,
    id: 'flesh-wall',
    group,
    whenReady: Promise.all([eyesModelReady, faceModelReady, teethModelReady, crackDecorReady]),
    stand: { x: 0, z: 4.2 },
    // 瞄准点改成眼睛所在的位置（level.js 的 getAnomalyAimPoint 支持完整 xyz）
    // 瞄准点跟着眼睛走（裂缝中心线在眼睛高度上偏左约 0.14，不能写死 x=0）
    aim: { x: eyeRig ? eyeRig.cx : 0, y: 2.42, z: -5.95 },
    aimY: 2.42,
    update(dt, env) {
      const flicker = env.flickerDark ?? false;
      const time = env.time ?? 0;

      // ---- 纹理流动（严格单向，不要再叠加 sin 横向漂移） ----
      flowTime += dt * 0.06;
      texture.offset.y = -flowTime;   // 负号 = 血液向下淌
      texture.offset.x = 0;
      if (ceilTexture) {
        ceilTexture.offset.y = -flowTime * 0.7;
        ceilTexture.offset.x = 0;
      }
      // 门那块墙的各分片有各自的纹理，要同步流动，否则会有一块不动
      for (const tex of doorTextures) {
        tex.offset.y = -flowTime;
        tex.offset.x = 0;
      }

      // ---- 天花板呼吸起伏 ----
      ceilBreath = Math.sin(time * 0.8) * 0.012;
      const cPos = ceil.geometry.attributes.position;
      const halfSizeX = (xMax - xMin) / 2;
      const halfSizeZ = (zMax - zMin) / 2;
      const cOrigZ = (zMin + zMax) / 2;
      for (let i = 0; i < cPos.count; i++) {
        const lx = cPos.getX(i) / halfSizeX;
        const lz = (cPos.getZ(i) - cOrigZ) / halfSizeZ;
        const wave = Math.sin(lx * 2.5 + time * 0.8) * Math.cos(lz * 2.0 + time * 0.6) * 0.006;
        cPos.setY(i, ceilBreath + wave);
      }
      cPos.needsUpdate = true;

      // ---- 血管搏动 ----
      for (const v of veins) {
        const pulse = 1 + Math.sin(time * v.freq + v.phase) * v.amp;
        v.group.scale.set(pulse, 1, pulse);
      }

      // ---- 灯灭时血管变亮 ----
      if (flicker) {
        capLines.material.color.setHSL(0, 1, 0.12);
        capLines.material.opacity = 0.5;
      } else {
        capLines.material.color.setHSL(0, 1, 0.05);
        capLines.material.opacity = 0.3;
      }

      // ---- 血雾漂移 ----
      const pos = mistPoints.geometry.attributes.position;
      for (let i = 0; i < mistCount; i++) {
        let y = pos.getY(i);
        y += Math.sin(time * 0.5 + mistPhase[i]) * 0.003;
        if (y > yCeil) y = 0.1;
        if (y < 0) y = yCeil - 0.1;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;

      // ---- 裂缝里的眼睛：待机心跳/扫视，拍后往深处淡去 ----
      if (eyeRig) {
        if (eyeRig.fadeActive) {
          eyeRig.fade = Math.min(1, eyeRig.fade + dt / 1.6);
        }
        const f = eyeRig.fade;
        if (f > 0) {
          const k = 1 - f;
          eyeRig.mat.color.copy(eyeRig.base).multiplyScalar(k);
          eyeRig.halo.opacity = 0.18 * k;
          eyeRig.light.intensity = 1.2 * k;
          eyeRig.root.scale.setScalar(1 - 0.55 * f);
          eyeRig.root.position.z = eyeRig.z0 - 0.018 * f;   // 往裂缝深处退
          if (f >= 1 && eyeRig.root.visible) eyeRig.root.visible = false;
        } else {
          // 心跳缩放 + 极慢的左右扫视，避免"死盯"的假感
          eyeRig.root.scale.setScalar(1 + 0.06 * Math.sin(time * 2.4));
          eyeRig.root.position.x = Math.sin(time * 0.32) * 0.012;
          eyeRig.halo.opacity = (flicker ? 0.27 : 0.18) + 0.05 * Math.sin(time * 2.3);
          eyeRig.light.intensity = flicker ? 1.7 : 1.2;
        }

        // 尖牙缓慢开合（方案 B）：两排整体各向外扩/收约 ±2cm，周期 6.5 秒；
        // 灯灭时张幅 +50%（呼吸变重）。
        if (eyeRig.teeth) {
          const openAmp = flicker ? 0.052 : 0.035;
          eyeRig.teeth.scale.x = 1 + Math.sin(time * 0.966) * openAmp;
        }

        // 脸极缓慢地前后"呼吸"（±1cm，周期约 7.3 秒）：眼睛不动、脸在靠近。
        // 这是"黑暗里有个大东西在呼吸"最省成本的写法，比加牙更符合"未知"。
        if (eyeRig.face) {
          const amp = flicker ? 0.014 : 0.010;
          eyeRig.face.position.z = Math.sin(time * 0.86) * amp;
        }

        // 低频呼吸声：约每 5 秒一次，越靠近裂口越响（env 里带 audio 与玩家坐标）
        if (env.phase === 'level' && env.levelIndex === 5 && !eyeRig.fadeActive) {
          eyeRig.breathT -= dt;
          if (eyeRig.breathT <= 0) {
            eyeRig.breathT = 5.0 + Math.random() * 1.4;
            const bx = (env.playerX ?? 0) - eyeRig.cx;
            const bz = (env.playerZ ?? 0) - eyeRig.z0;
            const dist = Math.sqrt(bx * bx + bz * bz);
            const k = Math.max(0, Math.min(1, 1 - (dist - 1.5) / 9));
            if (k > 0.02 && env.audio) {
              const g = 0.070 * k;
              env.audio.burst({ duration: 2.9, gain: g, type: 'lowpass', freq: 150, q: 0.5 });
              env.audio.burst({ duration: 2.1, gain: g * 0.55, type: 'bandpass', freq: 330, q: 0.8, delay: 0.3 });
              env.audio.tone(45, 1.7, g * 0.5, 'sine');
            }
          }
        }
      }

      // ---- 拍照后反应 ----
      if (photoReactActive) {
        photoReactT += dt;
        mistMat2.opacity = 0.12 + 0.15 * Math.max(0, 1 - photoReactT * 2);
        if (photoReactT > 2) {
          photoReactActive = false;
          photoReactT = 0;
          mistMat2.opacity = 0.12;
        }
      }
    },
    onPhoto() {
      photoReactActive = true;
      photoReactT = 0;
      // 眼睛开始往裂缝深处淡去（低吼与镜头颤抖在 game.js 的 succeedPhoto 里）
      if (eyeRig) eyeRig.fadeActive = true;
    },
  };
}


/* ------------------------------------------------------- 可拾取的相机模型 */

/** 相机：机身、镜头筒、取景器、闪光灯、背带、快门钮。 */
export function cameraModel(color = 0xd7d1c4) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x3a3328,
    emissiveIntensity: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1014, roughness: 0.15, metalness: 0.7 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 0.3, metalness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.17), bodyMat);
  body.position.y = 0.1;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.12), darkMat);
  grip.position.set(-0.13, 0.095, 0.0);

  const hump = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.10), bodyMat);
  hump.position.set(0.01, 0.19, 0);
  const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10), metalMat);
  shutter.position.set(0.10, 0.183, -0.03);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.11, 16), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.02, 0.105, 0.12);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, 18), metalMat);
  ring.position.set(0.02, 0.105, 0.175);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.048, 18), glassMat);
  lens.position.set(0.02, 0.105, 0.178);

  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.03), metalMat);
  flash.position.set(0.02, 0.175, 0.07);

  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), darkMat);
    strap.position.set(side * 0.145, 0.055, -0.06);
    strap.rotation.z = side * 0.25;
    group.add(strap);
  }

  group.add(body, grip, hump, shutter, barrel, ring, lens, flash);
  return group;
}

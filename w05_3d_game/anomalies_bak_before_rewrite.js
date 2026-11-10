import * as THREE from '../vendor/three.module.js';
import { LAYOUT } from './layout.js';
import { hints, successLines } from './team/p1.js';
import { anomalyFactory } from './team/m2.js';
import { tagAnomaly } from './team/contract.js';

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
    case 3: return createCurtain();
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

/** 布料霉斑贴图：白底加深色溃烂斑，配合布料颜色相乘。 */
function rotTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rand = seeded(4242);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  // 大块的溃烂
  for (let i = 0; i < 9; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 12 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    const dark = 0.10 + rand() * 0.16;
    g.addColorStop(0, `rgba(40,32,28,${dark})`);
    g.addColorStop(0.6, `rgba(58,44,36,${dark * 0.45})`);
    g.addColorStop(1, 'rgba(58,44,36,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 细小霉点
  for (let i = 0; i < 160; i += 1) {
    ctx.fillStyle = `rgba(30,26,22,${0.12 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, 0.6 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 织物经纬
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#000000';
  for (let i = 0; i < 256; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/**
 * 霉斑贴图：软边、多孔，贴在布面上不会像硬圆片。
 */
function moldTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rand = seeded(777);

  ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i += 1) {
    const x = 22 + rand() * 84;
    const y = 22 + rand() * 84;
    const r = 10 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 咬出小洞，边缘不整齐
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.4 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rand() * 128, rand() * 128, 1 + rand() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 窗帘后顶出来的脸。左半边塌陷、眼窝深、嘴角烂开，布面有霉斑和破洞。
 * 局部 +Z 朝向房间（group 转 π），原点贴在窗帘上。
 */
function createCurtain() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.curtainFace.x, LAYOUT.curtainFace.y, LAYOUT.curtainFace.z);

  const cloth = new THREE.MeshStandardMaterial({
    color: 0x7f4440,
    map: rotTexture(THREE),
    roughness: 0.97,
    side: THREE.DoubleSide,
  });
  const clothDark = new THREE.MeshStandardMaterial({
    color: 0x3a181b,
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc9c0a6, roughness: 0.62 });
  const socket = new THREE.MeshBasicMaterial({ color: 0x090405 });
  socket.toneMapped = false;
  const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xd9d3c4 });
  eyeWhite.toneMapped = false;
  const iris = new THREE.MeshBasicMaterial({ color: 0x241013 });
  iris.toneMapped = false;
  const mold = new THREE.MeshBasicMaterial({
    map: moldTexture(THREE),
    color: 0x2b3126,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  // 头和下巴：三块不等大的球叠出不对称轮廓
  const head = addSphere(group, cloth, 0.30, 0, 0, 0, [0.78, 1.04, 0.60]);
  const temple = addSphere(group, cloth, 0.17, -0.15, 0.10, -0.01, [0.94, 1.05, 0.82]);
  const jaw = addSphere(group, cloth, 0.16, 0.13, -0.17, 0.01, [0.88, 1.0, 0.86]);
  head.rotation.z = 0.04;
  temple.rotation.z = -0.12;

  // 眼窝：压在布面上的一圈暗，一边深一边塌
  const socketL = addSphere(group, socket, 0.082, -0.105, 0.085, 0.150, [1, 0.86, 0.32]);
  const socketR = addSphere(group, socket, 0.072, 0.108, 0.045, 0.152, [1, 0.94, 0.32]);
  socketL.rotation.z = 0.2;
  socketR.rotation.z = -0.12;

  // 眼球：左眼半闭，右眼瞪大，瞳孔看向不同方向
  const eyeL = addSphere(group, eyeWhite, 0.034, -0.105, 0.080, 0.172, [1, 0.62, 0.45]);
  const eyeR = addSphere(group, eyeWhite, 0.041, 0.108, 0.044, 0.174, [1, 0.96, 0.45]);
  const pupilL = addSphere(group, iris, 0.016, -0.113, 0.076, 0.190, [1, 0.85, 0.4]);
  const pupilR = addSphere(group, iris, 0.019, 0.116, 0.041, 0.192, [1, 1, 0.4]);
  // 上眼睑压住眼球上缘，别让它瞪成两个白圆
  addBox(group, clothDark, 0.085, 0.016, 0.03, -0.105, 0.105, 0.178, 0.14);
  addBox(group, clothDark, 0.098, 0.018, 0.03, 0.108, 0.072, 0.180, -0.08);

  // 眉骨：两道不等长、不等角度
  const browL = addBox(group, clothDark, 0.115, 0.022, 0.03, -0.108, 0.148, 0.172, 0.22);
  const browR = addBox(group, clothDark, 0.09, 0.018, 0.03, 0.112, 0.111, 0.174, -0.34);

  // 鼻梁与鼻孔
  addBox(group, cloth, 0.052, 0.155, 0.045, 0.002, 0.005, 0.196, 0.07);
  addSphere(group, socket, 0.016, -0.030, -0.050, 0.204, [1, 0.7, 0.5]);
  addSphere(group, socket, 0.014, 0.034, -0.058, 0.202, [1, 0.7, 0.5]);

  // 嘴：五段错开的破口，嘴角往右下烂开
  const mouthY = -0.115;
  const segments = [
    { w: 0.052, h: 0.028, x: -0.088, y: mouthY + 0.004, r: 0.12 },
    { w: 0.044, h: 0.036, x: -0.040, y: mouthY - 0.004, r: -0.06 },
    { w: 0.050, h: 0.030, x: 0.004, y: mouthY + 0.002, r: 0.05 },
    { w: 0.036, h: 0.040, x: 0.044, y: mouthY - 0.010, r: -0.12 },
    { w: 0.030, h: 0.030, x: 0.078, y: mouthY - 0.026, r: -0.3 },
  ];
  const mouthSegs = [];
  for (const s of segments) {
    mouthSegs.push(addBox(group, socket, s.w, s.h, 0.03, s.x, s.y, 0.186, s.r));
  }
  // 牙：大小不一、有缝的几颗，卡在破口上
  const teeth = [
    { w: 0.012, h: 0.020, x: -0.074, y: mouthY + 0.015, r: 0.10 },
    { w: 0.009, h: 0.014, x: -0.044, y: mouthY + 0.012, r: -0.16 },
    { w: 0.015, h: 0.024, x: -0.010, y: mouthY + 0.014, r: 0.04 },
    { w: 0.008, h: 0.011, x: 0.020, y: mouthY + 0.009, r: -0.22 },
    { w: 0.011, h: 0.017, x: 0.050, y: mouthY + 0.004, r: -0.12 },
    { w: 0.007, h: 0.010, x: 0.074, y: mouthY - 0.010, r: -0.34 },
  ];
  for (const t of teeth) {
    addBox(group, bone, t.w, t.h, 0.012, t.x, t.y, 0.199, t.r);
  }

  // 腐烂：脸颊和额头的霉斑、两处破洞
  const patches = [
    { x: -0.150, y: -0.060, s: 0.085 },
    { x: 0.128, y: 0.140, s: 0.070 },
    { x: 0.036, y: -0.212, s: 0.058 },
    { x: -0.058, y: 0.218, s: 0.062 },
    { x: 0.182, y: -0.092, s: 0.050 },
    { x: -0.205, y: 0.060, s: 0.045 },
  ];
  for (const p of patches) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(p.s, 12), mold);
    patch.position.set(p.x, p.y, 0.189);
    patch.scale.set(1, 0.82 + (p.x > 0 ? 0.2 : 0), 1);
    patch.rotation.z = p.x * 2;
    group.add(patch);
  }
  // 破洞：透出后面的黑
  for (const hole of [
    { x: -0.196, y: 0.020, r: 0.026 },
    { x: 0.074, y: 0.206, r: 0.020 },
  ]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(hole.r, 10), socket);
    h.position.set(hole.x, hole.y, 0.196);
    group.add(h);
  }

  // 干裂的布纹：贴着头壳走，别浮在轮廓外
  for (let i = 0; i < 3; i += 1) {
    const crack = addBox(group, clothDark, 0.005, 0.10 + (i % 2) * 0.04, 0.008,
      -0.085 + i * 0.085, -0.005 + (i % 2) * 0.115, 0.176, (i - 1) * 0.12);
    crack.rotation.x = 0.2;
  }

  // 指尖顶住布面：只露出一点，贴在脸的下缘
  const fingers = [];
  for (let i = 0; i < 4; i += 1) {
    const len = 0.075 + (i % 2) * 0.02;
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, len, 8), clothDark);
    finger.rotation.x = Math.PI / 2;
    finger.rotation.z = (i - 1.5) * 0.12;
    finger.position.set(-0.165 + i * 0.052, -0.175 - (i === 3 ? 0.012 : 0), 0.108);
    group.add(finger);
    fingers.push(finger);
  }

  // 布料褶皱：藏在轮廓内侧，只露出一道竖向阴影
  const folds = [];
  for (let i = 0; i < 3; i += 1) {
    const fold = addBox(group, clothDark, 0.016, 0.30, 0.014, -0.20 + i * 0.20, -0.03, 0.045);
    fold.rotation.z = (i - 1) * 0.10;
    folds.push(fold);
  }

  group.rotation.y = Math.PI;
  tag(group, 3, 'curtain');

  return {
    level: 3,
    id: 'curtain',
    group,
    stand: { x: 2.08, z: 2.75 },
    aimY: 0,
    update(dt, env) {
      // 灯闪时两只眼睛睁开，但左眼始终睁不满
      const blinkL = env.flickerDark ? 0.72 : 0.1;
      const blinkR = env.flickerDark ? 1 : 0.12;
      eyeL.scale.y += (blinkL - eyeL.scale.y) * Math.min(1, dt * 11);
      eyeR.scale.y += (blinkR - eyeR.scale.y) * Math.min(1, dt * 11);
      pupilL.scale.setScalar(0.7 + Math.sin(env.time * 1.9) * 0.14);
      pupilR.scale.setScalar(0.75 + Math.sin(env.time * 1.3 + 1.7) * 0.18);

      // 布面呼吸，破口跟着一张一合（幅度收小，避免五官浮出布面）
      const breathe = 0.60 + Math.sin(env.time * 1.7) * 0.015 + (env.flickerDark ? 0.02 : 0);
      head.scale.z = breathe;
      head.scale.x = 0.80 + Math.sin(env.time * 1.7) * 0.012;
      jaw.scale.z = breathe * 0.92;
      const open = env.flickerDark ? 1.55 : 1;
      for (const seg of mouthSegs) {
        seg.scale.y += (open - seg.scale.y) * Math.min(1, dt * 8);
      }

      fingers.forEach((finger, i) => {
        finger.position.z = 0.108 + Math.sin(env.time * 2.3 + i * 0.7) * 0.010
          + (env.flickerDark ? 0.022 : 0);
      });
      mold.opacity = 0.6 + Math.sin(env.time * 0.8) * 0.09;
      browL.rotation.z = 0.22 + Math.sin(env.time * 0.6) * 0.02;
      browR.rotation.z = -0.34 + Math.sin(env.time * 0.5 + 1) * 0.03;
    },
  };
}

/* ---------------------------------------------------------------- 第 4 关 */

/**
 * 红色人偶瞬移惊吓异常 —— 基于序章同学建模改造。
 * - 复用序章同学的几何结构（躯干/四肢），材质改为干涸深红（0x5a0a14）
 * - 眼部高度 1.62m 与玩家平视，脚底落地在 Y=0
 * - 面部：纯黑两点（眼睛）+ 一条弧线（笑脸）+ 墨水下流线条
 * - 每 4 次灯灭触发一次瞬移（间隔为原 2 次的两倍）
 * - 第 3/6/9… 次瞬移为"冲刺贴脸"：从玩家视野前方约 2m 处以 4.5m/s 冲向玩家面前急停
 * - 冲刺时播放渐强音效 + 腿部摆动动画（参考序章 NPC 行走）
 * - 其余瞬移瞬移到角落，每帧保持面向玩家（不仅瞬移时）
 */
function createRedDoll() {
  const EYE_H = 1.62;  // 玩家平视高度
  const group = new THREE.Group();

  // ── 材质：干涸血液深红，比之前更深 ──
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x5a0a14, roughness: 0.92 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x3d060e, roughness: 0.95 });
  const inkMat   = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const inkMatThick = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });

  // ── 头部（球体） ──
  const headR = 0.165;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 16), clothMat);
  head.position.y = EYE_H;
  group.add(head);

  // ── 颈 ──
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.1, 10), clothMat);
  neck.position.y = EYE_H - headR - 0.05;
  group.add(neck);

  // ── 躯干（4 段圆柱锥化，更瘦高） ──
  // 肩部 Y = EYE_H - headR - 0.1 = 1.355
  const torso = new THREE.Group();
  const segCount = 4;
  const segH = 0.17;
  const shoulderY = EYE_H - headR - 0.1;
  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1);
    const radius = 0.16 - t * 0.06; // 更瘦：0.16→0.10
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius - 0.02, segH, 10),
      clothMat,
    );
    seg.scale.z = 0.7;
    seg.position.y = shoulderY - i * segH;
    torso.add(seg);
  }
  group.add(torso);

  // ── 胯 ──
  const hipY = shoulderY - 3 * segH - 0.0; // 躯干底部
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.14), darkMat); // 更窄
  hip.position.y = hipY;
  group.add(hip);

  // ── 腿（与序章同学布局一致，pivot 在髋部下方） ──
  const legLen = 0.72;
  const legGeo = new THREE.BoxGeometry(0.09, legLen, 0.10); // 更细
  legGeo.translate(0, -legLen / 2, 0);
  const legL = new THREE.Mesh(legGeo, darkMat);
  const legR = new THREE.Mesh(legGeo, darkMat);
  const legPivotY = hipY - 0.06;
  legL.position.set(-0.09, legPivotY, 0);
  legR.position.set(0.09, legPivotY, 0);
  group.add(legL, legR);

  // ── 鞋 ──
  const shoeH = 0.06;
  const shoeGeo = new THREE.BoxGeometry(0.07, shoeH, 0.13); // 更窄
  const shoeL = new THREE.Mesh(shoeGeo, darkMat);
  const shoeR = new THREE.Mesh(shoeGeo, darkMat);
  const shoeY = legPivotY - legLen - 0.035; // 微调使脚底刚好贴地
  shoeL.position.set(-0.09, shoeY, 0.025);
  shoeR.position.set(0.09, shoeY, 0.025);
  group.add(shoeL, shoeR);

  // 脚底位置 = shoeY - shoeH/2
  const feetBottom = shoeY - shoeH / 2; // ≈ 0.865 - 0.06 - 0.62 - 0.03 = 0.155
  // group.position.y 调整使脚底 = 0
  const groundY = -feetBottom;

  // ── 上臂 ──
  const armGeo = new THREE.CylinderGeometry(0.04, 0.036, 0.30, 8); // 更细
  armGeo.translate(0, -0.13, 0);
  const armL = new THREE.Mesh(armGeo, clothMat);
  const armR = new THREE.Mesh(armGeo, clothMat);
  armL.position.set(-0.26, shoulderY, 0);
  armR.position.set(0.26, shoulderY, 0);
  group.add(armL, armR);

  // ── 前臂 ──
  const foreGeo = new THREE.CylinderGeometry(0.03, 0.024, 0.28, 8); // 更细
  foreGeo.translate(0, -0.12, 0);
  const foreL = new THREE.Mesh(foreGeo, clothMat);
  const foreR = new THREE.Mesh(foreGeo, clothMat);
  foreL.position.y = -0.26;
  foreL.rotation.x = 0.21;
  foreR.position.y = -0.26;
  foreR.rotation.x = 0.21;
  armL.add(foreL);
  armR.add(foreR);

  // ── 手 ──
  const handGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const handL = new THREE.Mesh(handGeo, darkMat);
  const handR = new THREE.Mesh(handGeo, darkMat);
  handL.position.set(0, -0.49, 0);
  handR.position.set(0, -0.49, 0);
  armL.add(handL);
  armR.add(handR);

  // ===== 脸部：纯黑两点 + 一条弧线 + 墨水下流 =====
  const faceZ = headR + 0.003;

  // 左眼
  const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.030, 10), inkMat);
  eyeL.position.set(-0.048, EYE_H + 0.025, faceZ);
  group.add(eyeL);

  // 右眼
  const eyeRdot = new THREE.Mesh(new THREE.CircleGeometry(0.030, 10), inkMat);
  eyeRdot.position.set(0.048, EYE_H + 0.025, faceZ);
  group.add(eyeRdot);

  // 墨水下流辅助函数
  function addDrip(x, startY, length, width) {
    const drip = new THREE.Mesh(
      new THREE.BoxGeometry(width, length, 0.004),
      inkMatThick,
    );
    drip.position.set(x, startY - length / 2, faceZ);
    group.add(drip);
  }

  // 左眼泪墨下流
  addDrip(-0.048, EYE_H + 0.025 - 0.030, 0.040, 0.005);
  addDrip(-0.054, EYE_H + 0.025 - 0.030 - 0.035, 0.022, 0.003);

  // 右眼泪墨下流
  addDrip(0.048, EYE_H + 0.025 - 0.030, 0.032, 0.005);
  addDrip(0.055, EYE_H + 0.025 - 0.030 - 0.028, 0.015, 0.003);

  // 嘴：笑脸弧线（细分段拼成）
  const mouthPts = 8;
  const mouthW = 0.090;
  const mouthH = 0.030;
  const mouthY = EYE_H - 0.050;
  for (let i = 0; i < mouthPts; i++) {
    const t = i / (mouthPts - 1);
    const angle = -Math.PI * t + Math.PI;
    const x = (t - 0.5) * mouthW * 2;
    const y = -Math.sin(angle) * mouthH;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.007, 0.005), inkMat);
    seg.position.set(x, mouthY + y, faceZ);
    const nt = Math.min(1, (i + 1) / (mouthPts - 1));
    const na = -Math.PI * nt + Math.PI;
    const nx = (nt - 0.5) * mouthW * 2;
    const ny = -Math.sin(na) * mouthH;
    const dy = ny - y;
    const dx2 = nx - x;
    if (Math.abs(dx2) > 0.001 || Math.abs(dy) > 0.001) {
      seg.rotation.z = -Math.atan2(dy, dx2);
    }
    group.add(seg);
  }

  // 嘴角墨水下流
  addDrip(-0.090, mouthY - 0.030, 0.035, 0.005);
  addDrip(0.090, mouthY - 0.030, 0.025, 0.004);
  // 左嘴角长泪痕（向下延伸到嘴角墨水线更下方）
  addDrip(-0.085, mouthY - 0.030 - 0.035 - 0.012, 0.020, 0.003);

  // ── 全部标记为异常 ──
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
  let lastDollRotation = 0;
  const CHARGE_SPEED = 4.5;       // m/s 冲刺速度
  const LAUNCH_DIST = 1.8;        // 出现距离玩家多远

  group.visible = false;
  group.scale.setScalar(1.0);
  group.position.set(CORNERS[0].x, groundY, CORNERS[0].z);
  group.rotation.y = 0;

  return {
    level: 4,
    id: 'doll',
    group,
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
          // 到达后仍然面向玩家
          group.rotation.y = Math.atan2(px - chargeTargetX, pz - chargeTargetZ);
          lastDollRotation = group.rotation.y;
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
          // 始终面向目标方向（玩家）
          group.rotation.y = Math.atan2(px - cx, pz - cz);
          lastDollRotation = group.rotation.y;

          // 腿部摆动（参考序章 NPC 行走：sin(t*8)*0.45）
          const swing = Math.sin(chargeProgress * chargeMaxDist * 10) * 0.45;
          legL.rotation.x = swing;
          legR.rotation.x = -swing;
          // 手臂跟着摆
          armL.rotation.x = -swing * 0.5;
          armR.rotation.x = swing * 0.5;
          // 身体上下微弹
          const bounce = Math.sin(chargeProgress * chargeMaxDist * Math.PI * 4) * 0.012;
          group.position.y = groundY + bounce;
        }
        // 冲刺中仍然持续面向玩家
        return;
      }

      // 不是冲刺状态，恢复静止姿态
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      armL.rotation.x = 0;
      armR.rotation.x = 0;
      group.position.y = groundY;
      // 静止时仍然面向玩家
      group.rotation.y = Math.atan2(px - group.position.x, pz - group.position.z);
      lastDollRotation = group.rotation.y;

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
          group.rotation.y = Math.atan2(px - CORNERS[cornerIndex].x, pz - CORNERS[cornerIndex].z);
          lastDollRotation = group.rotation.y;
          return;
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
              group.rotation.y = Math.atan2(px - CORNERS[cornerIndex].x, pz - CORNERS[cornerIndex].z);
            } else {
              // 开始冲刺
              group.position.set(launchX, groundY, launchZ);
              group.rotation.y = Math.atan2(px - launchX, pz - launchZ);
              lastDollRotation = group.rotation.y;
              group.visible = true;
              charging = true;
              chargeFromX = launchX;
              chargeFromZ = launchZ;
              chargeTargetX = faceX;
              chargeTargetZ = faceZ;
              chargeProgress = 0;
              chargeMaxDist = Math.hypot(faceX - launchX, faceZ - launchZ);

              // 播放冲刺音效
              if (audio) {
                try {
                  // 渐强噪音
                  audio.burst({ duration: 0.08, gain: 0.15, type: 'highpass', freq: 3000, q: 0.4 });
                  audio.burst({ duration: 0.12, gain: 0.25, type: 'bandpass', freq: 800, q: 0.6, delay: 0.02 });
                  audio.burst({ duration: 0.2, gain: 0.35, type: 'bandpass', freq: 400, q: 0.5, delay: 0.06 });
                  // 低吼
                  audio.tone(110, 0.35, 0.10, 'sawtooth');
                  audio.tone(55, 0.4, 0.06, 'sine');
                } catch (e) { /* 音效出错不影响核心逻辑 */ }
              }
            }
          } else {
            // ── 角落瞬移，面向玩家 ──
            cornerIndex = (cornerIndex + 1) % CORNERS.length;
            group.position.set(CORNERS[cornerIndex].x, groundY, CORNERS[cornerIndex].z);
            group.rotation.y = Math.atan2(px - CORNERS[cornerIndex].x, pz - CORNERS[cornerIndex].z);
            lastDollRotation = group.rotation.y;
          }

          teleportPhase++;
        }
      }

      // ===== 3. 每帧保持面向玩家（仅非冲刺状态） =====
      if (group.visible && !charging) {
        group.rotation.y = Math.atan2(px - group.position.x, pz - group.position.z);
        lastDollRotation = group.rotation.y;
      }

      // ===== 4. 微小的呼吸浮动（非冲刺时） =====
      if (group.visible && !charging) {
        const breath = Math.sin(env.time * 2.1) * 0.006;
        group.position.y = groundY + breath;
      }
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
  const yFloor = 0, yCeil = room.height;

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
  });

  // 教室墙面下半部的原始墙壁材质（与 level.js 的 grainTexture('#3c433c') 一致）
  function makeWallTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    // 底色使用与原教室一致的 #3c433c（灰绿色，轻微腻子粉感）
    ctx.fillStyle = '#3c433c';
    ctx.fillRect(0, 0, 256, 256);
    // 模仿 grainTexture 的噪点（颜色深浅变化，模拟墙壁粉刷质感）
    for (let i = 0; i < 1400; i++) {
      const shade = 18 + Math.random() * 40;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // 增加细微的竖向纹理（模拟墙纸或抹灰的竖向刷痕）
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 256;
      const h = 20 + Math.random() * 80;
      const w = 1 + Math.random() * 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, Math.random() * (256 - h), w, h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + (Math.random() - 0.5) * 4, Math.random() * (256 - h), 1, h);
    }
    ctx.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return t;
  }
  const wallLowerMat = new THREE.MeshBasicMaterial({
    map: makeWallTex(),
    side: THREE.DoubleSide,
  });

  
  const halfH = yCeil * 0.52;  // 血肉覆盖高度（从天花板往下，约1.66m）

  // ========== 2. 天花板 + 半覆盖墙壁 ==========
  // 2a) 天花板：血肉全覆盖（使用独立的 ceilMat，纹理 repeat 更适合天花板比例）
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  // 将天花板放在 yCeil 处，法线朝下（rotation.x = PI/2 → 原 XY 平面旋转到 XZ，法线朝 -Y）
  // 使用极小的 z-offset 避免 z-fighting，但没有 BoxGeometry 遮挡问题（教室天花板法线朝外不可见）
  ceil.position.set(0, yCeil, (zMin + zMax) / 2);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);

  // 2b) 地板（保持暗色）
  const floorMat = fleshMat.clone();
  floorMat.color.setHex(0x1a080a);
  const floor = new THREE.Mesh(ceilGeo.clone(), floorMat);
  floor.position.set(0, 0.01, (zMin + zMax) / 2);
  floor.rotation.x = Math.PI / 2;
  group.add(floor);

  // 门参数
  const doorHalf = door.half;
  const doorH = door.height;
  const doorXMin = -doorHalf;
  const doorXMax = doorHalf;

  function addDoorWalls(w, lowH, upH, px, pz, ry) {
    // 门在 zMax 墙，门中心在 px 处（门的 half=0.8，从 -0.8 到 0.8）
    // lowH = 下半部墙色高度，upH = 上半部血肉高度
    // lowH + upH = yCeil
    const leftW = (w / 2) - doorHalf;
    const rightW = (w / 2) - doorHalf;
    const topH = upH - (yCeil - doorH);  // 门上方血肉高度
    if (topH > 0) {
      const topGeo = new THREE.PlaneGeometry(w, topH);
      const topMesh = new THREE.Mesh(topGeo, fleshMat);
      topMesh.position.set(px, yCeil - topH / 2, pz);
      topMesh.rotation.y = ry;
      group.add(topMesh);
    }
    // 门左侧和右侧的上半血肉面板（从 yCeil-upH 到天花板）
    if (leftW > 0) {
      const lg = new THREE.PlaneGeometry(leftW, upH);
      const lm = new THREE.Mesh(lg, fleshMat);
      lm.position.set(px - (doorHalf + leftW / 2), yCeil - upH / 2, pz);
      lm.rotation.y = ry;
      group.add(lm);
    }
    if (rightW > 0) {
      const lg = new THREE.PlaneGeometry(rightW, upH);
      const rm = new THREE.Mesh(lg, fleshMat);
      rm.position.set(px + (doorHalf + rightW / 2), yCeil - upH / 2, pz);
      rm.rotation.y = ry;
      group.add(rm);
    }
    // 门左侧和右侧的下半墙面（从地面到 lowH）
    if (leftW > 0) {
      const llg = new THREE.PlaneGeometry(leftW, lowH);
      const llm = new THREE.Mesh(llg, wallLowerMat);
      llm.position.set(px - (doorHalf + leftW / 2), lowH / 2, pz);
      llm.rotation.y = ry;
      group.add(llm);
    }
    if (rightW > 0) {
      const rlg = new THREE.PlaneGeometry(rightW, lowH);
      const rlm = new THREE.Mesh(rlg, wallLowerMat);
      rlm.position.set(px + (doorHalf + rightW / 2), lowH / 2, pz);
      rlm.rotation.y = ry;
      group.add(rlm);
    }
  }

    const totalW = xMax - xMin;
  const sideW = zMax - zMin;
  const halfZ = (zMin + zMax) / 2;
  const tissueH = halfH;         // 血肉从天花板往下的覆盖深度（约1.66m）
  const wallH = yCeil - halfH;   // 墙色从地面往上的高度（约1.54m）

  // 后墙 zMax — 带门，门上方和门两侧用血肉材质，门两侧以下用墙色
  addDoorWalls(totalW, wallH, tissueH, 0, zMax - 0.01, 0);
  // 前墙 zMin — 上半血肉（天花板向下 tissueH），下半墙色（地面向上 wallH）
  const frontUpper = new THREE.Mesh(new THREE.PlaneGeometry(totalW, tissueH), fleshMat);
  frontUpper.position.set(0, yCeil - tissueH / 2, zMin + 0.01);
  frontUpper.rotation.y = Math.PI;
  group.add(frontUpper);
  const frontLower = new THREE.Mesh(new THREE.PlaneGeometry(totalW, wallH), wallLowerMat);
  frontLower.position.set(0, wallH / 2, zMin + 0.02);
  frontLower.rotation.y = Math.PI;
  group.add(frontLower);

  // 左墙 xMin — 上半血肉，下半墙色
  const leftUpper = new THREE.Mesh(new THREE.PlaneGeometry(sideW, tissueH), fleshMat);
  leftUpper.position.set(xMin + 0.01, yCeil - tissueH / 2, halfZ);
  leftUpper.rotation.y = Math.PI / 2;
  group.add(leftUpper);
  const leftLower = new THREE.Mesh(new THREE.PlaneGeometry(sideW, wallH), wallLowerMat);
  leftLower.position.set(xMin + 0.02, wallH / 2, halfZ);
  leftLower.rotation.y = Math.PI / 2;
  group.add(leftLower);

  // 右墙 xMax — 上半血肉，下半墙色
  const rightUpper = new THREE.Mesh(new THREE.PlaneGeometry(sideW, tissueH), fleshMat);
  rightUpper.position.set(xMax - 0.01, yCeil - tissueH / 2, halfZ);
  rightUpper.rotation.y = -Math.PI / 2;
  group.add(rightUpper);
  const rightLower = new THREE.Mesh(new THREE.PlaneGeometry(sideW, wallH), wallLowerMat);
  rightLower.position.set(xMax - 0.02, wallH / 2, halfZ);
  rightLower.rotation.y = -Math.PI / 2;
  group.add(rightLower);

  // ---- 过渡：血液下渗条（从血肉边界延伸到下半墙） ----
  // 使用单独的红色材质，更鲜红醒目
  const dripMatRed = new THREE.MeshBasicMaterial({
    color: 0x8a0c10,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  function addDrip(w, h, x, z, ry, skipDoor) {
    // w=墙宽, h=墙高, x=中心x, z=中心z, ry=旋转
    // 密度更高，每隔约0.25m一条
    const count = Math.floor(w / 0.25);
    const spacing = w / count;
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.3;
      // 跳过门洞区域
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      
      // 随机选择一条血条的类型
      const type = Math.random();
      
      if (type < 0.5) {
        // 细长血条（垂直流淌）
        const stripH = 0.15 + Math.random() * 0.6;
        const stripW = 0.015 + Math.random() * 0.035;
        const yBase = wallH;
        // 从连接处稍微上方开始，向下延伸
        const yPos = yBase + stripH/2 - 0.04;
        const opacity = 0.3 + Math.random() * 0.4;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = opacity;
        group.add(extra);
      } else if (type < 0.8) {
        // 较粗的血迹斑（宽短，像血液聚集）
        const stripH = 0.06 + Math.random() * 0.2;
        const stripW = 0.03 + Math.random() * 0.08;
        const yBase = wallH;
        const yPos = yBase + stripH/2 - 0.02 + Math.random() * 0.1;
        const opacity = 0.4 + Math.random() * 0.35;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = opacity;
        group.add(extra);
      } else {
        // 深色凝固血迹（暗红，紧贴边界）
        const stripH = 0.02 + Math.random() * 0.06;
        const stripW = 0.04 + Math.random() * 0.12;
        const yPos = wallH + stripH/2 - 0.005;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = 0.5 + Math.random() * 0.3;
        extra.material.color.setHex(0x5a0608);
        group.add(extra);
      }
    }
    
    // 额外：增加一些斜向血迹（模拟溅射或流淌时的偏移）
    const slantCount = Math.floor(count * 0.15);
    for (let i = 0; i < slantCount; i++) {
      const dx = -w/2 + Math.random() * w;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      const stripH = 0.1 + Math.random() * 0.3;
      const stripW = 0.01 + Math.random() * 0.025;
      const yBase = wallH;
      const yPos = yBase - 0.02 + stripH/2;
      const slant = (Math.random() - 0.5) * 0.4; // 倾斜角
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW * 0.7, stripH * 0.8), dripMatRed.clone());
      extra.position.set(x + dx + slant * 0.08, yPos, z);
      extra.rotation.y = ry;
      extra.rotation.z = slant;
      extra.material.opacity = 0.3 + Math.random() * 0.25;
      group.add(extra);
    }
  }
  addDrip(totalW, wallH, 0, zMin + 0.02, Math.PI, false);       // 前墙
  addDrip(sideW, wallH, xMin + 0.02, halfZ, Math.PI/2, false);  // 左墙
  addDrip(sideW, wallH, xMax - 0.02, halfZ, -Math.PI/2, false); // 右墙
  addDrip(totalW, wallH, 0, zMax - 0.02, 0, true);               // 后墙（避开门）

  // 收集上半墙网格用于呼吸动画
  const upperWalls = [frontUpper, leftUpper, rightUpper];

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
      const cx = xMin + 1 + rng() * (xMax - xMin - 2);
      const cz = zMin + 1 + rng() * (zMax - zMin - 2);
      const dir = rng() * Math.PI * 2;
      const len = 1 + rng() * 2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const angle = dir + t * 0.8 + Math.sin(t * Math.PI * 2) * 0.5;
        const rad = t * len;
        pts.push(new THREE.Vector3(
          cx + Math.cos(angle) * rad,
          yCeil - 0.01,
          cz + Math.sin(angle) * rad,
        ));
      }
    } else if (surface === 1) {
      const x0 = xMin + 0.5 + rng() * (xMax - xMin - 1);
      const y0 = 0.1 + rng() * (halfH - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dx = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          x0 + dx,
          Math.max(0, Math.min(halfH, y0 + dy)),
          zMin + 0.01,
        ));
      }
    } else if (surface === 2) {
      const z0 = zMin + 0.5 + rng() * (zMax - zMin - 1);
      const y0 = 0.1 + rng() * (halfH - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dz = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          xMin + 0.01,
          Math.max(0, Math.min(halfH, y0 + dy)),
          z0 + dz,
        ));
      }
    } else {
      const z0 = zMin + 0.5 + rng() * (zMax - zMin - 1);
      const y0 = 0.1 + rng() * (halfH - 0.2);
      const dir = rng() * Math.PI * 2;
      const len = 0.5 + rng() * 1.2;
      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const dz = Math.cos(dir + t * 1.2 + Math.sin(t * Math.PI) * 0.4) * t * len;
        const dy = Math.sin(dir * 0.6 + t * 0.7 + Math.cos(t * Math.PI * 1.3) * 0.3) * t * len * 0.6;
        pts.push(new THREE.Vector3(
          xMax - 0.01,
          Math.max(0, Math.min(halfH, y0 + dy)),
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
  const capPoints = [];
  const capCount = 200;
  for (let i = 0; i < capCount; i++) {
    const sx = xMin + rng() * (xMax - xMin);
    const sz = zMin + rng() * (zMax - zMin);
    capPoints.push(sx, yCeil - 0.005, sz);
    const angle = rng() * Math.PI * 2;
    const len = 0.05 + rng() * 0.15;
    capPoints.push(sx + Math.cos(angle) * len, yCeil - 0.005, sz + Math.sin(angle) * len);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPoints, 3));
  const capLines = new THREE.LineSegments(capGeo, new THREE.LineBasicMaterial({
    color: 0x4a0a12, transparent: true, opacity: 0.25,
  }));
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
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  group.add(mistPoints);
  const mistMat2 = new THREE.PointsMaterial({
    color: 0x5a1020, size: 0.06, transparent: true, opacity: 0.12,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mistPoints2 = new THREE.Points(mistGeo.clone(), mistMat2);
  group.add(mistPoints2);

  // ========== 标签 ==========
  tag(group, 5, 'flesh-wall');

  // ========== 状态变量 ==========
  let photoReactActive = false;
  let photoReactT = 0;

  // ========== 返回对象 ==========
  return {
    level: 5,
    id: 'flesh-wall',
    group,
    stand: { x: 0, z: 4.2 },
    aimY: 3.15,
    update(dt, env) {
      const flicker = env.flickerDark ?? false;
      const time = env.time ?? 0;

      // ---- 纹理流动 ----
      flowTime += dt * 0.06;
      texture.offset.y = flowTime;
      texture.offset.x += Math.sin(flowTime * 0.1) * 0.005;
      // 天花板纹理同步流动
      if (ceilTexture) {
        ceilTexture.offset.y = flowTime * 0.7;
        ceilTexture.offset.x += Math.sin(flowTime * 0.08) * 0.003;
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

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
    case 4: return createEcho();
    case 5: return createDoorVision();
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

/** 地上第二台相机，以及一串走到一半就断掉的鞋印。 */
function createEcho() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.echo.x, 0, LAYOUT.echo.z);

  const second = cameraModel(0xe8e2d4);
  second.position.set(-0.08, 0, 0.1);
  second.rotation.y = 0.7;
  group.add(second);

  const printMat = new THREE.MeshBasicMaterial({ color: 0x1d1714, transparent: true, opacity: 0.72 });
  const prints = [];
  for (let i = 0; i < 5; i += 1) {
    const step = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), printMat);
    sole.rotation.x = -Math.PI / 2;
    sole.scale.set(1, 0.62, 1);
    sole.position.set(0, 0, 0.055);
    const heel = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), printMat);
    heel.rotation.x = -Math.PI / 2;
    heel.scale.set(1, 0.7, 1);
    heel.position.set(0, 0, -0.075);
    step.add(sole, heel);
    step.position.set((i % 2 === 0 ? -1 : 1) * 0.09, 0.032 + i * 0.001, 0.5 + i * 0.34);
    group.add(step);
    prints.push(step);
  }

  const drag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.9), new THREE.MeshBasicMaterial({
    color: 0x0d0a09, transparent: true, opacity: 0.35,
  }));
  drag.rotation.x = -Math.PI / 2;
  drag.position.set(0.12, 0.028, 1.2);
  group.add(drag);

  tag(group, 4, 'echo');

  return {
    level: 4,
    id: 'echo',
    group,
    stand: { x: -1.05, z: LAYOUT.echo.z },
    aimY: 0.16,
    update(dt, env) {
      prints.forEach((print, i) => {
        print.position.y = 0.032 + i * 0.001 + Math.sin(env.time * 1.6 + i * 0.8) * 0.004;
        print.rotation.y = Math.sin(env.time * 0.8 + i) * 0.04;
      });
      drag.material.opacity = 0.28 + Math.sin(env.time * 0.7) * 0.06;
    },
  };
}

/* ---------------------------------------------------------------- 第 5 关 */

/** 门缝里的错层教室：门内还是同一间教室，钟停在你进来的时间。 */
function createDoorVision() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.door.half, 1.4, -0.08);

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 448;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#080b0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#2a2f34';
  ctx.lineWidth = 14;
  ctx.strokeRect(24, 20, canvas.width - 48, canvas.height - 40);

  for (let row = 0; row < 4; row += 1) {
    const scale = 1 - row * 0.16;
    const y = 250 - row * 42 * scale;
    const w = 150 * scale;
    ctx.globalAlpha = 0.55 + row * 0.08;
    ctx.fillStyle = '#12181c';
    for (let col = -1; col <= 1; col += 1) {
      ctx.fillRect(canvas.width / 2 + col * (w * 0.62) * 1.35 - w / 2, y, w, 11 * scale);
      ctx.fillRect(canvas.width / 2 + col * (w * 0.62) * 1.35 - w / 2, y, 7 * scale, 46 * scale);
    }
  }
  ctx.globalAlpha = 1;

  const glow = ctx.createRadialGradient(canvas.width / 2, 150, 8, canvas.width / 2, 150, 120);
  glow.addColorStop(0, 'rgba(120,140,120,0.30)');
  glow.addColorStop(1, 'rgba(120,140,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 30, canvas.width, 260);

  ctx.strokeStyle = '#cfc9b8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 96, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 96);
  ctx.lineTo(canvas.width / 2 + 12, 96 - 8);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 96);
  ctx.lineTo(canvas.width / 2 - 3, 96 - 22);
  ctx.stroke();

  ctx.fillStyle = '#c9c2b0';
  ctx.font = '30px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('03:17', canvas.width / 2, 410);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.7),
    new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide }),
  );

  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.7),
    new THREE.MeshBasicMaterial({
      color: 0x9fb4c0,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  sheen.position.z = 0.002;

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2438 });
  eyeMat.toneMapped = false;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.075, 0.085, 0.02);
  eyeR.position.set(0.075, 0.085, 0.02);

  group.add(glass, sheen, eyeL, eyeR);
  tag(group, 5, 'door');

  return {
    level: 5,
    id: 'door',
    group,
    stand: { x: 0, z: 4.2 },
    aimY: 0,
    parent: 'door',
    update(dt, env) {
      const s = env.flickerDark ? 1.5 : 0.32;
      eyeL.scale.setScalar(eyeL.scale.x + (s - eyeL.scale.x) * Math.min(1, dt * 12));
      eyeR.scale.setScalar(eyeL.scale.x);
      sheen.material.opacity = 0.08 + Math.sin(env.time * 0.6) * 0.03;
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

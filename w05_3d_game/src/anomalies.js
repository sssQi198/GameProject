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

function createSeat() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.seat.x, 0, LAYOUT.seat.z);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.26), cloth);
  torso.position.y = 1.12;
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.28), cloth);
  shoulder.position.y = 1.4;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), cloth);
  neck.position.y = 1.5;
  const buried = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), cloth);
  buried.position.set(0, 0.72, -0.28);
  buried.scale.set(1, 0.7, 1.2);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.14), cloth);
  leg.position.set(-0.1, 0.28, 0.02);
  const legR = leg.clone();
  legR.position.x = 0.1;
  group.add(torso, shoulder, neck, buried, leg, legR);
  tag(group, 1, 'seat');
  const baseShoulder = shoulder.position.y;
  return {
    level: 1,
    id: 'seat',
    group,
    stand: { ...LAYOUT.photoStand },
    aimY: 1.2,
    update(dt, env) {
      const lift = env.flickerDark ? 0.07 : 0;
      shoulder.position.y += (baseShoulder + lift - shoulder.position.y) * Math.min(1, dt * 8);
    },
  };
}

function createBoard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a221c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e6e0d0';
  ctx.font = '78px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('你把它带进来了', 512, 200);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 1 });
  mat.toneMapped = false;
  const group = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.95), mat);
  group.add(plane);
  group.position.set(LAYOUT.board.x, LAYOUT.board.y, LAYOUT.board.z);
  tag(group, 2, 'board');
  let scratchIn = 0;
  return {
    level: 2,
    id: 'board',
    group,
    stand: { x: 0.2, z: -1.7 },
    aimY: 0,
    update(dt, env) {
      const wave = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(env.time * 2.4));
      mat.opacity = env.flickerDark ? 1 : wave;
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

function createCurtain() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.curtainFace.x, LAYOUT.curtainFace.y, LAYOUT.curtainFace.z);
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x6a3034,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), cloth);
  bulge.scale.set(0.7, 1.15, 0.55);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
  eyeMat.toneMapped = false;
  const pupil = new THREE.MeshBasicMaterial({ color: 0x14080a });
  const eyeL = eyePair(-0.09, 0.06, eyeMat, pupil);
  const eyeR = eyePair(0.09, 0.06, eyeMat, pupil);
  group.add(bulge, eyeL, eyeR);
  tag(group, 3, 'curtain');
  return {
    level: 3,
    id: 'curtain',
    group,
    stand: { x: 2.4, z: 0.2 },
    aimY: 0,
    update(dt, env) {
      const open = env.flickerDark ? 1 : 0.02;
      const s = eyeL.scale.x + (open - eyeL.scale.x) * Math.min(1, dt * 10);
      eyeL.scale.setScalar(s);
      eyeR.scale.setScalar(s);
      bulge.scale.z = 0.45 + Math.sin(env.time * 1.7) * 0.08 + (env.flickerDark ? 0.15 : 0);
    },
  };
}

function eyePair(x, y, whiteMat, pupilMat) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), whiteMat);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), pupilMat);
  pupil.position.z = 0.03;
  g.add(white, pupil);
  g.position.set(x, y, 0.12);
  return g;
}

function createEcho() {
  const group = new THREE.Group();
  group.position.set(LAYOUT.echo.x, 0, LAYOUT.echo.z);
  group.add(cameraModel(0xe8e2d4));
  const printMat = new THREE.MeshBasicMaterial({ color: 0x2a211c, transparent: true, opacity: 0.7 });
  const prints = [];
  for (let i = 0; i < 4; i += 1) {
    const print = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), printMat);
    print.rotation.x = -Math.PI / 2;
    print.position.set(0.15, 0.03 + i * 0.14, 0.45 + i * 0.38);
    group.add(print);
    prints.push(print);
  }
  tag(group, 4, 'echo');
  return {
    level: 4,
    id: 'echo',
    group,
    stand: { x: LAYOUT.echo.x, z: LAYOUT.echo.z + 1.35 },
    aimY: 0.16,
    update(dt, env) {
      prints.forEach((print, i) => {
        print.position.y = 0.04 + i * 0.12 + Math.sin(env.time * 2 + i) * 0.02;
      });
    },
  };
}

function createDoorVision() {
  const group = new THREE.Group();
  // 相对门轴：门板中心在 +X，玻璃略微探向教室（-Z）
  group.position.set(LAYOUT.door.half, 1.4, -0.08);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c1014';
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = '#1c2420';
  ctx.fillRect(28, 40, 200, 120);
  ctx.fillStyle = '#c9c2b0';
  ctx.font = '28px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('03:17', 128, 300);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.7),
    new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide }),
  );
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2438 });
  eyeMat.toneMapped = false;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.08, 0.08, 0.02);
  eyeR.position.set(0.08, 0.08, 0.02);
  group.add(glass, eyeL, eyeR);
  tag(group, 5, 'door');
  return {
    level: 5,
    id: 'door',
    group,
    stand: { x: 0, z: 2.4 },
    aimY: 0,
    parent: 'door',
    update(dt, env) {
      const s = env.flickerDark ? 1.4 : 0.35;
      eyeL.scale.setScalar(s);
      eyeR.scale.setScalar(s);
    },
  };
}

/** 地上那台能拾起的相机，以及第 4 关的第二台。 */
export function cameraModel(color = 0xd7d1c4) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x3a3328,
    emissiveIntensity: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.18), bodyMat);
  body.position.y = 0.1;
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.12, 0.12);
  group.add(body, lens);
  return group;
}

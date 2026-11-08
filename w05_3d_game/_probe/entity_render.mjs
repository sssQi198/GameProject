/**
 * 把 m2.js 的 createEyes()（= 追逐实体那张脸）用软件光栅器画出来。
 * 目的：确认牙 / 脸板 / 眼睛的层叠关系，以及"贴脸压制"前后差多少。
 * 近似很粗：没有加性光晕、没有泛光、没有点光，只看几何与明暗关系。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from '../vendor/three.module.js';
import { createEyes } from '../src/team/m2.js';
import { CONFIG } from '../src/config.js';

const FOG = 0x07080c;
const FR = (FOG >> 16) & 255;
const FG = (FOG >> 8) & 255;
const FB = FOG & 255;

// ---------- PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 收集三角形 ----------
const group = createEyes(THREE);
group.updateMatrixWorld(true);

const tris = [];
{
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.blending === THREE.AdditiveBlending) return;   // 光晕：探针画不了加性叠加
    const geo = o.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const colAttr = geo.attributes.color;
    const mat = o.material;
    const hex = mat.color ? mat.color.getHex() : 0xffffff;
    const type = geo.type;
    let kind = 'face';
    if (hex === 0xff2030) kind = 'eye';
    else if (type === 'ConeGeometry') kind = 'tooth';
    else if (mat.transparent) kind = 'ball';
    const cr = (hex >> 16) & 255;
    const cg = (hex >> 8) & 255;
    const cb = hex & 255;
    const colOf = (vi) => {
      if (!colAttr) return [cr, cg, cb];
      return [
        Math.min(255, cr * colAttr.getX(vi)),
        Math.min(255, cg * colAttr.getY(vi)),
        Math.min(255, cb * colAttr.getZ(vi)),
      ];
    };
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      B.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      C.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      tris.push({ v: [A.clone(), B.clone(), C.clone()], cols: [colOf(i0), colOf(i1), colOf(i2)], kind, fog: mat.fog !== false });
    }
  });
}

// ---------- 光栅化 ----------
const NEAR = -0.12;
function render(camPos, camTarget, W, H, fov) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 180);
  cam.position.set(camPos[0], camPos[1], camPos[2]);
  cam.lookAt(camTarget[0], camTarget[1], camTarget[2]);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const viewMat = cam.matrixWorldInverse;
  const projMat = cam.projectionMatrix;

  const color = Buffer.alloc(W * H * 4);
  const kindBuf = new Array(W * H).fill('');
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i += 1) {
    color[i * 4] = FR; color[i * 4 + 1] = FG; color[i * 4 + 2] = FB; color[i * 4 + 3] = 255;
  }

  const v4 = new THREE.Vector4();
  for (const t of tris) {
    let poly = t.v.map((p, k) => ({ p: p.clone().applyMatrix4(viewMat), c: t.cols[k] }));
    if (poly.some((o) => o.p.z > NEAR)) {
      const out = [];
      for (let i = 0; i < poly.length; i += 1) {
        const cur = poly[i];
        const nxt = poly[(i + 1) % poly.length];
        const ci = cur.p.z <= NEAR;
        const ni = nxt.p.z <= NEAR;
        if (ci) out.push(cur);
        if (ci !== ni) {
          const tt = (NEAR - cur.p.z) / (nxt.p.z - cur.p.z);
          out.push({
            p: new THREE.Vector3(cur.p.x + (nxt.p.x - cur.p.x) * tt, cur.p.y + (nxt.p.y - cur.p.y) * tt, NEAR),
            c: [0, 1, 2].map((q) => cur.c[q] + (nxt.c[q] - cur.c[q]) * tt),
          });
        }
      }
      poly = out;
      if (poly.length < 3) continue;
    }
    const scr = poly.map((o) => {
      v4.set(o.p.x, o.p.y, o.p.z, 1).applyMatrix4(projMat);
      const iw = 1 / v4.w;
      return { x: (v4.x * iw * 0.5 + 0.5) * W, y: (1 - (v4.y * iw * 0.5 + 0.5)) * H, d: -o.p.z, c: o.c };
    });
    for (let f = 1; f + 1 < scr.length; f += 1) {
      const a = scr[0]; const b = scr[f]; const c = scr[f + 1];
      const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
      const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
      if (maxX < minX || maxY < minY) continue;
      const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(den) < 1e-9) continue;
      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          const x = px + 0.5; const y = py + 0.5;
          const w0 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
          const w1 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.0001 || w1 < -0.0001 || w2 < -0.0001) continue;
          const d = w0 * a.d + w1 * b.d + w2 * c.d;
          const pi = py * W + px;
          if (d >= depth[pi]) continue;
          depth[pi] = d;
          let r = w0 * a.c[0] + w1 * b.c[0] + w2 * c.c[0];
          let g = w0 * a.c[1] + w1 * b.c[1] + w2 * c.c[1];
          let bl2 = w0 * a.c[2] + w1 * b.c[2] + w2 * c.c[2];
          if (t.kind === 'ball') {   // opacity 0.5 黑：与背景混合
            r = r * 0.5 + FR * 0.5; g = g * 0.5 + FG * 0.5; bl2 = bl2 * 0.5 + FB * 0.5;
          } else if (t.fog) {
            const ff = 1 - Math.exp(-((CONFIG.fogRoom * d) ** 2));
            r += (FR - r) * ff; g += (FG - g) * ff; bl2 += (FB - bl2) * ff;
          }
          r = Math.min(255, r * 1.18 + 2);
          g = Math.min(255, g * 1.18 + 2);
          bl2 = Math.min(255, bl2 * 1.18 + 2);
          color[pi * 4] = r; color[pi * 4 + 1] = g; color[pi * 4 + 2] = bl2; color[pi * 4 + 3] = 255;
          kindBuf[pi] = t.kind;
        }
      }
    }
  }
  const cnt = { eye: 0, tooth: 0, face: 0, ball: 0 };
  for (let i = 0; i < kindBuf.length; i += 1) if (kindBuf[i]) cnt[kindBuf[i]] += 1;
  return { color, kindBuf, cnt, W, H };
}

/** 把像素种类降采样成字符画：E 眼 / T 牙 / F 脸板 / . 黑团 / 空格 背景 */
function ascii(kindBuf, W, H, cols = 64) {
  const rows = Math.max(8, Math.round((H / W) * cols * 0.5));
  const cw = W / cols;
  const ch = H / rows;
  const out = [];
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor(c * cw); const x1 = Math.min(W, Math.ceil((c + 1) * cw));
      const y0 = Math.floor(r * ch); const y1 = Math.min(H, Math.ceil((r + 1) * ch));
      const seen = { eye: 0, tooth: 0, face: 0, ball: 0 };
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const k = kindBuf[y * W + x];
          if (k) seen[k] += 1;
        }
      }
      let chr = ' ';
      if (seen.eye) chr = 'E';
      else if (seen.tooth > 1) chr = 'T';
      else if (seen.face > 1) chr = 'F';
      else if (seen.ball) chr = '.';
      line += chr;
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.join('\n');
}

const ROOT = 'E:\\新建游戏项目';
function shoot(tag, dist, grin, out, show = false) {
  group.userData.setGrin(grin);
  const res = render([0, 1.62, dist], [0, 1.58, 0.06], 640, 480, 70);
  fs.writeFileSync(out, encodePNG(res.W, res.H, res.color));
  const px = (n) => Math.round((n / (res.W * res.H)) * 1000) / 10;
  console.log(`\n=== ${tag} ===`);
  console.log(`眼 ${px(res.cnt.eye)}%  牙 ${px(res.cnt.tooth)}%  脸板 ${px(res.cnt.face)}%  黑团 ${px(res.cnt.ball)}%`);
  if (show) console.log(ascii(res.kindBuf, res.W, res.H));
}
shoot('6.0m 满咧嘴 ', 6.0, 1, ROOT + '\\_ent_6m.png');
shoot('3.2m 满咧嘴 ', 3.2, 1, ROOT + '\\_ent_3m.png', true);
shoot('1.45m 压制后', 1.45, 0, ROOT + '\\_ent_1m.png', true);
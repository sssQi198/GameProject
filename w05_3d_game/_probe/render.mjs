/**
 * 第 5 关血肉墙的软件光栅化预览（Node 端，不需要 WebGL / 浏览器）。
 * 带近平面裁剪 + 逐像素材质 ID 缓冲 + 顶点色插值，所以能准确回答：
 *   「裂缝在画面哪个位置、占多少像素、触手有没有真的在边缘上、有没有被挡住」。
 *
 * 跑法：node _probe/render.mjs
 * 产物：E:\新建游戏项目\_probe_*.png
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

// ---------- canvas 替身 ----------
function makeCtx() {
  const c = {
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, fillRect() {}, clearRect() {}, drawImage() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
    measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  for (const k of ['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign',
    'textBaseline', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'lineCap', 'lineJoin']) {
    let v = null;
    Object.defineProperty(c, k, { get() { return v; }, set(nv) { v = nv; }, enumerable: true });
  }
  return c;
}
globalThis.document = {
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => makeCtx();
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
};
globalThis.window = globalThis;

const THREE = await import('../vendor/three.module.js');
const { createAnomaly } = await import('../src/anomalies.js');
const { CONFIG } = await import('../src/config.js');

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 收集三角形 ----------
const anomaly = createAnomaly(5);
const group = anomaly.group;
group.updateMatrixWorld(true);

const LABEL = ['bg', 'flesh', 'crack-margin', 'crack-body', 'crack-CORE', 'tentacle', 'bump', 'vein', 'EYE'];
const tris = [];
{
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    // three.js 渲染时会跳过 visible=false 的对象（比如拍照命中球），
    // 探针不跳过就会把那个半径 0.5 的白球画出来糊住整个裂缝。
    if (o.visible === false) return;
    const geo = o.geometry;
    // 加性混合的光晕在游戏里是"叠在画面上"的，探针没有逐像素混合能力；
    // 它的球体比眼球大，若当作不透明画会把眼睛整个挡住，所以直接跳过。
    if (o.material && o.material.blending === THREE.AdditiveBlending) return;
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const colAttr = geo.attributes.color;
    const mat = o.material;
    const mw = o.matrixWorld;
    const hex = mat && mat.color ? mat.color.getHex() : 0xffffff;
    const hasMap = !!(mat && mat.map);
    const useFog = mat ? mat.fog !== false : true;
    const bl = hex & 255;
    const type = geo.type;
    let id = 1;
    if (!hasMap) {
      if (type === 'BufferGeometry' && hex === 0x3c0709) id = 2;
      else if (type === 'BufferGeometry' && hex === 0x140102) id = 3;
      else if (type === 'BufferGeometry' && hex === 0x020000) id = 4;
      else if (type === 'BufferGeometry' && (hex === 0x0b0304 || hex === 0x010000)) id = 4;
      else if (type === 'TubeGeometry') id = bl >= 0x0a ? 7 : 5;
      else if (hex === 0xff2030) id = 8;
      else if (type === 'SphereGeometry' && geo.parameters && geo.parameters.radius < 0.09) id = 6;
    }
    let cr; let cg; let cb;
    if (hasMap) { cr = 58; cg = 20; cb = 26; } else { cr = (hex >> 16) & 255; cg = (hex >> 8) & 255; cb = bl; }
    if (id === 3) { cr = 26; cg = 3; cb = 4; }
    if (id === 4) { cr = 2; cg = 0; cb = 0; }
    // 半透明材质：近似成"和背后血肉色混合"，否则预览会把 55% 不透明度的
    // 血管画成刺眼的实心亮红（实际游戏里几乎看不见）。
    if (mat && mat.transparent && typeof mat.opacity === 'number') {
      const op = mat.opacity;
      cr = cr * op + 58 * (1 - op);
      cg = cg * op + 20 * (1 - op);
      cb = cb * op + 26 * (1 - op);
    }

    const colOf = (vi) => {
      if (!colAttr) return [cr, cg, cb];
      const k0 = colAttr.getX(vi); const k1 = colAttr.getY(vi); const k2 = colAttr.getZ(vi);
      return [Math.min(255, cr * k0), Math.min(255, cg * k1), Math.min(255, cb * k2)];
    };

    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(pos, i0).applyMatrix4(mw);
      B.fromBufferAttribute(pos, i1).applyMatrix4(mw);
      C.fromBufferAttribute(pos, i2).applyMatrix4(mw);
      tris.push({
        v: [A.clone(), B.clone(), C.clone()],
        cols: [colOf(i0), colOf(i1), colOf(i2)],
        useFog, id,
      });
    }
  });
}

// ---------- 光栅化 ----------
const NEAR = -0.12;

function render(camPos, camTarget, W, H, fov) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.08, 180);
  cam.position.set(camPos[0], camPos[1], camPos[2]);
  cam.lookAt(camTarget[0], camTarget[1], camTarget[2]);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const viewMat = cam.matrixWorldInverse;
  const projMat = cam.projectionMatrix;

  const color = Buffer.alloc(W * H * 4);
  const mid = new Uint8Array(W * H);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i += 1) {
    color[i * 4] = FR; color[i * 4 + 1] = FG; color[i * 4 + 2] = FB; color[i * 4 + 3] = 255;
  }

  const v4 = new THREE.Vector4();
  let writes = 0;

  for (const t of tris) {
    const vtx = t.v.map((p, k) => ({ p: p.clone().applyMatrix4(viewMat), c: t.cols[k] }));
    let poly = vtx;
    if (vtx.some((o) => o.p.z > NEAR)) {
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
            p: new THREE.Vector3(
              cur.p.x + (nxt.p.x - cur.p.x) * tt,
              cur.p.y + (nxt.p.y - cur.p.y) * tt,
              NEAR,
            ),
            c: [
              cur.c[0] + (nxt.c[0] - cur.c[0]) * tt,
              cur.c[1] + (nxt.c[1] - cur.c[1]) * tt,
              cur.c[2] + (nxt.c[2] - cur.c[2]) * tt,
            ],
          });
        }
      }
      poly = out;
      if (poly.length < 3) continue;
    }

    const scr = poly.map((o) => {
      v4.set(o.p.x, o.p.y, o.p.z, 1).applyMatrix4(projMat);
      const iw = 1 / v4.w;
      return {
        x: (v4.x * iw * 0.5 + 0.5) * W,
        y: (1 - (v4.y * iw * 0.5 + 0.5)) * H,
        d: -o.p.z,
        c: o.c,
      };
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
          mid[pi] = t.id;
          let r = w0 * a.c[0] + w1 * b.c[0] + w2 * c.c[0];
          let g = w0 * a.c[1] + w1 * b.c[1] + w2 * c.c[1];
          let b2 = w0 * a.c[2] + w1 * b.c[2] + w2 * c.c[2];
          if (t.useFog) {
            const fg2 = 1 - Math.exp(-((CONFIG.fogRoom * d) ** 2));
            r += (FR - r) * fg2; g += (FG - g) * fg2; b2 += (FB - b2) * fg2;
          }
          // 曝光近似：之前用 ×1.55+8 对暗色偏袒得太厉害，会把游戏里根本看不见的
          // 暗物体渲染得很明显（尖牙就是这么被误判的）。改成更接近 ACES+sRGB 的档位。
          r = Math.min(255, r * 1.18 + 2);
          g = Math.min(255, g * 1.18 + 2);
          b2 = Math.min(255, b2 * 1.18 + 2);
          color[pi * 4] = r; color[pi * 4 + 1] = g; color[pi * 4 + 2] = b2; color[pi * 4 + 3] = 255;
          writes += 1;
        }
      }
    }
  }
  return { color, mid, W, H, writes };
}

function stats(res) {
  const { mid, W, H } = res;
  const cnt = new Array(8).fill(0);
  let minX = W; let maxX = -1; let minY = H; let maxY = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const id = mid[y * W + x];
      cnt[id] += 1;
      if (id >= 2 && id <= 4) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { cnt, bbox: maxX < 0 ? null : [minX, minY, maxX, maxY] };
}

function run(name, camPos, camTarget, W, H, fov, out) {
  const res = render(camPos, camTarget, W, H, fov);
  fs.writeFileSync(out, encodePNG(W, H, res.color));
  const st = stats(res);
  const total = W * H;
  const crack = st.cnt[2] + st.cnt[3] + st.cnt[4];
  console.log('=== ' + name + ' ===');
  console.log('  cam ' + JSON.stringify(camPos) + ' -> ' + JSON.stringify(camTarget) + ' fov=' + fov + '  ' + W + 'x' + H);
  for (let i = 1; i < 9; i += 1) {
    if (st.cnt[i]) console.log('   ' + String(LABEL[i]).padEnd(13) + String(st.cnt[i]).padStart(7) + '  (' + (st.cnt[i] / total * 100).toFixed(3) + '%)');
  }
  console.log('  裂缝合计 ' + crack + ' px (' + (crack / total * 100).toFixed(3) + '%)   包围盒 '
    + (st.bbox ? '[' + st.bbox.join(',') + '] 宽' + (st.bbox[2] - st.bbox[0] + 1) + ' 高' + (st.bbox[3] - st.bbox[1] + 1) : '无'));
  console.log('  -> ' + out);
  console.log('');
}

const ROOT = 'E:\\新建游戏项目';
run('A 广角：玩家站位 (0,1.62,4.2) 平视前墙', [0, 1.62, 4.2], [0, 2.60, -6.0], 960, 540, 70, ROOT + '\\_finalA.png');
run('B 中景：(0,1.62,1.0) 稍抬头', [0, 1.62, 1.0], [0, 2.85, -5.9], 960, 540, 70, ROOT + '\\_finalB.png');
run('C 近景：(0,1.62,-2.5) 仰视裂缝与天花板臂', [0, 1.62, -2.5], [0, 3.06, -5.6], 960, 540, 74, ROOT + '\\_finalC.png');
run('D 底部：低头看裂缝与地板的过渡', [0, 1.62, -3.2], [0, 0.55, -5.9], 960, 540, 74, ROOT + '\\_finalD.png');
run('E 走廊：从 z=8.6 看后墙（窗洞应透出黑色）', [0, 1.62, 8.6], [0, 1.60, 6.0], 960, 540, 70, ROOT + '\\_finalE.png');
run('F 眼睛特写：fov26 从 (0,1.62,0.5) 看眼睛', [0, 1.62, 0.5], [0, 2.42, -5.95], 960, 540, 26, ROOT + '\\_finalF.png');

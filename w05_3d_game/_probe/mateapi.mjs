/**
 * 同学模型接口的校验：换模型 / 隐藏自带五官 / 程序化回退。
 *
 * 背景：classmate_v01.glb 那张头网格把眼睛和嘴也烘进了材质槽
 * （Eye_White / Eye_Dark / Face_Shadow），尾声的红眼和尖牙挂上去会重影。
 * 这里查的就是四件事：
 *   1. 配置对象 MATE_MODEL / configureMateModel 的合并语义（没给的键不许被清掉）；
 *   2. applyFaceOverride 按「材质名」关掉五官，同头的皮肤头发不许误伤；
 *   3. createClassmate 走 'proc' 时同步交出可用模型（腿、材质、没有隐藏项）；
 *   4. safehouse.setMateModel 换皮后：位置/朝向/可见性/透明度不变、头高重量、
 *      红眼与尖牙重新挂好、旧模型不残留。
 *
 * 不需要浏览器，也不需要服务器（fetch 一律 reject，强制走程序化回退）。
 */
globalThis.document = {
  createElement(tag) {
    const el = { tagName: tag, width: 512, height: 512, style: {} };
    el.getContext = () => ({
      createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData() {}, fillRect() {}, clearRect() {}, drawImage() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {},
      measureText() { return { width: 10 }; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
    });
    return el;
  },
  createElementNS(ns, tag) { return this.createElement(tag); },
  body: { dataset: {} },
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.fetch = () => Promise.reject(new Error('probe: 离线'));
process.on('unhandledRejection', () => {});

const THREE = await import('../vendor/three.module.js');
const m2 = await import('../src/team/m2.js');
const { SAFEHOUSE, createSafehouse } = await import('../src/safehouse.js');

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (n, d = 3) => Number(n).toFixed(d);

const {
  MATE_MODEL, CLASSMATE_URL, PROCEDURAL_MATE,
  mateModelConfig, configureMateModel, applyFaceOverride, createClassmate,
} = m2;

// ───────────────────── 1. 默认配置 ─────────────────────
console.log('— 默认配置 —');
const d0 = mateModelConfig();
ok(d0.url === PROCEDURAL_MATE, '默认用程序化模型（旧 classmate_v01.glb 已丢失，靠 ?mate= 覆盖）', d0.url);
ok(eq(d0.hideMaterials, []),
  '默认不隐藏任何材质（程序化模型本来就没有五官面片可藏）', d0.hideMaterials.join(',') || '(空)');
ok(d0.scale === 1 && d0.yawOffset === 0 && d0.offsetY === 0, '默认不做缩放/转向/抬高',
  `scale=${d0.scale} yaw=${d0.yawOffset} y=${d0.offsetY}`);

d0.hideMaterials.push('Skin_Warm');
d0.scale = 99;
ok(eq(mateModelConfig().hideMaterials, []) && MATE_MODEL.scale === 1,
  'mateModelConfig 交出去的是拷贝，改它不会污染内部状态');

// ───────────────────── 2. configureMateModel 的合并语义 ─────────────────────
console.log('— configureMateModel —');
const c1 = configureMateModel('/assets/models/mate_v02.glb');
ok(c1.url === '/assets/models/mate_v02.glb' && eq(c1.hideMaterials, []),
  '只给 url：hideMaterials 这些没给的键保持原样（不会被清空）');

const c2 = configureMateModel(undefined, { scale: 1.12, offsetY: -0.03 });
ok(c2.url === '/assets/models/mate_v02.glb' && c2.scale === 1.12 && near(c2.offsetY, -0.03, 1e-9),
  'url 给 undefined：只改 scale / offsetY', `scale=${c2.scale} y=${c2.offsetY}`);

const c3 = configureMateModel(undefined, { scale: Number.NaN, yawOffset: Math.PI });
ok(c3.scale === 1.12 && near(c3.yawOffset, Math.PI, 1e-9), 'NaN 之类的脏数字被忽略，正常的照收',
  `scale=${c3.scale} yaw=${fmt(c3.yawOffset)}`);

const c4 = configureMateModel(undefined, { hideMaterials: [] });
ok(eq(c4.hideMaterials, []), 'hideMaterials 给空数组 = 保留 glb 自带的五官（模型本身没有五官时用这个）');

configureMateModel(undefined, { hideMaterials: ['Eye_White', 'Eye_Dark'] });
ok(eq(mateModelConfig().hideMaterials, ['Eye_White', 'Eye_Dark']), 'hideMaterials 可以只给一部分');

// ───────────────────── 3. applyFaceOverride ─────────────────────
console.log('— 按材质名隐藏五官 —');
function fakeHead(names) {
  // 复刻 GLTFLoader 的行为：一个头网格拆成多个 primitive ⇒ 每个 primitive 一个 Mesh
  const root = new THREE.Group();
  root.name = 'Classmate';
  const meshes = [];
  for (const name of names) {
    const mat = new THREE.MeshStandardMaterial({ name });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat);
    root.add(mesh);
    meshes.push(mesh);
  }
  return { root, meshes };
}

const head = fakeHead(['Eye_White', 'Eye_Dark', 'Face_Shadow', 'Hair_Black', 'Skin_Warm', 'Skin_Shadow']);
const hidden = applyFaceOverride(head.root, ['Eye_White', 'Eye_Dark', 'Face_Shadow']);
ok(eq([...hidden].sort(), ['Eye_Dark', 'Eye_White', 'Face_Shadow']), '返回真正关掉的材质名',
  hidden.join(','));
const byName = (n) => head.meshes.find((m) => m.material.name === n);
ok(['Eye_White', 'Eye_Dark', 'Face_Shadow'].every((n) => byName(n).material.visible === false),
  '眼睛和嘴的那三个材质槽被关掉（material.visible = false）');
ok(['Hair_Black', 'Skin_Warm', 'Skin_Shadow'].every((n) => byName(n).material.visible === true),
  '同一张头上的头发和皮肤没被误伤（这是按名字关、不是把整颗头藏了）');
ok(head.meshes.every((m) => m.visible === true), '网格本身没被隐藏（几何还在，只是不画那几个面片）');

const head2 = fakeHead(['Eye_White', 'Skin_Warm']);
ok(eq(applyFaceOverride(head2.root, []), []), 'hideMaterials 为空 = 什么都不动');
ok(head2.meshes.every((m) => m.material.visible === true), '空清单下材质仍可见');
ok(eq(applyFaceOverride(null, ['Eye_White']), []), 'root 为空时安全返回（不抛异常）');

// 合并网格（一个 Mesh 挂材质数组）也要能关：three 渲染时逐 group 看 material.visible
const merged = new THREE.Group();
const arrMat = [
  new THREE.MeshStandardMaterial({ name: 'Eye_White' }),
  new THREE.MeshStandardMaterial({ name: 'Skin_Warm' }),
];
merged.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), arrMat));
const hiddenMerged = applyFaceOverride(merged, ['Eye_White']);
ok(eq(hiddenMerged, ['Eye_White']) && arrMat[0].visible === false && arrMat[1].visible === true,
  '万一模型把一张网格合成多材质数组，也能按材质关');

// ───────────────────── 4. 程序化模型（'proc'）同步就位 ─────────────────────
console.log('— 程序化模型 —');
configureMateModel(PROCEDURAL_MATE, { hideMaterials: [] });
let readySync = false;
let readyArg = null;
const proc = createClassmate(THREE, { onReady: (g) => { readySync = true; readyArg = g; } });
ok(readySync === true, "'proc' 是同步就位：createClassmate 返回前 onReady 已经调用");
ok(readyArg === proc, 'onReady 收到的就是返回的那个组（同步回调时闭包变量还在 TDZ，只能靠参数）');
ok(proc.userData.legs.length >= 2 && proc.userData.arms.length >= 2, '腿和胳膊的关节数组都填好了',
  `legs=${proc.userData.legs.length} arms=${proc.userData.arms.length}`);
ok(proc.userData.materials.length > 0, '材质清单非空（逐帧改透明度要用它）',
  `${proc.userData.materials.length} 份`);
ok(eq(proc.userData.hiddenMaterials, []), '程序化模型没有自带五官，隐藏清单为空');
const procBox = new THREE.Box3().setFromObject(proc);
ok(near(procBox.min.y, 0, 0.02) && procBox.max.y > 1.5 && procBox.max.y < 2.0,
  '模型站在原点上、身高 ~1.7 米（换模型后的头高就是照它量的）',
  `y ∈ [${fmt(procBox.min.y)}, ${fmt(procBox.max.y)}]`);
ok(document.body.dataset.classmateModel === 'procedural', 'body.dataset.classmateModel 记成 procedural',
  document.body.dataset.classmateModel);
ok(document.body.dataset.classmateHidden === 'none', 'body.dataset.classmateHidden 记成 none（始终有值，方便核对）',
  document.body.dataset.classmateHidden);

// glb 路径失败 ⇒ 回退程序化，并记在 dataset 里（无头 dump-dom 就靠这个核对）
console.log('— glb 加载失败时的回退 —');
configureMateModel('/assets/models/does_not_exist.glb');
let readyAsync = false;
const fallbackGroup = createClassmate(THREE, { onReady: () => { readyAsync = true; } });
ok(readyAsync === false, 'glb 是异步的：刚返回时还没就位');
await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));
ok(readyAsync === true, '加载失败后 onReady 仍然会到（不会把演出卡住）');
ok(document.body.dataset.classmateModel === 'fallback', 'body.dataset.classmateModel 记成 fallback',
  document.body.dataset.classmateModel);
ok(fallbackGroup.userData.legs.length >= 2, '回退之后腿也有（还能正常走过去、扑过来）');

// ───────────────────── 5. safehouse.setMateModel 换皮 ─────────────────────
console.log('— safehouse.setMateModel —');
configureMateModel(CLASSMATE_URL);
const scene = new THREE.Scene();
const sh = createSafehouse(scene);
await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));

const info0 = sh.mateModelInfo();
ok(info0.ready === true, '安全屋里的同学就位了（离线 ⇒ 走程序化回退）');
ok(info0.eyes === 2 && info0.fangs === 17 && info0.eyeLight === true,
  '红眼 / 尖牙 / 眼灯各就各位', `eyes=${info0.eyes} fangs=${info0.fangs} light=${info0.eyeLight}`);

// ── 第十八轮：五官要真的贴在球面上，而且揭示过程里不许移动它们 ──
// ── 第十九轮：眼睛和牙改成照第五关 eyes_v01 / teeth_v01 两件怪物模型长 ──
{
  const g = sh.group.children.find((c) => c.name === 'Classmate');
  const eyes = [];
  const osseous = []; // 眼睛以外的球体（眶缘），用来确认没有瞳孔、也没有第三只眼
  let mouth = null;
  const fangs = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.parameters ?? {};
    if (o.geometry.type === 'SphereGeometry' && p.radius > 0.015 && p.radius < 0.03) eyes.push(o);
    else if (o.geometry.type === 'SphereGeometry' && p.radius === 1) osseous.push(o);
    if (o.geometry.type === 'BufferGeometry' && o.geometry.attributes.position?.count === 175) mouth = o;
    if (o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radialSegments === 8
      && o.geometry.parameters.height < 0.06) fangs.push(o);
  });
  ok(near(info0.headR, 0.165, 1e-6), '头半径取自程序化模型的 faceRig（不再按 glb 猜 0.135）',
    fmt(info0.headR));
  ok(eyes.length === 2, '两颗红眼都在', `${eyes.length} 颗`);
  ok(info0.halos === 4, '每只眼睛两层固定尺寸光晕', `${info0.halos} 层`);
  ok(Boolean(mouth), '嘴是一层几何体（靠改顶点咧嘴）');
  // eyes_v01：自发光 #ff2030 的裸眼球，没有瞳孔、没有眼睑
  const eyeHex = eyes.map((e) => e.material.color.getHex());
  ok(eyeHex.every((h) => h === 0xff2030), '眼睛是怪物那颗 Eye_Glow 的 #ff2030',
    eyeHex.map((h) => `#${h.toString(16)}`).join(' '));
  ok(eyes.every((e) => e.material.type === 'MeshBasicMaterial' && e.material.toneMapped === false),
    '眼睛用不受光的自发光材质（和游戏里渲染怪物眼睛一致）');
  ok(eyes.every((e) => e.geometry.type === 'SphereGeometry' && !e.children.length),
    '眼球就是一个整球：没有瞳孔、没有眼白分层');
  ok(osseous.length === 2, '眶缘是两只压扁的炭黑球（face_v01 的 Face_Charcoal #0d0809）',
    `${osseous.length} 个`);
  ok(osseous.every((s) => s.material.color.getHex() === 0x0d0809 && near(s.material.roughness, 1.0, 1e-9)),
    '眶缘颜色/粗糙度就取怪物脸那套 #0d0809 / roughness 1.0');
  // 左右不完全对称（球径、高度、进深各差一点），不然像镜像贴上去的
  const eyeRadii = eyes.map((e) => e.geometry.parameters.radius).sort((a, b) => a - b);
  ok(Math.abs(eyeRadii[0] - eyeRadii[1]) > 1e-3, '左右眼球径不一样（故意不对称）',
    eyeRadii.map((r) => fmt(r, 4)).join(' / '));
  for (const e of eyes) {
    const d = Math.hypot(e.position.x, e.position.y - info0.headY, e.position.z);
    ok(d > info0.headR, '红眼球心在头皮外面（不会沉进头里）', `距头心 ${fmt(d)} > 半径 ${fmt(info0.headR)}`);
  }

  // teeth_v01：17 颗（上 9 下 8）、错开半齿、牙尖 = 牙根的 52%
  ok(fangs.length === 17, '上 9 下 8，一共 17 颗牙（照 teeth_v01 的排布）', `${fangs.length} 颗`);
  const upper = fangs.filter((f) => f.geometry.parameters.radiusTop > f.geometry.parameters.radiusBottom);
  const lower = fangs.filter((f) => f.geometry.parameters.radiusTop < f.geometry.parameters.radiusBottom);
  ok(upper.length === 9 && lower.length === 8, '上排 9 颗、下排 8 颗', `${upper.length} / ${lower.length}`);
  // 第二十一轮：嘴变成一道「向上弯的笑弧」，唇线在每一列的 y 都不同，
  // 于是「上排在上、下排在下」得按各列自己的唇线量，不能再拿嘴心水平面当基准。
  // （GLB 加载失败会整组重建五官，重建后的嘴默认是闭的，所以这里再确认一次咧到底。）
  sh.setReveal(1, 1);
  const lips = [];
  {
    const pos = mouth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) lips.push([pos.getX(i), pos.getY(i)]);
  }
  const lipAt = (x) => {
    const ys = lips.filter(([vx]) => Math.abs(vx - x) <= 0.013).map(([, vy]) => vy);
    return ys.length ? { lo: Math.min(...ys), hi: Math.max(...ys), mid: ys.reduce((a, b) => a + b, 0) / ys.length } : null;
  };
  // 牙的坐标是相对嘴心（fangGroup）的，换算到嘴补片的坐标系只差一个 MOUTH_DY
  const mouthDy = fangs[0].parent.position.y - info0.headY;
  const toothY = (f) => f.position.y + mouthDy;
  const ratios = fangs.map((f) => {
    const p = f.geometry.parameters;
    return Math.min(p.radiusTop, p.radiusBottom) / Math.max(p.radiusTop, p.radiusBottom);
  });
  ok(ratios.every((r) => near(r, 0.52, 1e-9)), '每颗牙的牙尖都收到牙根的 52%（钝头，不是针）',
    `${fmt(Math.min(...ratios), 4)}–${fmt(Math.max(...ratios), 4)}`);
  const upperX = upper.map((f) => f.position.x).sort((a, b) => a - b);
  const lowerX = lower.map((f) => f.position.x);
  // 每颗牙的 x 都带 ±0.18 齿距的手抖，所以齿距用「相邻间距的平均」，不用首尾差
  let gapSum = 0;
  for (let i = 1; i < upperX.length; i += 1) gapSum += upperX[i] - upperX[i - 1];
  const pitch = gapSum / (upperX.length - 1);
  ok(near(pitch, 0.0222, 1e-3), '同排齿距 0.0222 m', fmt(pitch, 4));
  const stagger = lowerX.map((x) => Math.min(...upperX.map((u) => Math.abs(u - x))));
  ok(stagger.every((s) => s > pitch * 0.25 && s < pitch * 0.75),
    '下排错开半个齿距（8 颗对 9 颗，天然咬合）', `${fmt(Math.min(...stagger), 4)}–${fmt(Math.max(...stagger), 4)}`);
  // 每颗牙都在自己那一列的唇线上下：上排在笑弧上方、下排在下方
  const aboveMid = upper.filter((f) => {
    const lip = lipAt(f.position.x);
    return lip && toothY(f) > lip.mid;
  });
  const belowMid = lower.filter((f) => {
    const lip = lipAt(f.position.x);
    return lip && toothY(f) < lip.mid;
  });
  ok(aboveMid.length === 9 && belowMid.length === 8,
    '上排 9 颗都在笑弧上方、下排 8 颗都在弧线下方（按各列唇线量，不是按嘴心水平面）',
    `${aboveMid.length} / ${belowMid.length}`);
  ok(fangs.every((f) => f.material.type === 'MeshBasicMaterial' && f.material.vertexColors === true),
    '牙用不受光 + 顶点色的材质（和游戏里渲染怪物那 17 颗牙一致）');
  ok(fangs.every((f) => f.geometry.attributes.color && f.geometry.attributes.color.count > 0),
    '每颗牙都带一层根部脏色的顶点色', `顶点色 ${fangs.filter((f) => f.geometry.attributes.color).length}/${fangs.length}`);

  const eyeStart = eyes.map((e) => e.position.toArray());
  const fangStart = fangs.map((f) => f.position.toArray());
  const fangScale = fangs.map((f) => f.scale.toArray());
  const fangGroupY = fangs[0].parent.position.toArray();
  sh.setReveal(0, 0);
  const closedY = [];
  for (let i = 0; i < mouth.geometry.attributes.position.count; i += 1) {
    closedY.push(mouth.geometry.attributes.position.getY(i));
  }
  const spanClosed = Math.max(...closedY) - Math.min(...closedY);
  sh.setReveal(1, 1);
  const spanOpen = (() => {
    const ys = [];
    for (let i = 0; i < mouth.geometry.attributes.position.count; i += 1) {
      ys.push(mouth.geometry.attributes.position.getY(i));
    }
    return Math.max(...ys) - Math.min(...ys);
  })();
  const moved = eyes.some((e, i) => e.position.toArray().some((v, k) => Math.abs(v - eyeStart[i][k]) > 1e-9));
  ok(!moved, '红眼从「灭」到「全亮」位置一点没动（不是从下方升上来）');
  const fangsMoved = fangs.some((f, i) => f.position.toArray().some((v, k) => Math.abs(v - fangStart[i][k]) > 1e-9));
  ok(!fangsMoved, '17 颗牙从闭到咧到底位置一点没动（只淡入，不长出来）');
  ok(fangs.every((f, i) => f.scale.toArray().every((v, k) => Math.abs(v - fangScale[i][k]) < 1e-9)),
    '牙的缩放也一直不变（没有偷偷长大）');
  ok(fangs[0].parent.position.toArray().every((v, k) => Math.abs(v - fangGroupY[k]) < 1e-9),
    '牙的挂点（嘴心）也没挪过');
  ok(near(eyes[0].material.opacity, 1, 1e-9), '亮起来靠的是不透明度', fmt(eyes[0].material.opacity));
  ok(spanOpen > spanClosed * 3, '咧嘴把嘴的高度撑开了', `${fmt(spanClosed)} → ${fmt(spanOpen)}`);
  const meanY = closedY.reduce((a, b) => a + b, 0) / closedY.length;
  ok(meanY < -0.03, '嘴在头心下方（不是长在额头上）', `平均 y ${fmt(meanY)}`);
  // 第二十一轮：这道缝必须是「笑着的」—— 嘴角明显高于嘴心（怪物那口 GRIN_LIFT/HALF ≈ 0.435，
  // 这里抬 0.030 / 半幅 0.093 ≈ 0.32，同一个量级但没那么夸张）
  const bandMean = (pred) => {
    const ys = lips.filter(([vx]) => pred(Math.abs(vx))).map(([, vy]) => vy);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  };
  const cornerY = bandMean((ax) => ax > 0.07);
  const centreY = bandMean((ax) => ax < 0.01);
  ok(cornerY - centreY > 0.02, '嘴是一道向上弯的笑弧（嘴角比嘴心高两厘米以上）',
    `嘴角 ${fmt(cornerY)} − 嘴心 ${fmt(centreY)} = ${fmt(cornerY - centreY)}`);
  ok(near(fangs[0].material.opacity, 1, 1e-9), '嘴裂开之后尖牙淡入到完全不透明', fmt(fangs[0].material.opacity));
  // 上排牙根 + 下排牙根都得藏在唇线里。第二十一轮唇线是弯的，
  // 所以改成「每颗牙的根部都落在它自己那一列的唇线以内」，而不是拿嘴心半高去套。
  const rootOut = [];
  for (const f of fangs) {
    const lip = lipAt(f.position.x);
    if (!lip) { rootOut.push(`${fmt(f.position.x)}:无唇线`); continue; }
    const half = f.geometry.parameters.height / 2;
    const isUpper = f.geometry.parameters.radiusTop > f.geometry.parameters.radiusBottom;
    const rootY = toothY(f) + (isUpper ? half : -half);
    if (isUpper ? rootY > lip.hi + 1e-3 : rootY < lip.lo - 1e-3) {
      rootOut.push(`${fmt(f.position.x)}:根 ${fmt(rootY)} 越界 [${fmt(lip.lo)}, ${fmt(lip.hi)}]`);
    }
  }
  ok(rootOut.length === 0, '两排牙的牙根都塞在笑弧的唇线以内（弧线抬起来的嘴角也一样）',
    rootOut.length ? rootOut.join(' ') : '17/17 在唇内');
  // 嘴的所有顶点都必须落在半径 Rc = headR * 1.02 的球面上
  const pos = mouth.geometry.attributes.position;
  let maxErr = 0;
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
    maxErr = Math.max(maxErr, Math.abs(r - info0.headR * 1.02));
  }
  ok(maxErr < 1e-6, '嘴的每个顶点都在头皮外 2% 的那层球面上（不陷、不飘）', `最大误差 ${maxErr.toExponential(1)}`);
  sh.setReveal(0, 0);
  ok(near(eyes[0].material.opacity, 0, 1e-9) && fangs[0].material.opacity === 0,
    '归零之后红眼和尖牙都灭了');
}

sh.setMateVisible(true);
sh.placeMate(SAFEHOUSE.mateStation.x, SAFEHOUSE.mateStation.z, -Math.PI / 2);
sh.setReveal(1);
sh.setMateOpacity(0.8);
const before = {
  chest: sh.mateChestPoint(),
  yaw: sh.mateYaw(),
  headY: sh.headHeight(),
  visible: sh.mateModelInfo().ready,
};

const sw = sh.setMateModel(PROCEDURAL_MATE, { hideMaterials: [] });
ok(sw.url === PROCEDURAL_MATE, 'setMateModel 返回换完之后的配置', sw.url);
const info1 = sh.mateModelInfo();
ok(info1.ready === true, '换完立刻可用（proc 是同步的）');
ok(near(info1.headY, before.headY, 1e-9), '头高重新量过且一致', `${fmt(info1.headY)} / ${fmt(before.headY)}`);
const after = sh.mateChestPoint();
ok(near(after.x, before.chest.x, 1e-9) && near(after.z, before.chest.z, 1e-9),
  '换皮不动位置（站位原样保留）', `x=${fmt(after.x)} z=${fmt(after.z)}`);
ok(near(sh.mateYaw(), before.yaw, 1e-9), '换皮不动朝向', fmt(sh.mateYaw()));
ok(info1.eyes === 2 && info1.fangs === 17 && info1.eyeLight === true,
  '红眼和尖牙在换皮后重新挂好了（不是挂在旧模型上的孤儿）');
ok(info1.reveal === 1, '揭示进度保留（换皮不会把眼睛熄灭）', `reveal=${info1.reveal}`);

const mateGroups = sh.group.children.filter((c) => c.name === 'Classmate');
ok(mateGroups.length === 1, '场景里只剩一个同学（旧模型被摘掉了）', `${mateGroups.length} 个`);

// 换成一个假 glb：位置/朝向/透明度还得在，加载失败也只是回退
const sw2 = sh.setMateModel('/assets/models/nope.glb');
ok(sw2.url === '/assets/models/nope.glb', '可以换成任意 glb 路径', sw2.url);
await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));
const info2 = sh.mateModelInfo();
ok(info2.ready === true, '假 glb 失败后仍然就位（回退程序化）');
const after2 = sh.mateChestPoint();
ok(near(after2.x, before.chest.x, 1e-9) && near(after2.z, before.chest.z, 1e-9),
  '异步回退也不会把人挪走', `x=${fmt(after2.x)} z=${fmt(after2.z)}`);
ok(near(sh.mateYaw(), before.yaw, 1e-9), '异步回退也不动朝向', fmt(sh.mateYaw()));
ok(sh.group.children.filter((c) => c.name === 'Classmate').length === 1, '还是只有一个同学');

// reset 之后又回到出厂状态（换过模型也要能 reset）
sh.reset();
const info3 = sh.mateModelInfo();
ok(info3.reveal === 0 && info3.eyes === 2, 'reset 把揭示进度归零，眼睛还在（下次能再亮）');

console.log('');
if (fail > 0) {
  console.log(`${fail} 项失败`);
  process.exit(1);
}
console.log('全部通过');
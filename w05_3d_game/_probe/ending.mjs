/**
 * 终局（ending）时间轴与镜头的死板校验：不需要浏览器，不需要服务器。
 *
 * 用的是真的 Game / Player / 相机 / 安全屋，只把 hud、audio、level 换成记录器。
 * 每帧按游戏里的真实顺序推进：
 *   player.update(dt) → game.updateEnding(dt) → game.applyEndingCamera()
 *
 * 查的是「错了在浏览器里也看不出来、但一定会出问题」的那些点：
 * 时间轴顺序、瞬移只能发生在全白那一帧、白/黑 alpha 的极值、
 * 同学的落点与朝向、后仰位移不会累积、曝光/雾/光的收敛、
 * 一次性音效只响一次、以及 abortEnding 有没有把东西还原干净。
 */
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
globalThis.matchMedia = () => ({ matches: false });
globalThis.fetch = () => Promise.reject(new Error('probe: 离线'));
process.on('unhandledRejection', () => {});

const THREE = await import('../vendor/three.module.js');
const { CONFIG } = await import('../src/config.js');
const { LAYOUT } = await import('../src/layout.js');
const { Player } = await import('../src/player.js');
const { Game, END_STAGE, END_BREATH_PERIOD, END_PANT_AT, END_EXHALE_AT } = await import('../src/game.js');
const { SAFEHOUSE, createSafehouse } = await import('../src/safehouse.js');
const { copy } = await import('../src/team/p1.js');

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const fmt = (n, d = 2) => Number(n).toFixed(d);

// ───────────────────────── 桩：hud / audio / level ─────────────────────────

class FakeHud {
  constructor() {
    this.alpha = { white: 0, black: 0 };
    this.subtitle = '';
    this.panel = null;
  }
  setFade(kind, a) { this.alpha[kind] = a; }
  fadeWhite(a) { this.alpha.white = a; }
  fadeBlack(a) { this.alpha.black = a; }
  clearFade() { this.alpha.white = 0; this.alpha.black = 0; }
  setSubtitle(text) { this.subtitle = text; }
  showPanel(mode, title, body) { this.panel = { mode, title, body }; }
  hidePanel() { this.panel = null; }
  showMenu() {} showPlay() {} setChase() {} setDanger() {} setObjective() {}
  setPrompt() {} setAimHot() {} setTension() {} setRecord() {} setCameraState() {}
  showDemoNote() {}
}

class FakeAudio {
  constructor() { this.calls = {}; }
  _t(name) { this.calls[name] = (this.calls[name] ?? 0) + 1; }
  update() {} setMood() {} dronePitch() {} setTension() {} duckAmbient() {} startMusic() {}
  startDrone() { this._t('startDrone'); }
  startHeartbeat() { this._t('startHeartbeat'); }
  stopHeartbeat() { this._t('stopHeartbeat'); }
  thump() {} footstep() { this._t('footstep'); } monsterStep() {} stinger() { this._t('stinger'); }
  shutter() {} door() { this._t('door'); } scratch() {} breath() { this._t('breath'); }
  pant(total, opts = {}) { this._t('pant'); this.pantTotal = total; this.pantOpts = opts; }
  blip() {} win() {} lose() { this._t('lose'); } tone() { this._t('tone'); }
  burst() { this._t('burst'); } cameraDown() {}
  scream() { this._t('scream'); }
  setMouthOpen() {} playSample() {} startLoop() {} stopLoop() {} setLoop() {}
}

class FakeLevel {
  constructor() {
    this.loopEnabled = true;
    this.doorGlow = 0;
    this.endDoorOpen = 0;
    this.hallLampScale = 1;
    this.exitGlow = 0;
    this.hemiOverride = null;
    this.hidden = false;
  }
  setExitGlow(v) { this.exitGlow = v; }
  setDoorGlow(v) { this.doorGlow = v; }
  openEndDoor(v) { this.endDoorOpen = v; }
  setHallLampScale(v) { this.hallLampScale = v; }
  setHemi(v) { this.hemiOverride = v; }
  setVisible(on) { this.hidden = !on; }
  endDoorAimPoint() { return new THREE.Vector3(LAYOUT.doorCenterX, 1.35, LAYOUT.hall.z); }
  getColliders() { return []; }
  update() {} stepItems() {} reset() {}
  showClassmateEyes() {} turnClassmate() {}
  isInsideRoom() { return true; }
  nearPickup() { return false; }
}

// ───────────────────────── 真家伙 ─────────────────────────

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07080c, CONFIG.fogCalm);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
const safehouse = createSafehouse(scene);
const player = new Player(camera);
player.reset(LAYOUT.doorwayX - 1.2, LAYOUT.hall.z, -Math.PI / 2);
const hud = new FakeHud();
const audio = new FakeAudio();
const level = new FakeLevel();
const canvas = { addEventListener() {}, requestPointerLock() {} };
const game = new Game({ scene, camera, canvas, hud, audio, level, player, safehouse });
game.baseExposure = CONFIG.exposure;

// 记下每次「进段」那一瞬间的状态：瞬移/换场景的真实时序只能在这里看
const entries = {};
const origEnter = game.enterEndStage.bind(game);
game.enterEndStage = function patched() {
  const before = {
    stage: game.endStage,
    t: game.endT,
    white: hud.alpha.white,
    black: hud.alpha.black,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    levelHidden: level.hidden,
    safeVisible: safehouse.group.visible,
  };
  origEnter();
  entries[game.endStage] = {
    ...before,
    xAfter: player.x,
    zAfter: player.z,
    yawAfter: player.yaw,
    levelHiddenAfter: level.hidden,
    safeVisibleAfter: safehouse.group.visible,
  };
};

const DT = 1 / 60;
const trace = [];
function frame() {
  player.update(DT, level.getColliders());
  game.updateEnding(DT);
  game.applyEndingCamera();
  trace.push({
    stage: game.endStage,
    t: game.endT,
    phase: game.phase,
    white: hud.alpha.white,
    black: hud.alpha.black,
    sub: hud.subtitle,
    x: player.x,
    yaw: player.yaw,
    pitch: player.pitch,
    camX: camera.position.x,
    camY: camera.position.y,
    pitchOff: camera.rotation.x - player.pitch,
    mateX: safehouse.mateChestPoint().x,
    mateYaw: safehouse.mateYaw(),
    doorAngle: safehouse.doorAngle(),
  });
}
/** 一直推进到第 n 段（不含）。 */
function untilStage(n) {
  for (let g = 0; g < 5000 && game.phase !== 'badEnd' && game.endStage < n; g += 1) frame();
}
/** 从当前处在的第 n 段开头，一直跑到它是去下一段的那一帧为止。 */
function runStage(n) {
  untilStage(n);
  for (let g = 0; g < 5000 && game.phase !== 'badEnd' && game.endStage === n; g += 1) frame();
}
const framesOf = (n) => trace.filter((f) => f.stage === n);
const lastOf = (n) => framesOf(n).pop();

// ───────────────────────── 1. 时间轴表 ─────────────────────────
console.log('── 时间轴 ──');
ok(Array.isArray(END_STAGE) && END_STAGE.length === 13, '时间轴 13 段', `${END_STAGE.length} 段`);
ok(END_STAGE.every((d) => d > 0), '每段时长都为正');
const total = END_STAGE.reduce((a, b) => a + b, 0);
ok(near(total, 18.80, 0.02), '总时长 ≈ 18.80s（第 9 幕从 1.20 加到 2.10：亮眼 0.85s + 咧嘴 1.90s）', `${fmt(total)}s`);
console.log(`     分段：${END_STAGE.map((d) => fmt(d)).join(' / ')}`);
ok(END_STAGE[1] > 0.45, '阶段 1 够长：0.45s 涨满 + 至少 0.10s 按住', `${fmt(END_STAGE[1])}s`);
ok(END_STAGE[2] >= 0.30, '阶段 2（全白换场）≥ 0.30s，够遮住一次场景整体切换', `${fmt(END_STAGE[2])}s`);
ok(END_STAGE[12] >= 1.0, '阶段 12 纯黑 ≥ 1.0s 再出卡', `${fmt(END_STAGE[12])}s`);

// ───────────────────────── 2. beginEnding 的入场状态 ─────────────────────────
console.log('── 入场 ──');
game.beginEnding();
ok(game.phase === 'ending', 'beginEnding 后进入 ending', game.phase);
ok(game.endStage === 0 && game.endT === 0, '从阶段 0 起算');
ok(level.loopEnabled === false, '走廊循环停掉（不再生成怪）');
ok(level.hallLampScale === 0, '走廊灯全灭：只剩门是亮的');
ok(level.doorGlow === 1, '门光接住追逐的满值（不归零：否则会灭一下再亮）', `${level.doorGlow}`);
ok(level.exitGlow === 0.35, 'EXIT 灯牌压到 0.35（还看得见，但夺不走注意力）', `${level.exitGlow}`);
ok(player.controlEnabled === false && player.scripted === true, '玩家交出了键鼠');
ok(!!player.lookTarget, '镜头锁在门上（不是自由视角）');
ok(hud.subtitle === '' && hud.alpha.white === 0 && hud.alpha.black === 0, '起始没有任何残留的字和遮罩');

// 阶段 0：门光涨满 + 门开一条缝
runStage(0);
ok(near(level.doorGlow, 1, 0.001), '阶段 0 结束：门光涨满', fmt(level.doorGlow, 3));
ok(near(level.endDoorOpen, 0.12, 0.001), '门开 0.12 弧度，先漏一道光', fmt(level.endDoorOpen, 3));
ok(near(lastOf(0).x, LAYOUT.doorwayX - 1.2, 0.02), '阶段 0 人还没动', `x=${fmt(lastOf(0).x)}`);
// 第二十七轮：跑到门口那一声 breath() 已经删掉 —— 用户说「从靠近发光门到刚进安全屋
// 这段时间的喘息声很混乱」，喘气只该出现在**刚进新场景**（安全屋）的低头那一段。
ok((audio.calls.breath ?? 0) === 0, '跑到门口这一路**没有**喘气（只剩安全屋那一段）',
  `breath×${audio.calls.breath ?? 0}`);

// ───────────────────────── 3. 白光 → 瞬移 ─────────────────────────
console.log('── 白光与瞬移 ──');
runStage(1);
const s1 = framesOf(1);
ok(near(lastOf(1).white, 1, 1e-6), '阶段 1 结束时白屏已经满', fmt(lastOf(1).white, 3));
ok(near(lastOf(1).x, LAYOUT.doorwayX - 1.2 + 0.15, 0.01), '阶段 1 只让重心往前 15cm，脚没动',
  `x=${fmt(lastOf(1).x, 3)}`);
ok(s1.every((f, i) => i === 0 || f.white >= s1[i - 1].white), '白光是单调涨上去的，没有闪回');

runStage(2);
const e2 = entries[2];
ok(!!e2, '进入了阶段 2');
ok(e2.white >= 0.999, '瞬移之前白屏已经是 1（这个顺序不能反）', fmt(e2.white, 3));
ok(near(e2.xAfter, SAFEHOUSE.spawn.x, 1e-6) && near(e2.zAfter, SAFEHOUSE.spawn.z, 1e-6),
  '阶段 2 把玩家搬到安全屋出生点', `(${fmt(e2.xAfter)}, ${fmt(e2.zAfter)})`);
ok(e2.levelHiddenAfter === true, '同一帧把走廊整组藏掉');
ok(e2.safeVisibleAfter === true, '同一帧让安全屋显形');
ok(near(e2.yawAfter, SAFEHOUSE.spawn.yaw, 1e-6), '落地朝向 = 出生朝向（背对门）', fmt(e2.yawAfter, 3));

// 整段演出里只有这一处瞬移
const jumps = [];
for (let i = 1; i < trace.length; i += 1) {
  const d = Math.abs(trace[i].x - trace[i - 1].x);
  if (d > 0.3) jumps.push({ stage: trace[i].stage, d });
}
ok(jumps.length === 1 && jumps[0].stage === 2, '全程只瞬移一次，就在阶段 2',
  jumps.map((j) => `段${j.stage}:${fmt(j.d)}m`).join(' ') || '无跳变');
const heldWhite = trace.filter((f) => (f.stage === 1 && f.t > 0.46) || f.stage === 2);
ok(heldWhite.length >= 24 && heldWhite.every((f) => f.white === 1),
  '白屏涨满后全程按住 1（0.10 + 0.35 ≈ 0.45s 全白）', `${heldWhite.length} 帧`);

// ───────────────────────── 4. 显影：雾/光/曝光 ─────────────────────────
console.log('── 显影 ──');
runStage(3);
ok(near(scene.fog.density, CONFIG.fogSafe, 1e-6), '雾退到安全屋的值', fmt(scene.fog.density, 4));
ok(near(level.hemiOverride, CONFIG.hemiSafe, 1e-6), '半球光抬到安全屋的值', fmt(level.hemiOverride, 3));
ok(near(CONFIG.exposure, CONFIG.exposureSafe, 1e-6), '曝光抬到安全屋的值（改的是 CONFIG，main 每帧会写回渲染器）',
  fmt(CONFIG.exposure, 3));
ok(near(hud.alpha.white, 0, 1e-6), '白光退干净', fmt(hud.alpha.white, 3));
ok(safehouse.group.visible === true, '安全屋已经显形');
ok(audio.calls.startDrone === 1, '安全屋的环境声起一次', `startDrone×${audio.calls.startDrone}`);
const stage3 = framesOf(3);
const stage4First = framesOf(4)[0];
ok(stage3[0].white > 0.9
  && stage3.every((f, i) => i === 0 || f.white <= stage3[i - 1].white)
  && stage4First && stage4First.white === 0,
  '白光在阶段 3 里从满单调退到 0，进安全屋那一刻已经没有白膜',
  `${fmt(stage3[0].white, 3)} → ${fmt(stage3[stage3.length - 1].white, 3)} → ${fmt(stage4First?.white ?? NaN, 3)}`);

// ───────────────────────── 5. 低头喘气 → 转身 ─────────────────────────
console.log('── 低头与转身 ──');
runStage(4);
const stage4 = framesOf(4);
ok(stage4[stage4.length - 1].pitchOff < -0.3, '阶段 4 一直低着头（镜头 pitch 附加量为负）',
  fmt(stage4[stage4.length - 1].pitchOff, 3));
const span = stage4.map((f) => f.pitchOff);
ok(Math.max(...span) - Math.min(...span) > 0.1, '低头量在呼吸里起伏（不是死住一个角度）',
  `摆幅 ${fmt(Math.max(...span) - Math.min(...span), 3)}`);
const bobSpan = stage4.map((f) => Math.abs(f.camY - player.eyeY()));
ok(Math.max(...bobSpan) <= 0.014, '呼吸带起来的身子起伏不超过 1.4cm', `max ${fmt(Math.max(...bobSpan) * 100, 2)}cm`);
// 第二十七轮：用户要「喘气声只在刚进新场景时出现，频率和主视角低头频率一致」。
// 所以这一段既是唯一一条 pant()，又必须把 period 传进去、和镜头共用 `END_BREATH_PERIOD`。
ok((audio.calls.pant ?? 0) === 1, '安全屋低头那一段是**唯一**一条喘气（pant×1，门口那声已删）',
  `pant×${audio.calls.pant ?? 0} / breath×${audio.calls.breath ?? 0}`);
// 第二十八轮：镜头这一段一共低三次头（本段 0.32 / 1.37 秒 + 第 5 段开头 2.42 秒），
// 用户要「三下随节奏的连贯清晰喘息」。pant() 的收尾判断是
// `at + EXHALE_AT + 0.44 > total` 就丢拍，所以 2.30 只能排两拍、第三拍是哑的。
ok(fmt(audio.pantTotal ?? 0) >= 3.30 && audio.pantTotal <= 3.50,
  '这条喘气排三拍（total 3.30–3.50 秒：0 / 1.05 / 2.10 秒，第三拍留得起 0.74 秒收尾）',
  `${fmt(audio.pantTotal ?? 0, 2)}s`);
ok(fmt(audio.pantTotal ?? 0) >= 2 * END_BREATH_PERIOD + 0.30 + 0.44,
  'total 撑得过第三拍吸气的那道收尾线（2×period + 呼气偏移 + 吸气长 = 2.84 秒）',
  `${fmt(audio.pantTotal ?? 0, 2)}s ≥ ${fmt(2 * END_BREATH_PERIOD + 0.30 + 0.44, 2)}s`);
ok(Math.abs((audio.pantOpts?.period ?? 0) - END_BREATH_PERIOD) < 1e-9,
  'pant() 的拍子就是镜头的低头周期（period === END_BREATH_PERIOD）',
  `period ${fmt(audio.pantOpts?.period ?? 0, 3)}s / 常量 ${fmt(END_BREATH_PERIOD, 3)}s`);
ok((audio.calls.breath ?? 0) === 0, '单口 breath() 一声都不放了（它退成兜底接口）',
  `breath×${audio.calls.breath ?? 0}`);
// 镜头这边也量一遍：阶段 4 里 pitchOff 的两次最低点必须正好隔一个 period
const mins = [];
for (let i = 1; i < stage4.length - 1; i += 1) {
  if (stage4[i].pitchOff < stage4[i - 1].pitchOff && stage4[i].pitchOff <= stage4[i + 1].pitchOff) mins.push(stage4[i].t);
}
ok(mins.length === 2 && Math.abs((mins[1] - mins[0]) - END_BREATH_PERIOD) < 0.04,
  '第 4 段镜头低头两次（第三下骑在第 5 段开头，见下），两次最低点正好隔一个低头周期',
  `${mins.map((v) => fmt(v, 2)).join('/')} → 间隔 ${fmt((mins[1] ?? 0) - (mins[0] ?? 0), 3)}s`);
ok(Math.abs(mins[0] - (END_PANT_AT + END_EXHALE_AT)) < 0.04,
  '第一下低头的最低点 = 吸气起点 + 呼气偏移（呼气起、头沉下）',
  `${fmt(mins[0] ?? 0, 3)}s vs ${fmt(END_PANT_AT + END_EXHALE_AT, 3)}s`);

runStage(5);
ok(near(lastOf(5).pitchOff, 0, 1e-6), '阶段 5 结束时低头量完全退掉（抬头看门）',
  fmt(lastOf(5).pitchOff, 6));
// 第三下低头正好骑在第 4/5 段的接缝上：本段扫不出它（本段最后一帧已经沉到底），
// 所以在这里补一刀 —— 第 5 段一开头头还在最低位，第三拍的呼气就压在这一下上。
const s5first = framesOf(5).slice(0, 4);
ok(s5first.some((f) => f.pitchOff < -0.60), '第三下低头落在第 5 段开头（头仍在最低位，喘气这一拍才不哑）',
  s5first.map((f) => `${fmt(f.t, 3)}=${fmt(f.pitchOff, 3)}`).join(' '));
const s5settle = framesOf(5).find((f) => f.t >= 0.75);
ok(s5settle && Math.abs(s5settle.pitchOff) < 0.01, '摆动到 0.75s 已经收干净（不再跟着喘）',
  `t=${fmt(s5settle?.t ?? 0, 2)} pitchOff=${fmt(s5settle?.pitchOff ?? 0, 4)}`);
ok(near(player.yaw, Math.PI / 2, 0.03), '转身后朝向 -X（门的方向）',
  `yaw=${fmt(player.yaw, 3)}（+π/2=${fmt(Math.PI / 2, 3)}）`);
ok(audio.calls.door === 1, '门内那一声响在阶段 5 响一次', `door×${audio.calls.door}`);
// 「先听到响动，再回头」：t≈0.10 时还是背对门的出生朝向，t≈0.9 已经转过去
const s5 = framesOf(5);
const early = s5.find((f) => f.t >= 0.10);
const last5 = s5[s5.length - 1];
ok(near(early.yaw, SAFEHOUSE.spawn.yaw, 0.04), '门响的时候他还没回头（仍是出生朝向）',
  `yaw=${fmt(early.yaw, 3)} @t=${fmt(early.t, 2)}`);
ok(near(last5.yaw, Math.PI / 2, 0.03), '回头在门响之后才发生（阶段 5 结束前转到位）',
  `yaw=${fmt(last5.yaw, 3)} @t=${fmt(last5.t, 2)}`);
ok(early.pitchOff < -0.3, '门响的那一下他还低着头', `pitchOff=${fmt(early.pitchOff, 3)}`);
// 回头第一眼：他已经背对着玩家站在门口，门正在往回带
const firstLook = s5.find((f) => f.t >= 0.55);
ok(near(firstLook.mateYaw, -Math.PI / 2, 0.03), '回头第一眼：同学面朝门（背对玩家）',
  `mateYaw=${fmt(firstLook.mateYaw, 3)}（−π/2=${fmt(-Math.PI / 2, 3)}）`);
ok(near(firstLook.mateX, SAFEHOUSE.mateStation.x, 0.03), '他就站在门口内侧的站位上（没有从门外走进来）',
  `x=${fmt(firstLook.mateX)}`);
ok(firstLook.doorAngle > 0.3, '这时候门是半掩的（已经开过，正在关）', `angle=${fmt(firstLook.doorAngle, 3)}`);

// ───────────────────────── 6. 背对玩家把门带上 ─────────────────────────
console.log('── 同学背对关门 ──');
runStage(6);
const endStage6 = lastOf(6);
const stationErr = Math.hypot(
  safehouse.mateChestPoint().x - SAFEHOUSE.mateStation.x,
  safehouse.mateChestPoint().z - SAFEHOUSE.mateStation.z,
);
ok(stationErr < 0.02, '他一直在站定点上（误差 < 2cm）', `${fmt(stationErr * 1000, 1)}mm`);
ok(endStage6.doorAngle < 0.05, '门已经带上了', `angle=${fmt(endStage6.doorAngle, 3)}`);
ok(audio.calls.door === 2, '门声一共 2 次：门内那一声 + 关实那一声', `door×${audio.calls.door}`);
ok(audio.calls.footstep === 1, '只有一步（重心挪一下），不是「走进来三步」', `footstep×${audio.calls.footstep}`);
ok(safehouse.mateChestPoint().x > SAFEHOUSE.mateEntry.x, '他确实在屋里（不是在门外）',
  `x=${fmt(safehouse.mateChestPoint().x)}`);
const doorPeak = Math.max(...framesOf(6).map((f) => f.doorAngle));
const doorAt5 = Math.max(...framesOf(5).map((f) => f.doorAngle));
ok(doorAt5 > 0.9 && doorAt5 < 1.05, '门最多开到约 0.95 弧度（够一个人侧身进来）', `peak=${fmt(doorAt5, 3)}`);
ok(doorPeak < doorAt5, '阶段 6 里门是单向关上的（越关越小）', `${fmt(doorAt5, 3)} → ${fmt(doorPeak, 3)}`);
const doorMono = framesOf(6).every((f, i, a) => i === 0 || f.doorAngle <= a[i - 1].doorAngle + 1e-9);
ok(doorMono, '关门的整个过程没有回弹');
// 这一段最要紧的一条：从抬头到黑屏，他一次脸都没露过
const faceHide = framesOf(5).concat(framesOf(6));
ok(faceHide.every((f) => near(f.mateYaw, -Math.PI / 2, 0.03)),
  '整个下半场他始终面朝门（一次都没转向镜头）',
  faceHide.length ? `yaw∈[${fmt(Math.min(...faceHide.map((f) => f.mateYaw)), 3)}, ${fmt(Math.max(...faceHide.map((f) => f.mateYaw)), 3)}]` : '');

// 阶段 7：主角发问的 4.8 秒里他一直背对着
runStage(7);
ok(near(Math.abs(safehouse.mateYaw()), Math.PI / 2, 0.03), '主角说话时他背对玩家（|yaw|=π/2）',
  `yaw=${fmt(safehouse.mateYaw(), 3)}`);

ok(framesOf(7).some((f) => f.sub === copy.safeWhere), '字幕是「我找你找了好久」', copy.safeWhere);
ok(entries[7] && entries[7].safeVisibleAfter === true, '阶段 7 同学是可见的（不然就是对着空气说话）');
ok(audio.calls.door === 2, '阶段 7 不重复播门声');

// ───────────────────────── 7. 应答 → 转身 → 揭示 ─────────────────────────
console.log('── 揭示 ──');
runStage(8);
const mp = safehouse.mateChestPoint();
const wantYaw = Math.atan2(SAFEHOUSE.spawn.x - mp.x, SAFEHOUSE.spawn.z - mp.z);
ok(near(game.endMateYaw, wantYaw, 0.02), 'endMateYaw 按 atan2(dx, dz) 算（角色 +Z 是脸）',
  `${fmt(game.endMateYaw, 4)} 期望 ${fmt(wantYaw, 4)}`);
ok(near(game.endMateYaw, 1.7258, 0.005), '实测朝向 ≈ +1.726（脸朝 +X、略偏 -Z）', fmt(game.endMateYaw, 4));
ok(framesOf(8).some((f) => f.sub === copy.safeIsThatSo), '字幕是「是吗……」', copy.safeIsThatSo);

runStage(9);
ok(near(lastOf(9).pitchOff, 0.08, 1e-6), '阶段 9 结束时镜头微微上扬 0.08', fmt(lastOf(9).pitchOff, 4));
ok(audio.calls.stinger === 1, '红眼亮起那一下的 stinger 只响一次', `stinger×${audio.calls.stinger}`);
ok(audio.calls.startHeartbeat === 1, '心跳在「看见」之后才起', `startHeartbeat×${audio.calls.startHeartbeat}`);
ok(near(safehouse.mateYaw(), wantYaw, 0.03), '到揭晓时他已经完全转过来对着玩家', fmt(safehouse.mateYaw(), 3));
ok(near(safehouse.mateChestPoint().x, SAFEHOUSE.mateStation.x, 0.03), '还没扑之前站在原地');
// 第十八轮：第 9 幕改成「先亮眼、再咧嘴」，两条通道各自跑到满
const ri9 = safehouse.mateModelInfo();
ok(near(ri9.reveal, 1, 1e-9) && near(ri9.mouthOpen, 1, 1e-9),
  '阶段 9 结束时红眼全亮、嘴咧到最大', `眼=${fmt(ri9.reveal)} 嘴=${fmt(ri9.mouthOpen)}`);
ok(ri9.halos === 4 && ri9.mouth === true, '这一步用的是新的球面五官（光晕 4 层 + 嘴一层）',
  `halos=${ri9.halos} mouth=${ri9.mouth}`);
// 只给 k、不给 mouth 的老调用仍然只是「亮眼」，不会顺手把嘴掰开
safehouse.setReveal(0);
ok(safehouse.mateModelInfo().mouthOpen === 1 && near(safehouse.mateModelInfo().reveal, 0, 1e-9),
  'setReveal(k) 单参调用不会改动嘴的张合');
safehouse.setReveal(1, 1);

// ───────────────────────── 8. 飞扑 → 后仰 → 黑场 ─────────────────────────
console.log('── 飞扑与黑场 ──');
runStage(10);
const stage10 = framesOf(10);
ok(audio.calls.scream === 1, '整场只在飞扑时尖叫一声（assets/audio/scream.ogg）',
  `scream×${audio.calls.scream}`);
ok(safehouse.mateChestPoint().x > SAFEHOUSE.mateStation.x + 1.4, '他扑到玩家面前（前移 1.6m）',
  `x=${fmt(safehouse.mateChestPoint().x)}`);
ok(player.x > SAFEHOUSE.spawn.x + 0.45, '玩家被撞得往后退了半米多', `x=${fmt(player.x)}`);
ok(player.x < SAFEHOUSE.spawn.x + 0.6, '后退位移有上限，不会一路滑到墙上', `x=${fmt(player.x)}`);
// 「扑向一侧」的回归：落点必须压在镜头视线上，而不是沿 +X 硬平移
const lunge = game.endLungeTo;
ok(!!lunge, '阶段 10 算出了落点');
const camX10 = (game.endFallX ?? player.x) + 0.55;
const camZ10 = player.z;
const camY10 = player.eyeY();
const pitch10 = player.pitch + 0.08 + 0.22 * (1 - Math.exp(-9 * END_STAGE[10]));
const dir10 = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(pitch10), Math.sin(pitch10),
  -Math.cos(player.yaw) * Math.cos(pitch10)).normalize();
const cam10 = new THREE.Vector3(camX10, camY10, camZ10);
const head10 = new THREE.Vector3(lunge.x, lunge.y + safehouse.headHeight(), lunge.z);
const along = head10.clone().sub(cam10).dot(dir10);
const perp = head10.clone().sub(cam10).addScaledVector(dir10, -along).length();
ok(perp < 0.02, '头的中心就在视线上（垂直偏差 < 2cm）', `${fmt(perp * 1000, 1)}mm`);
ok(perp / along < 0.04, '他扑过来的方向就是镜头的方向（偏差 < 2.3°）',
  `${fmt((perp / along) * 180 / Math.PI, 2)}°`);
ok(along > 0.45 && along < 0.70, '头到镜片 0.45–0.70 米', `${fmt(along, 3)}m`);
// 脸面比头心近 0.13 米（模型本地 +Z），一张 0.26 米高的脸在 70° 竖直 FOV 下占多少
const faceDist = along - 0.13;
const frameH = 2 * faceDist * Math.tan((70 * Math.PI) / 180 / 2);
const faceFrac = 0.26 / frameH;
ok(faceFrac > 0.35 && faceFrac < 0.62, '最后定格时脸占画面高度一半左右（「半张脸」）',
  `${fmt(faceFrac * 100, 0)}%（脸面 ${fmt(faceDist, 2)}m）`);
ok(lunge.y >= 0, '脚没有埋进地板', `y=${fmt(lunge.y, 3)}`);
const offs10 = stage10.map((f) => f.pitchOff);
ok(Math.min(...offs10) > 0.05 && Math.max(...offs10) < 0.32, '后仰角度始终在合理区间',
  `${fmt(Math.min(...offs10), 3)}..${fmt(Math.max(...offs10), 3)}`);
ok(audio.calls.burst === 1 && audio.calls.lose === 1, '扑上来那一下：闷响 1 次 + lose 1 次');
ok(game.phase === 'ending', '只是放音效，没有把 phase 改成 lose（否则会弹失败面板）');

runStage(11);
ok(near(hud.alpha.black, 1, 1e-6), '阶段 11 结束时已经全黑', fmt(hud.alpha.black, 3));
ok(near(hud.alpha.white, 0, 1e-6), '白幕没有残留', fmt(hud.alpha.white, 3));
ok(framesOf(11).every((f, i, a) => i === 0 || f.black >= a[i - 1].black), '黑幕是单调涨上去的');

// 阶段 12：纯黑，镜头必须完全静止（不累积、不漂移）
untilStage(12);
for (let g = 0; g < 5000 && game.phase === 'ending'; g += 1) frame();
const stage12 = framesOf(12).filter((f) => f.phase === 'ending');
ok(stage12.length >= 60, '阶段 12 至少 1 秒纯黑', `${stage12.length} 帧`);
const xs = stage12.map((f) => f.x);
const offs = stage12.map((f) => f.pitchOff);
ok(Math.max(...xs) - Math.min(...xs) < 1e-9, '纯黑期间位置一动不动（不累积后仰）',
  `Δ=${(Math.max(...xs) - Math.min(...xs)).toExponential(1)}`);
ok(Math.max(...offs) - Math.min(...offs) < 1e-9, '纯黑期间 pitch 偏移恒定（每帧重算，不叠乘）',
  `Δ=${(Math.max(...offs) - Math.min(...offs)).toExponential(1)}`);
ok(stage12.every((f) => f.black === 1), '纯黑期间黑幕始终是 1');

// ───────────────────────── 9. 结束卡 ─────────────────────────
console.log('── 结束卡 ──');
ok(game.phase === 'badEnd', '走完 12 段自动进 badEnd', game.phase);
ok(hud.panel && hud.panel.mode === 'badEnd', '面板是 badEnd 模式', hud.panel?.mode);
ok(hud.panel?.title === copy.badTitle, '标题：游戏结束', hud.panel?.title);
ok(hud.panel?.body === copy.badBody, '正文：他不是你的同学……', hud.panel?.body);
ok(near(hud.alpha.black, 1, 1e-6), '黑幕保留（结束卡 z-index 比它高，会盖在上面）', fmt(hud.alpha.black, 3));
ok(hud.subtitle === '', '字幕清空（不能留在黑场上）');
ok(audio.calls.stopHeartbeat >= 2, '心跳停了', `stopHeartbeat×${audio.calls.stopHeartbeat}`);
const frozen = { stage: game.endStage, t: game.endT };
game.updateEnding(5);
ok(game.endStage === frozen.stage && game.endT === frozen.t, 'badEnd 之后时间轴不再推进');

const spent = trace.length * DT;
ok(spent > total - 0.2 && spent < total + 0.2, '实际耗时与时间轴一致', `${fmt(spent)}s vs ${fmt(total)}s`);

// ───────────────────────── 10. 还原 ─────────────────────────
console.log('── abortEnding 还原 ──');
game.abortEnding();
ok(game.endStage === 0 && game.endT === 0 && game.endCues.size === 0, '时间轴与一次性音效记录都清空');
ok(game.endFallX === undefined && game.endMateYaw === undefined, '倒地位置/同学朝向快照清空');
ok(hud.alpha.white === 0 && hud.alpha.black === 0, '白幕黑幕全清（否则下一局从满屏白开始）');
ok(near(CONFIG.exposure, game.baseExposure, 1e-6), '曝光还原', fmt(CONFIG.exposure, 3));
ok(near(scene.fog.density, CONFIG.fogCalm, 1e-6), '雾还原', fmt(scene.fog.density, 4));
ok(level.hemiOverride === null, '半球光回到走廊自己的取值（不是留一个写死的数）');
ok(level.hallLampScale === 1 && level.doorGlow === 0 && level.endDoorOpen === 0, '走廊灯、门光、门角度复位');
ok(level.hidden === false, '走廊整组重新可见');
ok(safehouse.group.visible === false, '安全屋藏起来（不然会悬在走廊里）');
ok(player.controlEnabled === true && player.scripted === false, '键鼠交还给玩家');
ok(!player.lookTarget && !player.autoTurn, '强制注视和自动转身都解除');
ok(game.phase === 'badEnd', 'abortEnding 不改 phase（由调用方决定去哪）');

// 还原之后再跑一次：不能因为上一局的残留而启动就白屏
game.phase = 'corridor';
game.beginEnding();
ok(hud.alpha.white === 0, '第二次进终局时白幕从 0 开始（没有残留）', fmt(hud.alpha.white, 3));
ok(game.endStage === 0 && game.endCues.size === 0, '第二次进终局的计数从头起');
game.abortEnding();

// ───────────────────────── 11. 阶段时长都在预算内 ─────────────────────────
console.log('── 时长预算 ──');
const stageDur = {};
for (const f of trace) stageDur[f.stage] = (stageDur[f.stage] ?? 0) + DT;
const overrun = Object.entries(stageDur).filter(([s, d]) => d > END_STAGE[Number(s)] + 0.05);
ok(overrun.length === 0, '没有哪一段超时', overrun.map(([s, d]) => `段${s}:${fmt(d)}`).join(' ') || '全部在预算内');
ok(END_STAGE[6] >= 0.85, '阶段 6 容得下「关门 0.55s + 站住 0.30s」', `${fmt(END_STAGE[6])}s`);
ok(END_STAGE[7] >= 4.0, '阶段 7 长于那句台词的显示时长 4.0s（字幕不会中途消失）', `${fmt(END_STAGE[7])}s`);
ok(END_STAGE[8] >= 1.55 + 1.05, '阶段 8 容得下「愣 1.55s + 转身 1.05s」', `${fmt(END_STAGE[8])}s`);

// ───────────────────────── 12. 演示收尾的冻结开关 ─────────────────────────
console.log('── 演示收尾（白光冻结 / z-6 白层）──');
game.phase = 'ending';
game.beginEnding();
untilStage(1);
game.debugHold = true;
const holdSnap = { stage: game.endStage, t: game.endT, white: hud.alpha.white };
game.updateEnding(2.0);
ok(game.endStage === holdSnap.stage && game.endT === holdSnap.t,
  'debugHold 期间时间轴完全不动（演示靠它把画面停在白光上）', `段${game.endStage} t=${fmt(game.endT, 3)}`);
ok(near(hud.alpha.white, holdSnap.white, 1e-9), '冻住时白幕也不变（不会自己退成半透明）');
game.abortEnding();
ok(game.debugHold === false && game.debugFast === false, 'abortEnding 把冻结开关一起清掉（否则下一局终局会卡死）');
// 冻结不该影响正常播放：清掉之后同一段还能继续推进
game.phase = 'ending';
game.beginEnding();
untilStage(1);
const beforeStage = game.endStage;
game.updateEnding(END_STAGE[1] - game.endT + 0.02);
ok(game.endStage > beforeStage, '清掉冻结后时间轴照常推进', `段${beforeStage} → 段${game.endStage}`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
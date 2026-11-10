/**
 * 第二十五、二十六轮定下的几条约定，靠源码结构守（要 GLB 模型才能跑真几何，
 * _probe 里离线加载不了）。真几何/像素另有 CDP 探针：_tmp/doll_face.js、_tmp/breath_probe.js。
 *
 * 1. 第四关人偶冲刺到玩家面前急停时，定格成「抬头贴脸」：头是负的 x（抬头）、
 *    过渡用 blendPuppetPose 在 FACE_SETTLE 秒内插值，不能一帧切过去（会看到姿势突变）。
 * 2. 脸上是简笔画：两个黑点当眼睛 + **一条**弧线当嘴（第二十六轮加的眼睛，
 *    第二十五轮「只有嘴」的说法到此为止，但嘴仍然只有一条弧线、不许变成两条）。
 *    笔画都是 TubeGeometry/SphereGeometry + MeshBasicMaterial（不吃灯），颜色 0x140805；
 *    笔画外挂一层半透明「墨晕」，整体比笔画低一点（往下渗），还有几滴往下挂的墨滴。
 * 3. 被抓（lose）和结束卡（badEnd）要主动放开指针锁 —— 否则玩家得先按 Esc 才能点按钮。
 * 4. 安全屋的喘气只有一口气：playSample 按单声长度切、到点停，breath() 先掐上一口。
 *
 * 用法：node _probe/dollface.mjs
 */
import { readFileSync } from 'node:fs';

const A = readFileSync(new URL('../src/anomalies.js', import.meta.url), 'utf8');
const G = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const AU = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');

const fail = [];
const ok = [];
const check = (name, cond, detail = '') => (cond ? ok : fail).push(detail ? `${name} ${detail}` : name);

// 1) 急停定格：抬头 + 有过渡 + 过渡时长够长
const faceOff = A.match(/function sampleFaceOff\(pose\) \{[\s\S]*?\n\}/);
check('sampleFaceOff 存在', !!faceOff);
if (faceOff) {
  const head = faceOff[0].match(/setPuppet\(pose, 'head',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\)/);
  check('sampleFaceOff 设了头', !!head);
  if (head) check('定格时抬头（rotation.x < 0）', Number(head[1]) < 0, `x=${head[1]}`);
  check('两脚都踩地（foot 有值）', (faceOff[0].match(/setPuppet\(pose, 'foot/g) || []).length === 2);
}
const settle = A.match(/const FACE_SETTLE = ([\d.]+);/);
check('FACE_SETTLE 存在', !!settle);
if (settle) check('FACE_SETTLE ≥ 0.1s（肉眼看不到突跳）', Number(settle[1]) >= 0.1, `=${settle[1]}`);
check('急停用 blendPuppetPose 过渡', /blendPuppetPose\(faceFrom, pose, k\)/.test(A));
check('过渡从到达那一刻的姿势起算', /copyPuppetPose\(pose, faceFrom\)/.test(A));

// 2) 脸：两个黑点 + 一条弧线 + 墨晕 + 墨滴
check('addPuppetFace 存在', /function addPuppetFace\(head\)/.test(A));
check('调用点用 addPuppetFace', /if \(limbs\.head\) addPuppetFace\(limbs\.head\);/.test(A));
check('旧名 addPuppetSmile 已删除', !/function addPuppetSmile\(/.test(A));
// 墨色统一走常量，且不吃灯
check('墨色常量 0x140805', /const INK = 0x140805;/.test(A));
check('笔触用 MeshBasicMaterial（不随灯光变亮/变暗）', /new THREE\.MeshBasicMaterial\(\{ color: INK \}\)/.test(A));
check('嘴只有一条弧线', (A.match(/'PuppetSmile'/g) || []).length === 1);
const mouth = A.match(/stroke\(arc,\s*([\d.]+),\s*inkCore\(\),\s*'PuppetSmile'/);
check('嘴是贴脸的管子', !!mouth);
if (mouth) check('管半径 ≥ 0.004（远看还有笔触）', Number(mouth[1]) >= 0.004, `=${mouth[1]}`);
check('嘴贴在脸皮上（射线打到脸上再往外让一点）', /raycaster\.intersectObjects\(meshes, false\)/.test(A));
// 眼睛：左右对称的一对黑点
check('眼睛按 ±eyeDx 成对生成', /const eyeDx = size\.x \* ([\d.]+);/.test(A) && /for \(const s of \[-1, 1\]\)/.test(A));
check('眼睛是黑点（PuppetEye）', (A.match(/'PuppetEye'/g) || []).length === 1);
check('眼睛在嘴上面（眼高 > 嘴高）', /const eyeY = mn\.y \+ size\.y \* 0\.66;/.test(A)
  && /const baseY = mn\.y \+ size\.y \* 0\.28;/.test(A));
// 墨晕：半透明、不写深度、比笔触低一点（往下渗，不是均匀发光）
check('墨晕是半透明且不写深度', /transparent: true, opacity, depthWrite: false/.test(A));
check('嘴的湿边整体下移', /q\.y - 0\.0016/.test(A));
check('嘴的外沿淡晕再往下压', /q\.y - 0\.0062/.test(A));
check('嘴的湿边比外沿浓（≥2 倍）', (() => {
  const wet = A.match(/0\.0092, inkBleed\(([\d.]+)\), 'PuppetSmileBleed'/);
  const far = A.match(/0\.0118, inkBleed\(([\d.]+)\), 'PuppetSmileFringe'/);
  return !!wet && !!far && Number(wet[1]) >= Number(far[1]) * 2;
})());
check('眼睛的墨晕整体下移', /eyeY - 0\.001[46]/.test(A));
check('眼睛墨晕比黑点大（≥1.8 倍）', (() => {
  const m = A.match(/eyeR \* ([\d.]+), eyeR \* ([\d.]+), inkBleed\(([\d.]+)\), 'PuppetEyeBleed'/);
  return !!m && Number(m[1]) >= 1.8 && Number(m[2]) >= 1.6 && Number(m[3]) > 0.2;
})());
check('眼睛外沿淡晕更大更淡', (() => {
  const m = A.match(/eyeR \* ([\d.]+), eyeR \* ([\d.]+), inkBleed\(([\d.]+)\), 'PuppetEyeFringe'/);
  const near = A.match(/eyeR \* ([\d.]+), eyeR \* ([\d.]+), inkBleed\(([\d.]+)\), 'PuppetEyeBleed'/);
  return !!m && !!near && Number(m[1]) > Number(near[1]) && Number(m[3]) < Number(near[3]);
})());
check('晕用射线铺成贴脸的扇形（不是压扁的球）', /const patch = \(x, y, rx, ry, material, name/.test(A)
  && /surfaceZ\(px, py\) \+ dz/.test(A));
check('晕的外沿透明度渐隐到 0', /col\.push\(1, 1, 1, ca\);/.test(A)
  && /y \+ Math\.sin\(a\) \* ry, 0\);/.test(A) && /material\.vertexColors = true;/.test(A));
// 墨滴：至少三滴，且都挂在笔画最低点以下
check('有往下挂的墨滴（PuppetInkDrip）', /'PuppetInkDrip'/.test(A));
const dripCalls = (A.match(/^\s*drip\(/gm) || []).length;
check('墨滴 ≥ 3 处', dripCalls >= 3, `=${dripCalls}`);
check('墨滴贴着脸上的着点往下走', /surfaceZ\(px, py\) \+ 0\.0016/.test(A));
check('墨滴末端有珠子', /radius \* 1\.5, inkBleed\(0\.6\)/.test(A));
// 除了这对眼睛和这条嘴，不许再冒出别的五官
check('没有第三组五官（眉/鼻/泪/瞳）', !/Eyebrow|Nose|Tear|Pupil|Iris/.test(A));
check('脸上的部件名字共 7 种', new Set((A.match(/'(Puppet(Smile|Eye|InkDrip)\w*)'/g) || [])).size === 7);

// 3) 结束界面放开鼠标
const loseBody = G.match(/  lose\(\) \{[\s\S]*?\n  \}/);
check('lose 结尾调用 releaseLock', !!loseBody && /this\.releaseLock\(\);/.test(loseBody[0]));
const badBody = G.match(/  badEnd\(\) \{[\s\S]*?\n  \}/);
check('badEnd 结尾调用 releaseLock', !!badBody && /this\.releaseLock\(\);/.test(badBody[0]));
const rel = G.match(/  releaseLock\(\) \{[\s\S]*?\n  \}/);
check('releaseLock 存在', !!rel);
if (rel) {
  check('releaseLock 先置 intentionalUnlock（否则会被当成按 Esc 弹暂停）', /this\.intentionalUnlock = true;[\s\S]*exitPointerLock/.test(rel[0]));
  check('releaseLock 只在锁定状态下解索', /if \(document\.pointerLockElement\) document\.exitPointerLock\(\);/.test(rel[0]));
}

// 4) 安全屋喘气：一次只出一声
check('playSample 支持 duration/release', /playSample\(key, \{ gain = 0\.5,[^)]*duration = 0, release = [\d.]+[^)]*\} = \{\}\)/.test(AU));
check('playSample 到点停源（不播到文件尾）', /src\.stop\(stopAt \+ 0\.02\)/.test(AU));
check('playSample 尾巴有淡出', /setValueAtTime\(Math\.max\(0\.0002, gain\), stopAt - rel\)/.test(AU));
check('BREATH_UNITS 按实测切出单声', /const BREATH_UNITS = \[[\s\S]{0,240}?\{ offset: 0\.135, dur: 0\.44 \}/.test(AU));
check('breath() 传 duration: unit.dur', /duration: unit\.dur/.test(AU));
check('breath() 先掐上一口', /breath\(\) \{[\s\S]{0,240}?this\.stopBreath\(/.test(AU));
check('stopBreath 存在', /stopBreath\(fade = [\d.]+\) \{/.test(AU));
check('stopBreath 不把停点往后推（stop 最后一次调用生效）', /t \+ fade >= voice\.stopAt\) continue;/.test(AU));
check('采样缺失时仍有合成兜底', /burst\(\{ duration: 0\.5, gain: 0\.14, type: 'lowpass', freq: 500, q: 0\.5 \}\)/.test(AU));

for (const line of ok) console.log(`  ok   ${line}`);
for (const line of fail) console.log(`  FAIL ${line}`);
console.log(`\n${ok.length}/${ok.length + fail.length} 通过`);
process.exit(fail.length ? 1 : 0);
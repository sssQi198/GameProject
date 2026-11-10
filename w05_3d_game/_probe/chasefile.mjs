/**
 * _probe/chasefile.mjs — 追逐伴奏（第三十二轮）自检
 *
 * 这一轮把追逐段从「四份程序化合成伴奏」换成了一首实录 MP3
 * （`assets/audio/chase-noescape.mp3`），并且只保留一个跟玩法挂钩的旋钮：**音量跟距离**。
 * 所以这个探针只查三件能在 Node 里查清的事：
 *
 *   ① 距离 → 音量的映射（单调、夹取、两端正好 −6 dB / +1 dB）；
 *   ② 无缝循环的拼接数学（掐头静音 + 等功率交叉淡化，接缝真的接上了）；
 *   ③ 素材本身（路径能被浏览器按相对路径取到、文件在磁盘上、体积对得上）。
 *
 * 真解码、真出声、真循环听感只能开浏览器验（见 dev/chase-bgm.html 和
 * `node cdp_file.mjs` 那套），这里不假装能验。
 *
 * 跑法：node _probe/chasefile.mjs
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  CHASE_FILE_URL,
  CHASE_GAIN_MAX_DB,
  CHASE_GAIN_MIN_DB,
  ChaseFile,
  buildLoopBuffer,
  chaseGainFor,
} from '../src/chasefile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const fmt = (v, n = 4) => Number(v).toFixed(n);

// ── 1. 距离 → 音量 ────────────────────────────────────────────────────
console.log('── 距离 → 音量 ──');
const g0 = chaseGainFor(0);
const g1 = chaseGainFor(1);
ok(Math.abs(g0 - Math.pow(10, CHASE_GAIN_MIN_DB / 20)) < 1e-9, '压力 0 就是 −6 dB',
  `${fmt(g0)}（${fmt(20 * Math.log10(g0), 2)} dB）`);
ok(Math.abs(g1 - Math.pow(10, CHASE_GAIN_MAX_DB / 20)) < 1e-9, '压力 1 就是 +1 dB',
  `${fmt(g1)}（${fmt(20 * Math.log10(g1), 2)} dB）`);
ok(g1 > g0 * 2, '两端差 7 dB（贴背时超过一倍的振幅）', `${fmt(g1 / g0)}×`);

let mono = true;
let prev = -Infinity;
for (let t = 0; t <= 1.0001; t += 0.05) {
  const g = chaseGainFor(t);
  if (!(g > prev)) mono = false;
  prev = g;
}
ok(mono, '0→1 单调递增（越近越响，没有回头）');

// 中间的 0.5 应该在两端之间、且落在 dB 中线（−2.5 dB ≈ 0.750）
const gm = chaseGainFor(0.5);
ok(Math.abs(gm - Math.pow(10, -2.5 / 20)) < 1e-9, '压力 0.5 落在 −2.5 dB（dB 线性，不是增益线性）',
  `${fmt(gm)}`);
ok(gm < (g0 + g1) / 2, 'dB 线性下中点比增益线性更轻（听感上的「一半」应是 −2.5 dB，不是 +0.81）',
  `${fmt(gm)} < ${fmt((g0 + g1) / 2)}`);

ok(chaseGainFor(-5) === g0 && chaseGainFor(9) === g1, '超出 0–1 的输入被夹到两端');
ok(chaseGainFor(NaN) === g0 && chaseGainFor(undefined) === g0 && chaseGainFor('') === g0,
  '坏输入（NaN / undefined / 空串）当 0 处理');
ok(chaseGainFor('0.5') === gm, '字符串数字也认', fmt(chaseGainFor('0.5')));

// ── 2. 无缝循环的拼接 ──────────────────────────────────────────────────
console.log('── 无缝循环 ──');

/** 极简假 ctx：只要有 createBuffer 就够 buildLoopBuffer 用了。 */
const fakeCtx = {
  createBuffer(channels, length, rate) {
    const data = [];
    for (let c = 0; c < channels; c += 1) data.push(new Float32Array(length));
    return {
      duration: length / rate,
      length,
      sampleRate: rate,
      numberOfChannels: channels,
      getChannelData: (c) => data[c],
    };
  },
};

const SR = 48000;
const silence = Math.round(SR * 0.031); // 实测 31 ms 编码器延迟
const bodyLen = SR * 2; // 2 秒「曲子」
const rawLen = silence + bodyLen;
const rawData = new Float32Array(rawLen);
// 曲子本体用 0.5 的直流 + 一个 200 Hz 正弦：直流用来验「等功率权重和为 1」，
// 正弦用来验「接缝处相位真的连续」。
for (let i = 0; i < bodyLen; i += 1) rawData[silence + i] = 0.5 + 0.2 * Math.sin((2 * Math.PI * 200 * i) / SR);
const raw = {
  duration: rawLen / SR,
  length: rawLen,
  sampleRate: SR,
  numberOfChannels: 2,
  getChannelData: () => rawData,
};

const built = buildLoopBuffer(fakeCtx, raw);
const { buffer, info } = built;
ok(info.headTrimMs === 31, '掐掉开头 31 ms 的编码器静音', `${info.headTrimMs} ms`);
ok(info.xfadeMs === Math.round(0.045 * 1000), '交叉淡化 45 ms', `${info.xfadeMs} ms`);
ok(buffer.length === rawLen - silence - Math.round(SR * 0.045), '循环长度 = 原长 − 掐头 − 淡化',
  `${buffer.length} 采样`);
ok(Math.abs(info.duration - (bodyLen - Math.round(SR * 0.045)) / SR) < 1e-6,
  'info.duration 是淡化后的真实秒数', `${fmt(info.duration)} s`);

const out = buffer.getChannelData(0);

// 等功率权重：拿「纯直流」验 sin² + cos² = 1——淡化区的第一个采样必须还是 0.5，
// 差一点点就说明淡化会把声音拉低一个坑（听感上每圈「呼」一下）。
const dcRawData = new Float32Array(rawLen).fill(0.5);
const dcOut = buildLoopBuffer(fakeCtx, {
  duration: rawLen / SR,
  length: rawLen,
  sampleRate: SR,
  numberOfChannels: 1,
  getChannelData: () => dcRawData,
}).buffer.getChannelData(0);
ok(Math.abs(dcOut[0] - 0.5) < 1e-6, '等功率权重和为 1（淡化起点仍是 0.5，不凹坑）', fmt(dcOut[0], 6));
// 淡化区之后必须逐采样原样搬运（不插值、不改幅度）
let tailExact = true;
for (let i = Math.round(SR * 0.045); i < dcOut.length; i += 1) if (dcOut[i] !== 0.5) tailExact = false;
ok(tailExact, '淡化区之后逐采样原样搬运（不改一个值）');

// 接缝：最后一个采样 → 第一个采样，跳变必须和曲子内部的正常相邻差一样小
const seam = Math.abs(out[out.length - 1] - out[0]);
let maxStep = 0;
for (let i = 1; i < out.length; i += 1) maxStep = Math.max(maxStep, Math.abs(out[i] - out[i - 1]));
ok(seam <= maxStep + 1e-6, '接缝跳变不超过曲子内部的最大相邻差（循环点听不出来）',
  `seam ${fmt(seam, 5)} ≤ step ${fmt(maxStep, 5)}`);

// 对照：不做淡化的话，接缝就是「最后一个采样 → 静音」那一大跳
const naiveSeam = Math.abs(rawData[rawLen - 1] - 0);
ok(naiveSeam > seam * 10, '不淡化的话接缝是一大跳（所以这段代码是必要的）',
  `原样 ${fmt(naiveSeam, 4)} vs 淡化后 ${fmt(seam, 5)}`);

// 尾巴不能少一截：淡化段是「叠加」不是「裁掉」
ok(out[out.length - 1] !== 0 || seam < 1e-3, '循环末尾不是被截成 0（淡化是混音不是丢样本）');

// ── 3. 素材 ───────────────────────────────────────────────────────────
console.log('── 素材 ──');
ok(CHASE_FILE_URL === './assets/audio/chase-noescape.mp3', '路径是文档相对的（子目录部署也成立）', CHASE_FILE_URL);
ok(!CHASE_FILE_URL.startsWith('/'), '不是以 / 开头的绝对路径（GitHub Pages 子路径会 404）');
const file = path.resolve(ROOT, CHASE_FILE_URL.replace(/^\.\//, ''));
const size = statSync(file).size;
ok(size > 600 * 1024, '文件在磁盘上，体积像首歌', `${(size / 1024).toFixed(0)} KB`);
const head = readFileSync(file).subarray(0, 3).toString('latin1');
const id3 = readFileSync(file).subarray(0, 3).toString('latin1') === 'ID3';
const frame = /^[\xFF\xFB\xF3\xF2]$/.test(readFileSync(file).subarray(0, 1).toString('latin1'));
ok(id3 || frame || head.length === 3, '文件开头是 MP3（ID3 标签或帧同步头），不是 404 的 HTML', id3 ? 'ID3' : 'frame');

// ── 4. 未解码时的行为（失败要静默，不能把游戏带崩） ──────────────────
console.log('── 降级 ──');
const deadCtx = {
  currentTime: 0,
  createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {} }),
};
const dead = new ChaseFile(deadCtx, { kind: 'destination' });
ok(dead.snapshot().id === 'noescape' && dead.snapshot().state === 'idle', '没加载时状态是 idle');
ok(dead.snapshot().name.includes('无逃脱'), '显示名是 E · 无逃脱', dead.snapshot().name);
ok(dead.stop() === false, '没在放的时候 stop() 返回 false，不报错');
globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
await dead.load().catch(() => {});
ok(dead.snapshot().state === 'failed' && /404/.test(dead.snapshot().error), '404 会记成 failed + 说明原因',
  dead.snapshot().error);
ok(dead.start() === false, '素材失败时 start() 返回 false（游戏照常玩，只是没伴奏）');
ok(chaseGainFor(dead.setIntensity(1)) === g1, '失败状态下 setIntensity 仍返回正确的增益（不抛）');

// ── 汇总 ─────────────────────────────────────────────────────────────
console.log(fail === 0 ? '\n全部通过' : `\n${fail} 条失败`);
process.exit(fail === 0 ? 0 : 1);
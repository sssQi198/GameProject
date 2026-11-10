/**
 * 采样层验收（不开浏览器）：心跳 / 喘气 / 尖叫三个真录音是不是真的接进了流程。
 *
 * 做法：把 fetch 换成「从磁盘读 assets/audio 里的真文件」，
 * AudioContext 用假的（只记录节点和参数自动化），decodeAudioData 走成功回调。
 * 于是探针能同时验证两件事：
 *   ① 三个 URL 指向的文件真的存在、真的是音频（RIFF / OggS 文件头）；
 *   ② 追逐段循环的是喘气、心跳在「看见」之后才起、飞扑那一下放的是尖叫。
 *
 * 跑法：node _probe/samples.mjs
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { AudioBus } from '../src/audio.js';
import { FakeCtx, installFakeAudio } from './fakeaudio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const fmt = (v, n = 3) => Number(v).toFixed(n);

// ── 桩：真文件 + 假解码 ────────────────────────────────────────────────
installFakeAudio();

const fetched = [];
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.\//, '');
  const file = path.resolve(ROOT, rel);
  let buf = null;
  try {
    buf = readFileSync(file);
  } catch (err) {
    fetched.push({ url, file, ok: false, size: 0 });
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
  fetched.push({ url, file, ok: true, size: buf.length, head: buf.toString('latin1', 0, 4) });
  return { ok: true, status: 200, arrayBuffer: async () => buf };
};

class SampleCtx extends FakeCtx {
  constructor() {
    super();
    this.decoded = [];
  }
  /**
   * 两种调用形式都要支持：
   * - 采样加载（loadSamples）走回调 `decodeAudioData(buf, onOk)`；
   * - 突脸音效（PR #2 的 prepareScare）走 Promise `decodeAudioData(buf).then(...)`。
   * 早期桩只实现了回调形式，上游合并后 prepareScare 会抛 "onOk is not a function"。
   */
  decodeAudioData(buf, onOk) {
    this.decoded.push(buf.byteLength);
    // 假 buffer：只提供 playSample / startLoop / BufferSource 会用到的字段
    const fake = { duration: 1.2, sampleRate: 44100, length: 52920, getChannelData: () => new Float32Array(16) };
    if (typeof onOk === 'function') onOk(fake);
    return Promise.resolve(fake);
  }
}
globalThis.window.AudioContext = SampleCtx;

const bus = new AudioBus();
bus.unlock();
ok(bus.ctx instanceof SampleCtx, 'unlock 建立了 AudioContext');

// 素材是异步拉的（.then 链），把微任务排空
const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};
await settle();

// ── 1. 三个文件真的在磁盘上 ────────────────────────────────────────────
console.log('── 素材文件 ──');
// 上游 PR #2 之后 unlock() 还会顺手预加载第四关突脸音效 scare-rush.mp3，
// 所以总请求数是 4；「每条采样只拉一次」这个约束只在三件采样上成立。
const isScare = (f) => /scare-rush\.mp3$/.test(f.file);
const sampleFetches = fetched.filter((f) => !isScare(f));
ok(sampleFetches.length === 3, '三个采样各自拉了一次（心跳 / 喘气 / 尖叫）', `${sampleFetches.length} 次`);
ok(fetched.some((f) => isScare(f) && f.ok), '突脸音效 scare-rush.mp3 也在预加载（第四关木偶突脸）');
for (const f of fetched) {
  ok(f.ok, `文件存在：${path.basename(f.file)}`, f.ok ? `${(f.size / 1024).toFixed(0)} KB` : f.file);
}
const byName = (n) => fetched.find((f) => path.basename(f.file) === n);
ok(byName('chase-heartbeat.wav')?.head === 'RIFF', '心跳是 WAV（RIFF 头，不是 404 的 HTML）',
  byName('chase-heartbeat.wav')?.head);
ok(byName('chase-breath.wav')?.head === 'RIFF', '喘气是 WAV', byName('chase-breath.wav')?.head);
ok(byName('scream.ogg')?.head === 'OggS', '尖叫是 Ogg（OggS 头）', byName('scream.ogg')?.head);
const sizes = fetched.map((f) => statSync(f.file).size);
ok(Math.min(...sizes) > 8000, '没有空文件', `最小 ${Math.min(...sizes)} B`);
ok(bus.ctx.decoded.length === 4, '三个采样 + 突脸音效都送进了解码器', `${bus.ctx.decoded.length} 个`);

console.log('── 解码结果 ──');
ok(Boolean(bus.samples.heartbeat && bus.samples.breath && bus.samples.scream),
  '三个采样都进了 bus.samples', Object.keys(bus.samples).join(' / '));

// ── 2. 追逐段：只有心跳循环 + 合成伴奏，没有喘气 ──────────────────────
console.log('── 追逐段 ──');
const beforeChase = bus.ctx.created.length;
bus.setMood('chase');
// 第十九轮：喘气从追逐段拿掉了，改由 chasemusic.js 的程序化伴奏 + 更响的心跳撑气氛
ok(!bus.loops.breath, 'setMood(chase) 不再起喘气循环（追逐段没有喘气声）');
ok(Boolean(bus.chaseMusic) && bus.chaseMusic.playing === true, 'setMood(chase) 起了追逐伴奏');
ok(bus.ctx.created.length > beforeChase + 5, '伴奏真的建了节点',
  `${bus.ctx.created.length - beforeChase} 个`);
// 第二十二轮把总线从 0.85 提到 1.5：实测 C · 锤击峰值只有 BGM 的 1.5 倍（听感还更轻），
// 提到 1.5 后同一窗口 RMS 比 BGM 高 +5.5dB，心跳仍比伴奏高 +2.5dB，master 上削波样本 0。
const chaseBusTarget = bus.chaseBus?.gain.events.at(-1)?.v;
ok(Math.abs(chaseBusTarget - 1.5) < 1e-6, '伴奏总线推到 1.5（压过默认 BGM）', fmt(chaseBusTarget));

bus.startHeartbeat();
const hb = bus.loops.heartbeat;
ok(Boolean(hb), 'startHeartbeat 起了一条心跳循环');
ok(hb?.src.buffer === bus.samples.heartbeat, '循环的 buffer 就是心跳采样');
// 追逐段心跳被刻意做大：录音峰值只有 0.5，不放大就压不住脚步声
ok(Math.abs(hb?.gain.gain.events.at(-1)?.v - 1.35) < 1e-6, '追逐段心跳起步音量 1.35（很响）',
  fmt(hb?.gain.gain.events.at(-1)?.v));
ok(Math.abs(hb?.src.playbackRate.value - 1.0) < 1e-6, '追逐段心跳起步 1.0 倍速',
  fmt(hb?.src.playbackRate.value));

bus.setTension(1);
ok(Math.abs(bus.loops.heartbeat.gain.gain.events.at(-1).v - 1.8) < 1e-6,
  '压力满时心跳音量 1.8（比追逐起步又响一档）', fmt(bus.loops.heartbeat.gain.gain.events.at(-1).v));
ok(Math.abs(bus.loops.heartbeat.src.playbackRate.events.at(-1).v - 1.35) < 1e-6,
  '压力满时心跳 1.35 倍速（更急）', fmt(bus.loops.heartbeat.src.playbackRate.events.at(-1).v));
ok(!bus.loops.breath, '压力拉满也不会冒出喘气循环');
ok(Math.abs(bus.chaseMusic.info().intensity - 1) < 1e-6, '压力拉满时伴奏强度也到 1',
  fmt(bus.chaseMusic.info().intensity));

// 同一键不重复起第二条（否则会两路叠着、相位打架）
const before = bus.ctx.created.length;
bus.startHeartbeat();
ok(bus.ctx.created.length === before, '同一键不会重复起第二条循环（不叠音）',
  `新增节点 ${bus.ctx.created.length - before}`);
const musicBefore = bus.chaseMusic.info().beats;
bus.startChaseMusic();
ok(bus.chaseMusic.info().beats === musicBefore, '重复 startChaseMusic 不会把伴奏从头再起一遍');

// ── 3. 安全屋里：单次喘气，不是循环 ────────────────────────────────────
console.log('── 安全屋 ──');
bus.setMood('calm');
ok(!bus.loops.breath, 'setMood(calm) 把喘气循环停了（安全屋不该一直喘）');
const calmNodes = bus.ctx.created.length;
bus.breath();
const breathOnce = bus.ctx.created.slice(calmNodes).filter((n) => n.kind === 'buffer');
ok(breathOnce.length === 1, 'breath() 只放一口，不循环', `${breathOnce.length} 个源`);
ok(breathOnce[0]?.buffer === bus.samples.breath, '这一口用的是喘气采样');
ok(breathOnce[0]?.loop !== true, '单次喘气不是循环');
const started = breathOnce[0]?.started?.[0];
ok(started && started.offset >= 0.1 && started.offset <= 1.8,
  '每次从 0.1–1.8 秒里随机切一段（三下听起来不是同一口）', `offset=${fmt(started?.offset ?? 0, 2)}s`);
ok(Math.abs(breathOnce[0].playbackRate.value - 1) < 0.13, '倍速有 ±6% 抖动但不离谱',
  fmt(breathOnce[0].playbackRate.value));

// ── 3b. 一拍一口的喘气（第三十轮：整条素材一个声部）───────────────────
// 第二十七至二十九轮是「一拍两个人声」：原速吸气 0.44 秒 + 0.50 倍速呼气叠上去。
// 第三十轮用户说「每一声中间都有一个断层」，10 ms 离线包络量出两个凹：
// 拍内 0.34 秒凹到 -10.2 dB（吸气自己衰下去、呼气还没起来），
// 拍缝 1.08 秒凹到 -25.5 dB（呼气尾播到素材的静音床、下一拍吸气还在指数爬升）。
// 现在只有一个声部：素材本身就是连录的三口气（峰 0.25 / 1.42 / 2.58 秒，间距 1.17 秒），
// 整条按 rate = 1.17 / period 播一遍，三口气正好落在 1.05 秒的拍子上；
// 中间的余气是录音自己的，没有拼接点，也就没有断层（人声包络见 README §15）。
console.log('── 一拍一口的喘气 pant ──');
const realBreath = bus.samples.breath;
// 假解码只给 1.2 秒，排期要按真素材的 3.080 秒算才对得上节奏
bus.samples.breath = { duration: 3.08, sampleRate: 44100 };
const PANT_PEAKS = [0.25, 1.42, 2.58]; // 素材里三口气的峰（10 ms 包络实测）
// playSample 会把每个声部的起点排在 ctx.currentTime + 0.01 + delay
const PANT_PRE = 0.01;
const f3 = (v) => fmt(v, 3);
const pantFrom = bus.ctx.created.length;
const pantOk = bus.pant(3.40);
const pantNodes = bus.ctx.created.slice(pantFrom);
const pantGain = pantNodes.filter((n) => n.kind === 'gain');
const pant = pantNodes.filter((n) => n.kind === 'buffer').map((n, i) => {
  const s = n.started[0] ?? {};
  const peak = Math.max(0, ...(pantGain[i]?.gain.events ?? []).map((e) => e.v));
  return { start: s.t ?? 0, offset: s.offset ?? 0, rate: n.playbackRate.value, stop: n.stopped[0] ?? 0, peak };
});
const v0 = pant[0] ?? { start: 0, offset: 0, rate: 0, stop: 0, peak: 0 };
ok(pantOk === true, 'pant() 用上了真采样（返回 true）');
ok(pant.length === 1, '整串喘气只有 1 个声部（三口气都由素材自带，不拼第二层）', `${pant.length} 个`);
ok(Math.abs(v0.rate - (PANT_PEAKS[1] - PANT_PEAKS[0]) / 1.05) < 1e-3 && Math.abs(v0.rate - 1.1143) < 2e-3,
  '倍速 = 1.17 / period ≈ 1.114（把素材的 1.17 秒一口气压到 1.05 秒一拍）', f3(v0.rate));
ok(Math.abs(v0.offset) < 1e-6, '从素材第 0 秒整条播（不切某一口）', fmt(v0.offset, 3));
ok(Math.abs(v0.peak - 0.7) < 1e-6, '增益 0.7（第三轮的响度上限）', f3(v0.peak));
// 三口气的峰落在三次低头：audio 起点 = 第 4 段 0.02 + 预排 0.01 ⇒ 峰在 0.32 / 1.37 / 2.42 秒
const beats = PANT_PEAKS.map((p) => v0.start - PANT_PRE + p / v0.rate);
const DIPS = [0.317, 1.367, 2.417];
ok(beats.every((t, i) => Math.abs(t + 0.03 - DIPS[i]) < 0.02),
  '三口气的峰正对三次低头（0.317 / 1.367 / 2.417 秒）',
  beats.map((t) => f3(t + 0.03)).join(' / '));
ok(Math.abs(beats[1] - beats[0] - 1.05) < 1e-3 && Math.abs(beats[2] - beats[1] - 1.05) < 0.02,
  '拍与拍之间正好一个 period（1.05 秒），第三拍不提前也不拖后',
  `${f3(beats[1] - beats[0])}s / ${f3(beats[2] - beats[1])}s`);
let maxConc = 0;
for (let i = 0; i <= 2600; i += 1) {
  const t = i / 1000;
  const c = pant.filter((v) => v.start <= t && t < v.stop).length;
  if (c > maxConc) maxConc = c;
}
ok(maxConc === 1, '同一时刻只有一路人声（没有拼接点，也就没有拍内断层）', `max ${maxConc}`);
const spanFrom = Math.min(...pant.map((v) => v.start));
const spanTo = Math.max(...pant.map((v) => v.stop));
ok(spanTo - spanFrom > 2.75, '这一串一直响到第三口气的尾巴（>2.75 秒），第三下低头不再哑',
  `${fmt(spanTo - spanFrom, 2)}s`);
// total 现在只截尾：2.30 秒就只播 2.30 秒（素材长度按倍速折算），拍数不再由它数
const shortFrom = bus.ctx.created.length;
bus.pant(2.30);
const shortSrc = bus.ctx.created.slice(shortFrom).filter((n) => n.kind === 'buffer');
const shortLen = (shortSrc[0]?.stopped[0] ?? 0) - (shortSrc[0]?.started[0]?.t ?? 0);
ok(shortSrc.length === 1 && Math.abs(shortLen - (2.30 + 0.02)) < 0.05,
  'total = 2.30 就截在 2.30 秒（total 只截尾，不再用来数拍）', `${fmt(shortLen, 2)}s`);
// period 是真正的节拍器：0.70 秒 ⇒ 倍速 1.17/0.70，三口气 0.70 秒一口
const fastFrom = bus.ctx.created.length;
bus.pant(2.30, { period: 0.70 });
const fast = bus.ctx.created.slice(fastFrom).filter((n) => n.kind === 'buffer');
ok(fast.length === 1 && Math.abs(fast[0].playbackRate.value - 1.17 / 0.70) < 1e-3,
  'period 换成 0.70 倍速就跟到 1.671（三口气 0.70 秒一口）',
  `${fast.length} 个 / rate ${f3(fast[0]?.playbackRate.value ?? 0)}`);
bus.samples.breath = realBreath;

// ── 4. 飞扑那一声尖叫 ─────────────────────────────────────────────────
console.log('── 尖叫 ──');
const screamNodes = bus.ctx.created.length;
const played = bus.scream(0.62);
const screamSrc = bus.ctx.created.slice(screamNodes).filter((n) => n.kind === 'buffer');
ok(played === true, 'scream() 用上了真采样（返回 true，没有退回合成音）');
ok(screamSrc.length === 1 && screamSrc[0].buffer === bus.samples.scream, '放的是尖叫采样');
ok(Math.abs(screamSrc[0].playbackRate.value - 0.92) < 1e-6, '0.92 倍速（压低一点更凶）',
  fmt(screamSrc[0].playbackRate.value));
ok(screamSrc[0].loop !== true, '尖叫只放一次');
ok(!bus.ctx.created.slice(screamNodes).some((n) => n.kind === 'osc'),
  '有采样时不再叠合成锯齿（两层会很脏）');

// ── 5. 素材没到时的兜底（断网 / 404）──────────────────────────────────
console.log('── 兜底 ──');
const bare = new AudioBus();
globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
bare.unlock();
await settle();
ok(!bare.samples.heartbeat, '404 时不会假装加载成功');
const warn = [];
const oldWarn = console.warn;
console.warn = (...args) => warn.push(args.join(' '));
bare.scream(0.5);
bare.breath();
console.warn = oldWarn;
ok(bare.ctx.created.some((n) => n.kind === 'osc'), '没采样时尖叫退回合成音（不会静音）',
  `${bare.ctx.created.filter((n) => n.kind === 'osc').length} 个振荡器`);
ok(bare.ctx.created.some((n) => n.kind === 'buffer' || n.kind === 'filter'),
  '没采样时喘气退回滤波噪声');

console.log('');
if (fail === 0) console.log('全部通过');
else console.log(`${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
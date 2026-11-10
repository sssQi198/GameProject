/**
 * 第二十一轮第一件事：追逐一开始，默认 BGM 必须「真的」停掉，而且之后
 * （安全屋 → 结局）都不能再自己响起来。
 *
 * 光看 setMood 里那个 0.0001 不算数：元素的 paused 还是 false、解码器还在跑，
 * 下一次 unlock() 就把它当「在播」，声音又出来了。所以这里查三层：
 *   1. 音频图：musicGain 排到的目标值到底是多少；
 *   2. 元素：淡出走完之后 music.paused 是不是 true，pause 被调用过几次；
 *   3. p3.js 每帧那个 stepMusicGain：会不会把 0.0001 又拽回 0.18 / 0.36。
 *
 * 用假 Web Audio（fakeaudio.mjs）跑，不需要浏览器。
 */
import { FakeCtx, installFakeAudio, lastTarget } from './fakeaudio.mjs';

installFakeAudio();

// 第三十二轮：追逐伴奏要真能起来，否则「伴奏在放、默认 BGM 必须停」会退化成空断言。
// 给它一个假素材：2 秒的 0.1 直流（非静音，拼接时不会被当头静音掐掉）。
const RAW_LEN = 96000;
const rawChannels = [new Float32Array(RAW_LEN).fill(0.1), new Float32Array(RAW_LEN).fill(0.1)];
globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(2048) });
class BusCtx extends FakeCtx {
  decodeAudioData() {
    return Promise.resolve({
      duration: RAW_LEN / 48000,
      length: RAW_LEN,
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: (c) => rawChannels[c],
    });
  }
}
globalThis.window.AudioContext = BusCtx;

// localStorage 在 node 里没有，audio.js 的读写都包了 try，但给一个更干净。
globalThis.localStorage = {
  _v: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
};

// 元素层面记账：play / pause 各调了几次、是不是真停了
const el = { play: 0, pause: 0 };
const BaseAudio = globalThis.Audio;
globalThis.Audio = class extends BaseAudio {
  constructor(src) {
    super(src);
    this.paused = true; // 新建的元素还没播
  }
  play() {
    el.play += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    el.pause += 1;
    this.paused = true;
  }
};

const { AudioBus } = await import('../src/audio.js');
const { tick } = await import('../src/team/p3.js');

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const target = (param) => lastTarget(param);
// 伴奏那层音量走的是淡入淡出斜坡（不是 setTarget），所以要看「最后一个事件的值」
const lastV = (param) => param.events.at(-1)?.v;

const bus = new AudioBus();
bus.unlock();
ok(Boolean(bus.ctx), '假 Web Audio 起来了');
ok(el.play >= 1, '开场 startMusic() 播过默认 BGM', `play ×${el.play}`);
ok(bus.musicOff === false, '起步时 musicOff = false');
// 伴奏是 unlock 时异步预加载的，等它解完（下面要断言它真的在放）
await sleep(20);
ok(bus.chaseFile.state === 'ready', '追逐伴奏素材在追逐之前就备好了', bus.chaseFile.state);

// ── 序章：正常 0.18 ──
bus.setMood('play', 1.25);
ok(target(bus.musicGain.gain) === 0.18, '序章 BGM 目标 0.18', String(target(bus.musicGain.gain)));

// ── 进安全屋：还是 0.18 ──
bus.setMood('calm');
ok(target(bus.musicGain.gain) === 0.18, '安全屋 BGM 目标 0.18', String(target(bus.musicGain.gain)));

// ── 追逐开始：0.0001 + musicOff + 追逐伴奏起来 ──
bus.setMood('chase');
ok(bus.musicOff === true, '追逐一开始 musicOff = true');
ok(target(bus.musicGain.gain) === 0.0001, '默认 BGM 目标压到 0.0001', String(target(bus.musicGain.gain)));
// 第三十二轮：伴奏只有「距离 → 音量」一条曲线（−6 dB … +1 dB），不再有总线增益
ok(bus.chaseFile.playing === true, '追逐伴奏真的起来了（一首 MP3）');
ok(lastV(bus.chaseFile.gain.gain) === Math.pow(10, -6 / 20),
  '伴奏按距离起播：压力 0 → −6 dB', String(lastV(bus.chaseFile.gain.gain)));
ok(bus.music && bus.music.paused === false, '淡出还没走完，元素先别 pause');

// 淡出 1.0s + 120ms 之后才 pause
await sleep(1350);
ok(el.pause >= 1, '淡出走完后真的 pause 了', `pause ×${el.pause}`);
ok(bus.music.paused === true, '元素已停（paused = true）');

// ── p3 每帧的增益推进不能把它抬回去 ──
const lvl = { entity: { position: { x: 0, z: 0 } } };
const env = { phase: 'level', mood: 'chase', playerX: 0, playerZ: 0, time: 1, audio: bus };
for (let i = 0; i < 8; i += 1) tick(lvl, 1 / 60, env);
ok(target(bus.musicGain.gain) === 0.0001, 'p3 追着写 8 帧也还是 0.0001', String(target(bus.musicGain.gain)));

// ── 到安全屋（calm）：不许有音乐，也不许把 flag 解掉 ──
bus.setMood('calm');
ok(bus.musicOff === true, '安全屋 musicOff 仍为 true');
ok(target(bus.musicGain.gain) === 0.0001, '安全屋 BGM 仍为 0.0001', String(target(bus.musicGain.gain)));
ok(!bus.chaseFile.playing, '追逐伴奏已收干净（BufferSource 已摘掉）');
ok(lastV(bus.chaseFile.gain.gain) === 0.0001, '伴奏音量淡到 0.0001，不是硬切',
  String(lastV(bus.chaseFile.gain.gain)));
ok(bus.music.paused === true, '安全屋元素仍是 paused');

// 结局阶段也走 calm / idle，清一遍
for (const mood of ['calm', 'idle', 'calm']) {
  bus.setMood(mood);
  ok(bus.musicOff === true && target(bus.musicGain.gain) === 0.0001, `结局段 ${mood} 仍然静音`);
}
const env2 = { ...env, phase: 'ending', mood: 'calm' };
for (let i = 0; i < 8; i += 1) tick(lvl, 1 / 60, env2);
ok(target(bus.musicGain.gain) === 0.0001, 'p3 在结局段也没抬 BGM', String(target(bus.musicGain.gain)));

// ── unlock 中途被调用（玩家点了一下画面）也不许复活 BGM ──
const before = el.play;
bus.unlock();
ok(el.play === before, 'musicOff 期间 unlock() 不会把元素重播', `play ×${el.play}`);
ok(bus.music.paused === true, 'unlock() 之后元素仍是 paused');

// ── 重开一局：restoreMusic() 解除封锁、渐起回 0.18 ──
bus.restoreMusic();
ok(bus.musicOff === false, 'restoreMusic() 解除 musicOff');
ok(el.play === before + 1, 'restoreMusic() 把元素接回播放', `play ×${el.play}`);
ok(bus.music.paused === false, '元素在播了');
ok(bus.musicGain.gain.value === 0.0001, 'restoreMusic() 从静音起步（直接写值，不等斜坡）');
bus.setMood('play', 1.25);
const e = [...bus.musicGain.gain.events].reverse().find((x) => x.kind === 'target' && x.v === 0.18);
ok(Boolean(e) && e.tc === 1.25, '重开后按 1.25s 时间常数渐起', e ? `τ=${e.tc}` : '没排到');
ok(bus.musicHold === false, '重开后没有残留 hold');

// ── duckMusic 是临时压制，不置 flag（开场黑幕用） ──
bus.duckMusic(0.4);
ok(bus.musicOff === false, 'duckMusic 不置 musicOff');
ok(bus.music.paused === false, 'duckMusic 不动元素（只是压音量）');

console.log(`\n通过 ${fail === 0 ? '全部' : '部分'}：失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
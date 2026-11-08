/**
 * 探针共用的假 Web Audio：把每个节点和每条参数自动化都记下来，
 * 这样不用开浏览器就能检查「排出来的音频图」。
 *
 * 注意它只覆盖 audio.js / chasemusic.js 用到的 API 子集：
 * createGain / Oscillator / BufferSource / BiquadFilter / StereoPanner /
 * MediaElementSource / createBuffer / resume / destination / currentTime。
 */

export class Param {
  constructor(v = 0) {
    this.value = v;
    this.events = [];
  }
  setValueAtTime(v, t) { this.events.push({ kind: 'set', v, t }); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push({ kind: 'lin', v, t }); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push({ kind: 'exp', v, t }); this.value = v; return this; }
  setTargetAtTime(v, t, tc) { this.events.push({ kind: 'target', v, t, tc }); this.value = v; return this; }
  cancelScheduledValues(t) { this.events.push({ kind: 'cancel', t }); return this; }
}

export class Node {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.frequency = new Param(440);
    this.Q = new Param(1);
    this.gain = new Param(1);
    this.pan = new Param(0);
    this.detune = new Param(0);
    /** 采样降调用的（AudioBufferSourceNode.playbackRate）。 */
    this.playbackRate = new Param(1);
    this.type = '';
    this.buffer = null;
    this.loop = false;
    this.started = [];
    this.stopped = [];
    /** 最后一个 connect 目标（老断言用）。 */
    this.dest = null;
    /** 全部 connect 目标：一个 LFO 同时晃两条嗓子时要靠它。 */
    this.dests = [];
  }
  connect(dest) { this.dest = dest; this.dests.push(dest); return dest; }
  disconnect() {}
  start(t = 0, offset = 0, duration = 0) { this.started.push({ t, offset, duration }); }
  stop(t = 0) { this.stopped.push(t); }
}

export class FakeCtx {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = { kind: 'destination' };
    this.created = [];
  }
  make(kind) {
    const n = new Node(this, kind);
    this.created.push(n);
    return n;
  }
  createGain() { return this.make('gain'); }
  createOscillator() { return this.make('osc'); }
  createBufferSource() { return this.make('buffer'); }
  createBiquadFilter() { return this.make('filter'); }
  createStereoPanner() { return this.make('panner'); }
  createMediaElementSource() { return this.make('media'); }
  createWaveShaper() {
    const n = this.make('shaper');
    n.curve = null;
    n.oversample = 'none';
    return n;
  }
  createBuffer(channels, length, rate) {
    const data = new Float32Array(length);
    return { duration: length / rate, length, sampleRate: rate, getChannelData: () => data };
  }
  resume() {}
}

/** 装上 window.AudioContext / Audio，让 AudioBus.unlock() 能跑起来。 */
export function installFakeAudio() {
  globalThis.window = { AudioContext: FakeCtx };
  globalThis.Audio = class {
    constructor(src) { this.src = src; this.paused = false; this.loop = false; }
    addEventListener() {}
    setAttribute() {}
    play() { return Promise.resolve(); }
  };
  return FakeCtx;
}

/** 抓 fn 执行期间新建的节点。 */
export function capture(ctx, fn) {
  const from = ctx.created.length;
  fn();
  return ctx.created.slice(from);
}

/** 某个参数最后一次 setTargetAtTime 的目标值。 */
export function lastTarget(param) {
  const e = [...param.events].reverse().find((x) => x.kind === 'target');
  return e ? e.v : null;
}

/** 这一堆节点里增益参数的峰值。 */
export function peakOf(nodes) {
  return Math.max(0, ...nodes
    .filter((n) => n.kind === 'gain')
    .map((n) => Math.max(0, ...n.gain.events.map((e) => e.v))));
}
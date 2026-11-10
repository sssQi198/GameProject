/**
 * chasemusic.js — 追逐段伴奏（第十九轮）
 *
 * 原来追逐段放的是 horror-music.mp4 那首循环曲压到 0.035（几乎听不见），靠 drone + 喘气 +
 * 心跳撑气氛。这一轮把喘气从追逐里拿掉了，于是需要一份真正的追逐伴奏：
 * 全程序化合成（振荡器 + 噪声 + 滤波 + 包络），不引外部音频，所以没有版权问题，
 * 也不受「没有 ffmpeg、不能转码」的限制。
 *
 * 四份候选是四种写法，同一份代码里并列，方便 A/B：
 *
 *   A 脉搏  pulse       —— 低频脉冲顶在心跳的缝里 + 不谐和二度长音（《失忆症》那种「跑不完的走廊」）
 *   B 锯弦  saw         —— 颤音锯弦持续 + 定音鼓 + 反向渐强（《生化危机》Mr.X 追逐）
 *   C 锤击  industrial  —— 每半拍一记金属敲击 + 失真低频脚步（《逃生》那种工业噪音）
 *   D 耳语  whisper     —— 气声耳语被慢速 LFO 撕开 + 半音冲突的钢琴单音（《层层恐惧》/《Visage》）
 *
 * 所有音色都是「排在未来某个时刻」的一次性节点：调度器提前 0.18 秒把下一拍排进去，
 * 所以不受 rAF 抖动影响，掉帧也不会走音。强度 intensity 0–1 由 game.js 按「与怪物的距离」喂进来，
 * 它统一抬高 BPM、抬高滤波截止、抬高每一下的增益——越近越凶。
 *
 * 用法（AudioBus 里）：
 *   const music = new ChaseMusic(ctx, chaseBus);
 *   music.setTrack(2); music.start(); music.setIntensity(0.7); music.update(); music.stop();
 */

const TRACK_GAIN = 0.9;
/** 调度窗口：提前这么多秒把接下来的拍子排进音频线程。 */
const LOOKAHEAD = 0.18;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 固定种子伪随机的 mulberry32：每次跑出同一串音，试听和游戏里听到的一致。 */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(ctx) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** 一记振荡音（t 是绝对时间，全部包络都排在 t 上）。返回创建的增益节点。 */
function tone(ctx, dest, t, spec) {
  const {
    type = 'sine', from, to = from, dur = 0.2, gain = 0.3, attack = 0.006, filter = null,
  } = spec;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  let head = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    const f0 = filter.from === undefined ? filter.freq || 800 : filter.from;
    f.frequency.setValueAtTime(f0, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
    f.Q.value = filter.q === undefined ? 1 : filter.q;
    o.connect(f);
    head = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  head.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return g;
}

/** 一记噪声（敲击、气声、扫频都用它）。 */
function noiseHit(ctx, dest, noise, t, spec) {
  const {
    dur = 0.08, type = 'bandpass', freq = 1500, to = null, q = 1,
    gain = 0.25, attack = 0.003, sweep = 0,
  } = spec;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  const maxOffset = Math.max(0, noise.duration - dur - 0.05);
  src.start(t, Math.min(Math.max(0, sweep), maxOffset));
  src.stop(t + attack + dur + 0.05);
  return g;
}

/**
 * 持续音色：一个振荡器过一条滤波，接进 mix。
 * `lfo` 可选，用来做慢速起伏（颤音 / 滤波呼吸）。
 */
function drone(ctx, dest, reg, spec) {
  const {
    type = 'sawtooth', freq = 55, detune = 0, gain = 0.12,
    filter = { type: 'lowpass', freq: 280, q: 1 }, lfo = null,
  } = spec;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  f.Q.value = filter.q === undefined ? 1 : filter.q;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  if (lfo) {
    const l = ctx.createOscillator();
    l.type = 'sine';
    l.frequency.value = lfo.rate;
    const lg = ctx.createGain();
    lg.gain.value = lfo.depth;
    l.connect(lg);
    lg.connect(lfo.to === 'gain' ? g.gain : f.frequency);
    l.start();
    reg(l, l.stop.bind(l));
  }
  o.start();
  reg(o, o.stop.bind(o));
  return { osc: o, filter: f, gain: g };
}

// ── A · 脉搏 ────────────────────────────────────────────────────────────
function buildPulse(ctx, dest, noise, reg) {
  const mix = ctx.createGain();
  mix.gain.value = TRACK_GAIN;
  mix.connect(dest);
  // 持续低音：两个锯齿差 0.5Hz，慢速拍频像喘不上气的胸腔
  drone(ctx, mix, reg, { type: 'sawtooth', freq: 55, gain: 0.16, filter: { type: 'lowpass', freq: 300, q: 1.2 } });
  drone(ctx, mix, reg, {
    type: 'sawtooth', freq: 55, detune: 28, gain: 0.11, filter: { type: 'lowpass', freq: 300, q: 1.2 },
    lfo: { rate: 0.23, depth: 90, to: 'filter' },
  });
  return {
    mix,
    /** 八分音符一步：132 bpm 起，压力满 170 bpm。 */
    stepDur: (i) => 30 / (132 + 34 * i),
    beat(t, n, i) {
      if (n % 2 === 0) {
        // 四分音符一记低频脉冲，正好落在心跳两下之间
        tone(ctx, mix, t, { from: 46, to: 34, dur: 0.16, gain: 0.34 + 0.18 * i, attack: 0.004 });
      } else {
        tone(ctx, mix, t, { from: 92, to: 64, dur: 0.07, gain: 0.1 + 0.05 * i, attack: 0.002 });
      }
      if (n % 8 === 0) {
        noiseHit(ctx, mix, noise, t, { freq: 2600, q: 1.4, dur: 0.09, gain: 0.16 + 0.08 * i });
      }
      if (n % 8 === 4) {
        tone(ctx, mix, t, {
          type: 'sawtooth', from: 220, to: 146, dur: 0.22, gain: 0.15 + 0.07 * i,
          filter: { from: 2400, to: 600, q: 2 },
        });
      }
      // 高音区的小二度：不解决，就一直吊着
      if (n % 16 === 3 || n % 16 === 11) {
        tone(ctx, mix, t, { type: 'triangle', from: 1244.5, dur: 0.14, gain: 0.05 + 0.03 * i });
      }
    },
  };
}

// ── B · 锯弦 ────────────────────────────────────────────────────────────
function buildSaw(ctx, dest, noise, reg) {
  const mix = ctx.createGain();
  mix.gain.value = TRACK_GAIN;
  mix.connect(dest);
  // 颤音锯弦：两条差 1.3Hz，7.5Hz 的振幅抖动就是「弦在抖」
  const a = drone(ctx, mix, reg, {
    type: 'sawtooth', freq: 110, gain: 0.1, filter: { type: 'lowpass', freq: 1500, q: 0.9 },
  });
  const b = drone(ctx, mix, reg, {
    type: 'sawtooth', freq: 110, detune: 21, gain: 0.08, filter: { type: 'lowpass', freq: 1500, q: 0.9 },
  });
  const trem = ctx.createOscillator();
  trem.type = 'sine';
  trem.frequency.value = 7.5;
  const tremGain = ctx.createGain();
  tremGain.gain.value = 0.035;
  trem.connect(tremGain);
  tremGain.connect(a.gain.gain);
  tremGain.connect(b.gain.gain);
  trem.start();
  reg(trem, trem.stop.bind(trem));
  drone(ctx, mix, reg, { type: 'sawtooth', freq: 164.8, gain: 0.05, filter: { type: 'lowpass', freq: 2200, q: 0.7 } });
  return {
    mix,
    stepDur: (i) => 30 / (120 + 30 * i),
    beat(t, n, i) {
      if (n % 8 === 0) {
        // 定音鼓：从 62Hz 掉到 40Hz，一记压住整小节
        tone(ctx, mix, t, { from: 62, to: 40, dur: 0.5, gain: 0.3 + 0.12 * i, attack: 0.008 });
      }
      if (n % 4 === 2) {
        // 弦乐刺：小二度叠着推上去，滤波从闷到亮
        for (const f0 of [164.8, 233.1]) {
          tone(ctx, mix, t, {
            type: 'sawtooth', from: f0, to: f0 * 1.01, dur: 0.2, gain: 0.12 + 0.06 * i,
            filter: { from: 500, to: 2600, q: 3 },
          });
        }
      }
      if (n % 8 === 6) {
        // 反向渐强：0.7 秒噪声从 300Hz 扫到 2200Hz
        noiseHit(ctx, mix, noise, t, {
          dur: 0.7, freq: 300, to: 2200, q: 2, gain: 0.11 + 0.06 * i, attack: 0.35,
        });
      }
    },
  };
}

// ── C · 锤击 ────────────────────────────────────────────────────────────
const HAMMER = [0.3, 0.13, 0.21, 0.1];

function buildIndustrial(ctx, dest, noise, reg) {
  const mix = ctx.createGain();
  mix.gain.value = TRACK_GAIN;
  mix.connect(dest);
  drone(ctx, mix, reg, { type: 'sawtooth', freq: 41, gain: 0.12, filter: { type: 'lowpass', freq: 110, q: 1.4 } });
  drone(ctx, mix, reg, { type: 'sawtooth', freq: 82, detune: 17, gain: 0.05, filter: { type: 'lowpass', freq: 180, q: 1 } });
  return {
    mix,
    stepDur: (i) => 30 / (148 + 40 * i),
    beat(t, n, i) {
      // 每半拍一记金属：带通 1400Hz、Q 9，就是「铁管敲铁栏」
      noiseHit(ctx, mix, noise, t, {
        freq: 1400, q: 9, dur: 0.05, gain: (HAMMER[n % 4] + 0.05) * (0.8 + 0.4 * i),
      });
      if (n % 2 === 0) {
        tone(ctx, mix, t, { from: 48, to: 36, dur: 0.12, gain: 0.3 + 0.1 * i, attack: 0.003 });
      }
      if (n % 8 === 5) {
        tone(ctx, mix, t, {
          type: 'sawtooth', from: 1800, to: 2600, dur: 0.35, gain: 0.05 + 0.03 * i,
          filter: { from: 1800, to: 4200, q: 6 },
        });
      }
      if (n % 16 === 8) {
        // 整块铁板落地
        noiseHit(ctx, mix, noise, t, { freq: 700, q: 3, dur: 0.55, gain: 0.2 + 0.08 * i });
        tone(ctx, mix, t, { from: 88, to: 44, dur: 0.45, gain: 0.18 + 0.06 * i });
      }
    },
  };
}

// ── D · 耳语 ────────────────────────────────────────────────────────────
const WHISPER_NOTES = [220, 233.1, 311.1, 466.2, 493.9, 116.5];

function buildWhisper(ctx, dest, noise, reg) {
  const mix = ctx.createGain();
  mix.gain.value = TRACK_GAIN;
  mix.connect(dest);
  // 气声：带通噪声被 0.9Hz 的 LFO 拉开合上，像贴耳说话
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 1.2;
  const wg = ctx.createGain();
  wg.gain.value = 0.09;
  src.connect(bp);
  bp.connect(wg);
  wg.connect(mix);
  src.start();
  reg(src, src.stop.bind(src));
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.9;
  const lg = ctx.createGain();
  lg.gain.value = 0.06;
  lfo.connect(lg);
  lg.connect(wg.gain);
  lfo.start();
  reg(lfo, lfo.stop.bind(lfo));
  // 地底轰鸣：30Hz 附近几乎听不见，但整台机器在震
  drone(ctx, mix, reg, { type: 'sine', freq: 33, gain: 0.13, filter: { type: 'lowpass', freq: 90, q: 0.7 } });
  drone(ctx, mix, reg, { type: 'sawtooth', freq: 66, detune: -23, gain: 0.04, filter: { type: 'lowpass', freq: 140, q: 1 } });
  const rand = seeded(20251107);
  return {
    mix,
    stepDur: (i) => 30 / (96 + 24 * i),
    beat(t, n, i) {
      if (n % 2 === 0) {
        noiseHit(ctx, mix, noise, t, { freq: 1800, q: 2, dur: 0.5, gain: 0.07 + 0.05 * i, attack: 0.16 });
      }
      if (n % 3 === 0) {
        // 钢琴单音：从半音冲突的音级里抽一个，1.2 秒衰减
        const f0 = WHISPER_NOTES[Math.floor(rand() * WHISPER_NOTES.length)];
        tone(ctx, mix, t, { from: f0, dur: 1.2, gain: 0.09 + 0.05 * i, attack: 0.01 });
        tone(ctx, mix, t, { type: 'triangle', from: f0 * 2.01, dur: 0.7, gain: 0.035 });
      }
      if (n % 4 === 2) {
        tone(ctx, mix, t, { from: 36, to: 30, dur: 0.25, gain: 0.18 + 0.08 * i, attack: 0.004 });
      }
      if (n % 8 === 7) {
        noiseHit(ctx, mix, noise, t, { type: 'highpass', freq: 1500, dur: 0.9, gain: 0.08 + 0.05 * i, attack: 0.5 });
      }
    },
  };
}

/**
 * 四份候选。`bpm` 只是给人看的（试听页显示用），真正的步长在 build 里按强度算。
 */
export const CHASE_TRACKS = [
  {
    id: 'pulse',
    name: 'A · 脉搏',
    brief: '低频脉冲顶在心跳缝里 + 不谐和二度长音',
    ref: '参考《失忆症：黑暗后裔》的追逐段',
    bpm: [132, 166],
    build: buildPulse,
  },
  {
    id: 'saw',
    name: 'B · 锯弦',
    brief: '颤音锯弦 + 定音鼓 + 反向渐强',
    ref: '参考《生化危机 2 重制》Mr.X 追逐',
    bpm: [120, 150],
    build: buildSaw,
  },
  {
    id: 'industrial',
    name: 'C · 锤击',
    brief: '每半拍一记金属敲击 + 失真低频脚步',
    ref: '参考《逃生》的工业化追击',
    bpm: [148, 188],
    build: buildIndustrial,
  },
  {
    id: 'whisper',
    name: 'D · 耳语',
    brief: '气声耳语 + 半音冲突的钢琴单音',
    ref: '参考《层层恐惧》《Visage》的压迫感',
    bpm: [96, 120],
    build: buildWhisper,
  },
];

/** 一个正在跑的乐器实例：管调度和拆机。 */
class Run {
  constructor(ctx, spec, dest, noise) {
    this.ctx = ctx;
    this.spec = spec;
    this.intensity = 0;
    this.beat = 0;
    this.next = ctx.currentTime + 0.06;
    this.sources = [];
    this.stopped = false;
    const reg = (src, stop) => this.sources.push({ src, stop });
    this.part = spec.build(ctx, dest, noise, reg);
  }

  setIntensity(v) {
    this.intensity = clamp01(v);
  }

  update() {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    // 掉帧很久之后不要一次补几十拍（会把音频线程打满）
    if (this.next < now - 0.5) this.next = now + 0.02;
    let guard = 0;
    while (this.next < horizon && guard < 32) {
      this.part.beat(this.next, this.beat, this.intensity);
      this.next += this.part.stepDur(this.intensity);
      this.beat += 1;
      guard += 1;
    }
  }

  dispose(when = this.ctx.currentTime + 0.05) {
    this.stopped = true;
    for (const s of this.sources) {
      try {
        s.stop(when);
      } catch {
        /* 已经停过就算了 */
      }
    }
    this.sources.length = 0;
  }
}

/**
 * 追逐伴奏的对外接口。AudioBus 持有一个实例，音量总线由 AudioBus 控制（chaseBus），
 * 这里只负责「放哪一首、多凶、什么时候停」。
 */
export class ChaseMusic {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.noise = makeNoise(ctx);
    this.index = 0;
    this.run = null;
    this.intensity = 0;
    this.level = 0;
    this.startedAt = 0;
  }

  static get tracks() {
    return CHASE_TRACKS;
  }

  get playing() {
    return Boolean(this.run);
  }

  get name() {
    return CHASE_TRACKS[this.index].name;
  }

  /** 切歌：正在放就先拆掉旧的再起新的，不会两首叠着。 */
  setTrack(index) {
    const n = CHASE_TRACKS.length;
    const i = ((Math.round(Number(index) || 0) - 1) % n + n) % n;
    const playing = this.playing;
    if (playing) this.stop(0.08);
    this.index = i;
    if (playing) this.start(this.level);
    return i;
  }

  start(level = TRACK_GAIN) {
    if (!this.ctx || this.run) return false;
    this.level = level;
    this.startedAt = this.ctx.currentTime;
    this.run = new Run(this.ctx, CHASE_TRACKS[this.index], this.dest, this.noise);
    this.run.setIntensity(this.intensity);
    return true;
  }

  stop(fade = 0.4) {
    if (!this.run) return false;
    const run = this.run;
    this.run = null;
    const now = this.ctx.currentTime;
    const when = now + Math.max(0, fade) + 0.05;
    const mix = run.part.mix;
    if (mix && fade > 0) {
      // 先淡出再拆，硬切会「啪」一声
      mix.gain.cancelScheduledValues(now);
      mix.gain.setValueAtTime(mix.gain.value || TRACK_GAIN, now);
      mix.gain.linearRampToValueAtTime(0.0001, when);
    }
    run.dispose(when);
    return true;
  }

  setIntensity(v) {
    this.intensity = clamp01(v);
    if (this.run) this.run.setIntensity(this.intensity);
    return this.intensity;
  }

  update() {
    if (this.run) this.run.update();
  }

  /** 探针 / 调试面板用。 */
  info() {
    const t = CHASE_TRACKS[this.index];
    return {
      index: this.index + 1,
      id: t.id,
      name: t.name,
      playing: this.playing,
      intensity: Number(this.intensity.toFixed(3)),
      beats: this.run ? this.run.beat : 0,
    };
  }
}
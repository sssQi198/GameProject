/**
 * 音效分两类：**关键时刻用 CC0 采样**，日常音效用 Web Audio 实时合成。
 *
 * 第十一轮起，怒吼和追逐音乐都换成网上下载的 CC0 素材（来源见 README 第十一轮）：
 * 合成器再调也做不出真嗓子和真鼓组的「脏」，而这两处恰恰是全关最该有质感的地方。
 * 采样是异步解码的：网速慢、解码失败、文件被删，roar() 都会自动退回第十轮那版合成长啸，
 * 追逐音乐同理退回 chasemusic.js 的节拍机器 —— 任何情况下关卡都不会变哑。
 * 浏览器会拦住自动播放，所以要等玩家点「开始」或「观看演示」再 unlock。
 */
import { ChaseMusic } from './chasemusic.js';

const STORAGE_VOL = 'wf-volume';
const STORAGE_MUTE = 'wf-muted';

/** 长啸时长（秒）。2.4 秒才够「喊」完，短了就只是「吼一下」。只在合成兜底时用。 */
const ROAR_SECONDS = 2.4;

/**
 * 吼声素材（CC0，来源见 README 第十二轮）。三选一，Dev 面板里可以逐个试听。
 * 挑的是「体型」三种不同：沙虫级巨兽（7.2 s 的原声 wav）、被惹毛的野兽嘶咬（3.3 s）、
 * 海怪（11 s）。都是非人类的原始录音，截 ROAR_SAMPLE_SECONDS 那一段再进 ROAR_DESIGNS 处理。
 * `design` = 这条录音自带的推荐档位：本身已经很低沉的少压，偏中频的多压。
 */
export const ROAR_SAMPLES = [
  { name: '巨兽沙虫', url: './assets/audio/roar-sandworm.wav', design: 1 },
  { name: '野兽嘶咬', url: './assets/audio/roar-beast.mp3', design: 1 },
  { name: '海怪', url: './assets/audio/roar-kraken.mp3', design: 2 },
];

/** 追逐音乐素材（CC0）。二选一，同样可以在 Dev 面板里换。都不是旋律向 BGM。 */
export const CHASE_BEDS = [
  { name: '恐怖张力脉冲', url: './assets/audio/chase-drone.mp3' },
  { name: '工业低鸣', url: './assets/audio/chase-industrial.mp3' },
];

/** 采样吼声播多长（秒）：够「啊——」收住，又不至于把整条走廊盖死。 */
const ROAR_SAMPLE_SECONDS = 2.6;

/** 采样降调比例（原声档）：0.9 ≈ 降两个半音，人声立刻变「不是人」。 */
export const ROAR_SAMPLE_RATE = 0.9;

/**
 * 原型链（design）：同一段录音，四套完全不同的音色。
 *
 * 素材本身「像人」或者「像乐器」，靠 EQ 是救不回来的。真正拉开距离的只有三件事：
 * ① `rate` 整体降调 —— 定体型（越低越「大」）；
 * ② `drop` 播放中继续往下滑 —— 定「失控」（纯降调只是慢放，滑下去才像嗓子在塌）；
 * ③ `growl` 喉部抖动 —— 定「活物」（20–35 Hz 拧音量，出来的是撕扯的颗粒）。
 * 真录音的共振峰保住了「嗓子」，所以这四档都是「把别人的嗓子往野兽方向推」，
 * 不是重新合成 —— 第十轮那版合成长啸被否，原因正是它没有真共振峰。
 *
 * 字段：rate 起始降调 / drop 结束时的比例 / sat 饱和强度 / growl 抖动频率(Hz)
 *      / formant 共振峰提升点(Hz) / breath 气流层 / sub 低八度层
 */
export const ROAR_DESIGNS = [
  { id: 'raw', label: '原声', rate: ROAR_SAMPLE_RATE, drop: 1, sat: 1.8, growl: 0, formant: 0, breath: 0, sub: 0 },
  { id: 'beast', label: '野兽', rate: 0.82, drop: 0.58, sat: 3.4, growl: 33, formant: 620, breath: 0.09, sub: 0.34 },
  { id: 'abyss', label: '深渊', rate: 0.7, drop: 0.62, sat: 4.6, growl: 19, formant: 360, breath: 0.13, sub: 0.55 },
  { id: 'child', label: '童声', rate: 1.16, drop: 1, sat: 2.2, growl: 0, formant: 900, breath: 0.05, sub: 0 },
];

/**
 * tanh 软饱和曲线：把锯齿压成「破锣」而不是正弦。输出 -1..1。
 *
 * 小信号必须**原样通过**——这是第十二轮的修正。原来的 tanh(k·x)/tanh(k) 在 x→0 处
 * 斜率是 k/tanh(k)：k=3.4 时 3.4 倍，k=4.6 时 4.6 倍。也就是说录音自带的底噪
 * （-40 dBFS 那一层）被整体抬了 8–10 dB，峰值却没变——听感就是吼声底下一直「嘶——」。
 * 现在 |x| ≤ 0.35 纯线性、|x| ≥ 0.9 才是满饱和，峰值仍是 1，
 * 所以 `peak` 那套响度归一化一个数都不用动。
 */
function screamCurve(k = 2.6, n = 1024) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    // smoothstep(0.35 → 0.9)：只有这一段把线性换成饱和
    const q = (a - 0.35) / 0.55;
    const w = q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q);
    c[i] = w === 0 ? x : x * (1 - w) + (Math.tanh(k * x) / norm) * w;
  }
  return c;
}

/**
 * 量一下采样：起音前有多少空白、峰值多高。
 *
 * 素材是别人录的，前面常带 0.1–0.3 秒静音 —— 直接播，吼声会「晚半拍」，
 * 而 game.js 是拿它当转场重音的。峰值用来做归一化：三段素材响度差一倍的话，
 * Dev 面板里 A/B 根本比不出好坏。
 */
function analyzeSample(buffer) {
  const ch = buffer.getChannelData(0);
  const limit = Math.min(ch.length, Math.floor(buffer.sampleRate * 0.6));
  const step = Math.max(1, Math.floor(buffer.sampleRate * 0.002));
  let offset = 0;
  for (let i = 0; i < limit; i += step) {
    if (Math.abs(ch[i]) > 0.02) {
      offset = Math.max(0, i / buffer.sampleRate - 0.015);
      break;
    }
  }
  let peak = 0;
  for (let i = 0; i < ch.length; i += 4) {
    const a = Math.abs(ch[i]);
    if (a > peak) peak = a;
  }
  return { offset, peak };
}

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.musicGain = null;
    this.music = null;
    this.musicSource = null;
    this.noise = null;
    this.volume = readNumber(STORAGE_VOL, 0.4);
    this.muted = localStorageSafe(STORAGE_MUTE) === '1';
    this.heartOn = false;
    this.heartT = 0;
    this.mood = 'idle';
    /** 追逐压力 0–1（按与怪物的距离算），决定心跳快慢和低频 drone 的音高。 */
    this.tension = 0;
    /** 上次真正写进 drone 的压力值，避免每帧都重排同一个自动化。 */
    this.tensionSent = -1;
    /** 起跑前抽空环境低频期间为 true。 */
    this.ambientDucked = false;
    /** 追逐段那台节拍机器（第一次进追逐才创建）。 */
    this.chase = null;
    /** 音乐层（原曲 + 追逐节拍）的总闸，吼声/重音效时整条让开。 */
    this.musicDuck = null;
    /** 正在响的那条长啸（cutRoar 要掐它）。 */
    this.roarVoice = null;
    /** 解码好的吼声素材 / 追逐音乐素材（异步填，加载失败就是空数组）。 */
    this.roarVariants = [];
    this.roarIndex = 0;
    this.chaseBeds = [];
    this.chaseBedIndex = 0;
    /** 当前在用的那条吼声，null = 还没加载好，走合成版。 */
    this.roarInfo = null;
    /** 吼声原型档（ROAR_DESIGNS 的下标）：默认「野兽」，要的就是不像人。 */
    this.roarDesignIndex = 1;
    /** 气流层用的白噪缓冲，第一次吼时才建。 */
    this.noiseBuf = null;
    this.samplesLoading = false;
    this.samplesReady = false;
  }

  /** 当前选中的吼声素材（没加载好就是 null）。 */
  roarBuffer() {
    const item = this.roarVariants[this.roarIndex];
    return (item && item.buffer) || null;
  }

  /** 当前选中的追逐音乐（没加载好就是 null）。 */
  bedBuffer() {
    const item = this.chaseBeds[this.chaseBedIndex];
    return (item && item.buffer) || null;
  }

  /**
   * 把 CC0 素材读进内存。unlock() 里调一次，解码完成前 roar() 会自己走合成版。
   * 单个文件失败只 warn，不影响其它文件和整局游戏。
   */
  async loadSamples() {
    if (!this.ctx || this.samplesLoading || this.samplesReady) return;
    this.samplesLoading = true;
    const decode = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return this.ctx.decodeAudioData(await res.arrayBuffer());
    };
    const roarJobs = ROAR_SAMPLES.map(async (item, i) => {
      try {
        const buffer = await decode(item.url);
        this.roarVariants[i] = { name: item.name, design: item.design, buffer, ...analyzeSample(buffer) };
      } catch (err) {
        console.warn('[audio] 吼声素材加载失败，改用合成版：', item.url, err);
      }
    });
    const bedJobs = CHASE_BEDS.map(async (item, i) => {
      try {
        const buffer = await decode(item.url);
        this.chaseBeds[i] = { name: item.name, buffer };
      } catch (err) {
        console.warn('[audio] 追逐音乐加载失败，改用合成节拍：', item.url, err);
      }
    });
    await Promise.all([...roarJobs, ...bedJobs]);
    this.roarVariants = this.roarVariants.filter(Boolean);
    this.chaseBeds = this.chaseBeds.filter(Boolean);
    this.roarIndex = 0;
    this.chaseBedIndex = 0;
    this.roarInfo = this.roarVariants[0] || null;
    // 第一条素材如果自带推荐档位，落地就用它，别让「沙虫」被默认档压成泥
    if (this.roarInfo && this.roarInfo.design != null) this.setRoarDesign(this.roarInfo.design);
    this.samplesLoading = false;
    this.samplesReady = true;
    // 采样还在路上时追逐就已经开始了：把床补进去（下一帧 update 就会响）
    if (this.chase && this.chase.active && this.bedBuffer()) this.chase.setBed(this.bedBuffer());
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.0001;
      this.ambientGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      // 音乐不直接进 master，先过一道「让开闸」：吼声要用它把音乐压下去
      this.musicDuck = this.ctx.createGain();
      this.musicDuck.gain.value = 1;
      this.musicGain.connect(this.musicDuck);
      this.musicDuck.connect(this.master);
      this.noise = makeNoise(this.ctx);
      this.startDrone();
      this.startMusic();
      // 采样异步解码，不 await：解码完成前 roar() 走合成版，追逐用合成节拍
      this.loadSamples();
    }
    this.applyVolume();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.music?.paused) this.music.play().catch(() => {});
  }

  applyVolume() {
    if (!this.master) return;
    const v = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    localStorageSafeSet(STORAGE_VOL, String(this.volume));
    this.applyVolume();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorageSafeSet(STORAGE_MUTE, this.muted ? '1' : '0');
    this.applyVolume();
    return this.muted;
  }

  setMood(mood) {
    this.mood = mood;
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const target = moodAmbient(mood);
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(target, now, 0.4);
    // setMood 一到，抽空状态就结束了，后面再调 duckAmbient 才是新一轮
    this.ambientDucked = false;
    if (this.droneA && this.droneB) {
      const f = this.dronePitch();
      this.droneA.frequency.setTargetAtTime(f, now, 0.5);
      this.droneB.frequency.setTargetAtTime(f * 1.5, now, 0.5);
    }
    if (this.musicGain) {
      // 追逐时把原来那首循环曲压到 0.035（比平时 0.18 低 14dB）：它已经陪玩家听了十分钟，
      // 再加大音量只会更腻。这一段交给 startChaseMusic() 的节拍层 ——
      // 压得够狠，玩家才会觉得「音乐换了」，而不是「原曲里叠了点鼓」。
      const musicTarget = mood === 'menu' ? 0.12 : mood === 'chase' ? 0.035 : 0.18;
      this.musicGain.gain.setTargetAtTime(musicTarget, now, 0.5);
    }
    // 离开追逐就收掉节拍层（被抓、通关、重开都会走这里）
    if (mood !== 'chase') this.stopChaseMusic();
  }

  /** 低频 drone 的基音：宁静时很高（196），追逐时沉到 48 并被压力顶到 58。 */
  dronePitch() {
    if (this.mood === 'calm') return 196;
    if (this.mood === 'chase') return 48 + 10 * this.tension;
    return 62;
  }

  /**
   * 追逐压力 0–1。game.js 每帧按「与怪物的距离」算好传进来。
   *
   * 只改已有节点的参数，不加节点：心跳周期 0.62 → 0.40 秒（97 → 150 bpm），
   * 低频 drone 48 → 58Hz。压力变化小于 2% 时整段跳过，免得每帧都重排自动化。
   */
  setTension(value) {
    const t = Math.max(0, Math.min(1, Number(value) || 0));
    this.tension = t;
    // 节拍层自己带节流和空值保护，先喂给它
    if (this.chase) this.chase.setTension(t);
    if (!this.ctx || !this.droneA) return;
    if (Math.abs(t - this.tensionSent) < 0.02) return;
    this.tensionSent = t;
    if (this.mood !== 'chase') return;
    const now = this.ctx.currentTime;
    const f = this.dronePitch();
    this.droneA.frequency.setTargetAtTime(f, now, 0.5);
    this.droneB.frequency.setTargetAtTime(f * 1.5, now, 0.5);
  }

  /**
   * 起跑前那一秒把环境低频抽掉（0.03 → 0.004），再在交还操作的瞬间放 stinger。
   * 真空 → 落地，这一下的冲击力比单独加一个音效强得多。
   */
  duckAmbient(on) {
    if (!this.ctx || !this.ambientGain) return;
    if (on === this.ambientDucked) return;
    this.ambientDucked = on;
    const now = this.ctx.currentTime;
    const target = on ? 0.004 : moodAmbient(this.mood);
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(target, now, on ? 0.14 : 0.06);
  }

  /**
   * 让音乐层（原曲 + 追逐节拍）暂时退后，给吼声腾位置 —— 就是一条手写 sidechain。
   *
   * 为什么必须做：吼声再响，只要它和音乐同时在中频，人耳听到的还是「音乐里多了点声音」。
   * 整条音乐先掉到 depth 一下、0.2 秒后再自己涨回来，吼声立刻从「背景」变成「前景」。
   *
   * @param {number} depth 让开的比例，0.5 = 音乐掉一半
   * @param {number} hold 让开多久（秒），之后按 0.25 秒的时间常数涨回去
   */
  duckMusic(depth = 0.5, hold = 0.9) {
    if (!this.ctx || !this.musicDuck) return;
    const now = this.ctx.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    // 落下来要快但别是台阶（台阶会「咔」），涨回去慢一点，像被吼声顶开再合上
    g.setTargetAtTime(Math.max(0.02, 1 - Math.max(0, Math.min(0.95, depth))), now, 0.04);
    g.setTargetAtTime(1, now + Math.max(0.05, hold), 0.25);
  }

  startMusic() {
    if (!this.ctx || this.music || !this.musicGain) return;
    this.music = new Audio('./assets/audio/horror-music.mp4');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.setAttribute('aria-hidden', 'true');
    this.musicSource = this.ctx.createMediaElementSource(this.music);
    this.musicSource.connect(this.musicGain);
    this.music.addEventListener('error', () => {
      console.warn('背景音乐加载失败:', this.music?.src);
    });
    this.music.play().catch(() => {
      // 若浏览器仍拦截播放，下一次用户交互时 unlock 会再次尝试。
    });
  }

  startDrone() {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.connect(this.ambientGain);
    this.droneA = osc(ctx, 'sine', 62, 0.22, filter);
    this.droneB = osc(ctx, 'triangle', 93, 0.06, filter);
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const ag = ctx.createGain();
    ag.gain.value = 0.015;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    air.connect(hp);
    hp.connect(ag);
    ag.connect(this.ambientGain);
    air.start();
  }

  update(dt) {
    // 节拍层按 ctx.currentTime 排程（0.15 秒 lookahead），掉帧不影响节拍
    if (this.chase) this.chase.update();
    if (!this.heartOn || !this.ctx) return;
    this.heartT += dt;
    // 追逐时心跳跟着压力走：0.62 秒（恐慌边缘）压到 0.40 秒（夺路而逃）
    const period = this.mood === 'chase' ? 0.62 - 0.22 * this.tension : 0.9;
    if (this.heartT >= period) {
      this.heartT = 0;
      this.heartbeat(this.mood === 'chase' ? 0.55 + 0.25 * this.tension : 0.55);
    }
  }

  startHeartbeat() {
    this.heartOn = true;
    this.heartT = 0.5;
  }

  stopHeartbeat() {
    this.heartOn = false;
    this.tension = 0;
    this.tensionSent = -1;
  }

  heartbeat(gain = 0.55) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(t, gain);
    // 第二下（舒张期）轻一点，太对称会像鼓点而不是心跳
    this.thump(t + 0.15, gain * 0.78);
  }

  thump(time, gain = 0.55) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(78, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    o.connect(g);
    g.connect(this.master);
    o.start(time);
    o.stop(time + 0.22);
  }

  footstep(indoors) {
    // 提高脚步声的瞬态增益，让它在背景音乐播放时仍然清晰可辨。
    this.burst({
      duration: 0.11,
      gain: indoors ? 0.34 : 0.24,
      type: 'bandpass',
      freq: indoors ? 280 : 180,
      q: 0.7,
    });
  }

  /**
   * 追逐中怪物的脚步。distance 是与玩家的直线距离（米）。
   *
   * 之前的追逐是**完全静音**的 —— 只有画面在动，耳朵里什么都没有，
   * 玩家判断不了它在哪、还差多远。这里用「低沉的一下 + 爪尖轻碰」两层：
   * 低频给体重，高频给方位。`pan` 由 game.js 每步在 ±0.28 之间交替（左右脚）。
   */
  monsterStep(distance, pan = 0) {
    if (!this.ctx) return;
    const near = 1 - Math.max(0, Number(distance) || 0) / 14;
    if (near <= 0.02) return;
    const vol = Math.pow(near, 1.35) * 0.5;
    const offset = Math.random() * 0.7;
    this.burst({ duration: 0.17, gain: vol, type: 'lowpass', freq: 150, q: 0.8, pan, offset });
    this.burst({
      duration: 0.045,
      gain: vol * 0.34,
      type: 'bandpass',
      freq: 1100,
      q: 1.3,
      pan,
      offset,
      delay: 0.012,
    });
  }

  /**
   * 走廊灯被甩在身后、永久熄灭的那一下：灯丝「嗡」一下断掉 + 玻璃轻响。
   * pan 由灯与玩家的横向差算（hallglow.hallLampPan），听见就知道是那一盏灭了。
   */
  lampDeath(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.07);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g);
    g.connect(this.out(pan));
    o.start(t);
    o.stop(t + 0.1);
    this.burst({ duration: 0.06, gain: 0.13, type: 'bandpass', freq: 300, q: 1.0, pan });
    this.burst({ duration: 0.09, gain: 0.1, type: 'highpass', freq: 2800, q: 0.8, pan, delay: 0.03 });
  }

  /**
   * 怪物的怒吼。`vol` 0–1.2（远近靠它给），`pan` 声像。
   *
   * 第十轮推倒重做。上一版是「一下闷响」：96→62Hz 下滑 + 两个窄带通，
   * 听感上是一声低吼，不像嗓子在喊。要的是「呃——啊啊啊啊啊！！」：
   *   呃  0.05 秒的喉塞起音：150Hz 闭口元音 /ə/（峰 500 / 1500）+ 一股气流
   *   啊  0.26 秒跳到 330Hz，元音滑到 /a/（峰 780 / 1150 / 2600），
   *       之后 352 → 360 → 300 → 196Hz，两秒多才收 —— 长，才像「喊」
   *   颤  5.5 → 7Hz，深度 18 → 70 音分（越喊越不稳，这是人声和合成器的分界）
   *   破  tanh 软饱和（WaveShaper）+ 12Hz 锯齿调幅，把正弦感压成破锣
   *   肉  低八度的第二条嗓子（165 → 90Hz）走 240Hz 低通，耳机上的胸口
   *   噪  750Hz 喉音噪声 + 2.4k → 1.4k 嘶声，一起进饱和
   *
   * 长度 2.4 秒。`cutRoar()` 负责在「死寂真空」和玩家被咬时把它掐断 ——
   * 不掐的话，长啸会把设计好的那一秒静音整个盖掉。
   *
   * 第十一轮：素材加载好就走采样（真嗓子），这条路只在加载失败时兜底。
   */
  roar(vol = 0.8, pan = 0) {
    if (!this.ctx || !this.noise) return;
    const v = Math.max(0, Math.min(1.2, Number(vol) || 0));
    if (v <= 0.01) return;
    // 两条长啸叠在一起只会变糊：新的直接盖掉旧的
    this.cutRoar(0.06);
    if (this.roarBuffer()) {
      this.sampleRoar(v, pan);
      return;
    }
    const t = this.ctx.currentTime;
    const dur = ROAR_SECONDS;
    const out = this.out(pan);

    // 饱和放在包络前面：尾音收小的时候也不会变「干净」
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = screamCurve(2.6);
    shaper.oversample = '2x';
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.86 * v, t + 0.24);
    env.gain.exponentialRampToValueAtTime(0.98 * v, t + 0.55);
    env.gain.exponentialRampToValueAtTime(0.78 * v, t + 1.7);
    env.gain.exponentialRampToValueAtTime(0.42 * v, t + 2.15);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    shaper.connect(env);
    env.connect(out);

    // 进饱和前先让开 6dB，否则一开口就被压成方波（那不是破音，是噪音）
    const mix = this.ctx.createGain();
    mix.gain.value = 0.55;
    const rough = this.ctx.createGain();
    rough.gain.value = 0.7;
    mix.connect(rough);
    rough.connect(shaper);

    // 音高轮廓：呃(150) → 啊(330) → 撑住(360) → 落(300) → 松掉(196)
    const contour = [[0, 150], [0.16, 168], [0.26, 330], [0.9, 352], [1.45, 360], [2.0, 300], [dur, 196]];
    const scream = (mul) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(contour[0][1] * mul, t);
      for (let i = 1; i < contour.length; i += 1) {
        o.frequency.exponentialRampToValueAtTime(contour[i][1] * mul, t + contour[i][0]);
      }
      return o;
    };
    const voice = scream(1);
    // 两把嗓子差 10 音分：拍频一起，才有「两条声带」而不是一把琴
    const voice2 = scream(1.006);
    voice2.detune.value = 12;

    // 元音从 /ə/ 滑到 /a/：三个共振峰一起移位，这才是「呃→啊」的关键
    const formant = (from, to, q, gain) => {
      const b = this.ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.Q.value = q;
      b.frequency.setValueAtTime(from, t);
      b.frequency.exponentialRampToValueAtTime(to, t + 0.26);
      const g = this.ctx.createGain();
      g.gain.value = gain;
      b.connect(g);
      g.connect(mix);
      return b;
    };
    const f1 = formant(500, 780, 6, 0.9);
    const f2 = formant(1500, 1150, 8, 0.7);
    const f3 = formant(2500, 2600, 9, 0.35);

    // 肉声：2400Hz 低通直通，整串谐波留下来 —— 小喇叭靠这段出声
    const body = this.ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 2400;
    body.Q.value = 0.7;
    const bodyG = this.ctx.createGain();
    bodyG.gain.value = 0.4;
    body.connect(bodyG);
    bodyG.connect(mix);
    for (const f of [f1, f2, f3]) {
      voice.connect(f);
      voice2.connect(f);
    }
    voice.connect(body);
    voice2.connect(body);

    // 低八度的胸腔：90–165Hz，耳机上才有「大」的体量
    const chest = this.ctx.createOscillator();
    chest.type = 'sawtooth';
    chest.frequency.setValueAtTime(165, t);
    chest.frequency.exponentialRampToValueAtTime(96, t + 0.3);
    chest.frequency.exponentialRampToValueAtTime(90, t + dur);
    const chestLp = this.ctx.createBiquadFilter();
    chestLp.type = 'lowpass';
    chestLp.frequency.value = 240;
    chestLp.Q.value = 0.8;
    const chestG = this.ctx.createGain();
    chestG.gain.value = 0.3;
    chest.connect(chestLp);
    chestLp.connect(chestG);
    chestG.connect(mix);

    // 颤音：两条嗓子同步晃，深度随时间涨上去
    const vib = this.ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.setValueAtTime(5.5, t);
    vib.frequency.linearRampToValueAtTime(7, t + dur);
    const vg = this.ctx.createGain();
    vg.gain.setValueAtTime(18, t);
    vg.gain.linearRampToValueAtTime(70, t + dur * 0.7);
    vib.connect(vg);
    vg.connect(voice.detune);
    vg.connect(voice2.detune);

    // 12Hz 锯齿调幅：破音那一下的「锯齿边」
    const roughLfo = this.ctx.createOscillator();
    roughLfo.type = 'sawtooth';
    roughLfo.frequency.value = 12;
    const rlG = this.ctx.createGain();
    rlG.gain.value = 0.3;
    roughLfo.connect(rlG);
    rlG.connect(rough.gain);

    // 喉音噪声：750Hz 宽带，跟着 12Hz 一起被切
    const rasp = this.ctx.createBufferSource();
    rasp.buffer = this.noise;
    rasp.loop = true;
    const rb = this.ctx.createBiquadFilter();
    rb.type = 'bandpass';
    rb.frequency.value = 750;
    rb.Q.value = 1.1;
    const rg = this.ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.45 * v, t + 0.1);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.05);
    rasp.connect(rb);
    rb.connect(rg);
    rg.connect(rough);

    // 嘶声：2.4k → 1.4k，气声的「啊」全靠它
    const hiss = this.ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2400, t);
    hp.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
    hp.Q.value = 2;
    const hg = this.ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.12);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    hiss.connect(hp);
    hp.connect(hg);
    hg.connect(rough);

    // 起音那一下的「呃」：喉塞 + 气流，光靠振荡器起不来
    this.burst({ duration: 0.05, gain: 0.18 * v, type: 'bandpass', freq: 420, q: 1.2, pan });

    // 把音乐让开：没有这一步，吼声在中频永远只是「垫在音乐下面」
    this.duckMusic(0.55, 1.2);

    const stops = [voice, voice2, vib, roughLfo, chest, rasp, hiss];
    for (const n of stops) n.start(t);
    voice.stop(t + dur + 0.02);
    voice2.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
    roughLfo.stop(t + dur + 0.02);
    chest.stop(t + dur + 0.02);
    rasp.stop(t + 2.1);
    hiss.stop(t + 2.15);
    this.roarVoice = { env, stops };
  }

  /**
   * 掐断当前长啸（默认 0.12 秒淡出）。
   * 「死寂真空」那 0.73 秒和玩家被咬的瞬间都要它：2.4 秒的长啸会把静音盖掉。
   */
  cutRoar(fade = 0.12) {
    const cur = this.roarVoice;
    if (!cur || !this.ctx) return;
    this.roarVoice = null;
    const now = this.ctx.currentTime;
    const f = Math.max(0.03, Number(fade) || 0.12);
    const g = cur.env.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.exponentialRampToValueAtTime(0.0001, now + f);
    } catch {
      /* 已经收干净 */
    }
    for (const n of cur.stops) {
      try {
        n.stop(now + f + 0.02);
      } catch {
        /* 已经停过 */
      }
    }
  }

  /**
   * 白噪缓冲（吼声里的气流层）。固定种子：同一局的两次吼声必须是同一个「嗓子」，
   * 不能用 Math.random —— 那样连吼两下会听见两个不同的生物。
   */
  noiseBuffer() {
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x2f6e2b1;
    for (let i = 0; i < len; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = seed / 0x3fffffff - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  /**
   * 采样版怒吼：真嗓子 + 一条很短的「怪物化」链（档位见 ROAR_DESIGNS）。
   *
   * 链路：bufferSource → 60Hz 高通 → tanh 饱和 → 共振峰 peaking → 喉部抖动 AM → 包络 → 总线
   * 并行两层：低八度（只过低通，做「体型」）+ 气流（白噪过带通，做「嗓子破」）。
   *
   * 不叠合成层的原因没变：合成器没有真共振峰，叠上去只会互相打架。
   * 这里所有加工都是对别人嗓子的再处理，原始破音和气息都还在。
   */
  sampleRoar(v, pan) {
    const info = this.roarVariants[this.roarIndex];
    if (!info || !info.buffer) return;
    const d = ROAR_DESIGNS[this.roarDesignIndex] || ROAR_DESIGNS[0];
    const t = this.ctx.currentTime;
    const rate = d.rate;
    // start() 的第三参数是「缓冲里的秒数」，所以要乘回 rate 才是播出时长
    const span = Math.min((info.buffer.duration - info.offset) * 0.98, ROAR_SAMPLE_SECONDS * rate);
    const outSec = span / rate;
    if (outSec <= 0.1) return;

    const src = this.ctx.createBufferSource();
    src.buffer = info.buffer;
    src.playbackRate.setValueAtTime(rate, t);
    // 往下滑才是「失控」；只降调听起来只是慢放，嗓子在塌才吓人
    if (d.drop !== 1) {
      src.playbackRate.exponentialRampToValueAtTime(Math.max(0.05, rate * d.drop), t + outSec * 0.9);
    }

    // 60Hz 以下全是房间嗡声，不掐掉会糊住下面那层 drone
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 60;
    hp.Q.value = 0.7;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = screamCurve(d.sat);
    shaper.oversample = '2x';

    let out = shaper;
    hp.connect(shaper);

    // 共振峰：把「呃/啊」的元音位置顶起来，不然一路降调会变成闷响
    if (d.formant > 0) {
      const peak = this.ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = d.formant;
      peak.Q.value = 1.1;
      peak.gain.value = 7;
      out.connect(peak);
      out = peak;
    }

    // 喉部抖动：20–35Hz 的正弦拧音量，出来的是撕扯感而不是颤音。
    // amNode 留着给下面那层气流用 —— 气和嗓子必须一起被抖，见气流层那三条规矩。
    let amNode = null;
    let growlOsc = null;
    if (d.growl > 0) {
      const am = this.ctx.createGain();
      am.gain.value = 0.62;
      growlOsc = this.ctx.createOscillator();
      growlOsc.type = 'sine';
      growlOsc.frequency.value = d.growl;
      const depth = this.ctx.createGain();
      depth.gain.value = 0.38;
      growlOsc.connect(depth);
      depth.connect(am.gain);
      out.connect(am);
      out = am;
      amNode = am;
    }

    // 起音 15ms 就到位：这是「被吓一跳」的那一下，不能有淡入的前摇；
    // 尾巴在最后 28% 收掉，免得 3.8 秒的原始录音拖到下一句台词上。
    const env = this.ctx.createGain();
    const peak = 0.95 * v * Math.max(0.6, Math.min(2.2, 0.9 / Math.max(0.05, info.peak)));
    // 层多了要留余量，不然三层加完直接削波（削波是「糊」，不是「响」）
    const head = 1 / (1 + d.sub * 0.8 + d.breath);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * head), t + 0.015);
    env.gain.setValueAtTime(Math.max(0.001, peak * head), t + outSec * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + outSec);

    src.connect(hp);
    out.connect(env);
    env.connect(this.out(pan));
    src.start(t, info.offset, span);
    src.stop(t + outSec + 0.02);
    const stops = [src];

    // 低八度层：只做过低通，负责「这东西有多大」
    if (d.sub > 0) {
      const sub = this.ctx.createBufferSource();
      sub.buffer = info.buffer;
      sub.playbackRate.setValueAtTime(rate * 0.5, t);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      lp.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.value = d.sub;
      sub.connect(lp);
      lp.connect(g);
      g.connect(env);
      sub.start(t, info.offset, Math.min(span, info.buffer.duration - info.offset));
      sub.stop(t + outSec + 0.02);
      stops.push(sub);
    }

    // 气流层：破掉的那口气。没有它，纯低频听起来像音箱而不是生物。
    //
    // 但「嘶嘶底噪」也正是从这里来的，所以这一层有三条硬规矩（第十三轮修正）：
    //  ① **必须跟嗓子一起被抖**（接到 amNode，而不是直接挂包络）。
    //     不随喉部抖动的白噪，耳朵收不到「喘息」，只收到「底噪」；
    //     更糟的是 AM 波谷里主声掉到 24%、噪声却不变，等于把嘶声单独拎出来放大。
    //  ② **自己有条包络**：只在发力那半段有气，最后 22% 先收干净。
    //     否则主声和低八度都在衰减，只剩一层不衰减的白噪挂在那儿响。
    //  ③ **窄一点、轻一点**：1400Hz / Q0.9（原来 1600Hz / Q0.6，通带近 3kHz，
    //     等于在 300–3000Hz 铺了一整条毯子）。电平另见 ROAR_DESIGNS.breath。
    // 它不进饱和器：加「气」不需要再被 tanh 压一遍，压了只会把嘶声做得更硬。
    if (d.breath > 0) {
      const air = this.ctx.createBufferSource();
      air.buffer = this.noiseBuffer();
      air.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.value = d.breath;
      const aenv = this.ctx.createGain();
      aenv.gain.setValueAtTime(0.0001, t);
      aenv.gain.exponentialRampToValueAtTime(1, t + 0.06);
      aenv.gain.setValueAtTime(1, t + outSec * 0.5);
      aenv.gain.exponentialRampToValueAtTime(0.0001, t + outSec * 0.78);
      air.connect(bp);
      bp.connect(g);
      g.connect(aenv);
      aenv.connect(amNode || env);
      air.start(t);
      air.stop(t + outSec + 0.02);
      stops.push(air);
    }

    if (growlOsc) {
      growlOsc.start(t);
      growlOsc.stop(t + outSec + 0.02);
      stops.push(growlOsc);
    }

    // 和合成版同样的让位：没有这一步，吼声永远只是「音乐里多了点声音」
    this.duckMusic(0.6, 1.1);
    this.roarVoice = { env, stops };
  }

  /**
   * 换一条吼声原型（Dev 面板用）：'raw' 原声 / 'beast' 野兽 / 'abyss' 深渊 / 'child' 童声。
   * 返回档位名；下标越界会夹到合法范围，所以永远有返回值。
   */
  setRoarDesign(index) {
    const i = Math.max(0, Math.min(ROAR_DESIGNS.length - 1, Math.round(Number(index) || 0)));
    this.roarDesignIndex = i;
    return ROAR_DESIGNS[i].label;
  }

  /** 当前吼声原型档的名字（Dev 面板提示用）。 */
  roarDesignName() {
    return (ROAR_DESIGNS[this.roarDesignIndex] || ROAR_DESIGNS[0]).label;
  }

  /**
   * 换一条吼声（Dev 面板 A/B/C 用）。返回素材名，没加载好就返回 null。
   * 正在响的那条不掐 —— 试听时连点两下才有「对比」的意思。
   * 素材自带推荐档位时会一起切过去，保证每条录音一开口就是它该有的音色。
   */
  setRoarSample(index) {
    const i = Math.max(0, Math.min(this.roarVariants.length - 1, Number(index) || 0));
    const item = this.roarVariants[i];
    if (!item) return null;
    this.roarIndex = i;
    this.roarInfo = item;
    if (item.design != null) this.setRoarDesign(item.design);
    return item.name;
  }

  /** 当前吼声素材的名字（Dev 面板提示用），没加载好返回 null。 */
  roarSampleName() {
    const item = this.roarVariants[this.roarIndex];
    return (item && item.name) || null;
  }

  /** 换一首追逐音乐（Dev 面板用）。正在响就重开一次，让新床立刻生效。 */
  setChaseBed(index) {
    const i = Math.max(0, Math.min(this.chaseBeds.length - 1, Number(index) || 0));
    const item = this.chaseBeds[i];
    if (!item) return null;
    this.chaseBedIndex = i;
    if (this.chase && this.chase.active) {
      this.chase.stop();
      this.startChaseMusic();
    }
    return item.name;
  }

  /**
   * 起跑那一下：92 → 34Hz 的下潜 + 一层 300 → 2600Hz 的噪声扫过。
   * game.js 里和「快跑！」同一帧触发，前面已经用 duckAmbient 抽空了一秒。
   */
  stinger() {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.72, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.64);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    f.Q.value = 1.1;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(f);
    f.connect(ng);
    ng.connect(this.master);
    src.start(t, 0.2);
    src.stop(t + 0.45);

    // 耳朵里的那一下「嗡」：五度双音，很轻，只给紧迫感不给旋律
    this.tone(660, 0.18, 0.05, 'triangle');
    this.tone(990, 0.22, 0.028, 'sine');
  }

  /**
   * 追逐段节拍层开始。由 game.js 在「镜头转回逃跑方向、快跑！出现」那一帧调用，
   * 所以第一拍和 stinger 落在同一帧；真空那 0.73 秒里它还没出生。
   */
  startChaseMusic() {
    if (!this.ctx || !this.noise) return;
    if (!this.chase) this.chase = new ChaseMusic(this.ctx, this.noise, this.musicDuck || this.master);
    // 采样音乐到位就用它；没到位（还在下载 / 加载失败）就用合成节拍机器
    this.chase.setBed(this.bedBuffer());
    this.chase.start();
    // start() 会把内部压力归零，这里补一次：第一拍就按当前距离的快慢走
    this.chase.setTension(this.tension);
  }

  stopChaseMusic() {
    if (!this.chase) return;
    this.chase.stop();
  }

  shutter(success) {
    // 「咔嚓」：攻击 tick + 中频「咔」，85ms 后高频「嚓」，两段间隔分明
    this.burst({ duration: 0.008, gain: 0.45, type: 'highpass', freq: 6000, q: 0.7 });
    this.burst({ duration: 0.035, gain: 0.6, type: 'bandpass', freq: 2400, q: 1.5 });
    this.burst({ duration: 0.028, gain: 0.65, type: 'highpass', freq: 3800, q: 0.7, delay: 0.085 });
    this.burst({ duration: 0.05, gain: 0.12, type: 'lowpass', freq: 500, q: 0.7 });
    if (success) this.tone(660, 0.12, 0.07, 'sine');
  }

  cameraUp() {
    // 拿出相机：衣物摩擦，音高上扬
    this.burst({ duration: 0.2, gain: 0.1, type: 'bandpass', freq: 750, q: 0.8 });
    this.burst({ duration: 0.14, gain: 0.06, type: 'bandpass', freq: 1400, q: 0.9, delay: 0.07 });
  }

  cameraDown() {
    // 收起相机：衣物摩擦，音高下沉
    this.burst({ duration: 0.2, gain: 0.09, type: 'bandpass', freq: 520, q: 0.8 });
    this.burst({ duration: 0.14, gain: 0.05, type: 'bandpass', freq: 900, q: 0.9, delay: 0.07 });
  }

  photoFail() {
    this.tone(196, 0.16, 0.05, 'triangle');
    this.tone(155, 0.2, 0.04, 'sine');
  }

  pickup() {
    this.tone(520, 0.08, 0.06, 'sine');
    this.tone(780, 0.12, 0.04, 'sine');
  }

  door() {
    // 关门声提高增益并略微延长尾音，避免被音乐低频掩盖。
    this.burst({ duration: 0.55, gain: 0.42, type: 'bandpass', freq: 220, q: 0.6 });
    this.burst({ duration: 0.18, gain: 0.16, type: 'highpass', freq: 1200, q: 0.8, delay: 0.04 });
  }

  scratch() {
    this.burst({ duration: 0.35, gain: 0.12, type: 'bandpass', freq: 1400, q: 1.4 });
  }

  breath() {
    this.burst({ duration: 0.7, gain: 0.14, type: 'lowpass', freq: 500, q: 0.5 });
  }

  blip() {
    this.tone(880, 0.06, 0.05, 'sine');
  }

  win() {
    this.tone(392, 0.22, 0.06, 'sine');
    this.tone(494, 0.28, 0.05, 'sine');
    this.tone(587, 0.4, 0.05, 'triangle');
  }

  lose() {
    this.tone(146, 0.4, 0.08, 'sawtooth');
    this.tone(98, 0.55, 0.06, 'sine');
  }

  tone(freq, duration, gain, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  npcStep(distance) {
    const maxDist = 14;
    const factor = Math.max(0, 1 - distance / maxDist);
    // NPC 脚步也保持与玩家脚步相近的存在感，避免被背景音乐掩盖。
    const vol = factor * 0.2;
    if (vol <= 0.001) return;
    this.burst({ duration: 0.11, gain: vol, type: 'bandpass', freq: 180, q: 0.7 });
  }

  /**
   * 一段噪声的打击声。`pan` 不给就是原来的单声道直连 master；
   * 给了就走一次立体声声像（追逐中怪物的左右脚）。`offset` 用来在噪声缓冲里
   * 换一个起点 —— 同一段噪声反复从 0 秒开始会听起来像电子节拍器。
   */
  burst({ duration, gain, type, freq, q, delay = 0, pan = null, offset = 0 }) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.out(pan));
    const maxOffset = Math.max(0, this.noise.duration - duration - 0.02);
    src.start(t, Math.min(Math.max(0, offset), maxOffset));
    src.stop(t + duration + 0.02);
  }

  /** 取一个出口：不指定声像就直连 master，指定了就过一个 StereoPanner。 */
  out(pan) {
    if (pan === null || pan === undefined) return this.master;
    if (!this.ctx || typeof this.ctx.createStereoPanner !== 'function') return this.master;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);
    return panner;
  }
}

function osc(ctx, type, freq, gain, dest) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(dest);
  o.start();
  return o;
}

/** 每个 mood 对应的环境低频音量。setMood 和 duckAmbient 必须用同一张表。 */
function moodAmbient(mood) {
  if (mood === 'calm') return 0.05;
  if (mood === 'chase') return 0.03;
  if (mood === 'idle') return 0.0001;
  return 0.045;
}

function makeNoise(ctx) {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function readNumber(key, fallback) {
  const raw = localStorageSafe(key);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function localStorageSafe(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSafeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

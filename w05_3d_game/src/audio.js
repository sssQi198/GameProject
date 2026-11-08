/**
 * 音效：日常音效全部用 Web Audio 实时合成，菜单/关卡底噪走一条循环曲。
 *
 * 第十四轮起，「吼叫」与「追逐特殊音乐」整套下线（素材、合成器、Dev 面板试听一起删），
 * 这两块等以后重做；现在追逐段只剩 drone / 心跳 / 脚步 / 金属摩擦这些程序化层。
 * 浏览器会拦住自动播放，所以要等玩家点「开始」或「观看演示」再 unlock。
 */

const STORAGE_VOL = 'wf-volume';
const STORAGE_MUTE = 'wf-muted';

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
      this.musicGain.connect(this.master);
      this.noise = makeNoise(this.ctx);
      this.startDrone();
      this.startMusic();
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
      // 再加大音量只会更腻，索性让位给 drone / 心跳。
      const musicTarget = mood === 'menu' ? 0.12 : mood === 'chase' ? 0.035 : 0.18;
      this.musicGain.gain.setTargetAtTime(musicTarget, now, 0.5);
    }
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

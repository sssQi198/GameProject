/**
 * 音效用 Web Audio 实时合成，背景音乐从 assets/audio 加载。
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
    const target = mood === 'calm' ? 0.05 : mood === 'chase' ? 0.03 : mood === 'idle' ? 0.0001 : 0.045;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(target, now, 0.4);
    if (this.droneA && this.droneB) {
      const f = mood === 'calm' ? 196 : mood === 'chase' ? 48 : 62;
      this.droneA.frequency.setTargetAtTime(f, now, 0.5);
      this.droneB.frequency.setTargetAtTime(f * 1.5, now, 0.5);
    }
    if (this.musicGain) {
      const musicTarget = mood === 'menu' ? 0.12 : mood === 'chase' ? 0.23 : 0.18;
      this.musicGain.gain.setTargetAtTime(musicTarget, now, 0.5);
    }
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
    const period = this.mood === 'chase' ? 0.62 : 0.9;
    if (this.heartT >= period) {
      this.heartT = 0;
      this.heartbeat();
    }
  }

  startHeartbeat() {
    this.heartOn = true;
    this.heartT = 0.5;
  }

  stopHeartbeat() {
    this.heartOn = false;
  }

  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(t);
    this.thump(t + 0.15);
  }

  thump(time) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(78, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.55, time + 0.02);
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

  burst({ duration, gain, type, freq, q, delay = 0 }) {
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
    g.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
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

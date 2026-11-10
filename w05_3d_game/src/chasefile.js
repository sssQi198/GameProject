/**
 * chasefile.js — 追逐段伴奏（第三十二轮）
 *
 * 第十九～三十一轮追逐里放的是 `src/chasemusic.js` 实时合成的四份伴奏
 * （A 脉搏 / B 锯弦 / C 锤击 / D 耳语，`?chase=1..4` 切换）。
 * 第三十二轮按要求**只保留一首真实录音**：`assets/audio/chase-noescape.mp3`，
 * 而且只跟「怪物离你多近」挂钩 —— 距离**只改音量**，不再改 BPM、滤波、音色。
 *
 * 所以这里只剩一条路径：
 *   fetch → decodeAudioData → 掐掉编码器塞在开头的静音 → 末尾等功率交叉淡化到开头
 *   → BufferSource(loop) 循环播放，中间挂一层「距离 → 音量」的 GainNode。
 *
 * 为什么非要在内存里做循环点：MP3 全长 45.024 s，开头有 31 ms 编码器延迟静音、
 * 末尾是直接切掉的声音（尾静音 0 ms），原样 `loop = true` 每圈都会「咔」一下。
 * 交叉淡化后剩 44.948 s，接缝跳变从 0.015 收到听不出来的程度。
 * **磁盘上的 mp3 一个字节没改。**
 *
 * 音量映射：−6 dB（怪物很远）→ +1 dB（贴着背）。线性于 dB 而不是线性于增益，
 * 这样「近了一点」听起来才是均匀地变响。基准取 unity 左右，依据是实测：
 * 这首在 unity 增益下的 RMS 和原先 C · 锤击（总线 1.5）只差 0.4 dB，
 * 见 `assets/audio/CREDITS.md` 第六节。
 */

/** 伴奏文件（相对文档的路径，子目录部署也成立：与 audio.js 里的采样路径同一套约定）。 */
export const CHASE_FILE_URL = './assets/audio/chase-noescape.mp3';

/** 交叉淡化时长（秒）。45 ms 够吃掉接缝，又短到听不出「叠了一下」。 */
export const CHASE_XFADE = 0.045;

/** 距离 → 音量的两端（dB，相对 unity）。 */
export const CHASE_GAIN_MIN_DB = -6;
export const CHASE_GAIN_MAX_DB = 1;

/** 起播 / 换场时的淡入淡出（秒）。 */
const FADE_IN = 0.6;
const FADE_OUT = 0.45;

/** 压力 0–1 → 线性增益（中间是 dB 线性）。 */
export function chaseGainFor(intensity) {
  const t = Math.max(0, Math.min(1, Number(intensity) || 0));
  const db = CHASE_GAIN_MIN_DB + (CHASE_GAIN_MAX_DB - CHASE_GAIN_MIN_DB) * t;
  return Math.pow(10, db / 20);
}

/**
 * 把解码后的原始 buffer 做成无缝循环 buffer。
 *
 * 做法：跳过开头的静音，取 [s, s+M) 这一段；把最后 xf 个采样用等功率曲线混进最前面
 * xf 个采样，然后把最后那 xf 个丢掉（长度 M − xf）。于是 buffer 末尾接 buffer 开头
 * 是连续的：out[0] ≈ 原曲第 s+M−xf 个采样，正好接着 out 的最后一个采样。
 *
 * @returns {{buffer: AudioBuffer, info: object}}
 */
export function buildLoopBuffer(ctx, raw, xfadeSec = CHASE_XFADE) {
  if (!raw || !raw.length || !raw.numberOfChannels) throw new Error('解码结果是空的');
  const sr = raw.sampleRate;
  const channels = raw.numberOfChannels;
  const first = raw.getChannelData(0);

  // 编码器延迟静音（实测 31 ms）。用 1e-4 当阈值，别把正常的小信号也吃进去。
  let s = 0;
  while (s < raw.length && Math.abs(first[s]) < 1e-4) s += 1;

  const body = raw.length - s;
  // 整条都是静音、或者短到连 4 倍淡化区都放不下：宁可报错让调用方降级，别拼出个坏 buffer。
  if (body < 40) throw new Error('素材里没有可播的声音');
  const xf = Math.min(Math.round(sr * xfadeSec), Math.floor(body / 4));
  const length = body - xf;
  const buffer = ctx.createBuffer(channels, length, sr);
  for (let c = 0; c < channels; c += 1) {
    const src = raw.getChannelData(c);
    const dst = buffer.getChannelData(c);
    for (let i = 0; i < xf; i += 1) {
      const a = (i / xf) * Math.PI * 0.5;
      dst[i] = src[s + i] * Math.sin(a) + src[s + length + i] * Math.cos(a);
    }
    for (let i = xf; i < length; i += 1) dst[i] = src[s + i];
  }
  return {
    buffer,
    info: {
      rawDuration: Math.round(raw.duration * 1000) / 1000,
      duration: Math.round(buffer.duration * 1000) / 1000,
      headTrimMs: Math.round((s / sr) * 1000),
      xfadeMs: Math.round(xfadeSec * 1000),
      sampleRate: sr,
      channels,
    },
  };
}

/**
 * 追逐伴奏播放器：一个文件、一个循环、一层音量。
 *
 * 用法（audio.js 里）：
 *   this.chaseFile = new ChaseFile(this.ctx, this.master);
 *   this.chaseFile.load();              // 预加载，不占用户手势
 *   this.chaseFile.setIntensity(t);     // 每帧按距离调用
 *   this.chaseFile.start(); / stop();
 */
export class ChaseFile {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(dest);
    this.source = null;
    this.buffer = null;
    this.loading = null;
    this.state = 'idle'; // idle | loading | ready | failed
    this.error = null;
    this.info = null;
    this.intensity = 0;
    this.wanted = false;
  }

  get playing() {
    return Boolean(this.source);
  }

  /** 预加载 + 解码。重复调用只会跑一次，失败也能再试。 */
  load(url = CHASE_FILE_URL) {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (this.loading) return this.loading;
    this.state = 'loading';
    const t0 = Date.now();
    this.loading = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => this.ctx.decodeAudioData(data))
      .then((raw) => {
        const built = buildLoopBuffer(this.ctx, raw);
        this.buffer = built.buffer;
        this.info = { ...built.info, url, loadMs: Date.now() - t0 };
        this.state = 'ready';
        if (this.wanted) this.startSource();
        return this.buffer;
      })
      .catch((error) => {
        this.state = 'failed';
        this.error = String((error && error.message) || error);
        this.loading = null;
        throw error;
      });
    return this.loading;
  }

  /** 起播。素材还没解好就先记下「要放」，解完自动起（追逐第一秒不会空着）。 */
  start() {
    this.wanted = true;
    if (this.buffer) {
      this.startSource();
      return true;
    }
    this.load().catch(() => {});
    return false;
  }

  startSource() {
    if (this.source || !this.buffer) return false;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.gain);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
    this.gain.gain.linearRampToValueAtTime(chaseGainFor(this.intensity), now + FADE_IN);
    src.start(now);
    this.source = src;
    return true;
  }

  stop(fade = FADE_OUT) {
    this.wanted = false;
    if (!this.source) return false;
    const src = this.source;
    this.source = null;
    const now = this.ctx.currentTime;
    const f = Math.max(0.05, Number(fade) || FADE_OUT);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
    this.gain.gain.linearRampToValueAtTime(0.0001, now + f);
    try {
      src.stop(now + f + 0.02);
    } catch {
      /* 已经停过就算了 */
    }
    return true;
  }

  /**
   * 距离 → 音量。0 = 怪物很远（−6 dB），1 = 贴着背（+1 dB）。
   * 没在放的时候只记下来，起播时按这个值淡入，不会先响一下再掉下去。
   */
  setIntensity(value) {
    this.intensity = Math.max(0, Math.min(1, Number(value) || 0));
    if (!this.source) return chaseGainFor(this.intensity);
    this.gain.gain.setTargetAtTime(chaseGainFor(this.intensity), this.ctx.currentTime, 0.5);
    return chaseGainFor(this.intensity);
  }

  /** 给 HUD / 探针看的状态快照。 */
  snapshot() {
    return {
      id: 'noescape',
      name: 'E · 无逃脱',
      state: this.state,
      playing: this.playing,
      intensity: Math.round(this.intensity * 100) / 100,
      gain: Math.round(chaseGainFor(this.intensity) * 1000) / 1000,
      duration: this.info ? this.info.duration : null,
      error: this.error,
    };
  }
}
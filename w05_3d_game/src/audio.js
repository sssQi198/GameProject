/**
 * 音效：日常音效全部用 Web Audio 实时合成，菜单/关卡底噪走一条循环曲。
 *
 * 第十四轮起，「吼叫」与「追逐特殊音乐」整套下线（素材、合成器、Dev 面板试听一起删），
 * 这两块等以后重做；现在追逐段只剩 drone / 心跳 / 脚步 / 金属摩擦这些程序化层。
 *
 * 第十八轮补了**采样层**：心跳、大口喘气、尖叫改成网上找的真人录音（见 SAMPLES），
 * 因为这三样合成器做不出来。合成的同类音效保留为兜底（文件缺失/解码失败时自动回退）。
 *
 * 第十九轮把追逐段的声音整体重做了：
 *   · 追逐里**不再有喘气声**（喘气只在**刚进安全屋那一刻**：低头那一段一串 `pant()`，
 *     第二十七轮把门口那一声 `breath()` 也删了），
 *     改成很响的心跳；
 *   · 原来那首循环曲在追逐时直接压到 0，让位给 src/chasemusic.js 写的**四份追逐伴奏**
 *     （全程序化合成，?chase=1..4 或 dev/chase-bgm.html 里 A/B 试听，选择存 localStorage）。
 * 浏览器会拦住自动播放，所以要等玩家点「开始」或「观看演示」再 unlock。
 */

import { ChaseMusic, CHASE_TRACKS } from './chasemusic.js';

const STORAGE_VOL = 'wf-volume';
const STORAGE_MUTE = 'wf-muted';
/** 追逐伴奏选的是哪一份（1–4，0 = 关）。 */
const STORAGE_CHASE = 'wf-chase';
/**
 * 从没挑过时放哪一份。3 = C · 锤击（`industrial`）：金属敲击 + 16 分踩踏 + 失真低鼓，
 * 走廊灯一路灭的那段最贴。改这里就能换默认，不用动 `CHASE_TRACKS` 的顺序——
 * 顺序是编号契约，`?chase=N`、`localStorage['wf-chase']`、探针都按它来。
 */
const DEFAULT_CHASE_TRACK = 3;

/**
 * 追逐伴奏总线在「追逐中」的目标增益（第二十二轮由 0.85 提到 1.5）。
 *
 * 为什么必须提：默认 BGM 实际出声是 `musicGain 0.36`（p3.js 每帧把 0.18 抬成 0.18×2.0）。
 * 在同一台机器、同一套 `master`（volume 0.4）上量 5–6 秒窗口，C · 锤击在强度 1、总线 0.85 时
 * 只比 BGM 高 **0.5–1.7 dB** RMS（多次量的抖动）—— 可 BGM 是连续铺底的 pad，锤击是
 * 「一记一记 + 大量空拍」，等电平听起来就是更轻，于是「差不多」在耳朵里变成「更小声」。
 * 提到 1.5 后同一窗口 **+5.5 dB** RMS、峰值约 BGM 的 2.5 倍（0.193 vs 0.075），敲击才压得住。
 *
 * 上限约束（这条别随手再往上推）：master 上量到心跳独占 RMS 0.0499 / 峰值 0.2708，
 * 伴奏在 1.5 时 RMS 0.0375 / 峰值 0.1928，心跳仍高 **+2.5 dB**、「很响的心跳」还在最前面。
 * master 上不挂限幅器，两者叠加量到的峰值 0.3394、削波样本 = 0，所以 1.5 是这套配比的上限。
 */
const CHASE_BUS_GAIN = 1.5;

/**
 * 第十八轮：网上找的写实素材（心跳 / 喘气 / 尖叫），和实时合成的音效并存。
 *
 * 这三件事——心跳、大口喘气、尖叫——合成器做不出来，硬做出来就是「电子鼓点」，
 * 所以这一轮改成下载现成录音走 decodeAudioData，播不出来时（文件缺失、解码失败、
 * 头less 环境）自动退回原来的合成音，逻辑不会断。
 *
 * 授权见 assets/audio/CREDITS.md，全部 CC0。
 */
const SAMPLES = {
  heartbeat: './assets/audio/chase-heartbeat.wav',
  breath: './assets/audio/chase-breath.wav',
  scream: './assets/audio/scream.ogg',
};

/**
 * 第二十五轮：`chase-breath.wav` 里其实是**三声独立的吸气**，不是一声。
 *
 * 用 `_tools/breath_swells.py` 量过（5 ms 包络、峰值 -14.2 dB）：
 *   #1 0.155–0.535 s（0.38 s）   #2 1.340–1.625 s（0.29 s）   #3 2.475–2.775 s（0.30 s）
 * 三声之间是 −28.5 dB 的连续气流底噪，也就是「一口气说完就接着下一口」录成了连读。
 *
 * 旧的 `breath()` 从 0.1–1.8 s 里随机取一点、**一路播到 3.08 s 文件尾**，于是
 * 一口就带 1–3 声；安全屋第 4 段又以 0.9 s 一拍连打三下（第 0 段还有一口），
 * 叠起来最多 **3 层同时、整轮平均 9.4 声**吸气 —— 听感就是「好几个人的喘气」。
 *
 * 所以这里按实测的起止切出单声：offset 比起点早 20 ms（留出 attack 斜坡，
 * 不吃掉起音），dur 取该声的实际长度。播完即止，一拍换一声。
 *
 * 第二十六轮补一句：单声切对了，但安全屋第 4 段当时是「0.9 秒一拍叫三次」，
 * 而一口只有 0.34–0.44 秒 —— 于是每两口气之间空着半秒，听着是一口一口被切开。
 * 连贯的喘气不是把间隔压短，而是**把呼气喘出来**：见 `pant()`。
 *
 * 第二十七轮定稿：喘气只出现在**刚进新场景**的低头那一段，而且**一拍 = 镜头低头一次**
 * （`END_BREATH_PERIOD` 1.05 秒）。`breath()` 因此不再被 game.js 调用 ——
 * 它保留成「单独一口气」的接口（探针和兜底还用），但那一声门口的气已经删掉。
 */
const BREATH_UNITS = [
  { offset: 0.135, dur: 0.44 },
  { offset: 1.320, dur: 0.34 },
  { offset: 2.455, dur: 0.35 },
];

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
    /** 解码好的采样：heartbeat / breath / scream。加载不到的键不会出现。 */
    this.samples = {};
    /** 正在循环的采样：键同上，值是 { src, gain }。 */
    this.loops = {};
    /**
     * 第二十五轮：当前正在响的喘气声部数组 `[{ src, gain, stopAt }]`。
     * 单口 `breath()` 只会有 1 个；`pant()` 是一串按节拍排开的（吸气+呼气），
     * 所以这里按数组存 —— 掐的时候要整串一起掐，只掐最后一个会留下尾巴。
     */
    this.breathVoices = [];
    /** 追逐伴奏总线（第十九轮）：只在这一条上出四份候选曲，方便整体推音量。 */
    this.chaseBus = null;
    /** 追逐伴奏实例（程序化合成，见 chasemusic.js）。 */
    this.chaseMusic = null;
    /** 选的是第几份（1–4，0 = 关）。 */
    this.chaseTrackIndex = clampTrack(readNumber(STORAGE_CHASE, DEFAULT_CHASE_TRACK));
    /**
     * 第二十一轮：默认 BGM 是否被**彻底停掉**（不是压到 0.0001）。
     * 追逐一开始就置 true 并把 <audio> 元素 pause 掉，之后到安全屋、结局都不再出声；
     * 置 true 期间 setMood 不会把它抬回来，只有 start() 里的 restoreMusic() 能解除。
     */
    this.musicOff = false;
    /** 开场淡入期间为 true：这段时间 BGM 的斜坡由 audio.js 独占，p3.js 不许每帧抢。 */
    this.musicHold = false;
    /**
     * BGM 音量的斜坡时间常数（秒），p3.js 每帧推进增益时读它。
     * 开场衔接要「渐起」就由 setMood 传一个大的（1.25），淡入结束再收回 0.08。
     */
    this.musicTau = 0.08;
    /** stopMusic() 延迟 pause 的定时器（淡出走完再停，不然会「咔」一下）。 */
    this.musicPauseTimer = 0;
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
      this.chaseBus = this.ctx.createGain();
      this.chaseBus.gain.value = 0.0001;
      this.chaseBus.connect(this.master);
      this.chaseMusic = new ChaseMusic(this.ctx, this.chaseBus);
      if (this.chaseTrackIndex > 0) this.chaseMusic.setTrack(this.chaseTrackIndex);
      this.noise = makeNoise(this.ctx);
      this.startDrone();
      this.startMusic();
    }
    this.loadSamples();
    this.applyVolume();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // 第二十一轮：musicOff 期间（追逐中 / 追逐之后）不许这里顺手把 BGM 又拉起来
    if (!this.musicOff && this.music?.paused) this.music.play().catch(() => {});
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

  /**
   * 换氛围。`musicTau` 只影响 BGM 这一条的斜坡（秒，默认 0.5）：
   * 开场衔接要的是「慢慢渐起」，所以那边会传一个更大的值。
   */
  setMood(mood, musicTau = 0.5) {
    this.mood = mood;
    // p3.js 每帧按这个时间常数把 BGM 推到「满值」（0.36），所以斜坡要一起交出去，
    // 否则这边排 1.25s 的渐起、那边 0.08s 就把它抬满了。
    this.musicTau = Math.max(0.05, musicTau);
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
      // 追逐时把原来那首循环曲压到 0：它已经陪玩家听了十分钟，
      // 而且这一轮追逐段换成了 chasemusic.js 的四份专门做的伴奏，两首叠着只会互相糊。
      // 第二十一轮：光压音量不够——追逐一开始就真把它 pause 掉（见 stopMusic），
      // 之后一路到安全屋、结局都保持 musicOff，所以这里不能再把它抬回 0.18。
      const musicTarget = mood === 'menu' ? 0.12 : this.musicOff || mood === 'chase' ? 0.0001 : 0.18;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(musicTarget, now, Math.max(0.05, musicTau));
    }
    // 第十九轮：追逐段不要再喘气（玩家自己也在跑，喘气声会和脚步糊成一片）。
    // 喘气只在安全屋用一次性的 pant()，这里顺手把可能残留的循环关掉。
    this.stopLoop('breath');
    if (mood === 'chase') {
      this.startChaseMusic();
      // 追逐一响，原来的循环曲就该退干净：1.0s 淡出后 pause，只留追逐伴奏这一条
      this.stopMusic(1.0);
    } else {
      this.stopChaseMusic();
    }
  }

  /**
   * 把默认 BGM 压到听不见但继续播（开场黑幕用：马上要抬回来，不值得动解码器）。
   * 不置 musicOff，所以 setMood 之后还能把它抬回去。
   */
  duckMusic(tau = 0.4) {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(0.0001, now, Math.max(0.05, tau));
  }

  /**
   * 彻底停掉默认 BGM（第二十一轮「追逐只放追逐音乐」）。
   *
   * 先淡到 0，淡出走完再把 <audio> 元素 pause 掉——只把 gain 设成 0.0001 的话，
   * 元素还在播、还在解码，`music.paused` 也是 false，后面任何一次 unlock() 都会
   * 把它当成「在播」而露出声音。元素本身不删、src 不换，restoreMusic() 能原地接回。
   */
  stopMusic(fade = 1.2) {
    this.musicOff = true;
    this.musicHold = false;
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(0.0001, now, Math.max(0.05, fade / 3));
    clearTimeout(this.musicPauseTimer);
    this.musicPauseTimer = setTimeout(() => {
      if (!this.music || !this.musicOff) return;
      this.music.pause();
    }, Math.round(fade * 1000) + 120);
  }

  /**
   * 让默认 BGM 重新可以出声（只有开新一局时调用）。
   * 这里只负责「解除封锁 + 从暂停处接回播放 + 压回静音起步」，
   * 真正淡起来交给紧随其后的 setMood('play', tau)，这样开场那一下是渐起的。
   */
  restoreMusic() {
    this.musicOff = false;
    this.musicHold = false;
    clearTimeout(this.musicPauseTimer);
    if (!this.ctx || !this.musicGain) return;
    if (this.music?.paused) this.music.play().catch(() => {});
    // 直接写值，别只排一个 setTargetAtTime：紧接着的 setMood 会 cancelScheduledValues(now)，
    // 把这条排在「此刻」的事件一起取消掉，于是 gain 从上一局残留的 0.18 起步——
    // 开场那个「渐起」就变成了从 0.18 抬到 0.36 的一小段，听不出是从无到有。
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.value = 0.0001;
  }

  /** 开场衔接期间把 BGM 的控制权收给 audio.js 自己（p3.js 每帧的增益推进要跳过）。 */
  holdMusic(on) {
    this.musicHold = Boolean(on);
  }

  /**
   * 改 p3.js 推进 BGM 增益时用的斜坡时间常数（秒）。
   * 开场渐起结束之后要收回 0.08，不然之后每次进关的调整都会拖成 1.25s。
   */
  setMusicTau(tau) {
    this.musicTau = Math.max(0.05, Number(tau) || 0.08);
    return this.musicTau;
  }

  // ── 追逐伴奏（第十九轮，四份候选） ────────────────────────────────────

  /**
   * 起步追伴奏。选的是 0（关）就什么都不做，方便 A/B 对比「有声 / 无声」。
   * 伴奏是纯合成的，不依赖采样的异步加载，所以一进 chase 立刻有声。
   */
  startChaseMusic() {
    if (!this.ctx || !this.chaseMusic || !this.chaseBus) return false;
    if (this.chaseTrackIndex <= 0) return false;
    this.chaseMusic.setIntensity(this.tension);
    this.chaseMusic.start();
    this.chaseBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.chaseBus.gain.setTargetAtTime(CHASE_BUS_GAIN, this.ctx.currentTime, 0.25);
    return true;
  }

  stopChaseMusic(fade = 0.45) {
    if (!this.ctx || !this.chaseBus) return false;
    const now = this.ctx.currentTime;
    this.chaseBus.gain.cancelScheduledValues(now);
    this.chaseBus.gain.setTargetAtTime(0.0001, now, Math.max(0.05, fade / 3));
    return Boolean(this.chaseMusic && this.chaseMusic.stop(fade));
  }

  /**
   * 换一份追逐伴奏（1–4，0 = 关）。正在追逐时立刻换，不用重开一局；
   * 选完记在 localStorage，下次进游戏还是这一份。
   */
  setChaseTrack(index) {
    const i = clampTrack(index);
    this.chaseTrackIndex = i;
    localStorageSafeSet(STORAGE_CHASE, String(i));
    if (!this.chaseMusic) return i;
    if (i === 0) {
      this.stopChaseMusic(0.3);
    } else {
      this.chaseMusic.setTrack(i);
      if (this.mood === 'chase') this.startChaseMusic();
    }
    return i;
  }

  /** 当前选的是哪一份（给 HUD / 控制台用）。 */
  chaseTrack() {
    return {
      index: this.chaseTrackIndex,
      name: this.chaseTrackIndex > 0 ? CHASE_TRACKS[this.chaseTrackIndex - 1].name : '关闭',
      all: CHASE_TRACKS.map((t) => t.name),
    };
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
    // 心跳跟着压力一起加：越近越响、越急（第十九轮把基线抬了一档，追逐里只剩它在撑气氛）
    this.setLoop('heartbeat', 1.35 + 0.45 * t, this.heartRate());
    if (this.chaseMusic) this.chaseMusic.setIntensity(t);
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
    // 没解锁（还没用户手势、或头less 环境没有 AudioContext）时直接跳过，
    // 否则 ctx 是 null，这里 createBiquadFilter 会把整段演出带崩。
    if (!this.ctx || !this.noise) return;
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

  // ── 采样层：心跳 / 喘气 / 尖叫 ────────────────────────────────────────
  // 全部素材都在 assets/audio/，电平已归一化到 -6dBFS，所以下面的 gain 是可以互相比较的。

  /**
   * 拉素材并解码。三个文件各自独立：任何一个 404 / 解码失败都只是少一个音色，
   * 对应的合成音兜底会顶上，不影响流程。
   * 注意 decodeAudioData 在部分老浏览器只接受回调式，这里显式包成 Promise。
   */
  loadSamples() {
    if (!this.ctx || typeof fetch !== 'function') return;
    for (const [key, url] of Object.entries(SAMPLES)) {
      if (this.samples[key]) continue;
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer();
        })
        .then((buf) => new Promise((resolve, reject) => {
          this.ctx.decodeAudioData(buf, resolve, reject);
        }))
        .then((audio) => {
          this.samples[key] = audio;
          // 素材比玩家晚到：心跳此刻如果正该响，立刻接上，不用等下一次状态切换
          if (key === 'heartbeat' && this.heartOn) {
            this.startLoop('heartbeat', this.mood === 'chase' ? 1.35 + 0.45 * this.tension : 0.75, this.heartRate());
          }
          // 喘气不再有循环，只在刚进安全屋那一刻用一次：低头那一段一串 pant()（第十九轮 / 第二十七轮）
        })
        .catch((err) => {
          console.warn('音效素材加载失败，改用合成音:', url, err && err.message ? err.message : err);
        });
    }
  }

  /**
   * 播一次采样（不循环）。返回 false 表示没有这个素材，调用方自己兜底；
   * 成功时返回声部 `{ src, gain, stopAt }`（调用方想中途掐掉就靠它）。
   *
   * `duration > 0` 时只播这么长（**素材时间**，内部按 rate 折成墙钟时间），
   * 末尾按 `release` 淡出——素材是连读的（三声吸气录在一个文件里），
   * 不掐的话一口就带好几声，掐断却不淡出会「咔」一下。
   *
   * `delay > 0` 时**晚这么多秒再起**（墙钟秒），内部只是把起点往后挪，
   * `stopAt` 也随之往后 —— `pant()` 就是靠它把几口排成一串。
   */
  playSample(key, { gain = 0.5, rate = 1, offset = 0, pan = null, attack = 0.03, duration = 0, release = 0.09, delay = 0 } = {}) {
    if (!this.ctx || !this.samples[key]) return false;
    const buffer = this.samples[key];
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(0.25, Math.min(4, rate));
    const t = this.ctx.currentTime + 0.01 + Math.max(0, delay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    src.connect(g);
    g.connect(this.out(pan));
    const start = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.05)));
    // 墙钟时长 = 素材时长 / rate，且不超过素材剩下的长度
    const wall = duration > 0
      ? Math.min(duration, buffer.duration - start) / src.playbackRate.value
      : 0;
    let stopAt = 0;
    if (wall > 0) {
      stopAt = t + wall;
      const rel = Math.min(release, wall * 0.5);
      if (rel > 0.005) {
        g.gain.setValueAtTime(Math.max(0.0002, gain), stopAt - rel);
        g.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      }
      src.start(t, start);
      src.stop(stopAt + 0.02);
    } else {
      src.start(t, start);
    }
    return { src, gain: g, stopAt };
  }

  /** 起一条循环（同一键已在跑就不再起第二条）。 */
  startLoop(key, gain = 0.3, rate = 1) {
    if (!this.ctx || !this.samples[key] || this.loops[key]) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = this.samples[key];
    src.loop = true;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(this.master);
    src.start();
    g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.35);
    this.loops[key] = { src, gain: g };
    return true;
  }

  stopLoop(key, fade = 0.35) {
    const loop = this.loops[key];
    if (!loop || !this.ctx) return false;
    delete this.loops[key];
    const now = this.ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(0.0001, now, fade / 3);
    try {
      loop.src.stop(now + fade);
    } catch (err) {
      // 已经停过就忽略
    }
    return true;
  }

  /** 调一条正在跑的循环的音量与速度（音高会跟着变，心跳/喘气正好需要这个）。 */
  setLoop(key, gain, rate) {
    const loop = this.loops[key];
    if (!loop || !this.ctx) return false;
    const now = this.ctx.currentTime;
    loop.gain.gain.setTargetAtTime(gain, now, 0.3);
    if (rate && Math.abs(loop.src.playbackRate.value - rate) > 0.01) {
      loop.src.playbackRate.setTargetAtTime(rate, now, 0.5);
    }
    return true;
  }

  /** 采样心跳的播放速度：揭示段慢（0.82），追逐段 1.0 起、压力满时 1.35（更急）。 */
  heartRate() {
    if (this.mood !== 'chase') return 0.82;
    return 1.0 + 0.35 * this.tension;
  }

  /**
   * 同学飞扑那一下的尖叫：真人男声 1.33 秒（CC0），降到 0.92 倍速更凶。
   * 素材还没到就用「下滑锯齿 + 带通噪声」凑一声，别让这一下静音。
   */
  scream(gain = 0.55) {
    if (this.playSample('scream', { gain, rate: 0.92, offset: 0.02 })) return true;
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(680, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.72);
    this.burst({ duration: 0.6, gain: gain * 0.5, type: 'bandpass', freq: 1800, q: 0.8 });
    return false;
  }

  update(dt) {
    // 伴奏不依赖 heartOn：输了/停了心跳之后，淡出还要继续走
    if (this.chaseMusic) this.chaseMusic.update();
    if (!this.heartOn || !this.ctx) return;
    // 采样心跳在跑的时候，合成 thump 不要再叠一层（否则听起来是两倍速、而且相位会打架）
    if (this.loops.heartbeat) return;
    this.heartT += dt;
    // 追赶时心跳跟着压力走：0.62 秒（恐慌边缘）压到 0.40 秒（夺路而逃）
    const period = this.mood === 'chase' ? 0.62 - 0.22 * this.tension : 0.9;
    if (this.heartT >= period) {
      this.heartT = 0;
      // 第十九轮：追逐里没有喘气了，心跳要自己撑住，兜底合成音也得够响
      this.heartbeat(this.mood === 'chase' ? 0.85 + 0.35 * this.tension : 0.55);
    }
  }

  startHeartbeat() {
    this.heartOn = true;
    this.heartT = 0.5;
    // 真录音的心跳：安全屋揭示段是 0.82 倍速的钝跳，追逐段起步 1.0、满压力 1.35
    this.startLoop('heartbeat', this.mood === 'chase' ? 1.35 + 0.45 * this.tension : 0.75, this.heartRate());
  }

  stopHeartbeat() {
    this.heartOn = false;
    this.tension = 0;
    this.tensionSent = -1;
    this.stopLoop('heartbeat');
  }

  heartbeat(gain = 0.55) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(t, gain);
    // 第二下（舒张期）轻一点，太对称会像鼓点而不是心跳
    this.thump(t + 0.15, gain * 0.78);
  }

  thump(time, gain = 0.55) {
    if (!this.ctx) return;
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
    // 真的一口气：素材是连录的三声吸气（见 BREATH_UNITS），每次只切一声，
    // 而且先把上一口掐掉——同一时刻只有一个人在喘。
    this.stopBreath(0.06);
    if (this.samples.breath) {
      const unit = BREATH_UNITS[(Math.random() * BREATH_UNITS.length) | 0];
      // 倍速 ±4%：三口气不完全是同一个音高，但不会抖到听出「变调」
      const rate = 0.96 + Math.random() * 0.08;
      const voice = this.playSample('breath', {
        gain: 0.7,
        rate,
        offset: unit.offset,
        attack: 0.05,
        duration: unit.dur,
        release: 0.08,
      });
      if (voice) {
        this.breathVoices = [voice];
        return;
      }
    }
    this.burst({ duration: 0.5, gain: 0.14, type: 'lowpass', freq: 500, q: 0.5 });
  }

  /**
   * 安全屋低头那一段的喘气：**一拍 = 镜头低头一次**。
   *
   * 用户原话：第二十七轮「使喘气声只在刚进新场景时出现，频率和主视角低头频率一致」；
   * 第二十八轮「三下随节奏的连贯清晰喘息」；
   * 第二十九轮「每一声中间都有一个断层，并不连贯，检查一下」。
   *
   * **第二十九轮的做法：素材整条播一遍，一个人声，一拍 = 素材里的一口气。**
   *
   * 前四轮（第二十六至二十八）是「一拍两个人声」：原速吸气 0.44 秒叠上 0.50 倍速呼气。
   * 第二十九轮用 10 ms 离线包络把它量穿了，断层是两个、都量出来了：
   *   · 拍内 0.34 秒：吸气素材自己已经衰到 -8 dB，呼气只有 `gain × 0.42`，
   *     一让一退，中间凹 **-10.2 dB**（突出度 10.4 / 11.2 dB）—— 一口喘气断成两截；
   *   · 拍缝 1.08 秒：呼气那 0.88 秒的尾巴最后 0.2 秒播到素材的静音床上了，
   *     下一拍吸气的增益又从 `0.0001` 指数爬起来，于是出现 **-25.5 dB** 的窄 V 形凹口。
   *   （第二十八轮的判据「0 % 帧低于 -30 dB」看不见 -10 dB 的凹，所以漏了；见 README §15。）
   *
   * 现在：素材本身就是「一口气喘三下」的实录 —— 10 ms 包络量的峰在 0.25 / 1.42 / 2.58 秒，
   * 间距 1.17 / 1.16 秒。整条按 `rate = 1.17 / period ≈ 1.114` 播一遍，三口气就正好落在
   * 1.05 秒的拍子上；中间的余气和房间声是录音自己的，**没有一处是拼出来的**，所以没有断层。
   * `delay` 把第一口气的峰对到 `LEAD`（0.29 秒，= 三次低头 0.317 / 1.367 / 2.417 减掉
   * `END_PANT_AT` 与 `playSample` 的 0.01 秒预排），实测三峰落在 0.30 / 1.35 / 2.39 秒。
   *
   * `rate` 由两个常数算，是因为素材是固定文件（`BREATH_UNITS` 也是照它量的）；
   * 换素材要重测峰位。`total` 只用来截尾（`duration = total × rate`），不再用来数拍。
   *
   * 底线（第二十九轮按出厂代码离线实测）：三峰 0.30 / 1.35 / 2.39 秒，三次低头在
   * 0.317 / 1.367 / 2.417 秒 —— 每口气的峰比低头早 17 / 17 / 27 毫秒，一帧以内。
   * 0.10–2.60 秒窗口里最深处 -23.7 dB、低于 -30 dB 的帧 0 %、最长静音 0 秒；
   * 全段唯一突出度 ≥ 4 dB 的凹是素材自己在 1.23 秒的 4.1 dB 涟漪（-15.4 dB），
   * 突出度 ≥ 6 dB 的凹 **一个都没有**（旧排法七个，其中两个 -26.6 dB）。峰值 0.124、
   * `peakSample` 0.347（旧 0.1227 / 0.336）。
   * 代价：第三口气的峰（2.39 秒）现在离门响（2.42 秒）只有 30 毫秒，180–260 Hz 上
   * 门响比喘气高出的余量从旧排法的 +3.6 dB 收到 **+2.2 dB** —— 还在，但薄了。
   */
  pant(total = 2.3, { gain = 0.7, period = 1.05 } = {}) {
    this.stopBreath(0.06);
    const sample = this.samples.breath;
    if (sample) {
      // 素材里前两口气的峰（秒），10 ms 包络实测；间距 1.17 秒 ⇒ 一拍一口气
      const PEAK_0 = 0.25;
      const PEAK_1 = 1.42;
      // 第一口气的峰要落在三次低头（0.317 秒）之前一点点，减去 cue 的 0.02 + 预排 0.01
      const LEAD = 0.29;
      const rate = (PEAK_1 - PEAK_0) / period;
      const delay = Math.max(0, LEAD - PEAK_0 / rate);
      const duration = Math.min(sample.duration, Math.max(0.8, total * rate));
      const voice = this.playSample('breath', {
        gain,
        rate,
        offset: 0,
        attack: 0.03,
        duration,
        release: 0.22,
        delay,
      });
      if (voice) {
        this.breathVoices = [voice];
        return true;
      }
    }
    // 没有素材：按同一个拍子排滤波噪声兜底，至少不是死寂
    for (let k = 0; k * period + 0.7 < total; k += 1) {
      this.burst({ duration: 0.7, gain: 0.13, type: 'lowpass', freq: 500, q: 0.5, delay: k * period });
    }
    return false;
  }

  /** 把正在响的喘气淡出掐掉（单口或整串，已经停了就什么也不做）。 */
  stopBreath(fade = 0.06) {
    const voices = this.breathVoices;
    this.breathVoices = [];
    if (!voices.length || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const voice of voices) {
      // 关键：`source.stop()` 以**最后一次调用**为准。playSample 已经按单声长度排好了停点，
      // 这里再 stop 一次只会把停点往后推（等于把这一口气又拉长成两声）。
      if (voice.stopAt > 0 && t + fade >= voice.stopAt) continue;
      try {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        voice.src.stop(t + fade + 0.02);
      } catch (err) {
        // 上下文已经关了：忽略
      }
    }
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
    // 被抓的那一下：伴奏立刻收掉，只留 stinger 和心跳的余音
    this.stopChaseMusic(0.5);
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

/** 追逐伴奏的编号：1–4 是四份候选，0 = 关。读不出来就回落到默认那份。 */
function clampTrack(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_CHASE_TRACK;
  return Math.max(0, Math.min(CHASE_TRACKS.length, n));
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

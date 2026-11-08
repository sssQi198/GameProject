/**
 * 追逐段的「音乐」—— 不是旋律，是一台会随距离加速的节拍/纹理机器。
 *
 * 为什么不用第二种做法（再放一段 mp3）：
 *   1. 整局已经有一首循环曲，追逐只把它从 0.18 抬到 0.23（+2dB），听觉习惯化救不回来；
 *   2. 预渲染文件没法「跟着怪物靠近而变」——而这正是压迫感的来源；
 *   3. 实时合成不占资源文件，退出追逐就拆掉，重开一局不会残留。
 *
 * 十二层（第十轮加厚。原来只有鼓 + 金属敲 + 不谐簇 + 颤弓 + 上升 + 轰鸣，
 * 听着「平淡」—— 因为每一拍只有两三下，且节拍 0.40 秒起步太慢）：
 *   M1  低鼓    150→200bpm 四四拍，每 4 拍加重
 *   M2  二次鼓  第 3 拍后半拍补一下（95Hz），凑成「咚-咚」
 *   M3  军鼓    2、4 拍 1.9kHz 噪声，压力过 1/4 才进
 *   M4  踩镲    每拍正反各一下，7kHz 高通 —— 八分音符的密度感全靠它
 *   M5  低音泵  正拍后半拍 55Hz 锯齿过 260Hz 低通，电音那种「推」
 *   M6  不谐簇  110 / 116.5 / 155.6Hz 三支 saw，低速通，随压力开亮、失谐加大
 *   M7  固定音型 偶数拍 16 分音符 220/233/185Hz 过 1.15kHz 带通
 *   M8  颤弓    1.4kHz 窄带噪声被 13→20Hz 的 LFO 切
 *   M9  上升音  每 8 拍噪声 400→3k + 锯齿 180→720（两条一起扫才「顶」得上去）
 *   M10 撞击    每 8 拍 3kHz 宽带 + 233Hz 锯齿，乐句的重音
 *   M11 短和弦  220 / 233 / 311Hz 掐一下（中频，小喇叭唯一放得出的那段）
 *   M12 轰鸣    32Hz 三角 + 90Hz 低通噪声，随压力变响
 *
 * 调度用 0.15 秒 lookahead（按 ctx.currentTime 排，不按帧），掉帧不会让节拍变调。
 * 全部合成：`new ChaseMusic(ctx, noiseBuffer, dest)`，start / update / stop。
 *
 * 第十一轮：多了一个「床」模式。上面这台节拍机器再调也是合成器味，所以
 * 音频真实到位时（audio.js 的 CHASE_BEDS 解码成功），改成放一段 CC0 成品曲：
 *   - 合成打击层全部让位（`scheduleBeat` 直接返回），否则和成品鼓组抢拍、听起来更乱；
 *   - 成品的亮度/音量交给 tension —— 越近，低通越开、音量越顶（`setTension`）；
 *   - 床没有的时候自动退回十二层节拍，行为与第十轮完全一致（probe 走的就是这条路）。
 */

/** 所有可调参数集中在这里 —— 听后要调只需要动这张表。 */
export const CHASE_MUSIC = {
  /** 一拍的长度：压力 0 → 0.36 秒（167bpm），压力 1 → 0.30 秒（200bpm）。 */
  beatSlow: 0.36,
  beatFast: 0.3,
  /** 一小节 4 拍，一个乐句 8 拍（上升音、撞击和呼吸都按乐句走）。 */
  barBeats: 4,
  phraseBeats: 8,
  /** 金属敲只在压力超过这个值之后才进：前半段不吵，后半段才开始刺。 */
  metalAt: 0.5,
  /** 军鼓的门槛更低 —— 它不刺，只是把 2、4 拍坐实。 */
  snareAt: 0.25,
  /** 固定音型要等压力过半才进，否则一开场就太满。 */
  ostinatoAt: 0.45,
  /** 上升音同样有门槛，否则每 3 秒扫一次会腻。 */
  riserAt: 0.4,
  /** 不谐簇的群奏滤波：越紧张越亮。第九轮整体抬高 200Hz —— 600–1400Hz 对笔电小喇叭基本是「闷」的。 */
  cutoffLow: 900,
  cutoffHigh: 2600,
  /** 失谐量（音分）：±8 → ±24。 */
  detuneLow: 8,
  detuneHigh: 24,
  /** 颤弓的 LFO 频率。 */
  tremLow: 13,
  tremHigh: 20,
  /** 楼体轰鸣的层音量。 */
  rumbleLow: 0.06,
  rumbleHigh: 0.14,
  /** 提前排程的时间窗（秒）。太小会在卡顿时爆音，太大会让「变快」慢半拍。 */
  lookahead: 0.15,
  /** 掉帧后不补拍的时间差阈值：超过就重新对齐，不一次补几十拍。 */
  resyncGap: 0.5,
};

/** 成品曲（床）模式的可调参数：亮度、音量、整体降速、低八度垫底。 */
export const CHASE_BED = {
  /** 低通截止：压力 0 → 900Hz（还隔着一道门），压力 1 → 6kHz（贴脸）。 */
  cutoffLow: 900,
  cutoffHigh: 6000,
  /** 音量：压力 0 → 0.42，压力 1 → 0.62。 */
  levelLow: 0.42,
  levelHigh: 0.62,
  /**
   * 播放速率：0.94 = 降约一个半音、整体慢 6%。
   * 「压迫」有一半来自「比自己心跳慢」和更暗的泛音，比调 EQ 直接得多；
   * 追逐只有 15–25 秒，慢这 6% 不会被察觉成「卡」。
   */
  rate: 0.94,
  /** 低八度垫底：同一段素材 0.47 倍速 + 150Hz 低通，把「墙在往下沉」补出来。 */
  subLevel: 0.42,
};

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** 一拍多长。game.js 的 tension 直接喂进来。 */
export function chaseBeatPeriod(tension) {
  return CHASE_MUSIC.beatSlow + (CHASE_MUSIC.beatFast - CHASE_MUSIC.beatSlow) * clamp01(tension);
}

/**
 * 第 beat 拍该发什么。纯函数，方便 probe 断言。
 * 返回的数值是这一层的音量，0 表示不发（riser / swell 是布尔）。
 */
export function chaseBeatPlan(beat, tension) {
  const t = clamp01(tension);
  const pos = ((beat % CHASE_MUSIC.barBeats) + CHASE_MUSIC.barBeats) % CHASE_MUSIC.barBeats;
  const inPhrase = beat % CHASE_MUSIC.phraseBeats === 0;
  const accent = inPhrase || beat % CHASE_MUSIC.phraseBeats === CHASE_MUSIC.barBeats;
  const loud = 0.85 + 0.3 * t;
  // 踩镲不设门槛：它是「密度」而不是「装饰」，一开场就得有八分音符的推力
  const hat = 0.055 * (0.7 + 0.45 * t);
  return {
    period: chaseBeatPeriod(t),
    /** 1、3 拍低鼓；每 8 拍的第一下（和每 4 拍）更重一点。 */
    drum: pos % 2 === 0 ? (accent ? 0.46 : 0.36) * loud : 0,
    /** 第 3 拍的后半拍补一记更高的鼓：四四拍变「咚-咚」，这是推力的来源。 */
    ghost: pos === 2 ? 0.3 * (0.6 + 0.5 * t) : 0,
    /** 2、4 拍金属敲，压力过半才进。 */
    metal: pos % 2 === 1 && t > CHASE_MUSIC.metalAt ? 0.15 * (0.7 + 0.6 * t) : 0,
    /** 2、4 拍军鼓：把反拍坐实，人耳对「反拍」的敏感度比低鼓高得多。 */
    snare: pos % 2 === 1 && t > CHASE_MUSIC.snareAt ? 0.15 * (0.7 + 0.5 * t) : 0,
    hat,
    /** 后半拍的踩镲弱一档，才有「正-反」而不是「哒哒哒哒」一样响。 */
    hatOff: hat * 0.72,
    /** 正拍的后半拍低音泵：55Hz 锯齿过 260Hz 低通，电音那种「推」。 */
    pump: pos % 2 === 0 ? 0.24 * (0.65 + 0.45 * t) : 0,
    /** 2、4 拍再压一下 220Hz 的短和弦（M11），小喇叭上「追」的那口气全靠它。 */
    stab: pos % 2 === 1 ? 0.1 * (0.8 + 0.4 * t) : 0,
    /** 偶数拍的 16 分固定音型，压力过半才进。 */
    ostinato: pos % 2 === 0 && t > CHASE_MUSIC.ostinatoAt ? 0.09 * (0.7 + 0.4 * t) : 0,
    /** 每 8 拍一记撞击，落在乐句头上。 */
    crash: inPhrase,
    /** 每 8 拍的上升音，压力过半才进。 */
    riser: inPhrase && t > CHASE_MUSIC.riserAt,
    /** 每 8 拍不谐簇呼吸一次（2 倍再收回来）。 */
    swell: inPhrase,
  };
}

export class ChaseMusic {
  /**
   * @param {AudioContext} ctx
   * @param {AudioBuffer} noise 1 秒白噪声（audio.js 里已经有一个）
   * @param {AudioNode} dest 一般是 AudioBus.master
   */
  constructor(ctx, noise, dest) {
    this.ctx = ctx;
    this.noise = noise;
    this.dest = dest;
    this.active = false;
    this.outGain = null;
    /** 常驻节点（不按拍走的那三层），stop() 时要一起停掉。 */
    this.voices = [];
    this.nextBeat = 0;
    this.beat = 0;
    this.tension = 0;
    this.tensionSent = -1;
    /** CC0 成品曲（AudioBuffer）。有它就只放它，不再排合成打击层。 */
    this.bed = null;
    this.bedSource = null;
    this.bedSub = null;
    this.bedFilter = null;
    this.bedGain = null;
  }

  /** 把「床」的两个声源（主体 + 低八度）一起停掉并清引用。 */
  stopBed() {
    const at = this.ctx.currentTime + 0.1;
    for (const src of [this.bedSource, this.bedSub]) {
      if (!src) continue;
      try {
        src.stop(at);
      } catch {
        /* 已经停过 */
      }
    }
    this.bedSource = null;
    this.bedSub = null;
    this.bedFilter = null;
    this.bedGain = null;
  }

  /**
   * 换「床」。null = 用合成节拍。
   * 已经开演时补进来也生效：正在下载的成品曲到位后不用重启追逐。
   */
  setBed(buffer) {
    const next = buffer || null;
    if (this.bed === next) return;
    this.bed = next;
    if (!this.active) return;
    this.stopBed();
    if (this.bed) {
      this.buildBed();
      this.setTension(this.tension + 0.01); // 骗过 2% 的节流，立刻按当前压力设一次参数
    }
  }

  start() {
    if (!this.ctx || this.active) return;
    const now = this.ctx.currentTime;
    this.outGain = this.gain(0.0001);
    this.outGain.connect(this.dest);
    if (this.bed) {
      // 成品曲自带鼓组和和声，再叠十二层只会糊成一团 —— 只留它
      this.buildBed();
    } else {
      this.buildCluster();
      this.buildTremolo();
      this.buildRumble();
    }
    // 0.3 秒淡入：不要「啪」一下出现，要像乐队从门口走进来
    this.outGain.gain.setValueAtTime(0.0001, now);
    this.outGain.gain.exponentialRampToValueAtTime(1, now + 0.3);
    this.active = true;
    this.beat = 0;
    // 第一拍紧跟调用它的那一帧：它和 stinger、「快跑！」是同一帧
    this.nextBeat = now + 0.02;
    this.tension = 0;
    this.tensionSent = -1;
  }

  stop() {
    if (!this.active) return;
    const now = this.ctx.currentTime;
    this.active = false;
    this.outGain.gain.cancelScheduledValues(now);
    this.outGain.gain.setValueAtTime(this.outGain.gain.value, now);
    this.outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    const at = now + 0.3;
    for (const node of this.voices) {
      try {
        node.stop(at);
      } catch {
        /* 已经停过 */
      }
    }
    this.voices = [];
    this.outGain = null;
    this.bedSource = null;
    this.bedSub = null;
    this.bedFilter = null;
    this.bedGain = null;
    this.nextBeat = 0;
  }

  /** 压力变化：只挪参数，不重排已经排好的拍子。 */
  setTension(value) {
    this.tension = clamp01(value);
    if (!this.active) return;
    if (Math.abs(this.tension - this.tensionSent) < 0.02) return;
    this.tensionSent = this.tension;
    const now = this.ctx.currentTime;
    const t = this.tension;
    if (this.bedSource) {
      // 成品曲只有一个旋钮：越近越亮（低通 900 → 6kHz）、越响（0.42 → 0.62）。
      // 用滤波而不是换曲，是为了「追近」这件事在听觉上是连续的。
      this.bedFilter.frequency.setTargetAtTime(CHASE_BED.cutoffLow + (CHASE_BED.cutoffHigh - CHASE_BED.cutoffLow) * t, now, 0.6);
      this.bedGain.gain.setTargetAtTime(CHASE_BED.levelLow + (CHASE_BED.levelHigh - CHASE_BED.levelLow) * t, now, 0.6);
      return;
    }
    this.clusterFilter.frequency.setTargetAtTime(
      CHASE_MUSIC.cutoffLow + (CHASE_MUSIC.cutoffHigh - CHASE_MUSIC.cutoffLow) * t,
      now,
      0.6,
    );
    const cents = CHASE_MUSIC.detuneLow + (CHASE_MUSIC.detuneHigh - CHASE_MUSIC.detuneLow) * t;
    // 三支按不同方向失谐才会「晃」，同向失谐只是跑调
    this.saws[0].detune.setTargetAtTime(-cents, now, 0.6);
    this.saws[1].detune.setTargetAtTime(cents * 0.7, now, 0.6);
    this.saws[2].detune.setTargetAtTime(-cents * 0.5, now, 0.6);
    this.lfo.frequency.setTargetAtTime(
      CHASE_MUSIC.tremLow + (CHASE_MUSIC.tremHigh - CHASE_MUSIC.tremLow) * t,
      now,
      0.6,
    );
    // 越近抖得越狠：0.07 → 0.11（颤弓的「吼起来」）
    if (this.tremDepth) this.tremDepth.gain.setTargetAtTime(0.07 + 0.04 * t, now, 0.6);
    this.rumbleLevel.gain.setTargetAtTime(
      CHASE_MUSIC.rumbleLow + (CHASE_MUSIC.rumbleHigh - CHASE_MUSIC.rumbleLow) * t,
      now,
      0.6,
    );
  }

  /** 每帧调一次：把 0.15 秒内该响的拍排进去。 */
  update() {
    if (!this.active) return;
    const now = this.ctx.currentTime;
    // 切标签页回来时 currentTime 可能跳很远，别一次补几百拍
    if (this.nextBeat < now - CHASE_MUSIC.resyncGap) this.nextBeat = now + 0.02;
    const horizon = now + CHASE_MUSIC.lookahead;
    let guard = 0;
    while (this.nextBeat < horizon) {
      this.scheduleBeat(this.nextBeat, this.beat);
      this.nextBeat += chaseBeatPeriod(this.tension);
      this.beat += 1;
      guard += 1;
      if (guard > 64) {
        // 兜底：真的排不动就丢弃这一段，下一帧从当前时间重新对齐
        this.nextBeat = horizon;
        break;
      }
    }
  }

  scheduleBeat(time, beat) {
    // 床模式：成品曲自己带鼓组，合成打击层全部让位（不然就是两套鼓抢拍）
    if (this.bedSource) return;
    const plan = chaseBeatPlan(beat, this.tension);
    const half = plan.period * 0.5;
    if (plan.drum > 0) this.drum(time, plan.drum);
    if (plan.ghost > 0) this.ghost(time + half, plan.ghost);
    if (plan.metal > 0) this.metal(time, beat, plan.metal);
    if (plan.snare > 0) this.snare(time, plan.snare);
    if (plan.hat > 0) {
      this.hat(time, plan.hat);
      this.hat(time + half, plan.hatOff);
    }
    if (plan.pump > 0) this.pump(time + half, plan.pump);
    if (plan.stab > 0) this.stab(time, beat, plan.stab);
    if (plan.ostinato > 0) {
      this.ostinato(time, beat, plan.ostinato);
      this.ostinato(time + plan.period * 0.25, beat, plan.ostinato * 0.7);
    }
    if (plan.crash) this.crash(time);
    if (plan.riser) this.riser(time, plan.period * CHASE_MUSIC.phraseBeats);
    if (plan.swell) this.swell(time, plan.period * CHASE_MUSIC.phraseBeats * 0.5);
  }

  // ── M1 节拍 ───────────────────────────────────────────────────────────────

  /** 低鼓：120 → 55Hz 的快速下滑。不用正弦「咚」以外的装饰，节拍要干净。 */
  drum(time, gain) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(55, time + 0.12);
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    o.connect(g);
    g.connect(this.outGain);
    o.start(time);
    o.stop(time + 0.18);
  }

  /**
   * 二次低鼓：95 → 58Hz，比主鼓高五度、比主鼓短。
   * 光有一、三拍的「咚」是 4/4 进行曲；加这一下才是「追」。
   */
  ghost(time, gain) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, time);
    o.frequency.exponentialRampToValueAtTime(58, time + 0.09);
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    o.connect(g);
    g.connect(this.outGain);
    o.start(time);
    o.stop(time + 0.14);
  }

  /** 军鼓：1.9kHz 带通噪声，0.1 秒。反拍上最容易被听见的一层。 */
  snare(time, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 1.4;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    // 每一下换噪声起点（确定性，不用 Math.random）
    src.start(time, ((time * 0.61) % 1) * (this.noise.duration - 0.1));
    src.stop(time + 0.12);
  }

  /** 踩镲：7kHz 高通噪声，0.03 秒。八分音符的密度就靠它，缺了整段会「散」。 */
  hat(time, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    f.Q.value = 0.7;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    src.start(time, ((time * 0.83) % 1) * (this.noise.duration - 0.05));
    src.stop(time + 0.04);
  }

  /** 低音泵：55Hz 锯齿过 260Hz 低通，0.18 秒。正拍后半拍的那个「推」。 */
  pump(time, gain) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.9;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.outGain);
    o.start(time);
    o.stop(time + 0.2);
  }

  /**
   * M7 固定音型：174.6 / 185 / 146.8Hz 的十六分音符拨奏，过 1.15kHz 带通。
   * 音高随小节轮换（不是随机），既有「在跑」的颗粒感又不会糊成噪音。
   * 刻意避开短和弦的 220 / 233 / 311Hz：同一频段两个声部会互相盖住，还分不清是哪个层。
   */
  ostinato(time, beat, gain) {
    const ladder = [174.6, 185, 174.6, 146.8];
    const freq = ladder[Math.floor(Math.abs(beat) / CHASE_MUSIC.barBeats) % ladder.length];
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1150;
    f.Q.value = 3;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
    o.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    o.start(time);
    o.stop(time + 0.13);
  }

  /** M10 撞击：3kHz 宽带噪声 0.9 秒 + 一条 174.6Hz 锯齿，乐句头上的重音。 */
  crash(time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3000;
    f.Q.value = 0.6;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    src.start(time);
    src.stop(time + 0.95);

    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 174.6;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    const og = this.gain(0.0001);
    og.gain.setValueAtTime(0.0001, time);
    og.gain.exponentialRampToValueAtTime(0.12, time + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    o.connect(lp);
    lp.connect(og);
    og.connect(this.outGain);
    o.start(time);
    o.stop(time + 0.55);
  }

  /** 金属敲：2.4kHz 窄带噪声，很短 —— 这是中频那根「刺」。 */
  metal(time, beat, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    // Q 9 → 3.5：原来那条太窄，小喇叭上等于没有；放宽到 700Hz 带宽才听得见「叮」
    f.Q.value = 3.5;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    // 每一拍换一个噪声起点（确定性，不用 Math.random，方便复现和 probe）
    const offset = ((beat * 0.37) % 1) * (this.noise.duration - 0.1);
    src.start(time, offset);
    src.stop(time + 0.06);
  }

  /**
   * M6 短和弦：220 / 233 / 311Hz 三支锯齿同时掐一下（0.1 秒）。
   *
   * 为什么加这一层：追逐段的能量原来全在 55–160Hz（低鼓、轰鸣）和 2.4kHz 的刺上，
   * 中间 200–1k 是空的 —— 而这正是笔电/手机小喇叭唯一放得出来的频段。
   * 有了它，「换了音乐」才是一耳朵的事。
   */
  stab(time, beat, gain) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    lp.Q.value = 0.7;
    const env = this.gain(0.0001);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(gain, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    lp.connect(env);
    env.connect(this.outGain);
    // 每两拍换一次三和弦的排列，避免同一个音反复磨
    const root = beat % 8 === 3 ? 233.1 : 220;
    for (const freq of [root, root * 1.06, root * 1.414]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const og = this.gain(0.3);
      o.connect(og);
      og.connect(lp);
      o.start(time);
      o.stop(time + 0.12);
    }
  }

  /** 上升音：噪声从 400 扫到 3k，叠一条 180→720Hz 的锯齿，正好在一句话的末尾收掉。 */
  riser(time, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, time);
    f.frequency.exponentialRampToValueAtTime(3000, time + dur);
    f.Q.value = 2.2;
    const g = this.gain(0.0001);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.26, time + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    src.start(time);
    src.stop(time + dur + 0.02);

    // 锯齿扫频：噪声只有「嘶」，加了音高才有「拉上去」的方向感
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, time);
    o.frequency.exponentialRampToValueAtTime(720, time + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, time);
    lp.frequency.exponentialRampToValueAtTime(2400, time + dur);
    lp.Q.value = 1.2;
    const og = this.gain(0.0001);
    og.gain.setValueAtTime(0.0001, time);
    og.gain.exponentialRampToValueAtTime(0.1, time + dur * 0.85);
    og.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(lp);
    lp.connect(og);
    og.connect(this.outGain);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  // ── 常驻层 ────────────────────────────────────────────────────────────────

  /**
   * 第十一轮的「床」：一段 CC0 成品曲，整段循环。
   *
   * 只串一个低通和一个音量 —— 成品曲的鼓、和声、混响都是别人混好的，
   * 再动它只是画蛇添足。tension 通过 setTension() 推这两个参数。
   */
  buildBed() {
    if (!this.bed || !this.outGain) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.bed;
    src.loop = true;
    // 降速 = 降调：不改别人的编曲，只让整首往下沉一点
    src.playbackRate.value = CHASE_BED.rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CHASE_BED.cutoffLow;
    filter.Q.value = 0.6;
    const level = this.gain(CHASE_BED.levelLow);
    src.connect(filter);
    filter.connect(level);
    level.connect(this.outGain);
    src.start(now, 0);
    this.bedSource = src;
    this.bedFilter = filter;
    this.bedGain = level;
    this.voices.push(src);

    // 低八度垫底：同一段素材慢一倍的复制，只留 150Hz 以下。
    // 真素材的低频比任何合成 sub 都更「有形」，而且和主体天然同调。
    if (CHASE_BED.subLevel > 0) {
      const sub = this.ctx.createBufferSource();
      sub.buffer = this.bed;
      sub.loop = true;
      sub.playbackRate.value = CHASE_BED.rate * 0.5;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150;
      lp.Q.value = 0.7;
      const subLevel = this.gain(CHASE_BED.subLevel);
      sub.connect(lp);
      lp.connect(subLevel);
      subLevel.connect(this.outGain);
      sub.start(now, 0);
      this.bedSub = sub;
      this.voices.push(sub);
    }
  }

  /** M2 不谐簇：小儿度叠三全音，低速通。越紧张开得越亮、失谐越大。 */
  buildCluster() {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CHASE_MUSIC.cutoffLow;
    filter.Q.value = 0.9;
    const level = this.gain(0.1);
    const swell = this.gain(1);
    filter.connect(level);
    level.connect(swell);
    swell.connect(this.outGain);
    this.clusterFilter = filter;
    this.clusterLevel = level;
    this.clusterSwell = swell;
    this.saws = [110, 116.5, 155.6].map((freq) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      const g = this.gain(0.33);
      o.connect(g);
      g.connect(filter);
      o.start();
      this.voices.push(o);
      return o;
    });
  }

  /** M3 颤弓：1.4kHz 窄带噪声，增益被 LFO 切成颤动。 */
  buildTremolo() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 6;
    const g = this.gain(0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.outGain);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = CHASE_MUSIC.tremLow;
    // 深度从 0.045 加到 0.07：颤弓要「抖」，不是「在响」
    const depth = this.gain(0.07);
    lfo.connect(depth);
    depth.connect(g.gain);
    src.start();
    lfo.start();
    this.lfo = lfo;
    this.tremDepth = depth;
    this.voices.push(src, lfo);
  }

  /** M5 楼体轰鸣：32Hz 三角 + 90Hz 低通噪声，底座「整栋楼在响」。 */
  buildRumble() {
    const level = this.gain(CHASE_MUSIC.rumbleLow);
    level.connect(this.outGain);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 90;
    filter.Q.value = 0.7;
    filter.connect(level);

    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 32;
    const og = this.gain(0.5);
    o.connect(og);
    og.connect(filter);
    o.start();

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const ng = this.gain(0.25);
    src.connect(ng);
    ng.connect(filter);
    src.start();

    this.rumbleLevel = level;
    this.voices.push(o, src);
  }

  /** 收一次呼吸：不谐簇的增益 1 → 2 → 1。 */
  swell(time, dur) {
    const g = this.clusterSwell.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(1, time);
    g.linearRampToValueAtTime(2, time + dur * 0.55);
    g.linearRampToValueAtTime(1, time + dur);
  }

  /** 一个可回收的增益节点。 */
  gain(value) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }
}
"""把 roar() 的音频图按 RBJ biquad 传递函数算一遍，看能量落在哪些频段。

探针只能证明「节点接对了」，证明不了「小喇叭能放出来」。
这里用和 Web Audio 同一套公式（RBJ Audio EQ Cookbook）算出每条路径的
|H(f)|²，再把锯齿的谐波、噪声的功率谱分别加权求和，比较第九轮（下滑低吼）
与第十轮（2.4 秒长啸）的频段分布。

模型约定（只做横向比较，不是绝对电平）：
- 锯齿：谐波幅度 1/n，n = 1..N；一个谐波算一个离散谱线，功率 = (1/n)²|H|²。
- 噪声：单位方差白噪声，单边谱密度 2/FS 每 Hz，功率 = Σ|H|²·df·2/FS。
- 忽略包络细节与 12Hz 调幅（调幅只搬 ±12Hz 边带，不改变结论）。
- WaveShaper 的 tanh 饱和不建模：它会把能量往上推、并生成新的谐波，
  所以这里算出来的中高频占比是**保守值**（真实只会更多）。
- 笔记本/手机小喇叭大约从 250~300Hz 往上才有效率，所以关键指标是
  **300-3000Hz 的能量占比**，而不是总能量。
"""

import numpy as np

FS = 48000.0
df = 2.0  # 噪声积分步长


def w0(f0):
    return 2 * np.pi * f0 / FS


def bandpass(f0, q):
    """constant 0dB peak gain 的带通。"""
    a = np.sin(w0(f0)) / (2 * q)
    c = np.cos(w0(f0))
    return np.array([a, 0.0, -a]), np.array([1 + a, -2 * c, 1 - a])


def lowpass(f0, q):
    a = np.sin(w0(f0)) / (2 * q)
    c = np.cos(w0(f0))
    return np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]), np.array([1 + a, -2 * c, 1 - a])


def H(b, den, f):
    w = 2 * np.pi * f / FS
    z1 = np.exp(-1j * w)
    z2 = np.exp(-2j * w)
    return (b[0] + b[1] * z1 + b[2] * z2) / (den[0] + den[1] * z1 + den[2] * z2)


def saw(f0, paths, nh=None):
    """f0 的锯齿，过若干并联路径（b, den, gain）后逐谐波求功率。"""
    if nh is None:
        nh = max(1, int(FS / 2 / f0))
    n = np.arange(1, nh + 1)
    freqs = f0 * n
    h = np.zeros_like(freqs, dtype=complex)
    for b, den, g in paths:
        h += g * H(b, den, freqs)
    return freqs, ((1.0 / n) * np.abs(h)) ** 2


def noise(paths):
    freqs = np.arange(0.0, FS / 2, df)
    h = np.zeros_like(freqs, dtype=complex)
    for b, den, g in paths:
        h += g * H(b, den, freqs)
    return freqs, np.abs(h) ** 2 * df * (2.0 / FS)


def mix_sources(weighted):
    """把不同时段的功率按持续时间加权（同一根频轴相加）。"""
    freqs = np.arange(0.0, FS / 2 + df, df)
    total = np.zeros_like(freqs)
    for dur, (f, p) in weighted:
        grid = np.zeros_like(freqs)
        idx = np.clip(np.round(f / df).astype(int), 0, len(freqs) - 1)
        np.add.at(grid, idx, p)
        total += dur * grid
    return freqs, total


EDGES = [(0, 300), (300, 800), (800, 3000), (3000, FS / 2)]


def report(label, sources):
    bins = {k: 0.0 for k in EDGES}
    for freqs, power in sources:
        for lo, hi in EDGES:
            m = (freqs >= lo) & (freqs < hi)
            bins[(lo, hi)] += float(power[m].sum())
    tot = sum(bins.values())
    print(f"{label}")
    for lo, hi in EDGES:
        name = f"<{hi:.0f}Hz" if lo == 0 else (f">{lo:.0f}Hz" if hi >= FS / 2 else f"{lo:.0f}-{hi:.0f}Hz")
        print(f"    {name:>12}  {100 * bins[(lo, hi)] / tot:5.1f}%")
    listenable = bins[(300, 800)] + bins[(800, 3000)]
    print(f"    小喇叭有效频段（300-3000Hz）: {100 * listenable / tot:5.1f}%")
    print(f"    总能量（相对）: {tot:.4g}")
    return tot, listenable / tot


# ── 第八轮（旧）：68 -> 46Hz 一条 saw，420 Q5 / 1150 Q7 两个窄带通 ──────────────
old_throat = saw(68, [(*bandpass(420, 5), 1.0), (*bandpass(1150, 7), 1.0)])
old_throat = (old_throat[0], old_throat[1] * (0.62 * 1.0) ** 2)
old_rasp = noise([(*bandpass(750, 1.1), 0.34 * 0.62)])
old_hiss = noise([(*bandpass(2000, 2.2), 0.14 * 0.62)])
print("== 第八轮 ==")
old_tot, old_share = report("  68Hz 喉音 + 窄带共振峰 + 噪声", [old_throat, old_rasp, old_hiss])

# ── 第九轮：96/190 两条 saw，520 Q4 / 1300 Q6 / 2400 低通并联 ──────────────────
LP_G, F1_G, F2_G = 0.35, 0.62, 0.78
ninth_paths = [(*bandpass(520, 4), F1_G), (*bandpass(1300, 6), F2_G), (*lowpass(2400, 0.8), LP_G)]
env9 = 0.95
throat = saw(96, ninth_paths)
throat = (throat[0], throat[1] * (0.55 * env9) ** 2)
growl = saw(190, ninth_paths)
growl = (growl[0], growl[1] * (0.34 * env9) ** 2)
rasp9 = noise([(*bandpass(750, 1.1), 0.5 * env9)])
hiss9 = noise([(*bandpass(2000, 2.2), 0.28 * env9)])
print()
print("== 第九轮 ==")
ninth_tot, ninth_share = report(
    "  96/190Hz 双嗓子 + 宽一点儿的共振峰 + 2.4k 直通", [throat, growl, rasp9, hiss9])

# ── 第十轮：2.4 秒长啸 ────────────────────────────────────────────────────────
# 音高轮廓 150 → 168 → 330 → 352 → 360 → 300 → 196，按持续时间加权建模：
# 起音 150Hz 占 0.26s，主体 352Hz 占 1.9s。
# 三条并联路径的权重沿用 audio.js 里的 formant(500->780, Q6, 0.9) /
# formant(1500->1150, Q8, 0.7) / formant(2500->2600, Q9, 0.35) /
# body lowpass 2400 Q0.7 ×0.4，再加上一条胸口 95Hz 过 240Hz 低通 ×0.3。
# 整条链再乘 mix 0.55 → rough 0.7 → env 0.98。
CHAIN = 0.55 * 0.7 * 0.98
scream_paths = [
    (*bandpass(780, 6), 0.9),     # F1：/a/ 的第一共振峰
    (*bandpass(1150, 8), 0.7),    # F2
    (*bandpass(2600, 9), 0.35),   # F3：靠它出「刺」
    (*lowpass(2400, 0.7), 0.4),   # 肉声直通：整串谐波
]
voice_hi = saw(352, scream_paths)      # 主体
voice_lo = saw(150, scream_paths)      # 「呃」的起音
chest = saw(95, [(*lowpass(240, 0.8), 0.3)])
# 第二条嗓子只差 12 音分，谐波数会差一根，直接按「功率 ×2」近似
voice = mix_sources([
    (1.9, (voice_hi[0], voice_hi[1] * 2 * CHAIN)),
    (0.26, (voice_lo[0], voice_lo[1] * CHAIN)),
])
chest_w = mix_sources([(2.16, (chest[0], chest[1] * CHAIN))])
rasp10 = noise([(*bandpass(750, 1.1), 0.45 * 0.7 * 0.98)])
hiss10 = noise([(*bandpass(1900, 2.0), 0.3 * 0.7 * 0.98)])
print()
print("== 第十轮 ==")
tenth_tot, tenth_share = report(
    "  150→352Hz 长啸 + 三个 /a/ 共振峰 + 950 胸腔 + 喉噪/嘶声",
    [voice, chest_w, rasp10, hiss10])

print()
print(f"第九轮 -> 第十轮 总能量：{ninth_tot:.4g} -> {tenth_tot:.4g}"
      f"（{10 * np.log10(tenth_tot / ninth_tot):+.1f} dB，不含 tanh 饱和）")
print(f"小喇叭有效频段占比：{100 * ninth_share:.1f}% -> {100 * tenth_share:.1f}%")
print()
print("注：第九轮的音高是**下滑**的（96→62、190→132），听感是「一声低吼」；")
print("    第十轮 0.26 秒就冲到 330Hz 并撑到 1.45 秒，才有「喊」的形状。")
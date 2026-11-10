# -*- coding: utf-8 -*-
"""
拆开「吼声里的嘶嘶声」，分出三笔账：
  A. 素材自带的底噪（只有 wav 能本地解码，mp3 无解码器，只能跳过）
  B. screams 饱和曲线把底噪抬了多少 dB
  C. 引擎里那一层「气流」白噪本身有多少 dBFS
输出全是数字，便于直接抄进结论。用法：
  python _tools/roar_hiss.py assets/audio/roar-sandworm.wav
"""
import sys
import wave
import numpy as np

FS_ASSUMED = 44100


def read_wav(path):
    with wave.open(path, 'rb') as w:
        n, ch, sw, fr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit('只处理 16bit wav')
    x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, fr


def frame_rms(x, fs, hop=0.01):
    n = max(1, int(hop * fs))
    m = len(x) // n
    f = x[: m * n].reshape(m, n)
    return np.sqrt((f ** 2).mean(axis=1)), n / fs


def band_energy(x, fs, lo, hi):
    """单边功率谱在某频段的能量占比（用 Welch 式的分帧平均）。"""
    n = 1 << int(np.ceil(np.log2(max(256, len(x)))))
    n = min(n, 65536)
    seg = x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))
    w = np.hanning(len(seg))
    sp = np.abs(np.fft.rfft(seg * w)) ** 2
    f = np.fft.rfftfreq(len(seg), 1 / fs)
    tot = sp.sum() + 1e-20
    return sp[(f >= lo) & (f < hi)].sum() / tot


def analyse_wav(path):
    x, fs = read_wav(path)
    rms, hop = frame_rms(x, fs)
    loud = np.percentile(rms, 95)
    # 「只在底噪」的帧：比响段低 25 dB 以上。安静帧太少就退回最低 5%
    quiet_mask = rms < loud * 10 ** (-25 / 20)
    if quiet_mask.sum() < 5:
        quiet_mask = rms <= np.percentile(rms, 5)
    noise = float(np.sqrt((rms[quiet_mask] ** 2).mean()))
    snr = 20 * np.log10(loud / max(noise, 1e-9))

    # 底噪帧拼起来看频谱：噪声在哪一段
    idx = np.where(quiet_mask)[0]
    nper = int(hop * fs)
    chunks = [x[i * nper:(i + 1) * nper] for i in idx[:200]]
    noise_sig = np.concatenate(chunks) if chunks else x[:nper]
    hf = band_energy(noise_sig, fs, 2000, 20000)
    hf_loud = band_energy(x, fs, 2000, 20000)
    print(f'file            {path}')
    print(f'duration        {len(x)/fs:.2f} s   {fs} Hz  mono')
    print(f'peak rms (p95)  {20*np.log10(max(loud,1e-9)):.1f} dBFS')
    print(f'noise floor     {20*np.log10(max(noise,1e-9)):.1f} dBFS   ({quiet_mask.sum()} 帧)')
    print(f'SNR             {snr:.1f} dB')
    print(f'底噪里 >2kHz 能量占比  {hf*100:.4f} %')
    print(f'全段  >2kHz 能量占比   {hf_loud*100:.4f} %')

    # 分段能量表：看这段素材到底有没有中高频（有没有本底嘶声）
    nfft = 1 << 16
    seg = x[:nfft] if len(x) >= nfft else np.pad(x, (0, nfft - len(x)))
    sp = np.abs(np.fft.rfft(seg * np.hanning(nfft))) ** 2
    f = np.fft.rfftfreq(nfft, 1 / fs)
    tot = sp.sum() + 1e-20
    print('  频段能量占比：')
    for lo, hi in [(0, 100), (100, 300), (300, 800), (800, 1500),
                   (1500, 3000), (3000, 6000), (6000, 12000), (12000, 22050)]:
        share = sp[(f >= lo) & (f < hi)].sum() / tot * 100
        if hi > fs / 2:
            continue
        print(f'    {lo:>6}-{hi:<6} {share:8.4f} %')
    print(f'  频谱质心 {np.sum(f * sp) / tot:.0f} Hz')
    return snr, hf


def soft_knee(x, k):
    """第十二轮后的曲线：|x|<=0.35 线性，0.35–0.9 之间平滑过渡到满饱和。"""
    a = abs(x)
    q = (a - 0.35) / 0.55
    w = 0.0 if q <= 0 else 1.0 if q >= 1 else q * q * (3 - 2 * q)
    sat = np.tanh(k * x) / np.tanh(k)
    return x if w == 0 else x * (1 - w) + sat * w


def sat_penalty():
    """饱和曲线对「小信号/大信号」的相对增益：旧版 vs 新版。"""
    print()
    print('B. 饱和曲线对底噪的相对提升（有效 SNR 损失）')
    sig = 0.7   # 素材峰值附近的典型幅度
    noise = 0.003  # -50 dBFS 的底噪
    for k in (1.8, 2.2, 3.4, 4.6):
        f = lambda v: np.tanh(k * v) / np.tanh(k)
        old = 20 * np.log10((f(noise) / noise) / (f(sig) / sig))
        new = 20 * np.log10((soft_knee(noise, k) / noise) / (soft_knee(sig, k) / sig))
        print(f'  k={k:>4}  旧 tanh(kx)/tanh(k) 底噪相对抬 {old:+5.1f} dB'
              f'   → 新软膝 {new:+5.1f} dB   （差 {old - new:+.1f} dB）')


def biquad_bandpass(f0, q, fs, n=1 << 16):
    w0 = 2 * np.pi * f0 / fs
    alpha = np.sin(w0) / (2 * q)
    b = np.array([alpha, 0.0, -alpha])
    a = np.array([1 + alpha, -2 * np.cos(w0), 1 - alpha])
    b, a = b / a[0], a / a[0]
    rng = np.random.default_rng(0x2f6e2b1)
    x = rng.uniform(-1, 1, n)  # 幅度与引擎里的噪声缓冲同量级
    y = np.zeros(n)
    for i in range(2, n):
        y[i] = b[0] * x[i] + b[1] * x[i - 1] + b[2] * x[i - 2] - a[1] * y[i - 1] - a[2] * y[i - 2]
    return y[1000:]


# AM 增益 = 0.62 + 0.38·sin，按 RMS 折算是 0.676（再 -3.4 dB），不是 0.62
AM_RMS = (0.62 ** 2 + 0.38 ** 2 / 2) ** 0.5


def breath_layer():
    print()
    print('C. 引擎「气流层」白噪在总线上（进入主包络之前）的电平：修正前 vs 修正后')
    for fs in (44100, 48000):
        old = biquad_bandpass(1600, 0.6, fs)
        new = biquad_bandpass(1400, 0.9, fs)
        o = 20 * np.log10(np.sqrt((old ** 2).mean()))
        nw = 20 * np.log10(np.sqrt((new ** 2).mean()))
        print(f'  {fs}Hz  白噪原始 {o:.1f} dBFS   1400/Q0.9 收窄后 {nw:.1f} dBFS  （{nw - o:+.1f} dB）')
        for gain_old, gain_new, name in ((0.16, 0.09, '野兽'), (0.26, 0.13, '深渊'), (0.10, 0.05, '童声')):
            a = o + 20 * np.log10(gain_old)
            b = nw + 20 * np.log10(gain_new) + 20 * np.log10(AM_RMS)
            print(f'    {name}档  旧 {a:6.1f} dBFS → 新 {b:6.1f} dBFS  （{b - a:+.1f} dB，且随 33/19Hz 抖动）')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyse_wav(p)
    sat_penalty()
    breath_layer()
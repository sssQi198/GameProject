# -*- coding: utf-8 -*-
"""核对：沙虫那条 wav 到底像不像「嗓子」，以及它的 RMS 包络形状。"""
import sys
import wave
import numpy as np


def main(path):
    with wave.open(path, 'rb') as w:
        n, ch, sw, fr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    x = x.reshape(-1, ch).mean(axis=1)

    # 过零率：近似基频的两倍（一个周期两次过零）
    zc = np.sum(np.abs(np.diff(np.signbit(x).astype(np.int8)))) / (len(x) / fr)
    print(f'zero-crossings  {zc:.1f} /s  → 基频约 {zc/2:.1f} Hz')

    bucket = int(0.5 * fr)
    m = len(x) // bucket
    env = np.sqrt((x[: m * bucket].reshape(m, bucket) ** 2).mean(axis=1))
    print('RMS per 0.5 s (dBFS):')
    print('  ' + '  '.join(f'{20*np.log10(max(v,1e-9)):.0f}' for v in env))

    # 单个周期的波形像不像人声：看峰值因数（正弦 1.41，锯齿 1.73，噪声 >3）
    loud = x[np.argmax(np.abs(x)) - 2000: np.argmax(np.abs(x)) + 2000]
    crest = np.max(np.abs(loud)) / np.sqrt((loud ** 2).mean())
    print(f'crest factor    {crest:.2f}   （纯正弦 1.41，复杂嗓音 2–3，噪声 >3）')

    # 低频主导度：一阶差分能量比。差分近似高通，比值越小说明越「只有低频」
    d = np.diff(x)
    print(f'diff/signal rms ratio {np.sqrt((d**2).mean())/np.sqrt((x**2).mean()):.4f}')


if __name__ == '__main__':
    main(sys.argv[1])
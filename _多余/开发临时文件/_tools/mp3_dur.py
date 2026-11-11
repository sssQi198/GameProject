#!/usr/bin/env python3
"""量 MP3 时长（本机没有 ffmpeg / soundfile，MediaPlayer 又需要全权限）。

优先读帧头里的 Xing/Info 头（VBR 文件由编码器写好总帧数，这是唯一权威值，
不用逐帧猜码率）；没有就退化成逐帧走，并且要求「下一帧头也合法」才认，
否则说明撞上了音频数据里的假同步字节。

用法：
    python mp3_dur.py a.mp3 [b.mp3 ...]
输出：
    文件名  时长秒  帧数  采样率  声道  CBR/VBR  依据
"""

import struct
import sys

# 位率表（kbps），索引 = 帧头 bitrate_index（1..14），0 和 15 非法
BITRATES = {
    (1, 1): [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    (1, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 1): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    (2, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    (2, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
RATES = {1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000]}


def skip_id3(data):
    """跳过 ID3v2 标签（可能在文件头）。返回音频起点。"""
    if len(data) > 10 and data[:3] == b'ID3':
        size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) \
             | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        return 10 + size
    return 0


def parse_header(hdr):
    """帧头 → dict；非法返回 None。"""
    if ((hdr >> 21) & 0x7FF) != 0x7FF:
        return None
    ver = (hdr >> 19) & 0x3
    layer_bits = (hdr >> 17) & 0x3
    if ver == 1 or layer_bits == 0:
        return None
    group = 1 if ver == 3 else 2
    # 帧头里 3 = Layer I、2 = Layer II、1 = Layer III；换成「层号」再查表
    layer = 4 - layer_bits
    sri = (hdr >> 10) & 0x3
    bri = (hdr >> 12) & 0xF
    if sri == 3 or bri in (0, 15):
        return None
    pad = (hdr >> 9) & 0x1
    br = BITRATES[(group, layer)][bri] * 1000
    sr = RATES[group][sri]
    if layer == 1:      # Layer I
        flen = (12 * br // sr + pad) * 4
        spf = 384
    elif layer == 2:    # Layer II
        flen = 144 * br // sr + pad
        spf = 1152
    elif group == 1:    # Layer III, MPEG-1
        flen = 144 * br // sr + pad
        spf = 1152
    else:               # Layer III, MPEG-2 / 2.5
        flen = 72 * br // sr + pad
        spf = 576
    return {
        'group': group, 'layer': layer, 'rate': sr, 'bitrate': br,
        'len': flen, 'spf': spf,
        'channels': 1 if ((hdr >> 6) & 0x3) == 3 else 2,
    }


def find_first(data, start):
    """从 start 起找第一个「自身合法 + 下一帧也合法」的帧头。"""
    pos = start
    while pos + 8 <= len(data):
        h = parse_header(struct.unpack('>I', data[pos:pos + 4])[0])
        if h is None:
            pos += 1
            continue
        nxt = pos + h['len']
        if nxt + 4 <= len(data):
            h2 = parse_header(struct.unpack('>I', data[nxt:nxt + 4])[0])
            if h2 is not None and h2['rate'] == h['rate']:
                return pos, h
        pos += 1
    return -1, None


def xing_frames(data, pos, first):
    """在第一个物理帧里找 Xing/Info 头里的总帧数。"""
    end = min(len(data), pos + first['len'])
    for tag in (b'Xing', b'Info'):
        k = data.find(tag, pos, end)
        if k < 0:
            continue
        if k + 8 > len(data):
            continue
        flags = struct.unpack('>I', data[k + 4:k + 8])[0]
        if not flags & 0x1:
            continue
        if k + 12 > len(data):
            continue
        return struct.unpack('>I', data[k + 8:k + 12])[0]
    return None


def measure(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    pos, first = find_first(data, skip_id3(data))
    if first is None:
        return None
    n = xing_frames(data, pos, first)
    if n:
        return {
            'seconds': n * first['spf'] / first['rate'],
            'frames': n, 'rate': first['rate'],
            'channels': first['channels'], 'vbr': True, 'src': 'Xing',
        }
    # 没有 Xing：逐帧走，只认同版本的帧头
    total = 0
    frames = 0
    brs = set()
    while pos + 4 <= len(data):
        h = parse_header(struct.unpack('>I', data[pos:pos + 4])[0])
        if h is None or h['rate'] != first['rate'] or h['layer'] != first['layer']:
            break
        brs.add(h['bitrate'])
        total += h['spf']
        frames += 1
        pos += h['len']
    if frames == 0:
        return None
    return {
        'seconds': total / first['rate'], 'frames': frames,
        'rate': first['rate'], 'channels': first['channels'],
        'vbr': len(brs) > 1, 'src': '逐帧',
    }


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    for path in argv:
        info = measure(path)
        if info is None:
            print('{:<30} ?    （没找到合法 MPEG 帧）'.format(path))
            continue
        print('{:<30} {:6.2f} s  {:5d} 帧  {:>5} Hz  {} ch  {}  [{}]'.format(
            path, info['seconds'], info['frames'], info['rate'],
            info['channels'], 'VBR' if info['vbr'] else 'CBR', info['src']))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
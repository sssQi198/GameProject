"""第五关裂缝周围的装饰（docs/model_prompts.md「## 第五关 · 裂缝周围的装饰」）。

第二版：在第一版「三层翻边 + 触手 + 肉芽」的基础上做真实感强化：
  · fbm 表面起伏：翻边上表面不再是一条光滑放样带，而是有鼓包、坑洼的肉；
  · 撕裂缺口：外缘有几处深 V 形撕口，不是一条整齐的边；
  · 湿润高光 + 环境闭塞：唇脊有一线亮湿光，唇下/触手根/肉芽根被压暗；
  · 内唇下挖一道「凹槽」，撕裂处该有的暗袋；
  · 内切面（洞缘厚度）带纵向肌纤维条纹；
  · 触手环纹 + 扭转 + 钝圆的尖端，不再是一根根尖刺；
  · 肉芽成簇、大小不一，更像组织增生；
  · 悬挂的血滴和细丝：血从唇边往下滴，撕裂处挂着组织细丝；
  · 颜色仍只在暗红到近黑（G/B ≤ 0.05），体积靠明暗与结构而不是加色相。

规格仍照提示词：L 形、中间空、开口约 0.9 m、天花板臂 2.6 m 收尖、
单网格 < 8000 三角、1 = 1 m、Y-up。

用法：
  Blender 里 exec(open(r'...\\tools\\build_crack_decor.py').read())
  或 blender -b --factory-startup -P tools/build_crack_decor.py
输出 assets/models/crack_decor_v01.glb（glTF 2.0 Binary，Y-up，无 Draco/Meshopt/KTX2）。
"""
import json
import math
import os
import pathlib
import random
import struct
import tempfile

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT_GLB = (r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game'
           r'\assets\models\crack_decor_v01.glb')
TEX_PNG = (r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game'
           r'\assets\textures\crack_detail.png')
COLL_NAME = 'CrackDecor'
ROOT_NAME = 'CrackDecor'
MESH_NAME = 'CrackDecor_Mesh'

# ---- 世界锚点（和 anomalies.js 的 addCrackAndTentacles 一致） ----
CEIL_FACE_Y = 3.16
WALL_FACE_Z = -5.99
CRACK_Y = CEIL_FACE_Y - 0.07      # 3.09
CRACK_Z = WALL_FACE_Z + 0.07      # -5.92
AP = 0.34

RIM_W = 0.300
WALL_STEPS = 18
CEIL_STEPS = 16
CEIL_LEN = 2.60
EYE_Y = 2.42

WIDTH_SEED = 20251111
TENT_SEED = 20251112
NOISE_SEED = 20251113

# ---- 调色（sRGB） ----
C_INNER = '#050001'       # 洞缘切面
C_LIP = '#7a0d12'         # 唇
C_CREST = '#7a0d12'       # 唇脊（湿高光区）
C_CREST_BACK = '#56080d'
C_UNDERCUT = '#120103'    # 唇下暗袋
C_INNER_BAND = '#1a0203'
C_INNER_BAND2 = '#2a0406'
C_STEP1 = '#52070c'
C_MID = '#4a060b'
C_MID2 = '#56080d'
C_STEP2 = '#6a0b10'
C_OUT = '#6a0b10'
C_OUT2 = '#56080d'
C_OUT_ROOT = '#2a0305'
C_UNDER = '#080102'
C_TENT_ROOT = '#1e0204'
C_TENT_TIP = '#8a0e14'
C_BUD_ROOT = '#2a0306'
C_BUD_TIP = '#6a0a10'
C_DRIP = '#1e0204'
C_DRIP_TIP = '#8a0e14'
C_STRAND = '#4a060b'
C_STRAND_TIP = '#7a0d12'

# 横截面：s = 翻边宽度方向比例（0=洞缘，1=外缘），v = 朝房间鼓出多少（米）。
# 上表面 14 点：内唇 → 唇脊 → 唇下凹槽 → 内圈 → 台坎 → 中圈 → 台坎 → 外圈。
PROFILE_TOP = (
    (0.000, 0.030),
    (0.025, 0.046),
    (0.055, 0.062),   # 唇脊
    (0.080, 0.054),
    (0.100, 0.042),   # 唇下暗袋（凹下去）
    (0.150, 0.048),
    (0.270, 0.044),
    (0.292, 0.053),   # 台坎
    (0.305, 0.050),
    (0.575, 0.042),
    (0.592, 0.050),   # 台坎
    (0.605, 0.046),
    (0.850, 0.037),
    (1.000, 0.028),
)
PROFILE_UNDER = (
    (1.000, -0.058),
    (0.550, -0.046),
    (0.200, -0.040),
    (0.000, 0.006),
)
PROFILE = PROFILE_TOP + PROFILE_UNDER

PROFILE_HEX = (
    C_INNER, C_LIP, C_CREST, C_CREST_BACK, C_UNDERCUT,
    C_INNER_BAND, C_INNER_BAND2, C_STEP1, C_MID, C_MID2,
    C_STEP2, C_OUT, C_OUT2, C_OUT_ROOT,
    C_UNDER, C_UNDER, C_UNDER, C_INNER,
)
# 烘焙明暗：唇脊湿高光最亮，唇下暗袋/底面/外缘压暗
PROFILE_FORM = (0.72, 1.00, 1.16, 0.86, 0.34,
                0.55, 0.60, 0.76, 0.70, 0.66,
                0.80, 0.76, 0.66, 0.45,
                0.35, 0.30, 0.26, 0.30)


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _rgb(hexstr):
    h = hexstr.lstrip('#')
    return (_srgb_to_linear(int(h[0:2], 16)),
            _srgb_to_linear(int(h[2:4], 16)),
            _srgb_to_linear(int(h[4:6], 16)))


def _srgb_to_linear_f(v):
    v = clamp(v, 0.0, 1.0)
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _detail_array(size=512):
    """自己画一张 tileable 的暗红血肉细节贴图（灰度，sRGB 值 0..1）。

    它不做色相，只做「明暗细节」：斑驳、瘀血斑块、纵向肌纤维、血点。
    因为整件模型靠顶点色定色相，贴图作为乘法细节叠上去，均值保持 ~0.9，
    只压暗、不洗白。正弦叠加让它在 U/V 重复采样时无缝。
    """
    import numpy as np
    rng = np.random.default_rng(20251113)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)

    img = np.full((size, size), 0.90, dtype=np.float32)
    for _ in range(18):
        fx = int(rng.integers(1, 7))
        fy = int(rng.integers(1, 7))
        ph = float(rng.uniform(0.0, 6.2831853))
        amp = float(rng.uniform(0.02, 0.055))
        img += amp * np.sin((2.0 * math.pi * (fx * xx + fy * yy)) / size + ph)

    # 软斑块（瘀血）
    for _ in range(9):
        cx = float(rng.uniform(0, size))
        cy = float(rng.uniform(0, size))
        sig = float(rng.uniform(22, 60))
        depth = float(rng.uniform(0.25, 0.5))
        dx = np.abs(xx - cx)
        dx = np.minimum(dx, size - dx)
        dy = np.abs(yy - cy)
        dy = np.minimum(dy, size - dy)
        d = dx * dx + dy * dy
        img *= 1.0 - depth * np.exp(-d / (2.0 * sig * sig))

    # 纵向肌纤维（暗细线）
    fibers = np.ones_like(img)
    for _ in range(14):
        x0 = float(rng.uniform(0, size))
        amp = float(rng.uniform(4, 30))
        freq = float(rng.uniform(0.5, 3.0))
        ph = float(rng.uniform(0.0, 6.2831853))
        w = 1 + int(rng.integers(0, 3))
        for y in range(size):
            x = int(round(x0 + amp * math.sin(2.0 * math.pi * freq * y / size + ph))) % size
            for dx_ in range(-w, w + 1):
                xi = (x + dx_) % size
                fibers[y, xi] = min(fibers[y, xi], 0.62)
    img *= fibers

    # 血点
    for _ in range(120):
        cx = float(rng.uniform(0, size))
        cy = float(rng.uniform(0, size))
        r = float(rng.uniform(1, 3))
        depth = float(rng.uniform(0.3, 0.55))
        dx = np.abs(xx - cx)
        dx = np.minimum(dx, size - dx)
        dy = np.abs(yy - cy)
        dy = np.minimum(dy, size - dy)
        m = (dx * dx + dy * dy) <= r * r
        img[m] *= (1.0 - depth)

    return np.clip(img, 0.0, 1.0)


def load_detail_image():
    """把 detail 数组写成 PNG 并载回文件版 Image（导出器直接嵌 PNG 字节）。"""
    arr = _detail_array()
    import numpy as np
    lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    size = arr.shape[0]
    img = bpy.data.images.get('crack_detail')
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new('crack_detail', size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    flat = np.empty(size * size * 4, dtype=np.float32)
    r = lin.ravel()
    flat[0::4] = r
    flat[1::4] = r
    flat[2::4] = r
    flat[3::4] = 1.0
    img.pixels = flat.tolist()
    out = TEX_PNG
    try:
        with open(out, 'wb'):
            pass
    except OSError:
        out = os.path.join(tempfile.gettempdir(), 'crack_detail.png')
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    loaded = bpy.data.images.load(out)
    loaded.name = 'crack_detail'
    return loaded


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else (hi if v > hi else v)


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else 0.0
    return t * t * (3.0 - 2.0 * t)


class LCG:
    """和 anomalies.js 的 seeded() 完全相同的 32 位 LCG。"""

    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def __call__(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


class Noise:
    """确定性 value noise + fbm，给肉面加起伏。"""

    def __init__(self, seed):
        self.seed = seed & 0x7fffffff

    def _hash(self, ix, iy):
        n = ix * 374761393 + iy * 668265263 + self.seed
        n = (n ^ (n >> 13)) * 1274126177
        n = (n ^ (n >> 16)) & 0x7fffffff
        return n / 0x7fffffff

    def value(self, x, y):
        ix = math.floor(x)
        iy = math.floor(y)
        fx = x - ix
        fy = y - iy
        fx = fx * fx * (3.0 - 2.0 * fx)
        fy = fy * fy * (3.0 - 2.0 * fy)
        a = self._hash(ix, iy)
        b = self._hash(ix + 1, iy)
        c = self._hash(ix, iy + 1)
        d = self._hash(ix + 1, iy + 1)
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    def fbm(self, x, y, oct=2):
        v = 0.0
        amp = 0.5
        f = 1.0
        for _ in range(oct):
            v += amp * self.value(x * f, y * f)
            f *= 2.13
            amp *= 0.5
        return v


def crack_edges():
    """复刻 anomalies.js 的前墙臂 / 天花板臂，再按 AP 缩成开口轮廓。"""
    R = LCG(20251102)
    wall_y1 = CEIL_FACE_Y - 0.03
    wl, wr = [], []
    for i in range(WALL_STEPS + 1):
        t = i / WALL_STEPS
        y = wall_y1 * t
        cx = math.sin(t * 5.1 + 1.1) * 0.14 + (R() - 0.5) * 0.08
        taper = math.sin(math.pow(t, 0.75) * math.pi) * 0.65 + 0.35
        half_w = (0.52 + 0.84 * taper) * (1.0 + (R() - 0.5) * 0.4)
        wl.append((cx - half_w, y))
        wr.append((cx + half_w, y))

    ceil_z0 = WALL_FACE_Z + 0.05
    ceil_z1 = ceil_z0 + CEIL_LEN
    cl, cr = [], []
    for i in range(CEIL_STEPS + 1):
        t = i / CEIL_STEPS
        z = ceil_z0 + (ceil_z1 - ceil_z0) * t
        cx = math.sin(t * 4.3 + 0.4) * 0.13 + (R() - 0.5) * 0.08
        taper = math.sin(math.pow(t, 0.8) * math.pi) * 0.55 + 0.45
        end_taper = min(1.0, (1.0 - t) / 0.16)
        half_w = (0.44 + 0.68 * taper) * end_taper * (1.0 + (R() - 0.5) * 0.4)
        cl.append((cx - half_w, z))
        cr.append((cx + half_w, z))

    def ap(edge, other):
        out = []
        for k, (x, _w) in enumerate(edge):
            mid = (edge[k][0] + other[k][0]) * 0.5
            out.append((mid + (x - mid) * AP, edge[k][1]))
        return out

    return ap(wl, wr), ap(wr, wl), ap(cl, cr), ap(cr, cl)


def opening_width_at(edges_l, edges_r, world_y):
    ys = [p[1] for p in edges_l]
    for i in range(len(ys) - 1):
        if ys[i] <= world_y <= ys[i + 1]:
            t = (world_y - ys[i]) / (ys[i + 1] - ys[i])
            xl = edges_l[i][0] + (edges_l[i + 1][0] - edges_l[i][0]) * t
            xr = edges_r[i][0] + (edges_r[i + 1][0] - edges_r[i][0]) * t
            return xr - xl
    return 0.0


def tangent_at(path, k):
    if k == 0:
        d = path[1] - path[0]
    elif k == len(path) - 1:
        d = path[-1] - path[-2]
    else:
        d = path[k + 1] - path[k - 1]
    if d.length < 1e-9:
        return Vector((0.0, 0.0, 1.0))
    return d.normalized()


def width_profile(count, base, tip_taper=True, seed=WIDTH_SEED):
    """沿路径的翻边宽度：低频鼓包 + 高频锯齿 + 几处更宽的肉瓣 + 深 V 撕口。"""
    R = random.Random(seed)
    raw = [0.90 + 0.24 * (R.random() + R.random() + R.random()) / 3.0
           for _ in range(count)]
    phase = R.random() * math.tau
    lobes = [(R.randrange(1, max(2, count - 1)), 0.20 + R.random() * 0.35)
             for _ in range(3)]
    notches = [(R.randrange(1, max(2, count - 1)), 0.30 + R.random() * 0.25, 0.8 + R.random() * 0.5)
               for _ in range(2)]
    ws = []
    for i in range(count):
        a = raw[max(0, i - 1)]
        b = raw[i]
        c = raw[min(count - 1, i + 1)]
        t = i / (count - 1)
        low = 0.84 + 0.30 * (0.5 + 0.5 * math.sin(t * math.tau * 2.3 + phase)) ** 1.4
        lobe = 1.0 + sum(amp * math.exp(-((i - c0) / 1.7) ** 2)
                         for c0, amp in lobes)
        notch = 1.0 - sum(depth * math.exp(-((i - c0) / sig) ** 2)
                          for c0, depth, sig in notches)
        ws.append(max(0.05, min(0.46, base * (a + b + c) / 3.0 * low * lobe * notch)))
    if tip_taper:
        for i in range(count):
            t = i / (count - 1)
            ws[i] *= 1.0 - 0.90 * smoothstep(0.82, 1.0, t)
    return ws


def add_frame_side(bm, col_layer, uvseed, path, side, widths, rng, noise, arm):
    """沿一条开口边放样出一侧的翻边壳（闭合管：两端各一个盖）。

    arm = 'wall' 时给外半圈叠垂直血渍、给内切面叠纵向肌纤维条纹。
    UV：U = 沿路径弧长 ×3（重复采样细节贴图），V = 横截面 s ×2。
    """
    n = len(path)
    rings = []
    base_cols = [_rgb(h) for h in PROFILE_HEX]
    x_axis = Vector((1.0, 0.0, 0.0))
    phase = rng.random() * 9.0
    arclen = [0.0]
    for i in range(1, n):
        arclen.append(arclen[-1] + (path[i] - path[i - 1]).length)
    total = arclen[-1] if arclen[-1] > 1e-6 else 1.0

    for k, p in enumerate(path):
        t = tangent_at(path, k)
        nrm = x_axis.cross(t)
        if nrm.length < 1e-6:
            nrm = Vector((0.0, 0.0, -1.0))
        nrm.normalize()
        w = widths[k]
        swell = 0.86 + 0.28 * rng.random()
        tone = 0.92 + 0.16 * rng.random()
        mottle = 0.86 + 0.28 * noise.fbm(k * 0.5 + phase, 3.1)
        ring = []
        for j, (s, v) in enumerate(PROFILE):
            vv = v
            uu = side * s * w
            if v > 0.0 and s > 0.0:
                vv = v * swell
                # 表面起伏：越靠外越明显，内唇钉死在 AP 开口上
                ramp = smoothstep(0.0, 0.06, s)
                n1 = noise.fbm(s * 9.0 + side * 1.7, k * 0.5 + phase)
                n2 = noise.fbm(s * 9.0 + 11.3, k * 0.5 + phase + 4.0)
                vv += (n1 - 0.5) * 0.016 * ramp
                uu += (n2 - 0.5) * 0.010 * ramp
            pos = p + Vector((uu, 0.0, 0.0)) + nrm * vv
            vert = bm.verts.new(pos)
            vert[uvseed] = ((arclen[k] / total) * 3.0, s * 2.0, 0.0, 1.0)

            col = base_cols[j]
            k_form = PROFILE_FORM[j]
            streak = 1.0
            if arm == 'wall' and s > 0.5:
                streak = 1.0 - 0.10 * math.sin(k * 0.9 + side * 2.0) \
                    * max(0.0, math.sin(math.pi * min(1.0, (s - 0.5) / 0.5)))
            striation = 1.0
            if s < 0.02:
                striation = 0.55 + 0.45 * math.sin(k * 2.6 + side)
            vert[col_layer] = (
                clamp(col[0] * k_form * tone * mottle * streak * striation),
                clamp(col[1] * k_form * tone * mottle * streak * striation),
                clamp(col[2] * k_form * tone * mottle * streak * striation),
                1.0,
            )
            ring.append(vert)
        rings.append(ring)

    m = len(PROFILE)
    for k in range(n - 1):
        a, b = rings[k], rings[k + 1]
        for j in range(m):
            j2 = (j + 1) % m
            f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            f.smooth = j not in (len(PROFILE_TOP) - 1, m - 1)
    for ring in (rings[0], rings[-1]):
        f = bm.faces.new(tuple(reversed(ring)))
        f.smooth = False


def add_tentacle(bm, col_layer, uvseed, root, direction, length, radius, room_n, rng,
                 side=0.0, sides=6, root_hex=C_TENT_ROOT, tip_hex=C_TENT_TIP,
                 annulate=True, bulb=False):
    """一根触手 / 细丝：根暗尖亮，渐细带弯，可选环纹、扭转、钝圆尖端。

    side=±1 时强制 x 分量始终朝外，免得随机弯把触手甩回洞心。
    """
    segs = 5
    pts = [root]
    d = direction.normalized()
    for i in range(1, segs + 1):
        d = (d + Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)) * 0.36).normalized()
        if side > 0:
            d.x = max(d.x, 0.12)
        elif side < 0:
            d.x = min(d.x, -0.12)
        d.normalize()
        p = pts[-1] + d * (length / segs)
        p.y = min(p.y, 0.050)
        p.z = min(max(p.z, -3.080), 0.050)
        p.x = min(max(p.x, -9.4), 9.4)
        pts.append(p)

    root_col = _rgb(root_hex)
    tip_col = _rgb(tip_hex)
    twist = (rng.random() - 0.5) * 2.4
    rings = []
    for i, p in enumerate(pts):
        t = i / segs
        if i == 0:
            tan = pts[1] - pts[0]
        elif i == segs:
            tan = pts[-1] - pts[-2]
        else:
            tan = pts[i + 1] - pts[i - 1]
        tan.normalize()
        ref = room_n if abs(tan.dot(room_n)) < 0.94 else Vector((0.0, 0.0, 1.0))
        side_v = tan.cross(ref)
        if side_v.length < 1e-6:
            side_v = tan.cross(Vector((1.0, 0.0, 0.0)))
        side_v.normalize()
        up_v = side_v.cross(tan).normalized()
        r = radius * (1.0 - 0.58 * t ** 1.2)
        if bulb:
            r += radius * 0.16 * math.exp(-((t - 1.0) / 0.14) ** 2)
        if annulate:
            r *= 1.0 + 0.08 * math.sin(t * math.tau * 2.0)
        mix = t ** 0.8
        base = (root_col[0] + (tip_col[0] - root_col[0]) * mix,
                root_col[1] + (tip_col[1] - root_col[1]) * mix,
                root_col[2] + (tip_col[2] - root_col[2]) * mix)
        if annulate:
            ring_shade = 0.80 + 0.20 * math.sin(t * math.tau * 2.0)
            base = (base[0] * ring_shade, base[1] * ring_shade, base[2] * ring_shade)
        ring = []
        for j in range(sides):
            ang = 2.0 * math.pi * j / sides + twist * t
            radial = side_v * math.cos(ang) + up_v * math.sin(ang)
            vert = bm.verts.new(p + radial * r)
            vert[uvseed] = (t * 2.5, (ang / (2.0 * math.pi)) * 1.5, 0.0, 1.0)
            k_side = 0.70 + 0.30 * max(0.0, radial.dot(room_n))
            vert[col_layer] = (clamp(base[0] * k_side),
                               clamp(base[1] * k_side),
                               clamp(base[2] * k_side), 1.0)
            ring.append(vert)
        rings.append(ring)

    for i in range(segs):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            j2 = (j + 1) % sides
            f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            f.smooth = True
    f = bm.faces.new(tuple(reversed(rings[0])))
    f.smooth = False
    f = bm.faces.new(tuple(rings[-1]))
    f.smooth = False


def add_drip(bm, col_layer, uvseed, root, hang, length, radius, rng):
    """一颗挂在唇边往下滴的血滴：上面细、底部鼓成一团。"""
    segs = 3
    sides = 5
    ts = (0.0, 0.35, 0.75, 1.0)
    rs = (radius, radius * 0.6, radius * 0.5, radius * 1.5)
    d = hang.normalized()
    root_col = _rgb(C_DRIP)
    tip_col = _rgb(C_DRIP_TIP)
    rings = []
    for i, (t, r) in enumerate(zip(ts, rs)):
        p = root + d * (length * t)
        p.z = max(p.z, -3.085)   # 血滴落到地板上就停住，不穿到地板下面
        if i == 0:
            tan = d
        else:
            tan = (root + d * (length * t)) - (root + d * (length * ts[i - 1]))
        tan.normalize()
        ref = Vector((0.0, -1.0, 0.0)) if abs(tan.dot(Vector((0.0, -1.0, 0.0)))) < 0.94 else Vector((0.0, 0.0, 1.0))
        side_v = tan.cross(ref)
        if side_v.length < 1e-6:
            side_v = tan.cross(Vector((1.0, 0.0, 0.0)))
        side_v.normalize()
        up_v = side_v.cross(tan).normalized()
        base = (root_col[0] + (tip_col[0] - root_col[0]) * t,
                root_col[1] + (tip_col[1] - root_col[1]) * t,
                root_col[2] + (tip_col[2] - root_col[2]) * t)
        ring = []
        for j in range(sides):
            ang = 2.0 * math.pi * j / sides
            radial = side_v * math.cos(ang) + up_v * math.sin(ang)
            vert = bm.verts.new(p + radial * r)
            vert[uvseed] = (t * 2.5, (j / sides) * 1.5, 0.0, 1.0)
            k = 0.72 + 0.28 * max(0.0, radial.dot(Vector((0.0, -1.0, 0.0))))
            vert[col_layer] = (clamp(base[0] * k), clamp(base[1] * k), clamp(base[2] * k), 1.0)
            ring.append(vert)
        rings.append(ring)

    for i in range(segs):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            j2 = (j + 1) % sides
            f = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            f.smooth = True
    f = bm.faces.new(tuple(reversed(rings[0])))
    f.smooth = False
    f = bm.faces.new(tuple(rings[-1]))
    f.smooth = False


def add_bud(bm, col_layer, uvseed, center, room_n, tangent, radius, rng, sub=1):
    """一颗肉芽：沿翻边法线压扁的低面数球，底部暗、顶面亮。"""
    before = set(bm.faces)
    side_v = tangent.normalized()
    up_v = room_n.cross(side_v).normalized()
    basis = Matrix(((side_v.x, up_v.x, room_n.x, 0.0),
                    (side_v.y, up_v.y, room_n.y, 0.0),
                    (side_v.z, up_v.z, room_n.z, 0.0),
                    (0.0, 0.0, 0.0, 1.0)))
    mat = Matrix.Translation(center) @ basis @ Matrix.Diagonal(
        (radius, radius * 0.82, radius * 0.62, 1.0))
    ret = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0, matrix=mat)
    for f in set(bm.faces) - before:
        f.smooth = True

    lay = bm.verts.layers.float_color.get('Col') or col_layer
    seed = bm.verts.layers.float_color.get('uvseed') or uvseed
    base = _rgb(C_BUD_ROOT)
    tip = _rgb(C_BUD_TIP)
    for vert in ret['verts']:
        h = clamp(((vert.co - center).dot(room_n)) / (radius * 0.62) * 0.5 + 0.5)
        tone = 0.50 + 0.60 * h
        vert[lay] = (clamp((base[0] + (tip[0] - base[0]) * h) * tone),
                     clamp((base[1] + (tip[1] - base[1]) * h) * tone),
                     clamp((base[2] + (tip[2] - base[2]) * h) * tone), 1.0)
        vert[seed] = ((vert.co.x + vert.co.y) * 1.2, vert.co.z * 1.2, 0.0, 1.0)


def add_flap(bm, col_layer, uvseed, root, outward, along, length, width, room_n, rng):
    """一条从外缘撕出来的扁平肉片：根宽尖窄，尖端微微翘起。"""
    d = (outward.normalized() + along).normalized()
    s = room_n.cross(d)
    if s.length < 1e-5:
        s = d.cross(Vector((0.0, 0.0, 1.0)))
    s.normalize()
    th = 0.006
    pts = (root - s * (width * 0.5),
           root + s * (width * 0.5),
           root + d * (length * 0.52) - s * (width * 0.16) + room_n * 0.014,
           root + d * (length * 0.52) + s * (width * 0.16) + room_n * 0.014,
           root + d * length + room_n * 0.022)
    c_root = _rgb('#2a0204')
    c_tip = _rgb('#7a0d13')
    top, bot = [], []
    for i, p in enumerate(pts):
        mix = i / 4.0
        base = tuple(c_root[k] + (c_tip[k] - c_root[k]) * mix for k in range(3))
        for layer in (top, bot):
            v = bm.verts.new(p + room_n * (th if layer is top else -th))
            v[col_layer] = (clamp(base[0] * 0.85), clamp(base[1] * 0.85),
                            clamp(base[2] * 0.85), 1.0)
            v[uvseed] = (i / 4.0 * 2.0, 0.5, 0.0, 1.0)
            layer.append(v)
    f = bm.faces.new(tuple(top))
    f.smooth = False
    f = bm.faces.new(tuple(reversed(bot)))
    f.smooth = False
    for i in range(5):
        j = (i + 1) % 5
        f = bm.faces.new((top[i], top[j], bot[j], bot[i]))
        f.smooth = False


def build():
    rng = random.Random(TENT_SEED)
    noise = Noise(NOISE_SEED)
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    for ob in list(coll.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)

    wl, wr, cl, cr = crack_edges()
    widths_wall = width_profile(len(wl) + 1, RIM_W, tip_taper=False, seed=WIDTH_SEED)
    widths_ceil = width_profile(len(cl) + 1, RIM_W, tip_taper=True, seed=WIDTH_SEED + 1)

    wall_sides = {}
    for name, edge, side in (('L', wl, -1), ('R', wr, +1)):
        path = [Vector((x, 0.0, y - CRACK_Y)) for (x, y) in edge]
        path.append(Vector((edge[-1][0], 0.0, CEIL_FACE_Y - CRACK_Y - 0.010)))
        wall_sides[name] = (path, side)
    ceil_sides = {}
    for name, edge, side in (('L', cl, -1), ('R', cr, +1)):
        path = [Vector((x, CRACK_Z - z, 0.0)) for (x, z) in edge]
        path.insert(0, Vector((edge[0][0], 0.060, 0.0)))
        ceil_sides[name] = (path, side)

    bm = bmesh.new()
    col_layer = bm.verts.layers.float_color.new('Col')
    uvseed = bm.verts.layers.float_color.new('uvseed')

    # ---- 4 条翻边壳 ----
    for path, side in wall_sides.values():
        add_frame_side(bm, col_layer, uvseed, path, side, widths_wall, rng, noise, 'wall')
    for path, side in ceil_sides.values():
        add_frame_side(bm, col_layer, uvseed, path, side, widths_ceil, rng, noise, 'ceil')

    # ---- 触手 ----
    tent_stats = []

    def grow(path, k, side, width, room_n, length_range, radius_range,
             along=0.0, droop=0.0):
        p = path[k]
        t = tangent_at(path, k)
        root = p + Vector((side * width * 0.90, 0.0, 0.0)) + room_n * 0.014
        direction = (Vector((side * 0.82, 0.0, 0.0))
                     + room_n * (0.30 + rng.random() * 0.35)
                     + Vector((0.0, 0.0, droop))
                     + t * ((rng.random() - 0.5) * 0.8 + along))
        length = length_range[0] + (length_range[1] - length_range[0]) * rng.random()
        radius = radius_range[0] + (radius_range[1] - radius_range[0]) * rng.random()
        add_tentacle(bm, col_layer, uvseed, root, direction, length, radius, room_n, rng,
                     side=side, sides=5 + int(rng.random() * 3), annulate=True, bulb=True)
        tent_stats.append((length, radius * 2.0))

    for name in ('L', 'R'):
        path, side = wall_sides[name]
        start = 1 if side < 0 else 2
        for k in range(start, len(path) - 1, 3):
            if rng.random() < 0.22:
                continue
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            grow(path, k, side, widths_wall[k], room_n,
                 (0.26, 0.60), (0.020, 0.040), droop=-0.30)

    for name in ('L', 'R'):
        path, side = ceil_sides[name]
        start = 2 if side < 0 else 3
        for k in range(start, len(path) - 2, 3):
            if rng.random() < 0.22:
                continue
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            grow(path, k, side, widths_ceil[k], room_n,
                 (0.22, 0.46), (0.016, 0.032), along=0.25, droop=-0.12)

    # 地面根须
    for name in ('L', 'R'):
        path, side = wall_sides[name]
        for k in (0, 2):
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            grow(path, k, side, widths_wall[k] * 0.90, room_n,
                 (0.24, 0.42), (0.018, 0.032), along=-0.20)

    # ---- 撕出的扁平肉片 ----
    flap_count = 0
    for name in ('L', 'R'):
        for path, side, widths in ((wall_sides[name][0], wall_sides[name][1], widths_wall),
                                   (ceil_sides[name][0], ceil_sides[name][1], widths_ceil)):
            for k in range(2, len(path) - 2, 4):
                if rng.random() < 0.22:
                    continue
                p = path[k]
                t = tangent_at(path, k)
                room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
                root = p + Vector((side * widths[k] * 0.97, 0.0, 0.0)) + room_n * 0.024
                along = t * ((rng.random() - 0.5) * 0.9)
                add_flap(bm, col_layer, uvseed, root, Vector((side, 0.0, 0.0)), along,
                         0.10 + rng.random() * 0.18, 0.05 + rng.random() * 0.06,
                         room_n, rng)
                flap_count += 1

    # ---- 肉芽（内唇成簇 + 外半圈散芽 + 大肉瘤） ----
    bud_count = 0
    for name in ('L', 'R'):
        path, side = wall_sides[name]
        for k in range(1, len(path) - 1, 2):
            p = path[k]
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            if rng.random() < 0.25:
                continue
            center = p + Vector((side * 0.010, 0.0, 0.0)) + room_n * 0.062
            r = 0.017 + rng.random() * 0.025
            add_bud(bm, col_layer, uvseed, center, room_n, t, r, rng, sub=1)
            bud_count += 1
            # 成簇：旁边再压一颗小一点的
            if rng.random() < 0.5:
                c2 = center + t * (0.02 + rng.random() * 0.02) + room_n * 0.006
                add_bud(bm, col_layer, uvseed, c2, room_n, t, r * 0.6, rng, sub=1)
                bud_count += 1
    for name in ('L', 'R'):
        path, side = ceil_sides[name]
        for k in range(1, len(path) - 1, 2):
            p = path[k]
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            if rng.random() < 0.30:
                continue
            center = p + Vector((side * 0.012, 0.0, 0.0)) + room_n * 0.058
            add_bud(bm, col_layer, uvseed, center, room_n, t,
                    0.015 + rng.random() * 0.022, rng, sub=1)
            bud_count += 1

    for name in ('L', 'R'):
        for path, side, widths in ((wall_sides[name][0], wall_sides[name][1], widths_wall),
                                   (ceil_sides[name][0], ceil_sides[name][1], widths_ceil)):
            for k in range(2, len(path) - 2, 4):
                if rng.random() < 0.35:
                    continue
                s = 0.35 + rng.random() * 0.50
                p = path[k]
                t = tangent_at(path, k)
                room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
                center = (p + Vector((side * s * widths[k], 0.0, 0.0)) + room_n * 0.045)
                add_bud(bm, col_layer, uvseed, center, room_n, t,
                        0.011 + rng.random() * 0.016, rng, sub=1)
                bud_count += 1
            for k in range(1, len(path) - 1, 5):
                if rng.random() < 0.40:
                    continue
                s = 0.45 + rng.random() * 0.35
                p = path[k]
                t = tangent_at(path, k)
                room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
                center = (p + Vector((side * s * widths[k], 0.0, 0.0)) + room_n * 0.048)
                add_bud(bm, col_layer, uvseed, center, room_n, t,
                        0.026 + rng.random() * 0.022, rng, sub=2)
                bud_count += 1

    # ---- 悬挂血滴（沿墙臂唇边往下滴） ----
    drip_count = 0
    down = Vector((0.0, 0.0, -1.0))
    for name in ('L', 'R'):
        path, side = wall_sides[name]
        for k in (2, 4, 6, 8):
            p = path[k]
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            center = p + Vector((side * 0.015, 0.0, 0.0)) + room_n * 0.055
            add_drip(bm, col_layer, uvseed, center, down, 0.05 + rng.random() * 0.09,
                     0.005 + rng.random() * 0.006, rng)
            drip_count += 1
    # 底部唇边再聚几滴（血会往最低处流）
    for name in ('L', 'R'):
        path, side = wall_sides[name]
        for k in (0, 1):
            p = path[k]
            t = tangent_at(path, k)
            room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
            center = p + Vector((side * 0.010, 0.0, 0.0)) + room_n * 0.05
            add_drip(bm, col_layer, uvseed, center, down, 0.06 + rng.random() * 0.08,
                     0.007 + rng.random() * 0.006, rng)
            drip_count += 1

    # ---- 组织细丝（挂在唇边，受重力下垂） ----
    strand_count = 0
    for name in ('L', 'R'):
        for path, side in ((wall_sides[name][0], wall_sides[name][1]),
                           (ceil_sides[name][0], ceil_sides[name][1])):
            for k in range(2, len(path) - 2, 3):
                if rng.random() < 0.5:
                    continue
                p = path[k]
                t = tangent_at(path, k)
                room_n = Vector((1.0, 0.0, 0.0)).cross(t).normalized()
                root = p + Vector((side * 0.010, 0.0, 0.0)) + room_n * 0.058
                length = 0.07 + rng.random() * 0.15
                add_tentacle(bm, col_layer, uvseed, root, down + Vector((0, -0.1, 0)),
                             length, 0.0022 + rng.random() * 0.002, room_n, rng,
                             sides=3, root_hex=C_STRAND, tip_hex=C_STRAND_TIP,
                             annulate=False, bulb=False)
                strand_count += 1

    # ---- 转角肉芽 + 末端尖帽 ----
    corner_n = Vector((0.0, -1.0, -1.0)).normalized()
    for x, y, z, r in ((-0.47, 0.030, 0.030, 0.040),
                       (0.42, 0.032, 0.032, 0.044),
                       (-0.30, 0.028, 0.028, 0.028),
                       (0.30, 0.030, 0.030, 0.030)):
        add_bud(bm, col_layer, uvseed, Vector((x, y, z)), corner_n,
                Vector((1.0, 0.0, 0.0)), r, rng, sub=2)

    tip = ceil_sides['L'][0][-1]
    add_bud(bm, col_layer, uvseed, tip + Vector((0.0, 0.012, -0.010)),
            Vector((0.0, -1.0, 0.0)), Vector((1.0, 0.0, 0.0)),
            0.060, rng, sub=2)
    bud_count += 5

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    # ---- 从 uvseed 顶点层生成真正的 loop UV 层 ----
    uv_layer = bm.loops.layers.uv.new('UVMap')
    seed = bm.verts.layers.float_color.get('uvseed')
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert[seed]
            lp[uv_layer].uv = (c[0], c[1])

    me = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(me)
    bm.free()
    me.update()

    col = me.color_attributes.get('Col')
    assert col is not None and len(col.data) == len(me.vertices), 'vertex color layer'
    me.color_attributes.active_color = col
    assert me.uv_layers.get('UVMap') is not None, 'UV layer'
    # uvseed 只是建 UV 时的临时顶点层，不该作为 COLOR_1 导出
    if me.color_attributes.get('uvseed') is not None:
        me.color_attributes.remove(me.color_attributes['uvseed'])

    me.materials.append(make_material(load_detail_image()))

    ob = bpy.data.objects.new(MESH_NAME, me)
    coll.objects.link(ob)
    ob['role'] = 'crack_decor'
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ob['triangles'] = tris

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.25
    coll.objects.link(root)
    ob.parent = root
    bpy.context.view_layer.update()

    bb = [v.co for v in me.vertices]
    mn = (min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))
    mx = (max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb))
    w, d, h = mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]

    width_eye = opening_width_at(wl, wr, EYE_Y)
    width_mid = max(opening_width_at(wl, wr, y) for y in (1.0, 1.3, 1.6))
    tip_world_z = max(p[1] for p in cl)

    root['model'] = 'crack-decor'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#第五关 · 裂缝周围的装饰'
    root['origin'] = 'L corner = world (0, 3.09, -5.92)'
    root['place'] = [0.0, 3.09, -5.92]
    root['opening_w_eye_m'] = round(width_eye, 4)
    root['opening_w_max_m'] = round(width_mid, 4)
    root['vertical_top_m'] = round(CEIL_FACE_Y - 0.01, 4)
    root['ceiling_run_m'] = CEIL_LEN
    root['ceiling_tip_world_z'] = round(tip_world_z, 4)
    root['rims'] = 3
    root['tentacles'] = len(tent_stats)
    root['buds'] = bud_count
    root['flaps'] = flap_count
    root['drips'] = drip_count
    root['strands'] = strand_count
    root['tentacle_len_m'] = [round(min(s[0] for s in tent_stats), 3),
                              round(max(s[0] for s in tent_stats), 3)]
    root['tentacle_dia_m'] = [round(min(s[1] for s in tent_stats), 3),
                              round(max(s[1] for s in tent_stats), 3)]
    root['color'] = '#050001..#8a0e14'
    root['up_axis'] = 'Y'
    root['front_axis'] = '+Z (glTF) / -Y (Blender)'
    root['mesh_count'] = 1
    root['triangles'] = tris

    # ---- 自检 ----
    chk = bmesh.new()
    chk.from_mesh(me)
    non_manifold = sum(1 for e in chk.edges if not e.is_manifold)
    boundary = sum(1 for e in chk.edges if e.is_boundary)
    loose = sum(1 for v in chk.verts if not v.link_edges)
    chk.verts.ensure_lookup_table()
    seen = set()
    islands = 0
    for v in chk.verts:
        if v.index in seen:
            continue
        islands += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
    chk.free()

    hollow = [v for v in me.vertices
              if abs(v.co.x) < 0.08 and -2.40 < v.co.z < -0.40]

    print('  verts=%d faces=%d tris=%d' % (len(me.vertices), len(me.polygons), tris))
    print('  bbox x[%.4f,%.4f] y[%.4f,%.4f] z[%.4f,%.4f]'
          % (mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
    print('  size  X=%.4f  Y(进房间)=%.4f  H=%.4f' % (w, d, h))
    print('  health non_manifold=%d boundary=%d loose=%d islands=%d'
          % (non_manifold, boundary, loose, islands))
    print('  opening  eye(%.2f m)=%.4f m  max=%.4f m  tip world z=%.3f'
          % (EYE_Y, width_eye, width_mid, tip_world_z))
    print('  tentacles=%d  length %.3f-%.3f m  dia %.3f-%.3f m  buds=%d  flaps=%d  drips=%d  strands=%d'
          % (len(tent_stats), min(s[0] for s in tent_stats), max(s[0] for s in tent_stats),
             min(s[1] for s in tent_stats), max(s[1] for s in tent_stats),
             bud_count, flap_count, drip_count, strand_count))

    assert tris < 8000, 'tri budget'
    assert non_manifold == 0 and boundary == 0 and loose == 0, 'topology'
    assert not hollow, 'hollow center has %d vertices: %s' % (
        len(hollow), [tuple(round(c, 4) for c in v.co) for v in hollow[:6]])
    assert mx[2] <= 0.075 and mn[2] >= -3.13, 'outside wall/ceiling/floor'
    assert 3.05 <= (mx[2] - mn[2]) <= 3.30, 'vertical extent'
    assert 2.55 <= -mn[1] <= 2.80, 'ceiling run'
    assert all(0.20 - 1e-6 <= s[0] <= 0.60 + 1e-6 for s in tent_stats), 'tentacle length'
    assert all(0.030 - 1e-6 <= s[1] <= 0.080 + 1e-6 for s in tent_stats), 'tentacle thickness'
    return root, ob, tris, width_eye, width_mid, tip_world_z


def make_material(img):
    mat = bpy.data.materials.get('CrackDecor_Flesh')
    if mat is None:
        mat = bpy.data.materials.new('CrackDecor_Flesh')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    vc = nt.nodes.get('CrackDecorVertexColor')
    if vc is None:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.name = 'CrackDecorVertexColor'
    vc.layer_name = 'Col'
    tex = nt.nodes.get('CrackDecorDetailTex')
    if tex is None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.name = 'CrackDecorDetailTex'
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'REPEAT'
    mix = nt.nodes.get('CrackDecorDetailMix')
    if mix is None:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.name = 'CrackDecorDetailMix'
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = (1.0, 1.0, 1.0, 1.0)
    mix.inputs[7].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(vc.outputs['Color'], mix.inputs[6])
    nt.links.new(tex.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    mat.use_backface_culling = True
    mat.diffuse_color = (0.10, 0.005, 0.008, 1.0)
    mat.roughness = 1.0
    mat.metallic = 0.0
    return mat


def strip_scene_extras(path):
    data = pathlib.Path(path).read_bytes()
    off = 12
    chunks = []
    while off < len(data):
        clen, ctype = struct.unpack('<I4s', data[off:off + 8])
        chunks.append((ctype, data[off + 8:off + 8 + clen]))
        off += 8 + clen
    changed = False
    out = []
    for ctype, payload in chunks:
        if ctype == b'JSON':
            doc = json.loads(payload.decode('utf-8'))
            for scene in doc.get('scenes', []):
                extras = scene.get('extras')
                if isinstance(extras, dict) and extras.pop('blendermcp_server_running', None):
                    changed = True
                    if not extras:
                        scene.pop('extras', None)
            payload = json.dumps(doc, separators=(',', ':')).encode('utf-8')
            payload += b' ' * ((4 - len(payload) % 4) % 4)
        out.append((ctype, payload))
    if changed:
        total = 12 + sum(8 + len(p) for _, p in out)
        blob = struct.pack('<4sII', b'glTF', 2, total)
        blob += b''.join(struct.pack('<I4s', len(p), t) + p for t, p in out)
        pathlib.Path(path).write_bytes(blob)
    return changed


def inspect_glb(path):
    data = pathlib.Path(path).read_bytes()
    off = 12
    doc = None
    while off < len(data):
        clen, ctype = struct.unpack('<I4s', data[off:off + 8])
        if ctype == b'JSON':
            doc = json.loads(data[off + 8:off + 8 + clen].decode('utf-8'))
            break
        off += 8 + clen
    assert doc is not None
    meshes = doc.get('meshes', [])
    prims = [p for m in meshes for p in m.get('primitives', [])]
    attrs = sorted(set(k for p in prims for k in p.get('attributes', {})))
    mat = doc.get('materials', [{}])[0]
    pbr = mat.get('pbrMetallicRoughness', {})
    print('  glb: meshes=%d prims=%d nodes=%d attrs=%s' % (
        len(meshes), len(prims), len(doc.get('nodes', [])), attrs))
    print('  glb: material=%s baseColorFactor=%s doubleSided=%s tex=%s' % (
        mat.get('name'), pbr.get('baseColorFactor'), mat.get('doubleSided'),
        bool(pbr.get('baseColorTexture'))))
    assert 'COLOR_0' in attrs
    assert 'TEXCOORD_0' in attrs
    assert pbr.get('baseColorTexture'), 'baseColorTexture'
    assert len(meshes) == 1
    return doc


def export_glb(root, obj):
    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    kwargs = {
        'filepath': OUT_GLB,
        'export_format': 'GLB',
        'use_selection': True,
        'export_yup': True,
        'export_apply': False,
        'export_materials': 'EXPORT',
        'export_extras': True,
        'export_animations': False,
        'export_draco_mesh_compression_enable': False,
        'export_meshopt_compression_enable': False,
        'export_tangents': False,
        'export_texcoords': True,
        'export_normals': True,
        'export_vertex_color': 'MATERIAL',
        'export_cameras': False,
        'export_lights': False,
    }
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kwargs = {k: v for k, v in kwargs.items() if k in valid}
    written = OUT_GLB
    try:
        with open(written, 'wb'):
            pass
    except OSError:
        import tempfile
        written = str(pathlib.Path(tempfile.gettempdir()) / 'crack_decor_v01.glb')
        print('workspace write denied, exporting to', written)
    kwargs['filepath'] = written
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(written)
    print('exported', written, pathlib.Path(written).stat().st_size, 'bytes')
    return written


def _main():
    root, obj, _tris, _we, _wm, _tz = build()
    written = export_glb(root, obj)
    inspect_glb(written)
    return written


if globals().get('__name__', '__main__') == '__main__':
    _main()

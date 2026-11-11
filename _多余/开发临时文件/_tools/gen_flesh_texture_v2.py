"""
生成高质量血肉纹理 PNG 图片（512x512，支持无缝平铺）。
三层结构：基底肌肉层 + 血管网络层 + 脂肪/结缔组织细节。
使用多层 Perlin 噪声 + 定向肌肉纤维。
"""
import math, random, os
from PIL import Image, ImageDraw

SEED = 42
random.seed(SEED)

W = H = 512
img = Image.new('RGB', (W, H), (0, 0, 0))
draw = ImageDraw.Draw(img)

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(round(v))))

def smooth_noise(x, y):
    """简单的值噪声（基于整数网格插值）"""
    ix, iy = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - ix, y - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    def _hash(ix, iy):
        h = (ix * 374761393 + iy * 668265263) & 0xFFFFFFFF
        h = (h ^ (h >> 13)) * 1274126177
        return (h & 0x7FFFFFFF) / 0x7FFFFFFF
    n00 = _hash(ix, iy)
    n10 = _hash(ix + 1, iy)
    n01 = _hash(ix, iy + 1)
    n11 = _hash(ix + 1, iy + 1)
    return n00*(1-fx)*(1-fy) + n10*fx*(1-fy) + n01*(1-fx)*fy + n11*fx*fy

def fbm(x, y, octaves=4, lacunarity=2.0, gain=0.5):
    """分形布朗运动"""
    v = 0.0
    amp = 0.5
    freq = 1.0
    for _ in range(octaves):
        v += amp * smooth_noise(x * freq, y * freq)
        freq *= lacunarity
        amp *= gain
    return v

# ============ 1. 基底颜色：肌肉组织底色 ============
for y in range(H):
    for x in range(W):
        n = fbm(x / W * 6, y / H * 6, octaves=3, lacunarity=2.5, gain=0.6)
        # 肌肉基底：暗红到紫红
        r = int(45 + n * 35)
        g = int(10 + n * 15)
        b = int(18 + n * 20)
        img.putpixel((x, y), (r, g, b))

# ============ 2. 肌肉纤维纹理（方向性） ============
# 横向纤维
for y in range(H):
    for x in range(W):
        ny = y / H * 12 + fbm(x / W * 20, y / H * 8, octaves=2, gain=0.4) * 2
        fib = abs((ny % 1.0) - 0.5) * 2
        fib = max(0, 1 - fib * 2)  # 0..1, 在纤维中心为1
        fib = fib ** 0.3  # 压缩动态
        r, g, b = img.getpixel((x, y))
        bright = int(fib * 20)
        img.putpixel((x, y), (r + bright, g + bright // 3, b + bright // 4))

# ============ 3. 血管网络 ============
# 主血管（较粗，红色更深）
for i in range(25):
    vx = random.uniform(0, W)
    vy = random.uniform(0, H)
    angle = random.uniform(0, math.pi * 2)
    length = random.randint(20, 60)
    thickness = random.randint(3, 7)
    r_color = random.randint(100, 180)
    for j in range(length):
        angle += random.uniform(-0.3, 0.3)
        vx += math.cos(angle) * 2
        vy += math.sin(angle) * 2
        vx = vx % W
        vy = vy % H
        for tx in range(-thickness, thickness + 1):
            for ty in range(-thickness, thickness + 1):
                d = math.sqrt(tx*tx + ty*ty)
                if d > thickness: continue
                px = int(vx + tx) % W
                py = int(vy + ty) % H
                cr, cg, cb = img.getpixel((px, py))
                darkness = 1 - d / thickness
                img.putpixel((px, py), (
                    int(cr - darkness * 25),
                    int(cg - darkness * 8),
                    int(cb - darkness * 5),
                ))
        # 分支
        if j > 5 and random.random() > 0.8:
            b_angle = angle + random.uniform(-1.5, 1.5)
            bx, by = vx, vy
            for k in range(random.randint(5, 12)):
                bx += math.cos(b_angle) * 2
                by += math.sin(b_angle) * 2
                bx = bx % W
                by = by % H
                for t in range(-2, 3):
                    for tt in range(-2, 3):
                        px = int(bx + t) % W
                        py = int(by + tt) % H
                        cr, cg, cb = img.getpixel((px, py))
                        img.putpixel((px, py), (
                            cr - 8, cg - 3, cb - 2
                        ))

# ============ 4. 毛细血管（细线） ============
for i in range(120):
    vx = random.uniform(0, W)
    vy = random.uniform(0, H)
    angle = random.uniform(0, math.pi * 2)
    for j in range(random.randint(8, 20)):
        angle += random.uniform(-0.8, 0.8)
        vx += math.cos(angle) * 1.5
        vy += math.sin(angle) * 1.5
        vx = vx % W
        vy = vy % H
        px, py = int(vx), int(vy)
        cr, cg, cb = img.getpixel((px, py))
        img.putpixel((px, py), (cr - 5, cg - 2, cb - 2))

# ============ 5. 脂肪/结缔组织淡黄斑 ============
for i in range(20):
    fx = random.randint(0, W-1)
    fy = random.randint(0, H-1)
    radius = random.randint(6, 20)
    for y in range(-radius, radius+1):
        for x in range(-radius, radius+1):
            d = math.sqrt(x*x + y*y)
            if d > radius: continue
            px = (fx + x) % W
            py = (fy + y) % H
            factor = 1 - d / radius
            n = fbm(px / W * 12, py / H * 12, octaves=2, gain=0.3) * 0.3
            cr, cg, cb = img.getpixel((px, py))
            r = int(cr + factor * (25 + n * 20))
            g = int(cg + factor * (30 + n * 25))
            b = int(cb + factor * (15 + n * 10))
            img.putpixel((px, py), (clamp(r, 0, 255), clamp(g), clamp(b)))

# ============ 6. 局部瘀伤/淤血 ============
for i in range(8):
    sx = random.randint(0, W-1)
    sy = random.randint(0, H-1)
    radius = random.randint(15, 35)
    for y in range(-radius, radius+1):
        for x in range(-radius, radius+1):
            d = math.sqrt(x*x + y*y)
            if d > radius: continue
            px = (sx + x) % W
            py = (sy + y) % H
            factor = (1 - d / radius) ** 0.8
            cr, cg, cb = img.getpixel((px, py))
            r = int(cr - factor * 20)
            g = int(cg - factor * 10)
            b = int(cb - factor * 5)
            img.putpixel((px, py), (clamp(r), clamp(g), clamp(b)))

# ============ 7. 润泽高光（湿润感） ============
for i in range(8):
    hx = random.randint(0, W-1)
    hy = random.randint(0, H-1)
    radius = random.randint(4, 10)
    for y in range(-radius, radius+1):
        for x in range(-radius, radius+1):
            d = math.sqrt(x*x + y*y)
            if d > radius: continue
            px = (hx + x) % W
            py = (hy + y) % H
            factor = (1 - d / radius) ** 0.5
            cr, cg, cb = img.getpixel((px, py))
            r = int(cr + factor * 25)
            g = int(cg + factor * 12)
            b = int(cb + factor * 6)
            img.putpixel((px, py), (clamp(r), clamp(g), clamp(b)))

# ============ 保存 ============
output_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'textures')
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'flesh_texture.png')
img.save(output_path, 'PNG')
print(f"血肉纹理已保存: {output_path}")
print(f"尺寸: {img.size}")

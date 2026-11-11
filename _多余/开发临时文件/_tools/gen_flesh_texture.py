"""
生成高质量血肉纹理 PNG 图片（512x512，无缝平铺支持）。
使用 Pillow 多层绘制模拟真实肌肉/脂肪/血管/结缔组织。
"""
import math, random, os
from PIL import Image, ImageDraw

SEED = 20251031
random.seed(SEED)

W = H = 512
img = Image.new('RGB', (W, H), (30, 8, 16))
draw = ImageDraw.Draw(img)

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

def get_pixel(img, x, y):
    """获取像素（支持环绕，用于无缝平铺）"""
    x = x % W
    y = y % H
    return img.getpixel((x, y))

def set_pixel(img, x, y, color):
    x = x % W
    y = y % H
    img.putpixel((x, y), tuple(clamp(c) for c in color))

# ========== 1. 基底：径向渐变 ==========
cx, cy = W * 0.45, H * 0.35
for y in range(H):
    for x in range(W):
        dx = x - cx
        dy = y - cy
        dist = math.sqrt(dx*dx + dy*dy) / (W * 0.55)
        r = clamp(70 - 40 * dist + random.randint(-5, 5))
        g = clamp(20 - 12 * dist + random.randint(-3, 3))
        b = clamp(30 - 18 * dist + random.randint(-3, 3))
        set_pixel(img, x, y, (r, g, b))

# ========== 2. 肌肉纤维（正弦波纹） ==========
for pass_idx in range(4):
    y_off = pass_idx * 5
    for y in range(y_off, H, 4):
        for x in range(W):
            noise = random.uniform(-1, 1)
            yy = y + math.sin(x * (0.025 + pass_idx * 0.008) + noise * 3) * (4 + pass_idx)
            if 0 <= yy < H:
                r, g, b = get_pixel(img, x, int(yy))
                bright = 25 + pass_idx * 10
                r = clamp(r + bright)
                g = clamp(g + bright * 0.3)
                b = clamp(b + bright * 0.2)
                set_pixel(img, x, int(yy), (r, g, b))

# ========== 3. 深红血管（粗） ==========
for i in range(35):
    vx = random.randint(0, W-1)
    vy = random.randint(0, H-1)
    length = random.randint(8, 20)
    r_color = random.randint(90, 160)
    for j in range(length):
        for t in range(-1, 2):
            px = (vx + t) % W
            py = vy % H
            cr, cg, cb = get_pixel(img, px, py)
            set_pixel(img, px, py, (cr - 15, cg - 5, cb - 5))
        vx += random.randint(-8, 8)
        vy += random.randint(-4, 4)
        vx = vx % W
        vy = vy % H
        # 分支
        if j > 3 and random.random() > 0.75:
            bx, by = vx, vy
            for k in range(random.randint(3, 6)):
                bx += random.randint(-6, 6)
                by += random.randint(-3, 3)
                bx = bx % W
                by = by % H
                for t in range(-1, 2):
                    px = (bx + t) % W
                    py = by % H
                    cr, cg, cb = get_pixel(img, px, py)
                    set_pixel(img, px, py, (cr - 10, cg - 3, cb - 3))

# ========== 4. 毛细血管（细，淡红） ==========
for i in range(80):
    vx = random.randint(0, W-1)
    vy = random.randint(0, H-1)
    for j in range(random.randint(5, 15)):
        for t in range(-1, 1):
            px = (vx + t) % W
            py = vy % H
            cr, cg, cb = get_pixel(img, px, py)
            set_pixel(img, px, py, (cr - 5, cg - 2, cb - 2))
        vx += random.randint(-10, 10)
        vy += random.randint(-6, 6)
        vx = vx % W
        vy = vy % H

# ========== 5. 暗红瘀伤/淤血斑点 ==========
for i in range(12):
    sx = random.randint(0, W-1)
    sy = random.randint(0, H-1)
    radius = random.randint(15, 40)
    for y in range(max(0, sy-radius), min(H, sy+radius)):
        for x in range(max(0, sx-radius), min(W, sx+radius)):
            dx = x - sx
            dy = y - sy
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= radius:
                factor = 1 - dist / radius
                intensity = random.randint(0, 8)
                cr, cg, cb = get_pixel(img, x, y)
                r = clamp(cr - int(factor * (20 + intensity)))
                g = clamp(cg - int(factor * (10 + intensity)))
                b = clamp(cb - int(factor * (5 + intensity)))
                set_pixel(img, x, y, (r, g, b))

# ========== 6. 脂肪淡黄斑点 ==========
for i in range(15):
    fx = random.randint(0, W-1)
    fy = random.randint(0, H-1)
    radius = random.randint(5, 15)
    for y in range(max(0, fy-radius), min(H, fy+radius)):
        for x in range(max(0, fx-radius), min(W, fx+radius)):
            dx = x - fx
            dy = y - fy
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= radius:
                factor = 1 - dist / radius
                cr, cg, cb = get_pixel(img, x, y)
                r = clamp(cr + int(factor * (25 + random.randint(0, 10))))
                g = clamp(cg + int(factor * (35 + random.randint(0, 10))))
                b = clamp(cb + int(factor * (20 + random.randint(0, 10))))
                set_pixel(img, x, y, (r, g, b))

# ========== 7. 高光/湿润反光点 ==========
for i in range(6):
    hx = random.randint(0, W-1)
    hy = random.randint(0, H-1)
    radius = random.randint(3, 8)
    for y in range(max(0, hy-radius), min(H, hy+radius)):
        for x in range(max(0, hx-radius), min(W, hx+radius)):
            dx = x - hx
            dy = y - hy
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= radius:
                factor = 1 - dist / radius
                cr, cg, cb = get_pixel(img, x, y)
                r = clamp(cr + int(factor * 20))
                g = clamp(cg + int(factor * 10))
                b = clamp(cb + int(factor * 5))
                set_pixel(img, x, y, (r, g, b))

# ========== 保存 ==========
output_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'textures')
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, 'flesh_texture.png')
img.save(output_path, 'PNG')
print(f"血肉纹理已保存: {output_path}")
print(f"尺寸: {img.size}")

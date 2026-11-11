#!/usr/bin/env python
"""
Patch anomalies.js: fix three issues in createFleshWall().

1. Ceiling texture: create a separate ceilMat with different repeat settings
2. Blood drip strips: replace transition strips with realistic blood drips from flesh boundary
3. Wall lower material: warmer base color, larger noise grains
"""

import re
import sys

FILE = r'E:\新建游戏项目\GameProject\w05_3d_game\src\anomalies.js'

with open(FILE, 'r', encoding='utf-8') as f:
    src = f.read()

# ============================================================
# 1) Ceiling texture: add ceilTexture and ceilMat after texture/fleshMat
# ============================================================

# After line containing "texture.repeat.set(6, 4.5);" we find the block:
#   texture.repeat.set(6, 4.5);
#
#   // 纹理流动动画状态
#   let flowTime = 0;
#   // 天花板呼吸偏移量
#   let ceilBreath = 0;
#
#   const fleshMat = new THREE.MeshBasicMaterial({

# We'll insert ceilTexture and ceilMat AFTER fleshMat but BEFORE makeWallTex
# Actually, let's insert right after fleshMat definition, before makeWallTex

# Pattern: the fleshMat closing bracket and then the comment about makeWallTex
#   });
#
#   // 教室墙面下半部的原始墙壁材质（模拟教室墙壁纹理，与原始 grainTexture 近似）
#   function makeWallTex() {

# We'll insert after the fleshMat closing brace and before that comment.

old_1 = """  const fleshMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  // 教室墙面下半部的原始墙壁材质（模拟教室墙壁纹理，与原始 grainTexture 近似）"""

new_1 = """  const fleshMat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  // 天花板专用材质：clone fleshMat 但纹理 repeat 不同（天花板 20m × 12m）
  const ceilTexture = texture.clone();
  ceilTexture.repeat.set(10, 6);  // 20:12 ≈ 10:6 比例，适合天花板尺寸
  const ceilMat = new THREE.MeshBasicMaterial({
    map: ceilTexture,
    side: THREE.DoubleSide,
  });

  // 教室墙面下半部的原始墙壁材质（模拟教室墙壁纹理，与原始 grainTexture 近似）"""

if old_1 in src:
    src = src.replace(old_1, new_1, 1)
    print("✅ Edit 1: Added ceilTexture and ceilMat")
else:
    print("❌ Edit 1 FAILED: fleshMat block not found")
    sys.exit(1)

# ============================================================
# 2) Change ceiling mesh to use ceilMat instead of fleshMat
# ============================================================

old_2 = """  // 2a) 天花板：血肉全覆盖
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  const ceil = new THREE.Mesh(ceilGeo, fleshMat);
  // 将天花板放在 yCeil 处，法线朝下（rotation.x = PI/2 → 原 XY 平面旋转到 XZ，法线朝 -Y）
  // 使用极小的 z-offset 避免 z-fighting，但没有 BoxGeometry 遮挡问题（教室天花板法线朝外不可见）
  ceil.position.set(0, yCeil, (zMin + zMax) / 2);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);"""

new_2 = """  // 2a) 天花板：血肉全覆盖（使用独立的 ceilMat，纹理 repeat 更适合天花板比例）
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  // 将天花板放在 yCeil 处，法线朝下（rotation.x = PI/2 → 原 XY 平面旋转到 XZ，法线朝 -Y）
  // 使用极小的 z-offset 避免 z-fighting，但没有 BoxGeometry 遮挡问题（教室天花板法线朝外不可见）
  ceil.position.set(0, yCeil, (zMin + zMax) / 2);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);"""

if old_2 in src:
    src = src.replace(old_2, new_2, 1)
    print("✅ Edit 2: Ceiling now uses ceilMat")
else:
    print("❌ Edit 2 FAILED: ceiling mesh block not found")
    sys.exit(1)

# ============================================================
# 3) Modify makeWallTex: warmer color, larger grains, more noise, lower opacity
# ============================================================

old_3 = """  // 教室墙面下半部的原始墙壁材质（模拟教室墙壁纹理，与原始 grainTexture 近似）
  function makeWallTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3c433c';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) {
      const s = 18 + Math.random() * 40;
      ctx.fillStyle = 'rgba(' + s + ',' + s + ',' + s + ',' + (Math.random() * 0.07) + ')';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    return t;
  }
  const wallLowerMat = new THREE.MeshBasicMaterial({
    map: makeWallTex(),
    side: THREE.DoubleSide,
  });"""

new_3 = """  // 教室墙面下半部的原始墙壁材质（模拟教室墙壁纹理，与 grainTexture('#3c433c') 近似）
  function makeWallTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4a4c3a';  // 更暖的底色（减少绿色调）
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const s = 18 + Math.random() * 40;
      ctx.fillStyle = 'rgba(' + s + ',' + s + ',' + s + ',' + (Math.random() * 0.05) + ')';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);  // 更大的噪点
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    return t;
  }
  const wallLowerMat = new THREE.MeshBasicMaterial({
    map: makeWallTex(),
    side: THREE.DoubleSide,
  });"""

if old_3 in src:
    src = src.replace(old_3, new_3, 1)
    print("✅ Edit 3: Updated makeWallTex (warmer color, larger grains, more noise, lower opacity)")
else:
    print("❌ Edit 3 FAILED: makeWallTex block not found")
    sys.exit(1)

# ============================================================
# 4) Replace transition strip section (lines 1428-1482) with blood drip strips
# ============================================================

# Find the exact block to replace. We'll look for:
#   // ---- 过渡：血肉向下蔓延的毛细血管条...
# down to just before
#   // 收集上半墙网格用于呼吸动画

old_4_start = """  // ---- 过渡：血肉向下蔓延的毛细血管条（在交界处模糊上下分割线） ----"""

old_4_end = """  // 收集上半墙网格用于呼吸动画"""

# Build the replacement text
new_4 = """  // ---- 过渡：血液下渗条（从血肉边界延伸到下半墙） ----
  const dripMat = fleshMat.clone();
  dripMat.transparent = true;
  
  function addDrip(w, h, x, z, ry, skipDoor) {
    // w=墙宽, h=墙高, x=中心x, z=中心z, ry=旋转
    const count = Math.floor(w / 0.6);
    const spacing = w / count;
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.4;
      // 跳过门洞区域
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      const stripH = 0.08 + Math.random() * 0.35;
      const stripW = 0.02 + Math.random() * 0.04;
      const yBase = wallH;
      const yPos = yBase + stripH/2 - (Math.random() * stripH * 0.3);
      const opacity = 0.15 + Math.random() * 0.4;
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMat);
      extra.position.set(x + dx, yPos, z);
      extra.rotation.y = ry;
      extra.material.opacity = opacity;
      group.add(extra);
    }
  }
  addDrip(totalW, wallH, 0, zMin + 0.02, Math.PI, false);       // 前墙
  addDrip(sideW, wallH, xMin + 0.02, halfZ, Math.PI/2, false);  // 左墙
  addDrip(sideW, wallH, xMax - 0.02, halfZ, -Math.PI/2, false); // 右墙
  addDrip(totalW, wallH, 0, zMax - 0.02, 0, true);               // 后墙（避开门）

  // 收集上半墙网格用于呼吸动画"""

# Find the exact old text between the markers (inclusive of start, inclusive of the line before end marker)
start_idx = src.find(old_4_start)
end_idx = src.find(old_4_end)

if start_idx == -1:
    print("❌ Edit 4 FAILED: transition strip start comment not found")
    sys.exit(1)
if end_idx == -1:
    print("❌ Edit 4 FAILED: '收集上半墙网格用于呼吸动画' not found")
    sys.exit(1)

# The end marker line is part of the code that stays; we want to replace FROM the start comment
# UP TO but NOT INCLUDING the end comment line
# The end marker appears at the START of a line, so we cut from start_idx to end_idx
old_4 = src[start_idx:end_idx]

# Check that the old block contains the expected content
if "addTransitionStrip" not in old_4:
    print("❌ Edit 4 FAILED: old transition strip block doesn't contain addTransitionStrip")
    sys.exit(1)

src = src[:start_idx] + new_4 + src[end_idx:]
print("✅ Edit 4: Replaced transition strips with blood drip strips")

# ============================================================
# Write the result
# ============================================================
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"\n✅ All edits applied to {FILE}")

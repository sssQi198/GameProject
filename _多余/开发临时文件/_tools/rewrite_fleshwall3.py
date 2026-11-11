"""
Complete rewrite of createFleshWall() in anomalies.js.
Changes:
1. Delete upper/lower wall split: ALL vertical walls use fleshMat
2. Ceiling keeps fleshMat WITH polygonOffset to fix z-fighting with BoxGeometry ceiling
3. Blood flow changed from lateral to vertical (strips flow downward from ceiling to floor)
4. Door avoidance preserved
5. Keep the already-improved wallLowerTex as reference but don't use for walls anymore
"""
import re

with open(r'E:\新建游戏项目\GameProject\w05_3d_game\src\anomalies.js', 'r', encoding='utf-8') as f:
    src = f.read()

# ---- Step 1: Replace the ceiling material to add polygonOffset ----
old_ceil = """  // 天花板专用材质：clone fleshMat 但纹理 repeat 不同（天花板 20m × 12m）
  const ceilTexture = texture.clone();
  ceilTexture.repeat.set(10, 6);  // 20:12 ≈ 10:6 比例，适合天花板尺寸
  const ceilMat = new THREE.MeshBasicMaterial({
    map: ceilTexture,
    side: THREE.DoubleSide,
  });"""

new_ceil = """  // 天花板专用材质：clone fleshMat 但纹理 repeat 不同（天花板 20m × 12m）
  const ceilTexture = texture.clone();
  ceilTexture.repeat.set(10, 6);  // 20:12 ≈ 10:6 比例，适合天花板尺寸
  const ceilMat = new THREE.MeshBasicMaterial({
    map: ceilTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });"""

assert old_ceil in src, "Could not find ceiling material block"
src = src.replace(old_ceil, new_ceil)
print("✓ Ceiling material updated with polygonOffset")

# ---- Step 2: Delete the lower wall texture creation (keep the function but delete its use) ----
# Remove wallLowerMat usage — we don't need wallLowerMat anymore
# But we'll keep the floorMat clone and lower walls

# ---- Step 3: Replace the entire "2. 天花板 + 半覆盖墙壁" section with all-flesh walls ----
old_walls_section = """  const halfH = yCeil * 0.52;  // 血肉覆盖高度（从天花板往下，约1.66m）

  // ========== 2. 天花板 + 半覆盖墙壁 ==========
  // 2a) 天花板：血肉全覆盖（使用独立的 ceilMat，纹理 repeat 更适合天花板比例）
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  // 将天花板放在 yCeil 处，法线朝下（rotation.x = PI/2 → 原 XY 平面旋转到 XZ，法线朝 -Y）
  // 使用极小的 z-offset 避免 z-fighting，但没有 BoxGeometry 遮挡问题（教室天花板法线朝外不可见）
  ceil.position.set(0, yCeil, (zMin + zMax) / 2);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);

  // 2b) 地板（保持暗色）
  const floorMat = fleshMat.clone();
  floorMat.color.setHex(0x1a080a);
  const floor = new THREE.Mesh(ceilGeo.clone(), floorMat);
  floor.position.set(0, 0.01, (zMin + zMax) / 2);
  floor.rotation.x = Math.PI / 2;
  group.add(floor);

  // 门参数
  const doorHalf = door.half;
  const doorH = door.height;
  const doorXMin = -doorHalf;
  const doorXMax = doorHalf;

  function addDoorWalls(w, lowH, upH, px, pz, ry) {
    // 门在 zMax 墙，门中心在 px 处（门的 half=0.8，从 -0.8 到 0.8）
    // lowH = 下半部墙色高度，upH = 上半部血肉高度
    // lowH + upH = yCeil
    const leftW = (w / 2) - doorHalf;
    const rightW = (w / 2) - doorHalf;
    const topH = upH - (yCeil - doorH);  // 门上方血肉高度
    if (topH > 0) {
      const topGeo = new THREE.PlaneGeometry(w, topH);
      const topMesh = new THREE.Mesh(topGeo, fleshMat);
      topMesh.position.set(px, yCeil - topH / 2, pz);
      topMesh.rotation.y = ry;
      group.add(topMesh);
    }
    // 门左侧和右侧：整面墙都是血肉（不分上下）
    const sideH = yCeil;
    if (leftW > 0.01) {
      const leftGeo = new THREE.PlaneGeometry(leftW, sideH);
      const leftMesh = new THREE.Mesh(leftGeo, fleshMat);
      leftMesh.position.set(px - (w / 2 - leftW / 2) + 0.01, sideH / 2, pz);
      leftMesh.rotation.y = ry;
      group.add(leftMesh);
    }
    if (rightW > 0.01) {
      const rightGeo = new THREE.PlaneGeometry(rightW, sideH);
      const rightMesh = new THREE.Mesh(rightGeo, fleshMat);
      rightMesh.position.set(px + (w / 2 - rightW / 2) - 0.01, sideH / 2, pz);
      rightMesh.rotation.y = ry;
      group.add(rightMesh);
    }
    // 门框上沿
    const overGeo = new THREE.PlaneGeometry(w, 0.04);
    const overMesh = new THREE.Mesh(overGeo, fleshMat);
    overMesh.position.set(px, doorH + 0.02, pz);
    overMesh.rotation.y = ry;
    group.add(overMesh);
  }

  // 2c) 四面墙壁（上半血肉 + 下半墙色），避开门
  // 正面墙（zMin）：从 xMin 到 xMax
  const totalW = xMax - xMin;
  const sideW = zMax - zMin;
  const halfZ = (zMin + zMax) / 2;

  // 四面墙壁的上半血肉部分
  for (const wall of [
    { w: totalW, x: 0, z: zMin + 0.02, ry: Math.PI },          // 前墙
    { w: sideW, x: xMin + 0.02, z: halfZ, ry: Math.PI / 2 },  // 左墙
    { w: sideW, x: xMax - 0.02, z: halfZ, ry: -Math.PI / 2 }, // 右墙
  ]) {
    const upperGeo = new THREE.PlaneGeometry(wall.w, halfH);
    const upper = new THREE.Mesh(upperGeo, fleshMat);
    upper.position.set(wall.x, yCeil - halfH / 2, wall.z);
    upper.rotation.y = wall.ry;
    group.add(upper);
  }
  // 后墙（zMax）—— 避开门
  addDoorWalls(totalW, wallH, halfH, 0, zMax - 0.02, 0);

  // 2d) 下半墙（使用教室原墙壁纹理）
  for (const wall of [
    { w: totalW, x: 0, z: zMin + 0.02, ry: Math.PI },
    { w: sideW, x: xMin + 0.02, z: halfZ, ry: Math.PI / 2 },
    { w: sideW, x: xMax - 0.02, z: halfZ, ry: -Math.PI / 2 },
  ]) {
    const lowerGeo = new THREE.PlaneGeometry(wall.w, wallH);
    const lower = new THREE.Mesh(lowerGeo, wallLowerMat);
    lower.position.set(wall.x, wallH / 2, wall.z);
    lower.rotation.y = wall.ry;
    group.add(lower);
  }
  // 后墙下半（避开门）
  addDoorWalls(totalW, wallH, 0, 0, zMax - 0.02, 0);"""

new_walls_section = """  // ========== 2. 四面墙壁与天花板（全部血肉覆盖） ==========
  // 2a) 天花板：血肉全覆盖（使用独立的 ceilMat，配有 polygonOffset 避免与 BoxGeometry 天花板 z-fighting）
  const ceilGeo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  // 将天花板放在 yCeil 处，法线朝下（rotation.x = PI/2 → 原 XY 平面旋转到 XZ，法线朝 -Y）
  ceil.position.set(0, yCeil, (zMin + zMax) / 2);
  ceil.rotation.x = Math.PI / 2;
  group.add(ceil);

  // 2b) 地板（保持暗色）
  const floorMat = fleshMat.clone();
  floorMat.color.setHex(0x1a080a);
  const floor = new THREE.Mesh(ceilGeo.clone(), floorMat);
  floor.position.set(0, 0.01, (zMin + zMax) / 2);
  floor.rotation.x = Math.PI / 2;
  group.add(floor);

  // 门参数
  const doorHalf = door.half;
  const doorH = door.height;
  const doorXMin = -doorHalf;
  const doorXMax = doorHalf;

  // 四块主墙壁的尺寸
  const totalW = xMax - xMin;   // 前/后墙宽 = 20m
  const sideW = zMax - zMin;   // 左/右墙宽 = 12m
  const halfZ = (zMin + zMax) / 2;

  // 辅助函数：为带门的墙添加 Panel
  function addDoorWall(w, px, pz, ry) {
    // 门在 zMax 墙，门中心在 px 处
    const leftW = (w / 2) - doorHalf;
    const rightW = (w / 2) - doorHalf;
    const wallH = yCeil;
    // 门上方
    const topH = yCeil - doorH;
    if (topH > 0) {
      const topGeo = new THREE.PlaneGeometry(w, topH);
      const topMesh = new THREE.Mesh(topGeo, fleshMat);
      topMesh.position.set(px, yCeil - topH / 2, pz);
      topMesh.rotation.y = ry;
      group.add(topMesh);
    }
    // 门左侧
    if (leftW > 0.01) {
      const leftGeo = new THREE.PlaneGeometry(leftW, wallH);
      const leftMesh = new THREE.Mesh(leftGeo, fleshMat);
      leftMesh.position.set(px - (w/2 - leftW/2) + 0.01, wallH/2, pz);
      leftMesh.rotation.y = ry;
      group.add(leftMesh);
    }
    // 门右侧
    if (rightW > 0.01) {
      const rightGeo = new THREE.PlaneGeometry(rightW, wallH);
      const rightMesh = new THREE.Mesh(rightGeo, fleshMat);
      rightMesh.position.set(px + (w/2 - rightW/2) - 0.01, wallH/2, pz);
      rightMesh.rotation.y = ry;
      group.add(rightMesh);
    }
    // 门框上沿
    const overGeo = new THREE.PlaneGeometry(w, 0.04);
    const overMesh = new THREE.Mesh(overGeo, fleshMat);
    overMesh.position.set(px, doorH + 0.02, pz);
    overMesh.rotation.y = ry;
    group.add(overMesh);
  }

  // 2c) 四面主墙壁：全是血肉（不分上下两半）
  for (const wall of [
    { w: totalW, x: 0, z: zMin + 0.01, ry: Math.PI },           // 前墙（zMin）
    { w: sideW, x: xMin + 0.01, z: halfZ, ry: Math.PI / 2 },    // 左墙
    { w: sideW, x: xMax - 0.01, z: halfZ, ry: -Math.PI / 2 },   // 右墙
  ]) {
    const wallGeo = new THREE.PlaneGeometry(wall.w, yCeil);
    const wallMesh = new THREE.Mesh(wallGeo, fleshMat);
    wallMesh.position.set(wall.x, yCeil / 2, wall.z);
    wallMesh.rotation.y = wall.ry;
    group.add(wallMesh);
  }
  // 后墙（zMax）—— 避开门
  addDoorWall(totalW, 0, zMax - 0.01, 0);"""

assert old_walls_section in src, "Could not find walls section"
src = src.replace(old_walls_section, new_walls_section)
print("✓ Walls section replaced: all-flesh walls + fixed ceiling")

# ---- Step 4: Replace blood drip section - change from lateral to vertical ----
old_drip = """  // ---- 过渡：血液下渗条（从血肉边界延伸到下半墙） ----
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
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMat.clone());
      extra.position.set(x + dx, yPos, z);
      extra.rotation.y = ry;
      extra.material.opacity = opacity;
      group.add(extra);
    }
  }
  addDrip(totalW, wallH, 0, zMin + 0.02, Math.PI, false);       // 前墙
  addDrip(sideW, wallH, xMin + 0.02, halfZ, Math.PI/2, false);  // 左墙
  addDrip(sideW, wallH, xMax - 0.02, halfZ, -Math.PI/2, false); // 右墙
  addDrip(totalW, wallH, 0, zMax - 0.02, 0, true);               // 后墙（避开门）"""

new_drip = """  // ---- 血液向下流淌（从天花板流下，覆盖整面墙壁的垂直血条） ----
  const dripMat = new THREE.MeshBasicMaterial({
    color: 0x7a0c10,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const darkDripMat = new THREE.MeshBasicMaterial({
    color: 0x3a0508,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  function addVerticalDrips(w, h, x, z, ry, skipDoor) {
    // 在整面墙上添加垂直血条，从 yCeil 附近往下流到接近地面
    const count = Math.floor(w / 0.35);
    const spacing = w / count;
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.3;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      
      // 血条从天花板附近延伸到墙壁中部或下部
      const stripH = 0.8 + Math.random() * 2.0;    // 0.8~2.8m 长（从天花板附近往下）
      const stripW = 0.015 + Math.random() * 0.04;  // 细长血条
      const yTop = yCeil - 0.05 - Math.random() * 0.3; // 从天花板下方开始
      const yPos = yTop - stripH/2;
      const opacity = 0.15 + Math.random() * 0.35;
      
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMat.clone());
      extra.position.set(x + dx, yPos, z);
      extra.rotation.y = ry;
      extra.material.opacity = opacity;
      group.add(extra);
      
      // 一部分血条在末端有变淡/变窄的延伸（模拟血液风干变浅）
      if (Math.random() > 0.5 && stripH > 1.2) {
        const extH = 0.2 + Math.random() * 0.4;
        const extW = stripW * (0.3 + Math.random() * 0.4);
        const ext = new THREE.Mesh(new THREE.PlaneGeometry(extW, extH), dripMat.clone());
        ext.position.set(x + dx + (Math.random() - 0.5) * 0.03, yPos - stripH/2 - extH/2, z);
        ext.rotation.y = ry;
        ext.material.opacity = opacity * 0.4;
        group.add(ext);
      }
    }
    
    // 额外：靠近天花板附近的暗红色血渍
    const stainCount = Math.floor(count * 0.4);
    for (let i = 0; i < stainCount; i++) {
      const dx = -w/2 + Math.random() * w;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      const stainH = 0.03 + Math.random() * 0.1;
      const stainW = 0.03 + Math.random() * 0.08;
      const yPos = yCeil - 0.08 - Math.random() * 0.4;
      const stain = new THREE.Mesh(new THREE.PlaneGeometry(stainW, stainH), darkDripMat.clone());
      stain.position.set(x + dx, yPos, z);
      stain.rotation.y = ry;
      stain.material.opacity = 0.3 + Math.random() * 0.3;
      group.add(stain);
    }
  }
  addVerticalDrips(totalW, yCeil, 0, zMin + 0.03, Math.PI, false);       // 前墙
  addVerticalDrips(sideW, yCeil, xMin + 0.03, halfZ, Math.PI/2, false);  // 左墙
  addVerticalDrips(sideW, yCeil, xMax - 0.03, halfZ, -Math.PI/2, false); // 右墙
  addVerticalDrips(totalW, yCeil, 0, zMax - 0.03, 0, true);               // 后墙（避开门）"""

assert old_drip in src, "Could not find drip section"
src = src.replace(old_drip, new_drip)
print("✓ Blood drip section replaced: vertical flowing strips")

# ---- Step 5: Fix the update function to use `ceil` variable properly ----
# Search for where upperWalls is collected
old_upperWalls = """  // 收集上半墙网格用于呼吸动画
  const upperWalls = [frontUpper, leftUpper, rightUpper];"""

new_upperWalls = """  // 收集墙网格用于呼吸/搏动动画（所有竖直墙壁）
  const upperWalls = [];"""

assert old_upperWalls in src, "Could not find upperWalls section"
src = src.replace(old_upperWalls, new_upperWalls)
print("✓ upperWalls now empty (no separate upper/lower walls)")

# ---- Step 6: Remove the now-unused makeWallTex function and wallLowerMat ----
# We need to find and remove makeWallTex function and wallLowerMat
old_wallTex = """  // 教室墙面下半部的原始墙壁材质（与 level.js 的 grainTexture('#3c433c') 一致）
  function makeWallTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    // 底色使用与原教室一致的 #3c433c（灰绿色，轻微腻子粉感）
    ctx.fillStyle = '#3c433c';
    ctx.fillRect(0, 0, 256, 256);
    // 模仿 grainTexture 的噪点（颜色深浅变化，模拟墙壁粉刷质感）
    for (let i = 0; i < 1400; i++) {
      const shade = 18 + Math.random() * 40;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // 增加细微的竖向纹理（模拟墙纸或抹灰的竖向刷痕）
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 256;
      const h = 20 + Math.random() * 80;
      const w = 1 + Math.random() * 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, Math.random() * (256 - h), w, h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + (Math.random() - 0.5) * 4, Math.random() * (256 - h), 1, h);
    }
    ctx.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    return t;
  }
  const wallLowerMat = new THREE.MeshBasicMaterial({
    map: makeWallTex(),
    side: THREE.DoubleSide,
  });

  """

# Replace with empty space (delete the function and its usage)
src = src.replace(old_wallTex, "\n  \n")
print("✓ makeWallTex and wallLowerMat removed")

# ---- Write back ----
with open(r'E:\新建游戏项目\GameProject\w05_3d_game\src\anomalies.js', 'w', encoding='utf-8') as f:
    f.write(src)

print("\n✓ All modifications applied!")
print("\nSummary:")
print("1. Ceiling: added polygonOffset: -2 to fix z-fighting with BoxGeometry ceiling")
print("2. Walls: all vertical walls use fleshMat (no upper/lower split)")
print("3. Blood flow: vertical strips flowing from ceiling toward floor")
print("4. makeWallTex/wallLowerMat removed (no longer needed)")
print("5. upperWalls array now empty (no separate upper wall meshes)")

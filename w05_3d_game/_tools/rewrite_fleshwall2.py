"""
Rewrite createFleshWall() with:
1. Upper/lower walls with irregular overlapping transition (flesh creeping down)
2. Ceiling texture properly visible
3. More blood drip variations
4. Door avoidance preserved
"""
import re

with open(r'E:\新建游戏项目\GameProject\w05_3d_game\src\anomalies.js', 'r', encoding='utf-8') as f:
    src = f.read()

# ----- Replace the transition strips section with irregular overlap + extended drips -----
old_transition = """  // ---- 过渡：血液下渗条（从血肉边界延伸到下半墙） ----
  // 使用单独的红色材质，更鲜红醒目
  const dripMatRed = new THREE.MeshBasicMaterial({
    color: 0x8a0c10,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  function addDrip(w, h, x, z, ry, skipDoor) {
    // w=墙宽, h=墙高, x=中心x, z=中心z, ry=旋转
    // 密度更高，每隔约0.25m一条
    const count = Math.floor(w / 0.25);
    const spacing = w / count;
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.3;
      // 跳过门洞区域
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      
      // 随机选择一条血条的类型
      const type = Math.random();
      
      if (type < 0.5) {
        // 细长血条（垂直流淌）
        const stripH = 0.15 + Math.random() * 0.6;
        const stripW = 0.015 + Math.random() * 0.035;
        const yBase = wallH;
        // 从连接处稍微上方开始，向下延伸
        const yPos = yBase + stripH/2 - 0.04;
        const opacity = 0.3 + Math.random() * 0.4;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = opacity;
        group.add(extra);
      } else if (type < 0.8) {
        // 较粗的血迹斑（宽短，像血液聚集）
        const stripH = 0.06 + Math.random() * 0.2;
        const stripW = 0.03 + Math.random() * 0.08;
        const yBase = wallH;
        const yPos = yBase + stripH/2 - 0.02 + Math.random() * 0.1;
        const opacity = 0.4 + Math.random() * 0.35;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = opacity;
        group.add(extra);
      } else {
        // 深色凝固血迹（暗红，紧贴边界）
        const stripH = 0.02 + Math.random() * 0.06;
        const stripW = 0.04 + Math.random() * 0.12;
        const yPos = wallH + stripH/2 - 0.005;
        const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
        extra.position.set(x + dx, yPos, z);
        extra.rotation.y = ry;
        extra.material.opacity = 0.5 + Math.random() * 0.3;
        extra.material.color.setHex(0x5a0608);
        group.add(extra);
      }
    }
    
    // 额外：增加一些斜向血迹（模拟溅射或流淌时的偏移）
    const slantCount = Math.floor(count * 0.15);
    for (let i = 0; i < slantCount; i++) {
      const dx = -w/2 + Math.random() * w;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      const stripH = 0.1 + Math.random() * 0.3;
      const stripW = 0.01 + Math.random() * 0.025;
      const yBase = wallH;
      const yPos = yBase - 0.02 + stripH/2;
      const slant = (Math.random() - 0.5) * 0.4; // 倾斜角
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW * 0.7, stripH * 0.8), dripMatRed.clone());
      extra.position.set(x + dx + slant * 0.08, yPos, z);
      extra.rotation.y = ry;
      extra.rotation.z = slant;
      extra.material.opacity = 0.3 + Math.random() * 0.25;
      group.add(extra);
    }
  }
  addDrip(totalW, wallH, 0, zMin + 0.02, Math.PI, false);       // 前墙
  addDrip(sideW, wallH, xMin + 0.02, halfZ, Math.PI/2, false);  // 左墙
  addDrip(sideW, wallH, xMax - 0.02, halfZ, -Math.PI/2, false); // 右墙
  addDrip(totalW, wallH, 0, zMax - 0.02, 0, true);               // 后墙（避开门）"""

new_transition = """  // ---- 过渡：血肉向下蔓延的不规则覆盖片 + 血液下渗条 ----
  // 使用 fleshMat 的半透明版本做过渡片（血肉模糊地延伸到下半墙）
  const overlapMat = fleshMat.clone();
  overlapMat.transparent = true;
  overlapMat.opacity = 0.0; // 初始，每个片单独设置
  // 单独的深红色血滴材质
  const dripMatRed = new THREE.MeshBasicMaterial({
    color: 0x8a0c10,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  // ---- A) 不规则血肉蔓延覆盖片（flesh creeps down into wall area, irregular shapes） ----
  function addOverlapStrip(w, h, x, z, ry, skipDoor) {
    const spacing = 0.35 + Math.random() * 0.15;
    const count = Math.floor(w / spacing);
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.4;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      // 每个覆盖片：宽从 0.15 到 0.5，高度从 0.08 到 0.35（向下突出到下半墙）
      const stripW = 0.12 + Math.random() * 0.35;
      const stripH = 0.1 + Math.random() * 0.35;
      const yBase = wallH;
      const yPos = yBase + stripH/2 + (Math.random() - 0.3) * 0.1;
      const opacity = 0.35 + Math.random() * 0.4;
      const overlap = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), overlapMat.clone());
      overlap.position.set(x + dx, yPos, z);
      overlap.rotation.y = ry;
      overlap.material.opacity = opacity;
      group.add(overlap);
    }
  }
  addOverlapStrip(totalW, wallH, 0, zMin + 0.03, Math.PI, false);       // 前墙
  addOverlapStrip(sideW, wallH, xMin + 0.03, halfZ, Math.PI/2, false);  // 左墙
  addOverlapStrip(sideW, wallH, xMax - 0.03, halfZ, -Math.PI/2, false); // 右墙
  addOverlapStrip(totalW, wallH, 0, zMax - 0.03, 0, true);               // 后墙（避开门）
  
  // ---- B) 长条血液流淌（从血肉边界向下流淌到下半墙壁） ----
  function addDrip(w, h, x, z, ry, skipDoor) {
    const count = Math.floor(w / 0.3);
    const spacing = w / count;
    for (let i = 0; i < count; i++) {
      const dx = -w/2 + (i + 0.5) * spacing + (Math.random() - 0.5) * spacing * 0.25;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      
      const stripH = 0.3 + Math.random() * 0.8;
      const stripW = 0.012 + Math.random() * 0.04;
      const yBase = wallH;
      const yPos = yBase + stripH/2 - 0.05;
      const opacity = 0.3 + Math.random() * 0.4;
      
      // 主血条：垂直流淌
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(stripW, stripH), dripMatRed.clone());
      extra.position.set(x + dx, yPos, z);
      extra.rotation.y = ry;
      extra.material.opacity = opacity;
      group.add(extra);
      
      // 有时加个分支血条（斜向流淌）
      if (Math.random() > 0.6) {
        const branchH = stripH * (0.3 + Math.random() * 0.4);
        const branchAngle = (Math.random() - 0.5) * 0.6;
        const branch = new THREE.Mesh(new THREE.PlaneGeometry(stripW * 0.6, branchH), dripMatRed.clone());
        branch.position.set(x + dx + Math.sin(branchAngle) * branchH * 0.2, yBase + branchH/2, z);
        branch.rotation.y = ry;
        branch.rotation.z = branchAngle;
        branch.material.opacity = opacity * 0.7;
        group.add(branch);
      }
    }
    
    // 额外少量：宽血迹斑（在交界线附近）
    const extraCount = Math.floor(count * 0.3);
    for (let i = 0; i < extraCount; i++) {
      const dx = -w/2 + Math.random() * w;
      if (skipDoor && Math.abs(dx) < LAYOUT.door.half) continue;
      const hh = 0.05 + Math.random() * 0.15;
      const ww = 0.04 + Math.random() * 0.1;
      const yPos = wallH + hh/2 + (Math.random() - 0.5) * 0.08;
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), dripMatRed.clone());
      blob.position.set(x + dx, yPos, z);
      blob.rotation.y = ry;
      blob.material.opacity = 0.3 + Math.random() * 0.3;
      blob.material.color.setHex(0x6a080e);
      group.add(blob);
    }
  }
  addDrip(totalW, wallH, 0, zMin + 0.03, Math.PI, false);       // 前墙
  addDrip(sideW, wallH, xMin + 0.03, halfZ, Math.PI/2, false);  // 左墙
  addDrip(sideW, wallH, xMax - 0.03, halfZ, -Math.PI/2, false); // 右墙
  addDrip(totalW, wallH, 0, zMax - 0.03, 0, true);               // 后墙（避开门）"""

assert old_transition in src, "Could not find transition strip block"
src = src.replace(old_transition, new_transition)
print("✓ Transition replaced with overlap strips + blood drip lines")

# ----- Write back -----
with open(r'E:\新建游戏项目\GameProject\w05_3d_game\src\anomalies.js', 'w', encoding='utf-8') as f:
    f.write(src)

print("\n✓ All modifications applied!")
print("\nChanges:")
print("1. Added irregular flesh overlap strips that creep down into lower wall area (fleshMat semi-transparent)")
print("2. Enhanced blood drip lines: longer (0.3-0.8), branching, more variety")
print("3. Kept door avoidance for back wall")
print("4. Ceiling texture remains unchanged (ceilMat with separate repeat)")

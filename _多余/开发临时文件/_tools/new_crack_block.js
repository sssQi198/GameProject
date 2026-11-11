  // ---- L 形裂缝本体 + 触手封边（重写版） --------------------------------
  // 上一版有三个硬伤，这里逐条解决：
  //  1) 裂缝看不见：旧的多边形裂缝与前墙共面（都在 zMin+0.01），被墙挡住或闪面。
  //     现在裂缝条带放在墙面前方 7cm，天花板那条放在天花板下方 7cm，一定在遮盖面之前。
  //  2) 蓝绿偏色：所有颜色只动红通道，G/B 恒 <= 8；并关掉雾（fog:false），
  //     避免暗红被雾色 0x07080c 洗成灰蓝。
  //  3) 边缘太规整：裂缝外圈做成暗血红"翻肉"，再由触手从边缘向外生长盖住边界，
  //     没有一条清晰的轮廓线。
  (function addCrackAndTentacles() {
    const RNG = seeded(20251102);

    // ---- 几何锚点 -------------------------------------------------------
    const WALL_FACE_Z = zMin + 0.01;       // 前墙血肉面所在 z
    const CEIL_FACE_Y = yCeil - 0.04;      // 天花板血肉面所在 y
    const CRACK_Z = WALL_FACE_Z + 0.07;    // 裂缝贴在前墙前方（相机在 +z 一侧）
    const CRACK_Y = CEIL_FACE_Y - 0.07;    // 裂缝贴在天花板下方（相机在下方）

    // ---- 颜色工具：只动红通道，杜绝蓝绿 --------------------------------
    function fleshHex(rMin, rMax) {
      const r = rMin + Math.floor(RNG() * Math.max(1, rMax - rMin));
      const gb = Math.floor(RNG() * 9);    // 0~8，肉眼分辨不出，但保住"血肉"层次
      return (Math.min(255, r) << 16) | (gb << 8) | gb;
    }
    function flatMat(hex) {
      return new THREE.MeshBasicMaterial({
        color: hex,
        side: THREE.DoubleSide,
        fog: false,          // 关键：不让雾把暗红洗成灰蓝
        depthWrite: true,    // 不透明，不需要排序，杜绝半透明混合异常
      });
    }

    // ---- 条带几何：两条等长边界线之间逐段拼四边形 ----------------------
    // 不用扇形三角化，任意不规则形状都不会自交出错。
    function ribbonGeometry(left, right) {
      const pos = [];
      const idx = [];
      const n = Math.min(left.length, right.length);
      for (let i = 0; i < n; i++) {
        pos.push(left[i][0], left[i][1], left[i][2]);
        pos.push(right[i][0], right[i][1], right[i][2]);
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      return geo;
    }

    // 把条带按半宽系数放大，并朝相机方向微移，避免共面闪面
    function addBand(left, right, grow, offZ, offY, mat) {
      const l = [];
      const r = [];
      for (let i = 0; i < left.length; i++) {
        const cx = (left[i][0] + right[i][0]) / 2;
        l.push([cx + (left[i][0] - cx) * grow, left[i][1] + offY, left[i][2] + offZ]);
        r.push([cx + (right[i][0] - cx) * grow, right[i][1] + offY, right[i][2] + offZ]);
      }
      group.add(new THREE.Mesh(ribbonGeometry(l, r), mat));
    }

    // ---- 前墙那条臂：竖直向上，顶到天花板转角 --------------------------
    const wallSteps = 18;
    const wallY0 = 1.10;
    const wallY1 = CEIL_FACE_Y - 0.03;             // 停在天花板下方，不被天花板盖住
    const wallLeftEdge = [];
    const wallRightEdge = [];
    for (let i = 0; i <= wallSteps; i += 1) {
      const t = i / wallSteps;
      const y = wallY0 + (wallY1 - wallY0) * t;
      // 中心线轻微左右游走，避免一条直线
      const cx = Math.sin(t * 5.1 + 1.1) * 0.14 + (RNG() - 0.5) * 0.08;
      // 半宽：两端收窄、中段最宽
      const taper = Math.sin(Math.pow(t, 0.75) * Math.PI) * 0.85 + 0.15;
      const halfW = (0.055 + 0.075 * taper) * (1 + (RNG() - 0.5) * 0.4);
      wallLeftEdge.push([cx - halfW, y, CRACK_Z]);
      wallRightEdge.push([cx + halfW, y, CRACK_Z]);
    }

    // ---- 天花板那条臂：从转角往教室内延伸 ------------------------------
    const ceilSteps = 16;
    const ceilZ0 = WALL_FACE_Z + 0.05;
    const ceilZ1 = WALL_FACE_Z + 2.10;
    const ceilLeftEdge = [];
    const ceilRightEdge = [];
    for (let i = 0; i <= ceilSteps; i += 1) {
      const t = i / ceilSteps;
      const z = ceilZ0 + (ceilZ1 - ceilZ0) * t;
      const cx = Math.sin(t * 4.3 + 0.4) * 0.13 + (RNG() - 0.5) * 0.08;
      const taper = Math.sin(Math.pow(t, 0.8) * Math.PI) * 0.8 + 0.2;
      const halfW = (0.05 + 0.07 * taper) * (1 + (RNG() - 0.5) * 0.4);
      ceilLeftEdge.push([cx - halfW, CRACK_Y, z]);
      ceilRightEdge.push([cx + halfW, CRACK_Y, z]);
    }

    // ---- 裂缝本体：三层条带，越靠中心越黑 ------------------------------
    // 外圈是血泡翻边，中圈深红，内核近黑，看上去就是被撕开的口子。
    const matMargin = flatMat(0x3c0709);
    const matBody = flatMat(0x140102);
    const matCore = flatMat(0x020000);
    // 前墙臂（朝相机 = +z）
    addBand(wallLeftEdge, wallRightEdge, 1.85, 0.000, 0, matMargin);
    addBand(wallLeftEdge, wallRightEdge, 1.05, 0.014, 0, matBody);
    addBand(wallLeftEdge, wallRightEdge, 0.42, 0.028, 0, matCore);
    // 天花板臂（朝相机 = -y）
    addBand(ceilLeftEdge, ceilRightEdge, 1.85, 0, -0.000, matMargin);
    addBand(ceilLeftEdge, ceilRightEdge, 1.05, 0, -0.014, matBody);
    addBand(ceilLeftEdge, ceilRightEdge, 0.42, 0, -0.028, matCore);

    // ---- 触手：从裂缝边缘向外生长，把边界盖住 --------------------------
    function growTentacle(start, dir, len, radius, mat) {
      const pts = [new THREE.Vector3(start[0], start[1], start[2])];
      const segs = 3 + Math.floor(RNG() * 3);      // 3~5 段
      let px = start[0];
      let py = start[1];
      let pz = start[2];
      let dx = dir[0];
      let dy = dir[1];
      let dz = dir[2];
      for (let s = 1; s <= segs; s += 1) {
        dx += (RNG() - 0.5) * 0.85;
        dy += (RNG() - 0.5) * 0.60;
        dz += (RNG() - 0.5) * 0.45 + 0.20;         // 略微朝教室内立起来
        const m = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const step = len / segs;
        px += (dx / m) * step;
        py += (dy / m) * step;
        pz += (dz / m) * step;
        // 夹紧在房间内，避免钻到墙里或穿出天花板
        px = Math.min(xMax - 0.25, Math.max(xMin + 0.25, px));
        py = Math.min(CEIL_FACE_Y - 0.005, Math.max(0.05, py));
        pz = Math.max(WALL_FACE_Z + 0.02, pz);
        pts.push(new THREE.Vector3(px, py, pz));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 5, radius, 4, false);
      group.add(new THREE.Mesh(geo, mat));
    }

    // 材质池：复用，避免每根触手一个材质
    const tentMats = [];
    for (let i = 0; i < 6; i += 1) tentMats.push(flatMat(fleshHex(0x2a, 0x58)));
    const pickTentMat = () => tentMats[Math.floor(RNG() * tentMats.length)];

    // 前墙臂：左右两侧各撒一批
    for (let i = 1; i < wallSteps; i += 1) {
      if (RNG() < 0.72) {
        growTentacle(
          wallLeftEdge[i], [-1, (RNG() - 0.5) * 0.9, 0.45],
          0.09 + RNG() * 0.24, 0.006 + RNG() * 0.012, pickTentMat(),
        );
      }
      if (RNG() < 0.72) {
        growTentacle(
          wallRightEdge[i], [1, (RNG() - 0.5) * 0.9, 0.45],
          0.09 + RNG() * 0.24, 0.006 + RNG() * 0.012, pickTentMat(),
        );
      }
    }
    // 天花板臂：两侧各撒一批（朝下生长，别穿进天花板）
    for (let i = 1; i < ceilSteps; i += 1) {
      if (RNG() < 0.62) {
        growTentacle(
          ceilLeftEdge[i], [-1, -0.55, 0.25],
          0.07 + RNG() * 0.20, 0.005 + RNG() * 0.010, pickTentMat(),
        );
      }
      if (RNG() < 0.62) {
        growTentacle(
          ceilRightEdge[i], [1, -0.55, 0.25],
          0.07 + RNG() * 0.20, 0.005 + RNG() * 0.010, pickTentMat(),
        );
      }
    }
    // 转角处补几根，把两条臂接缝盖住
    for (let i = 0; i < 5; i += 1) {
      growTentacle(
        [(RNG() - 0.5) * 0.24, CRACK_Y + (RNG() - 0.5) * 0.05, CRACK_Z - 0.01],
        [0, (RNG() - 0.5) * 1.1, 0.55],
        0.10 + RNG() * 0.18, 0.006 + RNG() * 0.010, pickTentMat(),
      );
    }

    // ---- 沿边缘的肉芽：小、贴边，不散布到整面墙 ------------------------
    const bumpMat = flatMat(0x2e0405);
    for (let i = 0; i < 14; i += 1) {
      let bx;
      let by;
      let bz;
      if (i % 3 !== 0) {
        const k = 1 + Math.floor(RNG() * (wallSteps - 1));
        const side = RNG() > 0.5 ? wallLeftEdge[k] : wallRightEdge[k];
        bx = side[0] + (RNG() - 0.5) * 0.04;
        by = side[1];
        bz = CRACK_Z + 0.02;
      } else {
        const k = 1 + Math.floor(RNG() * (ceilSteps - 1));
        const side = RNG() > 0.5 ? ceilLeftEdge[k] : ceilRightEdge[k];
        bx = side[0] + (RNG() - 0.5) * 0.04;
        by = CRACK_Y - 0.015;
        bz = side[2];
      }
      const rad = 0.010 + RNG() * 0.018;
      const bump = new THREE.Mesh(new THREE.SphereGeometry(rad, 7, 5), bumpMat);
      bump.position.set(bx, by, bz);
      group.add(bump);
    }

    tagAnomaly(group, 5, 'flesh-crack');
  })();

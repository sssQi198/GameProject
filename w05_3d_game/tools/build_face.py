"""第五关的黑色巨脸（docs/model_prompts.md「## 第五关 · 黑色巨脸」）。

规格（照提示词逐条落）：
  · 一张巨大、压扁的人脸，宽 1.15 m、高 1.70 m、总厚 0.040 m，竖直站立；
  · 近黑的炭色，只在眉弓 / 鼻梁 / 颧骨 / 下颌上略亮一点，结构"勉强能读"；
  · 没有眼睛、没有眼窝、没有牙齿、没有耳朵、没有头发；
  · 哑光、无高光；单网格、< 4000 三角。

坐标（沿用本项目的资产约定）：
  · 局部原点在脸的包围盒中心；Blender 里正面朝 -Y，导出 glTF（Y-up）后正面朝 +Z，
    正好对上第 5 关前墙裂缝（anomalies.js 的 CRACK_Z 一侧）；
  · 厚度方向 y ∈ [-0.0195, +0.0205]，最前面（鼻尖）不越过 -0.0195。

颜色：
  · 材质底色 #0d0809（线性空间写进 Base Color）；
  · 顶点色是 0.30 … 1.00 的乘数，乘出来正好落在规划书说的
    0x030202 … 0x0d0809 这几级近黑里；顶面 / 迎光面略亮，下颌下沿最黑。
    这样不靠灯光也能读出眉弓和鼻子，但整体仍像一块黑。
  · glTF 里 baseColorFactor × COLOR_0 就是这个结果；顶点色丢了也只是一张更黑的脸。

用法：
  Blender 里 exec(open(r'...\\tools\\build_face.py').read())
  或 blender -b --factory-startup -P tools/build_face.py
输出 assets/models/face_v01.glb（glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco）。
"""
import bisect
import json
import math
import pathlib
import struct

import bpy

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\face_v01.glb'
COLL_NAME = 'GiantFace'
ROOT_NAME = 'GiantFace'
MESH_NAME = 'GiantFace_Mesh'

FACE_W = 1.15          # 宽（x）
FACE_H = 1.70          # 高（z）
FACE_D = 0.040         # 总厚（y）：最前 -0.0195，最后 +0.0205
FRONT_Y = -0.0195
BACK_Y = FRONT_Y + FACE_D

NX = 30                # 横向分段：31 列
NR = 54                # 纵向分段：55 行
FRONT_SKEW = 1.35      # 列参数 |s|^k：>1 时中间（鼻梁）密、两侧稀

CHARCOAL = '#0d0809'   # 材质底色，sRGB
MIN_SHADE = 0.30       # 顶点色乘数下限（= 颜色 #040303 左右）


# --------------------------------------------------------------------------
# 数值工具
# --------------------------------------------------------------------------
def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def smoothstep(a, b, x):
    if a == b:
        return 0.0 if x < a else 1.0
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def make_pchip(pts):
    """单调三次插值（Fritsch–Carlson）。pts 按 x 递增。"""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0] = d[0]
    m[-1] = d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0.0:
            m[i] = 0.0
        else:
            w1 = 2.0 * h[i] + h[i - 1]
            w2 = h[i] + 2.0 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        k = bisect.bisect_right(xs, x) - 1
        k = min(k, n - 2)
        t = (x - xs[k]) / h[k]
        t2 = t * t
        t3 = t2 * t
        h00 = 2.0 * t3 - 3.0 * t2 + 1.0
        h10 = t3 - 2.0 * t2 + t
        h01 = -2.0 * t3 + 3.0 * t2
        h11 = t3 - t2
        return h00 * ys[k] + h10 * h[k] * m[k] + h01 * ys[k + 1] + h11 * h[k] * m[k + 1]

    return f


def dist_to_segment(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az
    wx, wz = px - ax, pz - az
    L2 = vx * vx + vz * vz
    t = 0.0 if L2 == 0.0 else clamp((wx * vx + wz * vz) / L2, 0.0, 1.0)
    dx, dz = wx - t * vx, wz - t * vz
    return math.hypot(dx, dz)


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _rgb(hexstr):
    h = hexstr.lstrip('#')
    return (_srgb_to_linear(int(h[0:2], 16)),
            _srgb_to_linear(int(h[2:4], 16)),
            _srgb_to_linear(int(h[4:6], 16)))


# --------------------------------------------------------------------------
# 轮廓：宽度随高度变化（颅顶收 → 太阳穴 → 颧骨最宽 → 下颌角 → 下巴收圆）
# --------------------------------------------------------------------------
WIDTH = make_pchip([
    (-0.850, 0.108), (-0.835, 0.183), (-0.800, 0.265), (-0.750, 0.333),
    (-0.680, 0.396), (-0.600, 0.447), (-0.520, 0.487), (-0.440, 0.518),
    (-0.360, 0.542), (-0.280, 0.556), (-0.180, 0.566), (-0.080, 0.572),
    (0.020, 0.575), (0.120, 0.575), (0.230, 0.570), (0.330, 0.562),
    (0.420, 0.549), (0.500, 0.530), (0.570, 0.505), (0.640, 0.462),
    (0.700, 0.400), (0.750, 0.330), (0.790, 0.255), (0.820, 0.180),
    (0.840, 0.105), (0.850, 0.040),
])

# 行的疏密：眉弓到鼻尖加密（2 cm 一行），颅顶和下颌稀一点
SPACING = make_pchip([
    (-0.850, 0.030), (-0.650, 0.034), (-0.450, 0.034), (-0.250, 0.026),
    (-0.080, 0.021), (0.050, 0.021), (0.150, 0.028), (0.450, 0.048),
    (0.850, 0.055),
])

# 鼻子：中轴高度与半宽。脸宽 1.15 m，五官按脸的比例放大：
# 鼻宽约 0.17 m（真人鼻宽 / 脸宽 ≈ 0.27，这里收一点，不然太漫画）。
NOSE_AMP = make_pchip([
    (-0.276, 0.000), (-0.252, 0.010), (-0.220, 0.023), (-0.190, 0.027),
    (-0.150, 0.027), (-0.105, 0.024), (-0.055, 0.021), (0.000, 0.017),
    (0.060, 0.012), (0.110, 0.005), (0.150, 0.000),
])
NOSE_SIG = make_pchip([
    (-0.276, 0.048), (-0.252, 0.068), (-0.190, 0.086), (-0.105, 0.062),
    (0.000, 0.044), (0.060, 0.034), (0.110, 0.027), (0.150, 0.023),
])


# --------------------------------------------------------------------------
# 起伏：d = 往前凸多少（米）。同时返回"特征强度"给顶点色用
# --------------------------------------------------------------------------
def relief(x, z):
    d = 0.0
    feat = 0.0
    ax = abs(x)

    # 面具底：整张脸只有很浅的弧度（压扁的脸）
    d += 0.0045 * math.exp(-((x / 0.43) ** 2 + ((z - 0.02) / 0.58) ** 2))
    # 两侧往后收：正面变窄，结构才不会糊成一团
    d -= 0.0075 * smoothstep(0.44, 0.575, ax)
    # 颅顶和下巴往回包一点，侧影不至于像一块切平的板
    d -= 0.0060 * smoothstep(0.70, 0.85, z)
    d -= 0.0050 * smoothstep(-0.74, -0.85, z)

    # ---- 鼻子：鼻根 → 鼻梁 → 鼻尖 → 鼻底 ----
    amp = NOSE_AMP(z)
    sig = max(NOSE_SIG(z), 1e-4)
    nose = amp * math.exp(-(ax / sig) ** 3.2)
    d += nose
    feat = max(feat, min(1.0, nose / 0.024))
    # 鼻翼 + 鼻翼外侧的浅沟
    for sx in (-1.0, 1.0):
        ala = 0.0095 * math.exp(-(((x - sx * 0.078) / 0.044) ** 2
                                  + ((z + 0.204) / 0.038) ** 2))
        d += ala
        feat = max(feat, min(1.0, ala / 0.008))
        d -= 0.0032 * math.exp(-(((x - sx * 0.124) / 0.026) ** 2
                                 + ((z + 0.224) / 0.028) ** 2))
    # 鼻底的那条横阴影：让鼻子从脸上"断"开
    d -= 0.0045 * math.exp(-(x / 0.130) ** 2) * math.exp(-((z + 0.248) / 0.021) ** 2)
    # 鼻梁两侧的浅沟：把鼻子的侧面和脸分开
    for sx in (-1.0, 1.0):
        dist = dist_to_segment(x, z, sx * 0.118, -0.212, sx * 0.072, -0.010)
        d -= 0.0040 * math.exp(-(dist / 0.028) ** 2)
    # 法令纹：鼻翼到嘴角
    for sx in (-1.0, 1.0):
        dist = dist_to_segment(x, z, sx * 0.118, -0.238, sx * 0.168, -0.452)
        d -= 0.0048 * math.exp(-(dist / 0.032) ** 2)

    # ---- 眉弓：两条带弧度的眉棱，中间给鼻根让位；下沿压一道浅沟 ----
    brow_x = (math.exp(-((ax - 0.215) / 0.240) ** 2)
              * (1.0 - 0.80 * math.exp(-(x / 0.058) ** 2)))
    brow_z = 0.078 + 0.022 * min(1.0, ax / 0.42)
    brow = 0.0150 * brow_x * math.exp(-((z - brow_z) / 0.038) ** 2)
    d += brow
    feat = max(feat, min(1.0, brow / 0.013))
    d -= 0.0080 * math.exp(-((z - (brow_z - 0.058)) / 0.022) ** 2) \
        * math.exp(-((ax - 0.235) / 0.260) ** 2)
    # 眉间的鼻根小丘
    d += 0.0045 * math.exp(-((x / 0.055) ** 2 + ((z - 0.112) / 0.055) ** 2))

    # ---- 颧骨：一块有正面的骨头，下面压一条颧弓下沟 ----
    for sx in (-1.0, 1.0):
        cheek = 0.0155 * math.exp(-((abs(x - sx * 0.355) / 0.170) ** 3.0
                                    + (abs(z + 0.015) / 0.100) ** 3.0))
        d += cheek
        feat = max(feat, min(1.0, cheek / 0.014))
        dist = dist_to_segment(x, z, sx * 0.400, -0.130, sx * 0.250, -0.260)
        d -= 0.0070 * math.exp(-(dist / 0.022) ** 2)
        d -= 0.0055 * math.exp(-(((x - sx * 0.395) / 0.115) ** 2
                                 + ((z + 0.320) / 0.110) ** 2))

    # ---- 下颌：下颌角 → 下颌体 → 下巴，两段折线连起来 ----
    for sx in (-1.0, 1.0):
        d1 = dist_to_segment(x, z, sx * 0.465, -0.300, sx * 0.300, -0.520)
        d2 = dist_to_segment(x, z, sx * 0.300, -0.520, sx * 0.100, -0.762)
        jaw = 0.0130 * max(math.exp(-(d1 / 0.038) ** 2), math.exp(-(d2 / 0.038) ** 2))
        d += jaw
        feat = max(feat, min(1.0, jaw / 0.011))
    # 下巴
    chin = 0.0140 * math.exp(-((abs(x) / 0.160) ** 2
                               + ((z + 0.758) / 0.062) ** 2))
    d += chin
    feat = max(feat, min(1.0, chin / 0.012))

    # ---- 嘴：一条微垂的缝、上下薄唇、两个嘴角 ----
    zm = -0.455 - 0.012 * (x / 0.185) ** 2
    d -= 0.0080 * math.exp(-(x / 0.155) ** 2) * math.exp(-((z - zm) / 0.019) ** 2)
    d += 0.0060 * math.exp(-(x / 0.160) ** 2) * math.exp(-((z - (zm + 0.036)) / 0.019) ** 2)
    d += 0.0070 * math.exp(-(x / 0.166) ** 2) * math.exp(-((z - (zm - 0.040)) / 0.021) ** 2)
    for sx in (-1.0, 1.0):
        d -= 0.0060 * math.exp(-(((x - sx * 0.188) / 0.030) ** 2
                                 + ((z - (zm - 0.004)) / 0.028) ** 2))
    d -= 0.0036 * math.exp(-(x / 0.150) ** 2) * math.exp(-((z + 0.540) / 0.018) ** 2)
    # 人中
    d -= 0.0028 * math.exp(-((x / 0.024) ** 2 + ((z + 0.405) / 0.040) ** 2))

    # ---- 太阳穴略凹 ----
    for sx in (-1.0, 1.0):
        d -= 0.0060 * math.exp(-(((x - sx * 0.462) / 0.108) ** 2
                                 + ((z - 0.300) / 0.160) ** 2))

    return d, clamp(feat, 0.0, 1.0)


def build_geometry():
    """返回 (front_xy, rows_z, cols_x)。front_xy[i][j] = (x, z, d, feat, y)。"""
    zmin, zmax = -FACE_H / 2.0, FACE_H / 2.0

    # ---- 行：按 1 / spacing 的密度积分，取 49 个等密度点 ----
    M = 2000
    zs_line = [zmin + (zmax - zmin) * i / M for i in range(M + 1)]
    cum = [0.0]
    for i in range(1, M + 1):
        dz = (zmax - zmin) / M
        cum.append(cum[-1] + dz * 0.5 * (1.0 / SPACING(zs_line[i - 1])
                                          + 1.0 / SPACING(zs_line[i])))
    total = cum[-1]
    rows = []
    for i in range(NR + 1):
        target = total * i / NR
        k = min(bisect.bisect_left(cum, target), M)
        if k == 0:
            rows.append(zmin)
            continue
        lo, hi = cum[k - 1], cum[k]
        f = 0.0 if hi == lo else (target - lo) / (hi - lo)
        rows.append(zs_line[k - 1] + (zs_line[k] - zs_line[k - 1]) * f)
    rows[0], rows[-1] = zmin, zmax

    # ---- 每行的半宽与每一列实际的 x ----
    grid = []
    for z in rows:
        w = WIDTH(z)   # 表里已经是绝对半宽（最宽 0.575 = FACE_W / 2）
        row = []
        for j in range(NX + 1):
            s = -1.0 + 2.0 * j / NX
            u = math.copysign(abs(s) ** FRONT_SKEW, s)
            x = u * w
            d, feat = relief(x, z)
            row.append((x, z, d, feat))
        grid.append(row)

    dmax = max(v[2] for row in grid for v in row)
    dmin = min(v[2] for row in grid for v in row)
    # 把整段起伏线性压进 4 cm：最前面 = FRONT_Y，轮廓边留 4 mm 的侧壁厚度。
    # （负的凹面只出现在太阳穴和轮廓边缘，放大后会顶穿背板，所以统一缩一次。）
    scale = (FACE_D - 0.004) / max(dmax - dmin, 1e-6)
    front = [[(x, z, d, feat, FRONT_Y + (dmax - d) * scale) for (x, z, d, feat) in row]
             for row in grid]
    print('  relief d=[%.4f, %.4f] span=%.4f -> scaled x%.3f' % (dmin, dmax, dmax - dmin, scale))
    return front, rows, dmax * scale


def boundary_loop(nr, nx):
    loop = []
    for i in range(nr + 1):
        loop.append((i, 0))
    for j in range(1, nx + 1):
        loop.append((nr, j))
    for i in range(nr - 1, -1, -1):
        loop.append((i, nx))
    for j in range(nx - 1, 0, -1):
        loop.append((0, j))
    return loop


def make_material():
    mat = bpy.data.materials.get('Face_Charcoal')
    if mat is None:
        mat = bpy.data.materials.new('Face_Charcoal')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    color = _rgb(CHARCOAL)
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    # 顶点色只做乘数：glTF 导出成 baseColorFactor(=CHARCOAL) × COLOR_0。
    vc = nt.nodes.get('FaceVertexColor')
    if vc is None:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.name = 'FaceVertexColor'
    vc.layer_name = 'Col'
    mix = nt.nodes.get('FaceBaseMix')
    if mix is None:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.name = 'FaceBaseMix'
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*color, 1.0)
    nt.links.new(vc.outputs['Color'], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    mat.use_backface_culling = True
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = 1.0
    mat.metallic = 0.0
    return mat


def clear_collection(coll):
    for ob in list(coll.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def build():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    clear_collection(coll)

    front, _rows, dmax = build_geometry()
    loop = boundary_loop(NR, NX)

    verts = []
    idx = {}
    for i in range(NR + 1):
        for j in range(NX + 1):
            x, z, d, feat, y = front[i][j]
            idx[(i, j)] = len(verts)
            verts.append((x, y, z))

    back_idx = []
    for (i, j) in loop:
        x, z = front[i][j][0], front[i][j][1]
        back_idx.append(len(verts))
        verts.append((x, BACK_Y, z))

    center = len(verts)
    verts.append((0.0, BACK_Y, 0.0))

    faces = []
    n_front = NR * NX
    for i in range(NR):
        for j in range(NX):
            faces.append((idx[(i, j)], idx[(i, j + 1)],
                          idx[(i + 1, j + 1)], idx[(i + 1, j)]))
    for k in range(len(loop)):
        a, b = idx[loop[k]], idx[loop[(k + 1) % len(loop)]]
        faces.append((a, b, back_idx[(k + 1) % len(loop)], back_idx[k]))
    for k in range(len(loop)):
        faces.append((center, back_idx[k], back_idx[(k + 1) % len(loop)]))

    me = bpy.data.meshes.new('GiantFace')
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    me.update()

    # 统一朝外
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    vnorm = [tuple(v.normal) for v in bm.verts]
    bm.to_mesh(me)
    bm.free()
    me.update()

    # 前面平滑、侧壁与背面平直
    for p in me.polygons:
        p.use_smooth = p.index < n_front

    # ---- 顶点色：近黑里的几级明暗 ----
    # 高度（上亮下黑）+ 迎光法线 + 五官 + 空腔（凹处更黑）。
    # 这些全部烘进顶点色，游戏里没有灯也读得出眉弓和鼻梁。
    def _d(px, pz):
        return relief(px, pz)[0]

    def cavity(px, pz, h=0.015):
        d0 = _d(px, pz)
        lap = ((_d(px + h, pz) + _d(px - h, pz) - 2.0 * d0)
               + (_d(px, pz + h) + _d(px, pz - h) - 2.0 * d0)) / (h * h)
        return clamp(lap / 30.0, -1.0, 1.0)

    col = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    for i in range(len(verts)):
        k = MIN_SHADE
        if i < (NR + 1) * (NX + 1):
            x, z, d, feat, y = front[i // (NX + 1)][i % (NX + 1)]
            h = clamp((z + FACE_H / 2.0) / FACE_H, 0.0, 1.0)
            nx, ny, nz = vnorm[i]
            up = max(0.0, nz)
            front_face = max(0.0, -ny)
            cav = cavity(x, z)
            t = (0.48 * h + 0.20 * up + 0.12 * feat + 0.05 * front_face
                 - 0.15 * max(0.0, cav) + 0.08 * max(0.0, -cav))
            k = MIN_SHADE + (1.0 - MIN_SHADE) * clamp(t, 0.0, 1.0)
        col.data[i].color = (k, k, k, 1.0)
    me.color_attributes.active_color = col

    # ---- UV：正投影，[0,1]²，留给以后贴图 ----
    uv = me.uv_layers.new(name='UVMap')
    for li, lp in enumerate(me.loops):
        vx, vy, vz = verts[lp.vertex_index]
        uv.data[li].uv = (vx / FACE_W + 0.5, vz / FACE_H + 0.5)

    mat = make_material()
    me.materials.append(mat)

    ob = bpy.data.objects.new(MESH_NAME, me)
    coll.objects.link(ob)
    ob['role'] = 'giant_face'
    ob['triangles'] = sum(len(p.vertices) - 2 for p in me.polygons)
    ob['dmax_m'] = round(dmax, 4)

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.20
    coll.objects.link(root)
    ob.parent = root
    bpy.context.view_layer.update()

    root['model'] = 'giant-face'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#第五关 · 黑色巨脸'
    root['size_w_m'] = FACE_W
    root['size_h_m'] = FACE_H
    root['size_d_m'] = round(FACE_D, 4)
    root['front_y_m'] = round(FRONT_Y, 4)
    root['back_y_m'] = round(BACK_Y, 4)
    root['color'] = CHARCOAL
    root['up_axis'] = 'Y'
    root['front_axis'] = '+Z (glTF) / -Y (Blender)'
    root['mesh_count'] = 1
    root['triangles'] = ob['triangles']

    # ---- 自检 ----
    import bmesh as _bm
    chk = _bm.new()
    chk.from_mesh(me)
    non_manifold = sum(1 for e in chk.edges if not e.is_manifold)
    boundary = sum(1 for e in chk.edges if e.is_boundary)
    loose = sum(1 for v in chk.verts if not v.link_edges)
    chk.free()
    bb = [ob.matrix_world @ v.co for v in me.vertices]
    mn = (min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))
    mx = (max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb))
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    print('  verts=%d faces=%d tris=%d' % (len(me.vertices), len(me.polygons), tris))
    print('  bbox x[%.4f,%.4f] y[%.4f,%.4f] z[%.4f,%.4f]'
          % (mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
    print('  size  W=%.4f  H=%.4f  D=%.4f  (want %.3f / %.3f / %.3f)'
          % (mx[0] - mn[0], mx[2] - mn[2], mx[1] - mn[1], FACE_W, FACE_H, FACE_D))
    print('  health non_manifold=%d boundary=%d loose=%d' % (non_manifold, boundary, loose))
    assert abs((mx[0] - mn[0]) - FACE_W) < 0.002, 'width'
    assert abs((mx[2] - mn[2]) - FACE_H) < 0.002, 'height'
    assert abs((mx[1] - mn[1]) - FACE_D) < 0.0005, 'depth'
    assert tris < 4000, 'tri budget'
    assert non_manifold == 0 and boundary == 0 and loose == 0, 'topology'
    return root, ob, tris


def strip_scene_extras(path):
    """MCP 插件会给 scene 写 extras，导出的 glb 里不该带。"""
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
    """把导出结果读回来：确认只有一个网格、COLOR_0 在、底色对。"""
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
    print('  glb: material=%s baseColorFactor=%s doubleSided=%s' % (
        mat.get('name'), pbr.get('baseColorFactor'), mat.get('doubleSided')))
    print('  glb: COLOR_0=%s  baseColor=%s' % ('COLOR_0' in attrs, CHARCOAL))
    assert 'COLOR_0' in attrs
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
        # 工作区的 ACL 只放行 DSH 的进程；Blender 直接写 Desktop 会 PermissionError。
        with open(written, 'wb'):
            pass
    except OSError:
        import tempfile
        written = str(pathlib.Path(tempfile.gettempdir()) / 'face_v01.glb')
        print('workspace write denied, exporting to', written)
    kwargs['filepath'] = written
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(written)
    print('exported', written, pathlib.Path(written).stat().st_size, 'bytes')
    return written


def _main():
    root, obj, _tris = build()
    written = export_glb(root, obj)
    inspect_glb(written)
    return written


if globals().get('__name__', '__main__') == '__main__':
    _main()

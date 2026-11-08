"""木偶 v03：仿「球体关节木人形」（美术木偶 / 木人模型）+ 恐怖元素。

形态参考：用户给的美术木人（浅色木、长椭圆头、细四肢、球形关节外露、
胸—腰球—胯三段、扁脚），以及《女鬼桥2》里那种被摆弄过、脏掉的舞台人偶气质：
木头上画了一张脸（两个墨点 + 缝线嘴），木纹裂开，缝里渗出干掉的血。

规格沿用 docs/model_prompts.md「## 木偶」：1.75 m、脚底贴地、A-pose、
比同学瘦、不超过 8000 三角面、按髋/肩拆成可转动物体（原点在关节上）。

用法：在 Blender 里 exec(open(r'...\\tools\\build_puppet_v03.py').read())
输出 assets/models/puppet_v03.glb。
"""
import math
import pathlib

import bpy
import bmesh
from mathutils import Matrix, Vector

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\puppet_v03.glb'
COLL_NAME = 'PuppetV3'
ROOT_NAME = 'PuppetV3'
PREVIEW_LOCATION = (2.0, -1.3, 0.0)

# 浅色木 + 深一点的关节木 + 墨 / 裂纹 / 血渍
MAT_SPECS = [
    ('Wood_Light',  '#c9ac80', 0.80),   # 主体：浅色美术木
    ('Wood_Joint',  '#a1815a', 0.74),   # 关节球
    ('Wood_Dark',   '#7d6041', 0.80),   # 鞋底 / 颈销 / 木纹
    ('Wood_Crack',  '#4a3018', 0.82),   # 木裂
    ('Paint',       '#cba57f', 0.88),   # 画上去的肤色
    ('Paint_Dark',  '#b08c62', 0.88),   # 鼻影
    ('Sclera',      '#7a7166', 0.84),
    ('Iris',        '#2b2018', 0.72),
    ('Ink_Dark',    '#17130f', 0.76),   # 眉 / 眼睑
    ('Lip',         '#231a15', 0.76),   # 唇 / 鼻孔
    ('Dust',        '#dcc6a2', 0.90),   # 刮痕边的木粉
]


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _rgba(hexstr):
    h = hexstr.lstrip('#')
    return (_srgb_to_linear(int(h[0:2], 16)),
            _srgb_to_linear(int(h[2:4], 16)),
            _srgb_to_linear(int(h[4:6], 16)), 1.0)


def make_material(name, hexstr, roughness):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    color = _rgba(hexstr)
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.5
    mat.diffuse_color = color
    mat.roughness = roughness
    mat.metallic = 0.0
    return mat


# ---------------------------------------------------------------- geometry
def ring(cx, cy, cz, hw, hd, n=8, rot=math.pi / 8, power=2.6):
    pts = []
    e = 2.0 / power
    for i in range(n):
        a = rot + 2.0 * math.pi * i / n
        ca, sa = math.cos(a), math.sin(a)
        x = math.copysign(abs(ca) ** e, ca) if abs(ca) > 1e-12 else 0.0
        y = math.copysign(abs(sa) ** e, sa) if abs(sa) > 1e-12 else 0.0
        pts.append((cx + hw * x, cy + hd * y, cz))
    return pts


def _mesh_object(name, verts, faces, mat, coll):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    coll.objects.link(ob)
    return ob


def loft(name, rings, mat, coll, cap_lo=True, cap_hi=True, matrix=None):
    n = len(rings[0])
    verts = []
    for r in rings:
        for p in r:
            v = Vector(p)
            if matrix is not None:
                v = matrix @ v
            verts.append(tuple(v))
    faces = []
    for k in range(len(rings) - 1):
        a, b = k * n, (k + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    if cap_lo:
        faces.append(tuple(reversed(range(n))))
    if cap_hi:
        faces.append(tuple(range(len(verts) - n, len(verts))))
    return _mesh_object(name, verts, faces, mat, coll)


def tube(name, profile, mat, coll, n=8, rot=math.pi / 8, power=2.6,
         matrix=None, cap_lo=True, cap_hi=True):
    rings = []
    for p in profile:
        z, hw, hd = p[0], p[1], p[2]
        yc = p[3] if len(p) > 3 else 0.0
        rings.append(ring(0.0, yc, z, hw, hd, n=n, rot=rot, power=power))
    return loft(name, rings, mat, coll, cap_lo=cap_lo, cap_hi=cap_hi, matrix=matrix)


def ball(name, radius, mat, coll, matrix=None, seg=16, rings=10):
    verts = [(0.0, 0.0, radius)]
    for i in range(1, rings):
        th = math.pi * i / rings
        z = radius * math.cos(th)
        rr = radius * math.sin(th)
        for j in range(seg):
            a = 2.0 * math.pi * j / seg
            verts.append((rr * math.cos(a), rr * math.sin(a), z))
    verts.append((0.0, 0.0, -radius))
    bottom = len(verts) - 1
    faces = []
    for j in range(seg):
        j2 = (j + 1) % seg
        faces.append((0, 1 + j, 1 + j2))
    for i in range(rings - 2):
        a0 = 1 + i * seg
        b0 = 1 + (i + 1) * seg
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((a0 + j, b0 + j, b0 + j2, a0 + j2))
    last = 1 + (rings - 2) * seg
    for j in range(seg):
        j2 = (j + 1) % seg
        faces.append((last + j, bottom, last + j2))
    if matrix is not None:
        verts = [tuple(matrix @ Vector(v)) for v in verts]
    return _mesh_object(name, verts, faces, mat, coll)


def plate(name, cx, cz, rx, rz, mat, coll, tilt=0.0, n=14, rings=(0.5, 1.0), depth=-0.17):
    ca, sa = math.cos(tilt), math.sin(tilt)

    def place(x, z):
        return (cx + x * ca - z * sa, depth, cz + x * sa + z * ca)

    verts = [place(0.0, 0.0)]
    for f in rings:
        for i in range(n):
            a = 2.0 * math.pi * i / n
            verts.append(place(math.cos(a) * rx * f, math.sin(a) * rz * f))
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    for r in range(len(rings) - 1):
        a0 = 1 + r * n
        b0 = 1 + (r + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a0 + i, b0 + i, b0 + j, a0 + j))
    return _mesh_object(name, verts, faces, mat, coll)


def stroke(name, path2d, w_start, w_end, mat, coll, depth=-0.17):
    n = len(path2d)
    verts = []
    for i, (x, z) in enumerate(path2d):
        if i == 0:
            tx, tz = path2d[1][0] - x, path2d[1][1] - z
        elif i == n - 1:
            tx, tz = x - path2d[-2][0], z - path2d[-2][1]
        else:
            tx, tz = path2d[i + 1][0] - path2d[i - 1][0], path2d[i + 1][1] - path2d[i - 1][1]
        L = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / L, tx / L
        t = i / (n - 1)
        w = w_start * (1.0 - t) + w_end * t
        verts.append((x + nx * w, depth, z + nz * w))
        verts.append((x - nx * w, depth, z - nz * w))
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(n - 1)]
    return _mesh_object(name, verts, faces, mat, coll)


def shrink_onto(ob, target, offset=0.002):
    mod = ob.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = target
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = False
    mod.use_project_y = True
    mod.use_project_z = False
    mod.use_negative_direction = False
    mod.use_positive_direction = True
    mod.wrap_mode = 'ON_SURFACE'
    mod.offset = offset
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def purge():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is not None:
        for ob in list(coll.objects):
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)
        bpy.data.collections.remove(coll)
    stale = bpy.data.objects.get(ROOT_NAME)
    if stale is not None:
        bpy.data.objects.remove(stale, do_unlink=True)


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def join(objs, name, origin):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name + '_mesh'
    fix_normals(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.context.scene.cursor.location = Vector(origin)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    return ob


def _place(parts, m):
    for ob in parts:
        ob.matrix_world = m @ ob.matrix_world
    bpy.context.view_layer.update()
    return parts


# 身高 1.75 m 的关键高度（比同学瘦一圈）
Z_TOP = 1.752
Z_CHIN = 1.500
Z_NECK = 1.470          # 颈球心
Z_SHOULDER = 1.395
Z_WAIST = 1.132         # 腰球心（胸:胯 ≈ 4:3）
Z_HIP = 0.930
Z_KNEE = 0.505
X_LEG = 0.072
X_SHOULDER = 0.168
ARM_TILT = math.radians(12.0)
ELBOW_T = 0.300
WRIST_T = 0.600
X_HEAD_TILT = 5.0
Z_HEAD_TILT = 7.0

HEAD_PROFILE = [
    (Z_CHIN, 0.030, 0.036),
    (1.516, 0.048, 0.056),
    (1.540, 0.062, 0.073),
    (1.566, 0.072, 0.085),
    (1.596, 0.079, 0.092),
    (1.628, 0.082, 0.096),
    (1.660, 0.080, 0.094),
    (1.690, 0.075, 0.088),
    (1.716, 0.064, 0.078),
    (1.736, 0.046, 0.058),
    (Z_TOP, 0.014, 0.020),
]
HEAD_POWER = 2.2


def _head_pt(z, hw, hd, a, grow=1.0):
    e = 2.0 / HEAD_POWER
    ca, sa = math.cos(a), math.sin(a)
    x = math.copysign(abs(ca) ** e, ca) * hw * grow
    y = math.copysign(abs(sa) ** e, sa) * hd * grow
    if y < 0.0:
        y *= 0.90
    return (x, y, z)


def drape(ob, target, offset=0.0015, y_start=-0.30):
    """把平贴在 y=-0.17 的薄片沿 +Y 打到目标表面，再沿法线抬 offset。"""
    me = ob.data
    for v in me.vertices:
        x, _y, z = v.co
        hit, loc, nrm, _idx = target.ray_cast(Vector((x, y_start, z)), Vector((0.0, 1.0, 0.0)))
        if hit:
            v.co = loc + nrm * offset
    me.update()
    return ob


def build_head_parts(coll, M):
    """没有五官的木头脑袋，脸上只有划痕。"""
    parts = []

    head = tube('p_head', HEAD_PROFILE, M['wood'], coll, n=14, rot=math.pi / 14, power=HEAD_POWER)
    for v in head.data.vertices:
        if v.co.y < 0.0:
            v.co.y *= 0.90
    head.data.update()
    parts.append(head)

    def curve(p0, p1, bow, n=8):
        pts = []
        for i in range(n):
            t = i / (n - 1)
            pts.append((p0[0] + (p1[0] - p0[0]) * t + bow[0] * math.sin(math.pi * t),
                        p0[1] + (p1[1] - p0[1]) * t + bow[1] * math.sin(math.pi * t)))
        return pts

    # (起点, 终点, 弯度, 起宽, 收宽)：起手深、末端收成尖
    scratches = [
        ((0.050, 1.700), (0.036, 1.540), (0.010, -0.004), 0.0020, 0.0002),
        ((0.060, 1.686), (0.045, 1.572), (0.008, 0.002), 0.0014, 0.0002),
        ((0.043, 1.706), (0.030, 1.600), (0.006, -0.002), 0.0012, 0.0002),
        ((-0.054, 1.704), (0.042, 1.688), (0.0, 0.006), 0.0015, 0.0002),
        ((-0.042, 1.658), (-0.024, 1.566), (-0.008, 0.001), 0.0014, 0.0002),
        ((0.028, 1.558), (0.024, 1.526), (0.004, 0.0), 0.0026, 0.0003),
        ((-0.058, 1.598), (-0.034, 1.588), (0.0, 0.005), 0.0010, 0.0002),
        ((-0.016, 1.736), (-0.012, 1.696), (0.004, 0.0), 0.0009, 0.0002),
    ]
    for i, (p0, p1, bow, w0, w1) in enumerate(scratches):
        parts.append(drape(stroke('p_scratch_%d' % i, curve(p0, p1, bow), w0, w1,
                                  M['wood_dark'], coll), head, 0.0010))

    # 最深那条一侧的木茬：浅色细线，让划口有厚度
    parts.append(drape(stroke('p_scratch_edge',
                              curve((0.0512, 1.698), (0.0372, 1.542), (0.010, -0.004)),
                              0.0007, 0.0002, M['dust'], coll), head, 0.0013))
    parts.append(drape(stroke('p_scratch_edge2',
                              curve((0.0490, 1.697), (0.0352, 1.543), (0.010, -0.004)),
                              0.0005, 0.0002, M['dust'], coll), head, 0.0011))

    # 头歪向一侧
    pivot = Vector((0.0, 0.0, Z_NECK))
    rot = (Matrix.Translation(pivot)
           @ Matrix.Rotation(math.radians(X_HEAD_TILT), 4, 'Y')
           @ Matrix.Rotation(math.radians(Z_HEAD_TILT), 4, 'Z')
           @ Matrix.Translation(-pivot))
    for ob in parts:
        ob.matrix_world = rot @ ob.matrix_world
    bpy.context.view_layer.update()
    return parts

def build_body(coll, M):
    parts = []

    # 胸：上宽下窄的木块，下沿收到腰球上面
    chest = tube('p_chest', [
        (1.160, 0.056, 0.048),
        (1.182, 0.074, 0.056),
        (1.220, 0.094, 0.066),
        (1.270, 0.118, 0.076),
        (1.320, 0.138, 0.081),
        (1.365, 0.154, 0.084),
        (1.400, 0.162, 0.083),
        (1.424, 0.146, 0.075),
        (1.442, 0.104, 0.061),
        (1.458, 0.060, 0.048),
    ], M['wood'], coll, power=2.8)
    parts.append(chest)

    # 腰球：比上下两段都粗一点，球要从缝里露出来
    parts.append(ball('p_waist', 0.060, M['joint'], coll,
                      matrix=Matrix.Translation(Vector((0.0, 0.0, Z_WAIST)))))

    # 胯：花瓶形，髋部最宽，往上收进腰球
    parts.append(tube('p_pelvis', [
        (0.928, 0.064, 0.054),
        (0.952, 0.100, 0.068),
        (0.980, 0.114, 0.074),
        (1.010, 0.114, 0.072),
        (1.040, 0.108, 0.068),
        (1.075, 0.092, 0.061),
        (1.104, 0.058, 0.050),
    ], M['wood'], coll, power=2.8))

    # 颈销 + 颈球
    parts.append(tube('p_neck', [
        (1.440, 0.036, 0.038),
        (1.462, 0.034, 0.036),
        (1.482, 0.033, 0.035),
    ], M['wood_dark'], coll, n=10, power=2.2))
    parts.append(ball('p_neckball', 0.030, M['joint'], coll,
                      matrix=Matrix.Translation(Vector((0.0, 0.0, Z_NECK)))))

    # 胸口木裂 + 颈缝渗下来的血
    chest_cracks = [
        ([(0.058, 1.372), (0.044, 1.330), (0.056, 1.290), (0.040, 1.246),
          (0.051, 1.216), (0.040, 1.182)], 0.0020, 0.0006),
        ([(0.046, 1.316), (0.024, 1.298), (0.006, 1.272), (0.000, 1.240)], 0.0015, 0.0005),
        ([(-0.066, 1.356), (-0.054, 1.316), (-0.062, 1.278)], 0.0013, 0.0004),
    ]
    for i, (pts, w0, w1) in enumerate(chest_cracks):
        parts.append(shrink_onto(stroke(
            'p_chestcrack_%d' % i, pts, w0, w1, M['crack'], coll), chest, offset=0.0022))


    return parts


def build_leg(coll, M, side):
    """三段父子：大腿（含髋球）/ 小腿（含膝球）/ 脚（含踝球），原点都在关节球心上。"""
    nm = 'L' if side < 0 else 'R'
    m = (Matrix.Translation(Vector((side * X_LEG, 0.0, Z_HIP)))
         @ Matrix.Rotation(math.radians(9.0 * side), 4, 'Z'))
    knee_z = -(Z_HIP - Z_KNEE)
    ankle_z = -0.845

    thigh = [
        ball('p_hipball', 0.052, M['joint'], coll),
        tube('p_thigh', [
            (-0.030, 0.040, 0.046),
            (-0.052, 0.046, 0.052),
            (-0.100, 0.047, 0.053),
            (-0.180, 0.044, 0.049),
            (-0.280, 0.040, 0.044),
            (-0.370, 0.036, 0.040),
            (-0.392, 0.033, 0.037),
        ], M['wood'], coll, power=2.4, n=10),
    ]
    shin = [
        ball('p_kneeball', 0.041, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, knee_z)))),
        tube('p_shin', [
            (-0.452, 0.030, 0.034),
            (-0.520, 0.029, 0.033),
            (-0.620, 0.028, 0.031),
            (-0.720, 0.026, 0.029),
            (-0.802, 0.025, 0.028),
        ], M['wood'], coll, power=2.4, n=10),
    ]
    foot = [
        ball('p_ankleball', 0.029, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, ankle_z)))),
        tube('p_shoe', [
            (-0.812, 0.036, 0.042, 0.000),
            (-0.848, 0.044, 0.072, -0.018),
            (-0.880, 0.048, 0.104, -0.032),
            (-0.916, 0.047, 0.110, -0.033),
            (-0.930, 0.040, 0.098, -0.029),
        ], M['wood_dark'], coll, power=3.0, n=10),
    ]
    for g in (thigh, shin, foot):
        _place(g, m)
    return (join(thigh, 'PuppetV3_Leg_' + nm, m @ Vector((0.0, 0.0, 0.0))),
            join(shin, 'PuppetV3_Shin_' + nm, m @ Vector((0.0, 0.0, knee_z))),
            join(foot, 'PuppetV3_Foot_' + nm, m @ Vector((0.0, 0.0, ankle_z))))


def build_arm(coll, M, side):
    """三段父子：大臂（含肩球）/ 前臂（含肘球）/ 手（含腕球），原点都在球心上。"""
    nm = 'L' if side < 0 else 'R'
    m = (Matrix.Translation(Vector((side * X_SHOULDER, 0.0, Z_SHOULDER)))
         @ Matrix.Rotation(-side * ARM_TILT, 4, 'Y'))

    upper = [
        ball('p_shoulderball', 0.048, M['joint'], coll),
        tube('p_upperarm', [
            (-0.042, 0.034, 0.034),
            (-0.100, 0.032, 0.032),
            (-0.180, 0.029, 0.029),
            (-0.250, 0.026, 0.026),
            (-0.276, 0.023, 0.023),
        ], M['wood'], coll, power=2.2, n=10),
    ]
    fore = [
        ball('p_elbowball', 0.035, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -ELBOW_T)))),
        tube('p_forearm', [
            (-0.326, 0.023, 0.023),
            (-0.392, 0.022, 0.022),
            (-0.470, 0.021, 0.021),
            (-0.548, 0.019, 0.019),
            (-0.576, 0.018, 0.018),
        ], M['wood'], coll, power=2.2, n=10),
    ]
    hand = [
        ball('p_wristball', 0.025, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -WRIST_T)))),
        tube('p_hand', [
            (-0.606, 0.019, 0.022),
            (-0.626, 0.019, 0.032),
            (-0.648, 0.017, 0.036),
            (-0.664, 0.015, 0.034),
            (-0.670, 0.011, 0.028),
        ], M['wood'], coll, power=2.2, n=10),
    ]
    for i, (yc, length, half_w) in enumerate((
            (-0.024, 0.042, 0.0072),
            (-0.0080, 0.047, 0.0076),
            (0.0080, 0.044, 0.0072),
            (0.024, 0.036, 0.0064))):
        hand.append(tube('p_finger_%d' % i, [
            (-0.660, 0.0072, half_w),
            (-0.660 - length * 0.42, 0.0069, half_w * 0.98),
            (-0.660 - length * 0.80, 0.0062, half_w * 0.88),
            (-0.660 - length, 0.0046, half_w * 0.62),
        ], M['wood'], coll, n=6, power=2.2,
            matrix=Matrix.Translation(Vector((0.0, yc, 0.0)))))
    thumb_m = (Matrix.Translation(Vector((0.0, -0.028, -0.640)))
               @ Matrix.Rotation(math.radians(-22.0), 4, 'X')
               @ Matrix.Rotation(math.radians(14.0), 4, 'Y'))
    hand.append(tube('p_thumb', [
        (0.000, 0.0074, 0.0080),
        (-0.016, 0.0070, 0.0076),
        (-0.030, 0.0062, 0.0068),
        (-0.040, 0.0050, 0.0054),
        (-0.045, 0.0030, 0.0034),
    ], M['wood'], coll, n=6, power=2.2, matrix=thumb_m))

    for g in (upper, fore, hand):
        _place(g, m)
    return (join(upper, 'PuppetV3_Arm_' + nm, m @ Vector((0.0, 0.0, 0.0))),
            join(fore, 'PuppetV3_Forearm_' + nm, m @ Vector((0.0, 0.0, -ELBOW_T))),
            join(hand, 'PuppetV3_Hand_' + nm, m @ Vector((0.0, 0.0, -WRIST_T))))


def build():
    purge()
    mats = {name: make_material(name, hexcol, rough) for name, hexcol, rough in MAT_SPECS}
    M = {'wood': mats['Wood_Light'], 'joint': mats['Wood_Joint'],
         'wood_dark': mats['Wood_Dark'], 'crack': mats['Wood_Crack'],
         'paint': mats['Paint'], 'paint_dark': mats['Paint_Dark'],
         'sclera': mats['Sclera'], 'iris': mats['Iris'],
         'dark': mats['Ink_Dark'], 'lip': mats['Lip'], 'dust': mats['Dust']}

    coll = bpy.data.collections.new(COLL_NAME)
    bpy.context.scene.collection.children.link(coll)

    body = join(build_body(coll, M), 'PuppetV3_Body', (0.0, 0.0, 0.0))
    head = join(build_head_parts(coll, M), 'PuppetV3_Head', (0.0, 0.0, Z_NECK))
    leg_l, shin_l, foot_l = build_leg(coll, M, -1)
    leg_r, shin_r, foot_r = build_leg(coll, M, 1)
    arm_l, fore_l, hand_l = build_arm(coll, M, -1)
    arm_r, fore_r, hand_r = build_arm(coll, M, 1)

    parts = [body, head, leg_l, shin_l, foot_l, leg_r, shin_r, foot_r,
             arm_l, fore_l, hand_l, arm_r, fore_r, hand_r]

    # 站姿里的外张/外八都烘进网格，物体自身旋转为零
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55.0))
    except Exception:
        bpy.ops.object.shade_smooth()

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.25
    coll.objects.link(root)
    bpy.context.view_layer.update()

    # 父子：根 → 体 → 头；根 → 腿 → 小腿 → 脚；根 → 臂 → 前臂 → 手
    chains = [
        (body, root), (head, body),
        (leg_l, root), (shin_l, leg_l), (foot_l, shin_l),
        (leg_r, root), (shin_r, leg_r), (foot_r, shin_r),
        (arm_l, root), (fore_l, arm_l), (hand_l, fore_l),
        (arm_r, root), (fore_r, arm_r), (hand_r, fore_r),
    ]
    for child, parent in chains:
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_world.inverted()

    names = {
        'legs': ['PuppetV3_Leg_L', 'PuppetV3_Leg_R'],
        'shins': ['PuppetV3_Shin_L', 'PuppetV3_Shin_R'],
        'feet': ['PuppetV3_Foot_L', 'PuppetV3_Foot_R'],
        'arms': ['PuppetV3_Arm_L', 'PuppetV3_Arm_R'],
        'forearms': ['PuppetV3_Forearm_L', 'PuppetV3_Forearm_R'],
        'hands': ['PuppetV3_Hand_L', 'PuppetV3_Hand_R'],
    }
    root['model'] = 'puppet_wood'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#木偶 + 木人形 + 拆出关节'
    root['height_m'] = 1.752
    for k, v in names.items():
        root[k] = v
    root['body'] = 'PuppetV3_Body'
    root['head'] = 'PuppetV3_Head'
    root['up_axis'] = 'Y'

    # feet[:-1] 会变成 fee，角色绑定认的是 foot。
    role_for = {
        'legs': 'leg', 'shins': 'shin', 'feet': 'foot',
        'arms': 'arm', 'forearms': 'forearm', 'hands': 'hand',
    }
    for k, v in names.items():
        for ob in parts:
            if ob.name in v:
                ob['role'] = role_for[k]
    body['role'] = 'body'
    head['role'] = 'head'

    root.location = PREVIEW_LOCATION
    bpy.context.view_layer.update()

    tris = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in parts:
        me = ob.data
        n_tris = sum(len(p.vertices) - 2 for p in me.polygons)
        tris += n_tris
        for v in me.vertices:
            w = ob.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
        print('  %-20s verts=%4d tris=%4d origin=%s parent=%s' % (
            ob.name, len(me.vertices), n_tris,
            tuple(round(c, 3) for c in ob.matrix_world.translation),
            ob.parent.name if ob.parent else '-'))
    print('TOTAL tris=%d' % tris)
    print('bbox min=%s max=%s  height=%.3f' % (
        tuple(round(c, 3) for c in lo), tuple(round(c, 3) for c in hi),
        hi.z - lo.z))
    return root, parts, tris

def strip_scene_extras(path):
    import json
    import struct
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


def export_glb(root, parts):
    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ob in parts:
        ob.select_set(True)
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
        written = str(pathlib.Path(tempfile.gettempdir()) / 'puppet_v03.glb')
        print('workspace write denied, exporting to', written)
    kwargs['filepath'] = written
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(written)
    size = pathlib.Path(written).stat().st_size
    root.location = PREVIEW_LOCATION
    bpy.context.view_layer.update()
    print('exported', written, size, 'bytes')
    return written


def _main():
    _root, _parts, _tris = build()
    export_glb(_root, _parts)


if globals().get('__name__', '__main__') == '__main__':
    _main()

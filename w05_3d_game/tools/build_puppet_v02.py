"""球体关节人形（BJD）版本的「木偶」——在第 4 关红人偶的基础上重做。

原型：球体关节人形（ball-jointed doll）
- 四肢是分段的人形，肘、膝、腕、踝、肩、髋处露出球形关节
- 关节球比肢体细一档，球是近黑的树脂色，缝隙里看得见球面
- 躯体分段：胸、腰球、胯；脖子也是一颗球
- 表面是绯红瓷/树脂，微光（不是布料）

恐怖元素（不加血腥）：
- 瓷面裂纹：脸上一道从头顶穿过眉骨到下颌，一道从眼下裂到下巴；胸口一道分叉裂纹
- 墨（像干掉的血）从两只眼下、右嘴角、颈关节一路淌下来
- 嘴是一条细笑弧，上面压着几道缝线
- 两只眼睛一大一小，头歪 6°/5°，像摆久了的旧人偶

规格沿用 docs/model_prompts.md「## 木偶」：1.75 m、脚底贴地、A-pose、比同学瘦、
不超过 8000 三角面、按髋/肩拆成可转动物体（原点在关节上）。

用法：在 Blender 里 exec(open(r'...\\tools\\build_puppet_v02.py').read())
输出 assets/models/puppet_v02.glb。
"""
import math
import pathlib

import bpy
import bmesh
from mathutils import Matrix, Vector

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\puppet_v02.glb'
COLL_NAME = 'PuppetV2'
ROOT_NAME = 'PuppetV2'
PREVIEW_LOCATION = (2.0, -1.3, 0.0)

MAT_SPECS = [
    ('BJD_Porcelain',  '#5e161d', 0.40),   # 绯红瓷：头、胸、胯、四肢
    ('BJD_Joint',      '#1d0609', 0.30),   # 关节球：近黑树脂，比瓷更亮一点
    ('BJD_Ink',        '#050305', 0.55),   # 墨 / 眼点 / 缝线
    ('BJD_Crack',      '#150406', 0.45),   # 裂纹
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


def ball(name, radius, mat, coll, matrix=None, seg=14, rings=9):
    """球形关节。"""
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
    """沿 2D 折线扫一条可渐细的扁带：笑弧、裂纹、墨滴、缝线。"""
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


Z_TOP = 1.752
Z_CHIN = 1.508
Z_NECK = 1.478          # 颈关节球心
Z_SHOULDER = 1.400
Z_WAIST = 1.002         # 腰关节球心
Z_HIP = 0.900
X_LEG = 0.074
X_SHOULDER = 0.178
ARM_TILT = math.radians(14.0)
ARM_LEN = 0.600         # 肩到腕
ELBOW_T = 0.300
X_HEAD_TILT = 6.0       # 绕 Y 歪头
Z_HEAD_TILT = 5.0       # 绕 Z 偏转

EYE_Z = 1.631
EYE_X = 0.033
SMILE_Z = 1.576
SMILE_W = 0.046


def build_head_parts(coll, M):
    parts = []
    head = tube('p_head', [
        (Z_CHIN, 0.028, 0.034),
        (1.522, 0.046, 0.056),
        (1.546, 0.060, 0.074),
        (1.572, 0.071, 0.086),
        (1.600, 0.077, 0.092),
        (1.632, 0.080, 0.096),
        (1.664, 0.078, 0.094),
        (1.694, 0.070, 0.086),
        (1.719, 0.057, 0.073),
        (1.738, 0.037, 0.050),
        (Z_TOP, 0.013, 0.018),
    ], M['porcelain'], coll, n=12, rot=math.pi / 12, power=2.35)
    for v in head.data.vertices:
        if v.co.y < 0.0:
            v.co.y *= 0.90
    head.data.update()
    parts.append(head)

    # 一大一小的两只黑点眼
    for sx, r in ((-1, 0.0125), (1, 0.0155)):
        parts.append(shrink_onto(plate(
            'p_eye_%d' % sx, sx * EYE_X, EYE_Z, r, r * 1.04,
            M['ink'], coll, n=14), head, offset=0.0028))

    # 笑弧
    smile_pts = []
    for i in range(15):
        u = -1.0 + 2.0 * i / 14.0
        smile_pts.append((u * SMILE_W, SMILE_Z + 0.012 * u * u))
    parts.append(shrink_onto(stroke(
        'p_smile', smile_pts, 0.0022, 0.0022, M['ink'], coll), head, offset=0.0030))

    # 笑弧上的缝线
    for i, t in enumerate((-0.78, -0.52, -0.26, 0.0, 0.26, 0.52, 0.78)):
        x = t * SMILE_W
        z = SMILE_Z + 0.012 * t * t
        parts.append(shrink_onto(stroke(
            'p_stitch_%d' % i,
            [(x - 0.005, z - 0.0085), (x + 0.005, z + 0.0085)],
            0.0016, 0.0016, M['ink'], coll), head, offset=0.0034))

    # 裂纹：一道从头顶穿过眉骨、颧骨到下颌；一道从右眼下滑到下巴
    cracks = [
        ([(0.010, 1.716), (0.020, 1.688), (0.008, 1.664), (0.019, 1.640),
          (0.026, 1.618), (0.018, 1.589), (0.024, 1.556), (0.016, 1.526)], 0.0022, 0.0007),
        ([(-0.040, 1.612), (-0.034, 1.586), (-0.042, 1.560), (-0.035, 1.532)], 0.0018, 0.0006),
        ([(-0.052, 1.700), (-0.044, 1.678), (-0.050, 1.656)], 0.0013, 0.0005),
    ]
    for i, (pts, w0, w1) in enumerate(cracks):
        parts.append(shrink_onto(stroke(
            'p_crack_%d' % i, pts, w0, w1, M['crack'], coll), head, offset=0.0022))

    # 墨：眼下两道、右嘴角一道
    drips = [
        (-0.0365, 1.6115, 0.042, 0.0016),
        (0.0305, 1.6095, 0.033, -0.0019),
        (0.0365, 1.5805, 0.030, 0.0013),
    ]
    for i, (x, z, length, drift) in enumerate(drips):
        pts = []
        steps = 7
        for k in range(steps + 1):
            t = k / steps
            pts.append((x + drift * math.sin(t * math.pi * 1.1), z - length * t))
        parts.append(shrink_onto(stroke(
            'p_drip_%d' % i, pts, 0.0028, 0.0008, M['ink'], coll), head, offset=0.0032))

    # 歪头：绕颈关节球心转一下，像摆久了的旧人偶
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

    # 胸
    chest = tube('p_chest', [
        (0.995, 0.100, 0.072),
        (1.050, 0.110, 0.078),
        (1.120, 0.114, 0.082),
        (1.190, 0.122, 0.086),
        (1.260, 0.136, 0.090),
        (1.330, 0.154, 0.092),
        (1.385, 0.172, 0.090),
        (1.420, 0.158, 0.082),
        (1.448, 0.116, 0.068),
        (1.462, 0.072, 0.056),
    ], M['porcelain'], coll, power=3.0)
    parts.append(chest)

    # 腰关节球
    parts.append(ball('p_waist', 0.050, M['joint'], coll,
                      matrix=Matrix.Translation(Vector((0.0, 0.0, Z_WAIST)))))

    # 胯
    parts.append(tube('p_pelvis', [
        (0.862, 0.056, 0.052),
        (0.884, 0.098, 0.068),
        (0.910, 0.118, 0.074),
        (0.948, 0.122, 0.074),
        (0.990, 0.098, 0.062),
    ], M['porcelain'], coll, power=3.0))

    # 颈关节球
    parts.append(ball('p_neck', 0.031, M['joint'], coll,
                      matrix=Matrix.Translation(Vector((0.0, 0.0, Z_NECK)))))

    # 胸口的裂纹（分叉）与从颈关节淌下来的墨
    chest_cracks = [
        ([(0.062, 1.372), (0.048, 1.330), (0.060, 1.292), (0.043, 1.244),
          (0.054, 1.196), (0.040, 1.150), (0.048, 1.108)], 0.0022, 0.0007),
        ([(0.050, 1.318), (0.026, 1.300), (0.008, 1.272), (0.000, 1.238)], 0.0016, 0.0005),
        ([(-0.070, 1.360), (-0.056, 1.318), (-0.066, 1.280)], 0.0014, 0.0005),
    ]
    for i, (pts, w0, w1) in enumerate(chest_cracks):
        parts.append(shrink_onto(stroke(
            'p_chestcrack_%d' % i, pts, w0, w1, M['crack'], coll), chest, offset=0.0022))

    neck_drip = [(0.0, 1.444), (0.004, 1.414), (0.001, 1.382), (0.006, 1.350),
                 (0.002, 1.318), (0.005, 1.290)]
    parts.append(shrink_onto(stroke(
        'p_neckdrip', neck_drip, 0.0030, 0.0010, M['ink'], coll), chest, offset=0.0030))

    return parts


def _place(parts, m):
    """把局部坐标里搭好的零件整体摆到关节位置上。"""
    for ob in parts:
        ob.matrix_world = m @ ob.matrix_world
    bpy.context.view_layer.update()
    return parts


def build_leg(coll, M, side):
    """原点在髋关节；膝、踝各一颗球。"""
    hip = Vector((side * X_LEG, 0.0, Z_HIP))
    m = Matrix.Translation(hip)
    parts = [
        tube('p_thigh', [
            (-0.028, 0.048, 0.060),
            (-0.090, 0.054, 0.062),
            (-0.180, 0.049, 0.057),
            (-0.290, 0.043, 0.050),
            (-0.380, 0.035, 0.041),
            (-0.400, 0.031, 0.037),
        ], M['porcelain'], coll, power=2.5),
        ball('p_kneeball', 0.044, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -0.412)))),
        tube('p_shin', [
            (-0.438, 0.030, 0.036),
            (-0.500, 0.030, 0.036),
            (-0.600, 0.028, 0.033),
            (-0.700, 0.027, 0.031),
            (-0.775, 0.026, 0.030),
        ], M['porcelain'], coll, power=2.5),
        ball('p_ankleball', 0.031, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -0.792)))),
        tube('p_shoe', [
            (-0.788, 0.036, 0.042, 0.000),
            (-0.830, 0.042, 0.068, -0.016),
            (-0.866, 0.045, 0.096, -0.028),
            (-0.890, 0.044, 0.104, -0.029),
            (-0.900, 0.039, 0.096, -0.027),
        ], M['porcelain'], coll, power=3.2),
    ]
    return _place(parts, m)


def build_arm(coll, M, side):
    """原点在肩关节；肘、腕各一颗球。A-pose 外张 14°。"""
    shoulder = Vector((side * X_SHOULDER, 0.0, Z_SHOULDER))
    m = Matrix.Translation(shoulder) @ Matrix.Rotation(-side * ARM_TILT, 4, 'Y')

    parts = [
        ball('p_shoulderball', 0.050, M['joint'], coll),
        tube('p_upperarm', [
            (-0.030, 0.036, 0.036),
            (-0.090, 0.034, 0.034),
            (-0.170, 0.031, 0.031),
            (-0.250, 0.027, 0.027),
            (-0.300, 0.024, 0.024),
        ], M['porcelain'], coll, power=2.3),
        ball('p_elbowball', 0.036, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -0.300)))),
        tube('p_forearm', [
            (-0.322, 0.023, 0.023),
            (-0.390, 0.022, 0.022),
            (-0.470, 0.021, 0.021),
            (-0.550, 0.020, 0.020),
            (-0.586, 0.019, 0.019),
        ], M['porcelain'], coll, power=2.3),
        ball('p_wristball', 0.026, M['joint'], coll,
             matrix=Matrix.Translation(Vector((0.0, 0.0, -0.600)))),
        tube('p_hand', [
            (-0.606, 0.020, 0.022),
            (-0.626, 0.019, 0.030),
            (-0.650, 0.017, 0.034),
            (-0.670, 0.015, 0.034),
            (-0.677, 0.011, 0.028),
        ], M['porcelain'], coll, power=2.2),
    ]
    # 四根细手指
    for i, (yc, length, half_w) in enumerate((
            (-0.0235, 0.048, 0.0062),
            (-0.0078, 0.054, 0.0065),
            (0.0078, 0.050, 0.0062),
            (0.0235, 0.042, 0.0056))):
        parts.append(tube('p_finger_%d' % i, [
            (-0.666, 0.0062, half_w),
            (-0.666 - length * 0.42, 0.0060, half_w * 0.98),
            (-0.666 - length * 0.80, 0.0054, half_w * 0.88),
            (-0.666 - length, 0.0040, half_w * 0.62),
        ], M['porcelain'], coll, n=6, power=2.2,
            matrix=Matrix.Translation(Vector((0.0, yc, 0.0)))))
    thumb_m = (Matrix.Translation(Vector((0.0, -0.028, -0.640)))
               @ Matrix.Rotation(math.radians(-22.0), 4, 'X')
               @ Matrix.Rotation(math.radians(14.0), 4, 'Y'))
    parts.append(tube('p_thumb', [
        (0.000, 0.0078, 0.0084),
        (-0.016, 0.0074, 0.0080),
        (-0.030, 0.0066, 0.0072),
        (-0.040, 0.0052, 0.0056),
        (-0.045, 0.0032, 0.0036),
    ], M['porcelain'], coll, n=6, power=2.2, matrix=thumb_m))

    return _place(parts, m)


def build():
    purge()
    mats = {name: make_material(name, hexcol, rough) for name, hexcol, rough in MAT_SPECS}
    M = {'porcelain': mats['BJD_Porcelain'], 'joint': mats['BJD_Joint'],
         'ink': mats['BJD_Ink'], 'crack': mats['BJD_Crack']}

    coll = bpy.data.collections.new(COLL_NAME)
    bpy.context.scene.collection.children.link(coll)

    body_parts = build_body(coll, M) + build_head_parts(coll, M)
    body = join(body_parts, 'PuppetV2_Body', (0.0, 0.0, 0.0))
    leg_l = join(build_leg(coll, M, -1), 'PuppetV2_Leg_L', (-X_LEG, 0.0, Z_HIP))
    leg_r = join(build_leg(coll, M, 1), 'PuppetV2_Leg_R', (X_LEG, 0.0, Z_HIP))
    arm_l = join(build_arm(coll, M, -1), 'PuppetV2_Arm_L', (-X_SHOULDER, 0.0, Z_SHOULDER))
    arm_r = join(build_arm(coll, M, 1), 'PuppetV2_Arm_R', (X_SHOULDER, 0.0, Z_SHOULDER))

    parts = [body, leg_l, leg_r, arm_l, arm_r]
    # 手臂的 A-pose 倾角在物体变换里：烘进网格，物体本身保持单位旋转
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
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(60.0))
    except Exception:
        bpy.ops.object.shade_smooth()

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.25
    coll.objects.link(root)

    for ob in parts:
        ob.parent = root
    root['model'] = 'puppet_bjd'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#木偶 + BJD 球体关节重制'
    root['height_m'] = 1.752
    root['legs'] = ['PuppetV2_Leg_L', 'PuppetV2_Leg_R']
    root['arms'] = ['PuppetV2_Arm_L', 'PuppetV2_Arm_R']
    root['body'] = 'PuppetV2_Body'
    root['up_axis'] = 'Y'

    for ob in parts:
        role = 'body'
        if '_Leg_' in ob.name:
            role = 'leg'
        elif '_Arm_' in ob.name:
            role = 'arm'
        ob['role'] = role

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
        print('  %-18s verts=%4d tris=%4d origin=%s' % (
            ob.name, len(me.vertices), n_tris,
            tuple(round(c, 3) for c in ob.matrix_world.translation)))
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
        written = str(pathlib.Path(tempfile.gettempdir()) / 'puppet_v02.glb')
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

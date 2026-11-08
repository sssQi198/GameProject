"""在 Blender 里程序化搭「木偶」（第 4 关的红色人偶）。

规格来源：docs/model_prompts.md「## 木偶」
- 身高 1.75 m，脚底贴地，A-pose，手臂略微离开躯干
- 轮廓与同学同一套，但更瘦，没有书包
- 全身干涸暗绯红 + 近黑栗色，脏哑光布料
- 脸是空白的：只有两个扁平黑点眼睛 + 一条细的向上弧形笑嘴，
  眼下和嘴角几道短的墨滴
- 没有鼻子、没有牙齿、没有伤口（微恐，不血腥）
- 低多边形、哑光、配色压低

和提示词的差异（有意为之）：提示词要求"单网格"，但同文档还要求进游戏后
按髋、肩拆成 4 个可转动物体。这里直接建成 5 个网格（躯干 + 左右腿 + 左右上臂），
每个物体的原点放在关节上，导出 glb 后就是游戏里可直接旋转的四个肢体。

用法：在 Blender 里 exec(open(r'...\\w05_3d_game\\tools\\build_puppet.py').read())
可重复执行：每次重建 Puppet 集合，再导出 assets/models/puppet_v01.glb。
"""
import math
import pathlib

import bpy
import bmesh
from mathutils import Matrix, Vector

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\puppet_v01.glb'
COLL_NAME = 'Puppet'
ROOT_NAME = 'Puppet'
# 建模在原点（脚底 z=0）。预览时整体挪开，站在树下方的空地上。
PREVIEW_LOCATION = (2.0, -1.3, 0.0)

# ---------------------------------------------------------------- materials
# glTF 的 baseColorFactor 是线性空间，Blender 的 Base Color 也是线性空间，
# 所以这里把 sRGB 十六进制转成线性再写进去，颜色和网页里看到的 #hex 一致。
MAT_SPECS = [
    ('Puppet_Cloth',    '#4d1119', 0.90),   # 干涸暗绯红：外套 / 袖子
    ('Puppet_Cloth_Dk', '#2c0a0f', 0.92),   # 更暗一层：领口 / 鞋
    ('Puppet_Pants',    '#1e070b', 0.92),   # 近黑栗色长裤
    ('Puppet_Skin',     '#5c161d', 0.90),   # 绯红的头 / 手
    ('Puppet_Ink',      '#050305', 0.88),   # 墨：眼睛 / 笑弧 / 墨滴
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
        # 保持默认 0.5，否则导出会带 KHR_materials_specular 扩展。
        bsdf.inputs['Specular IOR Level'].default_value = 0.5
    mat.diffuse_color = color
    mat.roughness = roughness
    mat.metallic = 0.0
    return mat


# ---------------------------------------------------------------- geometry
def ring(cx, cy, cz, hw, hd, n=8, rot=math.pi / 8, power=2.6):
    """一圈截面点。power=2 是椭圆，越大越接近圆角矩形。"""
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
    """把一串同点数的截面放样成封闭壳体。"""
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
    """profile: [(z, hw, hd)] 或 [(z, hw, hd, yc)]，从下往上。"""
    rings = []
    for p in profile:
        z, hw, hd = p[0], p[1], p[2]
        yc = p[3] if len(p) > 3 else 0.0
        rings.append(ring(0.0, yc, z, hw, hd, n=n, rot=rot, power=power))
    return loft(name, rings, mat, coll, cap_lo=cap_lo, cap_hi=cap_hi, matrix=matrix)


def box(name, center, size, mat, coll, rot_y=0.0):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    base = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
            (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rot_y, 4, 'Y')
    verts = [tuple(m @ Vector(p)) for p in base]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return _mesh_object(name, verts, faces, mat, coll)


def plate(name, cx, cz, rx, rz, mat, coll, tilt=0.0, n=14, rings=(0.5, 1.0), depth=-0.17):
    """脸部的薄片：先在脸前面一张平的椭圆片，随后 shrinkwrap 贴到头面上。"""
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
    """沿 2D 折线（XZ 平面）扫一条可以渐细的扁带，用来做笑弧和墨滴。
    建完再用 shrinkwrap 贴到脸上。"""
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
    """沿 +Y 投影到头部表面并抬高 offset，做出贴着皮肤的一层。"""
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


# ---------------------------------------------------------------- assembly
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


# 身高 1.75 m 的关键高度：比同学窄一圈
Z_TOP = 1.752
Z_CHIN = 1.512
Z_NECK_TOP = 1.535
Z_SHOULDER = 1.400
Z_HIP = 0.900
Z_ANKLE = 0.085
X_LEG = 0.078
X_SHOULDER = 0.166
ARM_TILT = math.radians(14.0)

# 脸：两个黑点 + 一条笑弧 + 几道墨滴
EYE_Z = 1.631
EYE_X = 0.033
SMILE_Z = 1.576
SMILE_W = 0.046


def build_body(coll, M):
    parts = []

    # 胯：长裤
    parts.append(tube('p_pelvis', [
        (0.795, 0.074, 0.060),
        (0.845, 0.122, 0.074),
        (0.900, 0.140, 0.080),
        (0.955, 0.116, 0.074),
    ], M['pants'], coll, power=3.0))

    # 躯干：外套，肩最宽，向上收到领口
    parts.append(tube('p_torso', [
        (0.935, 0.124, 0.082),
        (0.995, 0.122, 0.082),
        (1.075, 0.116, 0.082),
        (1.155, 0.122, 0.086),
        (1.245, 0.136, 0.090),
        (1.325, 0.160, 0.092),
        (1.385, 0.184, 0.090),
        (1.418, 0.166, 0.082),
        (1.442, 0.120, 0.068),
        (1.458, 0.086, 0.054),
        (1.470, 0.060, 0.050),
        (1.482, 0.044, 0.046),
    ], M['cloth'], coll, power=3.2))

    # 肩球 / 胯球：关节填充，转动时不露洞
    for sx in (-1, 1):

        parts.append(tube('p_hip_%d' % sx, [
            (Z_HIP - 0.060, 0.014, 0.014),
            (Z_HIP - 0.038, 0.038, 0.040),
            (Z_HIP - 0.008, 0.046, 0.048),
            (Z_HIP + 0.024, 0.042, 0.044),
            (Z_HIP + 0.048, 0.016, 0.016),
        ], M['pants'], coll, n=10, rot=0.0, power=2.0,
            matrix=Matrix.Translation(Vector((sx * X_LEG, 0.0, 0.0)))))

    # 脖子
    parts.append(tube('p_neck', [
        (1.420, 0.048, 0.050),
        (1.470, 0.045, 0.047),
        (Z_NECK_TOP, 0.043, 0.045),
    ], M['skin'], coll, n=10, power=2.2))


    # 头：没有鼻子、耳朵、头发；下颌收一点，脸面压平一点，不然正面看像个蛋
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
    ], M['skin'], coll, n=12, rot=math.pi / 12, power=2.35)
    for v in head.data.vertices:
        if v.co.y < 0.0:
            v.co.y *= 0.90
    head.data.update()
    parts.append(head)

    # 眼睛：两个扁平的黑点
    for sx in (-1, 1):
        parts.append(shrink_onto(plate(
            'p_eye_%d' % sx, sx * EYE_X, EYE_Z, 0.0135, 0.0140,
            M['ink'], coll, n=14), head, offset=0.0028))

    # 笑弧：中间最低、两端上扬的一条细线
    smile_pts = []
    for i in range(15):
        u = -1.0 + 2.0 * i / 14.0
        smile_pts.append((u * SMILE_W, SMILE_Z + 0.012 * u * u))
    parts.append(shrink_onto(stroke(
        'p_smile', smile_pts, 0.0022, 0.0022, M['ink'], coll), head, offset=0.0030))

    # 墨滴：眼下两道、嘴角两道（往下渐细，轻微歪斜）
    drips = [
        (-0.0355, 1.6120, 0.019, 0.0016),
        (0.0305, 1.6100, 0.031, -0.0019),
        (-0.0395, 1.5805, 0.027, -0.0012),
        (0.0365, 1.5810, 0.021, 0.0011),
    ]
    for i, (x, z, length, drift) in enumerate(drips):
        pts = []
        steps = 6
        for k in range(steps + 1):
            t = k / steps
            pts.append((x + drift * math.sin(t * math.pi * 1.1),
                        z - length * t))
        parts.append(shrink_onto(stroke(
            'p_drip_%d' % i, pts, 0.0026, 0.0008, M['ink'], coll), head, offset=0.0032))

    return parts


def build_leg(coll, M, side):
    """side = -1 左（-X），+1 右（+X）。原点在髋关节。"""
    m = Matrix.Translation(Vector((side * X_LEG, 0.0, Z_HIP)))
    parts = []
    parts.append(tube('p_thigh', [
        (0.000, 0.062, 0.072),
        (-0.060, 0.061, 0.070),
        (-0.160, 0.057, 0.065),
        (-0.280, 0.050, 0.058),
        (-0.400, 0.044, 0.050),
        (-0.520, 0.039, 0.045),
        (-0.640, 0.034, 0.040),
        (-0.740, 0.030, 0.036),
        (-0.800, 0.029, 0.035),
    ], M['pants'], coll, power=2.7, matrix=m))

    # 鞋：从脚踝包到地面，鞋头朝 -Y
    parts.append(tube('p_shoe', [
        (-0.780, 0.038, 0.044, 0.000),
        (-0.828, 0.043, 0.070, -0.016),
        (-0.864, 0.046, 0.098, -0.028),
        (-0.890, 0.045, 0.106, -0.029),
        (-0.900, 0.040, 0.098, -0.027),
    ], M['cloth_dk'], coll, power=3.2, matrix=m))
    return parts


def build_arm(coll, M, side):
    """side = -1 左（-X），+1 右（+X）。原点在肩关节。A-pose 外张 14°。"""
    shoulder = Vector((side * X_SHOULDER, 0.0, Z_SHOULDER))
    rot = Matrix.Rotation(-side * ARM_TILT, 4, 'Y')
    m = Matrix.Translation(shoulder) @ rot
    parts = []
    parts.append(tube('p_sleeve', [
        (0.032, 0.010, 0.010),
        (0.022, 0.028, 0.028),
        (0.010, 0.040, 0.040),
        (0.000, 0.046, 0.046),
        (-0.060, 0.045, 0.045),
        (-0.150, 0.041, 0.041),
        (-0.250, 0.037, 0.037),
        (-0.350, 0.034, 0.034),
        (-0.450, 0.031, 0.031),
        (-0.530, 0.028, 0.028),
        (-0.548, 0.027, 0.027),
    ], M['cloth'], coll, power=2.4, matrix=m))

    parts.append(tube('p_hand', [
        (-0.540, 0.026, 0.027),
        (-0.562, 0.023, 0.034),
        (-0.586, 0.021, 0.038),
        (-0.606, 0.019, 0.038),
        (-0.613, 0.014, 0.031),
    ], M['skin'], coll, power=2.2, matrix=m))

    # 四根瘦手指
    for i, (yc, length, half_w) in enumerate((
            (-0.0255, 0.048, 0.0068),
            (-0.0085, 0.054, 0.0071),
            (0.0085, 0.050, 0.0068),
            (0.0255, 0.042, 0.0062))):
        parts.append(tube('p_finger_%d' % i, [
            (-0.600, 0.0068, half_w),
            (-0.600 - length * 0.42, 0.0066, half_w * 0.98),
            (-0.600 - length * 0.80, 0.0060, half_w * 0.88),
            (-0.600 - length, 0.0044, half_w * 0.62),
        ], M['skin'], coll, n=6, power=2.2,
            matrix=m @ Matrix.Translation(Vector((0.0, yc, 0.0)))))

    thumb_m = (m @ Matrix.Translation(Vector((0.0, -0.032, -0.575)))
               @ Matrix.Rotation(math.radians(-22.0), 4, 'X')
               @ Matrix.Rotation(math.radians(14.0), 4, 'Y'))
    parts.append(tube('p_thumb', [
        (0.000, 0.0086, 0.0092),
        (-0.018, 0.0082, 0.0088),
        (-0.034, 0.0074, 0.0080),
        (-0.045, 0.0058, 0.0062),
        (-0.050, 0.0036, 0.0040),
    ], M['skin'], coll, n=6, power=2.2, matrix=thumb_m))
    return parts


def build():
    purge()
    mats = {name: make_material(name, hexcol, rough) for name, hexcol, rough in MAT_SPECS}
    M = {'cloth': mats['Puppet_Cloth'], 'cloth_dk': mats['Puppet_Cloth_Dk'],
         'pants': mats['Puppet_Pants'], 'skin': mats['Puppet_Skin'],
         'ink': mats['Puppet_Ink']}

    coll = bpy.data.collections.new(COLL_NAME)
    bpy.context.scene.collection.children.link(coll)

    body = join(build_body(coll, M), 'Puppet_Body', (0.0, 0.0, 0.0))
    leg_l = join(build_leg(coll, M, -1), 'Puppet_Leg_L', (-X_LEG, 0.0, Z_HIP))
    leg_r = join(build_leg(coll, M, 1), 'Puppet_Leg_R', (X_LEG, 0.0, Z_HIP))
    arm_l = join(build_arm(coll, M, -1), 'Puppet_Arm_L', (-X_SHOULDER, 0.0, Z_SHOULDER))
    arm_r = join(build_arm(coll, M, 1), 'Puppet_Arm_R', (X_SHOULDER, 0.0, Z_SHOULDER))

    parts = [body, leg_l, leg_r, arm_l, arm_r]
    for ob in parts:
        ob.rotation_euler = (0.0, 0.0, 0.0)
        ob.scale = (1.0, 1.0, 1.0)

    # 平滑着色 + 保持硬边（鞋底）
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(65.0))
    except Exception:
        bpy.ops.object.shade_smooth()

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.25
    coll.objects.link(root)

    for ob in parts:
        ob.parent = root
    root['model'] = 'puppet'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#木偶'
    root['height_m'] = 1.752
    root['legs'] = ['Puppet_Leg_L', 'Puppet_Leg_R']
    root['arms'] = ['Puppet_Arm_L', 'Puppet_Arm_R']
    root['body'] = 'Puppet_Body'
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
        print('  %-16s verts=%4d tris=%4d origin=%s' % (
            ob.name, len(me.vertices), n_tris,
            tuple(round(c, 3) for c in ob.matrix_world.translation)))
    print('TOTAL tris=%d' % tris)
    print('bbox min=%s max=%s  height=%.3f' % (
        tuple(round(c, 3) for c in lo), tuple(round(c, 3) for c in hi),
        hi.z - lo.z))
    return root, parts, tris


def strip_scene_extras(path):
    """MCP 插件在导出时给 scene 塞了 blendermcp_server_running，从 glb 里去掉。"""
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
        written = str(pathlib.Path(tempfile.gettempdir()) / 'puppet_v01.glb')
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

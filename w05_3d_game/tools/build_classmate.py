"""在 Blender 里程序化搭「同学」（序章 / 尾声角色）。

规格来源：docs/model_prompts.md「## 同学」
- 身高 1.75 m，脚底贴地，A-pose，手臂略微离开躯干
- 短黑发、脸藏在暗处、深暖灰褐皮肤
- 深藏青旧外套、浅灰内领、深炭灰长裤、纯黑平底鞋
- 棕色帆布小书包，一个前袋 + 两条肩带，无花纹无徽章
- 低多边形、哑光、配色压低

和提示词的差异（有意为之）：提示词要求"单网格"，但同文档还要求进游戏后
按髋、肩拆成 4 个可转动物体。这里直接建成 5 个网格（躯干 + 左右腿 + 左右上臂），
每个物体的原点放在关节上，导出 glb 后就是游戏里可直接旋转的四个肢体。

用法：在 Blender 里 exec(open(r'...\\w05_3d_game\\tools\\build_classmate.py').read())
可重复执行：每次重建 Classmate 集合，再导出 assets/models/classmate_v01.glb。
"""
import math
import pathlib
import bpy
import bmesh
from mathutils import Matrix, Vector

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\classmate_v01.glb'
COLL_NAME = 'Classmate'
ROOT_NAME = 'Classmate'
# 建模在原点（脚底 z=0）。预览时整体挪开，避开场景里那棵树。
PREVIEW_LOCATION = (3.4, 0.0, 0.0)

# ---------------------------------------------------------------- materials
# glTF 的 baseColorFactor 是线性空间，Blender 的 Base Color 也是线性空间，
# 所以这里把 sRGB 十六进制转成线性再写进去，颜色和网页里看到的 #hex 一致。
MAT_SPECS = [
    ('Cloth_Navy',     '#252a3a', 0.86),   # 外套深藏青
    ('Cloth_Trim',     '#1a1e2a', 0.88),   # 拉链 / 暗部
    ('Pants_Charcoal', '#1d2026', 0.88),   # 长裤深灰
    ('Skin_Warm',      '#cba57f', 0.88),   # 黄种人肤色，偏暖
    ('Skin_Shadow',    '#b18f6e', 0.90),   # 眉下、鼻下、下唇下的软阴影
    ('Hair_Black',     '#17130f', 0.90),   # 头发与鞋
    ('Bag_Brown',      '#33291f', 0.82),   # 书包
    ('Collar_Pale',    '#a8a294', 0.60),   # 领口内搭
    ('Face_Shadow',    '#231a15', 0.95),   # 嘴、瞳孔，比皮肤暗一档
    ('Eye_Dark',       '#2b2018', 0.90),   # 眼窝：暗棕，浅肤色下别成黑洞
    ('Eye_White',      '#7a7166', 0.80),   # 眼白，压暗，夜里不发光
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
    # 视口纯色显示也用它，方便 solid 模式检查轮廓。
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


def ribbon(name, path, half_w, half_t, mat, coll):
    """沿折线扫出一根扁带（书包肩带、拉链）。"""
    pts = [Vector(p) for p in path]
    side_axis = Vector((1.0, 0.0, 0.0))
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        t.normalize()
        nrm = Vector((0.0, t.z, -t.y))
        if nrm.length < 1e-6:
            nrm = Vector((0.0, 1.0, 0.0))
        nrm.normalize()
        a = p - side_axis * half_w - nrm * half_t
        b = p + side_axis * half_w - nrm * half_t
        c = p + side_axis * half_w + nrm * half_t
        d = p - side_axis * half_w + nrm * half_t
        rings.append([tuple(a), tuple(b), tuple(c), tuple(d)])
    return loft(name, rings, mat, coll)


def plate(name, cx, cz, rx, rz, mat, coll, tilt=0.0, n=14, rings=(0.5, 1.0), depth=-0.17):
    """脸部的薄片：先在脸前面一张平的椭圆片，随后 shrinkwrap 贴到头面上。
    分两圈三角，投影后能贴住头部的棱面，不会陷进皮肤里。"""
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


def poly_plate(name, pts, cx, cz, mat, coll, depth=-0.17):
    """按给定轮廓（相对 cx/cz 的 (u, v) 点表）做一张薄片，中心扇形三角化。
    用来画不是椭圆的形状：杏仁眼、渐细的眉毛、嘴唇。"""
    verts = [(cx, depth, cz)]
    for u, v in pts:
        verts.append((cx + u, depth, cz + v))
    faces = [(0, 1 + i, 1 + (i + 1) % len(pts)) for i in range(len(pts))]
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
    if len(objs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name + '_mesh'
    fix_normals(ob)
    # 原点放到关节上：游戏中物体旋转的中心。先记住用户原来的游标位置。
    cursor_prev = bpy.context.scene.cursor.location.copy()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.context.scene.cursor.location = Vector(origin)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = cursor_prev
    return ob


# 身高 1.75 m 的关键高度
Z_TOP = 1.752
Z_HEAD_BOTTOM = 1.504
Z_NECK_TOP = 1.535
Z_SHOULDER = 1.400
Z_HIP = 0.895
Z_ANKLE = 0.095
X_LEG = 0.090
X_SHOULDER = 0.190
ARM_TILT = math.radians(13.0)


def build_head(coll, M):
    """同学的头（docs/model_prompts.md「同学 · 面部细化」）：
    窄下颌、小下巴、低颧骨、浅眉弓、太阳穴微凹；眼睛是疲惫的杏仁形，
    虹膜平顶压在上眼睑下；眉毛内端粗且略高；薄上唇 + 稍厚下唇。
    五官都是一层贴片（shrinkwrap 到头部表面），只有鼻子、耳、头发是实体。"""
    parts = []
    head = tube('p_head', [
        (1.5000, 0.0220, 0.0280),   # 下巴尖
        (1.5100, 0.0380, 0.0480),
        (1.5220, 0.0480, 0.0600),
        (1.5360, 0.0560, 0.0700),   # 下颌
        (1.5520, 0.0620, 0.0780),
        (1.5700, 0.0690, 0.0860),
        (1.5880, 0.0750, 0.0920),   # 低颧骨
        (1.6060, 0.0800, 0.0960),
        (1.6240, 0.0825, 0.0990),   # 眼位
        (1.6420, 0.0828, 0.1004),
        (1.6500, 0.0820, 0.1008),   # 眉弓
        (1.6580, 0.0812, 0.1012),
        (1.6720, 0.0800, 0.1006),   # 太阳穴微凹
        (1.6860, 0.0755, 0.0988),
        (1.7000, 0.0680, 0.0945),
        (1.7140, 0.0560, 0.0870),
        (1.7280, 0.0430, 0.0740),
        (1.7380, 0.0300, 0.0540),
        (1.7460, 0.0160, 0.0300),
        (1.7510, 0.0060, 0.0120),
    ], M['skin'], coll, n=16, rot=math.pi / 16, power=2.25)
    parts.append(head)

    def flat(name, pts, cx, cz, mat, offset):
        return shrink_onto(poly_plate(name, pts, cx, cz, mat, coll), head, offset=offset)

    def oval(name, cx, cz, rx, rz, mat, offset, n=12):
        return shrink_onto(plate(name, cx, cz, rx, rz, mat, coll, n=n), head, offset=offset)

    # 眼睛：杏仁形，内角低、上缘平（厚上眼睑）；虹膜平顶，顶到上眼睑，占半只眼
    eye = [(-0.0155, -0.0020), (-0.0125, 0.0016), (-0.0075, 0.0037), (-0.0010, 0.0044),
           (0.0060, 0.0039), (0.0125, 0.0018), (0.0150, -0.0002),
           (0.0095, -0.0038), (0.0020, -0.0052), (-0.0060, -0.0049), (-0.0120, -0.0032)]
    iris = [(-0.0072, 0.0043), (-0.0071, 0.0010), (-0.0050, -0.0024), (-0.0018, -0.0042),
            (0.0018, -0.0042), (0.0050, -0.0024), (0.0071, 0.0010), (0.0072, 0.0043)]
    # 眉毛：内端粗、外端细，内端抬高约 2 mm
    brow = [(-0.0210, 0.0022), (-0.0120, 0.0030), (-0.0020, 0.0029), (0.0090, 0.0020),
            (0.0190, 0.0006), (0.0185, -0.0009), (0.0090, -0.0013), (-0.0020, -0.0017),
            (-0.0120, -0.0022), (-0.0210, -0.0019)]
    brow = [(u, v - 0.10 * u) for u, v in brow]

    for sx in (-1, 1):
        ex = sx * 0.0375
        parts.append(flat('p_eye_%d' % sx, [(sx * u, v) for u, v in eye], ex, 1.6220,
                          M['sclera'], 0.0032))
        parts.append(flat('p_iris_%d' % sx, [(sx * u, v) for u, v in iris], ex, 1.6222,
                          M['eye'], 0.0046))
        parts.append(oval('p_browshadow_%d' % sx, ex, 1.6330, 0.0200, 0.0028,
                          M['skin_shadow'], 0.0025))
        parts.append(flat('p_brow_%d' % sx, [(sx * u, v) for u, v in brow],
                          sx * 0.0330, 1.6455, M['hair'], 0.0030))

    # 嘴：闭着，薄上唇 + 稍厚的下唇，嘴角收在脸颊里
    lips = [(-0.0210, 0.0004), (-0.0130, 0.0016), (-0.0060, 0.0027), (-0.0018, 0.0016),
            (0.0018, 0.0016), (0.0060, 0.0027), (0.0130, 0.0016), (0.0210, 0.0004),
            (0.0180, -0.0022), (0.0100, -0.0040), (0.0000, -0.0048), (-0.0100, -0.0040),
            (-0.0180, -0.0022)]
    parts.append(flat('p_lips', lips, 0.0, 1.5480, M['shadow'], 0.0030))

    # 鼻子：低鼻梁从两眉之间起，鼻头软，鼻翼宽度接近嘴宽
    parts.append(tube('p_nose', [
        (1.6660, 0.0055, 0.0045, -0.0865),
        (1.6460, 0.0080, 0.0075, -0.0915),
        (1.6260, 0.0105, 0.0105, -0.0965),
        (1.6080, 0.0135, 0.0135, -0.1010),
        (1.5950, 0.0175, 0.0150, -0.1030),
        (1.5880, 0.0170, 0.0100, -0.0985),
        (1.5820, 0.0120, 0.0060, -0.0930),
    ], M['skin'], coll, n=6, rot=math.pi / 6, power=2.0))
    for sx in (-1, 1):
        parts.append(oval('p_nostril_%d' % sx, sx * 0.0148, 1.5825, 0.0040, 0.0018,
                          M['shadow'], 0.0025, n=8))
    # 鼻下、下唇下的软阴影
    parts.append(oval('p_noseshadow', 0.0, 1.5765, 0.0130, 0.0028, M['skin_shadow'], 0.0025))
    parts.append(oval('p_lipshadow', 0.0, 1.5350, 0.0150, 0.0032, M['skin_shadow'], 0.0025))

    # 耳朵：只露出下半截，上半截和头发齐平；整体往后仰一点
    for sx in (-1, 1):
        ear_m = (Matrix.Translation(Vector((sx * 0.0782, 0.006, 1.5860)))
                 @ Matrix.Rotation(math.radians(-12.0), 4, 'X'))
        parts.append(tube('p_ear_%d' % sx, [
            (-0.0200, 0.0028, 0.0058),
            (-0.0090, 0.0046, 0.0095),
            (0.0030, 0.0058, 0.0115),
            (0.0140, 0.0048, 0.0100),
            (0.0220, 0.0030, 0.0060),
        ], M['skin'], coll, n=8, power=2.0, matrix=ear_m))

    # 头发：轮廓同 v01，前缘收进额头，1.67 以上才翻出来当刘海；
    # 耳朵那一圈收窄，让耳廓露出来。
    parts.append(tube('p_hair', [
        (1.5560, 0.0580, 0.0470, 0.0400),
        (1.5900, 0.0790, 0.0860, 0.0140),
        (1.6200, 0.0900, 0.1000, 0.0080),
        (1.6420, 0.0910, 0.1025, 0.0060),
        (1.6640, 0.0900, 0.1035, 0.0060),
        (1.6860, 0.0860, 0.1040, -0.0020),
        (1.7060, 0.0780, 0.0960, -0.0040),
        (1.7240, 0.0620, 0.0830, -0.0040),
        (1.7380, 0.0420, 0.0620, -0.0040),
        (1.7480, 0.0240, 0.0400, -0.0020),
        (1.7520, 0.0120, 0.0220, -0.0020),
    ], M['hair'], coll, n=16, rot=math.pi / 16, power=2.25))

    # 刘海打散：三撮很短的碎发挂在发际线上，别是一条齐平的横线
    for i, (tx, ty, z0, z1, hw0) in enumerate((
            (-0.0320, -0.0990, 1.7020, 1.6810, 0.0080),
            (0.0050, -0.1010, 1.7040, 1.6770, 0.0090),
            (0.0350, -0.0965, 1.7000, 1.6830, 0.0068))):
        parts.append(tube('p_fringe_%d' % i, [
            (z0, hw0, 0.0060),
            (z0 - (z0 - z1) * 0.55, hw0 * 0.78, 0.0052),
            (z1, hw0 * 0.22, 0.0026),
        ], M['hair'], coll, n=6, rot=math.pi / 6, power=2.0,
            matrix=Matrix.Translation(Vector((tx, ty, 0.0)))))

    return parts


def build_body(coll, M):
    parts = []

    # 胯：长裤
    parts.append(tube('p_pelvis', [
        (0.812, 0.128, 0.082),
        (0.860, 0.152, 0.098),
        (0.930, 0.156, 0.103),
        (0.998, 0.146, 0.098),
    ], M['pants'], coll, power=3.0))

    # 躯干：外套，下摆略外扩，肩最宽，向上收到领口
    parts.append(tube('p_torso', [
        (0.972, 0.148, 0.098),
        (1.000, 0.152, 0.101),
        (1.070, 0.150, 0.103),
        (1.170, 0.160, 0.108),
        (1.270, 0.172, 0.112),
        (1.360, 0.196, 0.110),
        (1.408, 0.202, 0.104),
        (1.436, 0.182, 0.094),
        (1.456, 0.140, 0.080),
        (1.468, 0.100, 0.066),
    ], M['cloth'], coll, power=3.2))

    # 肩球：挡住抬臂时袖子和躯干之间的缝（藏在袖子里，只做关节填充）
    for sx in (-1, 1):
        parts.append(tube('p_shoulder_%d' % sx, [
            (Z_SHOULDER - 0.050, 0.016, 0.016),
            (Z_SHOULDER - 0.030, 0.040, 0.040),
            (Z_SHOULDER - 0.010, 0.050, 0.049),
            (Z_SHOULDER + 0.018, 0.043, 0.042),
            (Z_SHOULDER + 0.040, 0.016, 0.016),
        ], M['cloth'], coll, n=10, rot=0.0, power=2.0,
            matrix=Matrix.Translation(Vector((sx * X_SHOULDER, 0.0, 0.0)))))

    # 胯球：腿根部，转动时不露洞，半径压到和胯同宽
    for sx in (-1, 1):
        parts.append(tube('p_hip_%d' % sx, [
            (Z_HIP - 0.060, 0.016, 0.016),
            (Z_HIP - 0.038, 0.048, 0.050),
            (Z_HIP - 0.008, 0.062, 0.064),
            (Z_HIP + 0.024, 0.055, 0.057),
            (Z_HIP + 0.048, 0.018, 0.018),
        ], M['pants'], coll, n=10, rot=0.0, power=2.0,
            matrix=Matrix.Translation(Vector((sx * X_LEG, 0.0, 0.0)))))

    # 脖子
    parts.append(tube('p_neck', [
        (1.432, 0.052, 0.054),
        (1.480, 0.049, 0.051),
        (Z_NECK_TOP, 0.046, 0.048),
    ], M['skin'], coll, n=10, power=2.2))

    # 浅灰内领
    parts.append(tube('p_collar', [
        (1.430, 0.070, 0.074),
        (1.458, 0.066, 0.070),
        (1.490, 0.058, 0.062),
    ], M['collar'], coll, n=10, power=2.2))

    # 头和头发单独成物体（Classmate_Head），在 build() 里挂到身体下

    parts.append(ribbon('p_zip', [
        (0.0, -0.095, 1.442),
        (0.0, -0.116, 1.360),
        (0.0, -0.118, 1.270),
        (0.0, -0.114, 1.170),
        (0.0, -0.109, 1.060),
        (0.0, -0.105, 0.985),
    ], 0.009, 0.004, M['trim'], coll))

    # 书包主体：贴着后背
    parts.append(tube('p_bag', [
        (0.985, 0.112, 0.050, 0.163),
        (1.040, 0.126, 0.058, 0.168),
        (1.240, 0.126, 0.058, 0.170),
        (1.330, 0.108, 0.048, 0.166),
    ], M['bag'], coll, power=4.5))

    # 书包外袋
    parts.append(tube('p_bag_pocket', [
        (1.020, 0.058, 0.016, 0.222),
        (1.045, 0.068, 0.020, 0.226),
        (1.120, 0.068, 0.020, 0.226),
        (1.140, 0.056, 0.015, 0.222),
    ], M['bag'], coll, power=4.5))

    # 两条肩带：从书包顶越过肩膀，贴胸前落到下胸，末端一颗小卡扣
    for sx in (-1, 1):
        x = sx * 0.104
        parts.append(ribbon('p_strap_%d' % sx, [
            (sx * 0.100, 0.150, 1.305),
            (x, 0.120, 1.400),
            (x, 0.096, 1.446),
            (x, 0.046, 1.470),
            (x, -0.014, 1.471),
            (x, -0.072, 1.448),
            (x, -0.115, 1.385),
            (sx * 0.100, -0.117, 1.295),
            (sx * 0.092, -0.114, 1.195),
        ], 0.013, 0.006, M['bag'], coll))
        parts.append(box('p_buckle_%d' % sx, (sx * 0.093, -0.115, 1.187),
                         (0.034, 0.012, 0.026), M['trim'], coll))

    return parts


def build_leg(coll, M, side):
    """side = -1 左（-X），+1 右（+X）。
    按「拆出关节」那节：大腿 / 小腿 / 鞋分成三段，各自封闭，
    接缝落在膝关节 0.445 和踝关节 0.095，旋转时不会露洞。"""
    hip_x = side * X_LEG
    m = Matrix.Translation(Vector((hip_x, 0.0, Z_HIP)))
    # 膝关节在髋下 0.45 m → 0.445；踝在膝下 0.35 m → 0.095
    knee = -0.450
    ankle = -0.800
    thigh = [tube('p_thigh', [
        (0.000, 0.078, 0.088),
        (-0.070, 0.074, 0.084),
        (-0.170, 0.067, 0.077),
        (-0.280, 0.060, 0.068),
        (-0.400, 0.053, 0.059),
        (-0.455, 0.0506, 0.0566),   # 略微越过膝关节，接缝不共面
    ], M['pants'], coll, power=2.7, matrix=m)]
    shin = [tube('p_shin', [
        (-0.445, 0.0514, 0.0574),
        (-0.470, 0.050, 0.056),
        (-0.560, 0.049, 0.058),
        (-0.680, 0.042, 0.049),
        (-0.780, 0.035, 0.042),
        (ankle, 0.034, 0.040),
    ], M['pants'], coll, power=2.7, matrix=m)]
    # 鞋：从脚踝包到地面，鞋头朝 -Y
    foot = [tube('p_shoe', [
        (-0.790, 0.045, 0.050, 0.000),
        (-0.840, 0.050, 0.078, -0.020),
        (-0.872, 0.054, 0.108, -0.032),
        (-0.890, 0.053, 0.118, -0.033),
        (-0.895, 0.049, 0.112, -0.031),
    ], M['hair'], coll, power=3.2, matrix=m)]
    return {'thigh': thigh, 'shin': shin, 'foot': foot}


def build_arm(coll, M, side):
    """side = -1 左（-X），+1 右（+X）。A-pose 外张 13°。
    上臂 / 前臂 / 手分成三段：肘在肩下 0.30 m，腕在肘下 0.25 m。"""
    shoulder = Vector((side * X_SHOULDER, 0.0, Z_SHOULDER))
    rot = Matrix.Rotation(-side * ARM_TILT, 4, 'Y')
    m = Matrix.Translation(shoulder) @ rot
    elbow = -0.300
    wrist = -0.550
    upper = [tube('p_upper', [
        (0.000, 0.055, 0.055),
        (-0.060, 0.052, 0.053),
        (-0.150, 0.048, 0.049),
        (-0.250, 0.044, 0.045),
        (-0.305, 0.0419, 0.0429),   # 略微越过肘关节，接缝不共面
    ], M['cloth'], coll, power=2.4, matrix=m)]
    forearm = [tube('p_forearm', [
        (-0.295, 0.0421, 0.0431),
        (-0.380, 0.039, 0.040),
        (-0.470, 0.035, 0.036),
        (-0.545, 0.031, 0.032),
        (-0.562, 0.030, 0.031),
    ], M['cloth'], coll, power=2.4, matrix=m)]
    hand = []
    # 手掌：手腕到指根，掌心朝内（贴大腿）
    hand.append(tube('p_hand', [
        (-0.552, 0.029, 0.030),
        (-0.583, 0.026, 0.040),
        (-0.606, 0.024, 0.044),
        (-0.626, 0.022, 0.044),
        (-0.634, 0.017, 0.037),
    ], M['skin'], coll, power=2.2, matrix=m))

    # 四根手指：只在轮廓上分得开就行，长度按食指/中指/无名指/小指
    for i, (yc, length, half_w) in enumerate((
            (-0.0295, 0.060, 0.0086),
            (-0.0098, 0.066, 0.0089),
            (0.0102, 0.062, 0.0086),
            (0.0300, 0.052, 0.0079))):
        hand.append(tube('p_finger_%d' % i, [
            (-0.622, 0.0082, half_w),
            (-0.622 - length * 0.42, 0.0081, half_w * 0.99),
            (-0.622 - length * 0.80, 0.0074, half_w * 0.90),
            (-0.622 - length, 0.0055, half_w * 0.68),
        ], M['skin'], coll, n=6, power=2.2,
            matrix=m @ Matrix.Translation(Vector((0.0, yc, 0.0)))))

    # 拇指：从掌面前缘斜着往前下方伸，并往掌侧偏一点
    thumb_m = (m @ Matrix.Translation(Vector((0.0, -0.038, -0.590)))
               @ Matrix.Rotation(math.radians(-24.0), 4, 'X')
               @ Matrix.Rotation(math.radians(14.0), 4, 'Y'))
    hand.append(tube('p_thumb', [
        (0.000, 0.0102, 0.0110),
        (-0.020, 0.0098, 0.0106),
        (-0.038, 0.0088, 0.0096),
        (-0.050, 0.0070, 0.0076),
        (-0.056, 0.0044, 0.0048),
    ], M['skin'], coll, n=6, power=2.2, matrix=thumb_m))
    return {'upper': upper, 'forearm': forearm, 'hand': hand}


def build():
    purge()
    mats = {name: make_material(name, hexcol, rough) for name, hexcol, rough in MAT_SPECS}
    M = {'cloth': mats['Cloth_Navy'], 'trim': mats['Cloth_Trim'],
         'pants': mats['Pants_Charcoal'], 'skin': mats['Skin_Warm'],
         'hair': mats['Hair_Black'], 'bag': mats['Bag_Brown'],
         'collar': mats['Collar_Pale'], 'shadow': mats['Face_Shadow'],
         'eye': mats['Eye_Dark'], 'sclera': mats['Eye_White'],
         'skin_shadow': mats['Skin_Shadow']}

    coll = bpy.data.collections.new(COLL_NAME)
    bpy.context.scene.collection.children.link(coll)

    # ── 拆关节（docs/model_prompts.md「同学与木偶 · 拆出关节」）──
    # 身体在脚底，头挂在脖子 1.535；腿是 大腿→小腿→脚，手是 上臂→前臂→手，
    # 每段原点落在关节上，静止姿势旋转为零。
    body = join(build_body(coll, M), 'Classmate_Body', (0.0, 0.0, 0.0))
    head = join(build_head(coll, M), 'Classmate_Head', (0.0, 0.0, Z_NECK_TOP))

    limbs = {}
    for side, tag in ((-1, 'L'), (1, 'R')):
        hip = Vector((side * X_LEG, 0.0, Z_HIP))
        leg_parts = build_leg(coll, M, side)
        leg = join(leg_parts['thigh'], 'Classmate_Leg_' + tag, tuple(hip))
        shin = join(leg_parts['shin'], 'Classmate_Shin_' + tag, (hip.x, 0.0, Z_HIP - 0.450))
        foot = join(leg_parts['foot'], 'Classmate_Foot_' + tag, (hip.x, 0.0, Z_HIP - 0.800))

        arm_parts = build_arm(coll, M, side)
        shoulder = Vector((side * X_SHOULDER, 0.0, Z_SHOULDER))
        arm_m = Matrix.Translation(shoulder) @ Matrix.Rotation(-side * ARM_TILT, 4, 'Y')
        elbow = arm_m @ Vector((0.0, 0.0, -0.300))
        wrist = arm_m @ Vector((0.0, 0.0, -0.550))
        arm = join(arm_parts['upper'], 'Classmate_Arm_' + tag, tuple(shoulder))
        forearm = join(arm_parts['forearm'], 'Classmate_Forearm_' + tag, tuple(elbow))
        hand = join(arm_parts['hand'], 'Classmate_Hand_' + tag, tuple(wrist))
        limbs[tag] = (leg, shin, foot, arm, forearm, hand)

    parts = [body, head]
    for tag in ('L', 'R'):
        parts.extend(limbs[tag])
    for ob in parts:
        ob.rotation_euler = (0.0, 0.0, 0.0)
        ob.scale = (1.0, 1.0, 1.0)

    # 平滑着色，只留 ~90° 的硬边（盒子的棱、鞋底）。65° 会把额头、下颌这些
    # 大曲率过渡也切硬，看起来一条条亮带。
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = body
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(86.0))
    except Exception:
        bpy.ops.object.shade_smooth()

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.25
    coll.objects.link(root)

    def attach(child, parent):
        """挂父子但保持世界位置，导出后 glb 里也是同一套层级。"""
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_world.inverted()

    for ob in (body, limbs['L'][0], limbs['R'][0], limbs['L'][3], limbs['R'][3]):
        attach(ob, root)
    attach(head, body)
    for tag in ('L', 'R'):
        leg, shin, foot, arm, forearm, hand = limbs[tag]
        attach(shin, leg)
        attach(foot, shin)
        attach(forearm, arm)
        attach(hand, forearm)

    root['model'] = 'classmate'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#同学与木偶-拆出关节'
    root['height_m'] = 1.752
    root['body'] = body.name
    root['head'] = head.name
    root['legs'] = [limbs['L'][0].name, limbs['R'][0].name]
    root['shins'] = [limbs['L'][1].name, limbs['R'][1].name]
    root['feet'] = [limbs['L'][2].name, limbs['R'][2].name]
    root['arms'] = [limbs['L'][3].name, limbs['R'][3].name]
    root['forearms'] = [limbs['L'][4].name, limbs['R'][4].name]
    root['hands'] = [limbs['L'][5].name, limbs['R'][5].name]
    root['up_axis'] = 'Y'

    roles = {'Classmate_Body': 'body', 'Classmate_Head': 'head'}
    for tag in ('L', 'R'):
        roles['Classmate_Leg_' + tag] = 'leg'
        roles['Classmate_Shin_' + tag] = 'shin'
        roles['Classmate_Foot_' + tag] = 'foot'
        roles['Classmate_Arm_' + tag] = 'arm'
        roles['Classmate_Forearm_' + tag] = 'forearm'
        roles['Classmate_Hand_' + tag] = 'hand'
    for ob in parts:
        ob['role'] = roles.get(ob.name, 'body')

    root.location = PREVIEW_LOCATION
    bpy.context.view_layer.update()

    # 统计
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
        # 先探一下能不能写：工作区的 ACL 只放行 DSH 的进程，
        # Blender 直接写 Desktop 下的目录会 PermissionError。
        with open(written, 'wb'):
            pass
    except OSError:
        import tempfile
        written = str(pathlib.Path(tempfile.gettempdir()) / 'classmate_v01.glb')
        print('workspace write denied, exporting to', written)
    kwargs['filepath'] = written
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(written)
    size = pathlib.Path(written).stat().st_size
    root.location = PREVIEW_LOCATION
    bpy.context.view_layer.update()
    print('exported', written, size, 'bytes')
    return written


if __name__ == '__main__':
    _root, _parts, _tris = build()
    _glb = export_glb(_root, _parts)

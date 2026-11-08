"""第五关的咧嘴的牙（docs/model_prompts.md「## 第五关 · 咧嘴的牙」）。

规格（照提示词逐条落）：
  · 一整排牙单独浮在空处，宽约 0.90 m；
  · 上排 9 颗牙根在上、牙尖朝下；下排 8 颗牙根在下、牙尖朝上；
    两排沿 X 交错半个牙距，牙尖互相咬合；
  · 整排沿抛物线 y = 0.20 · u² 排布，嘴角比中间高 0.20 m；
  · 污褐色 #4a2a20，不是白牙；短、钝，没有尖牙；
  · 没有嘴唇、没有牙龈、没有脸、没有眼睛；
  · 单网格（9 + 8 = 17 颗牙是同一个 mesh 的 17 个封闭岛），< 3000 三角。

坐标：
  · 局部原点在包围盒中心；Blender 里正面朝 -Y，导出 glTF（Y-up）后正面朝 +Z。
  · X 是宽度（正好 0.90 m）；Z 是上下；Y 是牙尖朝外的方向，总厚约 5.7 cm。
  · 游戏里的落点（anomalies.js）：包围盒中心 (0, 2.035, -5.900)，
    和原来程序化那排牙的位置重合。

颜色：
  · 材质底色 #4a2a20（线性空间写进 Base Color）；
  · 顶点色 'Col' 是 0.45–1.00 的乘数：牙根最暗、牙尖略亮，朝前的一侧比背面亮，
    每颗牙另有轻微色差和竖向污渍条纹。glTF 里就是 baseColorFactor × COLOR_0，
    顶点色丢了也只是一排更暗的牙，不会变白。

用法：
  Blender 里 exec(open(r'...\\tools\\build_teeth.py').read())
  或 blender -b --factory-startup -P tools/build_teeth.py
输出 assets/models/teeth_v01.glb（glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco）。
"""
import json
import math
import pathlib
import random
import struct

import bmesh
import bpy
from mathutils import Vector

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\teeth_v01.glb'
COLL_NAME = 'GrinTeeth'
ROOT_NAME = 'GrinTeeth'
MESH_NAME = 'GrinTeeth_Mesh'

GRIN_W = 0.90            # 整排宽（提示词：about 0.9 meters）
GRIN_LIFT = 0.20         # 嘴角相对中间抬高多少（和 anomalies.js 的 GRIN_LIFT 一致）
Z_BOW = 0.012            # 嘴角往脸侧收多少，让整排有一点弧
UPPER_COUNT = 9
LOWER_COUNT = 8
CENTER_X = 0.412         # 最外侧牙的中心（牙厚会让包围盒正好到 ±0.45 附近）
UPPER_ROOT_DY = 0.115    # 上排牙根在笑弧上方
UPPER_TIP_DY = 0.006     # 上排牙尖停在笑弧上方一点，两排之间留一道暗缝
LOWER_ROOT_DY = -0.125
LOWER_TIP_DY = -0.006
SIDES = 10
COLOR = '#4a2a20'

# 每颗牙的根宽（米）。中间的门牙最宽，往两边略窄，再往外又宽一点。
UPPER_WIDTHS = [0.080, 0.084, 0.088, 0.082, 0.078, 0.082, 0.088, 0.084, 0.080]
LOWER_WIDTHS = [0.074, 0.080, 0.084, 0.074, 0.074, 0.084, 0.080, 0.074]


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _rgb(hexstr):
    h = hexstr.lstrip('#')
    return (_srgb_to_linear(int(h[0:2], 16)),
            _srgb_to_linear(int(h[2:4], 16)),
            _srgb_to_linear(int(h[4:6], 16)))


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def smile_y(u):
    """笑弧：u = -1..1，中间低、嘴角高。"""
    return GRIN_LIFT * u * u


def tooth_frame(base, tip):
    """返回 (w, side, front)：w 是牙根→牙尖，side 是牙宽方向，front 是朝外（Blender -Y）。"""
    w = (tip - base).normalized()
    front = Vector((0.0, -1.0, 0.0))
    side = front.cross(w)
    if side.length < 1e-6:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    front = w.cross(side).normalized()
    return w, side, front


def add_tooth(bm, colors, base, tip, width, depth, tone, phase, roll):
    """在 bm 里长一颗牙。牙根在 base、牙尖在 tip；截面是圆角矩形。"""
    w, side, front = tooth_frame(base, tip)

    # 牙根→牙尖的六个环：根最宽，牙尖收到 52%（宽而钝的咬合边，不是锥子）
    ts = (0.0, 0.25, 0.50, 0.72, 0.89, 1.0)
    scales = (1.0, 0.96, 0.89, 0.79, 0.66, 0.52)
    bow = 0.0025

    rings = []
    for ring_i, (t, s) in enumerate(zip(ts, scales)):
        center = (base.lerp(tip, t)
                  + front * (bow * math.sin(math.pi * t)))
        rx = width * 0.5 * s
        rz = depth * 0.5 * s
        bulge = 0.0045 * math.sin(math.pi * t)
        ring = []
        for j in range(SIDES):
            ang = 2.0 * math.pi * j / SIDES + roll
            ca, sa = math.cos(ang), math.sin(ang)
            # 超椭圆（n≈3）：方一点的截面，像门牙不像钉子
            ex = math.copysign(abs(ca) ** (2.0 / 3.0), ca)
            ez = math.copysign(abs(sa) ** (2.0 / 3.0), sa)
            # 唇面微微鼓出来，别让正脸是一块平板
            push = bulge * (max(0.0, sa) ** 1.4)
            pos = center + side * (ex * rx) + front * (ez * rz + push)
            v = bm.verts.new(pos)

            # ---- 顶点色（乘数） ----
            # 根暗、尖亮；朝外的一侧亮、背面暗；每颗牙自己的色差；竖向污渍条纹。
            k_height = 0.55 + 0.45 * (t ** 0.85)
            k_front = 0.74 + 0.24 * max(0.0, sa)
            k_streak = 1.0 - 0.07 * (0.5 + 0.5 * math.cos(5.0 * ang + phase))
            k = k_height * k_front * k_streak * tone
            k = clamp(k, 0.45, 1.0)
            g = clamp(k * (0.94 + 0.04 * math.sin(phase + 1.7)), 0.0, 1.0)
            b = clamp(k * (0.88 + 0.05 * math.cos(phase * 1.3)), 0.0, 1.0)
            colors.append((k, g, b, 1.0))
            ring.append(v)
        rings.append(ring)

    # 侧面：环与环之间连四边形
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(SIDES):
            j2 = (j + 1) % SIDES
            bm.faces.new((a[j], a[j2], b[j2], b[j]))

    # 两端封口：牙根和牙尖各一个 n 边形，导出时三角化
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))


def make_material():
    mat = bpy.data.materials.get('Tooth_Stain')
    if mat is None:
        mat = bpy.data.materials.new('Tooth_Stain')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    color = _rgb(COLOR)
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.94
    # 顶点色只做乘数：glTF 导出成 baseColorFactor(=COLOR) × COLOR_0。
    vc = nt.nodes.get('ToothVertexColor')
    if vc is None:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.name = 'ToothVertexColor'
    vc.layer_name = 'Col'
    mix = nt.nodes.get('ToothBaseMix')
    if mix is None:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.name = 'ToothBaseMix'
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*color, 1.0)
    nt.links.new(vc.outputs['Color'], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    mat.use_backface_culling = True
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = 0.94
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
    rng = random.Random(20251107)
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    clear_collection(coll)

    bm = bmesh.new()
    colors = []

    # ---- 上排：9 颗，牙根在上、牙尖朝下 ----
    for k in range(UPPER_COUNT):
        u = -1.0 + 2.0 * k / (UPPER_COUNT - 1)
        x = u * CENTER_X
        z = smile_y(u)
        y = Z_BOW * u * u
        width = UPPER_WIDTHS[k] * (0.97 + 0.06 * rng.random())
        depth = width * (0.34 + 0.05 * rng.random())
        root = Vector((x + (rng.random() - 0.5) * 0.004,
                       y + 0.004 + (rng.random() - 0.5) * 0.004,
                       z + UPPER_ROOT_DY + (rng.random() - 0.5) * 0.008))
        tip = Vector((x * 1.035 + (rng.random() - 0.5) * 0.008,
                      y - 0.018,
                      z + UPPER_TIP_DY + (rng.random() - 0.5) * 0.032))
        tone = 0.62 + 0.38 * rng.random()
        phase = rng.random() * math.tau
        roll = (rng.random() - 0.5) * math.radians(14.0)
        add_tooth(bm, colors, root, tip, width, depth, tone, phase, roll)

    # ---- 下排：8 颗，牙根在下、牙尖朝上，和上排错开半个牙距 ----
    for k in range(LOWER_COUNT):
        u = -1.0 + (2.0 * k + 1.0) / LOWER_COUNT
        x = u * CENTER_X
        z = smile_y(u)
        y = Z_BOW * u * u
        width = LOWER_WIDTHS[k] * (0.97 + 0.06 * rng.random())
        depth = width * (0.34 + 0.05 * rng.random())
        root = Vector((x + (rng.random() - 0.5) * 0.004,
                       y + 0.004 + (rng.random() - 0.5) * 0.004,
                       z + LOWER_ROOT_DY + (rng.random() - 0.5) * 0.008))
        tip = Vector((x * 1.030 + (rng.random() - 0.5) * 0.008,
                      y - 0.016,
                      z + LOWER_TIP_DY + (rng.random() - 0.5) * 0.028))
        tone = 0.62 + 0.38 * rng.random()
        phase = rng.random() * math.tau
        roll = (rng.random() - 0.5) * math.radians(14.0)
        add_tooth(bm, colors, root, tip, width, depth, tone, phase, roll)

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # ---- 把整排缩放到正好 0.90 m 宽，并把包围盒中心挪到原点 ----
    xs = [v.co.x for v in bm.verts]
    raw_w = max(xs) - min(xs)
    sx = GRIN_W / raw_w
    for v in bm.verts:
        v.co.x *= sx
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    cx = 0.5 * (max(xs) + min(xs))
    cy = 0.5 * (max(ys) + min(ys))
    cz = 0.5 * (max(zs) + min(zs))
    for v in bm.verts:
        v.co.x -= cx
        v.co.y -= cy
        v.co.z -= cz

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.verts.index_update()

    me = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(me)
    bm.free()
    me.update()

    # ---- 顶点色：用建牙时记下的顺序（bmesh 顶点顺序和 me.vertices 一致） ----
    col = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    assert len(colors) == len(me.vertices), (len(colors), len(me.vertices))
    for i, rgba in enumerate(colors):
        col.data[i].color = rgba
    me.color_attributes.active_color = col

    # 牙面平滑、两端的封口平直：钝头不会糊成一团
    for p in me.polygons:
        p.use_smooth = len(p.vertices) == 4

    me.materials.append(make_material())

    ob = bpy.data.objects.new(MESH_NAME, me)
    coll.objects.link(ob)
    ob['role'] = 'grin_teeth'
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ob['triangles'] = tris
    ob['tooth_count'] = UPPER_COUNT + LOWER_COUNT

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.15
    coll.objects.link(root)
    ob.parent = root
    bpy.context.view_layer.update()

    # ---- 尺寸（Blender: X 宽 / Z 高 / Y 厚） ----
    bb = [v.co for v in me.vertices]
    mn = (min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))
    mx = (max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb))
    w, h, d = mx[0] - mn[0], mx[2] - mn[2], mx[1] - mn[1]

    root['model'] = 'grin-teeth'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#第五关 · 咧嘴的牙'
    root['upper_teeth'] = UPPER_COUNT
    root['lower_teeth'] = LOWER_COUNT
    root['tooth_count'] = UPPER_COUNT + LOWER_COUNT
    root['size_w_m'] = round(w, 4)
    root['size_h_m'] = round(h, 4)
    root['size_d_m'] = round(d, 4)
    root['grin_lift_m'] = GRIN_LIFT
    root['color'] = COLOR
    root['up_axis'] = 'Y'
    root['front_axis'] = '+Z (glTF) / -Y (Blender)'
    root['mesh_count'] = 1
    root['triangles'] = tris

    # ---- 自检：封闭、边界、孤立点、17 个岛 ----
    chk = bmesh.new()
    chk.from_mesh(me)
    non_manifold = sum(1 for e in chk.edges if not e.is_manifold)
    boundary = sum(1 for e in chk.edges if e.is_boundary)
    loose = sum(1 for v in chk.verts if not v.link_edges)

    chk.verts.ensure_lookup_table()
    seen = set()
    islands = 0
    for v in chk.verts:
        if v.index in seen:
            continue
        islands += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
    chk.free()

    print('  verts=%d faces=%d tris=%d' % (len(me.vertices), len(me.polygons), tris))
    print('  bbox x[%.4f,%.4f] y[%.4f,%.4f] z[%.4f,%.4f]'
          % (mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]))
    print('  size  W=%.4f  H=%.4f  D=%.4f  (want %.3f, height/depth free)'
          % (w, h, d, GRIN_W))
    print('  health non_manifold=%d boundary=%d loose=%d islands=%d'
          % (non_manifold, boundary, loose, islands))
    print('  teeth upper=%d lower=%d  corners lifted %.3f m'
          % (UPPER_COUNT, LOWER_COUNT, GRIN_LIFT))
    assert abs(w - GRIN_W) < 0.0005, 'width'
    assert tris < 3000, 'tri budget'
    assert non_manifold == 0 and boundary == 0 and loose == 0, 'topology'
    assert islands == UPPER_COUNT + LOWER_COUNT, 'tooth islands'
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
    print('  glb: COLOR_0=%s  baseColor=%s' % ('COLOR_0' in attrs, COLOR))
    assert 'COLOR_0' in attrs
    assert len(meshes) == 1
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
        written = str(pathlib.Path(tempfile.gettempdir()) / 'teeth_v01.glb')
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

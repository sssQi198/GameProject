"""第五关的眼睛：两颗红色发光眼球（docs/model_prompts.md「## 第五关 · 眼睛」）。

规格（照提示词逐条落）：
  · 只有两颗球，没有眼睑、瞳孔、脸、身体；
  · 每只直径 0.174 m（半径 0.087），两眼球心相距 0.38 m（x = ±0.19）；
  · 平涂自发光红 #ff2030（Linear 空间写进材质，网页里就是 #ff2030）；
  · 两个独立网格、极低面数（20 × 12 段，每只 440 三角）。

坐标：
  · 模型局部原点在**两眼连线中点**，所以整对可以用一个节点摆进场景；
  · 眼睛在游戏里的高度 2.42 m 由放置决定（见 root['eye_y_m']），不烘进网格。
    这样第 5 关把根节点放到 (EYE_CX, 2.42, -5.981) 就和程序化版本完全重合。

用法：
  Blender 里 exec(open(r'...\\tools\\build_eyes.py').read())
  或 blender -b --factory-startup -P tools/build_eyes.py
输出 assets/models/eyes_v01.glb（glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco）。
"""
import math
import pathlib

import bmesh
import bpy

OUT_GLB = r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\assets\models\eyes_v01.glb'
COLL_NAME = 'Eyes'
ROOT_NAME = 'Eyes'

EYE_R = 0.087          # 半径；直径 0.174
EYE_DX = 0.19          # 半间距；两眼中心距 0.38
EYE_Y_M = 2.42         # 提示词给的球心高度（第 5 关竖直裂缝上段）
SEGMENTS = 20          # 经线
RINGS = 12             # 纬线（含两极）
EYE_COLOR = '#ff2030'


def _srgb_to_linear(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _rgba(hexstr):
    h = hexstr.lstrip('#')
    return (_srgb_to_linear(int(h[0:2], 16)),
            _srgb_to_linear(int(h[2:4], 16)),
            _srgb_to_linear(int(h[4:6], 16)), 1.0)


def make_eye_material():
    """哑光黑底 + #ff2030 自发光：加了灯也不会出现高光，读数就是一个纯色红球。"""
    mat = bpy.data.materials.get('Eye_Glow')
    if mat is None:
        mat = bpy.data.materials.new('Eye_Glow')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    color = _rgba(EYE_COLOR)
    bsdf.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 1.0
    # Specular IOR Level 保持默认 0.5：改成 0 的话 Blender 会额外导出一个
    # KHR_materials_specular 扩展，而这里只想留一个干净的 emissive 材质。
    bsdf.inputs['Emission Color'].default_value = color
    bsdf.inputs['Emission Strength'].default_value = 1.0
    # 球体只需要正面；不设这个，glTF 会写成 doubleSided。
    mat.use_backface_culling = True
    mat.diffuse_color = color
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


def make_eye(name, side, mat, coll, x):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=SEGMENTS, v_segments=RINGS, radius=EYE_R)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location = (x, 0.0, 0.0)
    ob['role'] = 'eye'
    ob['side'] = side
    return ob


def build():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    clear_collection(coll)

    mat = make_eye_material()
    eye_l = make_eye('Eye_L', 'L', mat, coll, -EYE_DX)
    eye_r = make_eye('Eye_R', 'R', mat, coll, EYE_DX)

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.09
    coll.objects.link(root)
    bpy.context.view_layer.update()

    for child in (eye_l, eye_r):
        child.parent = root
        child.matrix_parent_inverse = root.matrix_world.inverted()

    root['model'] = 'eyes'
    root['spec'] = 'w05_3d_game/docs/model_prompts.md#第五关 · 眼睛'
    root['eyes'] = ['Eye_L', 'Eye_R']
    root['diameter_m'] = round(EYE_R * 2.0, 4)
    root['spacing_m'] = round(EYE_DX * 2.0, 4)
    root['eye_y_m'] = EYE_Y_M
    root['color'] = EYE_COLOR
    root['up_axis'] = 'Y'

    bpy.context.view_layer.update()

    tris = 0
    for ob in (eye_l, eye_r):
        n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        tris += n
        print('  %-6s verts=%3d tris=%3d origin=%s' % (
            ob.name, len(ob.data.vertices), n,
            tuple(round(c, 3) for c in ob.matrix_world.translation)))
    print('TOTAL tris=%d' % tris)
    return root, (eye_l, eye_r), tris


def strip_scene_extras(path):
    """MCP 插件会给 scene 写 extras，导出的 glb 里不该带。"""
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
        written = str(pathlib.Path(tempfile.gettempdir()) / 'eyes_v01.glb')
        print('workspace write denied, exporting to', written)
    kwargs['filepath'] = written
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(written)
    size = pathlib.Path(written).stat().st_size
    print('exported', written, size, 'bytes')
    return written


def _main():
    root, parts, _tris = build()
    export_glb(root, parts)


if globals().get('__name__', '__main__') == '__main__':
    _main()

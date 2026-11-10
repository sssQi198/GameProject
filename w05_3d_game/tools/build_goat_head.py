"""第 2 关后墙的山羊头（公羊头骨）——由 Megascans 扫描转成游戏用的 glb。

源资产：Quixel Megascans「Ram Skull」(asset id tiiief2fa)，tier 2 中模 FBX，
13,643 三角、封闭流形。原始 2K 贴图缩到 1K，随 glb 内嵌。

规格（和 docs/model_prompts.md 的导出约定一致）：
  · glTF 2.0 Binary（.glb），不开 Draco / Meshopt / KTX2；
  · 1 = 1 米，Y-up；
  · 原点放在**贴墙那一面**：局部 z = 0 是墙，x / z 居中，正面朝 +Z（glTF），
    Blender 里正面朝 -Y。挂到 -X 墙时 rotation.y = +90°；
  · 一个网格、一个材质；PBR 三张 1K 贴图（基础色 / 法线 / 粗糙度），金属度 0。

用法：
  blender -b --factory-startup -P tools/build_goat_head.py
  或 Blender 里 exec(open(r'...\\tools\\build_goat_head.py', encoding='utf-8').read())
输出 assets/models/goat_head_v01.glb。
"""
import json
import os
import pathlib
import struct
import tempfile

import bpy
from mathutils import Matrix, Vector

try:
    HERE = pathlib.Path(__file__).resolve().parent
except NameError:  # 在已打开的 Blender 里 exec
    HERE = pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools')

PROJECT = HERE.parent

# glTF 导出贴图时会往临时目录写中间文件。DSH 的临时目录只读，
# 把 TMP 指到工作区里，否则导出会在 image.write 处失败。
TMP = PROJECT / 'work' / 'blender_tmp'
TMP.mkdir(parents=True, exist_ok=True)
os.environ['TMP'] = str(TMP)
os.environ['TEMP'] = str(TMP)
tempfile.tempdir = str(TMP)
try:
    bpy.context.preferences.filepaths.temporary_directory = str(TMP)
except Exception as exc:  # 只影响中间文件位置，不阻断构建
    print('temporary_directory 设置失败：', exc)


def _install_tempdir_workaround():
    """glTF 导出器用 tempfile.TemporaryDirectory 存中间贴图。

    Python 的 mkdtemp 在 Windows 上以 mode=0o700 建目录，在 DSH 沙箱里
    这个目录连自己进程都写不进去（PermissionError）。换成普通 os.makedirs
    建的目录，导出完再删。
    """
    import shutil
    import uuid

    class _WorkspaceTemporaryDirectory:
        def __init__(self, *args, **kwargs):
            self.name = str(TMP / ('gltf-' + uuid.uuid4().hex))
            os.makedirs(self.name, exist_ok=True)

        def __enter__(self):
            return self.name

        def __exit__(self, exc_type, exc_value, traceback):
            shutil.rmtree(self.name, ignore_errors=True)
            return False

    tempfile.TemporaryDirectory = _WorkspaceTemporaryDirectory


_install_tempdir_workaround()
SRC = PROJECT / 'assets' / 'source' / 'ram_skull'
FBX = SRC / 'ram_skull_mid.fbx'
BASE_TEX = SRC / 'ram_skull_1k_basecolor.jpg'
NORMAL_TEX = SRC / 'ram_skull_1k_normal.jpg'
ROUGH_TEX = SRC / 'ram_skull_1k_roughness.jpg'
OUT_GLB = PROJECT / 'assets' / 'models' / 'goat_head_v01.glb'

COLL_NAME = 'GoatHead'
ROOT_NAME = 'GoatHead'
MESH_NAME = 'GoatHead_Mesh'
MAT_NAME = 'RamSkull_Bone'

EXPECT_TRIS = 13644
EXPECT_DIMS = (0.3500, 0.2620, 0.3802)  # x, y(高), z(深)，米


def png_size(path):
    return path.stat().st_size


def clear_collection(coll):
    for ob in list(coll.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def import_source(coll):
    """导入 tier 2 FBX，应用旋转/缩放，把原点挪到贴墙那一面。"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(FBX))
    new = [ob for ob in bpy.data.objects if ob not in before]
    meshes = [ob for ob in new if ob.type == 'MESH']
    if len(meshes) != 1:
        raise RuntimeError('源 FBX 里应该只有一个网格，实际 %d 个' % len(meshes))
    ob = meshes[0]

    # 多余的导入空物体不要
    for extra in new:
        if extra is not ob and extra.type == 'EMPTY':
            bpy.data.objects.remove(extra, do_unlink=True)

    for old_coll in list(ob.users_collection):
        old_coll.objects.unlink(ob)
    coll.objects.link(ob)

    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    # FBX 是厘米 + Z-up：这里把 0.01 缩放和 90° 旋转烘进网格。
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    me = ob.data
    lo = Vector((min(v.co.x for v in me.vertices),
                 min(v.co.y for v in me.vertices),
                 min(v.co.z for v in me.vertices)))
    hi = Vector((max(v.co.x for v in me.vertices),
                 max(v.co.y for v in me.vertices),
                 max(v.co.z for v in me.vertices)))
    dims = hi - lo
    print('source dims (x, y, z) = %.4f, %.4f, %.4f' % (dims.x, dims.y, dims.z))
    if abs(dims.x - 0.3500) > 0.01 or abs(dims.y - 0.3802) > 0.01 or abs(dims.z - 0.2620) > 0.01:
        raise RuntimeError('尺寸和预期不符，源文件可能换了：%s' % (tuple(round(v, 4) for v in dims),))

    # 正面朝 -Y，背面（贴墙）在 +Y。原点 = 背面中心。
    pivot = Vector(((lo.x + hi.x) * 0.5, hi.y, (lo.z + hi.z) * 0.5))
    me.transform(Matrix.Translation(-pivot))
    me.update()
    ob.location = (0.0, 0.0, 0.0)
    ob.rotation_euler = (0.0, 0.0, 0.0)
    ob.scale = (1.0, 1.0, 1.0)

    ob.name = MESH_NAME
    me.name = MESH_NAME

    lo2 = Vector((min(v.co.x for v in me.vertices),
                  min(v.co.y for v in me.vertices),
                  min(v.co.z for v in me.vertices)))
    hi2 = Vector((max(v.co.x for v in me.vertices),
                  max(v.co.y for v in me.vertices),
                  max(v.co.z for v in me.vertices)))
    print('pivot dims: x [%.4f, %.4f] y [%.4f, %.4f] z [%.4f, %.4f]'
          % (lo2.x, hi2.x, lo2.y, hi2.y, lo2.z, hi2.z))
    return ob


def load_image(path, colorspace):
    img = bpy.data.images.load(str(path), check_existing=False)
    img.colorspace_settings.name = colorspace
    return img


def make_material():
    mat = bpy.data.materials.get(MAT_NAME)
    if mat is None:
        mat = bpy.data.materials.new(MAT_NAME)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (520, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (200, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value = 0.0
    # Specular IOR Level 留默认 0.5，避免多出 KHR_materials_specular。

    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.name = 'BaseColor_1K'
    tex.label = 'BaseColor 1K'
    tex.location = (-420, 260)
    tex.image = load_image(BASE_TEX, 'sRGB')
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

    ntex = nt.nodes.new('ShaderNodeTexImage')
    ntex.name = 'Normal_1K'
    ntex.label = 'Normal 1K'
    ntex.location = (-420, -40)
    ntex.image = load_image(NORMAL_TEX, 'Non-Color')
    ntex.interpolation = 'Linear'
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nmap.location = (-140, -40)
    nmap.space = 'TANGENT'
    nmap.uv_map = 'uv'
    nmap.inputs['Strength'].default_value = 1.0
    nt.links.new(ntex.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])

    rtex = nt.nodes.new('ShaderNodeTexImage')
    rtex.name = 'Roughness_1K'
    rtex.label = 'Roughness 1K'
    rtex.location = (-420, -340)
    rtex.image = load_image(ROUGH_TEX, 'Non-Color')
    rtex.interpolation = 'Linear'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    sep.location = (-140, -340)
    nt.links.new(rtex.outputs['Color'], sep.inputs['Color'])
    # glTF 的 metallicRoughness 贴图：G = 粗糙度，B = 金属度。这里只接 G。
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])

    # 扫描是封闭网格，单面就够，省一半填充。
    mat.use_backface_culling = True
    mat.diffuse_color = (0.42, 0.36, 0.29, 1.0)
    mat.roughness = 0.82
    mat.metallic = 0.0
    return mat, (tex, ntex, rtex)


def build():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        coll = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(coll)
    clear_collection(coll)

    ob = import_source(coll)
    mat, _tex_nodes = make_material()
    ob.data.materials.clear()
    ob.data.materials.append(mat)

    # 参考材质贴图都按 1K 存；这里确认一下纹理确实被引用。
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    ob['role'] = 'goat_head'
    ob['triangles'] = tris

    me = ob.data
    lo = Vector((min(v.co.x for v in me.vertices),
                 min(v.co.y for v in me.vertices),
                 min(v.co.z for v in me.vertices)))
    hi = Vector((max(v.co.x for v in me.vertices),
                 max(v.co.y for v in me.vertices),
                 max(v.co.z for v in me.vertices)))

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.04
    coll.objects.link(root)

    ob.parent = root
    ob.matrix_parent_inverse = root.matrix_world.inverted()

    root['model'] = 'goat_head'
    root['spec'] = 'w05_3d_game/docs/goat_head_v01_spec.md'
    root['source'] = 'Quixel Megascans "Ram Skull" (tiiief2fa), tier 2 FBX'
    root['license'] = 'Megascans / Fab'
    root['size_w_m'] = round(hi.x - lo.x, 4)
    root['size_h_m'] = round(hi.z - lo.z, 4)
    root['size_d_m'] = round(hi.y - lo.y, 4)
    root['pivot'] = 'wall plane at local z=0, x/y centred'
    root['front_axis'] = '+Z (glTF) / -Y (Blender)'
    root['up_axis'] = 'Y'
    root['mesh_count'] = 1
    root['triangles'] = tris
    root['textures'] = ['BaseColor 1K (JPEG)', 'Normal 1K (JPEG)',
                        'MetallicRoughness 1K (PNG, G = roughness)']
    root['material'] = MAT_NAME

    bpy.context.view_layer.update()
    print('mesh %s verts=%d tris=%d' % (ob.name, len(me.vertices), tris))
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


def export_glb(root, ob):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    kwargs = {
        'filepath': str(OUT_GLB),
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
        'export_image_format': 'AUTO',
        'export_image_quality': 92,
    }
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kwargs = {k: v for k, v in kwargs.items() if k in valid}
    bpy.ops.export_scene.gltf(**kwargs)
    strip_scene_extras(OUT_GLB)
    print('exported %s (%d bytes)' % (OUT_GLB, OUT_GLB.stat().st_size))


def read_glb(path):
    data = pathlib.Path(path).read_bytes()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67 or ver != 2:
        raise RuntimeError('不是 glTF 2.0 二进制：%s' % path)
    off = 12
    doc = None
    bin_len = 0
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        if ctype == 0x4E4F534A:
            doc = json.loads(data[off:off + clen].decode('utf-8'))
        else:
            bin_len += clen
        off += clen
    return doc, bin_len


def check_glb():
    doc, bin_len = read_glb(OUT_GLB)
    problems = []
    used = doc.get('extensionsUsed') or []
    if used:
        problems.append('extensionsUsed = %s' % used)
    if len(doc.get('meshes', [])) != 1:
        problems.append('mesh count = %d' % len(doc.get('meshes', [])))
    mats = doc.get('materials', [])
    if len(mats) != 1:
        problems.append('material count = %d' % len(mats))
    images = doc.get('images', [])
    if len(images) != 3:
        problems.append('image count = %d' % len(images))
    for img in images:
        if 'bufferView' not in img:
            problems.append('image %s 没有内嵌' % img.get('name'))
        if img.get('mimeType') not in ('image/jpeg', 'image/png'):
            problems.append('image mimeType = %s' % img.get('mimeType'))

    tris = 0
    pos_min = pos_max = None
    for mesh in doc.get('meshes', []):
        for prim in mesh.get('primitives', []):
            if 'indices' in prim:
                tris += doc['accessors'][prim['indices']]['count'] // 3
            acc = doc['accessors'][prim['attributes']['POSITION']]
            pos_min, pos_max = acc.get('min'), acc.get('max')
    if tris != EXPECT_TRIS:
        problems.append('tris = %d (expected %d)' % (tris, EXPECT_TRIS))
    if pos_min and pos_max:
        dims = [round(pos_max[i] - pos_min[i], 4) for i in range(3)]
        print('glb bounds min', [round(v, 4) for v in pos_min], 'max', [round(v, 4) for v in pos_max], 'dims', dims)
        if abs(dims[0] - EXPECT_DIMS[0]) > 0.01 or abs(dims[1] - EXPECT_DIMS[1]) > 0.01 or abs(dims[2] - EXPECT_DIMS[2]) > 0.01:
            problems.append('dims = %s' % dims)
        if abs(pos_min[2]) > 0.001:
            problems.append('背面的 z 不是 0：%s' % pos_min[2])

    pbr = mats[0].get('pbrMetallicRoughness', {}) if mats else {}
    if 'baseColorTexture' not in pbr:
        problems.append('没有 baseColorTexture')
    if 'normalTexture' not in mats[0]:
        problems.append('没有 normalTexture')
    if 'metallicRoughnessTexture' not in pbr:
        problems.append('没有 metallicRoughnessTexture')
    if abs(pbr.get('metallicFactor', 1.0)) > 1e-6:
        problems.append('metallicFactor = %s' % pbr.get('metallicFactor'))

    print('glb: nodes=%d meshes=%d materials=%d images=%d tris=%d bin=%d bytes'
          % (len(doc.get('nodes', [])), len(doc.get('meshes', [])), len(mats),
             len(images), tris, bin_len))
    for img in images:
        print('  image', img.get('name'), img.get('mimeType'), img.get('bufferView'))
    if problems:
        raise RuntimeError('自检失败：\n  ' + '\n  '.join(problems))
    print('self-check OK')
    return doc


def _main():
    root, ob, _tris = build()
    export_glb(root, ob)
    check_glb()


if globals().get('__name__', '__main__') == '__main__':
    _main()

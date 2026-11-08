"""咧嘴的牙（teeth_v01.glb）的预览图：2×3 六格。

上排：实际材质（污褐 #4a2a20）在暗背景里的样子：正面、3/4、右侧特写。
下排：素模正面、素模 3/4、线框（看 17 颗牙的低面数结构）。

和正式渲染无关：所有改动（世界、灯、相机、材质、隐藏标记、渲染设置）渲完还原。

用法（先 build）：
  blender -b --factory-startup -P tools/build_teeth.py -P tools/render_teeth_sheet.py
输出 docs/images/teeth_v01_turnaround.png；工作区不允许 Blender 写时退回临时目录。
"""
import math
import os
import pathlib
import tempfile

import bpy
import numpy as np
from mathutils import Vector

OUT_PNG = str(pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\docs\images')
              / 'teeth_v01_turnaround.png')
COLL_NAME = 'GrinTeeth'
TILE = 640

FRONT_ORTHO = 1.15     # 正面正交宽（米）；0.90 m 宽 → 501 px

# (名字, 投影, 方位角°, 仰角°, 正交尺寸 / 焦距, 相机距离, 目标点, 材质, 曝光)
VIEWS = [
    ('front', 'ORTHO', 0.0, 0.0, FRONT_ORTHO, 3.0, (0.0, 0.0, 0.0), 'real', -0.2),
    ('three_quarter', 'PERSP', 28.0, 8.0, 50.0, 1.60, (0.0, 0.0, 0.01), 'real', -0.1),
    ('macro', 'ORTHO', 12.0, 4.0, 0.34, 1.0, (0.12, 0.0, 0.02), 'real', -0.05),
    ('clay_front', 'ORTHO', 0.0, 0.0, FRONT_ORTHO, 3.0, (0.0, 0.0, 0.0), 'clay', -1.5),
    ('clay_three_quarter', 'PERSP', 30.0, 10.0, 50.0, 1.60, (0.0, 0.0, 0.01), 'clay', -1.5),
    ('wire', 'ORTHO', 0.0, 0.0, FRONT_ORTHO, 3.0, (0.0, 0.0, 0.0), 'wire', -1.2),
]


def render_engine():
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for name in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'CYCLES'):
        if name in engines:
            return name
    return engines[0]


def place_camera(cam, target, azimuth_deg, elev_deg, kind, size, dist):
    a = math.radians(azimuth_deg)
    e = math.radians(elev_deg)
    if kind == 'ORTHO':
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = size
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = size
        cam.data.sensor_width = 36.0
    cam.location = (target[0] + dist * math.sin(a) * math.cos(e),
                    target[1] - dist * math.cos(a) * math.cos(e),
                    target[2] + dist * math.sin(e))
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def make_light(name, kind, loc, energy, size, target=(0.0, 0.0, 0.0), color=(1.0, 1.0, 1.0)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == 'AREA':
        data.size = size
        data.shape = 'DISK'
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return ob


def make_clay_material():
    mat = bpy.data.materials.new('TeethClayPreview')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.46, 0.43, 0.40, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def preview_lights(prefix):
    """一排宽而扁的侧前主光 + 弱补光：牙的体积靠光影读，不靠颜色。"""
    return [
        make_light(prefix + 'Key', 'AREA', (-1.30, -1.25, 0.95), 210.0, 0.55,
                   target=(0.0, 0.0, 0.0)),
        make_light(prefix + 'Fill', 'AREA', (1.55, -1.35, 0.25), 55.0, 1.1,
                   target=(0.0, 0.0, 0.0), color=(1.0, 0.90, 0.82)),
        make_light(prefix + 'Top', 'AREA', (0.05, -0.40, 1.55), 70.0, 0.8,
                   target=(0.0, 0.0, 0.05)),
        make_light(prefix + 'Rim', 'AREA', (0.75, 0.95, 0.70), 120.0, 0.7,
                   target=(0.0, 0.0, 0.0)),
    ]


def render_sheet():
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError('场景里没有 GrinTeeth 集合，先跑 tools/build_teeth.py')
    sources = [ob for ob in coll.objects if ob.type == 'MESH']
    if len(sources) != 1:
        raise RuntimeError('GrinTeeth 集合里应该只有一排牙，实际 %d 个网格' % len(sources))
    teeth = sources[0]
    real_mats = list(teeth.data.materials)

    # ---- 保存状态 ----
    prev_cam = scene.camera
    prev_res = (scene.render.resolution_x, scene.render.resolution_y,
                scene.render.resolution_percentage)
    prev_view = (scene.view_settings.view_transform, scene.view_settings.look,
                 scene.view_settings.exposure)
    prev_engine = scene.render.engine
    prev_film = scene.render.film_transparent
    prev_samples = getattr(scene.eevee, 'taa_render_samples', None)
    world = scene.world
    prev_world_obj = world
    bg = None
    prev_bg = None
    if world and world.use_nodes:
        bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
        if bg:
            prev_bg = (tuple(bg.inputs['Color'].default_value), bg.inputs['Strength'].default_value)

    hidden = {}
    for ob in scene.objects:
        if ob == teeth or ob.type == 'CAMERA':
            continue
        hidden[ob.name] = (ob.hide_render, ob.hide_viewport)
        ob.hide_render = True
        ob.hide_viewport = True

    coll.hide_render = False

    # ---- 灯 + 相机（全部临时） ----
    lights = preview_lights('TeethPreview_')
    cam = bpy.data.objects.new('TeethPreviewCam', bpy.data.cameras.new('TeethPreviewCam'))
    scene.collection.objects.link(cam)
    cam.data.clip_start = 0.01
    cam.data.clip_end = 100.0
    scene.camera = cam

    scene.render.resolution_x = TILE
    scene.render.resolution_y = TILE
    scene.render.resolution_percentage = 100
    scene.render.engine = render_engine()
    scene.render.film_transparent = False
    if prev_samples is not None:
        scene.eevee.taa_render_samples = 64
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'

    if world is None:
        world = bpy.data.worlds.new('TeethPreviewWorld')
        scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    # 纯黑：牙是暗的，背景不能再亮，不然剪影量不准
    bg.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    bg.inputs['Strength'].default_value = 0.0

    clay = make_clay_material()
    tmpdir = tempfile.gettempdir()
    tiles = {}
    wire_copy = None

    for name, kind, az, elev, size, dist, target, mat_mode, exposure in VIEWS:
        if mat_mode == 'wire':
            wire_copy = teeth.copy()
            wire_copy.data = teeth.data.copy()
            wire_copy.name = 'GrinTeeth_wire'
            bpy.context.scene.collection.objects.link(wire_copy)
            wire_copy.parent = teeth.parent
            wire_copy.matrix_world = teeth.matrix_world.copy()
            mod = wire_copy.modifiers.new('Wire', 'WIREFRAME')
            mod.thickness = 0.0024
            mod.use_replace = True
            mod.use_boundary = True
            wire_copy.data.materials.clear()
            wire_copy.data.materials.append(clay)
            teeth.hide_render = True
        elif mat_mode == 'clay':
            teeth.data.materials.clear()
            teeth.data.materials.append(clay)

        place_camera(cam, target, az, elev, kind, size, dist)
        scene.view_settings.exposure = exposure
        path = os.path.join(tmpdir, 'teeth_v01_%s.png' % name)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        tiles[name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)

        if mat_mode == 'wire' and wire_copy is not None:
            data = wire_copy.data
            bpy.data.objects.remove(wire_copy, do_unlink=True)
            if data.users == 0:
                bpy.data.meshes.remove(data)
            wire_copy = None
            teeth.hide_render = False
        elif mat_mode == 'clay':
            teeth.data.materials.clear()
            for m in real_mats:
                teeth.data.materials.append(m)

    # ---- 2×3 拼图（Blender 像素第 0 行是画面底部，所以先放下排） ----
    top = np.concatenate((tiles['front'], tiles['three_quarter'], tiles['macro']), axis=1)
    bottom = np.concatenate((tiles['clay_front'], tiles['clay_three_quarter'],
                             tiles['wire']), axis=1)
    sheet = np.concatenate((bottom, top), axis=0)

    out_img = bpy.data.images.new('teeth_v01_turnaround', width=sheet.shape[1], height=sheet.shape[0])
    out_img.colorspace_settings.name = 'Non-Color'
    out_img.pixels = sheet.ravel().tolist()

    written = OUT_PNG
    try:
        with open(written, 'wb'):
            pass
    except OSError:
        written = os.path.join(tmpdir, 'teeth_v01_turnaround.png')
        print('workspace write denied, sheet goes to', written)
    out_img.filepath_raw = written
    out_img.file_format = 'PNG'
    out_img.save()
    print('sheet ->', written, sheet.shape[1], 'x', sheet.shape[0])

    # ---- 用素模正视图量轮廓：应该正好 0.90 m × 实际高度 ----
    px = tiles['clay_front'][:, :, :3]
    lum = px.max(axis=2)
    mask = lum > 0.02
    cols = np.where(mask.any(axis=0))[0]
    rows = np.where(mask.any(axis=1))[0]
    if cols.size:
        w_px = cols.max() - cols.min() + 1
        h_px = rows.max() - rows.min() + 1
        ppm = TILE / FRONT_ORTHO
        want_w = teeth.dimensions.x
        want_h = teeth.dimensions.z
        print('measure: silhouette %d x %d px -> %.3f x %.3f m (want %.3f x %.3f)'
              % (w_px, h_px, w_px / ppm, h_px / ppm, want_w, want_h))
    print('measure: front tile mean luma %.4f (sRGB, exposure %+.1f)'
          % (float(tiles['front'][:, :, :3].mean()), VIEWS[0][8]))

    # ---- 还原 ----
    bpy.data.images.remove(out_img)
    if bg is not None and prev_bg is not None:
        bg.inputs['Color'].default_value = prev_bg[0]
        bg.inputs['Strength'].default_value = prev_bg[1]
    if prev_world_obj is None:
        scene.world = None
        bpy.data.worlds.remove(world)
    for ob in list(lights) + [cam]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
            elif isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
    if 'TeethClayPreview' in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials['TeethClayPreview'])
    for ob in scene.objects:
        if ob.name in hidden:
            ob.hide_render, ob.hide_viewport = hidden[ob.name]
    scene.camera = prev_cam
    scene.render.engine = prev_engine
    scene.render.film_transparent = prev_film
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = prev_res
    scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = prev_view
    if prev_samples is not None:
        scene.eevee.taa_render_samples = prev_samples
    bpy.context.view_layer.update()
    return written


def quick(path=None, az=24.0, elev=6.0, size=1.15, mode='clay', exposure=-1.2):
    """单张快照，用来边调边看。返回写出的 png 路径。"""
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    teeth = next(ob for ob in coll.objects if ob.type == 'MESH')
    real_mats = list(teeth.data.materials)
    prev_cam, prev_res = scene.camera, (scene.render.resolution_x, scene.render.resolution_y)
    prev_view = (scene.view_settings.view_transform, scene.view_settings.look,
                 scene.view_settings.exposure)
    prev_engine = scene.render.engine

    hidden = {}
    for ob in scene.objects:
        if ob == teeth or ob.type == 'CAMERA':
            continue
        hidden[ob.name] = (ob.hide_render, ob.hide_viewport)
        ob.hide_render = True
        ob.hide_viewport = True

    lights = preview_lights('Q_')
    cam = bpy.data.objects.new('Q_Cam', bpy.data.cameras.new('Q_Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = render_engine()
    scene.render.resolution_x = scene.render.resolution_y = TILE
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = exposure

    world = scene.world
    prev_world_obj = world
    if world is None:
        world = bpy.data.worlds.new('Q_World')
        scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    prev_bg = (tuple(bg.inputs['Color'].default_value), bg.inputs['Strength'].default_value)
    bg.inputs['Color'].default_value = (0.012, 0.009, 0.008, 1.0)
    bg.inputs['Strength'].default_value = 1.0

    if mode == 'clay':
        clay = make_clay_material()
        teeth.data.materials.clear()
        teeth.data.materials.append(clay)
    place_camera(cam, (0.0, 0.0, 0.0), az, elev, 'PERSP' if abs(az) > 0.1 else 'ORTHO',
                 size if abs(az) < 0.1 else 62.0, 1.3)
    out = path or os.path.join(tempfile.gettempdir(), 'teeth_quick.png')
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)

    if mode == 'clay':
        teeth.data.materials.clear()
        for m in real_mats:
            teeth.data.materials.append(m)
        if 'TeethClayPreview' in bpy.data.materials:
            bpy.data.materials.remove(bpy.data.materials['TeethClayPreview'])
    for ob in list(lights) + [cam]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
            elif isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
    for ob in scene.objects:
        if ob.name in hidden:
            ob.hide_render, ob.hide_viewport = hidden[ob.name]
    if prev_bg is not None:
        bg.inputs['Color'].default_value = prev_bg[0]
        bg.inputs['Strength'].default_value = prev_bg[1]
    if prev_world_obj is None:
        scene.world = None
        bpy.data.worlds.remove(world)
    scene.camera = prev_cam
    scene.render.engine = prev_engine
    scene.render.resolution_x, scene.render.resolution_y = prev_res
    scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = prev_view
    return out


if globals().get('__name__', '__main__') == '__main__':
    render_sheet()

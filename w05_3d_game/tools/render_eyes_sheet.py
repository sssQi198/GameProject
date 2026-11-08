"""眼睛模型（eyes_v01.glb）的预览图：2×2 四格，纯黑背景 + 自发光 + 辉光。

四格：正面一对、3/4 透视、单眼特写、线框（看清 20×12 段的极低面数）。
和正式渲染无关：所有改动（世界、灯、相机、合成节点、隐藏标记）渲完还原。

用法（先 build）：
  blender -b --factory-startup -P tools/build_eyes.py -P tools/render_eyes_sheet.py
输出 docs/images/eyes_v01_turnaround.png；工作区不允许 Blender 写时退回临时目录。
"""
import math
import os
import pathlib
import tempfile

import bpy
import numpy as np
from mathutils import Vector

OUT_PNG = str(pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\docs\images')
              / 'eyes_v01_turnaround.png')
COLL_NAME = 'Eyes'
TILE = 640
CAM_DIST = 3.0

# (名字, 投影, 方位角°, 仰角°, 正交尺寸 m / 焦距 mm, 相机距离 m, 目标点)
VIEWS = [
    ('front', 'ORTHO', 0.0, 0.0, 0.66, 3.0, (0.0, 0.0, 0.0)),
    ('three_quarter', 'PERSP', 38.0, 8.0, 35.0, 0.95, (0.0, 0.0, 0.0)),
    ('macro', 'ORTHO', 0.0, 0.0, 0.24, 3.0, (-0.19, 0.0, 0.0)),
    ('wire', 'ORTHO', 0.0, 0.0, 0.24, 3.0, (-0.19, 0.0, 0.0)),
]

# 正面那一格里，眼睛在画面上的理论尺寸（正交投影）
FRONT_ORTHO = 0.66
EYE_DIAMETER_PX = 0.174 / FRONT_ORTHO * TILE
EYE_SPACING_PX = 0.38 / FRONT_ORTHO * TILE


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


def make_wire_copies(coll, sources):
    """给线框那一格做两份副本，加 Wireframe 修改器；渲完删掉。"""
    copies = []
    for src in sources:
        ob = src.copy()
        ob.data = src.data.copy()
        ob.name = src.name + '_wire'
        coll.objects.link(ob)
        ob.location = src.location.copy()
        ob.parent = None
        mod = ob.modifiers.new('Wire', 'WIREFRAME')
        mod.thickness = 0.0016
        mod.use_replace = True
        mod.use_boundary = True
        copies.append(ob)
    return copies


def setup_compositor(scene):
    """只加一个辉光：让自发光在纯黑上散开，不改变模型本身。

    Blender 5.x 的合成器改成了「场景挂一个合成节点组」（compositing_node_group），
    旧的 scene.node_tree / CompositorNodeComposite 已经不存在。
    枚举值是显示名（'Fog Glow' / 'Bloom' / 'Streaks' …），不是 FOG_GLOW 那种标识符。
    """
    prev_group = scene.compositing_node_group
    prev_use = scene.use_nodes

    ng = bpy.data.node_groups.new('EyesPreviewComp', 'CompositorNodeTree')
    ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new('CompositorNodeRLayers')
    glare = ng.nodes.new('CompositorNodeGlare')
    try:
        glare.inputs['Type'].default_value = 'Bloom'
        glare.inputs['Quality'].default_value = 'High'
    except TypeError as exc:
        print('Glare 枚举不兼容，用默认值：', exc)
    glare.inputs['Threshold'].default_value = 0.6
    glare.inputs['Size'].default_value = 0.3
    glare.inputs['Strength'].default_value = 0.8
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], glare.inputs['Image'])
    ng.links.new(glare.outputs['Image'], out.inputs[0])

    scene.compositing_node_group = ng
    scene.use_nodes = True
    scene.render.use_compositing = True
    return prev_group, prev_use


def measure_front(px):
    """在正面那一格里量红点的直径和眼距（sRGB 0..1）。"""
    rgb = px[:, :, :3]
    r, g = rgb[:, :, 0], rgb[:, :, 1]
    core = (r > 0.95) & (g < 0.25)
    cols = np.where(core.any(axis=0))[0]
    if cols.size == 0:
        return None
    split = (cols.min() + cols.max()) / 2
    blobs = []
    for side in (cols[cols < split], cols[cols >= split]):
        if side.size == 0:
            continue
        x0, x1 = side.min(), side.max()
        sub = core[:, x0:x1 + 1]
        ys = np.where(sub.any(axis=1))[0]
        blobs.append({'cx': (x0 + x1) / 2, 'w': x1 - x0 + 1,
                      'h': ys.max() - ys.min() + 1})
    if len(blobs) != 2:
        return None
    spacing = abs(blobs[1]['cx'] - blobs[0]['cx'])
    diam = sum((b['w'] + b['h']) / 2 for b in blobs) / 2
    return {'spacing_px': spacing, 'diameter_px': diam}


def render_sheet():
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError('场景里没有 Eyes 集合，先跑 tools/build_eyes.py')
    sources = [ob for ob in coll.objects if ob.type == 'MESH']
    if len(sources) != 2:
        raise RuntimeError('Eyes 集合里应该有两只球，实际 %d 个网格' % len(sources))

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
    prev_world = None
    if world and world.use_nodes:
        bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
        if bg:
            prev_world = (tuple(bg.inputs['Color'].default_value), bg.inputs['Strength'].default_value)

    hidden = {}
    eye_set = set(sources)
    for ob in scene.objects:
        if ob in eye_set or ob.type == 'CAMERA':
            continue
        hidden[ob.name] = (ob.hide_render, ob.hide_viewport)
        ob.hide_render = True

    coll.hide_render = False

    cam = bpy.data.objects.get('EyesPreviewCam')
    if cam is None:
        cam = bpy.data.objects.new('EyesPreviewCam', bpy.data.cameras.new('EyesPreviewCam'))
        scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'

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
    scene.view_settings.exposure = 0.0

    if world is None:
        world = bpy.data.worlds.new('EyesPreviewWorld')
        scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    bg.inputs['Strength'].default_value = 1.0

    prev_nodes = setup_compositor(scene)

    tmpdir = tempfile.gettempdir()
    tiles = {}
    wire_copies = []

    for name, kind, az, elev, size, dist, target in VIEWS:
        if name == 'wire':
            wire_copies = make_wire_copies(coll, sources)
            for ob in sources:
                ob.hide_render = True
        place_camera(cam, target, az, elev, kind, size, dist)
        path = os.path.join(tmpdir, 'eyes_v01_%s.png' % name)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        tiles[name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)
        if name == 'wire':
            for ob in wire_copies:
                data = ob.data
                bpy.data.objects.remove(ob, do_unlink=True)
                if data.users == 0:
                    bpy.data.meshes.remove(data)
            wire_copies = []
            for ob in sources:
                ob.hide_render = False

    # ---- 2×2 拼图（Blender 的像素数组第 0 行是画面底部，所以先放下面两格） ----
    top = np.concatenate((tiles['front'], tiles['three_quarter']), axis=1)
    bottom = np.concatenate((tiles['macro'], tiles['wire']), axis=1)
    sheet = np.concatenate((bottom, top), axis=0)

    out_img = bpy.data.images.new('eyes_v01_turnaround', width=sheet.shape[1], height=sheet.shape[0])
    out_img.colorspace_settings.name = 'Non-Color'
    out_img.pixels = sheet.ravel().tolist()

    written = OUT_PNG
    try:
        with open(written, 'wb'):
            pass
    except OSError:
        written = os.path.join(tmpdir, 'eyes_v01_turnaround.png')
        print('workspace write denied, sheet goes to', written)
    out_img.filepath_raw = written
    out_img.file_format = 'PNG'
    out_img.save()
    print('sheet ->', written, sheet.shape[1], 'x', sheet.shape[0])

    # ---- 用正面那格做像素校验 ----
    stat = measure_front(tiles['front'])
    if stat:
        err_d = abs(stat['diameter_px'] - EYE_DIAMETER_PX) / EYE_DIAMETER_PX
        err_s = abs(stat['spacing_px'] - EYE_SPACING_PX) / EYE_SPACING_PX
        print('measure: diameter %.1f px (want %.1f, err %.2f%%), spacing %.1f px (want %.1f, err %.2f%%)'
              % (stat['diameter_px'], EYE_DIAMETER_PX, err_d * 100,
                 stat['spacing_px'], EYE_SPACING_PX, err_s * 100))

    # ---- 颜色校验：关掉辉光渲一小格，量眼球中心的 sRGB ----
    # 辉光会把 #ff2030 抬亮，所以不能拿拼图里的颜色来验材质。
    try:
        scene.compositing_node_group = None
        scene.render.resolution_x = scene.render.resolution_y = 96
        place_camera(cam, (0.0, 0.0, 0.0), 0.0, 0.0, 'ORTHO', FRONT_ORTHO, CAM_DIST)
        path = os.path.join(tmpdir, 'eyes_v01_color.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)
        # 左眼球心在画面上的 x：中线往左 0.19 m，正交宽 0.66 m
        cx = int(round((0.5 - 0.19 / FRONT_ORTHO) * w))
        plain = tuple(float(v) for v in px[h // 2, cx, :3])
        print('measure: eye sRGB %.3f %.3f %.3f (want 1.000 0.125 0.188)' % plain)
    finally:
        scene.compositing_node_group = prev_nodes[0]
        scene.render.resolution_x = scene.render.resolution_y = TILE

    # ---- 还原 ----
    bpy.data.images.remove(out_img)
    scene.compositing_node_group = prev_nodes[0]
    scene.use_nodes = prev_nodes[1]
    if 'EyesPreviewComp' in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups['EyesPreviewComp'])
    if prev_world and bg:
        bg.inputs['Color'].default_value = prev_world[0]
        bg.inputs['Strength'].default_value = prev_world[1]
    if prev_world_obj is None:
        scene.world = None
        bpy.data.worlds.remove(world)
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
    cam_data = cam.data
    bpy.data.objects.remove(cam, do_unlink=True)
    if cam_data.users == 0:
        bpy.data.cameras.remove(cam_data)
    bpy.context.view_layer.update()
    return written


if globals().get('__name__', '__main__') == '__main__':
    render_sheet()

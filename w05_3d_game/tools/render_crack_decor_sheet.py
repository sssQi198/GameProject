"""裂缝周围的装饰（crack_decor_v01.glb）预览图：2×3 六格。

上排：实际材质（近黑暗红）在暗棚里的样子：正面、3/4、唇/触手特写。
下排：素模正面、素模 3/4、线框（看三层翻边和触手的低面数结构）。

和正式渲染无关：所有改动（世界、灯、相机、材质、隐藏标记、渲染设置）渲完还原。

用法（先 build）：
  blender -b --factory-startup -P tools/build_crack_decor.py -P tools/render_crack_decor_sheet.py
输出 docs/images/crack_decor_v01_turnaround.png；工作区不允许 Blender 写时退回临时目录。
"""
import math
import os
import pathlib
import tempfile

import bpy
import numpy as np
from mathutils import Vector

OUT_PNG = str(pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\docs\images')
              / 'crack_decor_v01_turnaround.png')
COLL_NAME = 'CrackDecor'
TILE = 640

# (名字, 投影, 方位角/仰角用的是自定义机位, 正交尺寸 / 焦距, 相机位置, 目标点, 材质, 曝光)
VIEWS = [
    ('real_front', 'ORTHO', 3.50, (0.0, -8.0, -1.50), (0.0, 0.0, -1.50), 'real', 0.2),
    ('real_three_quarter', 'PERSP', 45.0, (3.40, -6.60, -1.90), (0.0, -1.00, -1.35), 'real', 0.2),
    ('real_macro', 'PERSP', 65.0, (1.60, -2.20, -0.90), (0.50, 0.00, -1.30), 'real', 0.4),
    ('clay_front', 'ORTHO', 3.50, (0.0, -8.0, -1.50), (0.0, 0.0, -1.50), 'clay', -0.6),
    ('clay_three_quarter', 'PERSP', 45.0, (3.40, -6.60, -1.90), (0.0, -1.00, -1.35), 'clay', -0.6),
    ('wire', 'PERSP', 45.0, (3.40, -6.60, -1.90), (0.0, -1.00, -1.35), 'wire', -1.2),
]


def render_engine():
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for name in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'CYCLES'):
        if name in engines:
            return name
    return engines[0]


def place_camera(cam, loc, target, kind, size):
    if kind == 'ORTHO':
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = size
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = size
        cam.data.sensor_width = 36.0
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def make_light(name, kind, loc, energy, size, target, color=(1.0, 1.0, 1.0)):
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
    mat = bpy.data.materials.new('CrackDecorClayPreview')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.52, 0.47, 0.44, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.78
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def preview_lights(prefix):
    """暗棚：暖白主光 + 红色补光 + 背后轮廓光。"""
    return [
        make_light(prefix + 'Key', 'AREA', (1.80, -2.60, 1.10), 260.0, 1.4,
                   target=(0.0, -0.3, -0.6), color=(1.0, 0.88, 0.82)),
        make_light(prefix + 'Fill', 'AREA', (-2.20, -1.60, -0.40), 70.0, 1.8,
                   target=(0.0, -0.2, -1.4), color=(1.0, 0.35, 0.30)),
        make_light(prefix + 'Top', 'AREA', (0.10, -0.60, 2.20), 45.0, 1.2,
                   target=(0.0, -0.4, 0.0), color=(1.0, 0.70, 0.60)),
        make_light(prefix + 'Rim', 'AREA', (-0.30, 1.20, 0.60), 130.0, 1.0,
                   target=(0.0, 0.0, -1.2), color=(0.9, 0.22, 0.18)),
    ]


def make_context_material():
    """预览用的墙/天花板，只为让 L 形转角看得出来；不进 glb。"""
    mat = bpy.data.materials.new('CrackDecorContext')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.050, 0.042, 0.040, 1.0)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    mat.use_backface_culling = False
    return mat


def make_context_planes(scene, mat):
    """墙 y=0.07 / 天花板 z=0.07，和游戏里的墙面一致。"""
    made = []
    for name, verts in (
            ('PreviewWall', [(-6.0, 0.07, -3.6), (6.0, 0.07, -3.6),
                             (6.0, 0.07, 1.2), (-6.0, 0.07, 1.2)]),
            ('PreviewCeil', [(-6.0, 0.07, 0.07), (6.0, 0.07, 0.07),
                             (6.0, -8.0, 0.07), (-6.0, -8.0, 0.07)])):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
        mesh.update()
        ob = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(ob)
        ob.data.materials.append(mat)
        made.append(ob)
    return made


def render_sheet():
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError('场景里没有 CrackDecor 集合，先跑 tools/build_crack_decor.py')
    sources = [ob for ob in coll.objects if ob.type == 'MESH']
    if len(sources) != 1:
        raise RuntimeError('CrackDecor 集合里应该只有一个网格，实际 %d 个' % len(sources))
    model = sources[0]
    real_mats = list(model.data.materials)

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
    prev_bg = None
    if world and world.use_nodes:
        bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
        if bg:
            prev_bg = (tuple(bg.inputs['Color'].default_value), bg.inputs['Strength'].default_value)

    hidden = {}
    for ob in scene.objects:
        if ob == model or ob.type == 'CAMERA':
            continue
        hidden[ob.name] = (ob.hide_render, ob.hide_viewport)
        ob.hide_render = True
        ob.hide_viewport = True

    coll.hide_render = False
    lights = preview_lights('CrackPreview_')
    cam = bpy.data.objects.new('CrackPreviewCam', bpy.data.cameras.new('CrackPreviewCam'))
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
        world = bpy.data.worlds.new('CrackPreviewWorld')
        scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.004, 0.0025, 0.0025, 1.0)
    bg.inputs['Strength'].default_value = 1.0

    clay = make_clay_material()
    ctx_mat = make_context_material()
    context = make_context_planes(scene, ctx_mat)
    tmpdir = tempfile.gettempdir()
    tiles = {}
    wire_copy = None

    for name, kind, size, loc, target, mat_mode, exposure in VIEWS:
        # 墙/天花板只在 3/4 全景里出现：正面会挡住洞心，线框会被实体板挡掉。
        show_ctx = name.endswith('three_quarter') or name == 'real_macro'
        for ob in context:
            ob.hide_render = not show_ctx
        if mat_mode == 'wire':
            wire_copy = model.copy()
            wire_copy.data = model.data.copy()
            wire_copy.name = 'CrackDecor_wire'
            scene.collection.objects.link(wire_copy)
            wire_copy.parent = model.parent
            wire_copy.matrix_world = model.matrix_world.copy()
            mod = wire_copy.modifiers.new('Wire', 'WIREFRAME')
            mod.thickness = 0.0035
            mod.use_replace = True
            mod.use_boundary = True
            wire_copy.data.materials.clear()
            wire_copy.data.materials.append(clay)
            model.hide_render = True
        elif mat_mode == 'clay':
            model.data.materials.clear()
            model.data.materials.append(clay)

        place_camera(cam, loc, target, kind, size)
        scene.view_settings.exposure = exposure
        path = os.path.join(tmpdir, 'crack_decor_%s.png' % name)
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
            model.hide_render = False
        elif mat_mode == 'clay':
            model.data.materials.clear()
            for m in real_mats:
                model.data.materials.append(m)

    top = np.concatenate((tiles['real_front'], tiles['real_three_quarter'],
                          tiles['real_macro']), axis=1)
    bottom = np.concatenate((tiles['clay_front'], tiles['clay_three_quarter'],
                             tiles['wire']), axis=1)
    sheet = np.concatenate((bottom, top), axis=0)

    out_img = bpy.data.images.new('crack_decor_v01_turnaround',
                                  width=sheet.shape[1], height=sheet.shape[0])
    out_img.colorspace_settings.name = 'Non-Color'
    out_img.pixels = sheet.ravel().tolist()

    written = OUT_PNG
    try:
        with open(written, 'wb'):
            pass
    except OSError:
        written = os.path.join(tmpdir, 'crack_decor_v01_turnaround.png')
        print('workspace write denied, sheet goes to', written)
    out_img.filepath_raw = written
    out_img.file_format = 'PNG'
    out_img.save()
    print('sheet ->', written, sheet.shape[1], 'x', sheet.shape[0])

    print('measure: real_front mean luma %.4f (sRGB, exposure %+.1f)'
          % (float(tiles['real_front'][:, :, :3].mean()), VIEWS[0][6]))

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
    if 'CrackDecorClayPreview' in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials['CrackDecorClayPreview'])
    for ob in context:
        mesh = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    if 'CrackDecorContext' in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials['CrackDecorContext'])
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


def quick(path=None, mode='clay', exposure=-0.6, loc=(3.30, -4.70, -1.10),
          target=(0.0, -0.85, -1.60), lens=46.0):
    """单张快照，边调边看。"""
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    model = next(ob for ob in coll.objects if ob.type == 'MESH')
    real_mats = list(model.data.materials)
    prev_cam = scene.camera
    prev_res = (scene.render.resolution_x, scene.render.resolution_y)
    prev_view = (scene.view_settings.view_transform, scene.view_settings.look,
                 scene.view_settings.exposure)
    prev_engine = scene.render.engine
    hidden = {}
    for ob in scene.objects:
        if ob == model or ob.type == 'CAMERA':
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
    bg.inputs['Color'].default_value = (0.004, 0.0025, 0.0025, 1.0)
    bg.inputs['Strength'].default_value = 1.0

    clay = None
    if mode == 'clay':
        clay = make_clay_material()
        model.data.materials.clear()
        model.data.materials.append(clay)
    place_camera(cam, loc, target, 'PERSP' if abs(lens) > 1e-6 else 'ORTHO', lens)
    out = path or os.path.join(tempfile.gettempdir(), 'crack_decor_quick.png')
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)

    if clay is not None:
        model.data.materials.clear()
        for m in real_mats:
            model.data.materials.append(m)
        if 'CrackDecorClayPreview' in bpy.data.materials:
            bpy.data.materials.remove(bpy.data.materials['CrackDecorClayPreview'])
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

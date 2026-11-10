"""山羊头模型（goat_head_v01.glb）的预览图：2×2 四格，深灰背景 + 三点光。

四格：正面、3/4 透视、侧面、背面 3/4。用 Cycles CPU 渲，640 一格。
和正式渲染无关：世界、灯、相机在渲完都还原，不影响场景。

用法（先 build）：
  blender -b --factory-startup -P tools/build_goat_head.py -P tools/render_goat_head_sheet.py
输出 docs/images/goat_head_v01_turnaround.png。
"""
import math
import os
import pathlib

import bpy
import numpy as np
from mathutils import Vector

try:
    HERE = pathlib.Path(__file__).resolve().parent
except NameError:
    HERE = pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools')

PROJECT = HERE.parent
OUT_PNG = PROJECT / 'docs' / 'images' / 'goat_head_v01_turnaround.png'
TILE = 640
COLL_NAME = 'GoatHead'

# (名字, 投影, 方位角°, 仰角°, 正交尺寸 m / 焦距 mm, 相机距离 m, 目标点)
TARGET = (0.0, -0.1901, 0.0)
VIEWS = [
    ('front', 'ORTHO', 0.0, 0.0, 0.50, 2.0, TARGET),
    ('three_quarter', 'PERSP', 35.0, 12.0, 55.0, 0.95, TARGET),
    ('profile', 'ORTHO', 90.0, 0.0, 0.48, 2.0, TARGET),
    ('back', 'ORTHO', 160.0, 14.0, 0.50, 2.0, TARGET),
]


def render_engine():
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    return 'CYCLES' if 'CYCLES' in engines else engines[0]


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


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
    aim(cam, target)


def make_lights(scene, target):
    specs = (
        ('Key', (0.55, -0.65, 0.55), 34.0, 0.55),
        ('Fill', (-0.70, -0.55, 0.10), 9.0, 0.90),
        ('Rim', (0.05, 0.75, 0.55), 24.0, 0.45),
    )
    lights = []
    for name, loc, energy, size in specs:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        ob = bpy.data.objects.new(name, data)
        scene.collection.objects.link(ob)
        ob.location = loc
        aim(ob, target)
        lights.append(ob)
    return lights


def render_sheet():
    scene = bpy.context.scene
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError('场景里没有 GoatHead 集合，先跑 tools/build_goat_head.py')
    meshes = [ob for ob in coll.objects if ob.type == 'MESH']
    if not meshes:
        raise RuntimeError('GoatHead 集合里没有网格')

    keep = set(coll.objects)
    hidden = {}
    for ob in scene.objects:
        if ob in keep:
            continue
        hidden[ob.name] = (ob.hide_render, ob.hide_viewport)
        ob.hide_render = True
    coll.hide_render = False

    cam_data = bpy.data.cameras.new('GoatHeadPreviewCam')
    cam = bpy.data.objects.new('GoatHeadPreviewCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    lights = make_lights(scene, TARGET)

    prev = {
        'engine': scene.render.engine,
        'res': (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage),
        'film': scene.render.film_transparent,
        'view': (scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure),
        'world': scene.world,
    }
    scene.render.engine = render_engine()
    scene.render.resolution_x = scene.render.resolution_y = TILE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    if scene.render.engine == 'CYCLES':
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True

    world = bpy.data.worlds.new('GoatHeadPreviewWorld') if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = world.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.0155, 0.015, 0.0145, 1.0)
    bg.inputs['Strength'].default_value = 1.0

    tmpdir = PROJECT / 'work' / 'blender_tmp'
    tmpdir.mkdir(parents=True, exist_ok=True)
    tiles = {}
    for name, kind, az, elev, size, dist, target in VIEWS:
        place_camera(cam, target, az, elev, kind, size, dist)
        path = str(tmpdir / ('goat_head_%s.png' % name))
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        tiles[name] = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)
        print('rendered', name)

    top = np.concatenate((tiles['front'], tiles['three_quarter']), axis=1)
    bottom = np.concatenate((tiles['profile'], tiles['back']), axis=1)
    sheet = np.concatenate((bottom, top), axis=0)

    out_img = bpy.data.images.new('goat_head_v01_turnaround', width=sheet.shape[1], height=sheet.shape[0])
    out_img.colorspace_settings.name = 'Non-Color'
    out_img.pixels = sheet.ravel().tolist()
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    out_img.filepath_raw = str(OUT_PNG)
    out_img.file_format = 'PNG'
    out_img.save()
    print('sheet ->', OUT_PNG, sheet.shape[1], 'x', sheet.shape[0])
    bpy.data.images.remove(out_img)

    for ob in lights:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.lights.remove(data)
    scene.camera = None
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cam_data)
    scene.render.engine = prev['engine']
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = prev['res']
    scene.render.film_transparent = prev['film']
    scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = prev['view']
    for ob in scene.objects:
        if ob.name in hidden:
            ob.hide_render, ob.hide_viewport = hidden[ob.name]
    return OUT_PNG


if globals().get('__name__', '__main__') == '__main__':
    render_sheet()

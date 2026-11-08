"""无头（blender --background）建 v03 + 出转台图与效果图。

用户那边 Blender 关了，MCP 连不上，所以这个脚本自带灯光/相机，
自己搭一个干净的棚拍场景（深灰背景、三盏面光），不依赖主场景。
输出到 %TEMP%/dsh_render，再由 DSH 拷回仓库。
"""
import math
import os
import pathlib
import tempfile

import bpy
import numpy as np
from mathutils import Vector

TOOLS = pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools')
OUT = pathlib.Path(tempfile.gettempdir()) / 'dsh_render'
OUT.mkdir(parents=True, exist_ok=True)

exec(open(str(TOOLS / 'build_puppet_v03.py')).read())

scene = bpy.context.scene
keep = set(bpy.data.collections['PuppetV3'].objects) if 'PuppetV3' in bpy.data.collections else set()
for ob in list(bpy.data.objects):
    if ob not in keep:
        bpy.data.objects.remove(ob, do_unlink=True)

world = scene.world or bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (0.045, 0.045, 0.045, 1.0)
bg.inputs[1].default_value = 1.0

CENTER = Vector((2.0, -1.3, 0.95))


def add_area(name, loc, energy, size, target=CENTER):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.size = size
    ob = bpy.data.objects.new(name, d)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


add_area('Key', (4.7, -4.1, 3.1), 160.0, 2.6)
add_area('Fill', (2.3, -3.3, 1.0), 45.0, 2.8)
add_area('Rim', (2.2, 1.4, 2.6), 80.0, 2.2)

cam_data = bpy.data.cameras.new('Cam')
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 64
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.image_settings.file_format = 'PNG'


def shoot(path, loc, target, lens, rx, ry, ortho=None):
    if ortho is not None:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho
    else:
        cam_data.type = 'PERSP'
        cam_data.lens = lens
        cam_data.sensor_width = 36
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = rx
    scene.render.resolution_y = ry
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def aim_from(azimuth_deg, dist=6.0, z=0.88):
    a = math.radians(azimuth_deg)
    target = Vector((CENTER.x, CENTER.y, z))
    return (target.x + dist * math.sin(a), target.y - dist * math.cos(a), target.z), target


TILE_W, TILE_H = 440, 860
views = [('front', 0.0, 0.88, 2.0), ('three_quarter', 40.0, 0.88, 2.0),
         ('side', 90.0, 0.88, 2.0), ('back', 180.0, 0.88, 2.0),
         ('face', 8.0, 1.632, 0.40), ('hip', 25.0, 0.95, 0.46)]
paths = []
for name, az, fz, ortho in views:
    loc, target = aim_from(az, z=fz)
    p = OUT / ('tile_%s.png' % name)
    shoot(p, loc, target, 50, TILE_W, TILE_H, ortho=ortho)
    paths.append(p)

row = None
for p in paths:
    img = bpy.data.images.load(str(p))
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    row = px if row is None else np.concatenate((row, px), axis=1)
sheet = bpy.data.images.new('sheet', width=row.shape[1], height=row.shape[0])
sheet.colorspace_settings.name = 'Non-Color'
sheet.pixels = row.ravel().tolist()
sheet.filepath_raw = str(OUT / 'puppet_v03_turnaround.png')
sheet.file_format = 'PNG'
sheet.save()
print('SHEET', sheet.filepath_raw, row.shape[1], row.shape[0])

shoot(OUT / 'wood_body.png', (3.55, -4.05, 1.25), (2.0, -1.30, 0.98), 50, 1000, 1400)
shoot(OUT / 'wood_face.png', (2.30, -2.62, 1.60), (2.0, -1.30, 1.63), 85, 1000, 1000)
shoot(OUT / 'wood_hip.png', (2.55, -2.45, 1.12), (1.98, -1.30, 0.93), 85, 1000, 1000)
print('DONE')

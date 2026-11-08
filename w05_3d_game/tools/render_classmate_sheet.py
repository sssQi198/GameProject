"""渲染同学的转台图（4 视图拼一张 PNG）。

依赖 build_classmate.py 已经跑过（场景里有 Classmate 集合）。
在 Blender 里 exec(open(...).read()) 即可；结束后会把加的灯删掉，
场景灯 / 树 / 渲染设置都恢复原样。

输出优先写 docs/images/classmate_v01_turnaround.png；工作区不允许 Blender 写时
退回临时目录，路径会打出来，再用 DSH 拷回仓库。
"""
import math
import os
import pathlib
import tempfile

import bpy
import numpy as np
from mathutils import Vector

OUT_PNG = str(pathlib.Path(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\docs\images')
              / 'classmate_v01_turnaround.png')
ROOT = 'Classmate'
# (名字, 方位角, 正交相机中心高度, 正交尺寸)：前四格全身，最后一格头部特写
VIEWS = [
    ('front', 0.0, 0.88, 2.0),
    ('three_quarter', 45.0, 0.88, 2.0),
    ('side', 90.0, 0.88, 2.0),
    ('back', 180.0, 0.88, 2.0),
    ('face', 12.0, 1.622, 0.36),
    ('hand', 30.0, None, 0.32),   # None = 按右手网格自动取位置
]
TILE_W, TILE_H = 440, 860
CAM_DIST = 6.0
LIGHTS = [
    ('SheetKey',  (4.8, -3.0, 2.9), 150.0, 2.4),
    ('SheetFill', (2.0, -2.6, 1.4), 40.0, 2.5),
    ('SheetRim',  (2.4, 2.8, 2.4), 70.0, 2.0),
]


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def make_lights():
    objs = []
    for name, loc, energy, size in LIGHTS:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        ob = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = loc
        aim(ob, (3.4, 0.0, 1.05))
        objs.append(ob)
    return objs


def cleanup_lights(objs):
    for ob in objs:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data.users == 0:
            bpy.data.lights.remove(data)


def hand_target(root):
    """右手网格最低那一段的中心，用来给手部特写取景。"""
    arm = bpy.data.objects.get('Classmate_Hand_R') or bpy.data.objects.get('Classmate_Arm_R')
    if arm is None:
        return Vector((root.location.x + 0.30, 0.0, 0.78))
    ws = [arm.matrix_world @ v.co for v in arm.data.vertices]
    z0 = min(w.z for w in ws)
    low = [w for w in ws if w.z < z0 + 0.09]
    cx = sum(w.x for w in low) / len(low)
    cy = sum(w.y for w in low) / len(low)
    return Vector((cx, cy, z0 + 0.095))


def render_sheet():
    scene = bpy.context.scene
    root = bpy.data.objects.get(ROOT)
    if root is None:
        raise RuntimeError('找不到 Classmate 集合，先跑 build_classmate.py')
    center = Vector((root.location.x, 0.0, 0.88))

    cam = bpy.data.objects.get('PreviewCam')
    if cam is None:
        cam_data = bpy.data.cameras.new('PreviewCam')
        cam = bpy.data.objects.new('PreviewCam', cam_data)
        scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.0

    prev_cam = scene.camera
    prev_res = (scene.render.resolution_x, scene.render.resolution_y,
                scene.render.resolution_percentage)
    prev_view = (scene.view_settings.view_transform, scene.view_settings.look,
                 scene.view_settings.exposure)
    # 场景自带的 Key_Area(900W) / Sun 会把角色打亮成灰蓝，棚灯单独控光。
    scene_lights = [o for o in bpy.data.objects if o.type == 'LIGHT']
    light_hide = {o.name: o.hide_render for o in scene_lights}
    for o in scene_lights:
        o.hide_render = True
    # 只留 Classmate 和地面：树、木偶等别的物件都先关掉，免得混进图里。
    keep = {'Ground', ROOT}
    coll = bpy.data.collections.get('Classmate')
    if coll:
        for ob in coll.objects:
            keep.add(ob.name)
            keep |= {c.name for c in ob.children_recursive}
    extras = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in keep]
    extra_hide = {o.name: o.hide_render for o in extras}
    for o in extras:
        o.hide_render = True

    sheet_lights = make_lights()
    scene.camera = cam
    scene.render.resolution_x = TILE_W
    scene.render.resolution_y = TILE_H
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0

    tmpdir = tempfile.gettempdir()
    paths = []
    for name, azimuth, focus_z, ortho in VIEWS:
        a = math.radians(azimuth)
        target = hand_target(root) if focus_z is None else Vector((center.x, 0.0, focus_z))
        cam.data.ortho_scale = ortho
        cam.location = (target.x + CAM_DIST * math.sin(a),
                        target.y - CAM_DIST * math.cos(a), target.z)
        cam.rotation_euler = (math.radians(90.0), 0.0, a)
        path = os.path.join(tmpdir, 'classmate_sheet_%s.png' % name)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)

    # 拼图：所有视角共用背景，直接无缝横排
    row = None
    for path in paths:
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = 'Non-Color'
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)
        row = px if row is None else np.concatenate((row, px), axis=1)
    out_img = bpy.data.images.new('classmate_turnaround', width=row.shape[1], height=row.shape[0])
    out_img.colorspace_settings.name = 'Non-Color'
    out_img.pixels = row.ravel().tolist()

    written = OUT_PNG
    try:
        with open(written, 'wb'):
            pass
    except OSError:
        written = os.path.join(tmpdir, 'classmate_v01_turnaround.png')
        print('workspace write denied, sheet goes to', written)
    out_img.filepath_raw = written
    out_img.file_format = 'PNG'
    out_img.save()
    print('sheet ->', written, row.shape[1], 'x', row.shape[0])

    # 还原
    cleanup_lights(sheet_lights)
    for o in scene_lights:
        o.hide_render = light_hide[o.name]
    for o in extras:
        o.hide_render = extra_hide[o.name]
    scene.camera = prev_cam
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = prev_res
    scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = prev_view
    bpy.context.view_layer.update()
    return written


if __name__ == '__main__':
    render_sheet()

"""没有 MCP 插件时用命令行跑一遍建模和转台图。

    blender -b --factory-startup -P tools/headless_run.py

搭一个最小场景（世界 + 地面），然后依次执行 build_classmate.py、
render_classmate_sheet.py 和脸部/手部特写渲染。输出路径会打印出来；
工作区不允许 Blender 直接写时会落到系统临时目录。
"""
import math
import os
import pathlib
import tempfile

import bpy
from mathutils import Vector

HERE = pathlib.Path(__file__).resolve().parent
BUILD = HERE / 'build_classmate.py'
SHEET = HERE / 'render_classmate_sheet.py'


def run_script(path):
    g = {'__name__': '__main__', '__file__': str(path)}
    exec(compile(path.read_text(encoding='utf-8'), str(path), 'exec'), g)
    return g


def make_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.0508, 0.0508, 0.0508, 1.0)

    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = 'Ground'
    mat = bpy.data.materials.new('GroundMat')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.30, 0.32, 0.27, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    ground.data.materials.append(mat)

    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for name in ('BLENDER_EEVEE', 'CYCLES'):
        if name in engines:
            try:
                scene.render.engine = name
                break
            except TypeError:
                continue
    if scene.render.engine == 'CYCLES':
        scene.cycles.samples = 48
        scene.cycles.use_denoising = True
    print('engine:', scene.render.engine)
    scene.render.resolution_percentage = 100
    return scene


def render_details():
    """脸部和手部的两张特写，拼图交给调用方。"""
    scene = bpy.context.scene
    cam = bpy.data.objects.get('PreviewCam')
    if cam is None:
        cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
        scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'

    def aim(ob, target):
        d = Vector(target) - ob.location
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

    lights = []
    for name, loc, energy, size, tgt in (
            ('Key', (4.7, -2.8, 2.6), 110.0, 2.0, (3.4, 0.0, 1.5)),
            ('Fill', (2.2, -2.6, 1.3), 30.0, 2.0, (3.4, 0.0, 1.2)),
            ('Side', (5.5, 0.6, 1.3), 30.0, 0.9, (3.5, 0.0, 0.8))):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = size
        ob = bpy.data.objects.new(name, data)
        scene.collection.objects.link(ob)
        ob.location = loc
        aim(ob, tgt)
        lights.append(ob)

    arm = bpy.data.objects['Classmate_Arm_R']
    ws = [arm.matrix_world @ v.co for v in arm.data.vertices]
    z0 = min(w.z for w in ws)
    low = [w for w in ws if w.z < z0 + 0.09]
    hand_t = Vector((sum(w.x for w in low) / len(low), sum(w.y for w in low) / len(low), z0 + 0.095))

    prev = (scene.camera, scene.render.resolution_x, scene.render.resolution_y,
            scene.view_settings.view_transform)
    scene.camera = cam
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    shots = [
        ('face', 0.0, (3.4, 0.0, 1.632), 0.26, 560, 560),
        ('face34', 38.0, (3.4, 0.0, 1.632), 0.26, 560, 560),
        ('hand_a', 25.0, tuple(hand_t), 0.30, 520, 520),
        ('hand_b', 100.0, tuple(hand_t), 0.30, 520, 520),
    ]
    out = []
    for tag, az, target, scale, rx, ry in shots:
        a = math.radians(az)
        cam.data.ortho_scale = scale
        cam.location = (target[0] + 6 * math.sin(a), target[1] - 6 * math.cos(a), target[2])
        cam.rotation_euler = (math.radians(90.0), 0.0, a)
        scene.render.resolution_x = rx
        scene.render.resolution_y = ry
        path = os.path.join(tempfile.gettempdir(), 'detail_%s.png' % tag)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        out.append(path)

    for ob in lights:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.lights.remove(data)
    scene.camera = prev[0]
    scene.render.resolution_x, scene.render.resolution_y = prev[1], prev[2]
    scene.view_settings.view_transform = prev[3]
    return out


if __name__ == '__main__':
    make_scene()
    g = run_script(BUILD)
    print('GLB ->', g.get('_glb'), 'tris', g.get('_tris'))
    g2 = run_script(SHEET)
    print('SHEET ->', os.path.join(tempfile.gettempdir(), 'classmate_v01_turnaround.png'))
    print('DETAILS ->', render_details())

# -*- coding: utf-8 -*-
"""Split the existing Y-up student into parented limb meshes.

No remodeling: every vertex comes from the current student meshes; limbs are only cut
at the joints.  Each part is a separate mesh object whose origin sits on its joint,
with identity rotation (local -Y points down the limb / world down in the rest pose).

Hierarchy (glTF keeps it):
  Classmate_Root
    Classmate_Body                     origin (0, 0, 0)      neck+torso+jacket+collar+backpack+hip
      Classmate_Leg_L/R                origin (±0.090, 0.895, 0)
        Classmate_Shin_L/R             origin 0.45 m down, shin
          Classmate_Foot_L/R           origin 0.35 m further down, shoe
      Classmate_Arm_L/R                origin (±0.190, 1.400, 0)
        Classmate_Forearm_L/R          origin 0.30 m down the arm
          Classmate_Hand_L/R           origin 0.25 m further, palm+fingers
      Classmate_Head                   origin (0, 1.535, 0), head+hair
"""
import bpy, bmesh, math, os, json, struct
from mathutils import Vector, Matrix

PROJ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "source", "classmate"))
RD = os.path.join(PROJ, "renders")
SRC_NAMES = ["Head", "Hair", "Jacket", "Collar", "Trousers", "Shoes", "Hand_L", "Hand_R", "Backpack"]

# ------------------------------------------------------------------ mesh utilities
def obj_bm(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    bm.faces.index_update()
    return bm

def islands(bm):
    bm.faces.ensure_lookup_table()
    bm.verts.index_update()
    bm.faces.index_update()
    seen = set()
    out = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        seen.add(f.index)
        comp = []
        while stack:
            cf = stack.pop()
            comp.append(cf)
            for e in cf.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        out.append(comp)
    return out

def extract(comp):
    nb = bmesh.new()
    vmap = {}
    for f in comp:
        nv = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = nb.verts.new(v.co)
            nv.append(vmap[v])
        nf = nb.faces.new(nv)
        nf.material_index = f.material_index
        nf.smooth = f.smooth
    nb.normal_update()
    return nb

def cut_plane(nb, co, no):
    co = Vector(co)
    no = Vector(no).normalized()
    geom = list(nb.verts) + list(nb.edges) + list(nb.faces)
    res = bmesh.ops.bisect_plane(nb, geom=geom, dist=1e-6, plane_co=co, plane_no=no,
                                 clear_inner=False, clear_outer=False)
    ce = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    if ce:
        bmesh.ops.split_edges(nb, edges=ce)
    nb.verts.index_update()
    nb.faces.index_update()
    return islands(nb)

def fill_holes(nb):
    nb.edges.ensure_lookup_table()
    be = [e for e in nb.edges if e.is_boundary]
    if be:
        try:
            bmesh.ops.holes_fill(nb, edges=be, sides=0)
        except Exception:
            pass

def ymin_island(comp):
    return min(v.co.y for f in comp for v in f.verts)

def ymax_island(comp):
    return max(v.co.y for f in comp for v in f.verts)

def merge_bm(target, nb):
    """Append nb geometry into target bmesh (used to keep one part per object)."""
    vmap = {}
    for v in nb.verts:
        vmap[v] = target.verts.new(v.co)
    for f in nb.faces:
        nf = target.faces.new([vmap[v] for v in f.verts])
        nf.material_index = f.material_index
        nf.smooth = f.smooth
    return target

# ------------------------------------------------------------------ part collector
class Coll:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.fmats = []
        self.names = []
        self.map = {}

    def add_bm(self, nb, src_mats):
        vmap = {}
        for f in nb.faces:
            nm = "Skin_Warm"
            if src_mats and f.material_index < len(src_mats) and src_mats[f.material_index]:
                nm = src_mats[f.material_index].name
            if nm not in self.map:
                self.map[nm] = len(self.names)
                self.names.append(nm)
            mi = self.map[nm]
            fv = []
            for v in f.verts:
                if v not in vmap:
                    vmap[v] = len(self.verts)
                    self.verts.append(v.co.copy())
                fv.append(vmap[v])
            self.faces.append(tuple(fv))
            self.fmats.append(mi)

# ------------------------------------------------------------------ build parts
def main():
    scene = bpy.context.scene
    src = {n: bpy.data.objects[n] for n in SRC_NAMES}
    S = "Classmate_"
    parts = {S + k: Coll() for k in
             ["Body", "Head", "Leg_L", "Leg_R", "Shin_L", "Shin_R", "Foot_L", "Foot_R",
              "Arm_L", "Arm_R", "Forearm_L", "Forearm_R", "Hand_L", "Hand_R"]}

    # ---- Head object: ball -> head, neck -> body
    bm = obj_bm(src["Head"])
    for comp in islands(bm):
        nb = extract(comp)
        if max(v.co.y for v in nb.verts) > 1.60:
            parts[S + "Head"].add_bm(nb, src["Head"].data.materials)
        else:
            parts[S + "Body"].add_bm(nb, src["Head"].data.materials)
        nb.free()
    bm.free()

    # ---- Hair -> head
    bm = obj_bm(src["Hair"])
    for comp in islands(bm):
        nb = extract(comp)
        parts[S + "Head"].add_bm(nb, src["Hair"].data.materials)
        nb.free()
    bm.free()

    # ---- Collar, Backpack -> body
    for name in ("Collar", "Backpack"):
        bm = obj_bm(src[name])
        nb = extract(list(bm.faces))
        parts[S + "Body"].add_bm(nb, src[name].data.materials)
        nb.free()
        bm.free()

    # ---- Jacket: torso -> body, sleeves -> arm / forearm (cut at elbow)
    arm_geo = {}
    bm = obj_bm(src["Jacket"])
    for comp in islands(bm):
        nb = extract(comp)
        xs = [v.co.x for v in nb.verts]
        if max(xs) < 0.25 and min(xs) > -0.25:
            parts[S + "Body"].add_bm(nb, src["Jacket"].data.materials)
            nb.free()
        else:
            sx = 1 if max(xs) > 0 else -1
            arm_geo[sx] = nb
    bm.free()

    arm_joints = {}
    for sx, nb in arm_geo.items():
        # cuff centre = lowest verts, shoulder pivot per spec
        vs = list(nb.verts)
        ycut = min(v.co.y for v in vs) + 0.02
        cuff = [v.co for v in vs if v.co.y < ycut]
        cuff_c = sum(cuff, Vector()) / len(cuff)
        shoulder = Vector((sx * 0.190, 1.400, 0.0))
        d = (cuff_c - shoulder).normalized()
        t = (1.100 - shoulder.y) / d.y
        elbow = shoulder + d * t
        wrist = elbow + d * ((0.850 - elbow.y) / d.y)   # exactly 0.25 m further down
        arm_joints[sx] = (shoulder, elbow, wrist, d)

        halves = cut_plane(nb, elbow, d)
        for comp in halves:
            part = extract(comp)
            if ymax_island(comp) > 1.20:
                parts[S + "Arm_L" if sx > 0 else S + "Arm_R"].add_bm(part, src["Jacket"].data.materials)
            else:
                parts[S + "Forearm_L" if sx > 0 else S + "Forearm_R"].add_bm(part, src["Jacket"].data.materials)
            part.free()
        nb.free()

    # ---- Trousers: hip yoke -> body, legs -> thigh / shin (cut at hip and knee)
    bm = obj_bm(src["Trousers"])
    for comp in islands(bm):
        nb = extract(comp)
        xs = [v.co.x for v in nb.verts]
        if max(v.co.y for v in nb.verts) > 1.00:
            parts[S + "Body"].add_bm(nb, src["Trousers"].data.materials)
            nb.free()
            continue
        sx = 1 if sum(xs) / len(xs) > 0 else -1
        # cut off the hidden stub above the hip joint
        halves = cut_plane(nb, (0, 0.895, 0), (0, 1, 0))
        upper = max(halves, key=ymax_island)
        lower = min(halves, key=ymax_island)
        leg_bm = extract(lower)
        nb.free()
        knees = cut_plane(leg_bm, (0, 0.445, 0), (0, 1, 0))
        for comp2 in knees:
            part = extract(comp2)
            if ymax_island(comp2) > 0.60:
                parts[S + "Leg_L" if sx > 0 else S + "Leg_R"].add_bm(part, src["Trousers"].data.materials)
            else:
                parts[S + "Shin_L" if sx > 0 else S + "Shin_R"].add_bm(part, src["Trousers"].data.materials)
            part.free()
        leg_bm.free()
    bm.free()

    # ---- Shoes -> feet
    bm = obj_bm(src["Shoes"])
    for comp in islands(bm):
        nb = extract(comp)
        xs = [v.co.x for v in nb.verts]
        sx = 1 if sum(xs) / len(xs) > 0 else -1
        parts[S + "Foot_L" if sx > 0 else S + "Foot_R"].add_bm(nb, src["Shoes"].data.materials)
        nb.free()
    bm.free()

    # ---- Hands
    for side, name in ((1, "Hand_L"), (-1, "Hand_R")):
        bm = obj_bm(src[name])
        nb = extract(list(bm.faces))
        parts[S + ("Hand_L" if side > 0 else "Hand_R")].add_bm(nb, src[name].data.materials)
        nb.free()
        bm.free()

    # ---- origins / parents
    shoulder_L, elbow_L, wrist_L, _ = arm_joints[1]
    shoulder_R, elbow_R, wrist_R, _ = arm_joints[-1]
    origins = {
        S + "Body": Vector((0.0, 0.0, 0.0)),
        S + "Head": Vector((0.0, 1.535, 0.0)),
        S + "Leg_L": Vector((0.090, 0.895, 0.0)),
        S + "Leg_R": Vector((-0.090, 0.895, 0.0)),
        S + "Shin_L": Vector((0.090, 0.445, 0.0)),
        S + "Shin_R": Vector((-0.090, 0.445, 0.0)),
        S + "Foot_L": Vector((0.090, 0.095, 0.0)),
        S + "Foot_R": Vector((-0.090, 0.095, 0.0)),
        S + "Arm_L": shoulder_L,
        S + "Arm_R": shoulder_R,
        S + "Forearm_L": elbow_L,
        S + "Forearm_R": elbow_R,
        S + "Hand_L": wrist_L,
        S + "Hand_R": wrist_R,
    }
    parent_of = {
        S + "Body": S + "Root",
        S + "Head": S + "Body",
        S + "Leg_L": S + "Body", S + "Leg_R": S + "Body",
        S + "Shin_L": S + "Leg_L", S + "Shin_R": S + "Leg_R",
        S + "Foot_L": S + "Shin_L", S + "Foot_R": S + "Shin_R",
        S + "Arm_L": S + "Body", S + "Arm_R": S + "Body",
        S + "Forearm_L": S + "Arm_L", S + "Forearm_R": S + "Arm_R",
        S + "Hand_L": S + "Forearm_L", S + "Hand_R": S + "Forearm_R",
    }

    # ---- root empty
    root = bpy.data.objects.new(S + "Root", None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.15
    root.location = (0.0, 0.0, 0.0)
    objs = {S + "Root": root}

    # ---- create mesh objects
    for name, coll in parts.items():
        origin = origins[name]
        verts = [v - origin for v in coll.verts]
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], coll.faces)
        me.validate(verbose=False)
        assert len(me.polygons) == len(coll.faces), (name, len(me.polygons), len(coll.faces))
        for nm in coll.names:
            me.materials.append(bpy.data.materials[nm])
        for i, p in enumerate(me.polygons):
            p.material_index = coll.fmats[i]
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        objs[name] = ob

    # ---- parenting (identity rotation everywhere)
    for name, ob in objs.items():
        if name == S + "Root":
            continue
        pn = parent_of[name]
        ob.parent = objs[pn]
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.location = origins[name] - (origins.get(pn, Vector((0, 0, 0))))
        ob.rotation_mode = 'XYZ'
        ob.rotation_euler = (0.0, 0.0, 0.0)
        ob.scale = (1.0, 1.0, 1.0)

    # ---- root extras: names of the parts, left then right
    order = [S + "Leg_L", S + "Leg_R", S + "Shin_L", S + "Shin_R",
             S + "Foot_L", S + "Foot_R", S + "Arm_L", S + "Arm_R",
             S + "Forearm_L", S + "Forearm_R", S + "Hand_L", S + "Hand_R",
             S + "Body", S + "Head"]
    root["parts"] = ",".join(order)
    for key, names in (("legs", order[0:2]), ("shins", order[2:4]), ("feet", order[4:6]),
                       ("arms", order[6:8]), ("forearms", order[8:10]), ("hands", order[10:12])):
        root["part_" + key] = ",".join(names)
    root["part_body"] = S + "Body"
    root["part_head"] = S + "Head"

    # ---- delete source objects
    for name in SRC_NAMES:
        bpy.data.objects.remove(src[name], do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)

    # ---- report
    bpy.context.view_layer.update()
    print("PARTS")
    for name in order:
        ob = objs[name]
        wl = ob.matrix_world.translation
        print(" ", name, "origin", tuple(round(v, 4) for v in wl),
              "parent", ob.parent.name if ob.parent else None,
              "tris", sum(len(p.vertices) - 2 for p in ob.data.polygons))
    print("root children:", [c.name for c in root.children])
    print("total tris", sum(sum(len(p.vertices) - 2 for p in o.data.polygons)
                            for o in objs.values() if o.type == 'MESH'))

    # ---- save + render + export
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PROJ, "classmate_rig.blend"))
    render_views()
    export_glb(root, objs)
    patch_extras(os.path.join(PROJ, "classmate_rig.glb"), S + "Root", order)

# ------------------------------------------------------------------ output
def look_at(ob, target, up=Vector((0, 1, 0))):
    d = (target - ob.location).normalized()
    right = d.cross(up).normalized()
    up2 = right.cross(d).normalized()
    ob.rotation_euler = Matrix((right, up2, -d)).transposed().to_euler()

def render_views():
    sc = bpy.context.scene
    cam = sc.camera
    views = [
        ("rig_front.png", Vector((0.0, 0.95, 4.6)), Vector((0, 0.885, 0)), 85, (820, 1280)),
        ("rig_three_quarter.png", Vector((2.7, 1.05, 3.7)), Vector((0, 0.89, 0)), 85, (820, 1280)),
        ("rig_side.png", Vector((4.5, 0.95, 0.0)), Vector((0, 0.885, 0)), 85, (820, 1280)),
    ]
    for name, loc, tgt, lens, res in views:
        cam.location = loc
        look_at(cam, tgt)
        cam.data.lens = lens
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = os.path.join(RD, name)
        bpy.ops.render.render(write_still=True)
        print("rendered", name)

def export_glb(root, objs):
    path = os.path.join(PROJ, "classmate_rig.glb")
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs.values():
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    sel = [ob for ob in objs.values()]
    with bpy.context.temp_override(active_object=root, selected_objects=sel,
                                   selected_editable_objects=sel):
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                                  export_yup=False, export_apply=True, export_extras=False,
                                  export_cameras=False, export_lights=False)
    print("exported", path, os.path.getsize(path))

def patch_extras(path, root_name, order):
    data = open(path, "rb").read()
    magic, ver, length = struct.unpack("<III", data[:12])
    off = 12
    chunks = []
    while off < length:
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        chunks.append([ctype, data[off + 8:off + 8 + clen]])
        off += 8 + clen
    js = json.loads(chunks[0][1].decode("utf-8"))
    extras = {
        "parts": order,
        "legs": order[0:2],
        "shins": order[2:4],
        "feet": order[4:6],
        "arms": order[6:8],
        "forearms": order[8:10],
        "hands": order[10:12],
        "body": order[12],
        "head": order[13],
    }
    found = False
    for n in js.get("nodes", []):
        if n.get("name") == root_name:
            n["extras"] = extras
            found = True
    print("extras patched on", root_name, found)
    new_json = json.dumps(js, separators=(",", ":")).encode("utf-8")
    pad = (4 - len(new_json) % 4) % 4
    new_json += b" " * pad
    chunks[0][1] = new_json
    body = bytearray()
    for ctype, cdata in chunks:
        body += struct.pack("<II", len(cdata), ctype) + cdata
    out = struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + bytes(body)
    open(path, "wb").write(out)
    print("extras written", path)

if __name__ == "__main__":
    main()

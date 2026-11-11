# -*- coding: utf-8 -*-
"""Stylized Chinese high-school boy, Y-up, 1 unit = 1 m.

Axes: +Y up (feet at y = 0), +Z forward (face), +X to the character's left.
Head: solid ball r = 0.135, centre (0, 1.59, 0); every facial feature is sculpted
into (or flush with) that ball. Height including hair = 1.75.
"""
import bpy, bmesh, math, os, random
from math import sin, cos, pi, sqrt, exp, asin, acos
from mathutils import Vector, Matrix, Quaternion
from mathutils import noise as mnoise

PROJ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "source", "classmate"))
RENDER_DIR = os.path.join(PROJ, "renders")

HEAD_R = 0.135
HEAD_C = Vector((0.0, 1.59, 0.0))
EYE_X, EYE_Y = 0.052, 1.605
MOUTH_Y = 1.538
HAIR_TOP = 1.75

# Blank face: no eyes, no mouth, no nose — the head stays a clean ball.
BLANK_FACE = True

# ------------------------------------------------------------------ helpers
def clamp(x, a, b):
    return a if x < a else (b if x > b else x)

def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def lerp(a, b, t):
    return a + (b - a) * t

def gauss(p, c, s):
    dx = (p[0] - c[0]) / s[0]
    dy = (p[1] - c[1]) / s[1]
    dz = (p[2] - c[2]) / s[2]
    return exp(-(dx * dx + dy * dy + dz * dz))

def hex_lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)

def make_mat(name, hexcol, rough=0.93, spec=0.15):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    col = hex_lin(hexcol)
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    m.diffuse_color = col
    return m

def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for ma in list(bpy.data.materials):
        if ma.users == 0:
            bpy.data.materials.remove(ma)

COLL = None
def get_coll():
    global COLL
    if COLL is None or COLL.name not in bpy.data.collections:
        c = bpy.data.collections.get("Character")
        if c is None:
            c = bpy.data.collections.new("Character")
            bpy.context.scene.collection.children.link(c)
        COLL = c
    return COLL

def add_object(name, verts, faces, mats, face_mats=None, smooth=True, recalc=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(verbose=False)
    for m in mats:
        me.materials.append(m)
    if face_mats is not None:
        for i, p in enumerate(me.polygons):
            p.material_index = face_mats[i] if i < len(face_mats) else 0
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    get_coll().objects.link(ob)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    return ob

def loft(rings, cap_start=False, cap_end=False):
    n = len(rings[0])
    verts = []
    for r in rings:
        verts.extend(r)
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j))
    if cap_start:
        faces.append(tuple(range(n - 1, -1, -1)))
    if cap_end:
        off = (len(rings) - 1) * n
        faces.append(tuple(range(off, off + n)))
    return verts, faces

def superellipse(n, a, b, e=2.4, cz=0.0, phase=0.0):
    """Ring in the XZ plane (y up, z forward)."""
    pts = []
    for i in range(n):
        t = 2 * pi * i / n + phase
        ct, st = cos(t), sin(t)
        x = a * math.copysign(abs(ct) ** (2.0 / e), ct)
        z = b * math.copysign(abs(st) ** (2.0 / e), st) + cz
        pts.append((x, z))
    return pts

def frames_along(points, hint=None):
    N = len(points)
    tans = []
    for i in range(N):
        if i == 0:
            t = points[1] - points[0]
        elif i == N - 1:
            t = points[-1] - points[-2]
        else:
            t = points[i + 1] - points[i - 1]
        tans.append(t.normalized())
    if hint is None:
        n0 = Vector((0, 1, 0))
        if abs(n0.dot(tans[0])) > 0.9:
            n0 = Vector((1, 0, 0))
        n0 = (n0 - tans[0] * n0.dot(tans[0])).normalized()
        normals = [n0]
        for i in range(1, N):
            q = tans[i - 1].rotation_difference(tans[i])
            n = q @ normals[-1]
            n = (n - tans[i] * n.dot(tans[i])).normalized()
            normals.append(n)
    else:
        normals = []
        for i in range(N):
            h = hint[i] if isinstance(hint, list) else hint
            n = h - tans[i] * h.dot(tans[i])
            if n.length < 1e-6:
                n = Vector((1, 0, 0))
            normals.append(n.normalized())
    return tans, normals

def sweep(points, radii, nsides=10, cap=True, hint=None):
    tans, normals = frames_along(points, hint)
    rings = []
    for i, p in enumerate(points):
        t, n = tans[i], normals[i]
        b = t.cross(n)
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        rx, ry = (r if isinstance(r, (list, tuple)) else (r, r))
        ring = []
        for k in range(nsides):
            a = 2 * pi * k / nsides
            ring.append(p + n * (cos(a) * rx) + b * (sin(a) * ry))
        rings.append(ring)
    return loft(rings, cap, cap)

def catmull(pts, samples=6):
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t +
                              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out

def cr_scalar(vals, t):
    n = len(vals)
    i = clamp(int(math.floor(t)), 0, n - 2)
    f = t - i
    p0 = vals[max(i - 1, 0)]
    p1 = vals[i]
    p2 = vals[i + 1]
    p3 = vals[min(i + 2, n - 1)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)

def solid_sheet(grid_o, grid_i):
    nr, nc = len(grid_o), len(grid_o[0])
    verts = []
    for row in grid_o:
        verts.extend(row)
    off_i = len(verts)
    for row in grid_i:
        verts.extend(row)
    faces = []
    oi = lambda j, i: j * nc + i
    ii = lambda j, i: off_i + j * nc + i
    for j in range(nr - 1):
        for i in range(nc - 1):
            faces.append((oi(j, i), oi(j, i + 1), oi(j + 1, i + 1), oi(j + 1, i)))
            faces.append((ii(j, i), ii(j + 1, i), ii(j + 1, i + 1), ii(j, i + 1)))
    for j in range(nr - 1):
        faces.append((oi(j, 0), ii(j, 0), ii(j + 1, 0), oi(j + 1, 0)))
        faces.append((oi(j, nc - 1), oi(j + 1, nc - 1), ii(j + 1, nc - 1), ii(j, nc - 1)))
    for i in range(nc - 1):
        faces.append((oi(nr - 1, i), oi(nr - 1, i + 1), ii(nr - 1, i + 1), ii(nr - 1, i)))
        faces.append((oi(0, i), ii(0, i), ii(0, i + 1), oi(0, i + 1)))
    return verts, faces

# ------------------------------------------------------------------ materials
def build_materials():
    return {
        "Skin_Warm": make_mat("Skin_Warm", "#cba57f", 0.90, 0.12),
        "Hair_Black": make_mat("Hair_Black", "#17130f", 0.88, 0.08),
        "Cloth_Navy": make_mat("Cloth_Navy", "#252a3a", 0.97, 0.05),
        "Collar_Pale": make_mat("Collar_Pale", "#a8a294", 0.96, 0.05),
        "Pants_Charcoal": make_mat("Pants_Charcoal", "#1d2026", 0.97, 0.04),
        "Bag_Brown": make_mat("Bag_Brown", "#33291f", 0.98, 0.03),
        "Eye_Dark": make_mat("Eye_Dark", "#2b2018", 0.92, 0.04),
        "Face_Shadow": make_mat("Face_Shadow", "#231a15", 0.95, 0.03),
    }

# ------------------------------------------------------------------ head ball
def head_deform(d):
    """d = unit direction from head centre. Returns the sculpted world point.

    Only shallow indentations are used, so the silhouette stays a perfect ball:
    nasal side grooves + nostril dents + a faint philtrum.  The nose itself is the
    central ridge of the ball left between those grooves; its lowest forward point
    (the tip) is on the ball at z ~= 0.130.
    """
    p = d * HEAD_R + HEAD_C
    if BLANK_FACE:
        return p
    n = d
    disp = 0.0
    for sx in (1, -1):
        disp -= 0.0032 * gauss(p, (sx * 0.0215, 1.570, 0.121), (0.0075, 0.024, 0.020))  # nasal groove
        disp -= 0.0030 * gauss(p, (sx * 0.0105, 1.5455, 0.125), (0.0048, 0.0050, 0.010))  # nostril dent
        disp -= 0.0014 * gauss(p, (sx * 0.0170, 1.5415, 0.123), (0.0060, 0.0075, 0.013))  # alar crease
    disp -= 0.0009 * gauss(p, (0.0, 1.5215, 0.127), (0.0045, 0.011, 0.012))               # philtrum
    return p + n * disp

def sphere_dirs(nu=80, nv=56):
    """UV sphere directions, poles on Y."""
    dirs = []
    for j in range(1, nv):
        phi = pi * j / nv
        y = cos(phi)
        r = sin(phi)
        for i in range(nu):
            th = 2 * pi * i / nu
            dirs.append(Vector((r * cos(th), y, r * sin(th))))
    return dirs

def sph_point(d, off=0.0):
    """Point at radius HEAD_R + off along direction d (world)."""
    return HEAD_C + d * (HEAD_R + off)

def head_frame(x, y):
    """Surface point + tangent frame on the base ball at given x, y (front hemisphere)."""
    q = HEAD_R * HEAD_R - x * x - (y - HEAD_C.y) ** 2
    z = sqrt(max(q, 1e-9))
    c = Vector((x, y, z))
    n = (c - HEAD_C).normalized()
    r = Vector((0, 1, 0)).cross(n)
    if r.length < 1e-6:
        r = Vector((1, 0, 0))
    r.normalize()
    u = n.cross(r).normalized()
    return c, n, r, u

def build_head(mats):
    nu, nv = 80, 56
    dirs = sphere_dirs(nu, nv)
    faces = []
    idx = lambda j, i: (j - 1) * nu + (i % nu)
    for j in range(1, nv - 1):
        for i in range(nu):
            faces.append((idx(j, i), idx(j, i + 1), idx(j + 1, i + 1), idx(j + 1, i)))
    top = len(dirs); dirs.append(Vector((0, 1, 0)))
    bot = len(dirs); dirs.append(Vector((0, -1, 0)))
    for i in range(nu):
        faces.append((top, idx(1, i + 1), idx(1, i)))
        faces.append((bot, idx(nv - 1, i), idx(nv - 1, i + 1)))

    # local refinement around the nose / mid-face for the sculpted dents
    bm = bmesh.new()
    vs = [bm.verts.new(d * HEAD_R) for d in dirs]
    bm.verts.ensure_lookup_table()
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bm.faces.ensure_lookup_table()
    for _ in (range(2) if not BLANK_FACE else ()):
        fs = []
        for f in bm.faces:
            c = f.calc_center_median()
            if c.z > 0.075 and abs(c.x) < 0.055 and -0.090 < c.y < 0.045:
                fs.append(f)
        es = list({e for f in fs for e in f.edges})
        if es:
            bmesh.ops.subdivide_edges(bm, edges=es, cuts=1, use_grid_fill=True)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.verts.index_update()
    bm.faces.index_update()
    hv = [head_deform(v.co.normalized()) for v in bm.verts]
    hf = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()

    verts = [v for v in hv]
    faces = list(hf)
    fmat = [0] * len(hf)

    # ---- flat dark eyes (part of the head mesh, flush on the ball)
    for sx in ((1, -1) if not BLANK_FACE else ()):
        c, n, r, u = head_frame(sx * EYE_X, EYE_Y)
        N, RINGS = 26, 4
        ring_ids = []
        for ring in range(RINGS):
            k = 1.0 - ring / float(RINGS)
            row = []
            for i in range(N):
                a = 2 * pi * i / N
                ex = 0.01635 * cos(a) * k
                ey = 0.0075 * math.copysign(abs(sin(a)) ** 1.25, sin(a)) * k
                q = c + r * ex + u * ey
                qn = (q - HEAD_C).normalized()
                row.append(len(verts))
                verts.append(HEAD_C + qn * (HEAD_R + 0.00022))
            ring_ids.append(row)
        for ring in range(RINGS - 1):
            for i in range(N):
                j = (i + 1) % N
                faces.append((ring_ids[ring][i], ring_ids[ring][j],
                              ring_ids[ring + 1][j], ring_ids[ring + 1][i]))
                fmat.append(1)
        # close the centre with a fan to the innermost ring
        cy = len(verts)
        verts.append(HEAD_C + n * (HEAD_R + 0.00022))
        for i in range(N):
            j = (i + 1) % N
            faces.append((cy, ring_ids[RINGS - 1][i], ring_ids[RINGS - 1][j]))
            fmat.append(1)

    # ---- straight closed mouth (part of the head mesh)
    if not BLANK_FACE:
        N = 40
        top_row, bot_row = [], []
        for i in range(N + 1):
            t = -1.0 + 2.0 * i / N
            x = 0.045 * t
            hh = 0.0021 * max(0.0, 1.0 - t * t) ** 0.45 + 0.0002
            for row, yy in ((top_row, MOUTH_Y + hh), (bot_row, MOUTH_Y - hh)):
                q = Vector((x, yy, 0.0))
                q.z = sqrt(max(HEAD_R ** 2 - x * x - (yy - HEAD_C.y) ** 2, 1e-9))
                qn = (q - HEAD_C).normalized()
                row.append(len(verts))
                verts.append(HEAD_C + qn * (HEAD_R + 0.00022))
        for i in range(N):
            faces.append((top_row[i], top_row[i + 1], bot_row[i + 1], bot_row[i]))
            fmat.append(2)

    # ---- neck merged into the same solid head object
    off = len(verts)
    rings = []
    for y, rad, zo in ((1.320, 0.050, 0.004), (1.370, 0.047, 0.002),
                       (1.420, 0.045, 0.000), (1.500, 0.052, -0.004)):
        ring = []
        for i in range(28):
            a = 2 * pi * i / 28
            ring.append(Vector((rad * cos(a), y, rad * sin(a) * 1.05 + zo)))
        rings.append(ring)
    nv2, nf2 = loft(rings, True, True)
    verts.extend(nv2)
    faces.extend([tuple(i + off for i in f) for f in nf2])
    fmat.extend([0] * len(nf2))

    head_mats = ([mats["Skin_Warm"]] if BLANK_FACE
                 else [mats["Skin_Warm"], mats["Eye_Dark"], mats["Face_Shadow"]])
    add_object("Head", verts, faces, head_mats, face_mats=fmat, recalc=True)
    print("head verts", len(verts), "faces", len(faces))

# ------------------------------------------------------------------ hair
def hairline_e(a):
    """Elevation (rad) of the hairline; a = 0 is the face (+Z)."""
    c = cos(a)
    return math.radians(12.0 + 5.0 * c - 47.0 * (max(0.0, -c) ** 0.8))

def hair_radius(a, e):
    eh = hairline_e(a)
    t = clamp((e - eh) / max(1e-3, pi / 2 - eh), 0.0, 1.0)
    return HEAD_R + 0.0025 + 0.0225 * smoothstep(0.12, 0.85, t)

def hair_point(a, e, extra=0.0):
    r = hair_radius(a, e) + extra
    return HEAD_C + Vector((r * cos(e) * sin(a), r * sin(e), r * cos(e) * cos(a)))

def build_hair(mats):
    NA, NE = 72, 16
    verts, faces = [], []
    top = len(verts)
    verts.append(Vector((0, HAIR_TOP, 0)))
    rows = []
    for j in range(NE):
        row = []
        for i in range(NA):
            a = 2 * pi * i / NA
            eh = hairline_e(a)
            e = lerp(1.52, eh, j / (NE - 1))
            p = hair_point(a, e)
            rad = (p - HEAD_C).normalized()
            groove = 0.0013 * cos(12.0 * a + 0.4) + 0.0007 * sin(5.0 * a + 1.2)
            p = p + rad * groove
            row.append(len(verts))
            verts.append(p)
        rows.append(row)
    for i in range(NA):
        i2 = (i + 1) % NA
        faces.append((top, rows[0][i], rows[0][i2]))
    for j in range(NE - 1):
        for i in range(NA):
            i2 = (i + 1) % NA
            faces.append((rows[j][i], rows[j][i2], rows[j + 1][i2], rows[j + 1][i]))
    # rim so the hairline reads as thickness, not paper
    rim = []
    for i in range(NA):
        a = 2 * pi * i / NA
        p = hair_point(a, hairline_e(a))
        rim.append(len(verts))
        verts.append(p - (p - HEAD_C).normalized() * 0.0075)
    for i in range(NA):
        i2 = (i + 1) % NA
        faces.append((rows[-1][i], rows[-1][i2], rim[i2], rim[i]))

    # ---- one straight fringe across the forehead, bottom exactly at y = 1.63
    NC, NR = 40, 7
    xmax = 0.092
    y_top, y_bot = 1.672, 1.630
    go, gi = [], []
    for j in range(NR):
        t = j / (NR - 1)
        y = lerp(y_top, y_bot, t)
        ro, ri = [], []
        for i in range(NC):
            x = lerp(-xmax, xmax, i / (NC - 1))
            q = HEAD_R ** 2 - x * x - (y - HEAD_C.y) ** 2
            z = sqrt(max(q, 1e-9))
            # gentle strand grooves
            g = 0.0017 * cos((x / xmax) * pi * 11.0)
            out = 0.0030 + 0.0060 * t + g * (0.25 + 0.75 * t)
            # tuck the outer ends into the cap
            fe = min(1.0, min(i, NC - 1 - i) / 5.0)
            out = lerp(-0.0018, out, fe)
            ro.append(Vector((x, y, z + out)))
            ri.append(Vector((x, y, z + 0.0010)))
        go.append(ro)
        gi.append(ri)
    vv, ff = solid_sheet(go, gi)
    off = len(verts)
    verts.extend(vv)
    faces.extend([tuple(i + off for i in f) for f in ff])
    # keep the very top of the hair at exactly 1.75
    ymax = max(v.y for v in verts)
    if ymax > HAIR_TOP:
        f = (HAIR_TOP - HEAD_C.y) / (ymax - HEAD_C.y)
        verts = [Vector((v.x, HEAD_C.y + (v.y - HEAD_C.y) * f, v.z)) for v in verts]
    add_object("Hair", verts, faces, [mats["Hair_Black"]], recalc=True)
    print("hair verts", len(verts), "faces", len(faces))

# ------------------------------------------------------------------ body
JACKET_KEYS = [
    (0.885, 0.157, 0.099, 0.000),
    (0.925, 0.155, 0.098, 0.000),
    (0.970, 0.149, 0.096, 0.000),
    (1.020, 0.143, 0.092, 0.000),
    (1.080, 0.137, 0.089, 0.000),
    (1.140, 0.142, 0.091, 0.000),
    (1.200, 0.150, 0.094, 0.001),
    (1.255, 0.158, 0.096, 0.002),
    (1.305, 0.166, 0.097, 0.002),
    (1.345, 0.172, 0.095, 0.002),
    (1.372, 0.180, 0.091, 0.002),
    (1.388, 0.176, 0.084, 0.002),
    (1.400, 0.150, 0.075, 0.001),
    (1.410, 0.105, 0.066, 0.001),
    (1.418, 0.066, 0.057, 0.000),
]

def build_jacket(mats):
    cols = [[k[i] for k in JACKET_KEYS] for i in range(4)]
    NS, NR = 46, 40
    rings = []
    for r in range(NR):
        t = r / (NR - 1) * (len(JACKET_KEYS) - 1)
        y = cr_scalar(cols[0], t)
        a = cr_scalar(cols[1], t)
        b = cr_scalar(cols[2], t)
        zo = cr_scalar(cols[3], t)
        amp = 0.0026 + 0.0020 * exp(-((y - 1.06) / 0.075) ** 2) + 0.0016 * exp(-((y - 0.91) / 0.05) ** 2)
        ring = []
        for i in range(NS):
            th = 2 * pi * i / NS
            ct, st = cos(th), sin(th)
            x = a * math.copysign(abs(ct) ** (2 / 2.5), ct)
            z = b * math.copysign(abs(st) ** (2 / 2.5), st) + zo
            fold = amp * (0.60 * sin(7.0 * th + 1.7 + 3.2 * y) +
                          0.34 * sin(13.0 * th - 0.8) +
                          0.26 * sin(3.0 * th + 2.2))
            fold += 0.0015 * exp(-((abs(x) - a * 0.96) / 0.02) ** 2) * exp(-((y - 1.34) / 0.06) ** 2) * sin(th * 5)
            rel = abs(((th + pi / 2 + pi) % (2 * pi)) - pi)
            if rel < 0.055:
                fold += 0.0015 * (1.0 - (rel / 0.055) ** 2)
            nx = x / max(a, 1e-6)
            nz = (z - zo) / max(b, 1e-6)
            L = sqrt(nx * nx + nz * nz) + 1e-9
            ring.append(Vector((x + nx / L * fold, y, z + nz / L * fold)))
        rings.append(ring)
    verts, faces = loft(rings, True, True)
    # sleeves
    for sx in (1, -1):
        path = [Vector((sx * 0.150, 1.372, 0.002)), Vector((sx * 0.176, 1.340, 0.004)),
                Vector((sx * 0.205, 1.268, 0.006)), Vector((sx * 0.238, 1.150, 0.008)),
                Vector((sx * 0.268, 1.030, 0.012)), Vector((sx * 0.292, 0.930, 0.016)),
                Vector((sx * 0.306, 0.852, 0.020))]
        path = catmull(path, 5)
        n = len(path)
        rings2 = []
        for i, p in enumerate(path):
            t = i / (n - 1)
            if i == 0:
                tan = path[1] - path[0]
            elif i == n - 1:
                tan = path[-1] - path[-2]
            else:
                tan = path[i + 1] - path[i - 1]
            tan.normalize()
            ref = Vector((0, 0, 1))
            nrm = (ref - tan * ref.dot(tan)).normalized()
            bnr = tan.cross(nrm)
            rr = 0.061 - 0.024 * t
            rr *= 0.40 + 0.60 * smoothstep(0.0, 0.16, t)
            rr += 0.0032 * smoothstep(0.86, 1.0, t)
            ring = []
            for k in range(20):
                ang = 2 * pi * k / 20
                r2 = rr + 0.0034 * exp(-((t - 0.55) / 0.11) ** 2) * sin(t * 40)
                r2 += 0.0018 * sin(6 * ang + t * 14) * exp(-((t - 0.55) / 0.2) ** 2)
                r2 += 0.0010 * sin(9 * ang + 2.0 + t * 5) * exp(-((t - 0.82) / 0.12) ** 2)
                ring.append(p + nrm * (cos(ang) * r2) + bnr * (sin(ang) * r2))
            rings2.append(ring)
        v2, f2 = loft(rings2, True, True)
        off = len(verts)
        verts.extend(v2)
        faces.extend([tuple(i + off for i in f) for f in f2])
    add_object("Jacket", verts, faces, [mats["Cloth_Navy"]], recalc=True)

def build_collar(mats):
    NS = 40
    def ring_at(yfun, r):
        pts = []
        for i in range(NS):
            th = 2 * pi * i / NS
            y = yfun(th)
            pts.append(Vector((r * cos(th) * 1.02, y, r * sin(th) * 1.06 + 0.004)))
        return pts
    def dip(th):
        rel = abs(((th + pi / 2 + pi) % (2 * pi)) - pi)
        return 0.038 * exp(-(rel / 0.55) ** 2)
    rings = [ring_at(lambda th: 1.390, 0.0530),
             ring_at(lambda th: 1.406, 0.0542),
             ring_at(lambda th: 1.437 - dip(th), 0.0550),
             ring_at(lambda th: 1.435 - dip(th), 0.0495),
             ring_at(lambda th: 1.398, 0.0490)]
    v, f = loft(rings, True, False)
    add_object("Collar", v, f, [mats["Collar_Pale"]], recalc=True)

def build_trousers(mats):
    NS = 32
    verts, faces = [], []
    # hip yoke (hidden by the jacket)
    keys = [(0.815, 0.058, 0.066), (0.835, 0.096, 0.078), (0.860, 0.124, 0.086),
            (0.900, 0.134, 0.089), (0.950, 0.135, 0.087), (1.000, 0.132, 0.084),
            (1.040, 0.128, 0.081)]
    rings = []
    for y, a, b in keys:
        ring = []
        for i in range(NS):
            th = 2 * pi * i / NS
            ct, st = cos(th), sin(th)
            x = a * math.copysign(abs(ct) ** (2 / 2.4), ct)
            z = b * math.copysign(abs(st) ** (2 / 2.4), st)
            ring.append(Vector((x, y, z)))
        rings.append(ring)
    v, f = loft(rings, True, True)
    verts.extend(v); faces.extend(f)
    # legs
    leg_keys = [(0.960, 0.076, 0.082), (0.900, 0.078, 0.084), (0.820, 0.078, 0.084),
                (0.730, 0.074, 0.080), (0.640, 0.069, 0.075), (0.550, 0.063, 0.069),
                (0.470, 0.058, 0.064), (0.400, 0.055, 0.061), (0.320, 0.052, 0.058),
                (0.240, 0.048, 0.054), (0.160, 0.045, 0.051), (0.105, 0.044, 0.050),
                (0.080, 0.046, 0.052)]
    for sx in (1, -1):
        rings = []
        for y, a, b in leg_keys:
            cx = sx * lerp(0.074, 0.070, (y - 0.08) / 0.88)
            ring = []
            for i in range(24):
                th = 2 * pi * i / 24
                rr = 1.0
                rr += 0.0024 * exp(-((y - 0.47) / 0.05) ** 2) * sin(5 * th + 1.0)
                rr += 0.0016 * exp(-((y - 0.11) / 0.04) ** 2) * sin(7 * th + 0.3)
                rr += 0.0011 * exp(-((y - 0.70) / 0.12) ** 2) * sin(3 * th + 2.0)
                ct, st = cos(th), sin(th)
                x = a * rr * math.copysign(abs(ct) ** (2 / 2.2), ct)
                z = b * rr * math.copysign(abs(st) ** (2 / 2.2), st)
                ring.append(Vector((cx + x, y, z)))
            rings.append(ring)
        v2, f2 = loft(rings, True, True)
        off = len(verts)
        verts.extend(v2)
        faces.extend([tuple(i + off for i in f) for f in f2])
    add_object("Trousers", verts, faces, [mats["Pants_Charcoal"]], recalc=True)

def build_shoes(mats):
    verts, faces = [], []
    stations = [(0.168, 0.028, 0.026), (0.150, 0.040, 0.040), (0.112, 0.046, 0.052),
                (0.060, 0.050, 0.064), (0.010, 0.050, 0.076), (-0.030, 0.048, 0.082),
                (-0.058, 0.044, 0.080), (-0.070, 0.034, 0.070)]
    for sx in (1, -1):
        toe_out = math.radians(5.0) * sx
        cx = sx * 0.078
        rings = []
        for z, w, h in stations:
            ring = []
            for i in range(22):
                th = 2 * pi * i / 22
                px = w * math.copysign(abs(cos(th)) ** (2 / 3.0), cos(th))
                py = h * 0.5 + h * 0.5 * math.copysign(abs(sin(th)) ** (2 / 3.0), sin(th))
                py = max(py, 0.0)
                if py < 0.020:
                    px *= 1.06
                v = Vector((px, py, 0.0))
                v = Vector((v.x * cos(toe_out) + v.z * sin(toe_out), v.y,
                            -v.x * sin(toe_out) + v.z * cos(toe_out)))
                ring.append(Vector((cx + v.x, v.y, v.z + z)))
            rings.append(ring)
        # keep z ordering: toe (positive z) first, heel last
        v2, f2 = loft(rings, True, True)
        off = len(verts)
        verts.extend(v2)
        faces.extend([tuple(i + off for i in f) for f in f2])
    add_object("Shoes", verts, faces, [mats["Hair_Black"]], recalc=True)

def build_hand(sx, mats):
    W = Vector((0.306, 0.852, 0.020))
    f = Vector((0.235, -0.968, 0.085)).normalized()
    p0 = Vector((-1, 0, 0))
    p = (p0 - f * p0.dot(f)).normalized()
    u = p.cross(f).normalized()
    def P(lu, lp, lf):
        return W + u * lu + p * lp + f * lf
    verts, faces = [], []
    palm_st = [(0.000, 0.026, 0.0120), (0.014, 0.030, 0.0134), (0.032, 0.034, 0.0143),
               (0.052, 0.037, 0.0145), (0.070, 0.038, 0.0136), (0.083, 0.035, 0.0122),
               (0.091, 0.029, 0.0100)]
    rings = []
    for lf, hw, ht in palm_st:
        ring = []
        for i in range(14):
            th = 2 * pi * i / 14
            lu = hw * math.copysign(abs(cos(th)) ** (2 / 2.6), cos(th))
            lp = ht * math.copysign(abs(sin(th)) ** (2 / 2.6), sin(th))
            ring.append(P(lu, lp, lf))
        rings.append(ring)
    v, f2 = loft(rings, True, True)
    verts.extend(v); faces.extend(f2)
    finger_defs = [(0.025, 0.066, 0.0080), (0.008, 0.072, 0.0083),
                   (-0.010, 0.066, 0.0078), (-0.026, 0.054, 0.0069)]
    for u0, ln, rad in finger_defs:
        pts, radii = [], []
        segs = 7
        for i in range(segs + 1):
            t = i / segs
            pts.append(P(u0 + u0 * 0.10 * t, -0.0055 * t * t, 0.086 + ln * t))
            rr = rad * (1.0 - 0.20 * t)
            if i == segs:
                rr *= 0.55
            radii.append(rr)
        v2, f3 = sweep(pts, radii, 8, True)
        off = len(verts)
        verts.extend(v2)
        faces.extend([tuple(i + off for i in fc) for fc in f3])
    tpts = [P(0.024, -0.004, 0.030), P(0.036, -0.009, 0.043),
            P(0.046, -0.013, 0.057), P(0.053, -0.016, 0.071)]
    tpts = catmull(tpts, 4)
    trad = [lerp(0.0105, 0.0074, i / (len(tpts) - 1)) for i in range(len(tpts))]
    v3, f4 = sweep(tpts, trad, 8, True)
    off = len(verts)
    verts.extend(v3)
    faces.extend([tuple(i + off for i in fc) for fc in f4])
    if sx < 0:
        verts = [Vector((-v.x, v.y, v.z)) for v in verts]
        faces = [tuple(reversed(fc)) for fc in faces]
    add_object("Hand_L" if sx > 0 else "Hand_R", verts, faces, [mats["Skin_Warm"]], recalc=True)

def build_backpack(mats):
    verts, faces = [], []
    NS = 26
    keys = [(1.020, 0.062, 0.024), (1.030, 0.090, 0.038), (1.045, 0.103, 0.046),
            (1.080, 0.105, 0.048), (1.160, 0.106, 0.049), (1.250, 0.105, 0.048),
            (1.295, 0.100, 0.045), (1.312, 0.086, 0.038), (1.322, 0.062, 0.027)]
    rings = []
    for y, a, b in keys:
        ring = []
        for i in range(NS):
            th = 2 * pi * i / NS
            ct, st = cos(th), sin(th)
            x = a * math.copysign(abs(ct) ** (2 / 3.0), ct)
            z = b * math.copysign(abs(st) ** (2 / 3.0), st) - 0.152
            ring.append(Vector((x, y, z)))
        rings.append(ring)
    v, f = loft(rings, True, True)
    verts.extend(v); faces.extend(f)
    # front pocket on the outward face
    pk = [(1.062, 0.048, 0.010), (1.070, 0.070, 0.017), (1.082, 0.078, 0.022),
          (1.140, 0.079, 0.023), (1.190, 0.075, 0.020), (1.204, 0.064, 0.015),
          (1.210, 0.046, 0.008)]
    rings = []
    for y, a, b in pk:
        ring = []
        for i in range(22):
            th = 2 * pi * i / 22
            ct, st = cos(th), sin(th)
            x = a * math.copysign(abs(ct) ** (2 / 3.4), ct)
            z = b * math.copysign(abs(st) ** (2 / 3.4), st) - 0.205
            ring.append(Vector((x, y, z)))
        rings.append(ring)
    v, f = loft(rings, True, True)
    off = len(verts); verts.extend(v); faces.extend([tuple(i + off for i in fc) for fc in f])
    # pocket flap
    for zz, dy in ((-0.208, 0.0), (-0.216, -0.004)):
        ring = []
        for i in range(16):
            th = 2 * pi * i / 16
            x, yy = superellipse(16, 0.078, 0.020, 3.2)[i]
            ring.append(Vector((x, 1.196 + yy + dy, zz)))
        rings2 = [ring, [Vector((p.x, p.y + 0.010, p.z - 0.004)) for p in ring]]
        v, f = loft(rings2, True, True)
        off = len(verts); verts.extend(v); faces.extend([tuple(i + off for i in fc) for fc in f])
    # two shoulder straps
    def strap(sx):
        pts = [Vector((sx * 0.085, 1.300, -0.200)), Vector((sx * 0.090, 1.360, -0.120)),
               Vector((sx * 0.094, 1.392, -0.010)), Vector((sx * 0.096, 1.376, 0.075)),
               Vector((sx * 0.098, 1.300, 0.104)), Vector((sx * 0.100, 1.190, 0.101)),
               Vector((sx * 0.104, 1.090, 0.080)), Vector((sx * 0.108, 1.036, 0.010)),
               Vector((sx * 0.100, 1.040, -0.150))]
        pts = catmull(pts, 5)
        tans, _ = frames_along(pts)
        rings = []
        for i, p in enumerate(pts):
            t = tans[i]
            if p.y > 1.385:
                nd = Vector((sx * 0.2, 1.0, -0.2))
            elif p.z > 0:
                nd = Vector((sx * 0.25, 0.1, 1.0))
            else:
                nd = Vector((sx * 0.25, 0.0, -1.0))
            nrm = nd - t * nd.dot(t)
            if nrm.length < 1e-5:
                nrm = Vector((0, 1, 0))
            nrm.normalize()
            side = t.cross(nrm).normalized()
            ring = []
            for k in range(10):
                ang = 2 * pi * k / 10
                ring.append(p + side * (cos(ang) * 0.0135) + nrm * (sin(ang) * 0.0034))
            rings.append(ring)
        return loft(rings, True, True)
    for sx in (1, -1):
        v2, f2 = strap(sx)
        off = len(verts)
        verts.extend(v2)
        faces.extend([tuple(i + off for i in fc) for fc in f2])
    add_object("Backpack", verts, faces, [mats["Bag_Brown"]], recalc=True)

# ------------------------------------------------------------------ scene
def look_at(cam, target, up=Vector((0, 1, 0))):
    d = (target - cam.location).normalized()
    if abs(d.dot(up)) > 0.999:
        up = Vector((0, 0, 1))
    right = d.cross(up).normalized()
    up2 = right.cross(d).normalized()
    m = Matrix((right, up2, -d)).transposed()
    cam.rotation_euler = m.to_euler()

def setup_scene():
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except Exception:
        pass
    sc.render.film_transparent = False
    sc.render.resolution_x = 820
    sc.render.resolution_y = 1280
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.18, 0.18, 0.19, 1)
    bg.inputs[1].default_value = 0.9
    def area(name, loc, energy, size):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.size = size
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        look_at(ob, Vector((0, 1.1, 0.1)))
        bpy.context.scene.collection.objects.link(ob)
        return ob
    area("Key", (2.4, 2.9, 3.2), 190, 2.4)
    area("Fill", (-2.6, 2.1, 2.2), 60, 2.8)
    area("Rim", (-0.4, 3.0, -2.8), 120, 2.0)
    cd = bpy.data.cameras.new("Camera")
    cd.lens = 85
    cam = bpy.data.objects.new("Camera", cd)
    cam.location = Vector((2.9, 1.0, 4.1))
    look_at(cam, Vector((0, 0.9, 0)))
    bpy.context.scene.collection.objects.link(cam)
    sc.camera = cam
    return cam

def report():
    tri = 0
    vtot = 0
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        tri += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        vtot += len(ob.data.vertices)
    xs, ys, zs = [], [], []
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for v in ob.data.vertices:
            p = ob.matrix_world @ v.co
            xs.append(p.x); ys.append(p.y); zs.append(p.z)
    print("TOTAL verts", vtot, "tris", tri)
    print("BBOX x", round(min(xs), 4), round(max(xs), 4),
          "y", round(min(ys), 4), round(max(ys), 4),
          "z", round(min(zs), 4), round(max(zs), 4))
    print("HEIGHT(Y)", round(max(ys) - min(ys), 4))
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            print("  OBJ", ob.name, "tris", sum(len(p.vertices) - 2 for p in ob.data.polygons))

def render_views():
    sc = bpy.context.scene
    sc.render.film_transparent = False
    cam = sc.camera
    views = [
        ("student_front.png", Vector((0.0, 0.95, 4.6)), Vector((0, 0.885, 0)), 85, (820, 1280)),
        ("student_three_quarter.png", Vector((2.7, 1.05, 3.7)), Vector((0, 0.89, 0)), 85, (820, 1280)),
        ("student_side.png", Vector((4.5, 0.95, 0.0)), Vector((0, 0.885, 0)), 85, (820, 1280)),
        ("student_back.png", Vector((0.0, 0.95, -4.6)), Vector((0, 0.885, 0)), 85, (820, 1280)),
        ("student_face.png", Vector((0.35, 1.60, 1.05)), Vector((0, 1.585, 0.02)), 100, (900, 900)),
    ]
    for name, loc, tgt, lens, res in views:
        cam.location = loc
        look_at(cam, tgt)
        cam.data.lens = lens
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = os.path.join(RENDER_DIR, name)
        bpy.ops.render.render(write_still=True)
        print("rendered", name)

def export_glb():
    path = os.path.join(PROJ, "student.glb")
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # scene is already Y-up: do NOT apply glTF's Z-up -> Y-up conversion
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_yup=False, export_apply=True,
                              export_cameras=False, export_lights=False)
    print("exported", path, os.path.getsize(path))

def finalize_transforms():
    """Put the soles exactly on y = 0 and make the total height exactly 1.75."""
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    ys = [(o.matrix_world @ v.co).y for o in meshes for v in o.data.vertices]
    ymin, ymax = min(ys), max(ys)
    scale = 1.75 / max(1e-6, ymax - ymin)
    for o in meshes:
        for v in o.data.vertices:
            v.co.x *= scale
            v.co.y = (v.co.y - ymin) * scale
            v.co.z *= scale

def main():
    clear_scene()
    mats = build_materials()
    setup_scene()
    build_head(mats)
    build_hair(mats)
    build_jacket(mats)
    build_collar(mats)
    build_trousers(mats)
    build_shoes(mats)
    build_hand(1, mats)
    build_hand(-1, mats)
    build_backpack(mats)
    finalize_transforms()
    report()
    os.makedirs(RENDER_DIR, exist_ok=True)
    render_views()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PROJ, "student.blend"))
    export_glb()

if __name__ == "__main__":
    main()

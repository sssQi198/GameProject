"""Generate the Wrong Floor classroom furniture GLB.

Only furniture + blackboard. Walls, floor, windows, curtains and lights stay
procedural in level.js so the five anomalies keep their exact anchors.

Coordinates follow src/layout.js: X -10..10, Z -6..6, Y up, floor y = 0.
glTF baseColorFactor is LINEAR, so colours are stored in linear space.
"""
import json
import math
import pathlib
import struct

OUT = pathlib.Path(__file__).resolve().parent / 'w05_3d_game' / 'assets' / 'models' / 'classroom_m1_v01.glb'

MATERIALS = [
    ('Wood', [0.0, 0.0, 0.0, 1]),
    ('WoodDark', [0.014, 0.008, 0.005, 1]),
    ('Metal', [0.020, 0.022, 0.026, 1]),
    ('Board', [0.008, 0.020, 0.015, 1]),
    ('Trim', [0.045, 0.032, 0.018, 1]),
    ('Chalk', [0.420, 0.420, 0.390, 1]),
]
MAT_INDEX = {name: i for i, (name, _) in enumerate(MATERIALS)}
BOXES = []


def box(mat, cx, cy, cz, sx, sy, sz, ry=0.0):
    BOXES.append((MAT_INDEX[mat], cx, cy, cz, sx, sy, sz, ry))


def jitter(seed, amount):
    """Deterministic per-desk jitter so the layout is reproducible."""
    s = (seed * 1103515245 + 12345) & 0xFFFFFFFF
    s = (s * 1103515245 + 12345) & 0xFFFFFFFF
    return ((s / 0xFFFFFFFF) * 2 - 1) * amount


DESK_X = [-7.4, -4.6, -1.8, 1.8, 4.6, 6.8]
DESK_Z = [-4.0, -1.5, 1.5, 4.0]
TOP_H = 0.78
TOP_D = 0.62
TOP_W = 1.16

# A few desks were shoved out of line. (-7.4, 4.0) holds the level-1 anomaly, keep it still.
SHOVED_DESKS = {(-7.4, -4.0): 0.30, (4.6, -1.5): -0.26, (-1.8, 1.5): 0.19, (6.8, -4.0): 0.14}
# A few chairs were turned around or dragged away.
TURNED_CHAIRS = {(-4.6, 4.0): 3.05, (1.8, -4.0): -1.9, (6.8, 1.5): 2.2, (-1.8, -4.0): 0.9}

for dx in DESK_X:
    for dz in DESK_Z:
        seed = int((dx + 20) * 97 + (dz + 10) * 13)
        shift_x = jitter(seed, 0.035)
        shift_z = jitter(seed + 1, 0.045)
        desk_rot = SHOVED_DESKS.get((dx, dz), jitter(seed + 2, 0.035))
        cx0 = dx + shift_x
        cz0 = dz + shift_z

        # desk top
        box('Wood', cx0, TOP_H - 0.025, cz0, TOP_D, 0.05, TOP_W, desk_rot)
        box('WoodDark', cx0, TOP_H - 0.056, cz0, TOP_D - 0.03, 0.012, TOP_W - 0.03, desk_rot)
        for lz in (-1, 1):
            box('WoodDark', cx0, TOP_H - 0.075, cz0 + lz * 0.50, TOP_D - 0.08, 0.05, 0.035, desk_rot)
        for lx in (-1, 1):
            for lz in (-1, 1):
                box('Metal', cx0 + lx * 0.25, 0.36, cz0 + lz * 0.50, 0.045, 0.72, 0.045, desk_rot)
        for lz in (-1, 1):
            box('Metal', cx0, 0.15, cz0 + lz * 0.50, 0.44, 0.03, 0.03, desk_rot)
        for lx in (-1, 1):
            box('Metal', cx0 + lx * 0.25, 0.15, cz0, 0.03, 0.03, 0.96, desk_rot)
        box('WoodDark', cx0 - 0.27, 0.58, cz0, 0.022, 0.26, TOP_W - 0.12, desk_rot)
        box('WoodDark', cx0, 0.32, cz0, 0.50, 0.02, 0.94, desk_rot)

        # chair
        chair_rot = desk_rot + jitter(seed + 3, 0.06)
        chair_x = cx0 - 0.48
        chair_z = cz0
        if (dx, dz) in TURNED_CHAIRS:
            chair_rot = TURNED_CHAIRS[(dx, dz)]
            chair_x = cx0 - 0.72
            chair_z = cz0 + jitter(seed + 4, 0.22)
        box('WoodDark', chair_x, 0.45, chair_z, 0.42, 0.05, 0.42, chair_rot)
        box('Metal', chair_x, 0.412, chair_z, 0.45, 0.025, 0.45, chair_rot)
        for lx in (-1, 1):
            for lz in (-1, 1):
                box('Metal', chair_x + lx * 0.175, 0.205, chair_z + lz * 0.175, 0.038, 0.41, 0.038, chair_rot)
        for lz in (-1, 1):
            box('Metal', chair_x, 0.135, chair_z + lz * 0.175, 0.33, 0.028, 0.028, chair_rot)
        for lz in (-1, 1):
            box('WoodDark', chair_x - 0.20, 0.70, chair_z + lz * 0.18, 0.042, 0.46, 0.042, chair_rot)
        for y in (0.575, 0.695, 0.815):
            box('WoodDark', chair_x - 0.195, y, chair_z, 0.028, 0.075, 0.33, chair_rot)
        box('WoodDark', chair_x - 0.195, 0.925, chair_z, 0.045, 0.055, 0.42, chair_rot)
        box('Metal', chair_x - 0.20, 0.475, chair_z, 0.07, 0.09, 0.07, chair_rot)

# teacher desk
TD_X = 8.2
box('Wood', TD_X, 0.775, 0, 0.78, 0.05, 1.74)
box('WoodDark', TD_X, 0.742, 0, 0.74, 0.014, 1.68)
box('WoodDark', TD_X - 0.375, 0.46, 0, 0.03, 0.60, 1.66)
for lz in (-1, 1):
    box('WoodDark', TD_X, 0.46, lz * 0.84, 0.72, 0.62, 0.045)
for y in (0.60, 0.42):
    box('Wood', TD_X + 0.365, y, -0.30, 0.025, 0.16, 0.52)
    box('Metal', TD_X + 0.382, y, -0.30, 0.015, 0.018, 0.12)
box('Wood', TD_X + 0.365, 0.51, 0.55, 0.025, 0.34, 0.60)
box('Metal', TD_X + 0.382, 0.62, 0.78, 0.015, 0.018, 0.10)
box('WoodDark', TD_X, 0.05, 0, 0.62, 0.05, 1.52)

# blackboard on the +X wall
BOARD_X = 9.93
box('Board', BOARD_X, 1.70, 0, 0.05, 1.15, 4.20)
box('Trim', 9.90, 2.295, 0, 0.06, 0.07, 4.34)
box('Trim', 9.90, 1.105, 0, 0.06, 0.07, 4.34)
for lz in (-1, 1):
    box('Trim', 9.90, 1.70, lz * 2.135, 0.06, 1.22, 0.07)
box('Trim', 9.86, 1.062, 0, 0.16, 0.04, 4.20)
for z in (-0.85, 0.1, 0.95):
    box('Chalk', 9.86, 1.092, z, 0.022, 0.022, 0.085)
box('WoodDark', 9.86, 1.096, 1.45, 0.10, 0.032, 0.17)
for lz in (-1, 1):
    box('Metal', 9.99, 1.70, lz * 1.95, 0.10, 0.05, 0.10)

# geometry: 24 verts per box, per-face normals, optional Y rotation
FACES = [
    ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ((1, 0, 0), [(1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1)]),
    ((-1, 0, 0), [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)]),
    ((0, 1, 0), [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
    ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),
]

batches = {i: ([], []) for i in range(len(MATERIALS))}
for mat, cx, cy, cz, sx, sy, sz, ry in BOXES:
    verts, idx = batches[mat]
    cos_r = math.cos(ry)
    sin_r = math.sin(ry)
    for normal, corners in FACES:
        nx = normal[0] * cos_r + normal[2] * sin_r
        nz = -normal[0] * sin_r + normal[2] * cos_r
        base = len(verts)
        for cxr, cyr, czr in corners:
            ox = cxr * sx / 2
            oz = czr * sz / 2
            px = cx + ox * cos_r + oz * sin_r
            pz = cz - ox * sin_r + oz * cos_r
            verts.append((px, cy + cyr * sy / 2, pz, nx, normal[1], nz))
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

MATERIALS[0] = ('Wood', [0.030, 0.017, 0.009, 1])

# One accessor set per material. Sharing one global buffer would make every
# mesh draw the whole furniture set, and the last material would cover it all.
groups = []
for mat in range(len(MATERIALS)):
    verts, idx = batches[mat]
    if not verts:
        continue
    pos, nrm = [], []
    for x, y, z, nx, ny, nz in verts:
        pos.append((x, y, z))
        nrm.append((nx, ny, nz))
    pmin = [min(p[i] for p in pos) for i in range(3)]
    pmax = [max(p[i] for p in pos) for i in range(3)]
    groups.append({
        'mat': mat,
        'pos': b''.join(struct.pack('<3f', *p) for p in pos),
        'nrm': b''.join(struct.pack('<3f', *n) for n in nrm),
        'idx': b''.join(struct.pack('<I', i) for i in idx),
        'posCount': len(pos),
        'idxCount': len(idx),
        'min': pmin,
        'max': pmax,
    })


def pad4(data):
    return data + b'\0' * ((4 - len(data) % 4) % 4)


views, accessors, meshes, nodes, blob = [], [], [], [], b''
for group in groups:
    base_view = len(views)
    for data, target in (
        (group['pos'], 34962),
        (group['nrm'], 34962),
        (group['idx'], 34963),
    ):
        blob = pad4(blob)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), 'target': target})
        blob += data

    pos_acc = len(accessors)
    accessors.append({'bufferView': base_view, 'componentType': 5126,
                      'count': group['posCount'], 'type': 'VEC3',
                      'min': group['min'], 'max': group['max']})
    nrm_acc = len(accessors)
    accessors.append({'bufferView': base_view + 1, 'componentType': 5126,
                      'count': group['posCount'], 'type': 'VEC3'})
    idx_acc = len(accessors)
    accessors.append({'bufferView': base_view + 2, 'componentType': 5125,
                      'count': group['idxCount'], 'type': 'SCALAR'})

    name = MATERIALS[group['mat']][0]
    meshes.append({'name': f'Furniture_{name}', 'primitives': [{
        'attributes': {'POSITION': pos_acc, 'NORMAL': nrm_acc},
        'indices': idx_acc,
        'material': group['mat'],
    }]})
    nodes.append({'name': f'M1_{name}', 'mesh': len(meshes) - 1,
                  'extras': {'staticVisual': True}})

blob = pad4(blob)

meta = {
    'asset': {'version': '2.0', 'generator': 'Wrong Floor M1 furniture v3'},
    'scene': 0,
    'scenes': [{'nodes': list(range(len(nodes)))}],
    'nodes': nodes,
    'meshes': meshes,
    'materials': [{
        'name': name,
        'pbrMetallicRoughness': {
            'baseColorFactor': color,
            'metallicFactor': 0.55 if name in ('Metal',) else 0.04,
            'roughnessFactor': 0.42 if name in ('Metal', 'Chalk') else 0.82,
        },
        'doubleSided': False,
    } for name, color in MATERIALS],
    'buffers': [{'byteLength': len(blob)}],
    'bufferViews': views,
    'accessors': accessors,
}

js = json.dumps(meta, separators=(',', ':')).encode('utf-8')
js += b' ' * ((4 - len(js) % 4) % 4)  # GLB spec: JSON chunk is space padded
glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob))
glb += struct.pack('<I4s', len(js), b'JSON') + js
glb += struct.pack('<I4s', len(blob), b'BIN\0') + blob
OUT.write_bytes(glb)
print(f'wrote {OUT}')
tris = sum(g['idxCount'] for g in groups) // 3
print(f'boxes={len(BOXES)} meshes={len(meshes)} triangles={tris} bytes={len(glb)}')

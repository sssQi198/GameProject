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
# layer: keep 留在原位；center 第 3 关前的正中四套；pile 堆到四周后的那一套。
# 旋转顺序跟 Three.js Euler XYZ 一致：先 pitch(X)，再 yaw(Y)，再 roll(Z)。


def box(mat, cx, cy, cz, sx, sy, sz, ry=0.0, *, layer='keep', pitch=0.0, roll=0.0):
    BOXES.append((layer, MAT_INDEX[mat], cx, cy, cz, sx, sy, sz, pitch, ry, roll))


def rotate_xyz(x, y, z, pitch, yaw, roll):
    cp, sp = math.cos(pitch), math.sin(pitch)
    y, z = y * cp - z * sp, y * sp + z * cp
    cy, sy = math.cos(yaw), math.sin(yaw)
    x, z = x * cy + z * sy, -x * sy + z * cy
    cr, sr = math.cos(roll), math.sin(roll)
    x, y = x * cr - y * sr, x * sr + y * cr
    return x, y, z


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
# 教室正中四套。第 3 关把它们从原地藏掉，改显示堆在四周的那一份。
CENTER_DESKS = {(-1.8, -1.5), (-1.8, 1.5), (1.8, -1.5), (1.8, 1.5)}
# 与 src/layout.js 的 ritualDeskPiles / ritualChairPiles 同一组数。
# 只绕竖直轴转，四脚留在地板上。
DESK_PILES = [
    (-2.72, -2.05, 0.0, 0.38, 0.0),
    (-2.78, 2.05, 0.0, -0.46, 0.0),
    (2.75, -2.08, 0.0, 0.52, 0.0),
    (2.68, 2.02, 0.0, -0.33, 0.0),
]
CHAIR_PILES = [
    (-3.88, -2.82, 0.0, 2.15, 0.0),
    (-3.92, 2.82, 0.0, -0.85, 0.0),
    (3.88, -2.88, 0.0, 1.65, 0.0),
    (3.82, 2.78, 0.0, -2.35, 0.0),
]


def emit_desk(cx0, cz0, desk_rot, layer):
    box('Wood', cx0, TOP_H - 0.025, cz0, TOP_D, 0.05, TOP_W, desk_rot, layer=layer)
    box('WoodDark', cx0, TOP_H - 0.056, cz0, TOP_D - 0.03, 0.012, TOP_W - 0.03, desk_rot, layer=layer)
    for lz in (-1, 1):
        box('WoodDark', cx0, TOP_H - 0.075, cz0 + lz * 0.50, TOP_D - 0.08, 0.05, 0.035, desk_rot, layer=layer)
    for lx in (-1, 1):
        for lz in (-1, 1):
            box('Metal', cx0 + lx * 0.25, 0.36, cz0 + lz * 0.50, 0.045, 0.72, 0.045, desk_rot, layer=layer)
    for lz in (-1, 1):
        box('Metal', cx0, 0.15, cz0 + lz * 0.50, 0.44, 0.03, 0.03, desk_rot, layer=layer)
    for lx in (-1, 1):
        box('Metal', cx0 + lx * 0.25, 0.15, cz0, 0.03, 0.03, 0.96, desk_rot, layer=layer)
    box('WoodDark', cx0 - 0.27, 0.58, cz0, 0.022, 0.26, TOP_W - 0.12, desk_rot, layer=layer)
    box('WoodDark', cx0, 0.32, cz0, 0.50, 0.02, 0.94, desk_rot, layer=layer)


def emit_chair(chair_x, chair_z, chair_rot, layer):
    box('WoodDark', chair_x, 0.45, chair_z, 0.42, 0.05, 0.42, chair_rot, layer=layer)
    box('Metal', chair_x, 0.412, chair_z, 0.45, 0.025, 0.45, chair_rot, layer=layer)
    for lx in (-1, 1):
        for lz in (-1, 1):
            box('Metal', chair_x + lx * 0.175, 0.205, chair_z + lz * 0.175, 0.038, 0.41, 0.038, chair_rot, layer=layer)
    for lz in (-1, 1):
        box('Metal', chair_x, 0.135, chair_z + lz * 0.175, 0.33, 0.028, 0.028, chair_rot, layer=layer)
    for lz in (-1, 1):
        box('WoodDark', chair_x - 0.20, 0.70, chair_z + lz * 0.18, 0.042, 0.46, 0.042, chair_rot, layer=layer)
    for y in (0.575, 0.695, 0.815):
        box('WoodDark', chair_x - 0.195, y, chair_z, 0.028, 0.075, 0.33, chair_rot, layer=layer)
    box('WoodDark', chair_x - 0.195, 0.925, chair_z, 0.045, 0.055, 0.42, chair_rot, layer=layer)
    box('Metal', chair_x - 0.20, 0.475, chair_z, 0.07, 0.09, 0.07, chair_rot, layer=layer)


def take_parts(builder):
    start = len(BOXES)
    builder()
    parts = BOXES[start:]
    del BOXES[start:]
    return parts


def stamp(parts, layer, x, z, pitch, yaw, roll):
    """刚体挪到法阵外侧。只有穿进地板时才往上抬，站着的桌椅脚贴地。"""
    min_y = 1e9
    moved = []
    for _layer, mat, cx, cy, cz, sx, sy, sz, p0, y0, r0 in parts:
        if abs(p0) + abs(y0) + abs(r0) > 1e-6:
            raise SystemExit('pile parts must be axis-aligned')
        wx, wy, wz = rotate_xyz(cx, cy, cz, pitch, yaw, roll)
        moved.append((mat, wx, wy, wz, sx, sy, sz))
        for sx_s in (-0.5, 0.5):
            for sy_s in (-0.5, 0.5):
                for sz_s in (-0.5, 0.5):
                    _ox, oy, _oz = rotate_xyz(
                        cx + sx_s * sx, cy + sy_s * sy, cz + sz_s * sz, pitch, yaw, roll)
                    if oy < min_y:
                        min_y = oy
    lift = -min_y if min_y < 0.0 else 0.0
    names = [name for name, _color in MATERIALS]
    for mat, wx, wy, wz, sx, sy, sz in moved:
        box(names[mat], x + wx, wy + lift, z + wz, sx, sy, sz, yaw, layer=layer, pitch=pitch, roll=roll)
    return lift


LOCAL_DESK = take_parts(lambda: emit_desk(0, 0, 0, 'keep'))
LOCAL_CHAIR = take_parts(lambda: emit_chair(0, 0, 0, 'keep'))

for dx in DESK_X:
    for dz in DESK_Z:
        seed = int((dx + 20) * 97 + (dz + 10) * 13)
        shift_x = jitter(seed, 0.035)
        shift_z = jitter(seed + 1, 0.045)
        desk_rot = SHOVED_DESKS.get((dx, dz), jitter(seed + 2, 0.035))
        cx0 = dx + shift_x
        cz0 = dz + shift_z
        layer = 'center' if (dx, dz) in CENTER_DESKS else 'keep'
        emit_desk(cx0, cz0, desk_rot, layer)

        chair_rot = desk_rot + jitter(seed + 3, 0.06)
        chair_x = cx0 - 0.48
        chair_z = cz0
        if (dx, dz) in TURNED_CHAIRS:
            chair_rot = TURNED_CHAIRS[(dx, dz)]
            chair_x = cx0 - 0.72
            chair_z = cz0 + jitter(seed + 4, 0.22)
        emit_chair(chair_x, chair_z, chair_rot, layer)

for px, pz, pitch, yaw, roll in DESK_PILES:
    stamp(LOCAL_DESK, 'pile', px, pz, pitch, yaw, roll)
for px, pz, pitch, yaw, roll in CHAIR_PILES:
    stamp(LOCAL_CHAIR, 'pile', px, pz, pitch, yaw, roll)

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

# geometry: 24 verts per box, per-face normals, Euler XYZ rotation
FACES = [
    ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
    ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)]),
    ((1, 0, 0), [(1, -1, 1), (1, -1, -1), (1, 1, -1), (1, 1, 1)]),
    ((-1, 0, 0), [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)]),
    ((0, 1, 0), [(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1)]),
    ((0, -1, 0), [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),
]

batches = {}
for layer, mat, cx, cy, cz, sx, sy, sz, pitch, yaw, roll in BOXES:
    verts, idx = batches.setdefault((layer, mat), ([], []))
    for normal, corners in FACES:
        nx, ny, nz = rotate_xyz(normal[0], normal[1], normal[2], pitch, yaw, roll)
        base = len(verts)
        for cxr, cyr, czr in corners:
            lx = cxr * sx / 2
            ly = cyr * sy / 2
            lz = czr * sz / 2
            ox, oy, oz = rotate_xyz(lx, ly, lz, pitch, yaw, roll)
            # 1 UV = 1 metre on the face, so the texture turns with the box.
            if abs(normal[1]) > 0.5:
                uv = (lx, lz)
            elif abs(normal[0]) > 0.5:
                uv = (lz, ly)
            else:
                uv = (lx, ly)
            verts.append((cx + ox, cy + oy, cz + oz, nx, ny, nz, uv[0], uv[1]))
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

MATERIALS[0] = ('Wood', [0.030, 0.017, 0.009, 1])

# One accessor set per material. Sharing one global buffer would make every
# mesh draw the whole furniture set, and the last material would cover it all.
LAYER_PREFIX = {'keep': 'M1', 'center': 'Center', 'pile': 'Pile'}
groups = []
for (layer, mat), (verts, idx) in batches.items():
    if not verts:
        continue
    pos, nrm, uv = [], [], []
    for x, y, z, nx, ny, nz, u, v in verts:
        pos.append((x, y, z))
        nrm.append((nx, ny, nz))
        uv.append((u, v))
    pmin = [min(p[i] for p in pos) for i in range(3)]
    pmax = [max(p[i] for p in pos) for i in range(3)]
    groups.append({
        'layer': layer,
        'mat': mat,
        'pos': b''.join(struct.pack('<3f', *p) for p in pos),
        'nrm': b''.join(struct.pack('<3f', *n) for n in nrm),
        'uv': b''.join(struct.pack('<2f', *t) for t in uv),
        'idx': b''.join(struct.pack('<I', i) for i in idx),
        'posCount': len(pos),
        'idxCount': len(idx),
        'min': pmin,
        'max': pmax,
    })


def entry_aabb(entry):
    _layer, _mat, cx, cy, cz, sx, sy, sz, pitch, yaw, roll = entry
    xs, ys, zs = [], [], []
    for sx_s in (-0.5, 0.5):
        for sy_s in (-0.5, 0.5):
            for sz_s in (-0.5, 0.5):
                ox, oy, oz = rotate_xyz(sx_s * sx, sy_s * sy, sz_s * sz, pitch, yaw, roll)
                xs.append(cx + ox)
                ys.append(cy + oy)
                zs.append(cz + oz)
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def xz_hit(a, b, pad=0.04):
    return not (a[1] < b[0] - pad or b[1] < a[0] - pad or a[5] < b[4] - pad or b[5] < a[4] - pad)


keep_boxes = [entry_aabb(item) for item in BOXES if item[0] == 'keep']
pile_entries = [item for item in BOXES if item[0] == 'pile']
pile_boxes = [entry_aabb(item) for item in pile_entries]
print(f'pile boxes={len(pile_boxes)} keep boxes={len(keep_boxes)}')


def union_aabb(entries):
    boxes = [entry_aabb(item) for item in entries]
    return (
        min(box[0] for box in boxes), max(box[1] for box in boxes),
        min(box[2] for box in boxes), max(box[3] for box in boxes),
        min(box[4] for box in boxes), max(box[5] for box in boxes),
    )


def origin_gap(box):
    cx = min(max(0.0, box[0]), box[1])
    cz = min(max(0.0, box[4]), box[5])
    return math.hypot(cx, cz)


DESK_PARTS = 14
CHAIR_PARTS = 15
clusters = []
for index in range(4):
    clusters.append(union_aabb(pile_entries[index * DESK_PARTS:(index + 1) * DESK_PARTS]))
chair_at = 4 * DESK_PARTS
for index in range(4):
    start = chair_at + index * CHAIR_PARTS
    clusters.append(union_aabb(pile_entries[start:start + CHAIR_PARTS]))
for index, box in enumerate(clusters):
    kind = 'desk' if index < 4 else 'chair'
    print(
        f'  {kind}{index % 4} x[{box[0]:.2f},{box[1]:.2f}] y[{box[2]:.2f},{box[3]:.2f}]'
        f' z[{box[4]:.2f},{box[5]:.2f}] gap={origin_gap(box):.2f}'
    )
for i in range(len(clusters)):
    for j in range(i + 1, len(clusters)):
        if xz_hit(clusters[i], clusters[j], pad=0.02):
            print(f'  pile pieces overlap {i} and {j}')
hits = 0
for pile in pile_boxes:
    if pile[0] < -9.85 or pile[1] > 9.85 or pile[4] < -5.9 or pile[5] > 5.9:
        print(f'  outside room x[{pile[0]:.2f},{pile[1]:.2f}] z[{pile[4]:.2f},{pile[5]:.2f}]')
        hits += 1
    if pile[5] > 4.85 and abs((pile[0] + pile[1]) * 0.5) < 1.15:
        print(f'  near door x[{pile[0]:.2f},{pile[1]:.2f}] z[{pile[4]:.2f},{pile[5]:.2f}]')
        hits += 1
    for kept in keep_boxes:
        if xz_hit(pile, kept):
            print(
                f'  overlap pile x[{pile[0]:.2f},{pile[1]:.2f}] z[{pile[4]:.2f},{pile[5]:.2f}]'
                f' vs keep x[{kept[0]:.2f},{kept[1]:.2f}] z[{kept[4]:.2f},{kept[5]:.2f}]'
            )
            hits += 1
            break
if not hits:
    print('pile clearance ok')


def pad4(data):
    return data + b'\0' * ((4 - len(data) % 4) % 4)


views, accessors, meshes, nodes, blob = [], [], [], [], b''
for group in groups:
    base_view = len(views)
    for data, target in (
        (group['pos'], 34962),
        (group['nrm'], 34962),
        (group['uv'], 34962),
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
    uv_acc = len(accessors)
    accessors.append({'bufferView': base_view + 2, 'componentType': 5126,
                      'count': group['posCount'], 'type': 'VEC2'})
    idx_acc = len(accessors)
    accessors.append({'bufferView': base_view + 3, 'componentType': 5125,
                      'count': group['idxCount'], 'type': 'SCALAR'})

    name = MATERIALS[group['mat']][0]
    prefix = LAYER_PREFIX[group['layer']]
    meshes.append({'name': f'Furniture_{prefix}_{name}', 'primitives': [{
        'attributes': {'POSITION': pos_acc, 'NORMAL': nrm_acc, 'TEXCOORD_0': uv_acc},
        'indices': idx_acc,
        'material': group['mat'],
    }]})
    nodes.append({'name': f'{prefix}_{name}', 'mesh': len(meshes) - 1,
                  'extras': {'staticVisual': True, 'ritual': group['layer']}})

blob = pad4(blob)

meta = {
    'asset': {'version': '2.0', 'generator': 'Wrong Floor M1 furniture v4'},
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

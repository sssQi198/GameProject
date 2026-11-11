# Stylized Chinese High-School Boy — Y-Up Ball-Head Student (Blank Face)

Matte, simplified game-student asset with a deliberately **blank face** — the head is a clean
ball, no eyes, mouth, nose or brows. Everything is generated procedurally by
`build_student.py` (Blender 5.2) and is fully reproducible.

## Coordinates and size

- **Y is up**, **+Z is forward (the face side)**, **+X is the character's left** (right-handed).
- 1 unit = 1 metre.
- Soles exactly at **y = 0**; total height including hair exactly **1.75 m**.
- A-pose, arms ~16° away from the torso.

## The head

- One solid ball: radius **0.135 m** (27 cm diameter), centre **(0, 1.59, 0)**.
- Chin is the bottom of the ball at **y = 1.455**; the mesh is a true sphere, not an egg.
- **The face is left blank**: no eye geometry, no mouth, no nose, no brow, no dents.
  The front of the head is the plain ball surface.
- The neck is merged into the same single **Head** object (one mesh, one material `Skin_Warm`).

## Hair

- One cap hugging the skull plus one straight fringe, both part of a single **Hair** mesh.
- Top exactly at **y = 1.75**; cap thickness 2.5 mm at the hairline growing to 25 mm at the crown.
- Hairline stays behind the forehead; the fringe bottom is exactly **y = 1.63**.
- No hanging locks, no clips, no strands over the face.

## Clothing

- Dark navy jacket `#252a3a` (body + sleeves + cloth folds).
- Pale gray inner collar `#a8a294`, visible above the jacket neckline, dipping at the front.
- Dark charcoal trousers `#1d2026`.
- Plain black shoes.
- Small brown canvas backpack `#33291f` with one front pocket, flap and **two shoulder straps**.

## Materials

| Material | sRGB | Used on |
|---|---|---|
| `Skin_Warm` | `#cba57f` | head, neck, hands |
| `Hair_Black` | `#17130f` | hair, shoes |
| `Cloth_Navy` | `#252a3a` | jacket |
| `Collar_Pale` | `#a8a294` | collar |
| `Pants_Charcoal` | `#1d2026` | trousers |
| `Bag_Brown` | `#33291f` | backpack |

All Principled BSDF, metallic 0, roughness 0.88–0.98 — matte, untextured.

## Geometry

- **25,702 triangles**, 9 mesh objects: `Head`, `Hair`, `Jacket`, `Collar`, `Trousers`,
  `Shoes`, `Hand_L`, `Hand_R`, `Backpack`.
- Each hand has exactly **five separate fingers** (four fingers + thumb).
- No base, no floor, no backdrop, no text objects in the scene.

## Files

Sources live in `assets/source/classmate/`. Rebuild with `tools/build_student.py`. Preview PNGs are in the repo folder `_多余/渲染预览/`.

| File | Notes |
|---|---|
| `student.glb` | Y-up, 1 m units, +Z forward, 25,702 tris, 6 materials |
| `student.blend` | Blender source (viewport oriented so the Y-up character stands upright) |
| `renders/student_front.png` | front |
| `renders/student_three_quarter.png` | three-quarter |
| `renders/student_side.png` | side |
| `renders/student_back.png` | back |
| `renders/student_face.png` | head close-up (blank ball) |

The glTF is exported **without** Blender's Z-up→Y-up conversion (`export_yup=False`)
because the scene is already authored Y-up, so the GLB coordinates match the numbers above.

`BLANK_FACE = True` at the top of `build_student.py` controls the face; set it to `False`
to restore the eye/mouth/nose geometry (that code path is still present).

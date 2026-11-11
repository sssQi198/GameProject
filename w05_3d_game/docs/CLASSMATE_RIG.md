# Classmate — Split Limb Rig (Y-Up)

The existing Y-up student is split into parented mesh parts. **No remodeling**: every vertex
comes from the current student meshes (`student.blend`); limbs are only cut at the joints.
Clothes, the shallow 27 cm ball head, the backpack, the 1.75 m height, the feet-on-ground
stance and the +Z facing are unchanged.

## Hierarchy (kept in the glTF)

```
Classmate_Root            (empty; extras name the parts)
└── Classmate_Body        origin (0, 0, 0)          neck + torso + jacket + collar + backpack + hip
    ├── Classmate_Leg_L   origin ( 0.090, 0.895, 0)  thigh only
    │   └── Classmate_Shin_L   origin 0.45 m down    shin only
    │       └── Classmate_Foot_L  origin 0.35 m further down  shoe only
    ├── Classmate_Leg_R   origin (-0.090, 0.895, 0)
    │   └── Classmate_Shin_R
    │       └── Classmate_Foot_R
    ├── Classmate_Arm_L   origin ( 0.190, 1.400, 0)  upper arm only
    │   └── Classmate_Forearm_L  origin 0.30 m down
    │       └── Classmate_Hand_L   origin 0.25 m further down  palm + fingers
    ├── Classmate_Arm_R   origin (-0.190, 1.400, 0)
    │   └── Classmate_Forearm_R
    │       └── Classmate_Hand_R
    └── Classmate_Head    origin (0, 1.535, 0)       head + hair only
```

Every child origin sits on its joint; all rotations are **zero** (identity) and all scales are 1.
With identity rotations the local **−Y axis points down** (exactly for the vertical legs;
the A-posed arms are only ~12° off vertical).

## Origins actually exported (glTF node translations, metres)

| Node | Parent | World origin |
|---|---|---|
| `Classmate_Body` | Root | (0, 0, 0) |
| `Classmate_Leg_L / R` | Body | (±0.090, 0.895, 0) |
| `Classmate_Shin_L / R` | Leg | local (0, −0.450, 0) |
| `Classmate_Foot_L / R` | Shin | local (0, −0.350, 0) |
| `Classmate_Arm_L / R` | Body | (±0.190, 1.400, 0) |
| `Classmate_Forearm_L / R` | Arm | local (±0.060, −0.300, 0.010) → elbow on the limb |
| `Classmate_Hand_L / R` | Forearm | local (±0.050, −0.250, 0.008) → wrist on the limb |
| `Classmate_Head` | Body | (0, 1.535, 0) |

Because the arms are modelled in a slight A-pose, the elbow and wrist sit 0.30 m and 0.25 m
**down the limb** (their Y offsets are exactly −0.300 and −0.250; the small X offsets keep the
pivot on the joint instead of floating beside the arm).

## Root extras

The root node carries the part names, left then right:

```json
"extras": {
  "parts":     ["Classmate_Leg_L", "Classmate_Leg_R", "Classmate_Shin_L", "Classmate_Shin_R",
                "Classmate_Foot_L", "Classmate_Foot_R", "Classmate_Arm_L", "Classmate_Arm_R",
                "Classmate_Forearm_L", "Classmate_Forearm_R", "Classmate_Hand_L", "Classmate_Hand_R",
                "Classmate_Body", "Classmate_Head"],
  "legs": [...], "shins": [...], "feet": [...], "arms": [...], "forearms": [...], "hands": [...],
  "body": "Classmate_Body", "head": "Classmate_Head"
}
```

## Mesh contents

| Part | Contents | Material |
|---|---|---|
| `Classmate_Body` | neck, jacket torso, collar, backpack, trouser hip yoke | skin / navy / pale / brown / charcoal |
| `Classmate_Head` | head ball + hair | skin / black |
| `Classmate_Leg_L/R` | trouser thigh (hip → knee) | charcoal |
| `Classmate_Shin_L/R` | trouser shin (knee → ankle) | charcoal |
| `Classmate_Foot_L/R` | shoe | black |
| `Classmate_Arm_L/R` | jacket sleeve above the elbow | navy |
| `Classmate_Forearm_L/R` | sleeve below the elbow + cuff | navy |
| `Classmate_Hand_L/R` | palm + five fingers | skin |

## Files

Sources live in `assets/source/classmate/`. Split with `tools/split_student.py`. The game loads a copy at `assets/models/classmate_v02.glb`. Preview PNGs are in the repo folder `_多余/渲染预览/`.

| File | Notes |
|---|---|
| `classmate_rig.glb` | Y-up, hierarchy + origins + root extras, 25,958 tris |
| `classmate_rig.blend` | Blender source of the split rig |
| `student.blend` / `student.glb` | the un-split student (unchanged source) |
| `renders/rig_front.png`, `rig_three_quarter.png`, `rig_side.png` | previews |

Note: the current head is the blank-faced ball from the previous revision, so `Classmate_Head`
contains head + hair only — there are no separate eye or lip meshes in this student to carry over.

# 第五关 · 黑色巨脸 `face_v01`

> 按 `docs/model_prompts.md` 的「## 第五关 · 黑色巨脸」建的资产。
> 生成脚本 `tools/build_face.py`，出图脚本 `tools/render_face_sheet.py`。
> 预览图 `docs/images/face_v01_turnaround.png`。

## 规格对照

| 提示词要求 | 实际 |
|---|---|
| 宽约 1.15 m | 1.1500 m（x ∈ [-0.575, 0.575]） |
| 高约 1.7 m | 1.7000 m（z ∈ [-0.85, 0.85]） |
| 厚不超过 4 cm | 0.0400 m（y ∈ [-0.0195, 0.0205]） |
| 近黑炭色，眉弓 / 鼻梁 / 颧骨 / 下颌略亮 | 底色 `#0d0809` × 顶点色 0.30–1.00，落在 `#040303`–`#0d0809` |
| 没有眼睛 / 眼窝 / 牙 / 耳 / 头发 | 都没有；只有眉下的一道浅折和一条闭着的嘴缝 |
| 哑光、无高光 | Roughness 1.0、Metallic 0、单面 |
| 单网格、< 4000 三角 | 1 个网格，3744 三角（1874 顶点） |
| 封闭 | 非流形边 0、边界边 0、孤立顶点 0 |

## 坐标与朝向

* 原点在包围盒中心，**Blender 里正面朝 -Y**，导出 glTF（Y-up）后**正面朝 +Z**。
* 摆进第 5 关时（照 `docs/level5_eyes_plan.md` §3.2）：根节点放到
  `(0, 2.45, -5.9635)`，最前面正好落在 `z = -5.945`，不会凸出裂缝开口。
* 提示词要 1.7 m，比规划书里的 `FACE_H = 1.55` 高 15 cm：顶到世界 y = 3.30，
  而裂缝竖直臂只到 3.13 —— 多出来的 17 cm 本来就被上方的墙带挡住，不影响观感。

## 网格与材质

* 拓扑：一张按"头形"参数化的四边形网格（31 列 × 55 行），前表面平滑着色，
  侧壁和背板平直着色；背面是一层 156 个三角形的扇面（贴着墙，永远看不到）。
* 前表面起伏由 `relief(x, z)` 一处算出：面具弧度、鼻子（鼻根/鼻梁/鼻尖/鼻翼/鼻底）、
  眉弓（两条带弧度的眉棱 + 眉下浅沟 + 鼻根小丘）、颧骨（正面 + 颧弓下沟 + 颊凹）、
  下颌（下颌角 → 下颌体 → 下巴两段折线）、嘴（微垂的缝 + 上下唇 + 嘴角 + 人中）、
  太阳穴凹陷、鼻侧沟与法令纹。整段起伏线性压进 4 cm，轮廓边留 4 mm 侧壁。
* 顶点色 `Col`（FLOAT_COLOR / POINT）是 **0.30–1.00 的乘数**，由四项叠加：
  高度（上亮下黑）、迎光法线、五官强度、空腔（凹处更黑）。
  所以游戏里不用灯也能读出眉弓和鼻梁，同时整张脸仍是近黑。
* 材质 `Face_Charcoal`：Principled Base Color = `#0d0809`（线性 `0.00402, 0.00243, 0.00273`），
  Roughness 1.0，Metallic 0，单面（glTF `doubleSided` 缺省 = false）。
  glTF 里是 `baseColorFactor × COLOR_0`；顶点色万一丢了，脸只会更黑，不会变白。
* 带一套正投影 UV（x、z 线性映射到 [0,1]），以后要贴图不用重新展开。

## 导出

`assets/models/face_v01.glb`，glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco / Meshopt / KTX2。
节点：`GiantFace`（空物体，extras 带尺寸、规格路径、三角数）→ `GiantFace_Mesh`。

## 复现

```bash
blender -b --factory-startup -P tools/build_face.py            # 建 + 导出 + 自检
blender -b --factory-startup -P tools/build_face.py -P tools/render_face_sheet.py   # 再出图
```

在已打开的 Blender 里：

```python
exec(open(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools\build_face.py',
          encoding='utf-8').read())
```

## 还没做的事

* 没有替换 `anomalies.js` 里程序化的 `faceRoot`（现在游戏里仍是那几块板）。
  要换的话：`GLTFLoader` 载入后把根节点放到 `(0, 2.45, -5.9635)`，
  材质换成 `MeshBasicMaterial({ vertexColors: true, toneMapped: false })`
  （规划书 §4 步骤 3 要求脸不参与光照，且不被 ACES 压色）。
* 牙、眼睛仍是各自独立的资产（`teeth`、`eyes_v01`），按提示词要求没有并进这张脸。

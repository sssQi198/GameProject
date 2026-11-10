# 第五关 · 咧嘴的牙 `teeth_v01`

> 按 `docs/model_prompts.md` 的「## 第五关 · 咧嘴的牙」建的资产。
> 生成脚本 `tools/build_teeth.py`，出图脚本 `tools/render_teeth_sheet.py`。
> 预览图 `docs/images/teeth_v01_turnaround.png`。

## 规格对照

| 提示词要求 | 实际 |
|---|---|
| 宽约 0.9 m | 0.9000 m（x ∈ [-0.450, 0.450]） |
| 上排 9 颗朝下 | 9 颗，牙根在上、牙尖朝下 |
| 下排 8 颗朝上 | 8 颗，牙根在下、牙尖朝上 |
| 交错 | 下排中心正好落在上排两颗之间，错开约 0.0515 m（半个牙距） |
| 嘴角比中间高 | 抛物线 y = 0.200 · u²，嘴角比中央高 0.2055 m（含随机抖动） |
| 污褐色 `#4a2a20`，不是白牙 | 材质底色 `#4a2a20`；顶点色 0.45–1.00 再压暗，牙根最黑、牙尖略亮 |
| 短、钝 | 牙长 0.09–0.13 m；牙尖截面收到牙根的 52%，平封口，不是尖锥 |
| 没有嘴唇 / 牙龈 / 脸 / 眼睛 | 只有 17 颗牙，别的什么都没有 |
| 单网格、< 3000 三角 | 1 个网格（1 个 primitive），1972 三角 |
| 单独浮着 | 17 个封闭岛，互不相连；非流形边 0、边界边 0、孤立点 0 |
| 哑光 | Roughness 0.94、Metallic 0、单面 |

整体尺寸 **0.9000 × 0.4523 × 0.0587 m**（宽 × 高 × 厚）。

## 坐标与朝向

* 原点在包围盒中心，**Blender 里正面朝 -Y**，导出 glTF（Y-up）后**正面朝 +Z**。
* 游戏里（`anomalies.js` 的 `createFleshWall()`）整排放到 `(0, 2.035, -5.900)`：
  * 高度 y ∈ [1.809, 2.261]，眼球下沿是 2.333，仍留 7 cm 空隙；
  * 最前面 z = -5.8707，和原来程序化牙尖的 -5.871 几乎一样，不会更凸出裂缝；
  * 最宽 ±0.450，落在开口半宽约 0.46 之内。
* `teethRoot` 原有的 `scale.x = 1 ± 0.035` 呼吸动画不变，整排跟着一起轻微开合。

## 网格

* 每颗牙是 10 边超椭圆截面（n≈3，方一点，像门牙）沿牙轴放样 6 圈：
  根部 1.0、0.96、0.89、0.79、0.66、牙尖 0.52；两端各一个 n 边形封口。
* 牙轴不是直线：牙根到牙尖有 2.5 mm 的前弯；唇面再往前鼓 4.5 mm（中间最鼓），
  所以正脸不是一块平板。
* 每颗牙有独立的长度、宽度、厚度、牙轴外八角度、截面滚转和牙尖高度抖动；
  17 颗牙用固定种子 `20251107`，每次重建完全一致。
* 牙面平滑着色，两端的封口平直着色（钝的咬合边不会糊成球）。
* 单网格 1020 顶点 / 884 面 / 1972 三角；导出时按法线拆成 1360 顶点，仍是 1 个 primitive。

## 材质与顶点色

* 材质 `Tooth_Stain`：Principled Base Color = `#4a2a20`（线性 `0.06848, 0.02315, 0.01444`），
  Roughness 0.94，Metallic 0，单面（glTF `doubleSided` 缺省 = false）。
* 顶点色 `Col`（FLOAT_COLOR / POINT）是 **0.45–1.00 的乘数**，四项相乘：
  * 高度：牙根 0.55 → 牙尖 1.00（牙根埋进暗处）；
  * 朝向：朝前的一侧 ×0.98，背面 ×0.74（没有灯也能读出体积）；
  * 每颗牙自己的色差 0.62–1.00；
  * 竖向污渍条纹 ×0.93–1.00。
* glTF 里是 `baseColorFactor × COLOR_0`。顶点色万一丢了，牙只会更暗，不会变白。
* 没有贴图、没有 UV、没有自发光，也没有任何扩展。

## 导出

`assets/models/teeth_v01.glb`，glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco / Meshopt / KTX2。
节点：`GrinTeeth`（空物体，extras 带尺寸、牙数、笑弧、三角数）→ `GrinTeeth_Mesh`。

接入 `src/anomalies.js`：先建 17 个程序化锥体；`teeth_v01.glb` 载入成功后再换掉，
统一改用原来的 `toothMat`（`MeshBasicMaterial`、`fog:false`、`vertexColors:true`）。
载入失败保留程序化牙，页面 `<body data-teeth-model="glb|fallback">` 可以看走的是哪条路；
`whenReady` 现在等眼睛、巨脸、牙三个 glb。

## 验证

```text
node _probe/teeth_asset.mjs    # glb 结构、尺寸、9/8 牙数、交错、笑弧、#4a2a20
node _probe/teeth.mjs          # 把 glb 真读进 createAnomaly(5)：位置、尺寸、材质、换掉程序化牙
node _probe/eyes.mjs           # 第 5 关 3b 段：17 颗牙的位置 / 不挡眼睛 / 咧嘴宽度
```

两个新增 probe 全部通过。`teeth.mjs` 用本地 fetch 替身把三个 glb 都读进来，
量到世界包围盒 `center = (-0.1073, 2.035, -5.900)`、`size = (0.900, 0.4523, 0.0587)`，
最前面 -5.8707，和两只眼睛的中心 x 对齐（差 0 m），牙顶离眼球下沿还有 7.2 cm。
`teeth_asset.mjs` 在素模正视图量到 502 × 254 px，换算 **0.902 × 0.456 m**
（理论 0.900 × 0.452，正交宽 1.15 m / 640 px）。

## 复现

```bash
blender -b --factory-startup -P tools/build_teeth.py            # 建 + 导出 + 自检
blender -b --factory-startup -P tools/build_teeth.py -P tools/render_teeth_sheet.py   # 再出图
```

在已打开的 Blender 里：

```python
exec(open(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools\build_teeth.py',
          encoding='utf-8').read())
```

## 还没做的事

* 没有贴图（牙渍全靠顶点色）。近距离看是色块，不是斑；要更脏得加一张
  `#4a2a20` 调的污渍贴图，但这会超出「< 3000 三角、单网格」之外的美术预算。
* 牙是 17 个互不相连的封闭岛（提示词要求“floating alone”）。如果以后要加牙龈把
  它们连起来，需要重新做一颗共用牙龈的网格，不能直接在这个 asset 上补面。

## 第十九轮：同学那张脸抄了这套牙（没有新资产）

安全屋里的同学（`src/safehouse.js` 的 `mateFangs`）原来只有 6 颗牙，看着像「贴了两排白锥子」。
现在按这份规格改：**17 颗**（上 9 下 8）、锥尖收到牙根的 **52 %**、根色 `#341c15` / 尖色 `#d7cab2`、
同一个随机种子 `20251107`，只把整体缩到同学的头（半径 0.165 m）装得下的尺寸——
牙长 0.042 m、根半径 0.0097 m。目的是让人一眼认出「这张脸是第五关那只怪物变的」，
而不是「人戴了红色美瞳」。

对照图在 `docs/images/`：

| 图 | 内容 |
|---|---|
| `classmate_v01_reveal_stages.png` | 四格：红点亮起 → 嘴咧开 → 牙露出 → 完全变形 |
| `classmate_v01_reveal_views.png` | 正面 / 侧面（转 40°），侧面里远眼被鼻梁挡掉一半 |
| `classmate_v01_reveal_ingame.png` | 游戏里的真实亮度（只有红眼自己发光，脸基本是黑的） |

数字（`data-rig`、牙数、间距、像素统计）和复验命令见 `README.md` 第十九轮 §3 与 §5。

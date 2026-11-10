# 第 2 关 · 后墙山羊头 `goat_head_v01`

> 源资产：Quixel Megascans「Ram Skull」(`tiiief2fa`) tier 2 FBX，13,644 三角。
> 这是扫描件转成的游戏资产，不是提示词生成的模型。
> 构建脚本 `tools/build_goat_head.py`，出图脚本 `tools/render_goat_head_sheet.py`。
> 预览图 `docs/images/goat_head_v01_turnaround.png`。
> 源文件与处理方式见 `assets/source/ram_skull/README.md`。

## 规格对照

| 项目 | 实际 |
|---|---|
| 宽 | 0.3500 m（x ∈ [−0.175, 0.175]） |
| 高 | 0.2620 m（y ∈ [−0.131, 0.131]） |
| 深 | 0.3802 m（z ∈ [0, 0.3802]） |
| 三角面 | 13,644（源 6,806 顶点；导出按 UV/法线缝拆成 8,300） |
| 网格数 | 1 |
| 拓扑 | 封闭流形：非流形边 0、边界边 0、孤立顶点 0 |
| 材质 | `RamSkull_Bone`，Metallic 0，Roughness 走贴图，单面 |
| 贴图 | 1K BaseColor JPEG、1K Normal JPEG、1K metallicRoughness PNG（G = 粗糙度） |
| 文件 | `assets/models/goat_head_v01.glb`，1.6 MiB |
| 导出 | glTF 2.0 Binary，Y-up，1 = 1 m，无 Draco / Meshopt / KTX2 |

## 坐标与朝向

* 原点在**贴墙平面中心**：局部 `z = 0` 是墙，`x / y` 居中；模型只向 +Z 伸。
* Blender 里正面朝 **−Y**，导出 glTF（Y-up）后正面朝 **+Z**。这和 `face_v01`、`teeth_v01` 的正面约定一致。
* 挂到 −X 后墙（墙内表面 `x = −10`）：

  ```js
  root.position.set(-9.99, 1.62, 0); // 留 1 cm 缝，避免和墙面 z-fighting
  root.rotation.y = Math.PI / 2;     // 局部 +Z 转向 +X，正面朝教室
  ```

  头骨最前端到 `x ≈ −9.61`，也就是伸进房间约 0.38 m。
* 旧的程序化头骨挂在 `LAYOUT.skull = { x: −9.96, y: 1.62, z: 0 }`，挂点高一样；
  接新模型时用 `x = −9.99`，`aim` 从 `0.28` 改成 `0.19`（新头骨的重心离墙更近）。

## 网格与材质

* 直接用 tier 2 中模，没有减面：13,644 三角对一件 4–5 米外看的墙上道具足够，
  法线贴图把扫描的骨面起伏都留着。
* UV 是 Megascans 的 atlas，没有重展；法线是切线空间（glTF 默认），
  没导切线属性，Three.js 用屏幕导数自己算。
* 贴图从源 2K 用 Lanczos 降到 1K。1K 在这个尺寸上约 2,900 px/m，
  比拍照时屏幕上的像素密度高得多。
* 粗糙度接 Principled 的 Roughness，导出器自动打包成 metallicRoughness PNG
  （G = 粗糙度，B = 0）。
* 单面（`use_backface_culling = True`）：网格是封闭的，打开背面剔除省一半填充。

## 导出

`assets/models/goat_head_v01.glb`，节点结构：

```text
GoatHead            (空物体；extras: model / spec / source / license / size / pivot / front_axis ...)
└── GoatHead_Mesh   (extras: role = goat_head, triangles = 13644)
```

导出参数与 `build_eyes.py` / `build_face.py` 一致：GLB、`export_yup`、
不开 Draco / Meshopt、不导相机和灯、`export_extras` 打开。
自检会读回 glb，确认没有 `extensionsUsed`、三张图都内嵌、面数和尺寸对得上。

## 复现

```bash
blender -b --factory-startup -P tools/build_goat_head.py
blender -b --factory-startup -P tools/build_goat_head.py -P tools/render_goat_head_sheet.py
```

在已打开的 Blender 里：

```python
exec(open(r'C:\Users\dqh08\Desktop\GameProject\w05_3d_game\tools\build_goat_head.py',
          encoding='utf-8').read())
```

> 注：glTF 导出器用 `tempfile.TemporaryDirectory()` 存中间贴图。DSH 沙箱下
> Python 的 `mkdtemp` 目录写不进去，构建脚本把 TemporaryDirectory 换成了
> `work/blender_tmp` 下的普通目录（导出完删除）。在普通桌面上跑也安全。

## 还没做的事

* 已经接进第 2 关：`createRamSkull()` 载入这个 glb，挂在 `LAYOUT.skull`，
  `rotation.y = π/2`，`tagAnomaly(group, 2, 'skull')`。程序化木牌和羊角已去掉。
* 下载包里的 high / raw / 8K EXR / ZBrush `.ztl` 没有用：那是离线渲染和再雕刻的源，
  游戏里用不到。
* AO、Cavity、Bump 三张图没有打进 glb：AO 要额外接 glTF 的 occlusion 通道，
  这次先留 BaseColor + Normal + Roughness 三张；场景本身有光照和雾，够读。
  以后要加，可以把 AO 塞进 metallicRoughness 的 R 通道（ORM 打包）。

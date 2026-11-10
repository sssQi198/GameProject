# Ram Skull 源文件

- 资产：Quixel Megascans「Ram Skull」，asset id `tiiief2fa`（[Megascans 页面](https://quixel.com/megascans/home?assetId=tiiief2fa)）。
- 下载：2026-11-10，`Downloads/ram_skull_tiiief2fa_mid.zip`（tier 2 中模）+ 1K/2K 贴图。
- 用途：《错层》第 2 关后墙的羊头骨，导出为 `assets/models/goat_head_v01.glb`。
- 授权：Megascans / Fab 资产授权。仅用于课程作业；保留此来源说明和 glb extras 里的 `source` / `license`。

## 这里保留什么

| 文件 | 来源 / 处理 |
| --- | --- |
| `ram_skull_mid.fbx` | 原始 tier 2 FBX，13,643 三角，厘米单位、Z-up |
| `ram_skull_1k_basecolor.jpg` | 源 2K BaseColor → 1K（Lanczos）→ JPEG q92 |
| `ram_skull_1k_normal.jpg` | 源 2K Normal → 1K → JPEG q95 |
| `ram_skull_1k_roughness.jpg` | 源 2K Roughness → 1K → JPEG q92 |

下载包里的 high（32k 面）、raw（100 万面）、8K EXR 和 ZBrush `.ztl` 没有放进仓库：
浏览器里用不到，1K 贴图在 4–5 米的拍照距离已经足够。

Meshopt / Draco / KTX2 都不用，保持和其他模型一样的普通 glTF 2.0。

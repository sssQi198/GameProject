# 第 5 关「裂缝之眼」改动风险清单（真实版）

> ⚠️ 本文件原本由子代理生成了一版**内容不可信**的审计（"门轴万向节锁死""血肉材质泄漏 60+ 纹理""窗帘着色器法线越界"等，行号均为编造，且该代理违反了只读要求擅自建了这个文件）。已整体覆盖为下面这份**基于实际读码**的清单。
>
> 对应计划：`docs/level5_eyes_plan.md`。只覆盖本轮三处结构性改动。

---

## A. 后墙血肉：从「整片只留门洞」改成「挖出 6 窗 + 门洞」

| 风险 | 依据 | 严重度 | 规避 |
|---|---|---|---|
| 分片接缝漏光/露底 | 13 块由横带切分，若每块尺寸有一处算错就会出现细缝，缝后是教室实墙内表面（z=6.0），从走廊看会透出一道亮线 | **high** | 分片坐标全部由窗位表精确生成（已由子代理独立复核，一致）；加脚本断言：同一条带内相邻分片 x 首尾相等、各带 y 首尾相接 |
| 窗台突出房间内侧与血肉打架 | 窗台盒在 `z - 0.16 = 5.915`（`level.js:920`），血肉面在 `5.99`，两者在 z 上相隔 7.5cm，不共面 | low | 无需处理；但挖洞时不可顺带缩窗宽（窗台在 x 上比窗洞宽 0.30） |
| 纹理在 13 块之间错位 | 每块单独 clone 纹理会各从 UV(0,0) 起算 | medium | 改为**共用一份**纹理并把 UV 按世界坐标烘进几何体（`u=0.3x`、`v=1.40625y`），图案跨缝连续 |
| `overMesh` 门楣条被取代 | 它原本与"门上方"块共面，是闪变源 | low | 随本次重写一并删除 |
| `blockHallLight` / `colliders` 受影响 | 两者作用于 `level.js` 的墙盒与碰撞盒，不认识血肉网格 | none | 无需处理 |

## B. 第 5 关提前到走廊预建（`enterCorridor` + `prewarm`）

| 风险 | 依据 | 严重度 | 规避 |
|---|---|---|---|
| `clearAnomalies()` 清不到 `prewarmed` → 泄漏 | `level.js:400-406` 只遍历 `this.anomalies` | **blocker** | `clearAnomalies` 里一并 `disposeObject` 掉 `prewarmed` 的全部条目并清空 Map |
| reset 后复用已 dispose 的 group → 崩 | devtools 跳关会先 `level.reset()`（`devtools.js` 多处） | **blocker** | 同上：reset 必须把 `prewarmed` 一起清掉，不能只清 `anomalies` |
| 重复创建 | — | none | `spawnUpTo` 已有幂等判断（`level.js:389`），`prewarm` 里也要判一次 |
| 玩家还在教室里就被血肉包住 | 若触发点放早（如 `phase='leaving'` 刚置位） | **high** | 触发点只在 `enterCorridor()`（`z > 7.35`，已出门 1.35m 且背对教室） |
| demo 模式被打断 | `demo.js` 走 `getAnomalyStand(1)`，与第 5 关无关 | low | 预建仅限 `levelIndex === 4` |
| 走廊里掉帧 | 建 1150 网格 + 生成 512² CanvasTexture 是同步的 | medium | ①`main.js` 用 `requestIdleCallback` 提前 `prewarm(5)`（玩家还在菜单）；②把一直没赋值的 `level.onSceneChanged` 接上 `renderer.compileAsync()`（`vendor/three.module.js:29897` 有该方法） |

## C. 拍照目标从「整面墙」收窄到「眼睛命中球」

| 风险 | 依据 | 严重度 | 规避 |
|---|---|---|---|
| 打墙变成失败，玩家不知道怎么拍 | `level.js:439-456`：第一个非 `noRay` 命中就 `return`，未带标签即 `kind:'none'` | medium | 依赖已有的 `hud.setAimHot`（`game.js:736-740`）给准星反馈；命中球半径 0.55 提供宽容度 |
| 命中球材质选择 | 需要一个材质才能构造 Mesh | low | 最简单的 `MeshBasicMaterial`，`visible=false`；`intersect()` 不检查 `visible`（`vendor/three.module.js:52446-52456` 只看 `layers`） |
| 去掉 group 标签后其他逻辑失灵 | 全项目只有 `findTag()`（`level.js:1947`）和 `aim()` 读 `anomalyLevel` | low | 改完跑一次第 1~4 关的 `aim()` 回归（瞄各自异常仍应命中） |
| devtools「强制通关」失效 | `forceCurrentPhoto()`（`game.js:689-693`）不经过 raycast | none | 仍然可用，调试不受影响 |

---

## 统计

- blocker：**2**（都在 `prewarmed` 的生命周期管理，必须和 `prewarm` 同一次改动解决）
- high：2 / medium：3 / low：4 / none：3

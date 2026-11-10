## 第十七轮：直线走廊、刺眼的门、门内剧情重排、同学模型可换

四条都是用户提的，一起改完一起验。

### 1. 追逐走廊改成纯线性

以前北墙上有个 5.4 米宽的开口（`alcove`，`x 51.4–56.8`、`z 10.15–14.1`），往北凹进去一块，是「转角版尾声」的残留。走到发光门附近时，直线视线会被那块凹口打断。

- `src/layout.js`：删掉 `alcove` 键，原位置留一段注释说明「已封死」；`exitX` 保留（exit 灯箱和几个探针还在用，不再是终点）。
- `src/level.js`：北墙从「两段 + 开口」改回**一整条**；凹口自己的三面墙、地板、护栏全部删除；`supportColliders[0].maxZ` 收到 `LAYOUT.hall.maxZ + 2`。

现在走廊是一个直筒：`x −40 … 66`（106 米）、`z 7.05 … 10.15`（3.1 米宽）、高 2.9 米，从教室门一眼能望到东端那扇发光的门，中途没有侧室。

### 2. 门亮到刺眼，远处就能看到光点

难点不在「调亮」，在**雾**。追逐段的雾是 `FogExp2(0.085)`（`CONFIG.fogChase`）：20 米外透光率只剩 **5.6 %**，25 米只剩 **1.1 %**。任何普通材质在那个距离都被雾均匀吃成背景色，所以光点必须是**不吃雾**的加色精灵。

| 东西 | 数值 | 作用 |
|---|---|---|
| `endDoorLight`（PointLight `0xfff2d8`） | `55×v`，距离 10，衰减 2 | 把门框、门口地板染亮 |
| `doorSafeMat.emissiveIntensity` | `2.6×v` | 门板自己发亮（原来 1.0 级） |
| `leakMat.opacity` | `min(1, 1.3×v)` | 门缝漏出来的那条 |
| `doorFlareMat`（2.10×2.62 平面） | `0.95×v` | 贴着门缝的过曝光斑 |
| `endDoorGlowMat`（5.2×3.8 平面） | `0.75×v` | 门外溢的大片光 |
| `doorBeacon`（精灵，1.15 米） | `v` | **远处那个「光点」**：`fog:false` + `toneMapped:false` + 加色混合 + `depthWrite:false` |
| `doorHalo`（精灵，4.80 米） | `v` | 近处光晕，同样不吃雾 |

`v` 就是 `setDoorGlow(k)` 的 `k`。节奏：`beginChase()` 直接给 `0.45`（走廊里一抬头就有光），`updateChase` 里按到门的距离从 `0.45` 线性升到 `1`（34 米内走完），`beginEnding()` 钉在 `1`。

`glowSpriteTexture()`（`level.js`，128×128 径向渐变）专门画那两个精灵。1.15 米的道标在 30 米外是画幅高度的 2.7 %（760 px 的窗口里约 20 px）——正好是「远远一个亮点」。

### 3. 门内剧情：先听见响，回头只看到背对着关门

13 段时间表（总 17.90 秒）**一个数没动**，只改第 5、6、10 段的构图与时序：

- 第 5 段（2.40 s）：门先响。`0.30 s` 才起 `beginAutoTurn(Math.PI / 2, −0.05)` 回头（`player.beginAutoTurn` 每帧 `min(1, 7·dt)`，180° 约 0.66 秒）；同一段门缝从 `0.95` 掩到 `0.45`，木门吱声 + 一声闷响都在转身之前。
- 第 6 段（1.30 s）：回头这一下正好落在「同学背对着把门关上」——`doorAjar` 收到 `0`，画面里只有背影。
- 传送进场永远看不到正脸：同学在**第 2 段**（`fadeWhite === 1` 那 0.55 s 的白里）就被放到位，而玩家在那之前一直朝 `+X`（`yaw = −π/2`）看着门；回头是后来的事。
- 第 10 段（1.20 s）：飞扑不再横向贴脸。落点由 `mateLungePoint()` 按**镜头视线**算：`endFallX = player.x` ⇒ `camX = endFallX + 0.55`，`MATE_LUNGE_GAP = 0.55`；头正好落在视线正前方（横向偏差 0.0 mm），脸占画幅高度 **≈44 %**——「半张脸」，然后 `finishDemo()` 黑屏。

### 4. 同学模型留接口，并且能换

`src/team/m2.js` 新增（导出）：

| 名字 | 作用 |
|---|---|
| `CLASSMATE_URL` | 默认 `/assets/models/classmate_v01.glb` |
| `PROCEDURAL_MATE` | 常量 `'proc'` |
| `MATE_MODEL` | `{ url, scale, yawOffset, offsetY, hideMaterials }` |
| `configureMateModel(url, options)` | 就地改 `MATE_MODEL`（只认合法值），返回副本 |
| `mateModelConfig()` | 只读副本 |
| `applyFaceOverride(root, hideMaterials)` | 按材质名 `visible = false`，返回真正关掉的名单 |

`createClassmate(THREE, { onReady })` 现在三条路：`MATE_MODEL.url === 'proc'` ⇒ 程序化（**同步**就位）；否则加载 glb；失败回退程序化。状态写在页面属性上，无头 `--dump-dom` 直接能读：`data-classmate-model ∈ {glb, procedural, fallback}`、`data-classmate-hidden`（逗号分隔的材质名，或 `none`）。

`src/safehouse.js` 新增运行时接口：`setMateModel(url, options)`（保位置 / 朝向 / 可见性 / 透明度，换完重新量头高、重挂红眼尖牙）、`mateModelInfo()`。

地址栏里换模型，不改代码：

| URL | 效果 |
|---|---|
| `?mate=proc`（也认 `?mate=1` / `?mate=procedural`） | 用程序化那套：无五官的头 + 独立红眼尖牙 |
| `?mate=/assets/models/xxx.glb` | 换成任意 glb |
| `&mateface=keep`（可单用） | 保留 glb 自带的五官，不藏 |

**为什么要藏脸**：`classmate_v01.glb` 里 0 张贴图，五官是**几何**——头被切成 6 个 primitive（`Eye_White` / `Eye_Dark` / `Face_Shadow` / `Hair_Black` / `Skin_Shadow` / `Skin_Warm`）。要换红眼尖牙，只能把「眼睛 + 面部阴影」这三份材质 `visible = false`，肤色和头发留着。红眼和尖牙是 `safehouse.js` 里独立装的（`SphereGeometry(0.021)` 两颗 + `PointLight(0xff2a2a, 0, 4.5, 2)` + 6 颗牙），所以头高也不能写死：`headY = Box3(root).max.y − 0.16`。

**旧版 glb 找不回来**：`git log --all -- assets/models/classmate_v01.glb` 只有 `113079b` 一个提交，磁盘上也没有第二份。所以「组员更新前的那版」用 `?mate=proc`（程序化模型，本来就没五官）代替；哪天翻出旧文件，丢进 `assets/models/` 再用 `?mate=` 指过去即可。

### 本轮修掉的三个真 bug（都只在 `?mate=proc` 下才炸）

1. **TDZ**：`level.js` 的 `onReady` 闭包里引用 `customMate`。程序化是同步回调，那时 `const customMate = …` 还没赋值 ⇒ `ReferenceError: Cannot access 'customMate' before initialization`，整个 boot 进 `#boot-error`。修法：`onReady` 改成**传参** `onReady(group)`（`m2.js` 三处调用点都传），调用点用参数而不是闭包变量。
2. **配置晚了一步**：`?mate=` 的解析原来放在 `new Level(scene)` 之后，而 `Level` 构造时就已经把教室里的同学按旧地址开始加载了（glb 是异步的，晚配等于没配）。修法：解析挪到 `try` 第一行，`Level` / `createSafehouse` 之前。
3. **旧请求改写全局状态**：glb 请求晚到会把 `data-classmate-model` 写回 `glb`。修法：`createClassmate` 在创建时记下 `url`，之后每次写 dataset 都先比 `url === MATE_MODEL.url`，不一致就不写。

### 怎么验

- `_probe/mateapi.mjs`：**32 条断言**（默认配置副本独立、`configureMateModel` 合并语义、`applyFaceOverride` 在 6 primitive 假头上只关三份、`'proc'` 同步就位且 `onReady` 收到组本体、`procBox.min.y ≈ 0` 且身高 1.75、glb 失败回退、`setMateModel` 往返保位/保朝向/保头高、`reset()` 清揭示态）。
- `node --check` 全过；`_probe/` **25 支**全 exit 0（`advance.mjs` 48 条、`ending.mjs` 121 ok、`demotail.mjs` 18 条不变）。
- 无头三连（同一台机器、SwiftShader、`--dump-dom`，结果逐字对得上）：

| URL | `data-classmate-model` | `data-classmate-hidden` |
|---|---|---|
| `?probe=1` | `glb` | `Eye_White,Eye_Dark,Face_Shadow` |
| `?probe=1&mate=proc` | `procedural` | `none` |
| `?probe=1&mateface=keep` | `glb` | `none` |

三条都是 `data-decor="45"`、`data-draw="128|13087"`、无 JS 报错、`#boot-error` 为空——说明三条路径都正常跑完了建场。
- 只能人眼过的：门到底刺不刺眼、0.30 秒的「先听见再回头」够不够、飞扑那一帧是不是只剩半张脸。

### 已知副作用（都接受）

- `?mate=proc` 那套是「接 glb 之前」的老模型：比例粗、没有五官细节，只适合看红眼尖牙和动作。
- `?mateface=keep` 会把 glb 自带的五官露回来，红眼尖牙会和自带眼睛叠在一起（这就是给你比对用的，不是缺陷）。
- 远处光点不随雾衰减，等于「永远那么亮」；如果哪天想让它在 40 米外弱一点，改 `beaconMat` 的透明度曲线即可，别改雾。
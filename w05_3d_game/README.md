# 错层 Wrong Floor

浏览器里的第一人称 3D 短篇。教室会一轮轮多出一件不该存在的东西。对准它按 `F` 拍下来，门才会开。第五扇门之后，先看清那双眼睛，再冲向绿色 `EXIT`。

## Run

需要 Node.js 18 或更高。Three.js 和 lil-gui 已经放在 `vendor/`，不用再装依赖。

Windows 上直接双击 `start.bat`，它会启动本地服务器并打开浏览器。玩的时候别关那个黑色窗口。

也可以用终端：

```bash
cd w05_3d_game
node server.js
```

然后打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。`npm start` 会自动打开浏览器。请用桌面版 Chrome 或 Edge。

不要直接双击 `index.html`。地址栏变成 `C:/...` 或 `file://` 时，浏览器会拦住游戏脚本，标题画面能看到，但按钮点了没反应。页面会提示改用 `start.bat`。

## Controls

| 操作 | 作用 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 环顾。若浏览器不允许锁定指针，按住左键拖动，或用方向键 |
| `Shift` | 冲刺。终局不冲刺会被追上 |
| `E` | 拾起相机 / 拿出 / 收起 |
| `F` | 拍摄（需先拿出相机） |
| `M` | 静音 |
| `Esc` | 暂停。演示中会直接退出 |

拍下当关异常后、以及终局追逐开启时，相机会自动收起，随时可按 `E` 再拿出。已拍中后的关卡间隙、走廊和终局里按 `F` 仍有快门声和后坐，但不会记录异常，也不影响任何判定。

音量滑条在标题画面和暂停 / 结算画面上。浏览器会拦住自动播放，所以声音从点击 **Start** 或 **Watch Demo** 之后才开始。音效全部由 Web Audio 实时合成，没有外部音频文件。

## Watch Demo

标题画面上的 **Watch Demo / 观看演示** 会用这局游戏自己的碰撞、拍照和追逐跑一段缩短流程：跟进教室、拾起相机、拍下第一处异常、出门，然后进入终局追逐和尾声。它不是录像。

演示过程中可以按 `Esc` 或 **Exit Demo**。回到标题后按 **Start** 就是正常人玩，五处异常都会出现。

## 开发时调参

```text
http://127.0.0.1:5173/?debug
```

右上角可以改走路速度、雾、曝光和灯光，也可以打开碰撞框。这些数值在 `src/config.js`。教室和走廊的尺寸在 `src/layout.js`，改关卡前先改那里。

## 五人分工接口

每人优先改 `src/team/` 里自己的文件。标记名和事件在 `src/team/contract.js`。仓库根目录的 README 有给 AI 的任务模板。

| 文件 | 谁改 | 接口 |
| --- | --- | --- |
| `src/team/p1.js` | P1 逻辑与 UI | `hints`、`successLines`、`copy` |
| `src/team/p2.js` | P2 移动与镜头 | `lookHoldSeconds()`、`lookResponsiveness()` |
| `src/team/p3.js` | P3 杂物、灯、窗帘 | `isFlickerDark()`、`extraProps()`、`tick()` |
| `src/team/m1.js` | M1 场景 | `extraColliders()`、`createSceneExtra()` |
| `src/team/m2.js` | M2 人物与异常 | `anomalyFactory`、`createClassmate()`、`createEyes()` |

拍照认 `userData.anomalyLevel`。门、拍照、终局注视通过 `src/team/bus.js` 的 `door`、`photo-ok`、`look-lock` 通知其他人。

## 目录

```text
w05_3d_game/
├── start.bat           Windows 双击启动：开服务器 + 打开浏览器
├── index.html          入口：canvas、HUD、菜单
├── styles/main.css     菜单、HUD、结算
├── src/
│   ├── main.js         渲染器、循环、调试入口
│   ├── game.js         状态机：menu → playing → win / lose
│   ├── player.js       移动、输入、相机
│   ├── level.js        教室、走廊、门、追逐实体
│   ├── anomalies.js    五关异常
│   ├── hud.js          进度、计时、提示
│   ├── viewfinder.js   取景器：相机屏幕式取景层与效果
│   ├── camera-rig.js   程序化手持相机模型
│   ├── audio.js        Web Audio 音效
│   ├── demo.js         演示模式
│   ├── collision.js    碰撞
│   ├── layout.js       场景尺寸
│   ├── config.js       手感
│   └── debug.js        lil-gui
└── assets/             预留给以后的 glb、贴图、音频
```

场景现在用程序化几何体。把模型放进 `assets/models/` 后，可以在 `level.js` 里按同样的位置换上去。

## M1 教室模型分支

`feat/m1-classroom-glb-collision` 在不改动 `original-game` 分支的前提下加入了 `assets/models/classroom_m1_v01.glb`。

模型内容与替换范围：

- 只包含**课桌、椅子、教师桌、黑板（含边框、粉笔槽、粉笔和板擦）**，按 6 种材质合并成 6 个网格、720 个盒子、约 8.6k 三角形、约 520 KB；
- 墙体、地面、天花板、门窗、窗帘、灯具和走廊**仍由 `level.js` 程序化生成**，因此第五关门缝异常、第三关窗帘脸、第四关地面脚印等与场景绑定的异常位置不会被遮挡；
- 加载成功后隐藏原来的程序化家具视觉，并用同一套水平碰撞盒继续做玩家碰撞。

家具细节（v2）：桌面板下加了侧撑、四条横撑和桌下书架，学生侧有挡板；椅子由座面框、四条腿、踏脚横杆、两根靠背立柱、三根靠背条和顶帽组成；教师桌有前挡板、侧板、两个抽屉和柜门；黑板带四条边框、粉笔槽、三根粉笔、板擦和两个墙面支架。

异常与新模型的对应关系：

| 关 | 异常 | 对应模型位置 |
| --- | --- | --- |
| 1 | 后排坐着的人影 | `LAYOUT.seat` (-7.85, 4.0)，正好落在第一排第 6 列课桌的椅子上 |
| 2 | 黑板上的字 | 黑板面在 x≈9.90，异常平面在 x=9.84，位于板面前方约 6 cm，不会被边框盖住 |
| 3 | 窗帘内的脸 | 保留程序化窗帘（z≈5.95），异常在 z=5.78 位于布料前方 |
| 4 | 第二台相机 + 脚印 | 地面走道空位 (0.2, -2.75)，不与任何课桌碰撞盒重叠 |
| 5 | 门缝里的错层教室 | 挂在动态 `doorPivot` 上，模型不参与门板，门的开关动画不受影响 |

性能处理：

- 模型从最初 150 个独立节点合并为 6 个材质批次，减少 draw call；
- 文件体积从 5.4 MB 降到约 520 KB，避免加载卡顿；
- 像素比上限从 1.75 降到 1.5，降低高分屏下的填充压力；
- GLB 加载是异步且非阻塞的，失败会自动回退到程序化教室，不影响菜单和主循环。

## M2 同学模型（model_prompts 第一条）

`assets/models/classmate_v01.glb`（约 100 KB，4051 个三角形，14 个网格 + 根节点）按 `docs/model_prompts.md`「同学」「同学 · 面部细化」「同学与木偶 · 拆出关节」三段提示词搭的建模稿。头 1575 三角形（上限 2500）。转台图见 `docs/images/classmate_v01_turnaround.png`（前四格全身，第五格头部、第六格右手特写），脸和手的特写见 `docs/images/classmate_v01_face.png`、`docs/images/classmate_v01_hand.png`。

- 身高 1.75 m，脚底在 y=0，面朝 glTF **+Z**（Blender 里朝 -Y），Y 轴朝上；导出没开 Draco / Meshopt / KTX2，也没有多余扩展。
- 关节层级（glb 里保留父子关系，左右都是先左后右）：

```
Classmate               根节点，extras 里有 legs/shins/feet/arms/forearms/hands/body/head
├─ Classmate_Body       躯干、外套、领口、书包、脖子，原点在脚底
│  └─ Classmate_Head    y=1.535，头和头发
├─ Classmate_Leg_L      (-0.090, 0, 0.895)，只有大腿
│  └─ Classmate_Shin_L  膝下 0.45 → y=0.445，只有小腿
│     └─ Classmate_Foot_L  踝下 0.35 → y=0.095，只有鞋
├─ Classmate_Arm_L      (-0.190, 0, 1.400)，外张 13°，只有上臂
│  └─ Classmate_Forearm_L  沿袖 0.30 m → (∓0.257, 0, 1.108)
│     └─ Classmate_Hand_L  再 0.25 m → (∓0.314, 0, 0.864)，手掌 + 手五指
└─ …_R 同上，x 取正
```

  每段都是封闭网格，接缝在关节处并互相插进 5 mm，静止姿势旋转为零就是现在这副站姿；膝、肘没有球，转大角度时沿接缝张开，肩、髋各有一对球跟着身体。
- 空物体 `Classmate` 是根节点，extras 写的是部件名数组（先左后右），每个网格另有 `role`（body/head/leg/shin/foot/arm/forearm/hand）。
- 材质 11 个，全部哑光：`Cloth_Navy` #252a3a、`Cloth_Trim` #1a1e2a、`Pants_Charcoal` #1d2026、`Skin_Warm` #cba57f、`Skin_Shadow` #b18f6e、`Hair_Black` #17130f、`Bag_Brown` #33291f、`Collar_Pale` #a8a294、`Eye_White` #7a7166、`Eye_Dark` #2b2018、`Face_Shadow` #231a15。
- 肤色 `#cba57f`（暖偏黄），**和第一段提示词的「skin dark warm gray-brown」不一致**——按后续要求换成了黄种人肤色，夜里的阴影改由眼窝、眉弓和刘海压出来。
- 头部（面部细化那版）：窄下颌、小下巴、低颧骨、浅眉弓（1.658 处往前顶 1 mm）、太阳穴微凹；16 边放样，下巴到头顶 20 圈截面。
  - 眼睛是疲惫的杏仁形，上缘平、内角低 2 mm，厚上眼睑；虹膜 `Eye_Dark` #2b2018 平顶压在上眼睑下，宽度约占半只眼；眼白 `Eye_White` #7a7166，没有睫毛和高光。
  - 眉毛内端粗、外端细，内端高约 2 mm；鼻梁从两眉之间起，鼻头软，两个浅鼻孔；嘴闭着，薄上唇 + 稍厚下唇，颜色 #231a15。
  - 眉下、鼻下、下唇下各有一片 `Skin_Shadow` 软阴影（压暗 12%）。
  - 耳朵 4.2 cm，上半截和头发齐平；刘海是三撮几毫米的碎发，发际线不是一条直线。
  - 五官薄片全部用 Shrinkwrap 沿 +Y 投影贴到头部表面（3～4.6 mm 分层），低面数也不会悬空。
- 手部：手掌 + 四根手指（食指 6.0 / 中指 6.6 / 无名指 6.2 / 小指 5.2 cm）+ 拇指，截面 6 边形、指尖收细；整只手在 `Classmate_Hand_*` 里，跟着腕关节转。
- 提示词写的是「单网格」，但同一份文档又要求按髋、肩拆成可转动物体，所以这里直接建成带父子关系的分段网格——拆分和旋转中心都是建模时定好的。
- 着色用 `shade_smooth_by_angle(86°)`：盒子棱角保持硬边，头部和四肢的过渡不再被切成一条条亮带。

两个 Blender 脚本可重复执行（每次重建 Classmate 集合，再覆盖 glb / 转台图）。工作区不允许 Blender 直接写文件时会退回系统临时目录并打印路径，拷回仓库即可。

| 脚本 | 作用 |
| --- | --- |
| `tools/build_classmate.py` | 程序化建模 + 导出 `assets/models/classmate_v01.glb` |
| `tools/render_classmate_sheet.py` | 六格转台图（临时棚灯，渲完删掉并还原场景） |
| `tools/headless_run.py` | 没有 MCP 插件时用 `blender -b --factory-startup -P tools/headless_run.py` 跑完整流程 |

## 第五关 · 眼睛模型（model_prompts 第三条）

`assets/models/eyes_v01.glb`（约 18 KB，880 三角，2 个网格 + 根节点）按 `docs/model_prompts.md`「第五关 · 眼睛」搭的建模稿：只有两颗红色发光眼球，没有眼睑、瞳孔、脸和身体。

- 每只直径 0.174 m（半径 0.087），球心相距 0.38 m（x = ±0.19），和 `anomalies.js` 里的 `EYE_R` / `EYE_DX` 一致。
- 20 段经线 × 12 圈纬线（含两极）的 UV 球，每只 440 三角（极低面数）；两只是各自独立的网格，节点名 `Eye_L` / `Eye_R`，根节点 `Eyes`。
- 材质 `Eye_Glow`：底色纯黑、Roughness 1、Metallic 0、自发光 **#ff2030**（emissiveFactor 按线性空间写入）。没有贴图、UV、Draco / Meshopt / 其他扩展，单面渲染。
- 局部原点在**两眼连线中点**，每只球的原点在自己球心上；根节点 extras 写了 `eyes`、`diameter_m`、`spacing_m`、`eye_y_m`（2.42 m，第 5 关的球心高度）、`up_axis`。进游戏时整对放在 `(EYE_CX, 2.42, -5.981)`，正好和原来的程序化球重合。

接入方式（`src/anomalies.js` 的 `createFleshWall()`）：先建程序化球，`eyes_v01.glb` 载入成功后再换掉；两颗球统一改用原来的 `MeshBasicMaterial`（`toneMapped: false`），因为 ACES 会把 StandardMaterial 的红压灰，而且拍后淡出改的就是这个材质的颜色。光晕、红色点光、拍照命中球、心跳缩放、缓慢扫视和 1.6 秒淡出逻辑都没动。载入失败时保留程序化球，页面 `<body data-eyes-model="glb|fallback">` 可以看走的是哪条路。

预览图 `docs/images/eyes_v01_turnaround.png` 是 2×2：正面一对（量到直径 168.0 px / 眼距 368.0 px，理论 168.7 / 368.5，误差 0.5% 以内）、3/4 透视、单眼特写、线框。辉光只在预览里加，不进 glb。

验证：

```text
node _probe/eyes_asset.mjs   # glb 结构、尺寸、#ff2030、three.js 能否加载
node _probe/eyes.mjs         # 第 5 关两只眼的位置 / 不凸出开口 / 拍后淡出
```

重建（Blender 5.2；脚本可重复执行，先建模型再出图）：

```text
blender -b --factory-startup -P tools/build_eyes.py -P tools/render_eyes_sheet.py
```

## 第五关 · 黑色巨脸模型（model_prompts 第四条）

`assets/models/face_v01.glb`（约 128 KB，3744 三角，1 个网格 + 根节点）按 `docs/model_prompts.md`「第五关 · 黑色巨脸」搭的建模稿：一张压扁的巨大黑人脸，没有眼睛、眼窝、牙齿、耳朵和头发。规格和接口细节见 `docs/face_v01_spec.md`。

- 尺寸 1.15 × 1.70 × 0.040 m（宽 × 高 × 厚），原点在包围盒中心；Blender 里正面朝 -Y，导出后正面朝 +Z。摆到 `(0, 2.45, -5.9635)` 时最前面正好是 `z = -5.945`，比眼睛前极还靠里，不凸出裂缝开口。
- 拓扑：按头形参数化的四边形网格（31 列 × 55 行）+ 156 个三角形的背板；前表面平滑、侧壁平直；非流形边 0、边界边 0、孤立点 0。
- 五官全部由 `relief(x, z)` 一处算出：眉弓（两条带弧度的眉棱 + 眉下浅沟）、鼻根 / 鼻梁 / 鼻尖 / 鼻翼 / 鼻底、颧骨与颧弓下沟、下颌角 → 下颌体 → 下巴、微垂的嘴缝与上下唇、太阳穴凹陷、鼻侧沟和法令纹。整段起伏线性压进 4 cm，轮廓边留 4 mm 侧壁。
- 材质 `Face_Charcoal`：底色 `#0d0809`，Roughness 1.0、Metallic 0、单面；顶点色 `Col` 是 0.30–1.00 的乘数（高度 + 迎光法线 + 五官 + 空腔），乘出来正好落在规划书说的 `0x030202 … 0x0d0809` 几级近黑。glTF 里是 `baseColorFactor × COLOR_0`，顶点色丢了也只会更黑，不会变白。另外带一套正投影 UV，以后要贴图不用重新展开。
- 提示词要 1.7 m 高，比 `docs/level5_eyes_plan.md` 里的 `FACE_H = 1.55` 高 15 cm：顶到世界 y = 3.30，而裂缝竖直臂只到 3.13，多出来的 17 cm 被上方的墙带挡住。
- 预览图 `docs/images/face_v01_turnaround.png` 是 2×3：上排是游戏里的样子（正面 / 3/4）和鼻子特写，下排是素模正面 / 3/4 和线框。素模正视图量到 378 × 558 px，换算 1.152 × 1.700 m（理论 377.4 × 558.0）。
- 接进游戏：`anomalies.js` 的 `createFleshWall()` 先建程序化的几块板，`face_v01.glb` 载入成功后再换掉；材质换成 `MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })`（规划书 §4 步骤 3：脸不参与光照，也不被 ACES 压色）。载入失败保留程序化脸，页面 `<body data-face-model="glb|fallback">` 可以看走的是哪条路。

重建（Blender 5.2；脚本可重复执行，先建模型再出图）：

```text
blender -b --factory-startup -P tools/build_face.py -P tools/render_face_sheet.py
```

## 第五关 · 咧嘴的牙模型（model_prompts 第五条）

`assets/models/teeth_v01.glb`（约 61 KB，1972 三角，1 个网格 + 根节点）按 `docs/model_prompts.md`「第五关 · 咧嘴的牙」搭的建模稿：17 颗牙单独浮着，没有嘴唇、牙龈、脸和眼睛。规格和接口细节见 `docs/teeth_v01_spec.md`。

- 尺寸 0.9000 × 0.4523 × 0.0587 m（宽 × 高 × 厚），原点在包围盒中心；Blender 里正面朝 -Y，导出后正面朝 +Z。
- 上排 9 颗、牙根在上牙尖朝下；下排 8 颗、牙根在下牙尖朝上；下排中心正好错开在上排两颗之间（半个牙距 0.0515 m）。整排沿抛物线 `y = 0.200 · u²` 排，嘴角比中央高 0.2055 m。
- 每颗牙是 10 边超椭圆截面放样 6 圈，牙尖收到牙根的 52%（短而钝，不是尖锥），两端平封口；牙轴有 2.5 mm 前弯，唇面再鼓 4.5 mm。每颗牙的长度、宽度、厚度、外八角度、滚转和牙尖高度都有独立抖动，固定种子 `20251107`。
- 材质 `Tooth_Stain`：底色 `#4a2a20`（不是白牙），Roughness 0.94、Metallic 0、单面；顶点色 `Col` 是 0.45–1.00 的乘数（牙根最暗、牙尖略亮、朝前比背面亮、每颗牙有色差和竖向污渍条纹）。glTF 里是 `baseColorFactor × COLOR_0`，顶点色丢了也只会更暗。
- 游戏里放到 `(0, 2.035, -5.900)`：最前面 `z = -5.8707`，和原来程序化牙尖的 -5.871 几乎一样，不会更凸出裂缝；最宽 ±0.450，落在开口半宽约 0.46 之内；最上面的牙根 y = 2.261，离眼球下沿 2.333 还有 7 cm。
- 接入方式：先建 17 个程序化锥体，`teeth_v01.glb` 载入成功后再换掉，统一改用原来的 `toothMat`（`MeshBasicMaterial`、`fog:false`、`vertexColors:true`）；`teethRoot.scale.x` 的呼吸动画不变。载入失败保留程序化牙，页面 `<body data-teeth-model="glb|fallback">` 可以看走的是哪条路；`whenReady` 现在同时等眼睛、巨脸、牙三个 glb。
- 预览图 `docs/images/teeth_v01_turnaround.png` 是 2×3：上排是实际材质（正面 / 3/4 / 特写），下排是素模正面 / 3/4 和线框。素模正视图量到 502 × 254 px，换算 0.902 × 0.456 m（理论 0.900 × 0.452）。

验证：

```text
node _probe/teeth_asset.mjs   # glb 结构、尺寸、9/8 牙数、交错、笑弧、#4a2a20
node _probe/teeth.mjs         # 把 glb 真读进 createAnomaly(5)：位置、尺寸、材质、换掉程序化牙
node _probe/eyes.mjs          # 第 5 关 3b：牙数 17、不挡眼睛、咧嘴宽度
```

`teeth.mjs` 量到世界包围盒 `center = (-0.1073, 2.035, -5.900)`、
`size = (0.900, 0.4523, 0.0587)`，最前面 -5.8707，和两只眼睛中心对齐，
牙顶离眼球下沿还有 7.2 cm。

重建（先建模型再出图）：

```text
blender -b --factory-startup -P tools/build_teeth.py -P tools/render_teeth_sheet.py
```

## 第五关 · 裂缝周围的装饰模型（model_prompts 第六条）

`assets/models/crack_decor_v01.glb`（约 394 KB，6860 三角，1 个网格 + 根节点，内嵌 512² 细节贴图）按 `docs/model_prompts.md`「第五关 · 裂缝周围的装饰」搭的建模稿：L 形撕裂伤边缘，三层嵌套翻边，21 根触手、54 颗肉芽、13 条肉片、12 滴血滴、10 根组织细丝，中间留空。第二版加了 fbm 表面起伏、深 V 撕口、湿高光/环境闭塞、内切面肌纤维、触手环纹与扭转、肉芽成簇、悬挂血滴与细丝，再自己画了一张灰度血肉细节贴图（`assets/textures/crack_detail.png`）叠上去，观感更接近撕裂的肉。规格和接口细节见 `docs/crack_decor_v01_spec.md`。

- 局部原点在 L 形转角 = 世界 `(0, 3.09, -5.92)`；Blender 里墙臂沿 −Z 向下、天花板臂沿 −Y 伸进房间，导出后正面朝 +Z。整体 2.5027 × 3.1794 × 2.6680 m（宽 × 高 × 进房间）。
- 竖缝从地面到 3.15 m，开口最大 0.9842 m（眼睛高度 0.7245 m）；天花板臂从 z=−5.94 伸到 z=−3.34，正好 2.60 m，末端收尖。背墙/天花板面都在 7 cm 之外，没有穿模。
- 4 条翻边壳（前墙左右 + 天花板左右），18 点横截面：内唇卷起 6.2 cm、唇下凹槽、两道台坎；三层颜色分别是内圈近黑 `#1a0203`、中圈深红 `#4a060b`、外圈暗血红 `#6a0b10`，唇脊有一线湿高光。宽度沿路径在 0.21–0.46 m 之间鼓动，外缘带深 V 撕口，上表面有 fbm 起伏。
- 触手 21 根，长 0.275–0.595 m、直径 0.036–0.077 m，带环纹/扭转/钝圆尖端，根 `#1e0204` → 尖 `#8a0e14`；54 颗肉芽成簇贴内唇和外半圈；13 条肉片从外缘撕出来；12 滴血滴和 10 根细丝挂在唇边下垂。全部 join 成 1 个 mesh，113 个连通岛，非流形边/边界边/孤立点都是 0。
- 顶点色是**绝对线性颜色**（`COLOR_0` VEC3 float），R ∈ [0.00004, 0.2507]，G/B ≤ 0.00749；另带一张 sRGB 灰度细节贴图（斑驳/肌纤维/血点，可平铺，内嵌 glb）。材质 Roughness 1.0、Metallic 0、单面、无扩展。游戏里换成 `MeshBasicMaterial({color:0xffffff, map:细节贴图, vertexColors:true, side:DoubleSide, fog:false, toneMapped:false})`，`贴图 × 顶点色` 就是最终颜色。
- 接入方式：程序化翻边/触手/肉芽先挂在 `crack-decor-procedural` 组里做回退；`crack_decor_v01.glb` 载入成功后整组换掉，**不动**深渊、背板、天花板封口、黑脸、眼睛和牙。`<body data-crackDecor="glb|fallback">` 可以看走的是哪条路；`whenReady` 现在同时等四个 glb。
- 拍照仍然只认眼睛命中球；用真 glb 复测过：从 `(0,1.62,2.0)` 瞄眼睛能命中，瞄墙面和站远处都拍不到。
- 预览图 `docs/images/crack_decor_v01_turnaround.png` 是 2×3：上排实际材质（正面 / 3/4 全景 / 翻边特写），下排素模正面 / 素模 3/4 / 线框。3/4 里的墙和天花板是**预览临时平面**，不在 glb 里。

验证：

```text
node _probe/crack_decor_asset.mjs   # glb 结构、L 尺寸、洞心、三层色、21 根触手、<8000 三角
node _probe/crack_decor.mjs         # 真读进 createAnomaly(5)：位置、材质、换掉程序化组、拍照判定
node _probe/teeth.mjs               # 牙的回归
node _probe/eyes.mjs                # 第 5 关结构回归（故意 404，量程序化回退）
```

`crack_decor.mjs` 量到世界包围盒 `min = (-1.1898, -0.0266, -5.9828)`、`max = (1.3129, 3.1528, -3.3148)`，翻边没有碰到眼睛包围盒；资产里近黑/深红/暗血红顶点分别占 28.8% / 28.7% / 22.7%。四个 probe 全过。

重建（先建模型再出图）：

```text
blender -b --factory-startup -P tools/build_crack_decor.py
blender -b --factory-startup -P tools/build_crack_decor.py -P tools/render_crack_decor_sheet.py
```

## 教室随机痕迹（第二轮新增）

`src/team/m1.js` 的 `createSceneExtra` 会在桌面、地面、墙面上撒一层很淡的痕迹：地面和桌面是污渍，墙面是抓痕和手印。共 30 处，用 4 个 `InstancedMesh` 合批，只有 4 个 draw call。

不干扰异常判定的四条约束：

- 全部打 `userData.noRay`，拍照射线直接跳过，永远不会挡住异常；
- 不写文字、不画脸和眼睛，避免和第 2 关黑板、第 3 关窗帘脸抢注意力；
- 与 5 个异常锚点、5 处拍照站位都保持安全距离（异常 1.6～2.2 m，站位 1.3 m）；
- 黑板所在的右墙 `|z| < 3.0` 整段留白。

随机数用固定种子 `20251031`，每次布局一致，便于复现和录演示；想换一批痕迹可加参数：

```text
http://127.0.0.1:5173/?decorSeed=777
```

当前生成数量可以在页面上检查：`<body data-decor="30">`。

## 第三轮：异常细化与视角手感

**第 2 关黑板**改成只有一行字。九个字逐个歪着画，每个字有独立的字号、旋转和位移，笔画描三遍做出毛边；文字下面压了一层暗红晕，再叠 15 处长短不一的血滴、3 道拖到底部的长痕和 40 个溅点。原来的第二行重复文字和下方计数划痕已经删掉。

**第 3 关窗帘脸**重做：三块不等大的球叠出不对称头壳；左眼半闭、右眼瞪大，瞳孔朝不同方向；眉骨两道不等长不等角度；嘴由五段错开的破口组成，嘴角往右下烂开，卡着六颗大小不一的牙；脸颊和额头有软边霉斑（贴图带穿孔）、两处破洞、干裂布纹和四根顶住布面的指尖。布料用了程序生成的霉斑贴图，在灯闪时嘴巴张开、瞳孔缩放。

**视角卡顿与瞬移**修了三处：

- `main.js` 增加 `renderer.compile(scene, camera)` 预编译。材质第一次进入视锥才编译着色器，转视角时正好撞上这个开销；现在场景一变化（模型加载完成、新异常生成）就提前编译。
- `player.js` 对单次 `movementX/Y` 截断到 ±140 像素，并在 `pointerlockchange` 时清空残留增量。锁定切换或丢帧后浏览器会补发一大段位移，直接累加就是"甩视角"。
- 走廊顶灯从每 5 米一盏改成每 10 米一盏。原来 106 米走廊有 20 盏点光源，而雾的可见距离只有十几米；片元光照循环少一半，近处观感几乎不变。

## 开发用检查页

`dev/anomaly-smoke.html`：不启动游戏，直接构造并更新五关异常，把结果写进 `<body data-smoke>`。用来在浏览器里抓运行时错误。

`dev/visual-preview.html`：并排渲染第 2 关黑板贴图和第 3 关窗帘脸的单帧特写，用来肉眼检查视觉效果。

`dev/glb-probe.html`：单独加载家具 GLB，用纯环境光渲染并读回像素值，用来确认材质颜色是否真的生效。

```text
http://127.0.0.1:5173/dev/anomaly-smoke.html
http://127.0.0.1:5173/dev/visual-preview.html
http://127.0.0.1:5173/dev/glb-probe.html
```

## 第四轮：视角手感、窗户、家具

**视角瞬移**查下来是两件事叠加：

- HUD 每帧无条件写 4 处文本和 `style.opacity`，等于每帧让覆盖层重排一次。`hud.js` 加了写值缓存，只有内容真的变了才碰 DOM。
- 鼠标增量是"整帧累加后一次吃光"。现在单事件截断 ±140 px、单帧累计封顶 ±200 px，并按 `CONFIG.lookSmoothing`（默认 55）指数收敛：即使某帧卡住，位移也会分摊到后面几帧，而不是瞬间甩到位。

**窗户**重做成四格窗：外框四条、中竖梃、上横档、窗台、插销。第 2 和第 5 扇是破的——用锯齿形黑片当缺口（外面本来就是黑的），从缺口向外爬五条裂纹，还挂着三块碎玻璃；这两扇的右半幅窗帘也只剩一条贴着窗框的撕裂短帘。

**家具**增加了随机偏差：每套桌椅有自己的位移和角度，四套被明显搬歪（最大 17°），四把椅子被转过去或拖开。第一关异常坐的那套桌椅保持原位。

**配色**修了一个长期存在的 bug：glTF 的 `baseColorFactor` 是线性空间，之前按 sRGB 值写入，导致木头比预期亮一倍多；现在按线性值填写，配合 `config.js` 把曝光 0.86、环境光 0.30、顶灯 22 调回可读但阴暗的水平。

**新增装饰**：天花板垂下 6 条破布、地面 9 张踩脏的作业纸，地板污渍/桌面污渍/墙面抓痕/手印保持原有 30 处，合计 45 处，仍然全部 `noRay` 且避开异常锚点。数量可以在 `<body data-decor="45">` 里看。

### 这一轮修掉的一个隐蔽 bug

家具长期发白，最后定位到生成器：6 个材质网格全部引用**同一份**全局 accessor，等于每个网格都画整套家具，最后由浅色的 Chalk 网格覆盖一切。改成每种材质独立 accessor 后颜色才正确。`dev/glb-probe.html` 就是当时用来隔离这个问题的。

加载状态可以直接在页面上检查：模型走 GLB 时 `<body data-classroom-model="glb">`，回退时是 `fallback`。

调试碰撞体积：

```text
http://127.0.0.1:5173/?debug
```

在右上角开启碰撞框后，应检查墙、门、桌椅和教师桌的绿色水平碰撞盒。原始程序化版本保存在 Git 分支 `original-game`，新接入版本保存在 `feat/m1-classroom-glb-collision`。

重新生成家具模型：

```powershell
python generate_furniture_glb.py
```


- `server.js`：本地静态服务器，保证 ES Module 能加载
- [Three.js r170](https://threejs.org/)：`vendor/three.module.js`，MIT
- [lil-gui 0.20](https://lil-gui.georgealways.com/)：`vendor/lil-gui.esm.js`，只在 `?debug` 时加载，MIT

游戏运行时不连接远程服务，也不调用 AI。

## 已知限制

- 只有一间教室和一条循环走廊，五处异常都叠在这间教室里
- 碰撞是水平方向的盒子，没有跳跃，也没有完整刚体物理。瓶子和书能被推开，但不会挡住拍照
- 演示为了能在一分钟内看完，只拍第一处异常，然后直接进入终局。自己玩会走完五处
- 没有触屏操作
- 终局必须按住 `Shift`。只走路会被那双眼睛追上

## AI 使用说明

脚手架、Three.js 场景、状态机、合成音效和演示模式是在 Cursor 里用 Grok 4.7 生成的。小组提交前请自己跑一遍操作、拍照、静音、演示和重开，再决定哪些改动留下。报告 `W05_GroupID.md` 里的试玩记录、迭代记录和学习总结不要用 AI 代写。

# 错层 Wrong Floor

浏览器里的第一人称 3D 短篇。教室会一轮轮多出一件不该存在的东西。对准它按 `E` 拍下来，门才会开。第五扇门之后，先看清那双眼睛，再冲向绿色 `EXIT`。

## Run

需要 Node.js 18 或更高。Three.js 和 lil-gui 已经放在 `vendor/`，不用再装依赖。

```bash
cd w05_3d_game
node server.js
```

也可以 `npm run dev`。打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。请用桌面版 Chrome 或 Edge。不要直接双击 `index.html`，浏览器会拦住模块脚本。

## Controls

| 操作 | 作用 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 环顾。若浏览器不允许锁定指针，按住左键拖动，或用方向键 |
| `Shift` | 冲刺。终局不冲刺会被追上 |
| `E` 或 鼠标左键 | 拾起相机 / 拍照 |
| `M` | 静音 |
| `Esc` | 暂停。演示中会直接退出 |

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
├── index.html          入口：canvas、HUD、菜单
├── styles/main.css     菜单、HUD、结算
├── src/
│   ├── main.js         渲染器、循环、调试入口
│   ├── game.js         状态机：menu → playing → win / lose
│   ├── player.js       移动、输入、相机
│   ├── level.js        教室、走廊、门、追逐实体
│   ├── anomalies.js    五关异常
│   ├── hud.js          进度、计时、提示
│   ├── audio.js        Web Audio 音效
│   ├── demo.js         演示模式
│   ├── collision.js    碰撞
│   ├── layout.js       场景尺寸
│   ├── config.js       手感
│   └── debug.js        lil-gui
└── assets/             预留给以后的 glb、贴图、音频
```

场景现在用程序化几何体。把模型放进 `assets/models/` 后，可以在 `level.js` 里按同样的位置换上去。

## 工具

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

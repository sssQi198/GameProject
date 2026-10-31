# 发布包 — WrongFloor r4

`WrongFloor-r4-windows-look.zip` 是当前 `main` 分支（`c711b20`）的完整可运行游戏。

| 项 | 值 |
| --- | --- |
| 文件 | `WrongFloor-r4-windows-look.zip` |
| 大小 | 473,713 字节 |
| SHA-256 | `F1D1859EA99CE720E96202E80C981C0F8E89242E3F970CB9798522D76832CA1F` |
| 解压后 | 41 个文件，约 2.24 MB |
| 对应提交 | `c711b20` |
| 对应标签 | `snapshot-r4-windows-look` |

## 解压后怎么跑

压缩包内只有一个顶层目录 `w05_3d_game/`。

```powershell
Expand-Archive .\WrongFloor-r4-windows-look.zip -DestinationPath .
cd .\w05_3d_game
node server.js
```

Windows 也可以直接双击 `w05_3d_game\start.bat`，它会自己找 Node 并打开浏览器。

然后访问 <http://127.0.0.1:5173/>。

要求 Node.js 18 或更高。Three.js 已经放在 `vendor/`，不需要 `npm install`。

**不要直接双击 `index.html`**：`file://` 下浏览器会拦住 ES Module，页面只能看到提示。

## 操作

| 按键 | 作用 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 环顾（锁不住指针时按住左键拖动，或用方向键） |
| `Shift` | 冲刺 |
| `E` | 拾起 / 拿出 / 收起相机 |
| `F` | 拍摄 |
| `M` | 静音 |
| `Esc` | 暂停（演示中直接退出） |

标题页有 `Start` 和 `Watch Demo`；`Watch Demo` 会用真实碰撞和拍照跑一段自动流程，不是录像。

## 包内结构

```text
w05_3d_game/
├── index.html
├── server.js            本地静态服务器（ES Module 需要 http 才能加载）
├── start.bat            Windows 双击启动
├── README.md            详细说明与迭代记录
├── styles/main.css
├── src/                 游戏逻辑（main / game / level / player / anomalies / team ...）
├── assets/models/classroom_m1_v01.glb   教室家具模型
├── utils/BufferGeometryUtils.js         GLTFLoader 的本地依赖
├── vendor/three.module.js               Three.js r170
├── vendor/GLTFLoader.js                 已改为本地相对导入
├── vendor/lil-gui.esm.js                只在 ?debug 下加载
└── dev/                 冒烟测试与可视化检查页
```

## 自检

启动后可以在页面源码里看到三个标记：

```text
<body data-classroom-model="glb"       模型走 GLB，不是回退
      data-decor="45"                  45 处随机痕迹
      data-furniture-hidden="51/51">   旧程序化家具全部隐藏
```

开发检查页：

```text
http://127.0.0.1:5173/dev/anomaly-smoke.html    五关异常构造与更新测试
http://127.0.0.1:5173/dev/visual-preview.html   黑板贴图 / 窗帘脸特写
http://127.0.0.1:5173/dev/glb-probe.html        家具材质像素探测
```

## 已知限制

- 只有一间教室和一条循环走廊，五处异常都叠在这间教室里。
- 碰撞是水平方向的盒子，没有跳跃，也没有完整刚体物理。
- 演示为了控制时长，只拍第一处异常就直接进终局；自己玩会走完五处。
- 没有触屏操作。
- 终局必须按住 `Shift`。
- 家具模型坐标按 `src/layout.js` 的课桌数组硬编码，改课桌排布必须重跑 `generate_furniture_glb.py`。

## 这份包不是什么

它是 `w05_3d_game/` 的完整拷贝，`dist/README.md` 和压缩包本身不在压缩包内。课程报告、试玩记录、视频都不在这里，按 `Week_05_Group_Assignment.md` 单独提交。

# 错层 Wrong Floor

半夜的教学楼，一间会重复自己的教室。对准教室里不该存在的东西按下快门，门才会开；第五扇门之后，先看清那双眼睛，再跑。

- **可玩地址（GitHub Pages）**：<https://sssqi198.github.io/GameProject/>
  - 需要仓库 `Settings → Pages` 里把 Source 设为 `Deploy from a branch`，分支 `main`、目录 `/`。
  - 根目录的 `index.html` 会跳到 `w05_3d_game/`；游戏内的资源路径由 `w05_3d_game/src/asset-url.js` 按页面目录解析，因此子路径部署也能正确加载模型和贴图。
- **源码**：[`w05_3d_game`](w05_3d_game/)
- **设计与课程文档**：[`w05_3d_game/docs`](w05_3d_game/docs/)
- **探针、旧发布包、备份、做图中间文件**：[`_多余`](_多余/)，游戏运行不读取。

## 操作

| 操作 | 作用 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 环顾（指针锁不住时按住左键拖动，或用方向键） |
| `Shift` | 冲刺（终局必须按住） |
| `E` | 拾起 / 拿出 / 收起相机 |
| `F` | 拍摄 |
| `M` | 静音 |
| `Esc` | 暂停；演示中直接退出 |

标题画面有 **Start** 和 **Watch Demo**。Demo 用真实碰撞和拍照跑一段缩短流程，不是录像。

## 本地运行

需要 Node.js 18 或更高。Three.js 已随仓库放在 `w05_3d_game/vendor/`，不需要 `npm install`。

```bash
cd w05_3d_game
node server.js
```

然后打开 <http://127.0.0.1:5173>。Windows 也可以直接双击 `w05_3d_game/start.bat`。

不要直接双击 `index.html`：`file://` 下浏览器会拦住 ES Module，页面只能看到提示。

## 发布

1. `Settings → Pages → Build and deployment`
2. Source: `Deploy from a branch`
3. Branch: `main`，目录: / (root)
4. <https://sssqi198.github.io/GameProject/> 已经过测试可以运行

发布要点：

- 游戏是纯静态的（HTML/CSS/ES Module + Three.js），Pages 可以直接托管，不需要后端。
- 所有资源都走 `asset()`，以「当前页面目录」为根，所以放在 `/w05_3d_game/` 子路径下不会 404；`index.html` 里的 `./styles/…`、`./assets/…` 也是相对路径。
- 服务器在 `.glb` 之外还按扩展名设置 MIME；Pages 自带常见类型，`model/gltf-binary` 缺失时 GLTFLoader 仍能按二进制解析，但如遇到加载失败，请核对 Network 面板里的响应体是否是模型本身而不是 404 页面。

## 已知限制

- 只有一间教室和一条循环走廊，五处异常都叠在这间教室里。
- 碰撞是水平方向的盒子，没有跳跃，也没有完整刚体物理。
- Demo 为控制时长只拍第一处异常就直接进终局；自己玩会走完五处。
- 没有触屏操作；建议桌面版 Chrome / Edge。
- 终局必须按住 `Shift`，只走路会被追上。

## 素材与 AI 说明

- Three.js r170（`vendor/three.module.js`，MIT）、lil-gui 0.20（`vendor/lil-gui.esm.js`，MIT，只在 `?debug` 下加载）。
- 模型、贴图与音效的来源、许可和生成方式见 [`w05_3d_game/README.md`](w05_3d_game/README.md) 与 [`w05_3d_game/docs`](w05_3d_game/docs/)。
- 脚手架、部分场景与道具由 AI 辅助生成，逐项记录在同一份文档里；游戏运行时不连接远程服务、不调用 AI。

## Contributors

> **NO AI**：每位成员自己写这一行（姓名/公开 handle、实际负责的部分）。下面的表头只是格式，内容待填。

| 成员 | 负责内容 |
| --- | --- |
| `@sssQi198` | 贴图和模型优化，物件碰撞逻辑，窗帘运动逻辑，灯光细节，第二关山羊头设计|
| `@xiaoba084` | 相机系统：抬/放动画、取景框外不透明机身、终局自动收起<br>第五关：血肉教室、裂缝之眼、黑色巨脸与尖牙<br>序章与同学模型、行走动画<br>音频：追逐伴奏换实录 MP3、音量曲线<br>ui:开发者模式 |
| `@FenggangHuang` | 背景音乐<br>底层规则<br>UI 设计<br>Esc 界面设计<br>灵敏度调试 |
| `@windymaker` | _本人填写_ |
| `@BZXHG` | _本人填写_ |

## CI/CD 探索

> **NO AI**：由小组成员亲自查看 Actions 后记录，不要用 AI 代写。内容待填。

- 查看的部署 / 提交：
- 触发方式与步骤：
- 自动 / 手动环节：
- 实际跑过的检查：
- 发现缺少的一项检查：

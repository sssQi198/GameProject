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

- **内容范围**：游戏围绕同一间教室和一条循环走廊展开，在前四关中异常会在同一间教室中逐步出现，第五关撤掉前面的异常后再引入新异常，并非五张独立地图。
- **演示范围**：Watch Demo 是缩短版流程，只拍摄第一处异常后便进入终局；体验全部五处异常需要选择 Start 正常游玩。
- **移动限制**：玩家不能跳跃；移动时使用简化的碰撞范围，而不是完全贴合模型外形的碰撞。
- **操作与兼容性**：没有触屏操作，需使用键盘和鼠标；建议使用桌面版 Chrome 或 Edge。
- **追逐要求**：终局追逐需要按住 Shift 冲刺，仅以步行速度移动会被追上。

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
| `@windymaker` | 教室座椅的建模与材质优化，异常的优化与材质更换，异常卡顿的debug，结尾的故事性加强与追逐优化|
| `@BZXHG` | 座位人影、黑板文字、窗帘脸、第二台相机与鞋印、门缝眼睛，终局实体的红眼、黑暗罩和微弱红光。终局追逐反馈：怪物初始位置后移约一秒追逐距离、音乐随接近增强、屏幕红色遮罩随接近增强。 |

## CI/CD 探索

> **NO AI**：由小组成员亲自查看 Actions 后记录，不要用 AI 代写。

- **查看的部署 / 提交**：Actions run #6（<https://github.com/sssQi198/GameProject/actions/runs/45758724226>），对应 commit `ed8ea514efa07a99a2cd6db404ca61c058a29959`（"Update README.md"，@windymaker，2026-11-26 13:00，只改了一行 README）。
- **触发方式与步骤**：@windymaker 把这次改动 push 到 `main` 后，GitHub 自动触发 `pages build and deployment`。共 3 个 job：`build` 只做 Set up → Checkout → Upload artifact；`report-build-status` 只把状态回报到界面；`deploy` 执行 Deploy to GitHub Pages。从触发（05:00:15Z）到部署完成（05:00:41Z）共 26 秒，结果 success。
- **自动 / 手动环节**：自动的是打包成 artifact、上传、部署、刷新线上文件，这 26 秒里没有人操作。手动的是最初在 `Settings → Pages` 选 `Deploy from a branch` / `main` / `/`、提交 `.nojekyll`，以及每次改动仍然要人写 commit、开 PR、点 merge。仓库里没有 `.github/workflows/`，这条 workflow 由 GitHub 生成，不能改也不能加步骤。**所以这套流程是「自动搬运 + 人工把关」：CI 只负责把 `main` 上的文件原样搬到站点，能不能合并、要不要上线，全靠人和评审。**
- **实际跑过的检查**：严格说只有两条 —— Checkout 能读到这棵树、artifact 能完整打包上传。`report-build-status` 只回报成功/失败，不校验内容。没有任何一步碰过游戏本身：**它保证的是「文件搬得动」，不是「游戏跑得起来」——一个写坏的 `index.html`、一条指错的贴图路径，同样能拿到绿色对勾。**
- **发现缺少的一项检查**：缺一条部署后的冒烟测试 —— 用无头浏览器打开 <https://sssqi198.github.io/GameProject/w05_3d_game/>，断言 THREE 初始化成功、console 无 error、关键 `.glb` 请求不是 4xx。**这不是空谈：PR #9 就是同一个缺口的实例——`w05_3d_game/src/anomalies.js:471` 的山羊头用了域名根绝对路径 `/assets/models/goat_head_v01.glb`，部署到 `/GameProject/` 子路径后必然 404，第 2 关的模型悄悄退化成 fallback，而合并前后的 Pages 部署一路是 success、没有任何告警；这个回归是人用无头 Edge + CDP 手工对比修前修后（`dataset.goatHeadModel` 从 `fallback` 变 `glb`）才发现的。若 CI 里有一条断言 `.glb` 请求不是 4xx 的冒烟测试，它在合并前就会被拦住。**

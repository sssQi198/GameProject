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

> **NO AI**：由小组成员亲自查看 Actions 后记录，不要用 AI 代写。内容待填。

- **查看的部署 / 提交**：`pages build and deployment` 的第一次运行（run [#45611786512](https://github.com/sssQi198/GameProject/actions/runs/45611786512)），源提交 `c1188ae`，即 PR #8 合并进 `main` 的那个提交；对应部署记录 #8057119362，环境 `github-pages`。
- **触发方式与步骤**：合并 PR #8 后 `main` 收到 push，GitHub Pages 自动生成的内部工作流被触发（事件类型显示为 `dynamic`，仓库里没有自己写的 workflow 文件）。三个 job：`build`（Checkout → Upload artifact）→ `report-build-status` → `deploy`（Deploy to GitHub Pages），从 12:14:00Z 到 12:14:36Z，约 36 秒。
- **结果**：三个 job 全部 success，部署状态 `success`，站点 <https://sssqi198.github.io/GameProject/> 上线。发布内容就是该提交的仓库根目录：`index.html`（跳转到 `w05_3d_game/`）、`README.md`、`W07_TASKS.md`、`.nojekyll`、`_多余/`、`w05_3d_game/`。
- **自动 / 手动环节**：手动只有两件事——在 Settings → Pages 把 Source 设为 `Deploy from a branch`、`main` / `/ (root)`（接口里 `build_type` 至今仍是 `legacy`），以及合并那个 PR。此后的打包、上传 artifact、发布、回写部署状态全自动；本地没有构建步骤，`node server.js` 只用于本地预览，发布不经过它。
- **实际跑过的检查**：**没有内容层面的检查**。仓库里没有 `.github/workflows` 目录，`w05_3d_game/package.json` 也只有 `dev` / `start` 两个脚本，所以那次运行实际只做了 Checkout 和 Upload artifact，等于「能打包就发布」。唯一接近检查的是 `report-build-status`，外加一条 `actions/upload-artifact@v4` 的 Node.js 20 弃用告警。
- **发现缺少的一项检查**：部署前缺一个冒烟检查——用无头浏览器打开 `w05_3d_game/index.html`，断言标题画面渲染出来、控制台没有 404 或 JS 报错。部署成功只证明文件传上去了：这次首发连 `_多余/`（探针脚本、`_tmp/audiodl/aargh.zip` 等调试文件）都原样公开，今天实测 `/_多余/开发临时文件/_tmp/audiodl/aargh.zip` 仍返回 200，说明「发布成功」和「游戏真能玩、发出去的东西是干净的」是两件事。

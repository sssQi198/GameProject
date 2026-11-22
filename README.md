# 错层 Wrong Floor

浏览器里的第一人称 3D 短篇恐怖游戏。教室里每进一次就多出一件不该存在的东西，对准它按下快门，门才会开；第五扇门之后，先看清那双眼睛，再跑。

纯前端：HTML + CSS + JavaScript + Three.js，无后端、无账号、初始加载后不依赖任何在线服务。

## 玩法与操作

- **目标**：在五间「同一个教室」里找出并拍下五处异常，然后从终局追逐里活下来。
- **核心循环**：观察 → 找到异常 → 按 `E` 拿出相机 → 对准 → 按 `F` 拍摄 → `记录 n/5` 加一、门打开 → 进入下一轮。
**操作**

| 按键 | 作用 |
| --- | --- |
| `WASD` | 移动 |
| 鼠标 | 环顾（浏览器不允许锁定指针时，按住左键拖动或用方向键） |
| `Shift` | 冲刺；终局不冲刺会被追上 |
| `E` | 拿出 / 收起相机 |
| `F` | 拍摄（需先拿出相机） |
| `M` | 静音 |
| `Esc` | 暂停（演示中直接退出） |

- **暂停与重开**：`Esc` 打开暂停面板，可「再挣扎一次」或「重新开始」。
- **演示模式**：标题画面上的 **Watch Demo / 观看演示** 会用游戏自己的碰撞、拍照和追逐跑一段缩短流程，不是播录像；中途 `Esc` 或 **Exit Demo** 回到标题，再按 **Start** 就是正常玩。
- **建议环境**：桌面版 Chrome 或 Edge，窗口 1280×720 以上。

## 立刻在线玩

<!-- TODO-W07 T1 在线玩地址：谁认领谁填。要写：站点 URL + 一句「不用登录，点开就能玩」。
     证据：自己退出 GitHub 登录、用干净窗口打开一次，能进标题画面并点到 Start。
     AI ALLOWED（事实陈述），但地址必须是真实发布会话里的那个，不要写没验证过的。认领见 W07_TASKS.md。 -->

**https://sssqi198.github.io/GameProject/** ← 待确认：Pages 开启并部署成功后，把这一行改成确认过的地址，并删掉「待确认」。

## 本地运行

需要 Node.js 18 或更高。Three.js 和 lil-gui 已经放在 `vendor/`，不用 `npm install`。

```bash
cd w05_3d_game
node server.js
# 打开 http://127.0.0.1:5173
```

Windows 上也可以直接双击 `w05_3d_game/start.bat`：它优先用 `node server.js --open`，
检测不到 Node 18 时会自动改用 `serve.ps1`（Windows PowerShell 5.1 自带的服务器，不需要装 Node）并打开浏览器。

**不要直接双击 `w05_3d_game/index.html`**：地址栏变成 `C:/…` 或 `file://` 时浏览器会拦住 ES module，标题画面能看到，但按钮点了没反应。

## 发布到 GitHub Pages

<!-- TODO-W07 T2 发布步骤：publisher 做这一步，也写这一步。要写：真实操作过的步骤 + 站点路径 + 为什么游戏能挂在子路径下。
     证据：Settings → Pages 的实际选项、Actions 里那次运行、以及 /w05_3d_game/ 子路径下资源正常加载。
     AI ALLOWED。写完把自己实际点的选项和这里对一遍，不一致就以实际为准。 -->

这是纯静态站点，不需要构建，**直接从 `main` 根目录发布**：

1. 仓库 **Settings → Pages**，Source 选 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`，Save。
2. 第一次保存后 GitHub 会自动跑一次 `pages build and deployment`（在 **Actions** 里能看到），跑完站点地址是 `https://sssqi198.github.io/GameProject/`。
3. 根目录的 `index.html` 是入口落地页，游戏本体在 `w05_3d_game/`，所以游戏地址是 `https://sssqi198.github.io/GameProject/w05_3d_game/`。
4. 根目录有 `.nojekyll`，让 Pages 跳过 Jekyll 处理，静态文件原样发布。
5. 之后的每次推送 `main` 都会自动重新发布，不需要手动上传。

<待确认：以上第 1、2 步请 publisher 用实际操作为准核对一遍，把不一致的地方改掉。>

## 已知限制

<!-- TODO-W07 T3 已知限制：谁认领谁填。要写：4–6 条玩家能感觉到的、你自己遇到过的限制，每条一句话。
     素材：w05_3d_game/README.md 的「已知限制」一节，但要用玩家语言重写，不要整段搬。
     AI ALLOWED，事实要自己在浏览器里对上。认领见 W07_TASKS.md。 -->

- <待填：例如「低配集显在第五关会掉帧」——写你实际遇到的>
- <待填>
- <待填>
- <待填>

更多细节见 [w05_3d_game/README.md](w05_3d_game/README.md)。

## 素材与 AI 署名

<!-- TODO-W07 T4 素材与 AI 署名：谁认领谁填。要写三块：① 外部模型/贴图/音频的来源与许可；
     ② AI 参与了哪些部分；③ 哪些部分明确不是 AI 做的。
     素材：w05_3d_game/assets/audio/CREDITS.md、w05_3d_game/docs/model_prompts.md、以及各组员的实际记录。
     AI ALLOWED；不许把没核对过的许可写成已核对。认领见 W07_TASKS.md。 -->

- **3D 模型**：<待填：由谁、用什么工具、按哪些提示词生成；文件在 `w05_3d_game/assets/models/`>
- **贴图 / 图片**：<待填>
- **音频**：<待填：CC0 来源逐条列在 `w05_3d_game/assets/audio/CREDITS.md`；程序化合成的部分注明是代码实时生成>
- **AI 参与**：<待填：哪些模块、哪些环节用到 AI，谁验收的>
- **不是 AI 做的**：<待填：试玩、改进记录、学习总结等>

## Contributors

<!-- TODO-W07 T5 Contributors：NO AI。每人只改自己那一行，写自己实际做的工作，不要替别人写、不要用 AI 生成/翻译/润色。
     署名用大家同意的 handle 或姓名，**不要写学号**（学号只进私有报告）。
     如果和别人的改动撞在同一行，先 pull 最新 main 再改。认领见 W07_TASKS.md。 -->

| 成员 | 我实际做了什么 |
| --- | --- |
| `@sssQi198` | <待填：本人写> |
| `@xiaoba084` | <待填：本人写> |
| `@FenggangHuang` | <待填：本人写> |
| `@windymaker` | <待填：本人写> |
| `@zxh` | <待填：本人写> |

## CI/CD 探查记录

<!-- TODO-W07 T6 CI/CD 探查：NO AI。只记录你在 GitHub 上真实看到的东西，不要 AI 代写。
     可以看 Actions 里第一次（或任意一次）pages build and deployment 运行，也可以看别的主机的日志。
     六个字段必须都能对上证据；「缺的一个检查」写真实缺口，不需要真的去实现或故意弄失败。 -->

- **我看了哪一次部署**：<run 链接或编号>，对应源提交：<sha>
- **触发方式**：<推送到 main / 手动 Run workflow / 其他>
- **自动执行的步骤**：<例如：检出 → 生成站点 → 上传产物 → 部署>
- **需要人手动做的步骤**：<例如：无，或某次手动改设置>
- **这次运行里实际跑过的检查**：<没有就跑过什么写什么>
- **我认为缺的一个检查**：<一句话 + 为什么它会漏掉问题>
- **结果**：<成功 / 失败；发布出的文件或站点链接>

## 仓库结构

| 路径 | 做什么 |
| --- | --- |
| `index.html` | 在线试玩入口页（Pages 首页） |
| `w05_3d_game/` | 游戏本体。入口 `w05_3d_game/index.html` |
| `w05_3d_game/src/` | 游戏逻辑：主循环、关卡、异常、音频、演示模式 |
| `w05_3d_game/assets/` | 模型、贴图、音频 |
| `w05_3d_game/vendor/` | Three.js 与 lil-gui（已内置，无需安装） |
| `w05_3d_game/README.md` | 详细操作、开发记录、已知限制 |
| `W07_TASKS.md` | 本周文档任务板与协作流程 |
| `w05_3d_game/docs/04_错层_Wrong_Floor.md` | 设计文档 |
| `w05_3d_game/docs/Week_05_Group_Assignment.md` | 上周的课程要求（保留作依据） |
| `_多余/` | 探针、旧发布包、备份和做图中间文件。游戏运行不读这些文件 |

## 一起改

流程是 fork → 分支 → 改 → PR → 队友评审 → 合并 → 同步：

1. 非 publisher 先 **Fork** 团队仓库，再 clone 自己的 fork；publisher 直接在团队仓库开分支。
2. 从 `main` 拉一个新分支，例如 `docs/t3-known-limits`。
3. 只改自己认领的那一段，改完在本地 `node server.js` 点一遍相关流程。
4. 提交、推送，然后向**团队仓库 `main`** 开 PR，写清问题、改动和验证方式。
5. 找一位队友评审；评审要指名行号或检查项，给出发现或问题。
6. publisher 合并后，所有人把 fork 同步到最新 `main`，本地切回 `main` 拉取，再打开线上站点验一遍。

具体任务、认领表和评审顺序见 [W07_TASKS.md](W07_TASKS.md)。

不要提交 `.env`、密码、token、`node_modules/`，也不要把学号、私有报告放进仓库。

## 作业提醒

本周（W07）的交付是：这个仓库的可玩站点 + 上面的文档改动 + 团队协作记录。私有报告 `W07_NULL5.md` 单独提交，不进仓库。上周（W05）的源码、试玩记录和视频按 W05 要求另交。

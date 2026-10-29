# 错层 Wrong Floor

Week 05 小组作业：浏览器里的第一人称 3D 短篇。教室每进一次多一处不该存在的东西，拍下来才能出门。第五扇门之后，先看见那双眼睛，再跑向绿色 EXIT。

这个仓库是整份 `GameProject`：设计文档、作业说明，以及已经能玩的原型。

## 先跑起来

需要 Node.js 18 或更高。Three.js 已经放在仓库里，不用 `npm install`。

```bash
cd w05_3d_game
node server.js
```

打开 http://127.0.0.1:5173 。操作、演示模式和已知限制写在 [w05_3d_game/README.md](w05_3d_game/README.md)。

## 仓库里有什么

| 路径 | 做什么 |
| --- | --- |
| `04_错层_Wrong_Floor.md` | 玩法、异常、分工。改设计先改这里 |
| `Week_05_Group_Assignment.md` | 课程要求。交作业前对照一遍 |
| `w05_3d_game/` | 可玩原型。入口是 `index.html` |
| `w05_3d_game/src/layout.js` | 教室、走廊、异常坐标。改场景先改这个文件 |
| `w05_3d_game/src/config.js` | 速度、雾、灯光。`?debug` 面板改的就是这些 |
| `w05_3d_game/assets/` | 以后放 glb、贴图、音频。现在可以空着 |

现在的原型用程序化几何体就能玩通：菜单、五关拍照、走廊循环、终局追逐、尾声、Watch Demo、静音。模型和手感还可以换，不要推倒重写。

## 用 AI 接着做

用 Cursor、AILab 或其他你们组能打开这个仓库的编程助手。把下面这段贴进第一次对话，再写你自己的任务。

```text
仓库是《错层》Wrong Floor，浏览器 3D 游戏，技术栈只许 HTML、CSS、JavaScript、Three.js。
先读 README.md、04_错层_Wrong_Floor.md、w05_3d_game/README.md。
场景尺寸以 w05_3d_game/src/layout.js 为准，手感以 src/config.js 为准。
不要重写已经能玩的主循环。改完在 w05_3d_game 里运行 node server.js，用浏览器点一遍。
游戏运行时不能依赖远程 AI、账号或后端。
不要代写 W05_GroupID.md 里的试玩记录、迭代记录和学习总结，那些必须人写。
```

然后只派一件具体的事，例如「把第 3 关窗帘脸做得更清楚，拍得到，旧异常还留着」。

## 五人接口

设计文档第 11 节的分工对应 `w05_3d_game/src/team/`。每人主要改自己的那个文件。主循环已经会调用这些接口，不用先改 `game.js` 才能挂上自己的内容。

| 代号 | 只改这个文件 | 能换什么 |
| --- | --- | --- |
| P1 逻辑与界面 | `src/team/p1.js` | 关卡提示、拍照成功句、菜单和胜负文案 |
| P2 移动与镜头 | `src/team/p2.js` | 终局看向眼睛的时长，镜头拧过去的快慢 |
| P3 杂物、灯、窗帘 | `src/team/p3.js` | 灯闪节奏、额外可推杂物、窗帘摆动 |
| M1 场景 | `src/team/m1.js` | 追加碰撞盒，或加一组自己的场景网格 |
| M2 人物与异常 | `src/team/m2.js` | 替换某一关异常、同学、那双眼睛 |

三个人都会碰到的约定在 `src/team/contract.js`：

- 能被拍到：`tagAnomaly(group, 关卡号, '短名字')`，也就是 `userData.anomalyLevel`
- 假异常：`userData.fakeAnomaly = true`
- 杂物不要挡拍照：`userData.noRay = true`
- 门开合：事件 `door`
- 拍照成功 / 失败：`photo-ok` / `photo-fail`
- 终局强制注视开始 / 结束：`look-lock` / `look-unlock`

监听写法：

```javascript
import { on } from './bus.js';
import { EVENT } from './contract.js';

on(EVENT.photoOk, ({ level }) => {
  // 例如 P3：灯稳定 1 秒
});
```

给 AI 的任务请带上代号，例如：

```text
你是 M2。只改 w05_3d_game/src/team/m2.js。
用 anomalyFactory[3] 替换第 3 关窗帘脸。
返回的 group 要用 tagAnomaly 打上 level 3。
不要改 game.js 的胜负，也不要改 layout.js 的走廊尺寸。
改完运行 node server.js，确认第 3 关仍能拍到并开门。
```

P2 的速度表在 `src/config.js`（`walkSpeed`、`sprintSpeed`、`entitySpeed`）。场景坐标只改 `src/layout.js`。演示脚本在 `src/demo.js`，它读布局，不读模型。换完模型请点一次 **Watch Demo**。

### 不要交给 AI 的部分

课程说明里标了 **NO AI** 的内容，必须自己写，不要用 AI 生成、翻译或润色：

- 外部试玩的匿名记录
- 两次改进记录
- 每个成员的学习总结

AI 可以改代码、查 bug、调灯光。试玩里玩家说了什么，用你们自己的话记下来。

## 一起改

1. 克隆这个公开仓库。
2. 为自己的任务开分支，例如 `p2-camera-look`。
3. 改完在本地跑 `node server.js`，自己玩一遍相关流程。
4. 开 Pull Request，说明改了什么、怎么验证的。

不要提交 `.env`、密码、token，也不要提交 `node_modules/`。

## 作业提醒

可玩源码在 `w05_3d_game/`。小组报告、试玩和视频不在这个原型里，按 `Week_05_Group_Assignment.md` 另交。如果这份 GitHub 地址要写进报告，用仓库首页的 URL。

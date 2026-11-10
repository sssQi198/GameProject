# 音频素材来源与许可证

本项目的声音分两层：

1. **采样层**（下面这张表）—— 网上找的真人录音，`src/audio.js` 里的 `SAMPLES` 直接引用；
2. **合成层** —— `src/audio.js` 自己用振荡器/噪声算出来的老音效，只作为「采样加载失败」时的兜底，
   保证断网或 404 时游戏仍然有声音。

追逐段的伴奏**不在这张表里**，单独占第四节之后的两节：第三十二轮起它是一份**外部录音**
`chase-noescape.mp3`，出处与授权状态见第六节（**授权未核对**，公开发布前必须解决）；
此前那四份实时合成的伴奏已经连同 `src/chasemusic.js` 一起删掉，第五节只留结论。

采样层只接受 **CC0 / CC BY / OGA-BY** 三种许可证，且必须能在下面写出作者与出处。

## 一、已导入的文件

| 文件 | 时长 / 规格 | 原始文件 | 作者 | 许可证 | 本轮做过的处理 |
|---|---|---|---|---|---|
| `chase-heartbeat.wav` | 1.13 s · 44100 Hz · 2ch · 16bit | `heartbeat_fast_0.wav` | **未记录**（内嵌 `LIST/INFO` 只有 `ISFT = FL Studio 9`，没有作者字段） | 下载页标注 CC0 | ① 32-bit float → PCM16（`_tools/wav_float_to_pcm16.py`）② 峰值统一到 0.5（`_tools/normalize_wav.py`）③ 未做循环裁切（原文件首尾原本就对齐） |
| `chase-breath.wav` | 3.08 s · 44100 Hz · 2ch · 16bit | `breathing_tired.wav` | **Mikeask**（内嵌 `IART`，`ICRD = 2018`） | 下载页标注 CC0 | ① 循环接缝从 0.0018 收到 0.0001（`_tools/loopify.py fix … 90`，3.17 → 3.08 s）② 峰值统一到 0.5 ③ 与心跳同一个响度基准，两段循环的 gain 才有可比性 |
| `scream.ogg` | 1.33 s · 48000 Hz | `aargh6.ogg`（freesound 合集的第 6 条） | **JohnsonBrandEditing** | **CC0 1.0**：<https://creativecommons.org/publicdomain/zero/1.0/> · <https://freesound.org/people/JohnsonBrandEditing/sounds/173944/> | 原文件直接使用，只改文件名 |
| `bgm-10086.mp3` | 144.96 s · MP3 · 4 638 720 B（4.42 MiB） | 上游仓库 PR #2 直接放进 `assets/audio/` 的 `10086.mp3` | **未记录**（提交里没有作者字段） | **未核对**（上游没有标注） | 只改文件名；`startMusic()` 指向它，`loop = true`，音量走 `musicGain = 0.18` → `master`，第三十轮合并后实测 `duration = 144.96 s`、`readyState = 4` |
| `scare-rush.mp3` | 2.78 s · MP3 · 45 392 B（44 KiB） | 上游仓库 PR #2 带来的第四关木偶突脸音效 | **未记录** | **未核对** | 只改文件名；`prepareScare()` 首帧 `fetch` + `decodeAudioData` 解成 `AudioBuffer`，每次突脸 new 一个 `BufferSource`（可从头重放、可叠加），走 `scareGain = 0.9` → `master`，所以音量条和静音对它同样生效 |

`scream.ogg` 的出处可直接核实：合集自带的 `aargh.txt` 写明第 3–7 条来自
`JohnsonBrandEditing/sounds/173944`，许可证 CC0；同合集的第 0、1–2 条是 CC BY 3.0，
**本轮没有使用**那三条。

## 二、需要补的一处出处

`chase-heartbeat.wav` 的作者与页面地址**当时没有记下来**（只记了「CC0」）。
文件内嵌信息里能证明的只有「FL Studio 9 导出」，不足以定位到具体页面。

处理办法（随时可做，不影响游戏运行）：

- 如果这份作业/演示要公开发布或参赛，把心音换成能写出处的那一条即可 ——
  只改 `src/audio.js` 里 `SAMPLES.heartbeat` 指向的路径，别的代码不用动；
- 也可以用 `_tmp/audiodl/` 里留着的原始文件重新裁一遍（`_tools/loopify.py` + `_tools/normalize_wav.py`）。

`chase-breath.wav` 的作者来自文件内嵌的 `IART` 字段（Mikeask），页面地址同样没留，
但它不是「无出处」：作者名是可验证的，且下载页当时标注 CC0。

## 三、改素材 / 加素材怎么做

1. 新文件放进本目录，命名成 `chase-*.wav` 这种一看就懂的名字；
2. 在 `src/audio.js` 的 `SAMPLES` 表里加一行（键名 = 代码里用的名字）；
3. 如果是循环音，先过一遍 `_tools/loopify.py` 把接缝做平，再过 `_tools/normalize_wav.py`
   把峰值统一到 0.5，否则不同素材的 gain 不可比；
4. 在本文件第一节的表格里补一行：原始文件、作者、许可证、处理步骤。

> 只写「网上找的」不算出处。写不出作者或许可证的素材不要进这个目录。

## 四、其余声音

`horror-music.mp4` 是更早几轮就在项目里的背景音乐，**第三十轮合并上游 PR #2 时被
`bgm-10086.mp3` 取代，文件已从仓库删除**，`startMusic()` 的路径随之改了。原曲的出处本来
就没有核对过，既然已经不用了就不再是待办；如果以后要把它找回来，仍然需要单独查证。

`bgm-10086.mp3` 和 `scare-rush.mp3` 是上游 PR #2 直接放进本目录的，提交里没有写作者、
页面和许可证。它们不影响游戏运行（本地演示/作业），但**公开发布前必须补上出处，
或者换成本项目自产的合成音** —— 换 BGM 只改 `src/audio.js::startMusic()` 里的路径，
换突脸音效只改 `prepareScare()` 里的 `fetch` 路径，播放逻辑一行都不用动。

## 五、追逐伴奏（一）：四份合成伴奏，第三十二轮已删除

第十九～三十一轮的追逐段放的是 `src/chasemusic.js` 用振荡器 + 噪声 + 滤波器实时算的四份伴奏
（A · 脉搏 132–166 BPM / B · 锯弦 120–150 / C · 锤击 148–188 / D · 耳语 96–120，`seeded(20251107)`
定谱，`?chase=1..4` 或试听页写 `localStorage['wf-chase']` 切换，默认第 3 份）。因为全是算出来的，
它**从来没有进过采样表，也不涉及任何素材授权**。

第三十二轮按要求换成一首真实录音（见第六节），于是：

| 东西 | 现状 |
|---|---|
| `src/chasemusic.js` | **已删除**（454 行）。要看回来翻 git 历史，或 `_tmp\backup\chasemusic.js.bak` |
| `_probe/chasemusic.mjs` | **已删除**——合成器没了，那批数值断言也没有对象了（备份在同目录 `.bak`） |
| `?chase=1..4` / `?chase=0` | **失效**，参数不再被解析（`src/main.js` 里只留了一行注释说明去向） |
| `localStorage['wf-chase']` | 不再读也不再写；旧键留在浏览器里不影响任何东西 |
| `dev/chase-bgm.html` | 重写成「只有一首」的试听页：播放/停、距离滑杆、增益读数、跳到最后 3 秒听接缝 |
| 追逐段的层次 | 只剩这一首 + `chase-heartbeat.wav`（心跳 loop）；`chase-breath.wav` 第十九轮起就不在追逐里了 |

之所以整个删掉而不是留成「选 0 = 关」：这一轮的要求是「只保留 E」，留四条死代码 + 一套
`localStorage` 分支只会让「实际在放什么」变难判断；而合成器的代码全在 git 历史里，找得回来。

## 六、追逐伴奏（二）：`chase-noescape.mp3`（第三十二轮起唯一一首）

| 项目 | 内容 |
|---|---|
| 文件 | `assets/audio/chase-noescape.mp3` · 720 384 B · 45.02 s · 48 kHz 立体声（解码后） |
| 原始文件名 | `无逃脱恐怖追逐音乐免版税部分1_追逐紧张诡异音乐(no es_爱给网_aigei_com.mp3` |
| 来源站点 | **爱给网** <https://www.aigei.com> —— 站点名与「免版税」字样都来自原始文件名 |
| 具体素材页 | **没有**。下载时只留了站点首页，作者与素材页地址都拿不回来（提供者明确说没有具体链接） |
| 授权状态 | **未核对**。文件名写「免版税」，但这不等于能商用/能再分发；爱给网的授权条款需要按素材页逐条确认，没有页面就无法确认 |
| 当前用途 | **游戏本体追逐段的唯一伴奏**（`src/chasefile.js`，`?devLevel=finalechase` 或真打到终局都能听到），`dev/chase-bgm.html` 是它的单曲试听页 |
| 接进游戏时做过的处理 | 只在**内存**里：① 掐掉 MP3 编码器在开头塞的 31 ms 静音；② 末尾 45 ms 等功率交叉淡化到开头，循环接缝不咔哒（`45.024 s → 44.948 s`）。**磁盘上的 mp3 一个字节没改** |

**距离只改音量**（第三十二轮的口径）：`chaseGainFor(t)` 把 0–1 的压力映射成 **0 dB → +4 dB**
的线性 dB 曲线，`t` 由 `game.js` 每帧按「怪物和你差多远」算出来（`danger = 1 - (dist - entityCatch) / 6`），
经 `audio.setTension()` 送给 `ChaseFile` 的那一层 GainNode（`setTargetAtTime(τ = 0.5)`）。
BPM、滤波、音色**都不随距离变**，只有响度变。

响度基准为什么取 unity（远端 = 0 dB）：对手不是当年那份合成伴奏，而是**一直在响的默认 BGM**
`bgm-10086.mp3`——整曲 RMS **−12.7 dBFS**（母带压得很满，峰值 0.992），乘它那一层 `musicGain`
0.36 之后仍有 **−21.6 dBFS**；而这首整曲 RMS **−19.7 dBFS**，所以 unity 下比 BGM 高 **1.9 dB**
（4.5 s 窗口中位数口径高 1.2 dB），满足「追逐的默认音量至少到 BGM 水平」。
第一版按旧合成伴奏对齐取的是 **−6 dB → +1 dB**（实测比 BGM 低 4.1 dB，听着偏小），同日返工成现在这条。

上限 +4 dB 是**峰值不削波**的上限：峰值采样 0.622 × 1.585 ≈ **0.986**，玩家把音量调到 100 % 也不会削；
+7 dB 时层内峰值 ≈ 1.39，`master` 一过 0.72 就削顶（默认音量 0.4 时还安全，但不能赌玩家不动音量）。

**公开发布前必须先解决这条**：要么补上素材页链接并确认条款允许这样用，要么换回可写出处的素材
（这条素材**不能**作为「已授权」写进任何对外说明）。现阶段只适合内测/课堂演示。
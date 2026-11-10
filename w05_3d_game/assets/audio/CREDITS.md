# 音频素材来源与许可证

本项目的声音分两层：

1. **采样层**（下面这张表）—— 网上找的真人录音，`src/audio.js` 里的 `SAMPLES` 直接引用；
2. **合成层** —— `src/audio.js` 自己用振荡器/噪声算出来的老音效，只作为「采样加载失败」时的兜底，
   保证断网或 404 时游戏仍然有声音；
3. **程序化伴奏层** —— 追逐段的四份 BGM（`src/chasemusic.js`），全是实时合成的，**不涉及任何素材授权**，
   也没有放在下面这张表里（见第五节）。

采样层只接受 **CC0 / CC BY / OGA-BY** 三种许可证，且必须能在下面写出作者与出处。

## 一、已导入的文件

| 文件 | 时长 / 规格 | 原始文件 | 作者 | 许可证 | 本轮做过的处理 |
|---|---|---|---|---|---|
| `chase-heartbeat.wav` | 1.13 s · 44100 Hz · 2ch · 16bit | `heartbeat_fast_0.wav` | **未记录**（内嵌 `LIST/INFO` 只有 `ISFT = FL Studio 9`，没有作者字段） | 下载页标注 CC0 | ① 32-bit float → PCM16（`_tools/wav_float_to_pcm16.py`）② 峰值统一到 0.5（`_tools/normalize_wav.py`）③ 未做循环裁切（原文件首尾原本就对齐） |
| `chase-breath.wav` | 3.08 s · 44100 Hz · 2ch · 16bit | `breathing_tired.wav` | **Mikeask**（内嵌 `IART`，`ICRD = 2018`） | 下载页标注 CC0 | ① 循环接缝从 0.0018 收到 0.0001（`_tools/loopify.py fix … 90`，3.17 → 3.08 s）② 峰值统一到 0.5 ③ 与心跳同一个响度基准，两段循环的 gain 才有可比性 |
| `scream.ogg` | 1.33 s · 48000 Hz | `aargh6.ogg`（freesound 合集的第 6 条） | **JohnsonBrandEditing** | **CC0 1.0**：<https://creativecommons.org/publicdomain/zero/1.0/> · <https://freesound.org/people/JohnsonBrandEditing/sounds/173944/> | 原文件直接使用，只改文件名 |

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

`horror-music.mp4` 是更早几轮就在项目里的背景音乐，本轮没有改动它，出处也没有核对过
（不在本轮「导入素材」的范围内）。如果后面要公开发布，这一条需要单独查证。

## 五、追逐伴奏：本项目原创，不涉及素材授权

追逐段的背景音乐**不在上面的采样表里**，也不需要授权核查：它是 `src/chasemusic.js` 用
Web Audio 的振荡器 + 噪声 + 滤波器实时算出来的，**没有引用任何录音**，谱子由
`seeded(20251107)` 定死。四份可选（`dev/chase-bgm.html` 试听，`?chase=1..4` 或在试听页
「设为本局伴奏」写进 `localStorage['wf-chase']`）：

| # | id | 名字 | BPM | 音色做法 |
|---|---|---|---|---|
| 1 | `pulse` | A · 脉搏 | 132–166 | 心跳式低鼓 + 锯齿 bass 八分 + 高频「吸气」噪声扫频 |
| 2 | `saw` | B · 锯弦 | 120–150 | 三把失谐锯齿长音（±7 cent）+ 半音下行警报 |
| 3 | `industrial` | C · 锤击 | 148–188 | 金属敲击（带通噪声 + 极快衰减）+ 16 分踩踏 + 失真低鼓 |
| 4 | `whisper` | D · 耳语 | 96–120 | 稀疏底鼓 + 反向混响耳语层 + 不和声长音 |

**默认放第 3 份（C · 锤击）**：没挑过的时候进游戏就是它（`src/audio.js` 的
`DEFAULT_CHASE_TRACK = 3`，`?chase=0` 仍然能关掉）。这个默认值只影响「从没选过」的情况，
`localStorage['wf-chase']` 里已经有值时以存的那份为准。

和采样层的关系，写清楚免得以后误认：

- 追逐里**只放**这份程序化伴奏 + `chase-heartbeat.wav`（心跳 loop）；默认 BGM（`horror-music.mp4`）在 `setMood('chase')` 那一刻就被 `stopMusic()` **真停**（增益压到 0.0001 之后把 `<audio>` 元素 `pause()`），不是压着放；而且这次 `musicOff` 会一路保持到结局，**安全屋和结局都不再放 BGM**（第二十轮改的）。
- `chase-breath.wav` **不在追逐里用**了（第十九轮改的），它现在只在安全屋第 5 段「低头喘气」和第五关的单次 `breath()` 里出现。
- 以后若要把某份伴奏换成真人录音，就得回到第一节那张表：写作者、写页面、写许可证，写不出来就别换。
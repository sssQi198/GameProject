/**
 * 拍照那一声喘气（第二十六轮）——纯源码结构校验，不需要 DOM。
 *
 * 用户的原始要求：「第四关拍下目标异常后有一声喘气，删掉」。
 * 这一条只能靠看源码守住：`succeedPhoto()` 里不许再出现 `breath(`，
 * 也不许再按 `levelIndex === 4` 分叉；第五关的怒吼/颤抖必须原样还在
 * （那是另一件事，不能顺手删掉），门口那一声 `breath()` 也还在。
 */
import { readFileSync } from 'node:fs';

let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}

const GAME = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const AUDIO = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');

// ── 取出 succeedPhoto 的整个函数体（从 `succeedPhoto() {` 到下一个两空格缩进的 `}`）──
function bodyOf(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return '';
  const start = i + signature.length;
  const m = /\n  \}/.exec(src.slice(start));
  return m ? src.slice(start, start + m.index) : src.slice(start);
}

const succeed = bodyOf(GAME, 'succeedPhoto() {');
ok(succeed.length > 200, '找到 succeedPhoto() 的函数体', `${succeed.length} 字符`);

// 注释里会**故意**提到被删掉的那句 `levelIndex === 4 → breath()`，
// 所以判断「还有没有这条逻辑」必须先剥掉注释再看。
// 注意：这里按 /\r?\n/ 拆行——game.js 在 git 检出后可能是 CRLF，
// 用 split('\n') 会让行尾留一个 \r，`//.*$` 因为 . 不匹配 \r 而失效（合并后就踩到过）。
const code = succeed
  .split(/\r?\n/)
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

// ── 1. 第四关拍完不再有喘气 ──
ok(!/\bbreath\s*\(/.test(code), 'succeedPhoto() 里没有任何 breath() 调用');
ok(!/levelIndex\s*===\s*4/.test(code), 'succeedPhoto() 里不再按第 4 关分叉');
ok(!/gasp/.test(code), '原来那几口 gasp 的时间点没留残骸');
// 只允许有一条指向「删掉」的注释，防止下一轮有人又加回来
const why = /第二十六轮[\s\S]{0,200}?breath\(\)/.test(succeed);
ok(why, '留了「为什么删」的注释（防止下一轮又被加回来）');

// ── 2. 这一下该做的事一件没少 ──
ok(/this\.cleared = true;/.test(succeed), '仍然记为拍到了（cleared = true）');
ok(/emit\(EVENT\.photoOk/.test(succeed), '仍然发 photoOk 事件（HUD/统计靠它）');
ok(/this\.audio\.shutter\(true\)/.test(succeed), '快门声还在');
ok(/setDoorOpen\(true\)/.test(succeed), '开门还在');
ok(/autoLowerCamera\(\)/.test(succeed), '自动放下相机还在');

// ── 3. 第五关的怒吼/颤抖原样保留 ──
ok(/if \(this\.levelIndex === 5\) \{/.test(succeed), '第 5 关分支还在');
ok(/notifyAnomalyPhoto\(5\)/.test(succeed), '第 5 关仍然通知异常体（触发终局）');
ok(/roar\(\)/.test(succeed), '第 5 关仍然怒吼');
ok(/this\.l5ShakeT = 2\.0;/.test(succeed), '第 5 关仍然颤抖 2 秒');

// ── 4. 安全屋：门口那一声已删，只剩低头那一段一条 pant() ──
// 第二十七轮：「从靠近发光门到刚进安全屋这段时间的喘息声很混乱」⇒ 门口那声 `breath()` 删掉，
// 喘气只留在**刚进新场景**（安全屋）低头那一段。
const breathCalls = (GAME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/\baudio\.breath\(\)/g) ?? []).length;
ok(breathCalls === 0, '全游戏一处 audio.breath() 都不留（门口那声已删）', `${breathCalls} 处`);
ok(!/cueEnd\('breath-arrive'/.test(GAME), '门口那声的 cue 没有残骸');
const pantCalls = (GAME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/\baudio\.pant\(/g) ?? []).length;
ok(pantCalls === 1, '安全屋低头那一段只用一条 pant()', `${pantCalls} 处`);
// 第二十八轮：「一共有三下低头，我希望有三下随节奏的连贯清晰喘息」⇒ total 2.30 → 3.40，
// 三拍（0 / 1.05 / 2.10 秒），第三拍的呼气正好压在第 5 段开头那第三下低头上。
ok(/this\.audio\.pant\(3\.40, \{ period: END_BREATH_PERIOD \}\)/.test(GAME),
  '那条 pant() 铺 3.40 秒（三拍），并把镜头周期当参数传进去');
ok(!/this\.audio\.breath\(\);\s*\n\s*\},?\s*0\.90\)/.test(GAME), '不再是「0.9 秒叫一次」的三连');

// ── 5. pant() 自身：第三十轮起整条素材一个人声，不再拼吸气+呼气 ──
ok(/const PEAK_0 = 0\.25;/.test(AUDIO) && /const PEAK_1 = 1\.42;/.test(AUDIO),
  '素材里前两口气的峰（0.25 / 1.42 秒）是写死的实测值');
ok(/const rate = \(PEAK_1 - PEAK_0\) \/ period;/.test(AUDIO),
  '倍速由 period 反推：一拍 = 素材的一口气，节拍器还是 period');
ok(/const LEAD = 0\.29;/.test(AUDIO), '第一口气的峰对在低头最低点前一点点（LEAD 0.29 秒）');
ok(!/EXHALE_AT|EXHALE_RATE/.test(AUDIO), '第二层呼气声部彻底删掉了（拍内断层就是它和吸气的接缝）');
ok(/this\.breathVoices = \[voice\];/.test(AUDIO), '整串只登记 1 个声部，stopBreath 一把就能掐掉');
ok(/Math\.min\(sample\.duration, Math\.max\(0\.8, total \* rate\)\)/.test(AUDIO),
  'total 只用来截尾（duration = total × rate），不再用来数拍');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
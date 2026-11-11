/**
 * 静态检查：类里「构造函数赋的实例属性」不许和「类里定义的方法」同名。
 *
 * 为什么要有这一条：hud.js 里 `this.fadeWhite = 节点` 把原型上的 `fadeWhite(alpha)`
 * 挡住了，`hud.fadeWhite(1)` 在浏览器里直接 TypeError —— 而 node 下的探针用的是假 HUD，
 * 全部通过。这类错误只有真跑浏览器才炸，必须靠静态检查兜住。
 *
 * 判定规则：同一个 class 里，名字既出现在 `this.name = ...`，又出现在 `  name(...)`
 * 这样的方法定义上 → 报错。只报「既有属性又有方法」，不报纯粹的属性。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
let fail = 0;
function ok(cond, label, detail = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) fail += 1;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 扫一段源码，返回 [{cls, name}]：属性与同名方法撞车的清单。 */
function scan(text) {
  const scopes = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const classAt = line.match(/^(?:export\s+)?(?:default\s+)?class\s+([\w$]+)/);
    if (classAt) {
      current = { name: classAt[1], methods: new Set(), props: new Set() };
      scopes.push(current);
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    // 类体结束：回到 0 缩进的非空行（`}` / `export ...` / 下一个声明）
    if (!/^\s/.test(line)) {
      if (/^[}\w$]/.test(line)) current = null;
      continue;
    }
    const methodAt = line.match(/^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([\w$]+)\s*\(/);
    if (methodAt) current.methods.add(methodAt[1]);
    for (const m of line.matchAll(/this\.([\w$]+)\s*=(?!=)/g)) current.props.add(m[1]);
  }
  const hits = [];
  for (const scope of scopes) {
    for (const name of scope.methods) {
      if (scope.props.has(name)) hits.push({ cls: scope.name, name });
    }
  }
  return { scopes, hits };
}

// 自检：这段假代码必须被抓到，否则下面的「干净」不算数
const selftest = scan([
  'class Fake {',
  '  constructor() {',
  '    this.paint = document.createElement("canvas");',
  '    this.timer = 0;',
  '  }',
  '  paint(alpha) { this.timer = alpha; }',
  '}',
].join('\n'));
ok(selftest.hits.length === 1 && selftest.hits[0].name === 'paint', '自检：能抓到挡住方法的实例属性',
  selftest.hits.map((h) => `${h.cls}.${h.name}`).join(' ') || '没抓到');

// 真正的 src
const files = walk(SRC);
const all = { classes: 0, methods: 0, hits: [], files: files.length };
for (const file of files) {
  const { scopes, hits } = scan(readFileSync(file, 'utf8'));
  all.classes += scopes.length;
  for (const s of scopes) all.methods += s.methods.size;
  const short = file.slice(SRC.length).replace(/\\/g, '/');
  for (const h of hits) all.hits.push({ ...h, file: short });
}
ok(all.classes >= 8, '扫到的 class 数量对得上（不是空扫）', `${all.classes} 个 class / ${all.files} 个文件`);
ok(all.methods >= 60, '方法也真扫出来了（正则没空转）', `${all.methods} 个方法`);
for (const h of all.hits) console.log(`     冲突：${h.file}  class ${h.cls}  属性挡住方法 ${h.name}`);
ok(all.hits.length === 0, '没有「实例属性挡住同名方法」的类',
  all.hits.map((h) => `${h.cls}.${h.name}`).join(' ') || '干净');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
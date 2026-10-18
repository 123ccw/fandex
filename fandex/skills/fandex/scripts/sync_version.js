// 版本号单一事实源：SKILL.md frontmatter 是唯一权威，其它清单必须与它一致。
//
// 为什么要有这个：1.4.3 就是因为 frontmatter 停在 1.3.0 而其它四处升到 1.4.3 才出的漂移；
// 当时 CI 里手写了一张"四处路径"的映射表——那张表本身就是下一个漂移源（加一个清单就漏一处）。
// 这里改成按 glob 发现所有 manifest，新增清单自动被纳入检查。
//
// 用法：
//   node sync_version.js              # 只打印现状
//   node sync_version.js --check      # 全部一致→exit 0；有漂移→列出并 exit 1（CI 用）
//   node sync_version.js --fix        # 把其它清单改成 frontmatter 的版本号
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');            // <skill>/scripts/.. = <skill>
const REPO = path.resolve(SKILL_DIR, '..', '..', '..');     // <repo>/fandex/skills/<skill> → <repo>
const CHECK = process.argv.includes('--check');
const FIX = process.argv.includes('--fix');

function readVersion(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.md')) {
      const m = txt.match(/^\s*version:\s*"?([^"\n]+?)"?\s*$/m);
      return m ? m[1] : null;
    }
    const j = JSON.parse(txt);
    if (j.version) return j.version;
    if (j.metadata && j.metadata.version) return j.metadata.version;
    if (Array.isArray(j.plugins) && j.plugins[0] && j.plugins[0].version) return j.plugins[0].version;
    return null;
  } catch (e) { return null; }
}

// npm 的 package-lock.json 有两处版本：顶层 version 与 packages[""].version。
// 只改顶层会留下"npm install 时又被 lock 里的旧版本带跑"的漂移，这里一并管。
function nestedVersion(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j.packages && j.packages[''] && j.packages[''].version ? j.packages[''].version : null;
  } catch (e) { return null; }
}

function writeVersion(file, version) {
  const txt = fs.readFileSync(file, 'utf8');
  let out;
  if (file.endsWith('.md')) {
    out = txt.replace(/^(\s*version:\s*)"?[^"\n]+"?\s*$/m, `$1"${version}"`);
  } else {
    const j = JSON.parse(txt);
    if (j.version) j.version = version;
    else if (j.metadata && j.metadata.version) j.metadata.version = version;
    else if (Array.isArray(j.plugins) && j.plugins[0]) j.plugins[0].version = version;
    if (j.packages && j.packages[''] && j.packages[''].version) j.packages[''].version = version;
    out = JSON.stringify(j, null, 2) + '\n';
  }
  if (out !== txt) { fs.writeFileSync(file, out, 'utf8'); return true; }
  return false;
}

// ---- 发现所有清单（不写死路径）----
const TARGETS = [];
function add(file, note) { if (fs.existsSync(file)) TARGETS.push({ file, note }); }

add(path.join(SKILL_DIR, 'SKILL.md'), 'skill frontmatter（权威源）');
add(path.join(SKILL_DIR, 'scripts', 'package.json'), 'scripts 包');
add(path.join(SKILL_DIR, 'scripts', 'package-lock.json'), 'lock（npm 自动维护，建议随之更新）');
add(path.join(REPO, '.claude-plugin', 'marketplace.json'), '插件市场');
// 插件清单：<repo>/**/.claude-plugin/plugin.json 与 .zcode-plugin/plugin.json
for (const dir of ['fandex', '']) {
  for (const p of ['.claude-plugin', '.zcode-plugin']) {
    add(path.join(REPO, dir, p, 'plugin.json'), '插件清单 ' + path.join(dir, p));
  }
}

const AUTHORITY = path.join(SKILL_DIR, 'SKILL.md');
const want = readVersion(AUTHORITY);
if (!want) {
  console.error('✗ 读不到权威版本号：' + AUTHORITY + ' 的 frontmatter 里应有 metadata.version');
  process.exit(1);
}

console.log('权威版本（' + path.relative(REPO, AUTHORITY) + '）= ' + want + '\n');
const drift = [];
const skipped = [];
for (const t of TARGETS) {
  const v = readVersion(t.file);
  if (v == null) { skipped.push(t); continue; }   // 清单不在这个信封里（如单独安装的 skill 副本）
  const nested = nestedVersion(t.file);           // package-lock 的 packages[""].version（其它清单为 null）
  const ok = v === want && (nested == null || nested === want);
  if (!ok) drift.push(t);
  console.log((ok ? '  OK   ' : '  BAD  ') + path.relative(REPO, t.file) + ' = ' + v
    + (nested != null && nested !== v ? '（内部 packages[""] = ' + nested + '）' : '')
    + '   # ' + t.note);
}
const checked = TARGETS.length - skipped.length;
if (skipped.length) {
  if (checked) console.log('\n跳过 ' + skipped.length + ' 处（本次运行看不到的清单，单独安装的 skill 副本属正常）：' + skipped.map((t) => path.relative(REPO, t.file)).join('、'));
  else console.log('\n只看到 skill 信封内的清单（仓库根不在这个位置）——从仓库根运行才能校验全部 5 处。');
}

if (!drift.length) {
  console.log('\n已检查的 ' + checked + ' 处一致。');
  process.exit(0);
}

console.log('\n' + drift.length + ' 处与权威版本不一致：');
drift.forEach((t) => console.log('  · ' + path.relative(REPO, t.file)));
if (FIX) {
  let n = 0;
  for (const t of drift) if (writeVersion(t.file, want)) n++;
  console.log('已修正 ' + n + ' 处 → ' + want);
  process.exit(0);
}
if (CHECK) {
  console.error('请统一为 ' + want + '（自动修正：node scripts/sync_version.js --fix）');
  process.exit(1);
}
process.exit(0);

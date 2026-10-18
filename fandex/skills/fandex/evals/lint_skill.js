// skill 信封校验：SKILL.md 的结构、引用完整性、以及"文档里写的数字"是否与代码一致。
//
// 为什么要有这个：CHANGELOG 曾声称跑过 `skills-ref validate`，但仓库里没有这个脚本、
// CI 也没这一步（不可复现）。这里用零依赖的本地校验覆盖最容易漂移的几类：
//   ① frontmatter：name 与目录名一致、description 存在且没有触发词的漏写
//   ② 引用完整性：SKILL.md 里 `references/xxx.md` / `assets/xxx` / `evals/xxx` 是否真实存在，
//      references/ 下的文件是否全都被 SKILL.md 指到（孤儿文档）
//   ③ 数字一致性：SKILL.md 说的断言条数/坑位数是否与 check.js、pipeline.md 实际一致
//   ④ 铁律编号：SKILL.md 的铁律列表必须连续编号
//
// 用法: node evals/lint_skill.js    （有错 exit 1，只有警告 exit 0）
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..');
const SKILL_MD = path.join(SKILL, 'SKILL.md');
const errors = [];
const warns = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { errors.push(m); console.log('  ✗ ' + m); };
const meh = (m) => { warns.push(m); console.log('  ! ' + m); };

const md = fs.readFileSync(SKILL_MD, 'utf8');

// ---- ① frontmatter ----
console.log('frontmatter');
const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fm) bad('SKILL.md 开头没有 YAML frontmatter');
else {
  const head = fm[1];
  const name = (head.match(/^name:\s*(.+)$/m) || [])[1];
  const desc = (head.match(/^description:\s*([\s\S]*?)(?=\n[a-z_]+:|$)/m) || [])[1];
  if (!name) bad('frontmatter 缺 name');
  else if (name.trim() !== path.basename(SKILL)) bad(`name（${name.trim()}）与目录名（${path.basename(SKILL)}）不一致`);
  else ok('name = ' + name.trim() + '（与目录名一致）');
  if (!desc) bad('frontmatter 缺 description');
  else {
    const d = desc.trim();
    ok('description ' + d.length + ' 字符');
    if (d.length > 1024) bad('description 超过 1024 字符，会被截断');
    if (!/Use when|用于|使用时/.test(d)) meh('description 里没有明确的触发语（Use when / 用于…）—— 触发靠这段文字');
    if (!/不用于|Do NOT use|Not for/.test(d)) meh('description 没有写"不用于"，容易在邻近场景被误触发');
  }
  if (!/^license:/m.test(head)) meh('frontmatter 缺 license');
  if (!/^\s*version:/m.test(head)) bad('frontmatter 缺 metadata.version（版本号权威源）');
}

// ---- ② 引用完整性 ----
console.log('\n引用完整性');
const referenced = new Set();
for (const m of md.matchAll(/`(references\/[^`]+\.md|assets\/[^`]+|evals\/[^`]+|scripts\/[^`]+\.js)`/g)) {
  const rel = m[1];
  referenced.add(rel);
  if (!fs.existsSync(path.join(SKILL, rel))) bad('SKILL.md 指向了不存在的文件：' + rel);
}
ok('SKILL.md 引用的 ' + referenced.size + ' 个路径' + (errors.length ? '' : '全部存在'));
// references/ 是"必须被指到的详情文档"；assets/evals 是工具与样例，由目录说明覆盖即可
for (const dir of ['references']) {
  const d = path.join(SKILL, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const rel = dir + '/' + f;
    if (fs.statSync(path.join(d, f)).isDirectory()) continue;
    if (!md.includes(rel) && !md.includes(f)) meh('孤儿文件（SKILL.md 从未提到）：' + rel);
  }
}

// ---- ③ 数字一致性 ----
console.log('\n数字一致性');
const checkJs = fs.readFileSync(path.join(SKILL, 'evals', 'check.js'), 'utf8');
const assertionCount = new Set([...checkJs.matchAll(/\[(C\d+)\]/g)].map((m) => m[1])).size;
const claimedAssertions = [...md.matchAll(/断言\s*(\d+)\s*条/g)].map((m) => Number(m[1]));
if (!claimedAssertions.length) meh('SKILL.md 没有写断言条数（check 实际 ' + assertionCount + ' 条）');
else if (claimedAssertions.some((n) => n !== assertionCount)) bad(`SKILL.md 说断言 ${claimedAssertions.join('/')} 条，check.js 实际 ${assertionCount} 条`);
else ok('断言条数一致（' + assertionCount + '）');

const pipelineMd = fs.readFileSync(path.join(SKILL, 'references', 'pipeline.md'), 'utf8');
const pitfallSection = (pipelineMd.match(/## 五、踩坑清单([\s\S]*?)(?=\n## |$)/) || [])[1] || '';
const pitfallCount = [...pitfallSection.matchAll(/^(\d+)\.\s/gm)].length;
const claimedPitfalls = [...md.matchAll(/踩坑清单（(\d+)\s*条）/g)].map((m) => Number(m[1]))
  .concat([...md.matchAll(/完整\s*(\d+)\s*条/g)].map((m) => Number(m[1])));
if (!claimedPitfalls.length) meh('SKILL.md 没写坑位条数（pipeline.md 实际 ' + pitfallCount + ' 条）');
else {
  const wrong = claimedPitfalls.filter((n) => n !== pitfallCount);
  // SKILL.md 侧栏是「最硬的 N 条」子集，允许小于总数；大于总数一定是错的
  const overshoot = wrong.filter((n) => n > pitfallCount);
  if (overshoot.length) bad(`SKILL.md 说坑位 ${overshoot.join('/')} 条，pipeline.md §五 实际只有 ${pitfallCount} 条`);
  else ok('坑位条数不夸大（文档声称 ' + [...new Set(claimedPitfalls)].join('/') + ' ≤ 实际 ' + pitfallCount + '）');
}

// ---- ④ 铁律连续编号 ----
console.log('\n铁律编号');
const rules = (md.match(/## 质检铁律[\s\S]*?(?=\n## |$)/) || [''])[0];
const nums = [...rules.matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
if (!nums.length) bad('找不到「质检铁律」的编号列表');
else if (nums.some((n, i) => n !== i + 1)) bad('铁律编号不连续：' + nums.join(','));
else ok('铁律 ' + nums.length + ' 条，编号连续');

// ---- 结论 ----
console.log('\n结果：' + errors.length + ' 个错误，' + warns.length + ' 个提醒');
process.exit(errors.length ? 1 : 0);

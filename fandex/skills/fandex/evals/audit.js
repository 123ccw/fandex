// 数据完备度检查（建议性，不阻断交付）：check.js 只管"产物在不在、页码对不对"，
// 这个管"内容残不残"——哪部缺字段、哪些字段还写着"未核实"、剧透表名字对不对得上。
// 用法: node evals/audit.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); }
  catch (e) { return null; }
}

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const cfgmod = require('../scripts/_config');
const { ROOT, DOMAIN, P } = cfgmod;
const RDIR = P('anime_research');
// 收据：整本一份（pack 读）+ 每部一份（断点续跑时看"哪几部做完了"）
const RECEIPT = P('anime_build', '_audit.json');
const WORK_RECEIPTS = P('anime_build', 'receipts');
const workReceipts = [];

// 必填：缺了成品会出现肉眼可见的空缺 / 降级
const REQUIRED = ['synopsis', 'source', 'genres', 'production', 'cover'];
// 可选但强烈建议：缺了板块会整块消失
const SUGGESTED = ['music', 'platforms', 'status', 'watch_order', 'unit_synopses', 'title_jp', 'rating'];
// 锦上添花
const EXTRA = ['quote', 'accent', 'portrait', 'franchise', 'update'];
const PLACEHOLDER = /未核实|待核实|以官网为准|以游戏内为准|TODO|暂缺|待补/;

function hasText(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}
function isEmptyLike(v) {
  if (!hasText(v)) return true;
  const s = Array.isArray(v) ? JSON.stringify(v) : String(v);
  return PLACEHOLDER.test(s);
}

const baseFile = P('anime_base.json');
if (!fs.existsSync(baseFile)) { console.error('未找到 ' + baseFile + ' ——先跑 npm run base（模式 A）或自备扫描脚本（模式 B）'); process.exit(1); }
let base;
try { base = JSON.parse(fs.readFileSync(baseFile, 'utf8')); }
catch (e) { console.error('anime_base.json 解析失败：' + e.message); process.exit(1); }

const works = Object.values(base);
console.log('数据完备度审计：项目根 = ' + ROOT);
console.log('领域 = ' + DOMAIN + (DOMAIN === 'novel' ? '（novel：每"部"=一个角色/势力，franchise 承载伏笔表）' : '') + '，共 ' + works.length + ' 部\n');

let hard = 0, soft = 0;
const needFix = [];

for (const rec of works) {
  const name = rec.folder || rec.title || '(未命名)';
  const rFile = path.join(RDIR, name + '.json');
  const issues = [];
  const missingReq = [], missingSug = [], missingExtra = [], placeholders = [];

  if (!fs.existsSync(rFile)) {
    hard++;
    console.log('✗ [A1] ' + name + '：没有调研稿（' + path.relative(ROOT, rFile) + '）');
    needFix.push(name + ' 缺调研稿');
    workReceipts.push({ work: name, status: 'missing', hash: null, missingRequired: REQUIRED.slice(), missingSuggested: [], placeholders: [], issues: ['[A1] 缺调研稿'] });
    continue;
  }
  let r;
  try { r = JSON.parse(fs.readFileSync(rFile, 'utf8')); }
  catch (e) {
    hard++;
    console.log('✗ [A2] ' + name + '：调研稿 JSON 解析失败 —— ' + e.message);
    needFix.push(name + ' 调研稿坏 JSON');
    workReceipts.push({ work: name, status: 'broken', hash: null, missingRequired: [], missingSuggested: [], placeholders: [], issues: ['[A2] JSON 解析失败：' + e.message] });
    continue;
  }

  for (const k of REQUIRED) {
    if (!hasText(r[k])) missingReq.push(k);
    else if (isEmptyLike(r[k])) placeholders.push(k);
  }
  for (const k of SUGGESTED) {
    if (!hasText(r[k])) missingSug.push(k);
    else if (isEmptyLike(r[k])) placeholders.push(k);
  }
  for (const k of EXTRA) if (!hasText(r[k])) missingExtra.push(k);

  // 封面 / 肖像文件
  for (const kind of ['cover', 'portrait']) {
    if (!hasText(r[kind])) continue;
    const rel = String(r[kind]).replace(/\//g, path.sep);
    if (rel.includes('..')) { issues.push('[A6] ' + kind + ' 路径含 ..（会被拒绝）'); continue; }
    if (!fs.existsSync(path.join(RDIR, rel))) issues.push('[A6] ' + kind + ' 文件不存在：' + r[kind]);
  }

  // 剧透表与 units 对齐（anime 域的核心坑位）
  const units = Array.isArray(rec.units) ? rec.units : [];
  const sops = Array.isArray(r.unit_synopses) ? r.unit_synopses : [];
  if (sops.length) {
    const unitNames = units.map((u) => u.name);
    const orphan = sops.filter((s) => s && s.name && !unitNames.includes(s.name)).map((s) => s.name);
    const lack = unitNames.filter((n) => !sops.some((s) => s && s.name === n));
    if (orphan.length) issues.push('[A7] unit_synopses 里的名字不在 units 里：' + orphan.join('、') + '（这些不会渲染）');
    if (lack.length) issues.push('[A7] units 里没有对应剧透的单元：' + lack.join('、') + '（该单元渲染成空）');
  } else if (units.length > 1) {
    missingSug.push('unit_synopses（多单元却没有剧透表）');
  } else if (DOMAIN === 'anime' && !units.length) {
    issues.push('[A7] anime 域缺 units（模式 A 必填；总览时间轴会丢列）');
  }

  // 简介长度：两档，别再让文档承诺一个代码从不检查的区间。
  //   硬线（计入 issues，会拉高 hard）：<120 撑不起版面、>800 会挤版
  //   软线（只做建议，符合文档里"建议 300-500 字"的措辞）——此前文档写 300-500，代码却只查 120/800，
  //   于是 200 字、600 字都能"审计全绿"，文档承诺的检查其实不存在。
  const syn = String(r.synopsis || '');
  if (hasText(r.synopsis)) {
    if (syn.length < 120) issues.push('[A8] synopsis 只有 ' + syn.length + ' 字（硬下限 120 字，太短撑不起版面）');
    else if (syn.length > 800) issues.push('[A8] synopsis ' + syn.length + ' 字（超过 800 字会挤版）');
    else if (syn.length < 300) missingSug.push('synopsis 偏短（' + syn.length + ' 字，建议 300-500 字）');
    else if (syn.length > 500) missingSug.push('synopsis 偏长（' + syn.length + ' 字，建议 300-500 字）');
  }

  // production 结构化解析（格式不符会降级为整段文本，不是错，但值得知道）
  if (hasText(r.production) && !/[：:].*[；;]/.test(String(r.production))) {
    issues.push('[A9] production 未按"键：值；键：值"格式写 → 会降级为整段文本（不致命）');
  }

  // accent 合法性
  if (hasText(r.accent) && !/^#[0-9a-fA-F]{6}$/.test(String(r.accent))) issues.push('[A10] accent 不是 6 位 hex：' + r.accent);

  const hasHard = missingReq.length || issues.some((s) => !s.includes('不致命'));
  if (hasHard) hard++; else if (missingSug.length || placeholders.length || issues.length || missingExtra.length) soft++;

  const mark = hasHard ? '✗' : (missingSug.length || placeholders.length || issues.length) ? '!' : '✓';
  console.log(mark + ' ' + name);
  if (missingReq.length) console.log('    缺必填 [A3]：' + missingReq.join('、'));
  if (issues.length) issues.forEach((s) => console.log('    问题：' + s));
  if (placeholders.length) console.log('    还是占位/未核实 [A4]：' + placeholders.join('、'));
  if (missingSug.length) console.log('    建议补 [A5]：' + missingSug.join('、'));
  if (missingExtra.length) console.log('    可选未给：' + missingExtra.join('、'));
  if (mark === '✓') console.log('    字段完备，封面/剧透表对齐');
  if (hasHard) needFix.push(name + '：' + (missingReq.length ? '缺 ' + missingReq.join('/') : issues[0]));

  workReceipts.push({
    work: name,
    status: hasHard ? 'hard' : (missingSug.length || placeholders.length || issues.length) ? 'soft' : 'complete',
    hash: sha256(rFile),
    missingRequired: missingReq,
    missingSuggested: missingSug,
    placeholders,
    issues,
  });
}

console.log('\n汇总：' + works.length + ' 部 —— ' + (works.length - hard - soft) + ' 部完备，' + soft + ' 部可优化，' + hard + ' 部有硬问题');
if (needFix.length) {
  console.log('\n建议先补这几部：');
  needFix.slice(0, 10).forEach((s) => console.log('  · ' + s));
}
console.log('\n提示：本审计是建议性的，不阻断交付；`npm run check` 才是产物断言（18 条）。');
console.log(hard ? '硬问题（缺调研稿/坏 JSON/缺必填/剧透表不对齐）会让成品出现肉眼可见的空缺 —— 建议补完再渲染。' : '没有硬问题，可以直接交付。');

// ---- 退出码：默认 0 ----
// 它是"建议性、不阻断交付"的一步，却曾经在硬问题时返回 1：agent 用 `&&` 串步骤时会被它掐断，
// 后面的目检签署与 pack 根本不执行（CI 里也是靠 `npm run audit || true` 绕过）。
// 想让 CI/脚本按硬问题 gate，就显式加 --strict。
const STRICT = process.argv.includes('--strict');
const exitCode = (STRICT && hard) ? 1 : 0;
if (hard) {
  console.log(STRICT
    ? '（--strict：有硬问题 → 退出码 1）'
    : '（默认不阻断交付，退出码 0；要让 CI 按硬问题失败请加 --strict）');
}

// ---- 收据：整本一份 + 每部一份（后者是"哪几部做完了"的可续跑清单）----
const receipt = {
  version: 1,
  type: 'audit',
  generatedAt: new Date().toISOString(),
  root: ROOT,
  domain: DOMAIN,
  exitCode,
  strict: STRICT,
  counts: { works: works.length, complete: works.length - hard - soft, soft, hard },
  needFix,
  works: workReceipts,
};
try {
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 1), 'utf8');
  console.log('  收据 → ' + path.relative(ROOT, RECEIPT) + '（交付时 pack 会读它）');
} catch (e) {
  console.warn('  ⚠ 收据写入失败（不影响结论）：' + e.message);
}
try {
  fs.mkdirSync(WORK_RECEIPTS, { recursive: true });
  for (const w of workReceipts) {
    const safe = String(w.work).replace(/[\\/:*?"<>|]/g, '_');
    fs.writeFileSync(path.join(WORK_RECEIPTS, safe + '.json'), JSON.stringify({ ...w, generatedAt: receipt.generatedAt }, null, 1), 'utf8');
  }
  console.log('  每部收据 → ' + path.relative(ROOT, WORK_RECEIPTS) + '/（' + workReceipts.length + ' 份）');
} catch (e) {
  console.warn('  ⚠ 每部收据写入失败（不影响结论）：' + e.message);
}
process.exit(exitCode);

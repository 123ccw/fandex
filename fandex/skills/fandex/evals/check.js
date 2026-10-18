// 产物断言器（验收流程第 ④ 步）：在 npm run pipeline 之后执行
// 用法: npm run check（或 node evals/check.js）
// 纯 fs 实现，无第三方依赖、不启动子进程 —— 连 npm i 之前也能跑。
// 代价是"PDF 里到底有没有字、书签在不在"这类只有解析 PDF 才知道的事查不了：
// 那部分交给 evals/pdfprobe.js（用 pdfjs），它写 _pdfprobe.json 收据，本脚本负责读并判定（[C15]/[C16]）。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const cfgmod = require('../scripts/_config');
const { ROOT, BOOK, P, DOMAIN } = cfgmod;
// 每次运行都写一份结构化收据：pack 会读它生成交付说明里的"核验状态表"
const RECEIPT = P('anime_build', '_check.json');

let pass = 0, fail = 0;
const assertions = [];
function t(name, cond, detail) {
  const code = (name.match(/\[(C\d+)\]/) || [])[1] || null;
  assertions.push({ code, name, ok: !!cond, detail: cond ? null : (detail || null) });
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' —— ' + detail : '')); }
}

function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); }
  catch (e) { return null; }
}
function writeReceipt(exitCode) {
  const receipt = {
    version: 1,
    type: 'check',
    generatedAt: new Date().toISOString(),
    root: ROOT,
    book: BOOK,
    exitCode,
    counts: { pass, fail, total: assertions.length },
    assertions,
    failures: assertions.filter((a) => !a.ok).map((a) => a.code || a.name),
    artifacts: {
      html: sha256(P('anime_build', BOOK + '.html')),
      pdf: sha256(P('anime_build', BOOK + '.pdf')),
    },
  };
  try {
    fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
    fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 1), 'utf8');
    console.log('  收据 → ' + path.relative(ROOT, RECEIPT) + '（交付时 pack 会读它）');
  } catch (e) {
    console.warn('  ⚠ 收据写入失败（不影响结论）：' + e.message);
  }
  return receipt;
}

console.log('产物检查：项目根 = ' + ROOT + '\n');

// ① base.json
let base = null;
try { base = JSON.parse(fs.readFileSync(P('anime_base.json'), 'utf8')); t('[C1] anime_base.json 可解析', true); }
catch (e) { t('[C1] anime_base.json 可解析', false, e.message); }
const n = base ? Object.keys(base).length : 0;
t('[C2] 收录至少 1 部', n >= 1, '当前 ' + n + ' 部');

// ② 每部都有 research JSON
if (base) {
  const miss = Object.values(base).filter(r => !fs.existsSync(P('anime_research', r.folder + '.json'))).map(r => r.folder);
  t('[C3] 每部都有 research JSON', miss.length === 0, miss.join('、'));
}

// ③ HTML
const htmlPath = P('anime_build', BOOK + '.html');
let html = '';
try { html = fs.readFileSync(htmlPath, 'utf8'); t('[C4] HTML 已生成', true); }
catch (e) { t('[C4] HTML 已生成', false, e.message); }
t('[C5] HTML 无乱码替换符（U+FFFD）', html.indexOf('\uFFFD') < 0, '存在方块字，检查字体子集是否漏跑');
t('[C6] HTML 含章节结构', html.includes('class="show"'));

// ③.5 封面（声明了封面且文件存在的部，构建必须把它复制成 anime_build/covers/showNN.jpg 并渲染进 HTML）
// novel 领域：cover 属可选（references/domain-novel.md「无也可，自动降级为纯排印」）→ 未声明只记降级，不判失败；
// 但「声明了却找不到文件」在两种领域下都仍是硬失败（否则等于把 [C7] 放空）。
if (base) {
  let covDeclared = 0;
  const bad = [];        // 会导致成品缺封面的问题，无条件报出来（不再只在断言失败时才可见）
  const degraded = [];   // novel 专属：未声明 cover，按设计降级，不影响 [C7]
  const recs = Object.values(base);
  for (const [i, rec] of recs.entries()) {
    const slug = 'show' + String(i + 1).padStart(2, '0');   // 与 build_anime_html.js 的 slug 规则一致
    let r = null;
    try { r = JSON.parse(fs.readFileSync(P('anime_research', rec.folder + '.json'), 'utf8')); }
    catch (e) { bad.push(rec.folder + '(research JSON 解析失败：' + e.message + ')'); continue; }
    if (!r.cover) {
      if (DOMAIN === 'novel') degraded.push(rec.folder);
      else bad.push(rec.folder + '(未声明 cover)');
      continue;
    }
    if (!fs.existsSync(P('anime_research', r.cover))) { bad.push(rec.folder + '(cover 文件不存在：' + r.cover + ')'); continue; }
    covDeclared++;
    // 构建端复制后的目标文件名固定为 .jpg（与源扩展名无关）
    if (!fs.existsSync(P('anime_build', 'covers', slug + '.jpg'))) bad.push(rec.folder + '(未复制到 anime_build/covers/' + slug + '.jpg)');
  }
  if (bad.length) console.log('    · 封面异常：' + bad.join('、'));
  if (degraded.length) console.warn('    · novel 模式：' + degraded.join('、') + ' 未声明 cover —— 按设计降级为纯排印（不判 [C7] 失败）');
  const imgCount = (html.match(/<img /g) || []).length;
  t('[C7] 封面图已渲染（无缺失 + img 数 ≥ 有效声明数）', bad.length === 0 && imgCount >= covDeclared,
    'img=' + imgCount + ' 有效声明=' + covDeclared + (bad.length ? '；' + bad.join('、') : '')
      + (degraded.length ? '；novel 降级 ' + degraded.length + ' 部（未声明 cover）' : ''));
}

// ③.6 统计数字：不应出现首尾相同的年份区间（如 "2015-2015"）
const dupSpan = html.match(/\b(\d{4})-\1\b/);
t('[C8] 无首尾相同的年份区间（如 2015-2015）', !dupSpan, dupSpan ? '命中：' + dupSpan[0] : '');

// ④ PDF
const pdfPath = P('anime_build', BOOK + '.pdf');
let pdfSize = 0;
try { pdfSize = fs.statSync(pdfPath).size; } catch (e) { /* 不存在 */ }
t('[C9] PDF 已生成且大于 50KB', pdfSize > 51200, pdfSize ? pdfSize + 'B' : '不存在');

// ⑤ 页码映射全命中（n > 0 是防"空集恒真"：0 部作品时 0 === 0 会假绿）
try {
  const map = JSON.parse(fs.readFileSync(P('anime_build', '_pagemap.json'), 'utf8'));
  t('[C10] 页码映射条目数 = 收录部数', n > 0 && Object.keys(map).length === n,
    n > 0 ? Object.keys(map).length + ' / ' + n : '一部都没收录（见 [C2]），页码映射无从校验');
} catch (e) { t('[C10] 页码映射存在且可解析', false, e.message); }

// ⑥ 目录页码 = 最终书签页码（两轮渲染稳定性的机器断言；目录印的是第 1 轮的页码，_pagemap.json 是第 2 轮实测）
try {
  const map = JSON.parse(fs.readFileSync(P('anime_build', '_pagemap.json'), 'utf8'));
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const rows = [...html.matchAll(/<a href="#show\d+">([^<]+)<\/a>[\s\S]*?<span class="pg">([^<]*)<\/span><\/li>/g)];
  const bad = [];
  for (const [, tHtml, pg] of rows) {
    const key = unesc(tHtml);
    const want = map[key] != null ? String(map[key]).padStart(3, '0') : '·';
    if (pg !== want) bad.push(key + '：目录 ' + pg + ' vs 实际 ' + want);
  }
  t('[C11] 目录页码与最终书签一致', rows.length > 0 && bad.length === 0,
    rows.length === 0 ? '未从 HTML 解析到目录行（HTML 结构变了？）' : bad.slice(0, 3).join('；'));
} catch (e) { /* pagemap 缺失时 ⑤ 已报错，不重复计失败 */ }

// ⑦ 两轮页码一致（收敛性）：目录页码与 _pagemap.json 都来自第二轮，只比这两个是自证的——必须比上一轮
try {
  const cur = JSON.parse(fs.readFileSync(P('anime_build', '_pagemap.json'), 'utf8'));
  const prev = JSON.parse(fs.readFileSync(P('anime_build', '_pagemap.prev.json'), 'utf8'));
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort();
  const drift = keys.filter(k => prev[k] !== cur[k]).map(k => k + '：上轮 ' + prev[k] + ' → 本轮 ' + cur[k]);
  t('[C12] 两轮页码一致（已收敛）', drift.length === 0, drift.slice(0, 3).join('；'));
} catch (e) {
  t('[C12] 两轮页码一致（已收敛）', false, '缺少 _pagemap.prev.json —— 请用 `npm run pipeline` 跑满两轮再验收（单轮产物无法判断是否收敛）');
}

// ⑧ 封面封底页已生成
t('[C13] 封面封底页已生成', html.includes('cover-pg') && html.includes('back-pg'));

// ⑨ PDF 层：体积上限（字体子集化是本 skill 的核心卖点；它一失控，PDF 会无声膨胀）
const MAX_PDF_MB = Number(process.env.ANIME_BOOK_MAX_PDF_MB) > 0 ? Number(process.env.ANIME_BOOK_MAX_PDF_MB) : 25;
t('[C14] PDF 体积在阈值内（' + MAX_PDF_MB + 'MB，字体子集未失控）',
  pdfSize > 0 && pdfSize <= MAX_PDF_MB * 1024 * 1024,
  pdfSize ? (pdfSize / 1024 / 1024).toFixed(1) + 'MB 超阈值 —— 检查字体有没有被子集化（pipeline 第一步），或用 ANIME_BOOK_MAX_PDF_MB 调整阈值'
    : 'PDF 不存在（见 [C9]）');

// ⑩ PDF 层深检：读 pdfprobe 的收据（缺了就是没跑探针——正常走 npm run check 不会缺）
let probe = null;
try { probe = JSON.parse(fs.readFileSync(P('anime_build', '_pdfprobe.json'), 'utf8')); } catch (e) { /* 未跑探针 */ }
const probeHow = '缺 _pdfprobe.json —— 跑 `npm run probe`（`npm run check` 已串联，正常不会缺）';
if (!probe) {
  t('[C15] PDF 正文含每部作品名（防字体子集吞字）', false, probeHow);
  t('[C16] PDF 书签含每部作品名（页码反查的输入源）', false, probeHow);
} else if (probe.error) {
  // 用探针写下的可读解释（errorText），别把 pdf-missing 这种内部标识符抛给用户
  const why = '探针未能运行：' + (probe.errorText || probe.error);
  t('[C15] PDF 正文含每部作品名（防字体子集吞字）', false, why);
  t('[C16] PDF 书签含每部作品名（页码反查的输入源）', false, why);
} else {
  // 缺字在 PDF 里的表现不是 U+FFFD 而是"整段消失"——只能在提取出的正文里找名字（[C5] 查的是 HTML，查不到这个）
  // works > 0 是防"空通过"：作品名解析不出来时，两个 filter 都会得到空数组，断言会假绿
  const missText = probe.missingInText || [];
  t('[C15] PDF 正文含每部作品名（防字体子集吞字）',
    probe.works > 0 && missText.length === 0 && probe.bookTitleInText !== false,
    (probe.works > 0 ? '' : '探针没解析出任何作品名（anime_base.json / anime_research 有问题）')
      + (missText.length ? '正文里找不到：' + missText.join('、') : (probe.works > 0 ? '书名不在正文里' : ''))
      + ' —— 文案改过就重跑 `npm run pipeline`（会重做字体子集）');
  // 书签是 _pagemap 的唯一输入：它没了，目录页码必然停在占位符
  const missOutline = probe.missingInOutline || [];
  t('[C16] PDF 书签含每部作品名（页码反查的输入源）',
    probe.works > 0 && missOutline.length === 0,
    (probe.works > 0 ? '' : '探针没解析出任何作品名；')
      + '书签里找不到：' + missOutline.join('、') + '（书签 = 目录页码的来源，丢了目录页码会留占位符）');
}

// ⑪ 书签重名：页码反查以标题为键，重名必然取到错误那一页。
// 实测场景：书名与某部作品名相同（单部册最常见）→ 总览页标题也生成书签 → 该部目录页码印成总览页页码，
// 而 [C10]/[C11]/[C12] 全绿（错得自洽）。只统计作品名/书名这类"当键用"的标题，避免小节重名误报。
const dupTitles = (probe && !probe.error && probe.duplicateOutlineTitles) || [];
t('[C17] 书签标题无重复（重复会让页码反查取错页）',
  !!probe && !probe.error && probe.works > 0 && dupTitles.length === 0,
  !probe ? probeHow
    : (probe.error ? '探针未能运行：' + (probe.errorText || probe.error)
      : (probe.works > 0
        ? '重复书签：' + dupTitles.join('、') + ' —— 典型原因：书名与某部作品名相同（总览页标题也进了书签）；改书名，或让总览页标题不生成书签'
        : '探针没解析出任何作品名（anime_base.json / anime_research 有问题）')));

// ⑫ 数说页新增统计（单元构成 / 时长估算 / 类型 TOP3 / 平均评分）：纯呈现层，坏了不会影响页码，
//    但"类型排行/时长"是 v1.10 的主要卖点，静默消失很难被发现 → 按数据条件断言。
let anyMultiGenre = false, anyRating = false;
if (base && DOMAIN === 'anime') {
  for (const r of Object.values(base)) {
    try {
      const j = JSON.parse(fs.readFileSync(P('anime_research', r.folder + '.json'), 'utf8'));
      if (Array.isArray(j.genres) && j.genres.length > 1) anyMultiGenre = true;
      if (Array.isArray(j.rating) && j.rating.some(x => x && Number(x.score) > 0)) anyRating = true;
    } catch (e) { /* 缺调研稿由 [C3]/[A1] 报，这里不重复 */ }
  }
}
const miniNeed = DOMAIN === 'anime' ? [
  html.includes('单元构成'),
  html.includes('时长估算'),
  !anyMultiGenre || html.includes('类型 TOP3'),
  !anyRating || html.includes('平均评分'),
] : [true];
t('[C18] 数说页含补充统计（单元构成 / 时长估算 / 类型 TOP3 / 平均评分）',
  miniNeed.every(Boolean),
  DOMAIN !== 'anime' ? 'novel 域不适用（跳过）'
    : '数说页缺少补充统计块 —— 检查 build_anime_html.js 的 miniBlocks / stats 逻辑是否被改坏');

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败' + (fail ? '（回到 SKILL.md 的坑位清单排查）' : ''));
writeReceipt(fail ? 1 : 0);
process.exit(fail ? 1 : 0);

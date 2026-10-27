// PDF 层探针（验收第 ④.5 步）：PDF 里到底有没有字、书签在不在
//
// 为什么单独一个脚本：check.js 是"纯 fs、零第三方依赖"（连 npm i 之前都能跑），
// 而"字体子集缺字"和"书签丢失"只有真的解析 PDF 才知道。所以深检放这里，
// 结论写成收据 `anime_build/_pdfprobe.json`，由 check.js 读——与 pack 读 _check.json 同一个模式。
//
// 用法: npm run probe      （`npm run check` 已串联：跑 check 会先跑它）
// 退出码: 永远 0。探针跑不起来时把原因写进收据，由 check 报成失败——
//         否则 `npm run check` 的 && 链会在这里被掐断，验收直接不跑了。
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

const SKILL = path.resolve(__dirname, '..');
const { ROOT, BOOK, P } = require('../scripts/_config');
const PDF = P('anime_build', BOOK + '.pdf');
const RECEIPT = P('anime_build', '_pdfprobe.json');

function writeReceipt(obj) {
  try {
    fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
    fs.writeFileSync(RECEIPT, JSON.stringify(obj, null, 1), 'utf8');
    console.log('  探针收据 → ' + path.relative(ROOT, RECEIPT));
  } catch (e) {
    console.warn('  ⚠ 探针收据写入失败（不影响结论）：' + e.message);
  }
  return obj;
}

// pdfjs 装在 scripts/node_modules，而本文件在 evals/ —— Node 的裸模块解析找不到。
// 用 createRequire 从 scripts/ 出发解析；pdfjs 的 exports 映射各版本不一，逐个试再用包目录拼。
function resolvePdfjs() {
  const req = createRequire(path.join(SKILL, 'scripts', 'package.json'));
  let hit = null;
  for (const spec of ['pdfjs-dist/package.json', 'pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist']) {
    try { hit = req.resolve(spec); break; } catch (e) { /* 试下一个 */ }
  }
  if (!hit) return null;
  const idx = hit.replace(/\\/g, '/').lastIndexOf('pdfjs-dist');
  if (idx < 0) return null;
  const entry = path.join(hit.slice(0, idx) + 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
  return fs.existsSync(entry) ? entry : null;
}

function flatOutline(items, acc) {
  for (const it of items || []) {
    acc.push(it.title || '');
    flatOutline(it.items, acc);
  }
  return acc;
}

// 探针跑不起来时的可读解释：check 会把它原样印在 [C15]/[C16] 的 detail 里。
// 没有这张表的话，用户会看到 "探针未能运行：pdf-missing" 这种内部标识符，被带偏到字体子集上去排查。
const ERR_TEXT = {
  'pdf-missing': '还没渲染出 PDF —— 先跑 `npm run pipeline`（见 [C9]）',
  'pdfjs-unavailable': '读不到 pdfjs-dist —— 在 scripts/ 目录执行 npm i',
};

(async () => {
  const base = { version: 1, type: 'pdfprobe', generatedAt: new Date().toISOString(), root: ROOT, book: BOOK };

  if (!fs.existsSync(PDF)) {
    writeReceipt(Object.assign(base, { error: 'pdf-missing', errorText: ERR_TEXT['pdf-missing'] }));
    console.log('PDF 层探针：跳过（未找到 ' + PDF + '）');
    return;
  }
  const sizeBytes = fs.statSync(PDF).size;

  const pdfEntry = resolvePdfjs();
  if (!pdfEntry) {
    writeReceipt(Object.assign(base, { error: 'pdfjs-unavailable', errorText: ERR_TEXT['pdfjs-unavailable'], sizeBytes }));
    console.log('PDF 层探针：跳过（读不到 pdfjs-dist —— 在 scripts/ 目录执行 npm i）');
    return;
  }

  const { resolveTitles, norm } = require('../scripts/_titles');
  let titles = [];
  try { titles = resolveTitles(ROOT); } catch (e) { /* base.json 坏了由 [C1] 报 */ }

  let pdfjs;
  try { pdfjs = await import(pathToFileURL(pdfEntry).href); }
  catch (e) {
    writeReceipt(Object.assign(base, { error: 'pdfjs-import-failed: ' + e.message, sizeBytes }));
    console.log('PDF 层探针：跳过（pdfjs 导入失败：' + e.message + '）');
    return;
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), useSystemFonts: true }).promise;

  // 正文全量文本（跨页拼接后去空格）
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    text += tc.items.map((it) => it.str).join('');
  }
  const flatText = norm(text);

  const outline = await doc.getOutline();
  const items = flatOutline(outline, []);
  const flatOutlineText = norm(items.join('\u0000'));

  const missingInText = titles.filter((t) => !flatText.includes(norm(t)));
  const missingInOutline = titles.filter((t) => !flatOutlineText.includes(norm(t)));

  // 书签重名检测：页码反查以"标题"为键，重名会让它取到错误的那一页。
  // 最典型的来源是"书名 = 某部作品名"——总览页标题也是 h1，于是 PDF 里有两条同名书签，
  // pagemap 取最小页 → 目录印出总览页页码（该章实际在后面的页）。[C17] 就是抓这个。
  //
  // 只统计"页码反查真正当键用"的标题（作品名 + 书名）：章节内小节标题（如每部都有的「补记」）
  // 天然会在多部之间重名，把它们算进来会造成误报。
  const titleCount = new Map();
  for (const t of items) {
    const k = norm(t);
    if (!k) continue;
    titleCount.set(k, (titleCount.get(k) || 0) + 1);
  }
  const keyTitles = new Set([...titles.map(norm), BOOK ? norm(BOOK) : ''].filter(Boolean));
  const duplicateOutlineTitles = [...titleCount.entries()]
    .filter(([k, c]) => c > 1 && keyTitles.has(k))
    .map(([k]) => k);

  writeReceipt(Object.assign(base, {
    pages: doc.numPages,
    sizeBytes,
    outlineCount: items.length,
    works: titles.length,
    bookTitleInText: BOOK ? flatText.includes(norm(BOOK)) : null,
    textChars: flatText.length,
    missingInText,
    missingInOutline,
    duplicateOutlineTitles,
  }));

  console.log('PDF 层探针：' + doc.numPages + ' 页 · 书签 ' + items.length + ' 条 · 正文 ' + flatText.length + ' 字');
  if (missingInText.length) console.log('  ⚠ 正文里找不到这些作品名：' + missingInText.join('、'));
  if (missingInOutline.length) console.log('  ⚠ 书签里找不到这些作品名：' + missingInOutline.join('、'));
  if (duplicateOutlineTitles.length) console.log('  ⚠ 书签标题重复（页码反查会取错页）：' + duplicateOutlineTitles.join('、'));
})().catch((e) => {
  // 任何意外都不设非零退出码：写一份 error 收据，让 check 去判失败
  const msg = String(e && e.message || e);
  writeReceipt({ version: 1, type: 'pdfprobe', generatedAt: new Date().toISOString(), root: ROOT, book: BOOK, error: msg, errorText: '探针运行出错：' + msg.split('\n')[0] });
  console.log('PDF 层探针：出错（已记进收据，由 check 判定）——' + msg.split('\n')[0]);
});

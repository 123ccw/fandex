// 从上一轮渲染的 PDF 书签反查每部起始页 → ROOT/anime_build/_pagemap.json
// 依赖：本目录先执行 `npm i pdfjs-dist`
// 用法: node anime_pagemap.js
const fs = require('fs');
const path = require('path');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { ROOT, BOOK } = require('./_config');
const PDF = path.join(ROOT, 'anime_build', BOOK + '.pdf');

(async () => {
  if (!fs.existsSync(PDF)) {
    console.error('未找到 ' + PDF + ' ——请先跑渲染（npm run pipeline，或单独 node render_pw.js）'); process.exit(1);
  }
  // pdfjs-dist 的 .mjs 是 ESM；用动态 import 加载，兼容 Node >=20（require(ESM) 需 20.19+/22.12+）
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(PDF));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const outline = await doc.getOutline();
  if (!outline) { console.error('no outline'); process.exit(2); }

  // Chromium 生成的书签标题会吞掉部分空格 → 去空格比对
  // 标题来源与去空格规则集中在 _titles.js（pdfprobe 用的是同一份，别在这里另写一套）
  const { resolveTitles, norm } = require('./_titles');
  const titles = resolveTitles(ROOT);

  async function pageOf(dest) {
    let d = dest;
    if (typeof d === 'object' && d !== null && !Array.isArray(d)) d = d.dest || d.url;
    if (!d) return null;
    const ref = Array.isArray(d) ? d[0] : null;
    if (ref && typeof ref === 'object' && ref.num != null) return (await doc.getPageIndex(ref)) + 1;
    if (typeof d === 'string') {
      const exp = await doc.getDestination(d);
      if (exp) return (await doc.getPageIndex(exp[0])) + 1;
    }
    return null;
  }

  const map = {};
  // 同一部作品被多条书签命中时记下全部页码：取最小页是"章节起始页"的正确语义，
  // 但如果命中页互不相同，说明书签里有重名（最典型：书目 = 某部作品名），需要报出来。
  const hitPages = new Map();
  for (const item of outline) {
    const t = norm(item.title);
    // 匹配优先级：完全相同 > 最长的被包含标题（避免 "Fate" 抢走 "Fate Zero" 的页码）
    const exact = titles.filter(x => norm(x) === t);
    const cand = exact.length
      ? exact
      : titles.filter(x => t.includes(norm(x)) || norm(x).includes(t)).sort((a, b) => norm(b).length - norm(a).length);
    const hit = cand[0];
    if (!hit) continue;
    const p = await pageOf(item.dest);
    if (!p) continue;
    if (!hitPages.has(hit)) hitPages.set(hit, new Set());
    hitPages.get(hit).add(p);
    if (map[hit] == null || p < map[hit]) map[hit] = p;
  }
  const out = path.join(ROOT, 'anime_build', '_pagemap.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // 留一份上一轮映射：只比"目录页码 vs 本轮 _pagemap.json"是自证的（两者同轮），
  // check 靠这个 prev 文件断言两轮收敛（见 evals/check.js ⑦）
  if (fs.existsSync(out)) {
    try { fs.copyFileSync(out, path.join(path.dirname(out), '_pagemap.prev.json')); } catch (e) { /* 首次运行没有上一轮 */ }
  }
  // 原子写：中断/磁盘满时不会留下截断的 JSON（截断会被 build 当成"空映射"，目录页码全变「·」）
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map, null, 1));
  fs.renameSync(tmp, out);
  console.log('pagemap:', JSON.stringify(map));
  const ambiguous = [...hitPages.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => k + '（第 ' + [...s].sort((a, b) => a - b).join('/') + ' 页都命中）');
  if (ambiguous.length) {
    console.warn('⚠ 书签重名，页码可能取错：' + ambiguous.join('、'));
    console.warn('  典型原因：书名与某部作品名相同（总览页标题也会生成书签）→ 目录页码会印成总览页页码。');
    console.warn('  `npm run check` 的 [C17] 会把它算作失败。');
  }
  const missing = titles.filter(t => map[t] == null);
  if (missing.length) {
    // 只告警、不设非零退出码：pipeline 是 && 链，退出码会掐断第二轮 build/render，
    // 让目录页码永远停在占位符。让流程跑完两轮，由 `npm run check` 把缺失报成失败。
    console.warn('⚠ 未命中书签（这些作品目录页码会留占位符）:', missing.join('、'));
    console.warn('  排查：书名是否与书签标题一致（空格外全等）；`npm run check` 会把它算作失败。');
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

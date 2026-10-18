// 番剧收藏册构建：anime_base.json + anime_research/*.json → 排版 HTML（每部主题色杂志风）
// ★ 首次使用：改同目录 config.json 的 root（项目根 = 放 anime_base.json / anime_research / fonts 的文件夹）
// 用法: node build_anime_html.js
// 输入: ROOT/anime_base.json + ROOT/anime_research/*.json + ROOT/fonts/wk-sub-*.woff2（由 collect_fonts.js 生成）
// 输出: ROOT/anime_build/<书名>.html（含 covers/ 封面副本）
const fs = require('fs');
const path = require('path');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { CFG, ROOT, BOOK } = require('./_config');
const userdata = require('./_userdata');   // 用户数据层（P0）：本文件只读
const VROOT = CFG.vroot || '';               // 模式 B（本机视频库）才填；模式 A 留空
const BOOK_TITLE = BOOK;   // 书名（封面/总览/封底共用；同时是输出文件名，全书统一）

// ---- 领域包：anime（默认）/ novel ——界面标签整体切换，数据字段结构完全不变 ----
// novel（小说设定集）：每"部"=一个角色/势力；units=登场卷篇(eps=章数)；franchise=伏笔表(collected=已回收)
const DOMAIN = CFG.domain === 'novel' ? 'novel' : 'anime';
const L = DOMAIN === 'novel' ? {
  m1: '角色档案', m2: 'CHARACTER CODEX', kick: 'CHARACTER CODEX',
  person: '位', stWorks: '位 角色', stUnit: '篇章', stEps: '章 收录', stSpan: '时间跨度',
  unitCnt: '篇', chapName: '章', heroLine: '篇幅', firstAir: '初登场', airUnit: '部连载中',
  colUnit: '篇', colEps: '章数', colAir: '时间', colSop: '弧线（含剧透）', epsSuffix: '章',
  hSyn: '角色小传', hProd: '设定要点', hMusic: '关系与登场', mkMusic: '重要关系', mkPlat: '登场卷',
  hSource: '出处', hOrder: '登场顺序', hUpdate: '近况', hDetail: '出场详情',
  myScore: '我的评分', hMyComment: '我的短评',
  frHero: '伏笔进度', frCard: '伏笔回收', frWait: '未回收', frDone: '已全部回收 ✓', frDoneShort: '全回收 ✓',
  almTitle: '数说设定', almTotal: '档案总量', almSpan: '连载跨度', almLong: '戏份最重',
  almGenre: '高频标签', almDecade: '年代分布', almDone: '完结 / 连载中', almAllDone: '全部档案已完结',
  almFr: '待回收伏笔', almFrSub0: '全部伏笔均已回收', almFrSubN: '各角色盘点出的未回收伏笔',
  tail: '角色弧线 · 设定要点 · 近况 · 出场清单', cardBadge: '档案卡',
} : {
  m1: '番剧收藏', m2: 'ANIME COLLECTION', kick: 'ANIME COLLECTION',
  person: '部', stWorks: '部 作品', stUnit: '个单元', stEps: '集 收藏', stSpan: '收录年份跨度',
  unitCnt: '个单元', chapName: '集', heroLine: '收藏', firstAir: '首播', airUnit: '部正在放送',
  colUnit: '单元', colEps: '集数', colAir: '首播', colSop: '剧情（含剧透）', epsSuffix: '集',
  hSyn: '剧情简介', hProd: '制作与声优', hMusic: '主题歌与观看', mkMusic: '主题歌', mkPlat: '观看平台',
  hSource: '原作情报', hOrder: '补番顺序', hUpdate: '动画更新', hDetail: '收藏详情',
  myScore: '我的评分', hMyComment: '我的短评',
  frHero: '系列收录', frCard: '系列条目', frWait: '待补', frDone: '已收全 ✓', frDoneShort: '收齐 ✓',
  almTitle: '数说收藏', almTotal: '收藏总量', almSpan: '收录跨度', almLong: '最长系列',
  almGenre: '最高频类型', almDecade: '年代分布', almDone: '完结 / 放送中', almAllDone: '收录作品全部完结',
  almFr: '待补条目', almFrSub0: '全部系列条目均在收藏中', almFrSubN: '各系列盘点出的未收条目',
  tail: '剧情一览 · 原作情报 · 更新动态 · 收藏清单', cardBadge: '收藏卡',
};
// 构建/调研过程中发现的数据问题（字段形状不对、JSON 解析失败等）；末尾非空则 exit 1
const warnings = [];
// 字段形状严格化：null/undefined 是正常缺省；真数组原样返回；其它类型告警并计入 warnings
function arrStrict(v, field, work) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  console.warn('⚠ 字段形状不对（应为数组）：' + work + '.' + field);
  warnings.push(work + '.' + field);
  return [];
}
// 统一 JSON 读取：剥 BOM（PowerShell/记事本常见）并给出中文解析原因
function readJson(file) {
  let txt = fs.readFileSync(file, 'utf8');
  const bom = txt.charCodeAt(0) === 0xFEFF;
  if (bom) txt = txt.slice(1);
  try { return JSON.parse(txt); }
  catch (e) { throw new Error('JSON 解析失败（' + file + (bom ? '，文件带 BOM' : '') + '）：' + e.message); }
}
const BASE_FILE = path.join(ROOT, 'anime_base.json');
if (!fs.existsSync(BASE_FILE)) {
  console.error('未找到 ' + BASE_FILE + ' ——模式 A 请先跑 npm run base；或检查 config.json 的 root 是否指向项目根'); process.exit(1);
}
let base;
try { base = readJson(BASE_FILE); }
catch (e) { console.error('无法读取 ' + BASE_FILE + '：' + e.message); process.exit(1); }

// 数据归一化：调研 JSON 是 LLM 产出的不可信输入，eps/airdate 可能是字符串——
// 字符串 eps 会让求和变拼接（"012"），字符串时间戳会让 new Date 解析成 Invalid Date 直接抛错
const toMs = v => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n >= 1e12) return n;                    // 13 位以上：毫秒时间戳
    if (n >= 1e9 && n < 1e10) return n * 1000;  // 10 位：秒时间戳
    console.warn('⚠ 时间值不可信（既非毫秒也非秒时间戳），已置空：' + v);   // 如 2022 / 20221008，静默变 1970 更糟
    return null;
  }
  const p = Date.parse(v);   // 非纯数字字符串走 Date.parse 兜底（如 "2022-04-05"）
  return Number.isFinite(p) ? p : null;
};
for (const [k, s] of Object.entries(base)) {
  s.airdate = toMs(s.airdate);
  s.units = arrStrict(s.units, 'units', s.folder || k).map(u => ({ ...u, eps: Number(u.eps) || 0, airdate: toMs(u.airdate) }));
}

// 目录页码：_pagemap.json 由 anime_pagemap.js 从上一轮渲染的 PDF 书签导出；两轮构建布局一致
let PAGE_MAP = {};
const pagemapFile = path.join(ROOT, 'anime_build', '_pagemap.json');
if (fs.existsSync(pagemapFile)) {
  try { PAGE_MAP = readJson(pagemapFile); } catch (e) { console.error('bad pagemap:', e.message); }
}
const pgOf = t => (PAGE_MAP[t] != null ? String(PAGE_MAP[t]).padStart(3, '0') : '·');

// 调研成果合并
const research = {};
const researchErrors = [];   // 文件存在但解析失败——与"文件不存在/没命中"分开报
const rdir = path.join(ROOT, 'anime_research');
if (fs.existsSync(rdir)) {
  for (const f of fs.readdirSync(rdir).filter(f => f.endsWith('.json'))) {
    try {
      const r = readJson(path.join(rdir, f));
      research[r.folder] = r;
    } catch (e) {
      console.error('bad research json:', f, e.message);
      researchErrors.push(f);
      warnings.push('research:' + f);
    }
  }
}

const DEFAULT_ACCENT = '#4f46e5';

// ---- 主题色自动提取：取封面主导色相（去黑白灰/低饱和，饱和度加权），S/L 固定保证全书各章明度一致 ----
function hslHex(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}
async function extractAccent(imgPath) {
  try {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const img = await loadImage(imgPath);
    const S = 64, c = createCanvas(S, S), ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const wHue = new Array(36).fill(0); let tot = 0, satSum = 0;
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
      const lum = (mx + mn) / 510, sat = mx ? df / mx : 0;
      if (lum < 0.14 || lum > 0.9 || sat < 0.2) continue;
      let hh = mx === r ? ((g - b) / df) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4;
      hh = Math.floor((((hh * 60) + 360) % 360) / 10);
      const w = sat * sat; wHue[hh] += w; satSum += w * sat; tot += w;
    }
    if (!tot) return '';
    let best = 0; for (let k = 1; k < 36; k++) if (wHue[k] > wHue[best]) best = k;
    const avgSat = satSum / tot;
    return hslHex(best * 10 + 5, Math.min(0.72, Math.max(0.45, avgSat * 1.15)), 0.42);
  } catch (e) { console.warn('⚠ 封面取色失败（' + imgPath + '）:', e.message); return ''; }
}

// ---- 文楷子集 data URI（collect_fonts.js 生成） ----
const FONT_R = path.join(ROOT, 'fonts', 'wk-sub-regular.woff2');
const FONT_M = path.join(ROOT, 'fonts', 'wk-sub-medium.woff2');
for (const f of [FONT_R, FONT_M]) {
  if (!fs.existsSync(f)) {
    console.error('未找到 ' + f + ' ——请先跑字体子集（npm run pipeline，或单独 node collect_fonts.js）'); process.exit(1);
  }
}
const WK_REG = fs.readFileSync(FONT_R).toString('base64');
const WK_MED = fs.readFileSync(FONT_M).toString('base64');

// ---- 颜色工具 ----
function hexRgb(h) { const s = h.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function shade(h, f) { const [r, g, b] = hexRgb(h); return `#${[r, g, b].map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`; }
function varsFor(ac) {
  return `--ac:${ac};--ac-dark:${shade(ac, .72)};--ac-ink:${shade(ac, .5)};--ac-tint:${rgba(ac, .07)};` +
    `--ac-tint2:${rgba(ac, .13)};--ac-faint:${rgba(ac, .22)};`;
}
// 转义覆盖元素内容与双引号属性位（title 等字段将来挪进属性也不会破）
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// production 文本 → { staff:[[键,值]], cast:[[角色,CV]] }（失败时返回 null，调用处降级原文本渲染）
function splitProduction(s) {
  let t = String(s).replace(/[（(]来源[:：][^)）]*[)）]/g, '').trim();
  let castPart = '';
  const m = t.match(/[。；;]?\s*(?:主要|主役)?声优[:：]([\s\S]+)$/);
  if (m) { castPart = m[1].trim(); t = t.slice(0, m.index); }
  const staff = t.split(/[；;]/).map(x => x.trim().replace(/[。.]$/, '')).filter(Boolean).map(seg => {
    const i = seg.search(/[:：]/);
    if (i < 0) return ['', seg];
    const v = seg.slice(i + 1).trim();
    if (!v) return ['', seg];
    return [seg.slice(0, i).trim(), v];
  });
  const cast = castPart.split(/[、,]/).map(x => x.trim()).filter(Boolean).map(x => {
    // 先试「角色（CV）」形式：角色名本身常含中点（如 泽村·斯潘塞·英梨梨），先按中点拆会拆错
    let mm = x.match(/^(.+?)[（(](.+?)[)）]$/);
    if (mm) return [mm[1].trim(), mm[2].trim()];
    mm = x.match(/^(.+?)[·・](.+)$/);
    if (mm) return [mm[1].trim(), mm[2].trim()];
    return ['', x];
  });
  if (!staff.length && !cast.length) return null;
  return { staff, cast };
}
function stClass(s) {
  // 「已完结 / 完结 / 完结篇」= 灰；但「未完结」不算（负向后顾排除）
  if (/(?<!未)完结/.test(s)) return 'std-done';
  if (/放送中|连载中/.test(s)) return 'std-air';   // novel 领域的状态词是「连载中」
  return 'std-soon';
}

const fmtDate = ts => ts ? new Date(ts).toISOString().slice(0, 10).replace(/-/g, '.') : '';
const totalEps = r => arrStrict(r.units, 'units', r.folder || '?').reduce((s, u) => s + (u.eps || 0), 0);
// 单元数口径与收藏详情表一致：eps 缺失/为 0 的单元（如剧场版）也保留在表里，一并计入
const unitCount = r => arrStrict(r.units, 'units', r.folder || '?').length;
// 当前年月（UTC 口径，与 fmtDate 一致）——总览刊头 + 各章刊头共用，避免年份写死
const NOW = (() => { const d = new Date(); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0'); })();   // 本地时区：用 UTC 会让跨月跑的两轮刊头月份不同，白添漂移源

// ---- 封面副本：research.cover（官方海报覆盖）优先，否则取视频库内封面（模式 B） ----
const OUT = path.join(ROOT, 'anime_build');
fs.mkdirSync(OUT, { recursive: true });
const coverDir = path.join(OUT, 'covers');
fs.mkdirSync(coverDir, { recursive: true });
function localCoverSrc(rec, slug) {
  if (!VROOT || !rec.cover) return '';
  const src = path.join(VROOT, rec.folder, rec.cover);
  const dst = path.join(coverDir, slug + '.jpg');
  try { fs.copyFileSync(src, dst); return 'covers/' + slug + '.jpg'; }
  catch (e) { console.error('cover copy fail:', rec.folder, e.message); return ''; }
}

// ---- CSS ----
const CSS = `
  @font-face { font-family: "LXGW WenKai"; src: url(data:font/woff2;base64,${WK_REG}) format('woff2'); font-weight: 400; }
  @font-face { font-family: "LXGW WenKai"; src: url(data:font/woff2;base64,${WK_MED}) format('woff2'); font-weight: 500 900; }
  @page { size: A4; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: "LXGW WenKai", "Noto Sans SC", "Microsoft YaHei", sans-serif; color: #26262b;
         font-size: 11pt; line-height: 1.78; line-break: strict; word-break: normal; overflow-wrap: break-word; }
  .page { width: 210mm; padding: 14mm 15mm 16mm; }

  /* ===== 首页总览 ===== */
  .thd .kick { font-size: 9pt; font-weight: 500; letter-spacing: .32em; color: #4f46e5; margin-bottom: 3mm; }
  /* 总览页大标题故意不用 h1：Chromium 会把 h1 变成 PDF 书签，与同名章节页书签撞车 */
  .thd h1, .thd .thd-title { font-family: "LXGW WenKai"; font-weight: 700; font-size: 31pt; margin: 0 0 3.5mm; color: #141419; }
  .thd .sub { color: #6b6b76; font-size: 10.5pt; }
  .thd { border-bottom: 1.6px solid #4f46e5; padding-bottom: 6mm; margin-bottom: 8mm; }
  .stats { display: flex; gap: 5mm; margin: 0 0 8mm; }
  .stats .st { flex: 1; background: #f4f4f8; border-radius: 2.5mm; padding: 3.5mm 5mm; text-align: center; }
  .stats .st b { display: block; font-family: "LXGW WenKai"; font-weight: 700; font-size: 17pt; color: #4f46e5; }
  .stats .st span { font-size: 8.5pt; color: #6b6b76; letter-spacing: .08em; }
  .toc h2 { font-family: "LXGW WenKai"; font-weight: 700; font-size: 15pt; color: #141419; margin: 6mm 0 2.5mm;
            display: flex; align-items: baseline; gap: 3mm; }
  .toc h2 .cnt { margin-left: auto; font-size: 8.5pt; color: #6b6b76; background: #f1f1f4;
                 padding: .6mm 3mm; border-radius: 3mm; letter-spacing: .05em; }
  .toc ol { margin: 0; padding-left: 8mm; column-count: 2; column-gap: 10mm; }
  .toc li { margin: 1.5mm 0; break-inside: avoid; }
  .toc li::marker { color: #4f46e5; }
  .toc li .n-ep { color: #8b8b96; font-size: 9pt; }
  .toc li a { color: inherit; text-decoration: none; }
  .toc li .pg { display: inline-block; min-width: 9mm; text-align: right; color: #4f46e5;
                font-variant-numeric: tabular-nums; font-size: 9.5pt; }

  /* ===== 每部一章 ===== */
  .show { break-before: page; }
  /* 刊头条不能用负边距出血：Chromium 分页会把它画到上一页页尾（实测 bug），改页内圆角横幅 */
  .mast { background: var(--ac-dark); color: #fff; padding: 3.6mm 7mm; border-radius: 0 0 3mm 3mm;
          display: flex; justify-content: space-between; align-items: center; }
  .mast .m1 { font-size: 10pt; font-weight: 500; letter-spacing: .2em; }
  .mast .m2 { font-size: 8pt; opacity: .82; letter-spacing: .18em; }
  .heroline { display: flex; gap: 7mm; margin-top: 7mm; position: relative; }
  .heroline::before { content: ''; position: absolute; left: -4mm; top: -6mm; width: 34mm; height: 34mm;
      border-radius: 50%; background: radial-gradient(closest-side, var(--ac-tint2), rgba(255,255,255,0) 74%);
      z-index: 0; }
  .art { flex: 0 0 60mm; position: relative; text-align: center; }
  .art img { max-width: 60mm; max-height: 86mm; border-radius: 3mm;
             box-shadow: 0 10px 26px rgba(24,24,32,.22); display: inline-block; }
  .head { flex: 1; padding-top: 2mm; position: relative; }
  .head .t1 { font-family: "LXGW WenKai"; font-weight: 700; font-size: 19.5pt; color: #141419;
              line-height: 1.35; margin: 0; }
  .head .t2 { font-size: 10.5pt; color: var(--ac-ink); margin-top: 1.8mm; }
  .chips { margin-top: 3.5mm; }
  .chips span { display: inline-block; font-size: 8.5pt; color: var(--ac-dark); background: var(--ac-tint);
                border: 1px solid var(--ac-faint); border-radius: 3mm; padding: .5mm 3mm; margin: 0 1.5mm 1.5mm 0; }
  .score { margin-top: 2.5mm; font-size: 9.5pt; color: #55555f; }
  .score b { color: var(--ac-dark); font-weight: 500; }
  h2 { font-family: "LXGW WenKai"; font-weight: 700; font-size: 13.5pt; color: #141419; margin: 5.5mm 0 2.5mm;
       padding: 0 0 1.8mm 3.5mm; border-left: 1.6mm solid var(--ac); border-bottom: 1px solid var(--ac-faint);
       break-after: avoid; break-inside: avoid; }
  p { margin: 2mm 0; text-align: justify; orphans: 3; widows: 3; }
  .syn { text-align: justify; }
  .card { background: var(--ac-tint); border-left: 1.1mm solid var(--ac); border-radius: 0 2.5mm 2.5mm 0;
          padding: 2.4mm 4.5mm; margin: 2mm 0; }
  .card p { margin: 1.2mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 2mm auto 3mm; font-size: 9pt;
          table-layout: fixed; font-variant-numeric: tabular-nums; break-inside: avoid; }
  thead { display: table-header-group; }
  th { background: var(--ac-dark); color: #fff; padding: 1.8mm 2.4mm; text-align: left; font-weight: 500;
       border: none; letter-spacing: .04em; }
  th + th { border-left: 1px solid rgba(255,255,255,.22); }
  td { border: none; border-bottom: 1px solid var(--ac-faint); padding: 1.15mm 2.2mm; vertical-align: top;
       text-align: justify; line-break: strict; overflow-wrap: break-word; }
  td + td { border-left: 1px solid var(--ac-tint2); }
  tbody tr:nth-child(even) td { background: var(--ac-tint); }
  td.sop { font-size: 8.4pt; line-height: 1.58; color: #3c3c46; text-align: justify; }
  tr { break-inside: avoid; }
  .sp { font-size: 8pt; font-weight: 400; color: #b45309; background: rgba(180,83,9,.08);
        border: 1px solid rgba(180,83,9,.25); border-radius: 2.5mm; padding: .3mm 2.5mm;
        margin-left: 3mm; vertical-align: 2px; letter-spacing: .08em; }

  /* ===== 状态徽章 ===== */
  .std { display: inline-block; font-size: 8pt; padding: .5mm 3mm; border-radius: 3mm;
         background: #f1f1f4; color: #55555f; border: 1px solid #e3e3ea; letter-spacing: .03em; }
  .std-done { background: #f4f4f6; color: #6b7280; border-color: #e2e2e8; }
  .std-air { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
  .std-soon { background: #fffbeb; color: #b45309; border-color: #fde68a; }

  /* ===== 制作与声优（结构化） ===== */
  .pcard { background: var(--ac-tint); border-left: 1.1mm solid var(--ac); border-radius: 0 2.5mm 2.5mm 0;
           padding: 2.6mm 4.5mm; margin: 2mm 0; }
  table.staff { margin: 0; font-size: 9.2pt; width: 100%; }
  table.staff td { border: none; padding: .7mm 0; vertical-align: top; }
  table.staff td.k { width: 24mm; color: var(--ac-dark); font-weight: 600; }
  .cast { border-top: 1px solid var(--ac-tint2); margin-top: 1.5mm; padding-top: 1.5mm;
          display: flex; flex-wrap: wrap; gap: 1.2mm 5mm; font-size: 9.2pt; }
  .cast span i { font-style: normal; color: #55555f; }
  .cast span b { font-weight: 500; color: var(--ac-dark); margin-left: 1.2mm; }
  .mline { display: flex; gap: 3mm; font-size: 9.2pt; margin: 1mm 0; }
  .mline .mk { flex: 0 0 16mm; color: var(--ac-dark); font-weight: 600; }
  .mline + .mline { border-top: 1px solid var(--ac-tint2); padding-top: 1.3mm; margin-top: 1.3mm; }

  /* ===== 总览页时间轴 ===== */
  .tl { display: flex; justify-content: space-between; margin: 0 0 9mm; position: relative; padding: 1mm 0 0; }
  .tl::before { content: ''; position: absolute; left: 0; right: 0; top: 5.2mm; height: 0.5px; background: #d9d9e3; }
  .ycol { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; position: relative; }
  .yname { font-size: 8pt; color: #6b6b76; letter-spacing: .04em; margin-bottom: 1.6mm; background: #fff; padding: 0 1mm; }
  .yitem { writing-mode: vertical-rl; font-size: 7.6pt; color: #3c3c46; line-height: 1.15; margin: 1mm 0 0; padding: 0; }
  .yitem::before { content: ''; display: block; width: 1.6mm; height: 1.6mm; border-radius: 50%;
                   background: #4f46e5; margin: 0 auto 1mm; }
  .tl-c1 .yname { font-size: 7pt; letter-spacing: 0; }
  .tl-c1 .yitem { font-size: 6.6pt; margin-top: .6mm; }
  .tl-c2 .yname { font-size: 6.4pt; letter-spacing: 0; }
  .tl-c2 .yitem { display: none; }   /* 年份过多时只留年份点，条目看下方目录 */

  /* ===== 台词卡（章节记忆点） ===== */
  .quote { margin: 4mm 12mm 1mm; text-align: center; break-inside: avoid; }
  .quote .qm { font-family: "LXGW WenKai"; color: var(--ac); font-size: 15pt; line-height: 1; }
  .quote .qt { font-family: "LXGW WenKai"; font-weight: 500; font-size: 12.5pt; color: var(--ac-ink); line-height: 1.65; margin: 1mm 0 1.2mm; }
  .quote .qs { font-size: 8.5pt; color: #8b8b96; letter-spacing: .12em; }

  /* ===== 数说收藏页 ===== */
  .alm h2 { margin-top: 2mm; }
  .alm-pg { break-before: page; }
  .alm-grid { display: flex; flex-wrap: wrap; gap: 4.5mm; margin: 4mm 0 0; }
  .alm-grid .st2 { flex: 1 1 44%; background: var(--ac-tint); border-radius: 3mm; padding: 5.5mm 6.5mm; break-inside: avoid; }
  .alm-grid .lb { font-size: 9pt; letter-spacing: .18em; color: #6b6b76; }
  .alm-grid .b { font-family: "LXGW WenKai"; font-weight: 700; font-size: 23pt; color: var(--bc, var(--ac-dark)); line-height: 1.3; margin-top: 1.5mm; }
  .alm-grid .sub { font-size: 8.5pt; color: #8b8b96; margin-top: 1mm; }
  /* 数说页底部的一排紧凑小卡：单元构成 / 时长估算 / 平均评分 / 类型 TOP3
     单独做「小字号 + 4 列」而不是塞进上面的 44% 大卡，避免把数说页撑到第二页 */
  .alm-mini { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4.5mm 0 0; }
  .alm-mini .mi { background: var(--ac-tint); border-radius: 2.5mm; padding: 3.2mm 4mm; break-inside: avoid; }
  .alm-mini .mi .lb { font-size: 8pt; letter-spacing: .16em; color: #6b6b76; }
  .alm-mini .mi b { display: block; font-family: "LXGW WenKai"; font-weight: 700; font-size: 12.5pt;
                    color: var(--ac-dark); margin-top: 1.2mm; line-height: 1.35; }
  .alm-mini .mi span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                       font-size: 7.5pt; color: #8b8b96; margin-top: .8mm; line-height: 1.4; overflow: hidden; }
  .brow { display: flex; align-items: center; gap: 2.5mm; margin: 1.8mm 0; font-size: 8.5pt; color: #3c3c46; }
  .brow span { flex: 0 0 15mm; font-variant-numeric: tabular-nums; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .brow b { flex: 0 0 6mm; text-align: right; color: var(--ac-dark); font-variant-numeric: tabular-nums; }
  .bar { flex: 1; height: 2.6mm; background: rgba(0,0,0,.07); border-radius: 1.6mm; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ac); border-radius: 1.6mm; }

  /* ===== 封面 / 封底 ===== */
  .cover-pg { break-before: page; display: flex; flex-direction: column; height: 266mm; }
  .ov-pg { break-before: page; }   /* 封面之后总览必须自己分页（break-before 对首个元素无效） */
  .cv-kick { font-size: 9pt; font-weight: 500; letter-spacing: .42em; color: var(--ac); margin-top: 4mm; }
  .cv-grid { display: flex; flex-wrap: wrap; gap: 4mm; margin: 4mm 0 2mm; flex: 1 1 auto; align-content: center; }
  .cv-tile { position: relative; aspect-ratio: 3 / 4.1; border-radius: 3mm; overflow: hidden;
             background: #f1f1f4; border-bottom: 2.2mm solid var(--tc, var(--ac)); }
  .cv-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* 主题色渲染：白底立绘被「洗」成主题色淡彩面板（白不再刺眼），底部渐深出层次 */
  .cv-tile::after { content: ''; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply;
      background: linear-gradient(180deg, rgba(255,255,255,0) 52%, rgba(0,0,0,.22) 100%), var(--tc, var(--ac));
      opacity: .24; }
  .cv-titleblock { margin-top: auto; }
  .cv-title { font-family: "LXGW WenKai"; font-weight: 700; font-size: 30pt; color: #141419; line-height: 1.3; }
  .cv-sub { font-size: 10.5pt; color: #6b6b76; margin-top: 2.5mm; letter-spacing: .06em; }
  .cv-foot { display: flex; justify-content: space-between; border-top: 1.6px solid var(--ac); margin-top: 4mm;
             padding-top: 3mm; font-size: 8.5pt; letter-spacing: .18em; color: #6b6b76; }
  .body-pg { padding-bottom: 0mm; }
  .back-pg { break-before: page; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding-top: 96mm; }
  .bk-end { font-family: "LXGW WenKai"; font-weight: 700; font-size: 52pt; color: var(--ac); opacity: .16; line-height: 1; }
  .bk-title { font-family: "LXGW WenKai"; font-weight: 700; font-size: 15pt; color: #141419; margin-top: 10mm; }
  .bk-line { font-size: 9pt; color: #6b6b76; margin-top: 2mm; letter-spacing: .08em; }
  .bk-cred { font-size: 7.5pt; color: #8b8b96; letter-spacing: .14em; margin-top: 18mm; }
  .bk-src { font-size: 7pt; color: #a0a0aa; margin-top: 3mm; line-height: 1.7; max-width: 120mm; }
  .bk-notice { font-size: 7pt; color: #8b8b96; margin-top: 2mm; line-height: 1.7; max-width: 130mm; }
  .bk-font { font-size: 6.5pt; color: #b0b0ba; margin-top: 5mm; line-height: 1.7; max-width: 130mm; }
`;

// ---- 组装 ----
(async () => {
// LLM 产出不可控（"rating": 8.5、"unit_synopses": {} 都出现过），数组字段一律走模块级 arrStrict（形状不对会告警）
const shows = Object.values(base);
let tocRows = '';
const chapters = [];
const showMeta = [];
// 用户数据层（P0）：文件缺失是正常状态（回退研究稿）；损坏则告警并计入 warnings（构建末尾非零退出）
const UD = (() => {
  const res = userdata.load({ soft: true });
  if (res.error) {
    warnings.push('userdata 读取失败，本次回退到研究稿字段：' + res.error.message);
    return userdata.reader(null);
  }
  return userdata.reader(res.data);
})();
for (const [i, rec] of shows.entries()) {
  const r = research[rec.folder] || {};
  const slug = 'show' + String(i + 1).padStart(2, '0');
  const title = r.title_zh || rec.title || rec.folder;
  const titleJp = r.title_jp || (rec.titles && rec.titles[0]) || '';
  const synopsis = r.synopsis || rec.overview || '';
  const src = r.source || '';
  const upd = r.update || '';
  const genresR = arrStrict(r.genres, 'genres', rec.folder);
  const genresB = arrStrict(rec.genres, 'genres', rec.folder);
  const genres = (genresR.length ? genresR : genresB)
    .filter(g => typeof g === 'string' && g && !/^(动画|动漫)$/.test(g)).slice(0, 5);
  // 评分：research.rating 优先（模式 B 的 base 由使用者自备扫描脚本生成，未必带 rating），回退 base.rating
  // 数字形式（"rating": 8.5）直接当一条评分渲染，不丢
  const ratingOf = v => (typeof v === 'number' && v > 0) ? [{ site: '', score: v }] : arrStrict(v, 'rating', rec.folder);
  const ratingList = (() => { const rr = ratingOf(r.rating); return rr.length ? rr : ratingOf(rec.rating); })();
  const ratings = ratingList.filter(x => x && x.score > 0)
    .map(x => `${x.site ? (x.site === 'bangumi' ? 'Bangumi' : String(x.site).toUpperCase()) + ' ' : ''}<b>${x.score}</b>`).join(' · ');
  const air0 = fmtDate(rec.airdate || arrStrict(rec.units, 'units', rec.folder).map(u => u.airdate).filter(Boolean).sort()[0]);
  // 封面优先级：research.cover（官方海报覆盖，相对 anime_research/）> 视频库内封面（模式 B）
  const rcoverRel = r.cover ? String(r.cover).replace(/\//g, path.sep) : '';
  const rcoverAbs = rcoverRel && !rcoverRel.includes('..') ? path.join(rdir, rcoverRel) : '';
  const cover = (rcoverRel && fs.existsSync(rcoverAbs))
    ? (() => { const d = path.join(coverDir, slug + '.jpg'); try { fs.copyFileSync(rcoverAbs, d); return 'covers/' + slug + '.jpg'; } catch (e) { console.warn('⚠ 封面复制失败（' + rec.folder + '）:', e.message); return ''; } })()
    : localCoverSrc(rec, slug);

  // 章节肖像：research.portrait（干净立绘，相对 anime_research/）优先——封面要"有戏"，肖像要"干净"，两者审美术不同
  const rportRel = r.portrait ? String(r.portrait).replace(/\//g, path.sep) : '';
  const rportAbs = rportRel && !rportRel.includes('..') ? path.join(rdir, rportRel) : '';
  let portrait = cover;
  if (rportRel && fs.existsSync(rportAbs)) {
    const d = path.join(coverDir, slug + '-p.jpg');
    try { fs.copyFileSync(rportAbs, d); portrait = 'covers/' + slug + '-p.jpg'; }
    catch (e) { console.warn('⚠ 肖像复制失败（' + rec.folder + '）:', e.message); }
  }

  // 主题色：research.accent（手动）> 封面自动取色 > DEFAULT_ACCENT
  let ac = DEFAULT_ACCENT, acSrc = '默认';
  if (r.accent && /^#[0-9a-fA-F]{6}$/.test(String(r.accent))) { ac = String(r.accent).toLowerCase(); acSrc = '手动指定'; }
  else if (cover) { const ex = await extractAccent(path.join(coverDir, slug + '.jpg')); if (ex) { ac = ex; acSrc = '封面取色'; } }
  console.log(`主题色 ${rec.folder} -> ${ac}（${acSrc}）`);

  const art = portrait ? `<div class="art"><img src="${portrait}" alt=""></div>` : `<div class="art"></div>`;
  // 制作与声优：结构化渲染（解析失败降级原文本）
  const prod = r.production ? splitProduction(r.production) : null;
  const prodHtml = r.production
    ? (prod
        ? `<div class="pcard">${prod.staff.length ? `<table class="staff"><tbody>${prod.staff.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}${prod.cast.length ? `<div class="cast">${prod.cast.map(([role, cv]) => `<span>${role ? `<i>${esc(role)}</i>` : ''}<b>${esc(cv)}</b></span>`).join('')}</div>` : ''}</div>`
        : `<div class="card"><p>${esc(r.production)}</p></div>`)
    : '';
  const musicPlatHtml = (r.music || r.platforms)
    ? `<h2>${L.hMusic}</h2><div class="pcard">${r.music ? `<div class="mline"><span class="mk">${L.mkMusic}</span><span class="mv">${esc(r.music)}</span></div>` : ''}${r.platforms ? `<div class="mline"><span class="mk">${L.mkPlat}</span><span class="mv">${esc(r.platforms)}</span></div>` : ''}</div>`
    : '';
  const unitSops = arrStrict(r.unit_synopses, 'unit_synopses', rec.folder);
  const sopOf = (name) => { const hit = unitSops.find((u) => u.name === name); return hit ? hit.text : ''; };
  // 单元名列宽按最长名字自适应（ASCII 半宽折算；短名不浪费宽，长名不硬折）
  // eps 缺失/为 0 的单元（剧场版、特别篇等）保留在表里，集数显示 —
  const unitsAll = arrStrict(rec.units, 'units', rec.folder);
  const vLen = s => String(s).replace(/[\x21-\x7E]/g, 'i').length;
  const nameW = Math.min(48, Math.max(26, Math.ceil(Math.max(0, ...unitsAll.map(u => vLen(u.name))) * 3.3) + 7));
  const unitRows = unitsAll
    .map(u => ({ ...u, air: u.airdate || (u.name === '本篇' ? rec.airdate : null) }))
    .sort((a, b) => (a.air || Infinity) - (b.air || Infinity))
    .map(u => {
      const sop = sopOf(u.name);
      if (unitSops.length && !sop) console.warn('⚠ 单元无剧透文案（name 须与 units 逐字一致）: ' + rec.folder + ' / ' + u.name);
      return `<tr><td>${esc(u.name)}</td><td>${u.eps ? u.eps + ' ' + L.epsSuffix : '—'}</td><td>${fmtDate(u.air) || '—'}</td>${
        unitSops.length ? `<td class="sop">${esc(sop)}</td>` : ''}</tr>`;
    })
    .join('');

  const q = typeof r.quote === 'string' ? { text: r.quote } : (r.quote || null);
  const quoteHtml = (q && q.text)
    ? `<div class="quote"><div class="qm">「</div><div class="qt">${esc(q.text)}</div>${q.speaker ? `<div class="qs">—— ${esc(q.speaker)}</div>` : ''}</div>`
    : '';
  // 系列完整度：franchise = 该系列全部条目盘点（collected 标是否已收）
  const myScore = UD.score(rec.folder);
  const myComment = UD.comment(rec.folder);
  const fr = arrStrict(r.franchise, 'franchise', rec.folder).filter(f => f && f.name)
    // 已收状态优先取 userdata（P0）：个人数据不会被调研稿重跑覆盖；查不到时沿用研究稿旧值
    .map(f => { const u = UD.franchiseState(rec.folder, f); return u === undefined ? f : { ...f, collected: u }; });
  const frMiss = fr.filter(f => !f.collected);
  const frMissTxt = frMiss.map(f => `${f.kind ? f.kind + ' ' : ''}${f.name}${f.year ? '（' + f.year + '）' : ''}`).join('、');
  const frCardHtml = fr.length
    ? `<div class="card"><p><b>${L.frCard} ${fr.length - frMiss.length}/${fr.length}</b>${frMiss.length ? ` ——${L.frWait}：${esc(frMissTxt)}` : ` ——${L.frDone}`}</p></div>`
    : '';
  // 补记卡（可选）：research.extra = {title, text}——装彩蛋/考证/补注一类补充内容
  const extraHtml = (r.extra && r.extra.text)
    ? `<h2>${esc(r.extra.title || '补记')}</h2><div class="card"><p>${esc(r.extra.text)}</p></div>`
    : '';
  showMeta.push({ title, ac, total: totalEps(rec), cover, jp: titleJp, genres: genres.slice(0, 3), quote: q || null, frTotal: fr.length, frMiss: frMiss.length });

  chapters.push(`
  <div class="show" id="show${String(i + 1).padStart(2, '0')}" style="${varsFor(ac)}">
    <div class="mast"><div class="m1">${L.m1} · ${String(i + 1).padStart(2, '0')}</div><div class="m2">${L.m2} · ${NOW}</div></div>
    <div class="heroline">
      ${art}
      <div class="head">
        <h1 class="t1">${esc(title)}</h1>
        ${titleJp ? `<div class="t2">${esc(titleJp)}</div>` : ''}
        ${genres.length ? `<div class="chips">${genres.map(g => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
        ${ratings ? `<div class="score">评分　${ratings}</div>` : ''}
        ${myScore ? `<div class="score">${L.myScore}　<b>${myScore.value}</b> / ${myScore.scale}${myScore.source ? ` · ${esc(myScore.source)}` : ''}</div>` : ''}
        <div class="score">${L.heroLine}　<b>${unitCount(rec)}</b> ${L.unitCnt} · 共 <b>${totalEps(rec)}</b> ${L.chapName}${air0 ? ` · ${L.firstAir} <b>${air0}</b>` : ''}</div>
        ${r.status ? `<div class="score"><span class="std ${stClass(r.status)}">${esc(r.status)}</span></div>` : ''}
        ${fr.length ? `<div class="score">${L.frHero}　<b>${fr.length - frMiss.length}</b> / <b>${fr.length}</b> 条</div>` : ''}
      </div>
    </div>
    ${quoteHtml}
    ${synopsis ? `<h2>${L.hSyn}<span class="sp">剧透注意</span></h2><p class="syn">${esc(synopsis)}</p>` : ''}
    ${r.production ? `<h2>${L.hProd}</h2>${prodHtml}` : ''}
    ${musicPlatHtml}
    ${src ? `<h2>${L.hSource}</h2><div class="card"><p>${esc(src)}</p></div>` : ''}
    ${r.watch_order ? `<h2>${L.hOrder}</h2><div class="card"><p>${esc(r.watch_order)}</p></div>` : ''}
    ${upd ? `<h2>${L.hUpdate}</h2><div class="card"><p>${esc(upd)}</p></div>` : ''}
    ${extraHtml}
    ${unitRows ? `<h2>${L.hDetail}</h2>
    <table><thead><tr>${unitSops.length
      ? `<th style="width:${nameW}mm">${L.colUnit}</th><th style="width:14mm">${L.colEps}</th><th style="width:26mm">${L.colAir}</th><th>${L.colSop}</th>`
      : `<th style="width:${Math.min(64, nameW + 14)}mm">${L.colUnit}</th><th style="width:34mm">${L.colEps}</th><th>${L.colAir}</th>`}</tr></thead>
    <tbody>${unitRows}</tbody></table>` : ''}
    ${myComment ? `<h2>${L.hMyComment}</h2><div class="card"><p>${esc(myComment)}</p></div>` : ''}
    ${frCardHtml}
  </div>`);

  tocRows += `<li><a href="#show${String(i + 1).padStart(2, '0')}">${esc(title)}</a> <span class="n-ep">${totalEps(rec)} ${L.chapName}</span><span class="pg">${pgOf(title)}</span></li>`;
}

const grand = shows.reduce((s, r) => s + totalEps(r), 0);
const grandUnits = shows.reduce((s, r) => s + unitCount(r), 0);
const yearSpan = (() => {
  // 收录年份跨度 = 全册所有单元（含后续季/OVA）最早与最晚的年份；仅一年时显示单值，避免 "2015-2015"
  const ys = [];
  for (const s of shows) {
    for (const u of (s.units || [])) if (u.airdate) ys.push(new Date(u.airdate).getUTCFullYear());
    const y0 = s.airdate || ((s.units || []).map(u => u.airdate).filter(Boolean))[0];
    if (y0) ys.push(new Date(y0).getUTCFullYear());
  }
  ys.sort((a, b) => a - b);
  if (!ys.length) return '';
  return ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}-${ys[ys.length - 1]}`;
})();
// ---- 数说收藏页（Wrapped 式大数字统计；语义块用对应作品的主题色） ----
const almHtml = (() => {
  const years = shows.flatMap(s => (s.units || []).map(u => u.airdate).filter(Boolean)).map(ts => new Date(ts).getUTCFullYear()).sort((a, b) => a - b);
  const decades = {};
  years.forEach(y => { const d = Math.floor(y / 10) * 10; decades[d] = (decades[d] || 0) + 1; });
  const decKeys = Object.keys(decades).sort();
  const decMax = Math.max(1, ...decKeys.map(k => decades[k]));
  const genreCnt = {};
  // 与章节标签同口径：优先 research.genres，过滤非字符串与「动画/动漫」（旧实现只看 s.genres 且不过滤）
  for (const s of shows) {
    const gr = arrStrict((research[s.folder] || {}).genres, 'genres', s.folder);
    const gb = arrStrict(s.genres, 'genres', s.folder);
    for (const g of (gr.length ? gr : gb)) {
      if (typeof g !== 'string' || !g || /^(动画|动漫)$/.test(g)) continue;
      genreCnt[g] = (genreCnt[g] || 0) + 1;
    }
  }
  const longest = showMeta.slice().sort((a, b) => b.total - a.total)[0];
  const doneCnt = shows.filter(s => stClass((research[s.folder] || {}).status || '') === 'std-done').length;
  const airCnt = shows.filter(s => stClass((research[s.folder] || {}).status || '') === 'std-air').length;
  const frShows = showMeta.filter(m => m.frTotal > 0);
  const missTotal = frShows.reduce((s, m) => s + m.frMiss, 0);
  if (!shows.length) return '';
  const span = years.length ? (years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]} – ${years[years.length - 1]}`) : '—';
  const spanYears = years.length ? (years[years.length - 1] - years[0] + 1) + ' 年' : '—';
  const block = (lb, big, sub, bc) => `<div class="st2"${bc ? ` style="--bc:${bc}"` : ''}><div class="lb">${esc(lb)}</div><div class="b">${big}</div><div class="sub">${esc(sub)}</div></div>`;
  const bars = decKeys.map(k => `<div class="brow"><span>${k}s</span><div class="bar"><i style="width:${Math.round(decades[k] / decMax * 100)}%"></i></div><b>${decades[k]}</b></div>`).join('');
  // ---- 补充统计：单元构成 / 时长估算 / 平均评分 / 类型 TOP3（只对 anime 领域；全为空时自动省略） ----
  //  放在数说页底部的一排「小卡」里，而不是继续往 44% 大卡里塞——避免把数说页撑到第二页。
  const topGenres = Object.entries(genreCnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  const ut = { tv: 0, movie: 0, ova: 0 };
  for (const s of shows) for (const u of (s.units || [])) {
    if (/剧场版|劇場版/.test(u.name)) ut.movie++;
    else if (/OVA|特别篇|特別篇|SP|BONUS|完成篇|番外/i.test(u.name)) ut.ova++;
    else ut.tv++;
  }
  const ratedList = shows.map(s => {
    const r = (research[s.folder] || {}).rating;
    if (!Array.isArray(r)) return null;
    const bg = r.find(x => x && x.site === 'bangumi' && x.score > 0);
    const tm = r.find(x => x && x.site === 'tmdb' && x.score > 0);
    return (bg || tm) ? { title: s.title || s.folder, bg: bg ? bg.score : null, tm: tm ? tm.score : null } : null;
  }).filter(Boolean);
  const bgList = ratedList.filter(x => x.bg != null).sort((a, b) => b.bg - a.bg);
  const tmList = ratedList.filter(x => x.tm != null);
  const avg = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null;
  const bgAvg = avg(bgList.map(x => x.bg)), tmAvg = avg(tmList.map(x => x.tm));
  // 时长估算：按单元类型加权（TV 24 / OVA・特别篇 30 / 剧场版 110 分钟）——比「总集数 × 24」更贴近实际
  const estMinutes = shows.reduce((sum, s) => sum + (s.units || []).reduce((a, u) => {
    const n = Number(u.eps) || 0;
    if (/剧场版|劇場版/.test(u.name)) return a + (n ? n * 110 : 110);
    if (/OVA|特别篇|特別篇|SP|BONUS|完成篇|番外/i.test(u.name)) return a + (n ? n * 30 : 30);
    return a + (n ? n * 24 : 24 * 12);
  }, 0), 0);
  const estHours = estMinutes >= 60 ? (estMinutes / 60).toFixed(estMinutes % 60 ? 1 : 0) : String(estMinutes);
  const estUnit = estMinutes >= 60 ? ' 小时' : ' 分钟';
  const estNote = (ut.movie || ut.ova) ? '按 TV 24 / OVA 30 / 剧场版 110 分钟估算' : `${grand} 集 × 每集约 24 分钟`;
  const ratingParts = [];
  if (bgAvg) ratingParts.push(`Bangumi ${bgAvg}（${bgList.length} 部）`);
  if (tmAvg) ratingParts.push(`TMDB ${tmAvg}（${tmList.length} 部）`);
  const miniBlocks = DOMAIN === 'anime' ? [
    `<div class="mi"><div class="lb">单元构成</div><b>${ut.tv + ut.movie + ut.ova} 个</b><span>TV ${ut.tv} · 剧场版 ${ut.movie} · OVA/特别篇 ${ut.ova}</span></div>`,
    estMinutes ? `<div class="mi"><div class="lb">时长估算</div><b>${estHours}${estUnit}</b><span>${esc(estNote)}</span></div>` : '',
    ratingParts.length ? `<div class="mi"><div class="lb">平均评分</div><b>${bgAvg ? 'Bangumi ' + bgAvg : 'TMDB ' + tmAvg}</b><span>${esc(ratingParts.join(' · ') + (bgList.length ? ` · 最高《${bgList[0].title}》${bgList[0].bg}` : ''))}</span></div>` : '',
    topGenres.length > 1 ? `<div class="mi"><div class="lb">类型 TOP3</div><b>${esc(topGenres[0][0])} ${topGenres[0][1]}</b><span>${esc(topGenres.slice(1, 3).map(([g, n]) => `${g} ${n}`).join(' · ') || '—')}</span></div>` : '',
  ].filter(Boolean) : [];
  const miniStats = miniBlocks.length
    ? `<div class="alm-mini" style="grid-template-columns:repeat(${miniBlocks.length},1fr)">${miniBlocks.join('')}</div>` : '';
  return `
  <div class="alm">
    <h2>${L.almTitle}<span class="sp">DATA NOTES</span></h2>
    <div class="alm-grid">
      ${block(L.almTotal, `${grand} ${L.chapName}`, `${shows.length} ${L.person} · ${grandUnits} ${L.stUnit}`)}
      ${block(L.almSpan, spanYears, span)}
      ${longest && longest.total ? block(L.almLong, `${longest.total} ${L.chapName}`, longest.title, longest.ac) : ''}
      ${decKeys.length ? `<div class="st2"><div class="lb">${L.almDecade}</div><div style="margin-top:2mm">${bars}</div></div>` : ''}
      ${block(L.almDone, `${doneCnt} / ${airCnt}`, airCnt ? `${airCnt} ${L.airUnit}` : (doneCnt === shows.length ? L.almAllDone : '以各章状态徽章为准'))}
      ${frShows.length ? block(L.almFr, missTotal ? `${missTotal} 条` : L.frDoneShort, missTotal ? L.almFrSubN : L.almFrSub0) : ''}
    </div>
    ${miniStats}
  </div>`;
})();
const almPage = almHtml ? `<div class="page alm-pg" style="${varsFor(DEFAULT_ACCENT)}">${almHtml}</div>` : '';
// ---- 封面 / 封底 ----
const coverList = showMeta.filter(m => m.cover).slice(0, 15);
// 网格列数按封面数量自适应：1 张居中放大、2/4 张双列（4 张正好 2×2，避免 3 列留空位）、其余 3 列
const cvCols = coverList.length === 1 ? 1 : (coverList.length === 2 || coverList.length === 4) ? 2 : (coverList.length <= 9 ? 3 : 5);
const cvW = coverList.length ? `calc((100% - ${(cvCols - 1) * 4}mm) / ${cvCols})` : '';
const tiles = coverList
  .map(m => `<div class="cv-tile" style="--tc:${m.ac}; width:${cvW}${coverList.length === 1 ? '; max-width:88mm; margin:0 auto' : ''}"><img src="${m.cover}" alt=""></div>`).join('');
const coverPage = `<div class="page cover-pg" style="${varsFor(DEFAULT_ACCENT)}">
  <div class="cv-kick">${L.kick}</div>
  ${tiles ? `<div class="cv-grid" style="max-width:${cvCols === 2 ? 138 : 180}mm">${tiles}</div>` : ''}
  <div class="cv-titleblock">
    <div class="cv-title">${esc(BOOK_TITLE)}</div>
    <div class="cv-sub">${yearSpan || NOW} · ${shows.length} ${L.person} · ${grand} ${L.chapName}</div>
  </div>
  <div class="cv-foot"><span>${NOW}</span><span>${String(shows.length).padStart(2, '0')} WORKS</span></div>
</div>`;
// 合规默认值：素材声明与资料来源随成品输出，不依赖使用者是否填了 credits（这两行请勿删）
const NOTICE = '非官方粉丝作品 · 仅供个人收藏 · 海报/立绘版权归原作者与制作委员会所有 · 请勿售卖或公开传播';
const DEFAULT_CREDITS = '资料来源：公开资料整理（AniList / Bangumi / 维基百科等），文字为重新撰写，版权归原作者所有';
const backPage = `<div class="page back-pg" style="${varsFor(DEFAULT_ACCENT)}">
  <div class="bk-end">完</div>
  <div class="bk-title">${esc(BOOK_TITLE)}</div>
  <div class="bk-line">${yearSpan || NOW} · ${shows.length} ${L.person} · ${grand} ${L.chapName}</div>
  <div class="bk-cred">${L.m2} · ${NOW} · Generated with fandex</div>
  <div class="bk-src">${esc(CFG.credits || DEFAULT_CREDITS)}</div>
  <div class="bk-notice">${esc(NOTICE)}</div>
  <div class="bk-font">本册中文字体：霞鹜文楷 LXGW WenKai（SIL OFL 1.1）｜© LXGW｜© The Klee Project Authors（基于 FONTWORKS「Klee One」衍生）</div>
</div>`;
// 时间轴：按首播年份分列（竖排名）；年份多时逐级收紧防挤爆
const tl = (() => {
  const byYear = {};
  shows.forEach(s => {
    const y0 = s.airdate || (s.units || []).map(u => u.airdate).filter(Boolean).sort()[0];
    const y = y0 ? new Date(y0).getUTCFullYear() : null;
    if (!y) return;
    const rj = research[s.folder] || {};
    const nm = rj.title_zh || s.title || s.folder;
    (byYear[y] = byYear[y] || []).push(nm);
  });
  const yrs = Object.keys(byYear).sort();
  const cls = yrs.length > 14 ? ' tl-c2' : yrs.length > 8 ? ' tl-c1' : '';
  return {
    cls,
    html: yrs.map(y =>
      `<div class="ycol"><div class="yname">${y}</div>${byYear[y].map(n => `<div class="yitem">${esc(n.length > 9 ? n.slice(0, 9) + '…' : n)}</div>`).join('')}</div>`
    ).join(''),
  };
})();
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="accent" content="#4f46e5">
<title>${esc(BOOK_TITLE)}</title><style>${CSS}</style></head><body>${coverPage}
<div class="page ov-pg">
  <div class="thd">
    <div class="kick">${L.kick} · ${NOW}</div>
    <div class="thd-title">${esc(BOOK_TITLE)}</div>
    <div class="sub">共 ${shows.length} ${L.person} · ${grandUnits} ${L.stUnit} · ${grand} ${L.chapName} ｜ ${L.tail}</div>
  </div>
  <div class="stats">
    <div class="st"><b>${shows.length}</b><span>${L.stWorks}</span></div>
    <div class="st"><b>${grandUnits}</b><span>${L.stUnit}</span></div>
    <div class="st"><b>${grand}</b><span>${L.stEps}</span></div>
    <div class="st"><b>${yearSpan}</b><span>${L.stSpan}</span></div>
  </div>
  <div class="tl${tl.cls}">${tl.html}</div>
  <div class="toc">
    <h2>目录<span class="cnt">${shows.length} 部</span></h2>
    <ol>${tocRows}</ol>
  </div>
</div>
${almPage}
<div class="page body-pg">
${chapters.join('\n')}
</div>
${backPage}
</body></html>`;

fs.writeFileSync(path.join(OUT, BOOK + '.html'), html, 'utf8');

// ---- 分享卡片页（独立文件，不进书；npm run cards 对每张截图成 PNG） ----
const CARD_CSS = `
  body { margin: 0; padding: 20px 0; background: #e9e9ef; font-family: "LXGW WenKai", "Noto Sans SC", sans-serif; }
  .scard { position: relative; width: 750px; height: 1000px; margin: 24px auto; border-radius: 24px;
           overflow: hidden; background: #fff; box-shadow: 0 12px 40px rgba(20,20,30,.16);
           display: flex; flex-direction: column; }
  .scard-art { position: relative; width: 100%; height: 545px; overflow: hidden; }
  .scard-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .scard-art::after { content: ''; position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.45)); }
  .scard-badge { position: absolute; top: 26px; left: 26px; background: var(--ac-dark); color: #fff;
      font-size: 22px; letter-spacing: .3em; padding: 10px 18px 10px 26px; border-radius: 999px; opacity: .94; }
  .scard-body { flex: 1; overflow: hidden; padding: 32px 46px 10px; }
  .scard-title { font-weight: 700; font-size: 48px; color: #141419; line-height: 1.25; margin: 0; }
  .scard-jp { font-size: 23px; color: var(--ac-ink); margin-top: 10px; }
  .scard-chips span { display: inline-block; font-size: 22px; color: var(--ac-dark); background: var(--ac-tint);
      border: 1px solid var(--ac-faint); border-radius: 999px; padding: 6px 22px; margin: 16px 12px 0 0; }
  .scard-quote { margin-top: 24px; font-size: 27px; line-height: 1.65; color: var(--ac-ink);
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .scard-quote i { font-style: normal; display: block; font-size: 20px; color: #8b8b96; margin-top: 12px; }
  .scard-foot { position: static; margin-top: auto; display: flex; justify-content: space-between;
      align-items: center; padding: 26px 46px; background: var(--ac-tint); border-top: 3px solid var(--ac);
      font-size: 24px; color: #3c3c46; }
`;
const cardsHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>${esc(BOOK_TITLE)} · 收藏卡</title><style>${CSS}${CARD_CSS}</style></head><body>
${showMeta.filter(m => m.cover).map((m, i) => {
  const q = m.quote;
  const chips = (m.genres || []).map(g => `<span>${esc(g)}</span>`).join('');
  return `<div class="scard" style="${varsFor(m.ac)}">
  <div class="scard-art"><img src="${m.cover}"><div class="scard-badge">${L.cardBadge}</div></div>
  <div class="scard-body">
    <h3 class="scard-title">${esc(m.title)}</h3>
    ${m.jp ? `<div class="scard-jp">${esc(m.jp)}</div>` : ''}
    ${chips ? `<div class="scard-chips">${chips}</div>` : ''}
    ${q && q.text ? `<div class="scard-quote">「${esc(q.text)}」${q.speaker ? `<i>—— ${esc(q.speaker)}</i>` : ''}</div>` : ''}
  </div>
  <div class="scard-foot"><span>${m.total} ${L.chapName} · ${yearSpan || NOW}</span><span>${esc(BOOK_TITLE)}</span></div>
</div>`; }).join('\n')}
</body></html>`;
fs.writeFileSync(path.join(OUT, 'share_cards.html'), cardsHtml, 'utf8');

const missing = shows.filter(s => !research[s.folder]).map(s => s.folder);
console.log(`built ${shows.length} chapters -> anime_build/${BOOK}.html`);
console.log(`share cards: ${showMeta.filter(m => m.cover).length} 张 -> anime_build/share_cards.html`);
// 空作品集 / 缺调研 / 解析失败 / 字段形状问题都算阻塞：继续渲染只会产出只有封面/总览/封底的"空书"
if (!shows.length) {
  console.warn('⚠ anime_base.json 里没有任何作品（文件为空对象或字段缺失）——不会产出有效正文'); process.exitCode = 1;
}
if (missing.length) {
  console.warn('⚠ 缺 research：以下作品在 anime_research/ 里没有命中对应 JSON（文件不存在或 folder 对不上）: ' + missing.join('、'));
  process.exitCode = 1;
}
if (researchErrors.length) {
  console.warn('⚠ research 解析失败：以下文件存在但读不出来（已跳过，原因见上方 bad research json）: ' + researchErrors.join('、'));
  process.exitCode = 1;
}
if (warnings.length) {
  console.warn('⚠ 数据字段形状/解析问题共 ' + warnings.length + ' 处，本次构建标记为失败（exit 1）');
  process.exitCode = 1;
}
})().catch(e => { console.error('构建失败：', e.message); process.exit(1); });

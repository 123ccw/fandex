// 一键交付：把成品与说明归拢到 <项目根>/_deliver/，方便直接发出去
// 产出：PDF + HTML 源 + 封面图 + 分享卡 PNG + 高清整页图 + 来源台账 + 自动生成的交付说明
//
// 原子交付（借高星 skill 的做法）：先全部写进 _deliver.tmp/，校验通过才替换 _deliver/。
// 中途失败时上一版好产物原样保留（last-good），不会留下半成品。
//
// 用法: node pack.js [--out <目录>] [--no-gallery] [--force] [--strict]
//                      [--pages-reviewed] [--covers-reviewed]
//   --no-gallery  不带高清整页图（体积大，发群/网盘时才需要）
//   --force       只放宽"目标目录是不是本工具产物"的判定；**绝不删除非本工具生成的文件**
//                 （目录里只要有一个文件不在 .pack-manifest.json 清单内，就拒绝覆盖并报 [P9]）
//   --strict      有未核验项时非零退出（默认只警告不阻断，现有 CI/用例不受影响）
//   --pages-reviewed / --covers-reviewed
//                 声明"全页目检 / 封面逐张目检"已由 agent 亲自做过。这两个动作机器验不了
//                 （`npm run sheet` 出的 PNG 是材料，不是证据），只能靠声明；不声明就在交付说明
//                 里写"未声明"——**宁可不签，也不签假的**
//
// 失败码：P1 无成品 · P2 目标目录非本工具产物 · P3 残留目录归属不明 ·
//        P4/P5 PDF 缺失或体积不符 · P6 交付说明未生成 · P7 打包标记坏了 · P8 替换失败 ·
//        P9 目录里有未登记文件（拒绝删除/覆盖） · P10 打包中断 · P11 --strict 有未核验项
//        V1/V2 验收收据缺失或过期（不阻断，只在交付说明里标注"未核验"）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { CFG, ROOT, BOOK } = require('./_config');

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const NO_GALLERY = argv.includes('--no-gallery');
const FORCE = argv.includes('--force');
const STRICT = argv.includes('--strict');
// agent 的目检声明：机器验不了，只能记为"已声明"（不声明就是"未声明"，绝不代填）
const PAGES_REVIEWED = argv.includes('--pages-reviewed');
const COVERS_REVIEWED = argv.includes('--covers-reviewed');

const BLD = path.join(ROOT, 'anime_build');
const OUT = opt('out') ? path.resolve(opt('out')) : path.join(ROOT, '_deliver');
const TMP = OUT + '.tmp';
const OLD = OUT + '.old';
const MARKER = '.pack-manifest.json';
// 本工具固定产出的文件名：即使清单是旧版 pack 写的（当时没登记它们），也一律认作本工具产物
const ALWAYS_OWNED = new Set([MARKER, '交付说明.md']);

const PDF = path.join(BLD, BOOK + '.pdf');
const HTML = path.join(BLD, BOOK + '.html');
const EPUB = path.join(BLD, BOOK + '.epub');
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

// ---- 产物归属判定：只认 .pack-manifest.json 登记过的文件（--force 也不能越过这条线）----
const norm = (p) => String(p).split(path.sep).join('/');
function readManifest(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8')); } catch (e) { return null; }
}
// 目录里登记过的文件集合；没有清单（或清单结构不对）返回 null = "归属不明"
function manifestSet(dir) {
  const m = readManifest(dir);
  if (!m || !Array.isArray(m.files)) return null;
  return new Set(m.files.map(norm));
}
// 递归列出目录内所有文件（相对路径，统一正斜杠，便于跨平台比对）
function fileList(dir, base, acc) {
  base = base || dir; acc = acc || [];
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) fileList(p, base, acc);
    else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}
// 未被清单登记的文件（含"没有清单"的情形：那全部文件都视为他人文件）
function isOwned(rel, own) { return ALWAYS_OWNED.has(rel) || (own !== null && own.has(rel)); }
function foreignFiles(dir) {
  const own = manifestSet(dir);
  return fileList(dir).filter((f) => !isOwned(f, own));
}
// 递归删掉空目录（不删文件）
function pruneEmpty(dir) {
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const it of items) if (it.isDirectory()) pruneEmpty(path.join(dir, it.name));
  try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (e) { /* 非空或占用就留着 */ }
}
// 只删清单登记过的文件 + 标记，再去掉空目录；返回残留的未登记文件数（-1 = 归属不明，一个都不删）
function removeOwned(dir) {
  const all = fileList(dir);
  if (!all.length) { pruneEmpty(dir); return 0; }   // 空目录：删掉不损失任何文件
  const own = manifestSet(dir);
  if (!own) return -1;
  let leftover = 0;
  for (const rel of all) {
    if (rel === MARKER) continue;
    if (isOwned(rel, own)) { try { fs.rmSync(path.join(dir, rel.split('/').join(path.sep)), { force: true }); } catch (e) { leftover++; } }
    else leftover++;
  }
  try { fs.rmSync(path.join(dir, MARKER), { force: true }); } catch (e) { /* 标记删不掉不影响结论 */ }
  pruneEmpty(dir);
  return leftover;
}

// ---- 核验收据：check / audit 每次运行都会写；这里只读、不改 ----
function readReceipt(file) {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!r || typeof r !== 'object' || !r.generatedAt) return null;
    return r;
  } catch (e) { return null; }
}
const CHECK_RECEIPT = readReceipt(path.join(BLD, '_check.json'));
const AUDIT_RECEIPT = readReceipt(path.join(BLD, '_audit.json'));

const normPath = (p) => { try { return path.resolve(String(p)).toLowerCase(); } catch (e) { return null; } };
function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); }
  catch (e) { return null; }
}
// 收据必须"绑定本产物"：root / 书名 /（有 artifacts 时）PDF 指纹三项都对得上，才认它代表这一次交付。
// 否则伪造一份 root="D:\other-person\project"、book="别人的书" 的 _check.json 也能骗到 ✅。
function receiptMismatch(receipt, artifact) {
  if (!receipt) return null;
  if (receipt.root && normPath(receipt.root) !== normPath(ROOT)) return 'root 是「' + receipt.root + '」，不是当前项目根';
  if (receipt.book && receipt.book !== BOOK) return 'book 是「' + receipt.book + '」，不是当前书名';
  if (!artifact) return null;   // audit 收据没有 artifacts，只校验 root
  const want = receipt.artifacts && receipt.artifacts.pdf;
  if (!want) return '收据里没有 PDF 指纹（旧版收据）';
  const got = sha256(artifact);
  if (!got) return '读不到当前 PDF';
  if (want !== got) return 'PDF 指纹与收据不符（改完重渲却没重跑 `npm run check`，或收据来自别的产物）';
  return null;
}
const CHECK_MISMATCH = receiptMismatch(CHECK_RECEIPT, PDF);
const AUDIT_MISMATCH = receiptMismatch(AUDIT_RECEIPT, null);

// 成品比收据新 = 改完重渲却没重跑验收 → 收据过期（这是最常见的"假绿"）
function staleness(receipt, artifact) {
  if (!receipt) return 'missing';
  let a = 0;
  try { a = fs.statSync(artifact).mtimeMs; } catch (e) { return 'missing'; }
  return new Date(receipt.generatedAt).getTime() < a ? 'stale' : 'fresh';
}
const CHECK_STATE = staleness(CHECK_RECEIPT, PDF);

// audit 收据的"过期"口径（原来只有 check 有）：审计吃的是 anime_research/*.json，
// 调研稿比收据新就说明审计结论已经对不上现状了
function auditStaleness(receipt) {
  if (!receipt) return 'missing';
  let newest = 0;
  try {
    const dir = path.join(ROOT, 'anime_research');
    for (const f of fs.readdirSync(dir)) {
      if (!/\.json$/i.test(f)) continue;
      newest = Math.max(newest, fs.statSync(path.join(dir, f)).mtimeMs);
    }
  } catch (e) { return 'fresh'; }   // 没有调研稿目录时无从比较，不误报
  if (!newest) return 'fresh';
  return new Date(receipt.generatedAt).getTime() < newest ? 'stale' : 'fresh';
}
const AUDIT_STATE = auditStaleness(AUDIT_RECEIPT);

// 全页联络表是不是在这次成品之后出的（目检的"材料"是否对上这一版）
let SHEET_AT = null;
try {
  const sheets = path.join(BLD, '_sheets');
  const newest = fs.readdirSync(sheets).filter((f) => /\.png$/i.test(f))
    .map((f) => fs.statSync(path.join(sheets, f)).mtimeMs).sort((x, y) => y - x)[0];
  if (newest) SHEET_AT = new Date(newest).toISOString();
} catch (e) { /* 没跑过 sheet 就没有 */ }

function fmtState(state) {
  if (state === 'fresh') return '✅ 有效';
  if (state === 'stale') return '⚠ 过期（成品比收据新 —— 重跑 `npm run check`）';
  return '❌ 缺失（跑 `npm run check`）';
}
function fmtAuditState(state) {
  if (state === 'fresh') return '✅ 有效';
  if (state === 'stale') return '⚠ 过期（调研稿比收据新 —— 重跑 `npm run audit`）';
  return '❌ 缺失（跑 `npm run audit`）';
}
// 收据里存的是 UTC（toISOString），而文档开头用的是本地时间——直接 slice 会少 8 小时（UTC+8），
// 让刚生成的收据看起来"比成品旧"，与"过期"混淆。展示一律换算成本地时间。
function fmtLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 19).replace('T', ' ');
  return d.toLocaleString('zh-CN', { hour12: false });
}

if (!fs.existsSync(PDF)) {
  console.error('[P1] 未找到成品 ' + PDF + ' ——先跑 `npm run pipeline`（或至少 build → render）');
  process.exit(1);
}

// ---- 目标目录安全策略：只覆盖"上一次 pack 留下的目录"，其他一律拒绝 ----
// --force 只放宽"是不是本工具产物"的判定；只要有未登记文件，一律 [P9] 拒绝（绝不递归删用户的目录）
if (fs.existsSync(OUT)) {
  if (!fs.existsSync(path.join(OUT, MARKER)) && !FORCE) {
    console.error('[P2] 目标目录已存在且不是本工具的产物：' + OUT);
    console.error('  → 换个 --out <目录>；本工具只覆盖自己生成的目录（目录里有 ' + MARKER + '）');
    console.error('  → --force 只在目录为空时放行；目录里有文件时加 --force 也不会删（见 [P9]）');
    process.exit(1);
  }
  const foreign = foreignFiles(OUT);
  if (foreign.length) {
    console.error('[P9] 目标目录里有不是本工具生成的文件，拒绝覆盖（--force 也不能删这些）：' + OUT);
    foreign.slice(0, 10).forEach((f) => console.error('    · ' + f));
    if (foreign.length > 10) console.error('    · …另有 ' + (foreign.length - 10) + ' 个未列出');
    console.error('  → 换个 --out <目录>；确需保留这些文件时，请先手动移走再重试');
    process.exit(1);
  }
}

// ---- 清理上次崩溃留下的临时目录（只清能确认归属的；本次自己的 TMP 由下方 .catch 收）----
for (const d of [TMP, OLD]) {
  if (!fs.existsSync(d)) continue;
  if (!fileList(d).length) { fs.rmSync(d, { recursive: true, force: true }); continue; }   // 空目录：删掉无损失
  if (manifestSet(d) === null) {
    console.error('[P3] 发现疑似残留目录且无法确认归属：' + d);
    console.error('  → 目录里没有 ' + MARKER + '，无法证明它全是本工具产物，因此不自动删除');
    console.error('  → 请手动检查后删除它，或换一个 --out <目录>（不要盲删别人的目录）');
    process.exit(1);
  }
  const foreign = foreignFiles(d);
  if (foreign.length) {
    console.error('[P9] 残留目录里有未登记的文件，已保留未删：' + d);
    foreign.slice(0, 10).forEach((f) => console.error('    · ' + f));
    console.error('  → 手动确认这些文件后自行清理，或换一个 --out <目录>');
    process.exit(1);
  }
  removeOwned(d);
}

// ---- 全部写进临时目录 ----
fs.mkdirSync(TMP, { recursive: true });
const TMP_CREATED = true;   // 走到这里 TMP 一定是本次新建的（上面的清理已保证没有旧残留）
const copied = [];
function copyInto(src, rel, note) {
  if (!fs.existsSync(src)) return false;
  const dst = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  // 文件表/清单统一用正斜杠：Windows 上 path.join 会出反斜杠，既难看也难跨平台比对
  copied.push({ file: norm(rel), size: fs.statSync(dst).size, note: note || '' });
  return true;
}
// 台账兜底脱敏：sources.js 已不再写绝对路径，但旧文件或手工改动可能残留，进交付包前再替换一次
function copyLedgerInto(src, rel, note) {
  if (!fs.existsSync(src)) return false;
  let text = fs.readFileSync(src, 'utf8');
  const before = text;
  for (const p of new Set([ROOT, norm(ROOT)])) {
    if (p) text = text.split(p).join('<项目根>');
  }
  if (text !== before) console.warn('⚠ 素材来源台账里有本机绝对路径，已在打包时替换为 <项目根>');
  const dst = path.join(TMP, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, text, 'utf8');
  copied.push({ file: norm(rel), size: fs.statSync(dst).size, note: note || '' });
  return true;
}
function copyDirInto(srcDir, relDir, note) {
  if (!fs.existsSync(srcDir)) return 0;
  const files = fs.readdirSync(srcDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
  for (const f of files) copyInto(path.join(srcDir, f), path.join(relDir, f), note);
  return files.length;
}
// 封面图：HTML 里用相对路径 covers/showNN.jpg 引用；不打包的话，交付目录里打开 HTML 是一本没封面的册子
function copyCoversInto(relDir, note) {
  const srcDir = path.join(BLD, 'covers');
  if (!fs.existsSync(srcDir)) return 0;
  const files = fs.readdirSync(srcDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort();
  let n = 0;
  for (const f of files) {
    if (!copyInto(path.join(srcDir, f), path.join(relDir, f), note)) continue;
    copied[copied.length - 1].group = 'covers';   // 文件表里合并成一行，别撑成几十行
    n++;
  }
  return n;
}

let hasHtml = false, hasEpub = false, nCovers = 0, nCards = 0, nGallery = 0, hasSources = false, pdfSize = 0;
try {
  copyInto(PDF, BOOK + '.pdf', '成品 PDF');
  hasHtml = copyInto(HTML, BOOK + '.html', 'HTML 源（可自行微调重渲）');
  hasEpub = copyInto(EPUB, BOOK + '.epub', 'EPUB 3 可重排版（手机/阅读器用；由 npm run epub 生成）');
  nCovers = copyCoversInto('covers', '封面图（HTML 用相对路径 covers/ 引用）');
  nCards = copyDirInto(path.join(BLD, '_cards'), '分享卡', '竖版分享卡（社交发图）');
  nGallery = NO_GALLERY ? 0 : copyDirInto(path.join(BLD, '_gallery'), '整页高清图', '高清整页图');
  hasSources = copyLedgerInto(path.join(BLD, '_sources.md'), '素材来源台账.md', '每张图的渠道与出处');
  pdfSize = fs.statSync(PDF).size;
} catch (e) {
  // 同步复制阶段抛错（盘满、目录里意外出现同名文件等）：此刻 .catch 还没挂上，自己收尾，别留无标记的 TMP
  console.error('[P10] 打包中断（复制阶段）：' + (e && e.message ? e.message : e));
  try {
    if (TMP_CREATED && fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
      console.error('  已清理本次的临时目录：' + TMP);
    }
  } catch (e2) { console.warn('⚠ 清理临时目录失败：' + e2.message + '（路径：' + TMP + '）'); }
  console.error('  → 上一版交付目录未被改动；修好上面的原因后重跑 `npm run pack`');
  process.exit(1);
}

(async () => {
  let pages = null;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(PDF));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    pages = doc.numPages;
  } catch (e) { /* 数不出来就不写页数 */ }

  let works = [];
  try {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'anime_base.json'), 'utf8'));
    works = Object.values(base).map((r) => {
      let t = r.title || r.folder;
      try {
        const rj = JSON.parse(fs.readFileSync(path.join(ROOT, 'anime_research', r.folder + '.json'), 'utf8'));
        t = rj.title_zh || t;
      } catch (e) { /* 用 base 里的名字 */ }
      return t;
    });
  } catch (e) { /* 没有 base 就不列清单 */ }

  let srcLine = '未入库 —— 跑 `npm run sources` 后可把台账一并打包';
  if (hasSources) {
    try {
      const led = JSON.parse(fs.readFileSync(path.join(BLD, '_sources.json'), 'utf8'));
      const es = led.entries || [];
      const official = es.filter((e) => e.channel === 'official').length;
      const booru = es.filter((e) => e.channel === 'safebooru').length;
      srcLine = `共 ${es.length} 条（官方渠道 ${official} · 图库 ${booru}）—— 详见「素材来源台账.md」`;
    } catch (e) { srcLine = '已打包（台账文件见同目录）'; }
  }

  const lines = [];
  lines.push('# ' + BOOK + ' · 交付说明');
  lines.push('');
  lines.push('生成时间：' + new Date().toLocaleString('zh-CN'));
  lines.push('');
  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push('| 作品数 | ' + (works.length || '—') + ' 部 |');
  lines.push('| 成品页数 | ' + (pages || '—') + ' 页 |');
  lines.push('| PDF 体积 | ' + kb(pdfSize) + ' |');
  lines.push('| 分享卡 | ' + (nCards || 0) + ' 张 |');
  lines.push('| 高清整页图 | ' + (nGallery ? nGallery + ' 张' : '未包含' + (NO_GALLERY ? '（--no-gallery）' : '（未跑 npm run cards）')) + ' |');
  lines.push('| 来源台账 | ' + srcLine + ' |');
  lines.push('');

  // ---- 核验状态：把"机器验过的"与"agent 声称看过的"分开放，不混为一谈 ----
  const cCounts = (CHECK_RECEIPT && CHECK_RECEIPT.counts) || null;
  const aCounts = (AUDIT_RECEIPT && AUDIT_RECEIPT.counts) || null;
  const cFail = (CHECK_RECEIPT && CHECK_RECEIPT.failures && CHECK_RECEIPT.failures.length) || 0;
  const unverified = [];
  if (CHECK_MISMATCH) unverified.push('核验收据不属于本产物（' + CHECK_MISMATCH + '）');
  else if (CHECK_STATE !== 'fresh' || cFail) unverified.push(cFail ? '产物断言有失败项' : '产物断言收据缺失/过期');
  if (AUDIT_MISMATCH) unverified.push('审计收据不属于本产物（' + AUDIT_MISMATCH + '）');
  else if (AUDIT_STATE === 'stale') unverified.push('数据审计收据已过期（调研稿比收据新）');
  if (!PAGES_REVIEWED) unverified.push('全页目检未声明');
  if (!COVERS_REVIEWED) unverified.push('封面目检未声明');
  if (AUDIT_RECEIPT && aCounts && aCounts.hard) unverified.push('数据完备度有 ' + aCounts.hard + ' 项硬问题');

  const checkCell = !cCounts ? '❌ 无收据'
    : CHECK_MISMATCH ? '❌ 收据不属于本产物'
      : cFail ? '❌ ' + cCounts.pass + '/' + cCounts.total + '（失败 ' + (CHECK_RECEIPT.failures || []).join('、') + '）'
        : '✅ 全部通过（' + cCounts.total + ' 条）';
  const checkCert = CHECK_MISMATCH ? '⚠ 收据不属于本产物（' + CHECK_MISMATCH + '）' : fmtState(CHECK_STATE);
  const auditCell = !aCounts ? '未审计'
    : aCounts.complete + ' 部完备 / ' + aCounts.soft + ' 部可优化 / ' + aCounts.hard + ' 部硬问题';
  const auditCert = AUDIT_MISMATCH ? '⚠ 收据不属于本产物（' + AUDIT_MISMATCH + '）'
    : AUDIT_RECEIPT ? fmtAuditState(AUDIT_STATE) + ' · ' + fmtLocal(AUDIT_RECEIPT.generatedAt) + ' · `_audit.json`'
      : '❌ 未跑 `npm run audit`';

  lines.push('## 核验状态');
  lines.push('');
  if (unverified.length) {
    lines.push('> ⚠ **有未经核验的环节**：' + unverified.join(' · '));
    lines.push('> 下面这几行如实反映实际做到哪一步；**不要删掉再对外声称已核验**。');
    lines.push('');
  }
  lines.push('| 环节 | 结论 | 凭据 |');
  lines.push('| --- | --- | --- |');
  lines.push('| 产物断言 `[C1]-[C' + ((cCounts && cCounts.total) || 16) + ']` | ' + checkCell + ' | ' + checkCert + ' · `_check.json` |');
  lines.push('| 数据完备度 `[A1]-[A10]` | ' + auditCell + ' | ' + auditCert + ' |');
  lines.push('| **全页目检** | ' + (PAGES_REVIEWED ? '已声明由 agent 逐页看过' : '未声明') + ' | ' + (SHEET_AT
    ? '联络表 ' + fmtLocal(SHEET_AT) + (CHECK_STATE === 'fresh' && !CHECK_MISMATCH && CHECK_RECEIPT && new Date(SHEET_AT).getTime() < new Date(CHECK_RECEIPT.generatedAt).getTime() ? ' ⚠ 早于本次成品' : '')
    : '未跑 `npm run sheet`') + ' |');
  lines.push('| **封面逐张目检** | ' + (COVERS_REVIEWED ? '已声明逐张核对过' : '未声明') + ' | 人工动作，无脚本凭据 |');
  lines.push('');
  lines.push('> 前两行是脚本产出的收据（可复现）；后两行是 agent 的声明（机器验不了）。');
  lines.push('> 想补上声明：`npm run pack -- --pages-reviewed --covers-reviewed`。');
  lines.push('');

  if (works.length) {
    lines.push('## 收录作品');
    lines.push('');
    works.forEach((t, i) => lines.push((i + 1) + '. ' + t));
    lines.push('');
  }
  // 文件表：封面图按整目录合并成一行（manifest 里仍逐个登记，覆盖/删除时能精确判定归属）
  const tableRows = [];
  let coverBytes = 0, coverCount = 0;
  for (const c of copied) {
    if (c.group === 'covers') { coverCount++; coverBytes += c.size; continue; }
    tableRows.push(c);
  }
  if (coverCount) tableRows.push({ file: 'covers/', size: coverBytes, note: coverCount + ' 张封面图（HTML 用相对路径引用，缺了册子没封面）' });
  lines.push('## 文件');
  lines.push('');
  lines.push('| 文件 | 大小 | 说明 |');
  lines.push('| --- | --- | --- |');
  for (const c of tableRows) lines.push('| ' + c.file + ' | ' + kb(c.size) + ' | ' + (c.note || '') + ' |');
  lines.push('');
  lines.push('## 使用与版权');
  lines.push('');
  lines.push('- 本册为**非官方粉丝作品**，仅供个人收藏；海报/立绘版权归原作者与各制作委员会所有');
  lines.push('- 公开发布（发群、上传平台、印制售卖）前请自行评估授权 —— **注明来源不等于获得授权**');
  if (nCards || nGallery) lines.push('- **分享卡 / 整页高清图同样内嵌作品海报（第三方素材）**：与全书同属「仅个人收藏」，发到公开平台前须自行确认授权');
  lines.push('- 中文字体为霞鹜文楷子集（SIL OFL 1.1，© LXGW ｜ © The Klee Project Authors），封底署名请勿删除');
  lines.push('- 想微调重渲：改 `' + BOOK + '.html` 后用浏览器打印为 PDF，或回到项目里重跑 `npm run pipeline`');
  if (hasEpub) lines.push('- EPUB 版（' + BOOK + '.epub）可重排、无固定页码，适合手机与电子书阅读器；改完数据后重跑 `npm run epub` 再 `npm run pack`');
  lines.push('');
  fs.writeFileSync(path.join(TMP, '交付说明.md'), lines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(TMP, MARKER), JSON.stringify({
    tool: 'fandex/pack',
    packedAt: new Date().toISOString(),
    book: BOOK,
    pages,
    works: works.length,
    // 交付说明.md 是 pack 自己写的成品之一，必须登记：漏登记会让下一次 pack 把它当成"他人文件"而拒绝覆盖
    files: copied.map((c) => c.file).concat('交付说明.md'),
    // 核验留痕：谁验的、验到哪一步、有没有过期（下一版交付前可对照）
    verification: {
      check: CHECK_RECEIPT ? { at: CHECK_RECEIPT.generatedAt, state: CHECK_STATE, identity: CHECK_MISMATCH || null, counts: CHECK_RECEIPT.counts, failures: CHECK_RECEIPT.failures || [] } : null,
      audit: AUDIT_RECEIPT ? { at: AUDIT_RECEIPT.generatedAt, state: AUDIT_STATE, identity: AUDIT_MISMATCH || null, counts: AUDIT_RECEIPT.counts } : null,
      pagesReviewed: PAGES_REVIEWED,
      coversReviewed: COVERS_REVIEWED,
      sheetsAt: SHEET_AT,
      strict: STRICT,
      unverified,
    },
  }, null, 1));

  // ---- 交付前校验（不通过就绝不替换，上一版原样保留）----
  const problems = [];
  if (!fs.existsSync(path.join(TMP, BOOK + '.pdf'))) problems.push('[P4] 临时目录里没有 PDF');
  else if (fs.statSync(path.join(TMP, BOOK + '.pdf')).size !== pdfSize) problems.push('[P5] 复制的 PDF 与源文件体积不一致');
  if (!fs.existsSync(path.join(TMP, '交付说明.md'))) problems.push('[P6] 交付说明未生成');
  try { JSON.parse(fs.readFileSync(path.join(TMP, MARKER), 'utf8')); }
  catch (e) { problems.push('[P7] 打包标记不可解析：' + e.message); }
  if (problems.length) {
    console.error('打包校验未通过，已放弃替换（上一版 _deliver 原样保留）：');
    problems.forEach((p) => console.error('  ' + p));
    fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(1);
  }

  // ---- 原子替换：旧 → .old，新 → 正式名，成功后再删旧的；失败回滚 ----
  let displaced = false;
  try {
    if (fs.existsSync(OUT)) { fs.renameSync(OUT, OLD); displaced = true; }
    fs.renameSync(TMP, OUT);
  } catch (e) {
    console.error('[P8] 替换失败：' + e.message);
    if (displaced && !fs.existsSync(OUT)) { try { fs.renameSync(OLD, OUT); console.error('  已回滚到上一版'); } catch (_) { } }
    if (fs.existsSync(TMP) && TMP_CREATED) fs.rmSync(TMP, { recursive: true, force: true });
    process.exit(1);
  }
  if (displaced) {
    // 只删清单登记过的文件（前面已确认没有未登记文件；这里再收一次防线，防替换期间有人往目录里塞东西）
    const leftover = removeOwned(OLD);
    if (leftover > 0) console.warn('⚠ 上一版目录里出现了未登记文件，已保留未删：' + OLD + '（请手动确认后再清理）');
  }

  // 终端输出一律依据实际 copied 列表，不再无条件宣称有 HTML
  const relSet = new Set(copied.map((c) => c.file));
  console.log('已打包 → ' + OUT);
  if (relSet.has(BOOK + '.pdf')) console.log('  ' + BOOK + '.pdf（' + kb(pdfSize) + (pages ? '，' + pages + ' 页' : '') + '）');
  if (hasHtml) console.log('  ' + BOOK + '.html（可自行微调重渲）');
  else console.warn('⚠ 没找到 HTML 源（' + HTML + '）：交付包里没有可微调重渲的 HTML');
  if (hasEpub) console.log('  ' + BOOK + '.epub（可重排，手机/阅读器用）');
  else console.log('  （未含 EPUB —— 可选：先跑 `npm run epub` 再 pack）');
  if (nCovers) console.log('  covers/ 封面图 ' + nCovers + ' 张');
  if (nCards) console.log('  分享卡 ' + nCards + ' 张');
  if (nGallery) console.log('  高清整页图 ' + nGallery + ' 张');
  console.log('  交付说明.md' + (hasSources ? ' + 素材来源台账.md' : '（未含来源台账：先跑 npm run sources）'));
  console.log('');
  // 交付诚实性：把没做的环节明确报出来（别让"已交付"读成"已全部核验"）
  if (unverified.length) {
    console.log('⚠ 有未经核验的环节（交付说明里已如实标注）：');
    unverified.forEach((u) => console.log('   · ' + u));
  } else {
    console.log('核验齐了：产物断言 + 数据审计 + 目检声明都在。');
  }
  // --strict：让上层/CI 能用退出码 gate；默认行为不变（不破坏现有用例）
  if (STRICT && unverified.length) {
    console.error('[P11] --strict：还有 ' + unverified.length + ' 项未经核验，按非零退出（交付物已生成）');
    process.exitCode = 1;
  }
  console.log('');
  console.log('发出去之前记得：' + (hasSources ? '确认台账里的图库来源已尽量回溯官方原图；' : '') + '别把 scripts/config.json、names.txt、anime_research/ 一起带上（含你的路径与片单）。');
})().catch((e) => {
  // 中途抛错不再留无标记的 <out>.tmp：本次自己建的 TMP 可以整体删（启动时已清掉旧残留）
  console.error('[P10] 打包中断：' + (e && e.message ? e.message : e));
  try {
    if (TMP_CREATED && fs.existsSync(TMP)) {
      fs.rmSync(TMP, { recursive: true, force: true });
      console.error('  已清理本次的临时目录：' + TMP);
    }
  } catch (e2) {
    console.warn('⚠ 清理临时目录失败：' + e2.message + '（路径：' + TMP + '，确认全是本工具产物后手动删除）');
  }
  console.error('  → 上一版交付目录未被改动；修好上面的原因后重跑 `npm run pack`');
  process.exit(1);
});

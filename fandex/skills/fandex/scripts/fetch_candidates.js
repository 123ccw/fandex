// 候选图抓取与对比（safebooru official_art → 评分 → 3:4 瓦片预览 + 编号）
// 用法：
//   node fetch_candidates.js <tag>                抓该角色的候选 → anime_build/_candidates/sheet.png + manifest.json
//   node fetch_candidates.js --pick <编号>         取选中的原图入库 → anime_research/covers/picked.jpg
//   可选 --keep-top 0.79                          只保上部（裁掉底部宣传字区）
//   可选 --as <作品名>                             把这条件图记进来源台账时归属到该作品（见 npm run sources）
// 产物用固定文件名（避免命令行输入进入文件路径）；入库后自行改名或在 research JSON 里引用 picked.jpg
// 标签用 safebooru 写法（下划线，如 yanami_anna）；选图标准见 references/image-selection.md
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { ROOT } = require('./_config');
const OUT = path.join(ROOT, 'anime_build', '_candidates');
const SHEET = path.join(OUT, 'sheet.png');
const MANIFEST = path.join(OUT, 'manifest.json');
const TMP = path.join(OUT, 'download.tmp');
const COVERS = path.join(ROOT, 'anime_research', 'covers');
const PICKED = path.join(COVERS, 'picked.jpg');
const UA = 'Mozilla/5.0 (compatible; fandex)';
const LIMIT = 12, CELL_W = 300, CELL_H = 410, COLS = 4;   // 3:4.1 ≈ 封面瓦片比例
const MIN_SIDE = 500;

function curl(args) { return execFileSync('curl', args, { maxBuffer: 40 * 1024 * 1024 }); }
function curlText(args) { return execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); }
// -f：HTTP 4xx/5xx 时让 curl 非零退出。没有它，错误页 HTML 会被当图片原样存下来、后续 loadImage 假成功
function dl(url, dest, timeout) { curl(['-sfL', '--connect-timeout', '12', '--max-time', timeout || '120', '-H', `User-Agent: ${UA}`, '-o', dest, url]); }

// 并发下载：dl() 是同步的，12 张候选逐张下最坏要十几分钟。这里给个并发上限（safebooru 是公益站，别打太狠）。
const CONCURRENCY = 4;
function dlAsync(url, dest, timeout) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sfL', '--connect-timeout', '12', '--max-time', timeout || '120', '-H', `User-Agent: ${UA}`, '-o', dest, url],
      { maxBuffer: 40 * 1024 * 1024 }, (err) => (err ? reject(err) : resolve()));
  });
}
async function mapLimit(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; await worker(items[i], i); }
  }));
}

function fetchList(tag) {
  // 硬过滤分级：safebooru 本身是 SFW 站，但同族图站常混入擦边素材，这里按白名单原则显式排除。
  // 涉未成年角色的性化素材在多国属刑事问题，风险远大于版权——宁可少抓也不能抓到。
  const url = `https://safebooru.org/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(tag)}+official_art+-rating:explicit+-rating:questionable&limit=40`;
  const xml = curlText(['-sf', '--connect-timeout', '12', '--max-time', '60', '-H', `User-Agent: ${UA}`, url]);
  return [...xml.matchAll(/<post [^>]*>/g)].map(m => m[0]).map(s => ({
    file: (s.match(/file_url="([^"]+)"/) || [])[1],
    w: +(s.match(/width="(\d+)"/) || [])[1] || 0,
    h: +(s.match(/height="(\d+)"/) || [])[1] || 0,
  })).filter(p => p.file && p.w >= MIN_SIDE && p.h >= MIN_SIDE)
    .sort((a, b) => b.w * b.h - a.w * a.h);
}

(async () => {
  const argv = process.argv.slice(2);
  const pickI = argv.indexOf('--pick');
  if (pickI >= 0) {
    // 入库（内联，不设独立入口）：编号只允许两位数字；读写的三个文件路径全为常量
    const rawPick = argv[pickI + 1];
    // 先判空再 parseInt：省略编号时 parseInt(undefined) = NaN，旧提示会变成"编号非法（应为两位数字）：NaN"
    if (rawPick == null || rawPick === '' || rawPick.startsWith('--')) {
      console.error('--pick 缺编号（应为两位数字，如 `--pick 03`）');
      process.exit(1);
    }
    const idx = String(parseInt(rawPick, 10)).padStart(2, '0');
    if (!/^[0-9]{2}$/.test(idx)) { console.error('编号非法（应为两位数字）：' + rawPick); process.exit(1); }
    const ktI = argv.indexOf('--keep-top');
    const keep = ktI > -1 ? Number(argv[ktI + 1]) : 1;
    if (!Number.isFinite(keep) || keep <= 0 || keep > 1) { console.error('keep-top 应为 (0,1]'); process.exit(1); }
    const asI = argv.indexOf('--as');
    const asWork = asI > -1 && argv[asI + 1] && !argv[asI + 1].startsWith('--') ? argv[asI + 1] : '';
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const hit = man.find(x => x.idx === idx);
    if (!hit) { console.error('清单里没有编号 ' + idx + '（先跑一次抓取）'); process.exit(1); }
    dl(hit.url, TMP);
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const im = await loadImage(TMP);
    const srcH = Math.max(1, Math.floor(im.height * keep));
    const RATIO = 3 / 4.1;
    let w = Math.min(im.width, Math.floor(srcH * RATIO));
    let h = Math.floor(w / RATIO);
    if (h > srcH) { h = srcH; w = Math.floor(h * RATIO); }
    const c = createCanvas(w, h);
    c.getContext('2d').drawImage(im, -Math.floor((im.width - w) / 2), -Math.floor((srcH - h) / 2));
    fs.mkdirSync(COVERS, { recursive: true });
    fs.writeFileSync(PICKED, c.toBuffer('image/jpeg', 92));
    fs.rmSync(TMP, { force: true });   // 中间下载文件不再留着
    // 记一条来源（合规台账）：渠道 = 图库 safebooru，出处 = 该帖原图地址
    try {
      require('./_ledger').add(ROOT, { work: asWork, kind: 'cover', channel: 'safebooru', url: hit.url, note: '候选图 --pick ' + idx });
      console.log('已记入来源台账：safebooru' + (asWork ? ' · ' + asWork : '（未归属，下次可加 --as <作品名>）'));
    } catch (e) {
      const led = require('./_ledger');
      if (e instanceof led.LedgerCorruptError) {
        // 台账损坏：图已入库，但必须让退出码非零，别让人以为一切正常（历史没被清空，原文件另有备份）
        led.failCorrupt(e);
        process.exitCode = 1;
      } else {
        console.warn('⚠ 来源台账写入失败（不影响入库）：' + e.message);
      }
    }
    console.log(`已入库 ${PICKED}（${w}x${h}，取上部 ${(keep * 100).toFixed(0)}%，JPEG q92）`);
    console.log('下一步：改名到 anime_research/covers/<角色名>.jpg，并在 research JSON 的 cover/portrait 里引用');
    console.log('交付前记得 `npm run sources` 出台账（anime_build/_sources.md）');
    return;
  }
  const tag = argv.filter(a => !a.startsWith('--'))[0];
  if (!tag) { console.error('用法: node fetch_candidates.js <safebooru_tag>'); process.exit(1); }
  if (!/^[a-z0-9_]+$/.test(tag)) { console.error('标签非法（只允许小写字母/数字/下划线）：' + tag); process.exit(1); }

  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  fs.mkdirSync(OUT, { recursive: true });
  const posts = fetchList(tag);
  if (!posts.length) { console.error(tag + ': 没有候选——先核对标签拼写（safebooru 用小写+下划线，如 yanami_anna），再确认网络能到 safebooru.org（curl 的连接错误有时被 -s 吞掉）'); process.exit(2); }
  const picks = posts.slice(0, LIMIT);
  // 先把候选图并发拉全（原来是在下面的循环里逐张同步下载），再逐张评分、出瓦片
  const files = picks.map((_, i) => path.join(OUT, 'cand-' + String(i).padStart(2, '0') + '.img'));
  let dlFail = 0;
  await mapLimit(picks, CONCURRENCY, async (p, i) => {
    try { await dlAsync(p.file, files[i], '90'); }
    catch (e) {
      // 单张失败：记数并删掉可能留下的半截文件（curl -f 不会写错误页，但空文件也会让 loadImage 失败）
      dlFail++;
      try { fs.rmSync(files[i], { force: true }); } catch (_) { }
    }
  });
  const tiles = [], manifest = [];
  for (let i = 0; i < picks.length; i++) {
    try {
      const im = await loadImage(files[i]);
      // 非白底比例（0=纯白/透明底；越高越"有环境"）
      const chk = createCanvas(64, 64); const cc = chk.getContext('2d');
      cc.drawImage(im, 0, 0, 64, 64);
      const d = cc.getImageData(0, 0, 64, 64).data;
      let nonWhite = 0;
      for (let p = 0; p < d.length; p += 4) {
        const lum = (d[p] + d[p + 1] + d[p + 2]) / 3;
        const sat = Math.max(d[p], d[p + 1], d[p + 2]) - Math.min(d[p], d[p + 1], d[p + 2]);
        if (!(lum > 240 && sat < 18)) nonWhite++;
      }
      const bg = nonWhite / 4096;
      // 3:4 瓦片预览（cover 裁切，所见即所得）
      const cell = createCanvas(CELL_W, CELL_H); const cx = cell.getContext('2d');
      const s = Math.max(CELL_W / im.width, CELL_H / im.height);
      cx.drawImage(im, (CELL_W - im.width * s) / 2, (CELL_H - im.height * s) / 2, im.width * s, im.height * s);
      tiles.push({ idx: String(i).padStart(2, '0'), cell, bg, w: im.width, h: im.height });
      manifest.push({ idx: String(i).padStart(2, '0'), url: picks[i].file, w: im.width, h: im.height, bg: +bg.toFixed(3) });
    } catch (e) { /* 单张失败跳过 */ }
  }
  if (!tiles.length) { console.error('候选下载全部失败'); process.exit(2); }
  // 12 张只到 3 张也打印"3 张候选"并 exit 0，是旧版的假成功；这里如实报损失，失败过半用非零退出码
  const lost = picks.length - tiles.length;
  if (lost > 0) {
    console.warn(`⚠ ${lost}/${picks.length} 张候选没能拿到（下载失败 ${dlFail} 张，其余为解码失败）`);
    if (lost * 2 > picks.length) {
      console.error(`[F1] 候选失败过半：只成功 ${tiles.length}/${picks.length} 张 —— 检查网络/代理，或换标签重试`);
      process.exitCode = 1;
    }
  }
  tiles.sort((a, b) => (b.bg > 0.35) - (a.bg > 0.35) || b.w * b.h - a.w * a.h);   // 有背景的排前面
  const rows = Math.ceil(tiles.length / COLS);
  const canvas = createCanvas(COLS * (CELL_W + 8) + 8, rows * (CELL_H + 44) + 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a1f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  tiles.forEach((t, i) => {
    const x = 8 + (i % COLS) * (CELL_W + 8), y = 8 + Math.floor(i / COLS) * (CELL_H + 44);
    ctx.drawImage(t.cell, x, y);
    ctx.fillStyle = t.bg > 0.35 ? '#7ee787' : '#ffd75e'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`${t.idx}  ${t.w}x${t.h}  bg=${t.bg.toFixed(2)}`, x + 4, y + CELL_H + 28);
  });
  fs.writeFileSync(SHEET, canvas.toBuffer('image/png'));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  const good = tiles.filter(t => t.bg > 0.35).length;
  console.log(`${tag}: ${tiles.length} 张候选（有背景 ${good} 张，绿字）→ ${SHEET}`);
  console.log('接下来：看对比图挑编号 → node fetch_candidates.js --pick <编号>');
})().catch(e => { console.error('失败：', e.message); process.exit(1); });

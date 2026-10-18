// 分享物料导出：收藏卡 PNG + 高清整页图（社交发图用）
// 依赖：playwright（渲染）、pdfjs-dist + @napi-rs/canvas（整页高清图）
// 用法: node export_cards.js   （先跑过 npm run pipeline）
// 退出码：0 正常；1 缺输入 / 0 张产出 / 运行异常（旧版这些情况都静默 exit 0，看着像成功）
// 写盘前会清空 anime_build/_cards 与 _gallery：避免上一版的 card-09..12 混进本次交付
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { ROOT, BOOK } = require('./_config');
const BLD = path.join(ROOT, 'anime_build');
const OUT_CARDS = path.join(BLD, '_cards');
const OUT_GALLERY = path.join(BLD, '_gallery');

let cleanupBrowser = null;   // 异常路径也要收起浏览器，不依赖进程退出时的兜底清理
(async () => {
  const { chromium } = require('playwright');
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (e) { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
  cleanupBrowser = browser;

  // ① 收藏卡 → PNG（deviceScaleFactor 2 保证清晰度）
  const cardsFile = path.join(BLD, 'share_cards.html');
  if (fs.existsSync(cardsFile)) {
    // 先清空输出目录再写：部数从 12 改 8 后重跑时，旧的 card-09..12 会被当成本次产物一起打包出去
    fs.rmSync(OUT_CARDS, { recursive: true, force: true });
    fs.mkdirSync(OUT_CARDS, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 820, height: 1120 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(cardsFile).href, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const cards = await page.$$('.scard');
    for (let i = 0; i < cards.length; i++) {
      await cards[i].screenshot({ path: path.join(OUT_CARDS, `card-${String(i + 1).padStart(2, '0')}.png`) });
    }
    if (!cards.length) {
      console.error('[E1] share_cards.html 里一张 .scard 卡片都没有（0 张）——检查构建是否正常（npm run build）');
      process.exitCode = 1;   // 旧行为是 exit 0，终端只看到 cards: 0，像成功
    }
    console.log('cards:', cards.length, '张 ->', OUT_CARDS);
    await page.close();
  } else {
    console.error('[E1] 未找到分享卡源文件 share_cards.html —— 请先跑构建（npm run pipeline）');
    process.exitCode = 1;
  }

  // ② 高清整页图（scale 2，联络表的低清图管目检，这批管发图）
  const pdfPath = path.join(BLD, BOOK + '.pdf');
  if (fs.existsSync(pdfPath)) {
    fs.rmSync(OUT_GALLERY, { recursive: true, force: true });
    fs.mkdirSync(OUT_GALLERY, { recursive: true });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = require('@napi-rs/canvas');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      fs.writeFileSync(path.join(OUT_GALLERY, `page-${String(i).padStart(2, '0')}.png`), canvas.toBuffer('image/png'));
    }
    if (!doc.numPages) { console.error('[E1] PDF 页数为 0：没有可导出的整页图'); process.exitCode = 1; }
    console.log('gallery:', doc.numPages, '页 ->', OUT_GALLERY);
  } else {
    console.error('[E1] 未找到 PDF —— 请先跑渲染（npm run pipeline）');
    process.exitCode = 1;
  }

  // 合规护栏：这些卡片与整页图天生是「发图用」的，而它们嵌的是作品海报/立绘（第三方素材）。
  // 之前这里是静默的——导出成功就完事，没人提醒「公开发布前要确认授权」。
  if (process.exitCode !== 1) {
    console.warn('');
    console.warn('  ⚠ 合规提醒：_cards/ 与 _gallery/ 内嵌作品海报/立绘（第三方素材）');
    console.warn('    仅供个人收藏。公开发布（发群 / 上传平台 / 印制售卖）前须自行确认授权——注明来源不等于获得授权。');
    console.warn('    详见 references/compliance.md（官网 / 发行方 / 原作出版社 优先，台账 npm run sources）');
  }

  await browser.close();
})().catch(async e => {
  if (cleanupBrowser) await cleanupBrowser.close().catch(() => {});
  console.error('[E2] 导出中断：' + String(e && e.message || e).split('\n')[0]);
  console.error('  → 常见原因：playwright 浏览器未安装（npx playwright install chromium）、PDF/HTML 损坏、字体缺失；处理完重跑 `npm run cards`');
  process.exit(1);
});

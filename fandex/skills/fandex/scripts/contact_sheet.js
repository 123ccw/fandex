// 整本 PDF → 每页 PNG → 联络表（全页目检用）
// 依赖：本目录先执行 `npm i @napi-rs/canvas pdfjs-dist`
//
// 用法:
//   node contact_sheet.js                              # 默认：<项目根>/anime_build/<书名>.pdf → anime_build/_sheets/
//   node contact_sheet.js --pdf <任意.pdf>              # 通用模式：不读 config.json，任何 PDF 都能做目检表
//   node contact_sheet.js --pdf x.pdf --out <目录> --scale 0.8
//
// 写成两种模式的原因：目检是这套流程里唯一"机器验不了、必须人眼看"的一环，
// 不该只对本 skill 的成品可用——顺手拿它检查任何 PDF（报告、别的 skill 的产出）都行。
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ---- 参数 ----
const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const SCALE = Number(argOf('--scale')) > 0 ? Number(argOf('--scale')) : 0.6;

let PDF, OUT, MODE;
const pdfArg = argOf('--pdf');
if (pdfArg) {
  // 通用模式：完全不碰 _config（也就不要求项目根/config.json 存在）
  MODE = '通用';
  PDF = path.resolve(pdfArg);
  OUT = argOf('--out') ? path.resolve(argOf('--out')) : path.join(path.dirname(PDF), '_sheets');
} else {
  // 默认模式：读项目配置（单文件唯一事实源 scripts/_config.js）
  MODE = '项目';
  const { ROOT, BOOK } = require('./_config');
  PDF = path.join(ROOT, 'anime_build', BOOK + '.pdf');
  OUT = path.join(ROOT, 'anime_build', '_sheets');
}
const TMP = path.join(path.dirname(OUT), '_allpages');

if (!fs.existsSync(PDF)) {
  console.error('未找到 PDF：' + PDF);
  console.error(pdfArg
    ? '  → 检查 --pdf 的路径'
    : '  → 先跑渲染（npm run pipeline，或单独 node render_pw.js）；也可以用通用模式：node contact_sheet.js --pdf <任意.pdf>');
  process.exit(1);
}

(async () => {
  // pdfjs-dist 的 .mjs 是 ESM；用动态 import 加载，兼容 Node >=20（require(ESM) 需 20.19+/22.12+）
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const data = new Uint8Array(fs.readFileSync(PDF));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    fs.writeFileSync(path.join(TMP, `p${String(i).padStart(2, '0')}.png`), canvas.toBuffer('image/png'));
  }
  console.log('源文件（' + MODE + '模式）:', PDF);
  console.log('pages:', doc.numPages);

  const files = fs.readdirSync(TMP).filter(f => f.endsWith('.png')).sort();
  const imgs = await Promise.all(files.map(f => loadImage(path.join(TMP, f))));
  const w = imgs[0].width, h = imgs[0].height;
  const COLS = 4, ROWS = 5;
  let idx = 0, sheet = 0;
  fs.mkdirSync(OUT, { recursive: true });
  while (idx < imgs.length) {
    const canvas = createCanvas(COLS * w + (COLS + 1) * 8, ROWS * h + (ROWS + 1) * 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (idx >= imgs.length) break;
      const x = 8 + c * (w + 8), y = 8 + r * (h + 8);
      ctx.drawImage(imgs[idx], x, y);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText(String(idx + 1), x + 6, y + 24);
      idx++;
    }
    fs.writeFileSync(path.join(OUT, `sheet_${String(++sheet).padStart(2, '0')}.png`), canvas.toBuffer('image/png'));
  }
  console.log('sheets:', sheet, '->', OUT);
  console.log('提示：PNG 是目检材料，不是证据——要真的逐页看，并把看没看写进交付说明（pack --pages-reviewed）');
})().catch(e => { console.error('联络表生成失败：', String(e && e.message || e).split('\n')[0]); process.exit(1); });

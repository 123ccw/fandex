// EPUB 导出包装：定位 Python 后跑 export_epub.py
// 用法: npm run epub [-- --no-font] [-- --out <文件>]
// Python 探测走 scripts/_python.js（ANIME_BOOK_PYTHON / PYTHON / .venv / PATH 统一优先级）
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const { findPython, missingMessage } = require('./_python');

const PYF = findPython({ requireFontTools: false, projectRoot: process.env.ANIME_BOOK_ROOT || '' });
if (!PYF) {
  console.error(missingMessage(false));
  console.error('也可先用 -- --no-font 跳过字体内嵌，但 Python 仍是必需的。');
  process.exit(1);
}

const args = [path.join(__dirname, 'export_epub.py')].concat(process.argv.slice(2));
const r = spawnSync(PYF.cmd, (PYF.args || []).concat(args), { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);

// 收录作品标题解析（单一事实源）
//
// 为什么单独一份：pagemap（用 PDF 书签反查页码）与 pdfprobe（校验书签/正文是否含每部）
// 需要完全一样的"这部作品在册子里叫什么"，两处各写一套迟早漂移。
'use strict';
const fs = require('fs');
const path = require('path');

// 标题来源 = base.json 的收录范围（册子里实际有的作品）；research 里多出的未收录稿子不算。
// 优先级：research 的 title_zh > base 的 title > folder
function resolveTitles(ROOT) {
  const RDIR = path.resolve(ROOT, 'anime_research');
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'anime_base.json'), 'utf8'));
  return Object.values(base).map((rec) => {
    const rp = path.resolve(RDIR, rec.folder + '.json');
    // 边界校验：目标必须落在 anime_research 目录内
    if (rp === RDIR || !rp.startsWith(RDIR + path.sep)) return rec.title || rec.folder;
    if (fs.existsSync(rp)) {
      try { const r = JSON.parse(fs.readFileSync(rp, 'utf8')); return r.title_zh || rec.title || rec.folder; } catch (e) { /* 解析失败退回 base */ }
    }
    return rec.title || rec.folder;
  }).filter(Boolean);
}

// Chromium 生成的书签标题与提取出的正文都会吞掉部分空格 → 比对一律去空格
const norm = (s) => String(s).replace(/\s+/g, '');

module.exports = { resolveTitles, norm };

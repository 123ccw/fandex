// 一次性迁移：anime_research/*.json 的 franchise[].collected → userdata.json
// 只补缺失、绝不覆盖已有用户数据；没有新增就不写文件（幂等）。
// 用法: node migrate_userdata.js [--dry-run] [--force]
'use strict';
const path = require('path');
const { ROOT } = require('./_config');
const ud = require('./_userdata');

const argv = process.argv.slice(2);
const DRY = argv.indexOf('--dry-run') >= 0;
const FORCE = argv.indexOf('--force') >= 0;
const FILE = ud.filePath();

let res;
try {
  res = ud.load();                // 损坏会抛：绝不拿坏文件当空数据继续
} catch (err) {
  console.error(err.message);
  console.error('修复办法：把该文件改名（例如 userdata.json.bak）后再跑一次 —— 会从研究稿重建；');
  console.error('内容确认无误后，再把 .bak 里你自己写的评分/短评手工并回去。本脚本不会自动删除或覆盖它。');
  process.exit(2);
}
if (res.missing) console.log('userdata 不存在，将新建：' + FILE);

const r = ud.migrate(res.data, { researchDir: path.join(ROOT, 'anime_research') });
if (r.error) {
  console.error('读不到 anime_research/：' + r.error.message);
  process.exit(1);
}
const s = r.stats;
console.log('扫描调研稿 ' + s.files + ' 份：新增作品 ' + s.worksAdded + ' 个、系列条目 ' + s.franchisesAdded + ' 条'
  + (s.skipped ? '，跳过无法解析的 ' + s.skipped + ' 份' : ''));

if (DRY) { console.log('--dry-run：未写入。'); process.exit(0); }
if (!s.worksAdded && !s.franchisesAdded && !FORCE) {
  console.log('没有可迁移的新数据，未改动 ' + FILE);
  process.exit(0);
}
const w = ud.save(r.data);
console.log('已写入 ' + w.path + '（作品 ' + w.works + ' 个）——这是个人数据，请单独备份。');

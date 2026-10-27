// 个人数据的写入口：我的评分 / 短评 / 已收状态 / 首看日等
// 为什么需要它：userdata.json 是唯一"用户写的字不能丢"的文件，不该让人手改 JSON。
//
// 用法:
//   node set_userdata.js --folder "作品名" --score 8.5 [--scale 10] [--source manual]
//                        [--comment "短评原文"] [--status completed] [--first-watched 2022-04-10]
//                        [--finished-at 2022-06-26] [--collected true|false] [--rewatch 1]
//                        [--tags a,b] [--clear score,comment] [--dry-run]
//   node set_userdata.js --list
'use strict';
const ud = require('./_userdata');

const argv = process.argv.slice(2);
const FILE = ud.filePath();

function has(name) { return argv.indexOf('--' + name) >= 0; }
function opt(name) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined || (v.length > 1 && v.slice(0, 2) === '--')) return '';
  return v;
}
function fail(msg) { console.error(msg); process.exit(1); }

if (has('help') || argv.length === 0) {
  console.log([
    '用法:',
    '  node set_userdata.js --folder <作品名> --score 8.5 [--scale 10] [--source manual] [--comment "短评原文"]',
    '                       [--status completed] [--first-watched 2022-04-10] [--finished-at 2022-06-26]',
    '                       [--collected true|false] [--rewatch 1] [--tags a,b] [--clear score,comment] [--dry-run]',
    '  node set_userdata.js --list',
    '',
    '文件: ' + FILE,
  ].join('\n'));
  process.exit(0);
}

// 读取：损坏会抛（绝不拿坏文件当空数据）
let current = null;
try {
  const res = ud.load();
  current = res.data;
} catch (err) {
  console.error(err.message);
  console.error('修复办法：把该文件改名（如 userdata.json.bak）后再跑一次 —— 会从研究稿重建；确认内容无误再把 .bak 手工并回去。');
  process.exit(2);
}

if (has('list')) {
  const works = current ? Object.values(current.works) : [];
  if (!works.length) { console.log('userdata 里还没有任何作品（' + FILE + '）'); process.exit(0); }
  console.log('文件: ' + FILE + '（' + works.length + ' 部）');
  for (const w of works) {
    const sc = w.score && typeof w.score === 'object' ? (w.score.value + '/' + (w.score.scale || 10) + (w.score.source ? ' · ' + w.score.source : '')) : (w.score != null ? String(w.score) : '—');
    const cm = w.comment ? String(w.comment).slice(0, 24) + (String(w.comment).length > 24 ? '…' : '') : '—';
    const fr = Array.isArray(w.franchise) ? w.franchise.length : 0;
    console.log('  ' + (w.folder || w.work_id) + ' | 评分 ' + sc + ' | 短评 ' + cm + ' | 已收 ' + (w.collected === true ? '是' : w.collected === false ? '否' : '—') + ' | 系列条目 ' + fr);
  }
  process.exit(0);
}

const folder = opt('folder');
if (!folder) fail('缺少 --folder <作品名>');

const fields = {};
const clearList = [];
const errs = [];

const rawScore = opt('score');
if (rawScore !== null) {
  const v = Number(rawScore);
  const scale = opt('scale') !== null ? Number(opt('scale')) : 10;
  if (!isFinite(v) || v <= 0) errs.push('--score 必须是正数，收到：' + JSON.stringify(rawScore));
  else if (!isFinite(scale) || scale <= 0) errs.push('--scale 必须是正数');
  else if (v > scale) errs.push('--score ' + v + ' 超过 --scale ' + scale + '（如属故意，请显式给 --scale ' + v + '）');
  else {
    const src = opt('source');
    fields.score = src ? { value: v, scale: scale, source: src } : { value: v, scale: scale };
  }
}
if (has('clear')) {
  for (const f of String(opt('clear') || '').split(',')) {
    const k = f.trim();
    if (!k) continue;
    if (['score', 'comment', 'status', 'first_watched', 'finished_at', 'collected', 'rewatch_count', 'tags'].indexOf(k) < 0) errs.push('--clear 不认识的字段：' + k);
    else clearList.push(k);
  }
}
const rawComment = opt('comment');
if (rawComment !== null) fields.comment = String(rawComment);
const rawStatus = opt('status');
if (rawStatus !== null) fields.status = String(rawStatus).toLowerCase();
const rawCollected = opt('collected');
if (rawCollected !== null) {
  const v = String(rawCollected).toLowerCase();
  if (['true', '1', 'yes', 'y'].indexOf(v) >= 0) fields.collected = true;
  else if (['false', '0', 'no', 'n'].indexOf(v) >= 0) fields.collected = false;
  else errs.push('--collected 只接受 true/false，收到：' + JSON.stringify(rawCollected));
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
for (const [flag, key] of [['first-watched', 'first_watched'], ['finished-at', 'finished_at']]) {
  const v = opt(flag);
  if (v !== null) {
    if (v === '' || v === 'null') clearList.push(key);
    else if (!DATE_RE.test(v)) errs.push('--' + flag + ' 需要 YYYY-MM-DD 或 null，收到：' + JSON.stringify(v));
    else fields[key] = v;
  }
}
const rawRewatch = opt('rewatch');
if (rawRewatch !== null) {
  const v = Number(rawRewatch);
  if (!isFinite(v) || v < 0 || Math.floor(v) !== v) errs.push('--rewatch 需要非负整数，收到：' + JSON.stringify(rawRewatch));
  else fields.rewatch_count = v;
}
const rawTags = opt('tags');
if (rawTags !== null) fields.tags = rawTags === '' ? [] : String(rawTags).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

if (errs.length) { errs.forEach(function (e) { console.error('✗ ' + e); }); process.exit(1); }
if (!Object.keys(fields).length && !clearList.length) fail('没有任何要写入的字段 —— 用 --score / --comment / --collected / --first-watched / --clear 等，或先用 --list 看看现状');

// 记来源：手工写入也留痕（区别于 mal-xml 等导入器）
fields.provenance = { source: 'manual', imported_at: new Date().toISOString() };

const r = ud.setFields(current, folder, fields, { clear: clearList });
const tag = r.created ? '新建作品条目' : '已有条目';
const what = r.changed.length ? r.changed.join('、') : '（无变化）';

if (has('dry-run')) {
  console.log('[dry-run] ' + folder + ' · ' + tag + ' · 将变更：' + what + ' —— 未写入');
  process.exit(0);
}
const w = ud.save(r.data);
console.log(folder + ' · ' + tag + ' · 已写入：' + what);
console.log('→ ' + w.path + '（作品 ' + w.works + ' 个）——这是个人数据，请单独备份。');

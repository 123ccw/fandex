// 素材来源台账（内部模块）：记录每张图的渠道与出处，供 sources.js 与 fetch_candidates.js 共用
// 台账文件：<项目根>/anime_build/_sources.json
//
// 两条硬约束（都由本文件兜住）：
//   ① 解析失败 ≠ 空台账：损坏时先备份原文件再报错，绝不用空台账覆盖历史（见 load）
//   ② 记录日期一律用**本地日期**：原先的 toISOString() 是 UTC，东八区晚上会记成前一天（见 todayLocal）
const fs = require('fs');
const path = require('path');

// 渠道白名单 → 中文标签（顺序即推荐优先级：官方优先，图库兜底）
const CHANNELS = {
  official: '官方渠道',
  anilist: 'AniList',
  bangumi: 'Bangumi',
  wiki: '维基百科',
  safebooru: '图库 safebooru',
  other: '其它',
};

function ledgerPath(root) { return path.join(root, 'anime_build', '_sources.json'); }

// 本地日期 YYYY-MM-DD（不用 toISOString：那是 UTC，跨零点会把记录记到前后一天）
function todayLocal(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

// 台账损坏：备份原文件后抛出，由调用方决定退出（绝不静默返回空台账）
class LedgerCorruptError extends Error {
  constructor(message, backup) {
    super(message);
    this.name = 'LedgerCorruptError';
    this.backup = backup || null;
  }
}

// 损坏时的统一中文提示（调用方在退出前调用）
function failCorrupt(e) {
  console.error('[L1] 素材来源台账损坏，已拒绝写入（不会用空台账清空历史）：' + (e && e.message ? e.message : e));
  if (e && e.backup) console.error('  原文件已备份：' + e.backup);
  console.error('  → 修好该 JSON（或删掉损坏文件重新开始）后重试；历史记录不会被覆盖。');
}

function load(root) {
  const f = ledgerPath(root);
  if (!fs.existsSync(f)) return { version: 1, entries: [] };   // 真的不存在 → 全新空台账
  let raw;
  try { raw = fs.readFileSync(f, 'utf8'); }
  catch (e) { throw new LedgerCorruptError('读不出文件：' + f + '（' + e.message + '）', null); }
  let data = null, parseErr = null;
  try { data = JSON.parse(raw); } catch (e) { parseErr = e; }
  if (parseErr || !data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    // 文件存在但不可用：先备份，再抛错 —— 直接返回空台账会被 add() 顺势 save() 覆盖掉全部历史
    const bak = f + '.bak';
    let saved = null;
    try { fs.copyFileSync(f, bak); saved = bak; }
    catch (e2) { console.error('⚠ 备份损坏台账失败（不影响拒绝写入）：' + e2.message); }
    throw new LedgerCorruptError(
      parseErr ? 'JSON 解析失败（' + parseErr.message + '）' : '结构不对（缺少 entries 数组）',
      saved
    );
  }
  return data;
}

function save(root, data) {
  const f = ledgerPath(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 1));
  return f;
}

/** 追加一条来源记录；同 work+kind 只保留最新一条（重新取图就覆盖旧记录） */
function add(root, entry) {
  const data = load(root);   // 损坏时这里会抛 LedgerCorruptError，绝不继续往下覆盖
  // work 为空（省略 --as）时不参与 work+kind 去重：否则不同角色会互相顶掉，先记的出处永久丢失。
  // 退化为"按出处 URL 去重"（同一条 URL 重记仍是覆盖，不会无限膨胀）。
  const dedupEmptyWork = !entry.work;
  data.entries = (data.entries || []).filter((e) => {
    if (dedupEmptyWork) return e.url !== entry.url;
    return !(e.work === entry.work && e.kind === entry.kind);
  });
  if (dedupEmptyWork) {
    console.warn('⚠ 未指定 --as <作品名>：本条按出处 URL 去重（不会再顶掉其它角色的记录）；建议补上 --as');
  }
  data.entries.push({ at: todayLocal(), ...entry });
  return save(root, data);
}

module.exports = { CHANNELS, ledgerPath, load, save, add, todayLocal, LedgerCorruptError, failCorrupt };

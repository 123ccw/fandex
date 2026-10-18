// 用户数据层（P0）：我的评分 / 短评 / 首看日 / 已收状态——只有用户本人有的那一层。
//
// 边界（硬规则，改代码前先读这里）：
//   1. 唯一写入者是本模块；构建(build_anime_html.js)、渲染、验收、打包全程只读。
//   2. 文件缺失 = 正常（走研究稿回退），不是错误；文件损坏 = 绝不静默当空数据。
//   3. 写入一律 tmp + rename 原子替换（同 anime_pagemap.js 的做法）。
//   4. 外部站点 ID 只放 ids；主键 work_id 一旦生成永不改。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, USERDATA } = require('./_config');

const SCHEMA_VERSION = 1;

function filePath() { return USERDATA || path.join(ROOT, 'userdata.json'); }

function empty() { return { schema_version: SCHEMA_VERSION, updated_at: null, works: {} }; }

function normWork(w) {
  const ids = (w.ids && typeof w.ids === 'object' && !Array.isArray(w.ids)) ? w.ids : {};
  return Object.assign({}, w, {
    ids: ids,
    franchise: Array.isArray(w.franchise) ? w.franchise : [],
  });
}

function normalize(raw) {
  const d = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = empty();
  out.schema_version = Number(d.schema_version) || SCHEMA_VERSION;
  out.updated_at = d.updated_at || null;
  const src = (d.works && typeof d.works === 'object' && !Array.isArray(d.works)) ? d.works : {};
  for (const id of Object.keys(src)) {
    const w = src[id];
    if (w && typeof w === 'object' && !Array.isArray(w)) out.works[id] = normWork(w);
  }
  return out;
}

// 读。返回 { data, path, missing, error }
//   · 文件不存在 → { data:null, missing:true, error:null }（正常）
//   · 解析失败   → { data:null, error }；soft 不抛，否则抛（写侧必须走抛，绝不拿坏文件当空数据）
function load(opts) {
  const o = opts || {};
  const f = filePath();
  let text;
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { data: null, path: f, missing: true, error: null };
    if (o.soft) return { data: null, path: f, missing: false, error: e };
    throw e;
  }
  try {
    return { data: normalize(JSON.parse(text)), path: f, missing: false, error: null };
  } catch (e) {
    const err = new Error('userdata 解析失败（' + f + '）：' + e.message + ' —— 先备份该文件再修，切勿让它被覆盖');
    if (o.soft) return { data: null, path: f, missing: false, error: err };
    throw err;
  }
}

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function save(data, opts) {
  const o = opts || {};
  const f = o.path || filePath();
  const out = normalize(data);
  out.schema_version = SCHEMA_VERSION;
  out.updated_at = new Date().toISOString();
  atomicWrite(f, JSON.stringify(out, null, 2) + '\n');
  return { path: f, works: Object.keys(out.works).length };
}

// 只读查询（构建侧用）。data 为 null 时全部返回空，构建自然回退研究稿。
function reader(data) {
  const byFolder = new Map();
  const src = (data && data.works) || {};
  for (const id of Object.keys(src)) {
    const w = src[id];
    if (w && w.folder) byFolder.set(String(w.folder), w);
  }
  return {
    size: function () { return byFolder.size; },
    work: function (folder) { return byFolder.get(String(folder)) || null; },
    // 我的评分：{ value, scale, source } 或 null（数字形式按 10 分制兜底）
    score: function (folder) {
      const w = byFolder.get(String(folder));
      if (!w || w.score == null) return null;
      if (typeof w.score === 'number') return w.score > 0 ? { value: w.score, scale: 10, source: '' } : null;
      const v = Number(w.score.value);
      if (!(v > 0)) return null;
      return { value: v, scale: Number(w.score.scale) || 10, source: String(w.score.source || '') };
    },
    // 我的短评：非空字符串或 ''
    comment: function (folder) {
      const w = byFolder.get(String(folder));
      return (w && typeof w.comment === 'string' && w.comment.trim()) ? w.comment.trim() : '';
    },
    // 系列条目的已收状态：先按 key 全等，再按 name 全等；查不到返回 undefined（= 用研究稿的旧值）
    franchiseState: function (folder, entry) {
      const w = byFolder.get(String(folder));
      if (!w || !entry) return undefined;
      const list = Array.isArray(w.franchise) ? w.franchise : [];
      const hit = (entry.key != null && list.find(function (x) { return x && x.key === entry.key; }))
        || list.find(function (x) { return x && x.name === entry.name; });
      return (hit && typeof hit.collected === 'boolean') ? hit.collected : undefined;
    },
  };
}

// work_id：由 folder 派生，可复现、可读、不随重跑变化。导入器/人工可另指定，但一旦生成不再改。
function workId(folder) {
  return 'w_' + crypto.createHash('sha1').update(String(folder)).digest('hex').slice(0, 10);
}

// 一次性迁移：anime_research/*.json 的 franchise[].collected → userdata
//   · 只补缺失，绝不覆盖已有用户值
//   · 幂等：没有新增时 worksAdded/franchisesAdded 都是 0（调用方据此决定不写文件）
function migrate(data, opts) {
  const o = opts || {};
  const out = normalize(data || empty());
  const stats = { files: 0, worksAdded: 0, franchisesAdded: 0, skipped: 0 };
  let files = [];
  try {
    files = fs.readdirSync(o.researchDir).filter(function (f) { return /\.json$/i.test(f); }).sort();
  } catch (e) {
    stats.skipped++;
    return { data: out, stats: stats, error: e };
  }
  const indexByFolder = {};
  for (const id of Object.keys(out.works)) {
    const folder = out.works[id].folder;
    if (folder) indexByFolder[String(folder)] = id;
  }
  for (const file of files) {
    let r;
    try {
      r = JSON.parse(fs.readFileSync(path.join(o.researchDir, file), 'utf8'));
    } catch (e) { stats.skipped++; continue; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { stats.skipped++; continue; }
    const folder = String(r.folder || file.replace(/\.json$/i, ''));
    let id = indexByFolder[folder];
    if (!id) {
      id = workId(folder);
      out.works[id] = normWork({ work_id: id, folder: folder });
      indexByFolder[folder] = id;
      stats.worksAdded++;
    }
    stats.files++;
    const work = out.works[id];
    const list = Array.isArray(r.franchise) ? r.franchise : [];
    for (const f of list) {
      if (!f || !f.name || typeof f.collected !== 'boolean') continue;
      const hit = (f.key != null && work.franchise.find(function (x) { return x && x.key === f.key; }))
        || work.franchise.find(function (x) { return x && x.name === f.name; });
      if (hit) continue;                       // 已有用户值 → 绝不覆盖
      work.franchise.push(f.key != null
        ? { key: f.key, name: f.name, collected: f.collected }
        : { name: f.name, collected: f.collected });
      stats.franchisesAdded++;
    }
  }
  return { data: out, stats: stats, error: null };
}

// 写入口：按 folder 定位（没有就新建），只改动传入的字段；返回 { data, workId, created, changed }
//   fields 支持 score / comment / status / first_watched / finished_at / collected / rewatch_count / tags / provenance
//   opts.clear 传字段名数组表示删除该字段（changed 里记成 "-字段名"）
function setFields(data, folder, fields, opts) {
  const o = opts || {};
  const out = normalize(data || empty());
  const name = String(folder == null ? '' : folder).trim();
  if (!name) throw new Error('setFields: folder 不能为空');
  let id = null;
  for (const k of Object.keys(out.works)) {
    if (out.works[k].folder === name) { id = k; break; }
  }
  let created = false;
  if (!id) {
    id = workId(name);
    out.works[id] = normWork({ work_id: id, folder: name });
    created = true;
  }
  const w = out.works[id];
  const changed = [];
  const f = fields || {};
  for (const key of Object.keys(f)) {
    if (f[key] === undefined) continue;
    if (JSON.stringify(w[key]) !== JSON.stringify(f[key])) { w[key] = f[key]; changed.push(key); }
  }
  for (const key of (o.clear || [])) {
    if (Object.prototype.hasOwnProperty.call(w, key)) { delete w[key]; changed.push('-' + key); }
  }
  return { data: out, workId: id, created: created, changed: changed, work: w };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  filePath: filePath,
  empty: empty,
  normalize: normalize,
  load: load,
  save: save,
  reader: reader,
  migrate: migrate,
  setFields: setFields,
  workId: workId,
  atomicWrite: atomicWrite,
};

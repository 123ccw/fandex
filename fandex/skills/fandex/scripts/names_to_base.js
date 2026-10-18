// 模式 A：names.txt（一行一部番剧名）+ anime_research/*.json → 合成 anime_base.json
// 前提：调研 agent 已为每部写好 research JSON，其中含 "units":[{"name","eps","airdate"}]（单元清单）与 "cover"
// 用法: node names_to_base.js
const fs = require('fs');
const path = require('path');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { ROOT } = require('./_config');

// 统一 JSON 读取：剥 BOM（PowerShell/记事本常见）并给出中文解析原因
function readJson(file) {
  let txt = fs.readFileSync(file, 'utf8');
  const bom = txt.charCodeAt(0) === 0xFEFF;
  if (bom) txt = txt.slice(1);
  try { return JSON.parse(txt); }
  catch (e) { throw new Error('JSON 解析失败（' + file + (bom ? '，文件带 BOM' : '') + '）：' + e.message); }
}
// 数值合理性：≥1e12 当毫秒；1e9–1e10 当秒并 ×1000；其余（2022 / 20221008 之类）不可信，置空并告警
// （与 build_anime_html.js 的 toMs 保持同一份实现）
const toMs = v => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n >= 1e12) return n;
    if (n >= 1e9 && n < 1e10) return n * 1000;
    console.warn('⚠ 时间值不可信（既非毫秒也非秒时间戳），已置空：' + v);
    return null;
  }
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : null;
};

const RDIR = path.resolve(ROOT, 'anime_research');
if (!fs.existsSync(path.join(ROOT, 'names.txt'))) {
  console.error('未找到 ' + path.join(ROOT, 'names.txt') + ' ——请先写一行一项的名单（番剧名，或 novel 模式下的角色名，见 SKILL.md）'); process.exit(1);
}
if (!fs.existsSync(RDIR)) {
  console.error('未找到 ' + RDIR + ' 目录——请先调研（见 SKILL.md），把每部的 <作品名>.json 放进去'); process.exit(1);
}
const rawNames = fs.readFileSync(path.join(ROOT, 'names.txt'), 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
// 去重：同名只保留第一次（否则 base 被覆盖、调研只做一份）；重名要出声
const seen = new Set();
const names = [];
const dupes = [];
for (const n of rawNames) {
  if (seen.has(n)) { dupes.push(n); continue; }
  seen.add(n); names.push(n);
}
if (dupes.length) console.warn('⚠ names.txt 有重复名（已去重，只保留第一次）: ' + [...new Set(dupes)].join('、'));
if (!names.length) {
  console.error('names.txt 去重后为空（应一行一项）——拒绝用空 {} 覆盖 ' + path.join(ROOT, 'anime_base.json')); process.exit(1);
}

const base = {};
const missing = [];
for (const name of names) {
  const p = path.resolve(RDIR, name + '.json');
  // 边界校验：目标必须落在 anime_research 目录内（拒绝名单里夹带路径）
  if (p !== RDIR && !p.startsWith(RDIR + path.sep)) { console.log('[跳过-越界名]', name); continue; }
  // 兜底：文件名与名单写法对不上时，按 folder/title 模糊匹配
  let hit = fs.existsSync(p) ? p : '';
  if (!hit) {
    for (const f of fs.readdirSync(RDIR).filter(f => f.endsWith('.json'))) {
      try {
        const j = readJson(path.join(RDIR, f));
        if (j.folder === name || j.title_zh === name) { hit = path.join(RDIR, f); break; }
      } catch (e) { /* skip bad json */ }
    }
  }
  if (!hit) { missing.push(name); continue; }
  // 坏 JSON 不让它抛栈：按"缺 research"记下并继续，别在写文件前崩掉
  let r;
  try { r = readJson(hit); }
  catch (e) { console.warn('⚠ research 读取失败，按缺 research 处理：' + name + ' ——' + e.message); missing.push(name); continue; }
  // units 必须是数组：字符串/对象形状会让构建端 .map 抛 TypeError（同样按缺 research 处理）
  if (r.units != null && !Array.isArray(r.units)) {
    console.warn('⚠ 字段形状不对（units 应为数组），按缺 research 处理：' + (r.folder || name)); missing.push(name); continue;
  }
  // 归一化：LLM 调研 JSON 的 eps/airdate 可能是字符串（"12" 会让构建端求和变拼接）
  const units = (r.units || []).map(u => ({ ...u, eps: Number(u.eps) || 0, airdate: toMs(u.airdate) }));
  base[r.folder || name] = {
    title: r.title_zh || name,
    folder: r.folder || name,
    airdate: units.map(u => u.airdate).find(Boolean) || null,
    titles: r.title_jp ? [r.title_jp] : [],
    genres: r.genres || [],
    overview: r.synopsis || '',
    rating: r.rating || [],
    cover: 'cover.jpeg', // 占位：模式 A 无视频库，实际封面走 research.cover 覆盖
    units,
  };
}
fs.writeFileSync(path.join(ROOT, 'anime_base.json'), JSON.stringify(base, null, 2), 'utf8');
console.log('base.json:', Object.keys(base).length, '部');
if (missing.length) { console.log('缺 research（先调研再跑）:', missing.join('、')); process.exitCode = 3; }

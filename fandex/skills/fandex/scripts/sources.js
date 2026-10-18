// 素材来源台账：把每张图的「渠道 + 出处 URL + 取得日期」记下来，交付时导出成 _sources.md
// 为什么：合规不该只停留在"文档里写一句仅个人收藏"。有了台账，公开分享或被人质疑时你能自证来源
// 用法：
//   node sources.js             → 同 report（默认动作就是出台账，跟文档承诺的 `npm run sources` 一致）
//   node sources.js add --work <作品名> --kind cover|portrait --channel official|anilist|bangumi|wiki|safebooru|other --url <出处页面> [--note 备注]
//   node sources.js report      → 写 <项目根>/anime_build/_sources.md
//   node sources.js list        → 直接打印台账
const fs = require('fs');
const path = require('path');
const { CHANNELS, ledgerPath, load, add, todayLocal, failCorrupt } = require('./_ledger');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { ROOT } = require('./_config');

const argv = process.argv.slice(2);
// 无参数默认 report：文档（references/build.md、compliance.md、image-selection.md）都写 `npm run sources` 会产出
// anime_build/_sources.md，而 pack 又靠该文件是否存在决定打不打包 —— 默认只 list 会形成"终端让你跑、跑了永远没文件"的死循环
const cmd = argv[0] || 'report';
function opt(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
}

const CH_LABEL = (c) => CHANNELS[c] || c || '未标注';

if (cmd === 'add') {
  const work = opt('work', '');
  const kind = opt('kind', 'cover');
  const channel = opt('channel', '');
  const url = opt('url', '');
  const note = opt('note', '');
  if (!channel || !CHANNELS[channel]) {
    console.error('--channel 必填，取值：' + Object.keys(CHANNELS).join(' / '));
    process.exit(1);
  }
  if (!url) { console.error('--url 必填（出处页面或图片地址）'); process.exit(1); }
  if (!['cover', 'portrait', 'other'].includes(kind)) { console.error('--kind 取值：cover / portrait / other'); process.exit(1); }
  const f = (() => {
    try { return add(ROOT, { work, kind, channel, url, note }); }
    catch (e) { failCorrupt(e); process.exit(1); }
  })();
  console.log(`已记录：${work || '(未指定作品)'} · ${kind} · ${CH_LABEL(channel)} → ${url}`);
  console.log('台账文件：' + f);
  console.log('下一步：`npm run sources` 重新导出 _sources.md（交付时 pack 会自动打包它）');
  process.exit(0);
}

let data;
try { data = load(ROOT); }
catch (e) { failCorrupt(e); process.exit(1); }
const entries = data.entries || [];

if (cmd === 'list') {
  if (!entries.length) { console.log('台账还是空的。取图后执行：node sources.js add --work <作品名> --kind cover --channel official --url <出处页面>'); process.exit(0); }
  for (const e of entries) console.log(`  ${e.work || '(未指定作品)'} · ${e.kind} · ${CH_LABEL(e.channel)} · ${e.url}${e.note ? '  # ' + e.note : ''}`);
  console.log(`共 ${entries.length} 条`);
  process.exit(0);
}

if (cmd === 'report') {
  const out = path.join(ROOT, 'anime_build', '_sources.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const owned = entries.filter((e) => e.work);
  const orphan = entries.filter((e) => !e.work);
  const byChannel = entries.reduce((m, e) => (m[e.channel] = (m[e.channel] || 0) + 1, m), {});
  const official = entries.filter((e) => e.channel === 'official').length;
  const booru = entries.filter((e) => e.channel === 'safebooru').length;

  const lines = [];
  lines.push('# 素材来源台账');
  lines.push('');
  // 不写绝对路径：本文件会被 pack 复制进交付包，带用户名/盘符的路径会随交付泄露（pack 另有兜底替换）
  lines.push('生成日期：' + todayLocal() + '　｜　生成时间：' + new Date().toLocaleString('zh-CN'));
  lines.push('');
  lines.push(`共 ${entries.length} 条：官方渠道 ${official} 条，图库 safebooru ${booru} 条。`);
  lines.push('');
  if (owned.length) {
    lines.push('| 作品 | 用途 | 渠道 | 出处 | 备注 | 记录日期 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const e of owned) lines.push(`| ${e.work} | ${e.kind} | ${CH_LABEL(e.channel)} | ${e.url} | ${e.note || ''} | ${e.at || ''} |`);
    lines.push('');
  }
  if (orphan.length) {
    lines.push('## 未归属记录');
    lines.push('');
    lines.push('| 用途 | 渠道 | 出处 | 备注 | 记录日期 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const e of orphan) lines.push(`| ${e.kind} | ${CH_LABEL(e.channel)} | ${e.url} | ${e.note || ''} | ${e.at || ''} |`);
    lines.push('');
  }
  lines.push('> 说明：本台账记录每张图的实际获取渠道与出处，供你在公开分享时核对授权。');
  lines.push('> 标题/事实类信息（集数、声优、放送日期）不受著作权保护，但**海报、立绘、截图受保护**：');
  lines.push('> 个人收藏通常没问题，公开发布（发群、上传平台、售卖）需要权利人授权——出处不等于授权。');
  lines.push('> 渠道优先级见 `references/image-selection.md`；图库（safebooru）来源建议回溯官方原图后再替换。');
  lines.push('');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log('已生成 ' + out + `（${entries.length} 条：官方 ${official}，图库 ${booru}）`);
  console.log('下一步：交付时跑 `npm run pack`（会把这份台账一并打进 _deliver/）；只想看台账内容可用 `npm run sources -- list`');
  if (booru) console.warn('⚠ 有 ' + booru + ' 条来自图库：能回溯到官方原图的，建议替换后再交付（授权链更干净）');
  if (!entries.length) console.warn('⚠ 台账是空的——取图时用 `node sources.js add ...` 记一条，公开分享时才有据可查');
  process.exit(0);
}

console.error('用法：node sources.js add|report|list（见文件头注释）');
process.exit(1);

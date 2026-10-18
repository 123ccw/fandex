// 字体子集化：收集 anime_base.json + anime_research/*.json + 固定文案的全部字符 → woff2 子集
// ★ 首次使用：把 ROOT 改成你的项目根；并从霞鹜文楷 GitHub Releases 下载
//   LXGWWenKai-Regular.ttf / LXGWWenKai-Medium.ttf 放到 ROOT/fonts/
//   许可：SIL OFL 1.1——© LXGW；© The Klee Project Authors（基于 FONTWORKS「Klee One」衍生）
//   本脚本产出子集化 woff2 供成品内嵌；成品封底自动附版权署名（OFL 要求随字体软件分发）
// 依赖：python -m pip install fonttools brotli
// 用法: node collect_fonts.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---- 统一配置（单文件唯一事实源：scripts/_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
const { CFG, ROOT } = require('./_config');
const TTF_R = (CFG.fonts && CFG.fonts.regular) || path.join(ROOT, 'fonts', 'LXGWWenKai-Regular.ttf');
const TTF_M = (CFG.fonts && CFG.fonts.medium) || path.join(ROOT, 'fonts', 'LXGWWenKai-Medium.ttf');
const OUT_R = path.join(ROOT, 'fonts', 'wk-sub-regular.woff2');
const OUT_M = path.join(ROOT, 'fonts', 'wk-sub-medium.woff2');
const CHARS_TXT = path.join(ROOT, 'fonts', 'wk_chars.txt');

let chars = new Set();
function add(s) { if (s) for (const c of String(s)) chars.add(c); }

// 统一 JSON 读取：剥 BOM（PowerShell/记事本常见）并给出中文解析原因
function readJson(file) {
  let txt = fs.readFileSync(file, 'utf8');
  const bom = txt.charCodeAt(0) === 0xFEFF;
  if (bom) txt = txt.slice(1);
  try { return JSON.parse(txt); }
  catch (e) { throw new Error('JSON 解析失败（' + file + (bom ? '，文件带 BOM' : '') + '）：' + e.message); }
}

// 基础数据
const BASE_FILE = path.join(ROOT, 'anime_base.json');
if (!fs.existsSync(BASE_FILE)) {
  console.error('未找到 ' + BASE_FILE + ' ——请先跑 npm run base（模式 A 合成）或检查 config.json 的 root'); process.exit(1);
}
let base;
try { base = readJson(BASE_FILE); }
catch (e) { console.error('无法读取 ' + BASE_FILE + '：' + e.message); process.exit(1); }
for (const [k, v] of Object.entries(base)) {
  add(k); add(v.title); add(v.folder);
  for (const t of v.titles || []) add(t);
  for (const g of v.genres || []) add(g);
  add(v.overview);
  for (const u of v.units || []) { add(u.name); add(u.title); }
  if (v.cover) add(v.cover);
}

// 调研成果（所有文本字段 + 单元剧透）
const rdir = path.join(ROOT, 'anime_research');
if (fs.existsSync(rdir)) {
  for (const f of fs.readdirSync(rdir).filter(f => f.endsWith('.json'))) {
    try {
      const r = readJson(path.join(rdir, f));
      for (const v of Object.values(r)) {
        if (typeof v === 'string') add(v);
        else if (Array.isArray(v)) v.forEach(x => typeof x === 'string' ? add(x) : add(JSON.stringify(x)));
        else if (v && typeof v === 'object') add(JSON.stringify(v));
      }
    } catch (e) { console.error('skip bad json:', f, e.message); }
  }
}

// 固定文案（与 build_anime_html.js 里的界面文案保持一致）
add('番剧收藏简介ANIME COLLECTION集 收藏部 作品个单元首播年份跨度目录部剧情一览原作情报更新动态收藏清单');
add('剧情简介剧透注意制作与声优原作情报补番顺序动画更新主题歌与观看观看平台单元集数首播剧情（含剧透）状态');
add('未核实以游戏内为准以官网为准TV OVA 剧场版特别篇本篇第一季第二季第三季第四季完结篇放送中制作决定上映在即');
add('0123456789·—（）()「」『』【】～.:：,、.!！?？~-～ ');
add('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
add(CFG.title || '');   // 自定义书名的字必须进子集，否则封面/总览/封底出方块字
add(CFG.credits || ''); // 封底"资料来源"行（build 渲染 CFG.credits || DEFAULT_CREDITS），人名用字也必须进子集
add('完');              // 封底收尾字
// 兜底防缺字：把 build 脚本全文（含全部界面文案与注释）并入字符集——UI 文字改版也不怕漏
try { add(fs.readFileSync(path.join(__dirname, 'build_anime_html.js'), 'utf8')); }
catch (e) { console.warn('未能读取 build_anime_html.js（跳过兜底）:', e.message); }

const text = [...chars].join('');
fs.writeFileSync(CHARS_TXT, text, 'utf8');
console.log('unique chars:', chars.size);

const args = (ttf, out) => ['-m', 'fontTools.subset', ttf,
  `--text-file=${CHARS_TXT}`, '--flavor=woff2', `--output-file=${out}`,
  '--layout-features=*', '--no-hinting'];
// 跨平台 python 探测走 scripts/_python.js（ANIME_BOOK_PYTHON / PYTHON / .venv / PATH 统一优先级）
const { findPython, missingMessage } = require('./_python');
const PYF = findPython({ requireFontTools: true, projectRoot: ROOT });
if (!PYF) { console.error(missingMessage(true)); process.exit(1); }
const PY = PYF.cmd;
if (PYF.source !== 'PATH') console.log('python: ' + PY + '（来自 ' + PYF.source + '）');
// 源字体缺失时先给中文提示——否则 fontTools 抛的错看不懂
for (const ttf of [TTF_R, TTF_M]) {
  if (!fs.existsSync(ttf)) {
    console.error('未找到字体 ' + ttf + ' ——请把 LXGWWenKai-Regular.ttf / LXGWWenKai-Medium.ttf 放进 ' + path.join(ROOT, 'fonts'));
    console.error('  （CI / 离线自测可用 config.json 的 fonts.regular / fonts.medium 指向 evals/make_smoke_font.py 生成的测试字体）');
    process.exit(1);
  }
}
// 子集先写 .tmp 再原子替换：中途中断不会留半截 woff2 被后续构建静默内嵌（check 也查不出字体回退）
function subsetTo(ttf, out) {
  const tmp = out + '.tmp';
  try {
    execFileSync(PY, args(ttf, tmp), { stdio: 'inherit' });
    fs.renameSync(tmp, out);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) {}
    throw e;
  }
}
subsetTo(TTF_R, OUT_R);
subsetTo(TTF_M, OUT_M);
console.log('subsets written to fonts/wk-sub-*.woff2');

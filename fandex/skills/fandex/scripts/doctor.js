// 环境自检：一次把"跑不起来"的原因说清（node / python / 字体 / 浏览器 / 网络 / 配置 / 重复安装）
// 用法: node doctor.js [--net]        --net 才做联网探测（默认跳过，离线也能跑）
// 只读检查 + 一次写权限试探；不改任何产物
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { findPython, missingMessage } = require('./_python');

const NET = process.argv.includes('--net');
let bad = 0, warn = 0;
const ok = (m) => console.log('  ✓ ' + m);
const no = (m, how) => { bad++; console.log('  ✗ ' + m + (how ? '\n      → ' + how : '')); };
const meh = (m, how) => { warn++; console.log('  ! ' + m + (how ? '\n      → ' + how : '')); };
const head = (t) => console.log('\n' + t);
const isWin = process.platform === 'win32';

function run(cmd, args, timeout) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeout || 5000 }).trim();
  } catch (e) { return null; }
}

// ---- 配置（单文件唯一事实源：_config.js；支持 ANIME_BOOK_* 环境变量覆盖）----
// doctor 特殊：配置坏了也要继续把其它项查完，所以用 soft 模式（只提示、不退出）
const cfgmod = require('./_config').load({ soft: false });
const CFG = cfgmod.CFG;
const CONFIG_FILE = cfgmod.configPath;
head('配置');
if (cfgmod.configError) {
  // CI / 自测用 ANIME_BOOK_ROOT 覆盖时，缺 config.json 是正常状态，不该算阻塞
  if (process.env.ANIME_BOOK_ROOT) {
    ok('没有 config.json，但已用环境变量 ANIME_BOOK_ROOT 覆盖 root（CI / 自测模式）');
  } else {
    no('读不到 ' + CONFIG_FILE + '（' + (cfgmod.configError.code || cfgmod.configError.message) + '）',
      '复制 config.example.json 为 config.json，并把 root 改成你的项目根');
  }
} else {
  ok('config.json 可解析');
}
if (!cfgmod.configError && process.env.ANIME_BOOK_ROOT) ok('已用环境变量 ANIME_BOOK_ROOT 覆盖 root（CI / 自测模式）');
const ROOT = CFG.root || '';
if (!ROOT) {
  no('config.json 里没有 root', '填上项目根目录的绝对路径');
} else if (!fs.existsSync(ROOT)) {
  no('root 指向的目录不存在：' + ROOT, '改 config.json 的 root');
} else {
  ok('项目根存在：' + ROOT);
  try {
    const probe = path.join(ROOT, '.dsh-doctor-write-test');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    ok('项目根可写');
  } catch (e) {
    no('项目根不可写：' + e.message, '检查目录权限，或别把项目根放在受保护目录（Program Files / 系统盘根）');
  }
  // 输入与产物
  const base = path.join(ROOT, 'anime_base.json');
  const names = path.join(ROOT, 'names.txt');
  if (fs.existsSync(base)) ok('anime_base.json 已生成');
  else if (fs.existsSync(names)) meh('有 names.txt 但还没有 anime_base.json', '跑 `npm run base`（问卷式合成）');
  else meh('项目根既没有 names.txt 也没有 anime_base.json', '模式 A：写 names.txt（一行一部）；模式 B：自备扫描脚本生成 anime_base.json');
  if (fs.existsSync(path.join(ROOT, 'anime_build', cfgmod.BOOK + '.pdf'))) ok('已有成品 PDF（可反复重跑）');
}

// ---- 重复安装 ----
// 同一个 skill 同时出现在两个技能目录（如 ~/.dsh/skills 与 ~/.agents/skills）时会出现两份、
// 互相抢触发，而且可能一直跑到旧版本那份——README 警告过，但没有机制能发现。这里补上。
head('重复安装（同名 skill 出现在多个技能目录）');
{
  const SKILL_ROOT = path.resolve(__dirname, '..');   // 本 skill 的信封目录
  const MY_NAME = path.basename(SKILL_ROOT);
  const home = os.homedir();
  const dirs = [...new Set([
    path.join(home, '.dsh', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.zcode', 'skills'),
    path.join(process.cwd(), '.agents', 'skills'),
    path.join(process.cwd(), '.claude', 'skills'),
  ].map((d) => path.resolve(d)))].filter((d) => fs.existsSync(d));

  const readMeta = (dir) => {
    let txt = '';
    try { txt = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'); } catch (e) { return null; }
    const v = (txt.match(/^\s*version:\s*"?([^"\r\n]+?)"?\s*$/m) || [])[1];
    let hash = '';
    try { hash = crypto.createHash('sha256').update(txt).digest('hex').slice(0, 8); } catch (e) { /* 读不到就没有哈希 */ }
    return { version: v ? v.trim() : '无版本号', hash };
  };

  // 扫出所有技能目录里"带 SKILL.md 的子目录"，按名字归组
  const found = new Map();
  for (const d of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch (err) { isDir = false; } }  // 技能常用软链安装
      if (!isDir || !fs.existsSync(path.join(full, 'SKILL.md'))) continue;
      if (!found.has(e.name)) found.set(e.name, []);
      found.get(e.name).push(full);
    }
  }

  const mine = found.get(MY_NAME) || [];
  if (mine.length > 1) {
    const rows = mine.map((p) => { const m = readMeta(p); return p + (m ? '（v' + m.version + ' · SKILL.md ' + m.hash + '）' : '（读不到 SKILL.md）'); });
    no('本 skill 装了 ' + mine.length + ' 份，会互相抢触发，还可能一直跑到旧版本：\n      · ' + rows.join('\n      · '),
      '只留一份（留版本号/哈希最新的，其余整个目录删掉）；别用"插件安装"和"手动拷目录"各装一遍');
  } else if (mine.length === 1) {
    const m = readMeta(mine[0]);
    ok('本 skill 只装了一份：' + mine[0] + (m ? '（v' + m.version + '）' : ''));
  } else {
    meh('常见技能目录里没找到本 skill（可能正从仓库 / 工作副本直接运行）',
      '正式使用时装到 ' + path.join(home, '.dsh', 'skills') + ' 或 ' + path.join(home, '.agents', 'skills') + '，二选一');
  }

  // 别的 skill：多份共存很常见（多工具镜像安装），真正要报的是"多份之间版本/内容不一致"——
  // 那意味着同一句话在不同工具里会触发到不同版本的 skill。
  const others = [...found.entries()].filter(([name, list]) => name !== MY_NAME && list.length > 1);
  const drifted = [];
  for (const [name, list] of others) {
    const metas = list.map((p) => readMeta(p)).filter(Boolean);
    const distinct = new Set(metas.map((m) => m.version + '/' + m.hash));
    if (distinct.size > 1) drifted.push(name + '×' + list.length + '（' + [...new Set(metas.map((m) => 'v' + m.version))].join(' vs ') + '）');
  }
  if (drifted.length) {
    meh('有 ' + drifted.length + ' 个 skill 装了多份且版本不一致：' + drifted.slice(0, 6).join('、')
      + (drifted.length > 6 ? ' 等 ' + drifted.length + ' 个' : ''),
      '同一句话在不同工具里会触发到不同版本；建议各自只留一份（本项不阻塞）');
  } else if (others.length) {
    ok(others.length + ' 个 skill 也装有多份，但版本一致（多工具镜像安装，无需处理）');
  }
  if (!dirs.length) meh('常见技能目录都不存在', '确认你的 agent 从哪个目录读 skill');
}

// ---- Node ----
head('Node 与脚本依赖');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok('Node ' + process.versions.node);
else no('Node ' + process.versions.node + ' 太旧', '脚本用了 Node >=20 的 API（pdfjs 的 ESM 动态 import 等），请升级');

// ---- 字体 ----
head('字体（霞鹜文楷，自行下载后放进 <项目根>/fonts/）');
if (ROOT && fs.existsSync(ROOT)) {
  const custom = CFG.fonts;
  if (custom && (custom.regular || custom.medium)) {
    // CI / 自测：用 config.json 或 ANIME_BOOK_FONT_* 指向测试字体，不要求霞鹜文楷
    const viaEnv = !!(process.env.ANIME_BOOK_FONT_REGULAR || process.env.ANIME_BOOK_FONT_MEDIUM);
    const cp = [custom.regular, custom.medium].filter(Boolean);
    const gone = cp.filter((f) => !fs.existsSync(f));
    const src = viaEnv ? 'ANIME_BOOK_FONT_* 环境变量' : 'config.json 的 fonts';
    if (!gone.length) meh('使用 ' + src + ' 覆盖（' + cp.length + ' 个自备字体）—— 仅用于 CI / 自测，成品请用霞鹜文楷或其它可商用中文字体');
    else no(src + ' 指向的文件不存在：' + gone.join('、'), '去掉覆盖回到霞鹜文楷，或修正路径');
  } else {
    const need = ['LXGWWenKai-Regular.ttf', 'LXGWWenKai-Medium.ttf'];
    const miss = need.filter((f) => !fs.existsSync(path.join(ROOT, 'fonts', f)));
    if (!miss.length) ok('两个 TTF 都在');
    else no('缺少 ' + miss.join('、'), 'GitHub Releases 下载 LXGW WenKai 的 Regular/Medium TTF 放进 ' + path.join(ROOT, 'fonts'));
  }
  const subs = ['wk-sub-regular.woff2', 'wk-sub-medium.woff2'].filter((f) => fs.existsSync(path.join(ROOT, 'fonts', f)));
  if (subs.length === 2) ok('字体子集已生成（改文案后记得 `npm run pipeline` 重跑）');
  else meh('字体子集还没生成', '跑 `npm run pipeline` 里的第一步（collect_fonts）会自动生成');
}

// ---- Python（字体子集）----
head('Python（字体子集用）');
// 与 collect_fonts / epub 共用 _python.js 的探测顺序（ANIME_BOOK_PYTHON > PYTHON > .venv > 常见目录 > PATH）
const py = findPython({ requireFontTools: true, projectRoot: ROOT });
if (py) {
  ok('找到 ' + (py.display || py.cmd) + '（' + py.version + '，fontTools + brotli 可用' + (py.source !== 'PATH' ? '；来自 ' + py.source : '') + '）');
} else {
  const anyPy = run('python', ['--version']) || run('python3', ['--version']);
  if (anyPy) no('有 Python（' + anyPy + '）但缺 fontTools/brotli', 'pip install fonttools brotli');
  else no('没找到 Python', missingMessage(true).split('\n').slice(1).join('\n      '));
}

// ---- 浏览器（渲染 PDF）----
head('浏览器（渲染 PDF）');
let pwOk = false;
try {
  require.resolve('playwright', { paths: [__dirname] });
  const { chromium } = require('playwright');
  let exe = '';
  try { exe = chromium.executablePath(); } catch (e) { /* 未下载 */ }
  if (exe && fs.existsSync(exe)) { ok('Playwright Chromium 已就绪'); pwOk = true; }
  else meh('Playwright 已安装，但 Chromium 没下载', '在 scripts/ 目录执行 npx playwright install chromium（也可以直接靠系统 Edge 兜底）');
} catch (e) {
  meh('未安装 playwright', '在 scripts/ 目录执行 npm i');
}
// 系统浏览器兜底候选：Windows / macOS / Linux 都要有——
// 此前只有两个 Windows 路径 + 一个 macOS 路径，却在 SKILL.md 声称"macOS/Linux 核心流程可用"，
// Linux 上常见的 chromium/chrome 会被判成"既没有 Chromium 也没有系统浏览器"。
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
];
const EDGE = BROWSER_CANDIDATES.find((f) => fs.existsSync(f));
if (EDGE) ok('系统浏览器可用（playwright 装不上时脚本会自动回退到它）：' + EDGE);
else if (!pwOk) no('既没有 Playwright Chromium 也没有可用的系统浏览器', 'npx playwright install chromium，或装 Edge/Chrome/Chromium');

// ---- 取数工具 ----
head('取数工具');
if (run('curl', ['--version'])) ok('curl 可用');
else no('没有 curl', 'Windows 10+ 自带；缺失时装 curl 并确保在 PATH');
if (run('tvly', ['--version'])) {
  ok('tvly（Tavily CLI）可用');
  if (isWin && !process.env.PYTHONIOENCODING) {
    meh('Windows 上没设 PYTHONIOENCODING，tvly --json 会撞 GBK 编码报 UnicodeEncodeError',
      "用之前先执行 $env:PYTHONIOENCODING='utf-8'（或 chcp 65001）");
  }
} else {
  meh('没找到 tvly（Tavily CLI）', '调研主要靠它：pip install tavily-cli（或官方安装方式）；没它就得自己找别的取数途径');
}

// ---- 联网（可选）----
if (NET) {
  head('联网（--net）');
  for (const [name, url] of [['AniList', 'https://graphql.anilist.co'], ['safebooru', 'https://safebooru.org'], ['zh.wikipedia.org（直连）', 'https://zh.wikipedia.org']]) {
    const r = run('curl', ['-s', '-o', isWin ? 'NUL' : '/dev/null', '-w', '%{http_code}', '--max-time', '6', url]);
    if (r && r !== '000') ok(name + ' 可达（HTTP ' + r + '）');
    else if (name.startsWith('zh.wikipedia')) meh(name + ' 不可达（国内常见）', '维基内容一律经 tvly 服务端抓，不要用 curl 硬顶');
    else no(name + ' 不可达', '检查网络/代理；取数会失败');
  }
} else {
  console.log('\n提示：加 --net 可顺带探测 AniList / safebooru / 维基的连通性');
}

// ---- 结论 ----
head('结论');
if (bad) console.log('  ' + bad + ' 项阻塞、' + warn + ' 项提醒 —— 先把上面标 ✗ 的修掉再跑 pipeline');
else if (warn) console.log('  没有阻塞项，' + warn + ' 项提醒（多数不影响出书）');
else console.log('  环境齐全，可以直接 `npm run pipeline`');
process.exit(bad ? 1 : 0);

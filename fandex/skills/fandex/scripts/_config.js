// 统一配置读取（所有脚本共用，单一事实源）
//
// 优先级：环境变量 > config.json > 内置默认值
//   ANIME_BOOK_ROOT   项目根（CI / 临时自测不用改 config.json）
//   ANIME_BOOK_VROOT  模式 B 视频库根
//   ANIME_BOOK_DOMAIN anime | novel
//   ANIME_BOOK_TITLE  书名
//   ANIME_BOOK_USERDATA 用户数据文件路径（默认 <root>/userdata.json）
//   ANIME_BOOK_CREDITS 封底"资料来源"行
//   ANIME_BOOK_FONT_REGULAR / ANIME_BOOK_FONT_MEDIUM  自备字体路径（CI / 离线自测）
//
// 用法:
//   const { CFG, ROOT, BOOK, configPath } = require('./_config');
//   const { CFG, ROOT } = require('./_config').load({ soft: true });   // 缺配置只警告不退出
'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_ROOT = 'C:\\anime-book';

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { __error: e };
  }
}

function load(opts) {
  const o = opts || {};
  const raw = readConfig();
  const fromFile = raw.__error ? {} : raw;

  const env = process.env;

  // 只在"真的会回退到内置默认根目录"时才警告。
  // 设了 ANIME_BOOK_ROOT（CI / 临时自测的标准做法）就不该刷屏——既没回退，警告还会误导排查方向。
  if (raw.__error && !o.soft && !env.ANIME_BOOK_ROOT) {
    // 静默回退会让人对着陌生的 root 排查半天，这里必须出声
    console.warn('⚠ 读不到 ' + CONFIG_PATH + '（' + (raw.__error.code || raw.__error.message) + '）——请复制 config.example.json 为 config.json 并改 root；本次回退默认值 ' + DEFAULT_ROOT);
  }

  const pick = (key, envKey) => {
    const v = env[envKey];
    return v != null && String(v).trim() !== '' ? String(v) : fromFile[key];
  };

  const CFG = {
    root: pick('root', 'ANIME_BOOK_ROOT') || DEFAULT_ROOT,
    vroot: pick('vroot', 'ANIME_BOOK_VROOT') || '',
    domain: pick('domain', 'ANIME_BOOK_DOMAIN') || 'anime',
    title: pick('title', 'ANIME_BOOK_TITLE') || '',
    credits: pick('credits', 'ANIME_BOOK_CREDITS') || '',
    userdata: pick('userdata', 'ANIME_BOOK_USERDATA') || '',
    // CI / 自测：用自备字体替掉霞鹜文楷（形如 { regular: "<绝对路径>", medium: "<绝对路径>" }）
    fonts: (() => {
      const fr = env.ANIME_BOOK_FONT_REGULAR || (fromFile.fonts && fromFile.fonts.regular);
      const fm = env.ANIME_BOOK_FONT_MEDIUM || (fromFile.fonts && fromFile.fonts.medium);
      return fr || fm ? { regular: fr, medium: fm } : null;
    })(),
  };

  const ROOT = CFG.root;
  const BOOK = CFG.title && String(CFG.title).trim() ? String(CFG.title).trim() : '番剧收藏简介';
  const P = (...a) => path.join(ROOT, ...a);
  // 用户数据层（个人评分/短评/已收状态）：默认 <root>/userdata.json，可用配置或环境变量覆盖
  const USERDATA = CFG.userdata || P('userdata.json');

  return {
    CFG, ROOT, BOOK, P, USERDATA, configPath: CONFIG_PATH,
    configError: raw.__error || null,
    DOMAIN: CFG.domain,
  };
}

module.exports = load();
module.exports.load = load;
module.exports.CONFIG_PATH = CONFIG_PATH;
module.exports.DEFAULT_ROOT = DEFAULT_ROOT;

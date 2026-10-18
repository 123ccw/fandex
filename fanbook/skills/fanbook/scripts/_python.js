// 统一 Python 探测（字体子集 collect_fonts / EPUB 导出 epub / 环境自检 doctor 共用单一实现）
//
// 优先级：ANIME_BOOK_PYTHON > PYTHON > PYTHON3 > 项目根 .venv/venv
//        > Windows `py -3` 启动器 > Windows 常见安装目录 > PATH 的 python3/python
//   - 环境变量可指向解释器绝对路径（CI、DSH 内置 runtime、conda 环境都靠它）
//   - Windows 上 `python.exe` 常是 Microsoft Store 的占位 stub（能解析但跑不了），
//     而 `py -3` 是官方启动器，指向真正的解释器；新版 Python Install Manager 还会把
//     Python 装在 %LOCALAPPDATA%\Python\pythoncore-3.xx-64\，所以两种布局都要兜底探测
//   - 字体子集需要 fontTools+brotli；EPUB 只需要 Python 3
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ENV_KEYS = ['ANIME_BOOK_PYTHON', 'PYTHON', 'PYTHON3'];

function pyArgs(c) {
  return c.args || [];
}

function display(c) {
  return [c.cmd].concat(pyArgs(c)).join(' ');
}

function version(c) {
  try {
    return execFileSync(c.cmd, pyArgs(c).concat('--version'), {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, windowsHide: true,
    }).trim();
  } catch (e) { return ''; }
}

function hasModules(c, requireFontTools) {
  const code = requireFontTools ? 'import fontTools, brotli' : 'import sys';
  try {
    execFileSync(c.cmd, pyArgs(c).concat('-c', code), { stdio: 'ignore', timeout: 20000, windowsHide: true });
    return true;
  } catch (e) { return false; }
}

// PATH 没配全时，兜底找 Windows 常见安装目录：
//   %LOCALAPPDATA%\Programs\Python\Python3xx\python.exe   （python.org 传统安装）
//   %LOCALAPPDATA%\Python\pythoncore-3.xx-64\python.exe   （新版 Python Install Manager）
//   %ProgramFiles%\Python3xx\python.exe / C:\Python3xx\python.exe
const INSTALL_DIR_RE = /^(Python3\d*|pythoncore-[\d.]+(?:-64)?)$/i;
function windowsCandidates() {
  const out = [];
  if (process.platform !== 'win32') return out;
  const roots = [];
  if (process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'));
    roots.push(path.join(process.env.LOCALAPPDATA, 'Python'));
  }
  if (process.env.ProgramFiles) roots.push(process.env.ProgramFiles);
  if (process.env['ProgramFiles(x86)']) roots.push(process.env['ProgramFiles(x86)']);
  roots.push('C:\\');
  for (const root of new Set(roots)) {
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch (e) { continue; }
    for (const d of dirs) {
      if (!INSTALL_DIR_RE.test(d)) continue;
      const exe = path.join(root, d, 'python.exe');
      if (fs.existsSync(exe)) out.push({ cmd: exe, source: 'Windows 常见安装目录' });
    }
  }
  return out;
}

function candidates(opts) {
  const o = opts || {};
  const list = [];
  for (const k of ENV_KEYS) {
    const v = process.env[k];
    if (v && String(v).trim()) list.push({ cmd: String(v).trim(), source: k });
  }
  const projectRoot = o.projectRoot || '';
  if (projectRoot) {
    for (const venv of ['.venv', 'venv']) {
      const exe = process.platform === 'win32'
        ? path.join(projectRoot, venv, 'Scripts', 'python.exe')
        : path.join(projectRoot, venv, 'bin', 'python');
      if (fs.existsSync(exe)) list.push({ cmd: exe, source: venv });
    }
  }
  if (process.platform === 'win32') {
    // 官方 py 启动器：优先 `py -3`（明确要 Python 3），再退回默认 `py`
    list.push({ cmd: 'py', args: ['-3'], source: 'py 启动器' });
    list.push({ cmd: 'py', source: 'py 启动器' });
  }
  for (const c of windowsCandidates()) list.push(c);
  list.push({ cmd: 'python3', source: 'PATH' }, { cmd: 'python', source: 'PATH' });
  return list;
}

// 返回 { cmd, args, source, version, display } 或 null。
// source 用于告诉用户"这个 python 是从哪找到的"；调用方必须把 args 一起拼进命令行
// （例如 py 启动器需要 `py -3 -m fontTools.subset ...`）。
function findPython(opts) {
  const o = opts || {};
  const requireFontTools = !!o.requireFontTools;
  const seen = new Set();
  for (const c of candidates(o)) {
    if (!c.cmd) continue;
    const key = display(c);
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasModules(c, requireFontTools)) {
      return { cmd: c.cmd, args: pyArgs(c), source: c.source, version: version(c), display: display(c) };
    }
  }
  return null;
}

function missingMessage(requireFontTools) {
  const need = requireFontTools ? 'fontTools + brotli' : 'Python 3';
  const lines = [
    '未找到可用的 Python（需要 ' + need + '）。',
  ];
  if (requireFontTools) lines.push('  安装依赖：python -m pip install fonttools brotli');
  lines.push(
    '  已装 Python 但不在 PATH？设置 ANIME_BOOK_PYTHON 指向解释器（也可用 PYTHON / PYTHON3）：',
    '    PowerShell: $env:ANIME_BOOK_PYTHON = "C:\\Python312\\python.exe"',
    '    bash/zsh:   export ANIME_BOOK_PYTHON=/usr/bin/python3',
    '  项目根下的 .venv / venv、Windows 的 py 启动器与常见安装目录会被自动发现。'
  );
  return lines.join('\n');
}

module.exports = { findPython, missingMessage };

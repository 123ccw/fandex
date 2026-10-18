// 统一 Python 探测（字体子集 collect_fonts / EPUB 导出 epub / 环境自检 doctor 共用单一实现）
//
// 优先级：ANIME_BOOK_PYTHON > PYTHON > PYTHON3 > 项目根 .venv/venv > Windows 常见安装目录 > PATH 的 python3/python
//   - 环境变量可指向解释器绝对路径（CI、DSH 内置 runtime、conda 环境、Microsoft Store 的 python.exe 都靠它）
//   - 字体子集需要 fontTools+brotli；EPUB 只需要 Python 3
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ENV_KEYS = ['ANIME_BOOK_PYTHON', 'PYTHON', 'PYTHON3'];

function version(cmd) {
  try {
    return execFileSync(cmd, ['--version'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, windowsHide: true,
    }).trim();
  } catch (e) { return ''; }
}

function hasModules(cmd, requireFontTools) {
  const code = requireFontTools ? 'import fontTools, brotli' : 'import sys';
  try {
    execFileSync(cmd, ['-c', code], { stdio: 'ignore', timeout: 20000, windowsHide: true });
    return true;
  } catch (e) { return false; }
}

// PATH 没配全时，兜底找 Windows 常见安装目录（含 %LOCALAPPDATA%\Programs\Python\Python3xx）
function windowsCandidates() {
  const out = [];
  if (process.platform !== 'win32') return out;
  const roots = [];
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'));
  if (process.env.ProgramFiles) roots.push(process.env.ProgramFiles);
  if (process.env['ProgramFiles(x86)']) roots.push(process.env['ProgramFiles(x86)']);
  roots.push('C:\\');
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch (e) { continue; }
    for (const d of dirs) {
      if (!/^Python3\d*$/i.test(d)) continue;
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
  for (const c of windowsCandidates()) list.push(c);
  list.push({ cmd: 'python3', source: 'PATH' }, { cmd: 'python', source: 'PATH' });
  return list;
}

// 返回 { cmd, source, version } 或 null。source 用于告诉用户"这个 python 是从哪找到的"。
function findPython(opts) {
  const o = opts || {};
  const requireFontTools = !!o.requireFontTools;
  const seen = new Set();
  for (const c of candidates(o)) {
    if (!c.cmd || seen.has(c.cmd)) continue;
    seen.add(c.cmd);
    if (hasModules(c.cmd, requireFontTools)) {
      return { cmd: c.cmd, source: c.source, version: version(c.cmd) };
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
    '  项目根下的 .venv / venv 会被自动发现。'
  );
  return lines.join('\n');
}

module.exports = { findPython, missingMessage };

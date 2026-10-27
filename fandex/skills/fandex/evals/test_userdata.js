// P0 回归测试：用户数据层的 读写 / 原子性 / 损坏保护 / 迁移幂等 / 构建只读
// 用法: node ../evals/test_userdata.js  （或 npm run test:userdata）
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fandex-userdata-'));
const FILE = path.join(TMP, 'userdata.json');
process.env.ANIME_BOOK_ROOT = TMP;
process.env.ANIME_BOOK_USERDATA = FILE;

const ud = require('../scripts/_userdata');
const SCRIPT_DIR = path.join(__dirname, '..', 'scripts');

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; console.error('  FAIL  ' + name + ' -- ' + e.message); }
}
function hash(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

console.log('userdata P0 测试（临时目录 ' + TMP + '）');

t('缺文件是正常状态，不是错误', function () {
  const r = ud.load();
  assert.strictEqual(r.missing, true);
  assert.strictEqual(r.data, null);
  assert.strictEqual(r.error, null);
  assert.strictEqual(ud.reader(null).franchiseState('任何', { name: 'x' }), undefined);
});

t('写入后字段完整、可回读', function () {
  const d = ud.empty();
  d.works['w_test'] = {
    work_id: 'w_test', folder: '示例作品', ids: { mal: 1735 }, collected: true,
    score: { value: 8.5, scale: 10, source: 'mal' },
    comment: '  短评原文  ',
    franchise: [{ name: '剧场版 归港', collected: false }],
  };
  ud.save(d);
  assert.ok(fs.existsSync(FILE));
  const back = ud.load();
  assert.strictEqual(back.data.schema_version, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(back.data.updated_at));
  assert.strictEqual(back.data.works['w_test'].ids.mal, 1735);
  const rd = ud.reader(back.data);
  assert.strictEqual(rd.franchiseState('示例作品', { name: '剧场版 归港' }), false);
  assert.strictEqual(rd.franchiseState('示例作品', { name: '不存在的条目' }), undefined);
  assert.deepStrictEqual(rd.score('示例作品'), { value: 8.5, scale: 10, source: 'mal' });
  assert.strictEqual(rd.score('没有的作品'), null);
  assert.strictEqual(rd.comment('示例作品'), '短评原文');
  assert.strictEqual(rd.comment('没有的作品'), '');
});

t('原子写：不留 .tmp', function () {
  assert.ok(!fs.existsSync(FILE + '.tmp'));
  assert.deepStrictEqual(fs.readdirSync(TMP).filter(function (f) { return f.endsWith('.tmp'); }), []);
});

t('损坏文件：soft 报错、strict 抛出，绝不当空数据', function () {
  fs.writeFileSync(FILE, '{ 这不是 json', 'utf8');
  const soft = ud.load({ soft: true });
  assert.ok(soft.error && soft.data === null);
  assert.throws(function () { ud.load(); });
  fs.rmSync(FILE);
});

t('迁移：研究稿的 collected 进入 userdata', function () {
  const rd = path.join(TMP, 'anime_research');
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, '甲.json'), JSON.stringify({
    folder: '甲',
    franchise: [{ name: 'TV 第一季', collected: true }, { name: '剧场版', collected: false }, { name: '无状态条目' }],
  }), 'utf8');
  fs.writeFileSync(path.join(rd, '坏.json'), '{坏', 'utf8');
  const r = ud.migrate(null, { researchDir: rd });
  assert.strictEqual(r.stats.franchisesAdded, 2);
  assert.strictEqual(r.stats.skipped, 1);
  const work = Object.values(r.data.works)[0];
  assert.strictEqual(work.folder, '甲');
  ud.save(r.data);
  assert.strictEqual(ud.reader(ud.load().data).franchiseState('甲', { name: '剧场版' }), false);
});

t('迁移幂等：再跑一次零新增', function () {
  const rd = path.join(TMP, 'anime_research');
  const r = ud.migrate(ud.load().data, { researchDir: rd });
  assert.strictEqual(r.stats.worksAdded, 0);
  assert.strictEqual(r.stats.franchisesAdded, 0);
});

t('迁移不覆盖已有用户值', function () {
  const rd = path.join(TMP, 'anime_research');
  const data = ud.load().data;
  const work = Object.values(data.works)[0];
  work.franchise.find(function (f) { return f.name === 'TV 第一季'; }).collected = false;
  const r = ud.migrate(data, { researchDir: rd });
  assert.strictEqual(r.stats.franchisesAdded, 0);
  const after = Object.values(r.data.works)[0].franchise.find(function (f) { return f.name === 'TV 第一季'; });
  assert.strictEqual(after.collected, false);
});

t('构建只读：跑一次 build_anime_html.js，userdata 字节不变', function () {
  const before = hash(FILE);
  fs.writeFileSync(path.join(TMP, 'names.txt'), '甲\n', 'utf8');
  const run = spawnSync(process.execPath, ['build_anime_html.js'], { cwd: SCRIPT_DIR, env: process.env, encoding: 'utf8' });
  assert.strictEqual(hash(FILE), before, '构建改写了 userdata.json');
  console.log('        （build 退出码 ' + run.status + '；无论成败都不得改写用户数据）');
});

t('写入入口 setFields：新建条目、只改传入字段、不动别的条目', function () {
  const d = ud.empty();
  d.works['w_keep'] = { work_id: 'w_keep', folder: '保留作', score: { value: 9, scale: 10 }, comment: '别动我' };
  const r = ud.setFields(d, '新作品', { score: { value: 8, scale: 10, source: 'manual' }, comment: '  新短评  ' }, {});
  assert.strictEqual(r.created, true);
  assert.deepStrictEqual(r.changed.slice().sort(), ['comment', 'score']);
  assert.strictEqual(Object.keys(r.data.works).length, 2);
  assert.strictEqual(r.data.works['w_keep'].comment, '别动我');
});

t('写入入口幂等：同样输入第二次无变化', function () {
  const a = ud.setFields(ud.empty(), '甲作', { score: { value: 7, scale: 10 } }, {});
  const b = ud.setFields(a.data, '甲作', { score: { value: 7, scale: 10 } }, {});
  assert.strictEqual(b.created, false);
  assert.deepStrictEqual(b.changed, []);
});

t('写入入口可清除字段', function () {
  const a = ud.setFields(ud.empty(), '乙作', { score: { value: 7, scale: 10 }, comment: 'x' }, {});
  const b = ud.setFields(a.data, '乙作', {}, { clear: ['comment'] });
  assert.deepStrictEqual(b.changed, ['-comment']);
  assert.strictEqual('comment' in b.data.works[b.workId], false);
});

t('CLI：--dry-run 不写文件；真写后 --list 能读出来', function () {
  const before = hash(FILE);
  const dry = spawnSync(process.execPath, ['set_userdata.js', '--folder', '甲', '--score', '7', '--dry-run'], { cwd: SCRIPT_DIR, env: process.env, encoding: 'utf8' });
  assert.strictEqual(dry.status, 0, dry.stderr);
  assert.ok(/dry-run/.test(dry.stdout), dry.stdout);
  assert.strictEqual(hash(FILE), before, 'dry-run 改写了 userdata.json');
  const set = spawnSync(process.execPath, ['set_userdata.js', '--folder', '甲', '--score', '7', '--source', 'manual', '--comment', 'CLI写入的短评'], { cwd: SCRIPT_DIR, env: process.env, encoding: 'utf8' });
  assert.strictEqual(set.status, 0, set.stderr);
  const list = spawnSync(process.execPath, ['set_userdata.js', '--list'], { cwd: SCRIPT_DIR, env: process.env, encoding: 'utf8' });
  assert.ok(list.stdout.indexOf('CLI写入的短评') >= 0, list.stdout);
});

t('CLI：越界评分必须非零退出且不写文件', function () {
  const before = hash(FILE);
  const bad = spawnSync(process.execPath, ['set_userdata.js', '--folder', '甲', '--score', '99'], { cwd: SCRIPT_DIR, env: process.env, encoding: 'utf8' });
  assert.notStrictEqual(bad.status, 0);
  assert.strictEqual(hash(FILE), before);
});

console.log('');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
fs.rmSync(TMP, { recursive: true, force: true });   // TMP 由 mkdtemp 创建，仅本次测试使用
process.exit(fail ? 1 : 0);

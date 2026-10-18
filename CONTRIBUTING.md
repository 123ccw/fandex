# 贡献指南

欢迎 issue 与 PR。这是个个人维护的 agent skill，没有重流程，但有几条约定：

## 提 issue

- **报 bug**：附上「做了什么 → 期望 → 实际」，贴上 `npm run check` 的完整输出（它就是为此设计的）
- **提功能**：先说使用场景再说方案——本 skill 的取舍标准是「垂直深度优先」，与番剧收藏无关的泛化建议大概率不会被采纳

## 提 PR

1. 改脚本后必须：`node --check <脚本>` 全过 + 在一个测试项目根跑通 `npm run pipeline && npm run check`（18 条断言全绿）
2. 涉及 UI 文案变动的：跑一遍 `npm run sheet`，联络表目检无方块字/溢出（字体子集会自动并入 build 脚本文案，但请确认）
3. 版本号只有一个权威源：`SKILL.md` frontmatter 的 `metadata.version`。改它之后跑
   `node scripts/sync_version.js --fix` 同步其余清单，并用 `node scripts/sync_version.js --check` 复核
   （CI 跑的是同一条命令；`sync_version.js` 按 glob 发现清单，新增清单会被自动纳入）。当前实际管理的 6 处：
   `SKILL.md`（权威源）、`scripts/package.json`、`scripts/package-lock.json`、`.claude-plugin/marketplace.json`、
   `fanbook/.claude-plugin/plugin.json`、`fanbook/.zcode-plugin/plugin.json`
4. 顺手跑 `npm run lint`：它校验 frontmatter、SKILL.md 的引用完整性、以及"文档里写的断言条数/坑位数"是否与
   `evals/check.js`、`references/pipeline.md` 实际一致——这三类是最容易跟着改动漂移的地方
5. 提交信息用 Conventional Commits 风格（`feat:` / `fix:` / `docs:` / `chore:`）
6. 不要提交 `node_modules/`、测试项目产物（`anime_build/`）与个人信息（片单、路径里的用户名等）

## 发布

维护者发版流程：CHANGELOG 加条目 → `node scripts/sync_version.js --fix` → commit（`feat:`/`fix:`）→ 打 `vX.Y.Z` tag → GitHub Release。

## CI 跑什么

| job | 内容 |
| --- | --- |
| `syntax` | 全部脚本 `node --check` · 清单 JSON 合法 · 版本号一致 · `npm run lint` |
| `fixture` | **真流程**：程序生成测试字体 → `evals/fixture/` 跑满两轮 `pipeline` → `check` → 负向测试（封面缺失报 `[C7]`、页码漂移报 `[C12]`、交付说明如实标注未核验，另加书名撞作品名时页码不得取前置页、注入重复书签必须报 `[C17]`、`--force` 不得删用户目录里的非本工具文件、交付包不得含本机绝对路径、伪造收据不得被标成 ✅） |

第二条是防回归的主力：1.4.4 修掉的那批真 bug（未定义变量、断言恒真、pagemap 掐断 `&&` 链）`node --check` 一条都抓不到。
本地复现这条流水线：见 `evals/README.md` 的「从零复现」（用 `ANIME_BOOK_*` 环境变量，不必改 `config.json`）。

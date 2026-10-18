# Changelog

## 1.10.0

**输出更完整、跨平台更稳。** 这一版把 10-17 那次本机试验里验证过的「数说页补充统计 / 封面墙扩容 / 版式微调」正式并入主干，并补上 Windows 与自定义 Python 两条环境短板；同时把一直挂在分支上的 1.7.2 合规工作一并收编。

### 数说页与封面
- 数说页底部新增一排 **4 列紧凑小卡**：单元构成、时长估算、平均评分、类型 TOP3（数据为空自动省略；单独用 `.alm-mini` 小字号，不把数说页撑到第二页）
- 时长估算按单元类型加权：**TV 24 / OVA・特别篇 30 / 剧场版 110 分钟**；不再用「总集数 × 24」把剧场版当 1 集算
- 封面墙 9 → **15 张**；超过 9 张自动切 5 列（3×5）；封面页改为**标题沉底、海报垂直居中**，15 部规模下版式更稳
- 表格行距与长表格字号收紧（`td` padding 1.5 → 1.15mm、`td.sop` 8.8 → 8.4pt），减少跨页
- 修复**角色名本身含中点**时演员解析拆错（如「泽村·斯潘塞·英梨梨」）：先按「角色（CV）」拆，再退回中点拆分
- 类型排行/年代分布的长标签加省略号，避免撑破统计卡

### 跨平台 Python
- 新增 `scripts/_python.js` 统一探测：`ANIME_BOOK_PYTHON` > `PYTHON` > `PYTHON3` > 项目根 `.venv/venv` > Windows 常见安装目录 > PATH；`collect_fonts` / `epub` / `doctor` 共用同一实现
- 装了 Python 但没进 PATH（DSH 内置 runtime、conda、Microsoft Store 版都常见）不再只报「没找到 Python」，按提示设 `ANIME_BOOK_PYTHON` 即可
- `doctor`：CI / 自测用 `ANIME_BOOK_ROOT` 覆盖时，缺 `config.json` 不再算阻塞；Python 一栏显示解释器路径、版本与来源

### 验收与 CI
- 新增 **`[C18]`** 断言：数说页必须含补充统计块（按数据条件检查）；断言 17 → **18 条**
- CI 新增 **windows-latest 真流程 job**：两轮 pipeline + check + audit——Windows 是脚本的第一目标平台，此前 CI 只有 ubuntu
- CI ④ 步骤新增 [C18] 负向测试：删掉数说页统计块后 check 必须失败并报 [C18]（防新断言恒真）
- `sync_version.js` 现在同时校验/同步 `package-lock.json` 的 `packages[""].version`（此前只改顶层，lock 里残留 1.5.0 会在 `npm install` 时把版本带回去）

### 合规（并入原 1.7.2 分支）
- **`npm run cards` 现在会打合规提醒**：导出成功后打印「`_cards/` 与 `_gallery/` 内嵌作品海报/立绘（第三方素材）……公开发布前须自行确认授权」。此前这条路径完全静默——导出成功就完事。
- **`pack` 交付说明的「使用与版权」节**：当交付包含分享卡或整页高清图时，追加一行说明它们与全书同属"仅个人收藏"，发到公开平台前须自行确认授权。
- **新增仓库根 `DISCLAIMER.md`**：工具是 MIT，但产物里的素材权利属于原作者；个人自用 / 公开发布 / 商业使用的边界、字体署名、内容边界、责任范围，一页说清。README 顶部与 `references/compliance.md` 均已指路。
- **README 顶部加一行**：「公开发布 = 必须自行取得授权」——原话只活在 compliance.md 与交付说明里，clone 的人第一眼看不到。
- **保持不变**：默认仍产出含官方海报的收藏册。海报墙是产品核心，个人自用受个人使用例外保护；栅栏立在"公开发布"这一侧，而不是阉割默认输出。
- 本机验证：`npm run cards` 退出码 0 且打出提醒；`pack` 交付说明含新增的卡片授权行。

### 文档
- 同步全部「断言条数 / 错误码」表述（17 → 18），`evals/README.md` 错误码表补 `[C18]`
- README 数说页文案与效果图更新；`SKILL.md` 描述补充数说页统计项

### 验证
- anime / novel fixture：两轮 pipeline 收敛，`check` **18/18**，`audit` 行为符合预期
- `test:userdata` 13/13；`lint` 0 错 0 提醒；`sync_version --check` 6 处一致
- 真机（Windows + DSH 内置 Python，不在 PATH）用 `ANIME_BOOK_PYTHON` 跑通完整 pipeline

## 1.9.0

**个人数据有了受支持的写入入口。** 1.8.0 把 userdata 层建了起来，但"我的评分 / 短评"只能手改 JSON —— 手改最容易写坏，而 userdata 一旦坏掉构建会直接非零退出。这一版补上写入通道，并把它写进 SKILL.md 的流程。

- 新增 `scripts/set_userdata.js`（`npm run userdata:set` / `npm run userdata:list`）：按 `folder` 定位条目（**查不到就新建**），只改动传入的字段，其余原样，别的作品完全不受影响。支持 `--score` / `--scale` / `--source` / `--comment` / `--status` / `--first-watched` / `--finished-at` / `--collected` / `--rewatch` / `--tags` / `--clear` / `--dry-run` / `--list`
- `_userdata.js` 新增纯函数 `setFields()`：幂等、可清字段、从不触碰其他条目；落盘仍走 `save()` 的原子替换（tmp + rename）
- 校验前置：评分超出 `--scale` **直接拒绝**（不静默截断）；日期必须 `YYYY-MM-DD` 或 `null`；损坏的 userdata 拒绝写入，并给出"改名后从研究稿重建"的恢复步骤
- 手工写入会记 `provenance.source = "manual"`，与将来的导入器（`mal-xml` 等）区分开
- `evals/test_userdata.js` 8 → **13 条**：新增写入入口的新建 / 幂等 / 清除、CLI `--dry-run` 不落盘、越界评分被拒
- 文档：`SKILL.md` 新增「我的评分与短评（可选，与调研无关）」；`references/userdata.md` 新增「怎么写入」；`references/build.md` 命令表补两条
- 本机验证：`test:userdata` 13/13；真实项目 `npm run userdata` 迁移 1 部作品 / 4 条系列条目、`--list` 可读、`--dry-run` 不改文件、`--score 99` 被拒；`npm run lint` 0 错 0 提醒；`sync_version --check` 6 处一致
## 1.8.0

**个人数据层（P0）**：给收藏册加一层"只有用户本人有"的数据——我的评分、短评、首看日、已收状态。起因是一条已经存在的丢数据路径：`franchise[].collected` 一直存在 `anime_research/<作品>.json` 里，而那是调研产物，重跑一次调研就会把用户标的"已收"覆盖掉。

- 新增 `userdata.json`（`<项目根>/userdata.json`，schema v1）：`work_id` 本地稳定主键 + `ids` 站点 ID 映射 + `score{value,scale,source}` / `comment` / `first_watched` / `franchise[].collected`
- 新增 `scripts/_userdata.js`：读写单一实现。原子写（tmp+rename）、`reader` 只读接口、**缺失=正常**（回退研究稿）、**损坏=告警并非零退出且绝不覆盖**
- 新增 `scripts/migrate_userdata.js`（`npm run userdata`）：把研究稿里的"已收"迁进 userdata，只补缺失、绝不覆盖已有用户值，无新增就不写文件（幂等）
- 构建侧接通：`build_anime_html.js` 只读 userdata —— 系列条目的已收状态优先取它（查不到回退研究稿，老项目零改动）；章节头渲染**我的评分**、章末渲染**我的短评**卡（anime / novel 双域标签同步）
- 新增 `evals/test_userdata.js`（`npm run test:userdata`）：8 条回归测试，含"跑一次 build 后 userdata 字节不变"（构建失败也必须不变）
- 新增 `references/userdata.md`：schema、硬规则、迁移、验收、MAL XML 字段映射（导入器留作下一步）
- 本机验证：`test:userdata` 8/8；anime fixture 两轮 `pipeline` + `check` 17/17；userdata 覆盖可逆（研究稿 2/3 → 用户改已收 3/3 → 改回 2/3）；全量 pipeline 后 `userdata.json` 的 hash 不变；写坏 userdata 时 build 非零退出且文件未被覆盖

### EPUB 3 导出（可选输出形态）

- 新增 `scripts/export_epub.py` 与包装 `scripts/epub.js`（`npm run epub`）：从 `anime_base.json` + `anime_research/*.json`（有 `userdata.json` 就一并读）直接渲染**可重排**的 EPUB 3 —— 封面页 / 书名总览 / 每部一章（无剧透简介 · 制作与声优 · 主题歌与观看 · 补番顺序 · 原作情报 · 更新动态 · 补记 · 收藏详情 · 剧透表 · 系列条目）/ 版权页，带 nav 目录；字体沿用 PDF 那套来源（环境变量 > `config.json` 的 `fonts.regular` > 项目根 `fonts/`）子集化后内嵌，`-- --no-font` 可关闭
- `pack` 登记 EPUB：产物存在时进 `_deliver/`，并在交付说明的文件表与使用说明里标注；不存在**不报错**（EPUB 是可选输出）
- 本机验证：EPUB 通过 zip 完整性 / `mimetype` 首条目且 STORED / 全部 XHTML·OPF 格式良好 / manifest·spine·相对引用零悬空；fixture 全流程 `base → pipeline（17/17）→ check → audit → epub → pack` 跑通，`_deliver/` 含 `.epub` 且交付说明列出该行


## 1.7.1

修掉一个「文档与验收器打架」的缺陷，并给第二领域包补上回归保护。

- **novel 模式下 `npm run check` 不再必然失败。** `references/domain-novel.md` 写明角色 `cover`「无也可，自动降级为纯排印」，但 `evals/check.js` 把「未声明 cover」无条件计入 `[C7]` 失败项——按文档合法使用的人必然拿到"验收红 + 交付说明标未核验"。现在 `check.js` 按 `_config.js` 的 `DOMAIN` 分流：novel 未声明 → 降级 + `⚠` 提示（不判失败）；**两种领域下「声明了 cover 却找不到文件」仍是硬失败**，`[C7]` 没有被放空。
- **CI 补 novel job**（两轮 pipeline → check → audit）。此前 7 条负向测试全在 anime 域，novel 从未进过 CI——这正是上面那条冲突能活到现在的原因。
- **新增负向测试 ⑧**：novel 下给角色声明一个不存在的 cover，`check` 必须失败并报 `[C7]`，防止"放宽"在后续改动里被扩大成放空。
- **新增信封卫生守卫**（syntax job）：`git ls-files` 里出现 `node_modules/` 或 `config.json` 直接失败——这两样一旦误入库，信封会带上 90MB 依赖或使用者的本机路径。
- 本机验证：anime fixture 17/17；novel fixture 16/17 → **17/17**；负向①（anime 移走封面文件）仍失败并报 `[C7]`；负向⑧ 16/17 且失败项只有 `[C7]`。

## 1.7.0

**改名 + 双领域定位**：`anime-collection-book` → **`fanbook`**。

引擎早就同时覆盖两个领域（番剧收藏册 / 小说设定集），旧名以偏概全。趁仓库还只有 1 star、0 fork 一次改干净，避免以后有用户再动。

- 仓库 / 插件 / skill 名统一为 `fanbook`，skill 目录 `skills/fanbook/`（`lint_skill.js` 校验 name 与目录名一致，已同步）
- 插件显示名 `Fanbook`（zh-CN「番剧收藏册 / 设定集」）
- 安装命令变为 `/plugin marketplace add 123ccw/fanbook` + `/plugin install fanbook@fanbook`（旧仓库 URL 由 GitHub 自动重定向，旧链接不断）
- 生成物页脚、`pack` 清单的 `tool` 字段、`fetch_candidates` 的 UA、`scripts` 包名一并更名；共 68 处引用、14 个文件
- **无行为变更**：脚本逻辑、17 条断言、两个领域包与字段映射全部未动
- 本版同时并入 SKILL.md 的两轮优化（检查点门控 / 失败分支 / 去重，见 PR #3）

## 1.6.0

这一版**没有新功能**。起因是一次"把本 skill 的引擎拿去写非番剧文档"的实测：为了做一份《三家网盘实用介绍》，我得靠人手抄 `contact_sheet.js` 的思路才能做出目检；顺着这条线做了三轮审计（构建链 / 交付链 / 文档一致性），每条都**先复现、后修复、再回归**。

结果：20 处修复 + 断言 13 → 17。最该先说的是 **`--force` 会递归删除用户目录**——全套代码里唯一会造成不可恢复数据丢失的缺陷，而工具自己的错误提示还在引导用户去用它。

### 数据安全与成品正确性

- **`pack --force` 不再是递归删除**。旧行为：`pack --out D:\我的图集 --force` 会把该目录整体改名后 `rmSync` 掉，里面与本书无关的私人文件一并永久消失（P2 的提示语还写着"确认可以**覆盖**后加 `--force`"）。现在覆盖前读本工具的 `.pack-manifest.json`，只清理清单登记过的文件；出现任何非本工具文件就报 `[P9]` 拒绝并列出它们，`--force` 也无法越过这条线。
- **书名与某部作品名相同时，目录页码不再印成总览页页码**。总览页标题原本也是 `h1`，会生成与章节同名的 PDF 书签，而页码反查取最小页 → 单部册（书名通常就是那部番的名字）几乎必然踩中：实测目录印 `002`、该章实际在第 4 页，而**16 条断言全绿**（错得自洽）。修法两手：总览页标题改为 `div.thd-title`（不再生成书签，视觉不变）+ 新增 `[C17]` 检测"当键用的标题出现重复书签"。小节重名（如每部都有的「补记」）不会误报。
- **`toMs` 不再把普通数字当毫秒**。`airdate` 写成 `"2022"`、`20221008` 这类（LLM 产出很常见）此前静默变成 `1970-01-01`，污染首播日期、收录跨度、年代分布三处；现在 `⚠ 时间值不可信…已置空`，10 位秒级时间戳自动 ×1000。
- **数组字段"形状不对"不再静默降级**。`unit_synopses` 写成对象 → 「剧情（含剧透）」整列连表头消失；`genres` 写成字符串 → 数说页印出「最高频类型「奇」」；`rating` 写成数字 → 评分行整行消失；`units` 里 `eps: 0` 的剧场版 → 被剔除出收藏详情表。四种都零告警。现在统一 `arrStrict`：给了值但不是数组就 `⚠` 并让本次构建 exit 1；`eps` 缺省保留显示 `—`；数字型 `rating` 直接渲染。
- **空作品集 / 缺调研稿不再是"成功"**。`anime_base.json` 为 `{}` 时此前打印 `built 0 chapters` 且 exit 0，管线继续渲染出一本只有封面/总览/封底的 PDF。现在 `⚠` + 非零退出，且**不覆盖**已有的好数据（`names.txt` 去重后为空同样拒绝写 `{}`）。

### 隐私与合规

- **交付包不再泄漏本机绝对路径**。《素材来源台账.md》第一行原本是 ``项目根：`C:\Users\<用户名>\...` ``，而 `pack` 又在提醒"别把含路径的文件带出去"——现在台账不写绝对路径，`pack` 复制时再做一层兜底清理。
- **`npm run sources` 默认导出**。此前默认子命令是 `list`（只打印），而 5 处文档都说它会产出 `anime_build/_sources.md`；`pack` 又靠该文件是否存在决定要不要打包 → 形成死循环："终端说先跑 `npm run sources`，跑了永远没文件"，交付包永远缺合规自证材料。
- **台账损坏不再清空历史**。`_sources.json` 被截断后 `add` 会静默用空台账覆盖（几十条来源记录无声消失）。现在拒绝写入、备份为 `.bak`、报 `[L1]`。
- **封底 `credits` 的字符纳入字体子集**（此前只收书名，人名用字会掉回退字体或方块）。

### 交付完整性

- **交付包带上 `covers/`**。HTML 用相对路径引用封面图，而它们从未被复制进 `_deliver/`——"可自行微调重渲"的 HTML 打开是一本没有封面的册子。
- **核验状态表绑定产物身份**。收据里本来就有 `root`/`book`/PDF 的 sha256，但 `pack` 只比 mtime：伪造 `root`、`book`、假哈希的 `_check.json` 照样显示 `✅ 全部通过（N 条）`。现在三者任一不符即标 `❌ 收据不属于本产物`；audit 收据也加了过期判定。
- **`export_cards` 写入前清空输出目录**。12 部改 8 部后重跑，旧的 `card-09..12` 会混进交付包（旧版本内容被当成新的一起发出去）；缺 `share_cards.html` 时报 `[E1]` 并非零退出（此前 `cards: 0` 也 exit 0）。
- **`pack` 失败不再留下锁死下次的临时目录**（异步主体补 `.catch` 并清理自己的 TMP；`[P3]` 的提示不再引导用户用 `--force`）；终端输出依据实际复制结果，文件表路径统一正斜杠。
- **`fetch_candidates`**：curl 加 `-f`（错误页不再被当图片存）；统计下载失败数并告警；省略 `--as` 时不再让不同角色的台账记录互相顶掉。

### 让"建议性"真的不阻断

- **`audit` 默认不再非零退出**。它自称"建议性、不阻断交付"，却在有硬问题时返回 1——agent 用 `&&` 串步骤会被它掐断，后面的目检签署与 `pack` 根本不执行（CI 里也一直靠 `|| true` 绕过）。要按硬问题 gate 就加 `--strict`。
- **简介字数不再有两套规则**。文档写"规范 300-500 字"，代码却只查 `<120` / `>800`——中间区间怎么都不报。现在 300-500 进"建议补"（软），120/800 仍是硬线。
- **`pack --strict`**：有未核验项时非零退出（`[P11]`），默认行为不变。

### 可读性（把内部标识符换成下一步动作）

- `[C15]/[C16]` 在"还没渲染"时不再抛 `pdf-missing`，而是"还没渲染出 PDF —— 先跑 `npm run pipeline`"。
- 缺 `wk-sub-medium.woff2` 由原始 ENOENT 栈 → 中文提示 + exit 1；带 **BOM** 的 `anime_base.json`/research/`_pagemap.json` 现在能正常读（此前直接 `Unexpected token`）。
- `_config.js` 在设了 `ANIME_BOOK_ROOT`（CI/自测的标准做法）时不再刷屏"回退默认值"。
- `doctor` 的系统浏览器兜底补上 macOS/Linux 的 Chrome/Chromium 路径，`render_pw` 的兜底链相应扩展（此前只有一个 macOS + 两个 Windows 路径，却在 SKILL.md 声称 Linux 可用）。

### 验收与 CI

- 断言 **13 → 17**：`[C14]` PDF 体积上限、`[C15]` 正文含每部作品名（防字体子集吞字）、`[C16]` 书签含每部作品名、`[C17]` 书签标题无重复。`[C10]` 补了 `n > 0` 前置（空作品集时不再 `0 === 0` 假绿）。
- 新增 `evals/pdfprobe.js`（`npm run probe`）：用 pdfjs 提正文 + 读书签，写 `_pdfprobe.json` 收据；`check.js` 保持"纯 fs 零依赖"，读收据判定 PDF 层断言。新增 `scripts/_titles.js` 作为标题解析的单一事实源。
- CI 新增五条**负向测试**：④ 书名撞作品名时页码不得取前置页、④b 注入重复书签必须报 `[C17]`（防新断言恒真）、⑤ `--force` 不得删用户目录里的非本工具文件、⑥ 交付包不得含本机绝对路径、⑦ 伪造收据不得被标成 ✅。
- `doctor` 新增**重复安装检测**（扫 `~/.dsh/skills`、`~/.agents/skills`、`~/.claude/skills`、`~/.zcode/skills` 与项目内技能目录，比对同名 skill 的版本与哈希）——本机实测当场命中 `.dsh` 1.5.0 与 `.agents` 1.3.0 并存。
- `contact_sheet` 支持**任意 PDF**：`node contact_sheet.js --pdf <路径> [--out <目录>] [--scale <n>]`，目检不再只对本 skill 的成品可用。

### 已知遗留（本轮没做）

- **页码反查仍以 PDF 书签为唯一输入**。本轮只修了"总览页不再生成同名书签"并加了 `[C17]` 检测；彻底解耦（HTML 不可见锚点 + 文本层反查，让合并/分册/换渲染器都不再影响页码）见 `docs/pagemap-decoupling.md`。
- `_audit.json` 的问题项仍是完整字符串，没有像 `_check.json` 那样的结构化 `code` 字段。

## 1.5.0

1.4.9 借鉴的正是这三家的**表层做法**（失败模式叙事的 README、原子交付 + 稳定错误码、按需读的 reference 分级）。这一批继续往下挖，改的是**机制**——特别是"机器验不了的事，凭什么让人相信做过"。

### 验收诚实性（借 archify 的 truthful output contract）

archify 的收据把 `validate` / `browser-check` / `captures` / **perceptual review** 分开报，并在 SKILL.md 里写死"不得声称未执行的视觉检查"。本仓库此前恰恰缺这一层：`check` 只 `console.log` 不留凭证，`SKILL.md` 的"全页目检是硬要求"完全靠 agent 自觉。

- `check` / `audit` 每次运行写结构化收据：`anime_build/_check.json`（13 条断言逐条结果 + 产物 sha256）、`_audit.json`（每部状态汇总）
- `audit` 另写 **`anime_build/receipts/<作品名>.json`**（状态 `complete`/`soft`/`hard`/`missing`/`broken` + 调研稿哈希）——多部调研中断后这就是"哪几部做完了"的可续跑清单
- `pack` 读收据，在交付说明里生成**核验状态表**：机器验过的两行给凭据，目检两行写「已声明 / 未声明」；收据缺失或成品比收据新（改完重渲没重跑验收）时标 `⚠ 无收据 / 过期`，并在终端打印"有未经核验的环节"
- 新增 `pack --pages-reviewed` / `--covers-reviewed` **签署参数**：目检做了就签、没做就留在纸上。新增错误码 `[V1]`/`[V2]`（不阻断交付，挡的是"交付了"被读成"全书已核验"）

### CI 从"只查语法"变成"跑真流程"

1.4.4 修掉的那批真 bug（`COVERS` 未定义、封面断言恒真、pagemap 掐断 `&&` 链）`node --check` 一条都抓不到——CI 此前**没有任何机制能防这批回归**。

- 新增 `evals/make_smoke_font.py`：用 fontTools 现场生成两枚极小测试 TTF，让管线在**没有 20 MB 正版字体**的机器上也能跑完（子集化 → 构建 → 渲染 → 页码反查一步不少）
- `collect_fonts.js` 支持 `config.json` 的 `fonts` 覆盖缺省字体路径；`render_pw.js` 支持 `--no-sandbox` 与第三次启动兜底
- CI 新增 `fixture` job：生成测试字体 → `evals/fixture/` 跑满两轮 `pipeline` → `check` → **三条负向测试**（封面缺失必须报 `[C7]`、页码漂移必须报 `[C12]`、交付说明必须如实标注未核验）

### 配置与版本号的单一事实源

- 新增 **`scripts/_config.js`**：所有脚本（含 `evals/check.js`、`audit.js`）共用一份配置读取，并支持 `ANIME_BOOK_ROOT` / `ANIME_BOOK_FONT_*` / `ANIME_BOOK_DOMAIN` / `ANIME_BOOK_TITLE` 等环境变量覆盖——CI 与临时自测不必再改坏本机 `config.json`
- 新增 **`scripts/sync_version.js`**（`npm run version:check` / `version:fix`）：版本号按 glob **发现**清单，不再手写路径映射（1.4.3 的漂移与 ci.yml 里那张硬编码表，都是同一个失败模式）
- 新增 **`evals/lint_skill.js`**（`npm run lint`）：校验 frontmatter（name 与目录名、description 触发语）、SKILL.md 的引用完整性、以及**文档里写的断言条数/坑位数是否与 `check.js`、`pipeline.md` 实际一致**。此前 CHANGELOG 声称跑过 `skills-ref validate`，但仓库里没有这个步骤（不可复现），现在有了零依赖的等价物

### 调研契约（补上并发调研的空白）

- 新增 **`references/research-contract.md`**：一部一代理、只准写自己那两个文件、给子代理的 prompt 必须含的六件事、回报格式、"汇报挂了但稿子写完了"的处理、连续失败两次就停、以及"成本主要在查证不在渲染"的规模建议
- `fields.md` 补上 `receipts/` 的用法（续跑靠它）

### 合规与文档

- skill 信封内新增 **`LICENSE.txt`** 与 **`THIRD_PARTY_NOTICES.md`**（借 anthropics/skills 的形态：只拷技能目录也不会丢许可）；系统说明三类义务——随包依赖、**可替换的字体**（换字体要同步改 `credits`）、成品里的第三方素材
- 文档一致性修复：
  - `references/pipeline.md` 原写"中文查询必须走 stdin（直传参变乱码）"，**与 SKILL.md 冲突且与实测不符**（复测：`tvly search "葬送的芙莉莲 动画" --json` 回显的 `"query"` 逐字一致）——真正的坑是**输出编码**（GBK 控制台），已改写
  - AniList「只用罗马字/英文名搜、拿到结果先核对 `title`」这条**第一道闸门**此前只在 pipeline.md §一，现补进 SKILL.md 坑位清单与 pipeline.md §五
  - 坑位清单从 13 条补到 **14 条**，并给 §五 加标题标注条数，避免"侧栏 8 条 / 正文 13 条 / 实际 N 条"式的漂移
  - 铁律第 5 条由「不编造：查不到就写未核实」改为可检查的**「每个字段要么带来源，要么写未核实」**（"不编造"对现代模型接近 no-op，测不出行为差异）
- **修正一个潜在 bug**：`config.json` 的 `title` 此前只有 `build`/`pack` 当成输出文件名，而 `check`/`doctor`/`render_pw`/`contact_sheet`/`anime_pagemap`/`export_cards` 硬编码 `番剧收藏简介`——设了 `title` 的册子会在验收环节找错文件。现在全书统一以 `title` 为输出名，文档同步说明
- README：新增「核验状态」一节、脚本表与文档分级表补新文件、许可一节指向 THIRD_PARTY_NOTICES；CONTRIBUTING：版本号流程改为 `sync_version.js`，并说明 CI 两个 job 各管什么

> 借的三家：archify（诚实收据 / 视觉审查声明）· mattpocock/Skills（`sync-plugin-version.mjs` 式版本单一事实源、writing-for-agents 的 no-op 与否定式检查）· anthropics/skills（skill 信封自带 LICENSE + 第三方声明、每条 footgun 都在正文里）。

## 1.4.9

按高星 skill（[anthropics/skills](https://github.com/anthropics/skills)、[mattpocock/Skills](https://github.com/mattpocock/Skills)、[tt-a1i/archify](https://github.com/tt-a1i/archify)）的共性做法做的五处改进：

- **README 新增「为什么做它（四个踩过的坑）」**：把功能清单换成失败模式——① 目录页码手工排一定会错 → 两轮渲染 + 页码反查 + 收敛断言；② 中文字体直嵌会缺字/体积失控 → 字体子集内嵌 + OFL 署名；③ 海报极易张冠李戴 → 官方渠道优先 + 逐张目检 + 来源台账；④ 版权与隐私翻车都在看不见的地方 → 封底默认声明 + 外发清理清单。**"没有它会怎样"比功能列表有说服力**
- **README 安装矩阵补 DSH 一行**：`~/.dsh/skills/` **或** `~/.agents/skills/`（DSH 两个都读），并写明警告——同一个 skill 两处都放会重复加载、互相抢触发（实测结论）
- **README 新增「适用范围与边界」**：显式的"故意不做"清单（tracker / 媒体库刮削 / 格式转换 / 正文写作 / 替用户判断授权 / 在线托管），并给出规模提示（5-20 部体验最好）
- **`pack.js` 改为原子交付**：先全部写进 `_deliver.tmp/` → 交付前校验（PDF 存在且体积一致、交付说明与打包标记可解析）→ 通过才 `rename` 替换 `_deliver/`，失败**保留上一版**并回滚；同时引入稳定失败码 `[P1]`–`[P8]`。此前是直接往 `_deliver/` 写，中途失败会留下半成品
- **`check` / `audit` 输出稳定错误码**：`[C1]`–`[C13]`（产物断言）与 `[A1]`–`[A10]`（数据完备度），并在 `evals/README.md` 附**错误码表**（含每个码的修法）。编号只增不改，便于在 issue 与对话里直接指认
- 新增 **`template/SKILL.md`**：可复制的最小 skill 骨架（仿官方 template），附四条写 skill 的经验（入口 ≤10 KB、description 是触发词、同一份内容只放一处、把"每次都会错"的环节变成断言）
- 修复：`evals/README.md` 的断言条数漏改为 13（1.4.6 那批只改了描述行）

> 借鉴清单与出处见 README；未采纳的部分：badges / 多语言 README / skills.sh 分发属于推广面，与实现无关。

## 1.4.8

- 结构（重要）：**`SKILL.md` 从 20.4 KB / 194 行瘦到 9.7 KB / 112 行**（−53%）。入口只留**执行流程 + 质检铁律 + 最硬的坑位 + 路由表**，细节拆成按需读的 reference —— 此前每次触发都要把 20 KB 全量吃进上下文（约 6-7k token），而多数场景用不到字段表和构建细节。这正是本仓库另一个 skill（`my-pc`：1.8 KB 入口 + 4 份 reference）已经在用的形态
- 新增 `references/fields.md`（调研 JSON 字段表与逐字段说明）· `references/build.md`（config 字段、全部命令、验收与交付规矩）· `references/compliance.md`（版权与隐私、来源台账用法、外发清理清单）
- 主文件新增「**先读哪份文档**」路由表：按当前要做的事指到对应 reference，减少无效读取
- 新增 `npm run pack`（`scripts/pack.js`）—— **一键交付**：把成品 PDF、HTML 源、分享卡、高清整页图、来源台账，连同一份**自动生成的交付说明**（作品数/页数/文件清单/收录作品/台账摘要/版权提醒）归拢到 `<项目根>/_deliver/`。此前这套动作散在 SKILL.md 第⑤步里靠人工搬
  - 安全策略：只清理"上一次 pack 留下的目录"（靠 `.pack-manifest.json` 识别），别的目录一律拒绝覆盖，除非显式 `--force`
  - `--no-gallery` 可不带体积较大的高清整页图；结束时会提醒"别把 `config.json`/`names.txt`/`anime_research/` 一起带出去"
- README 增加「文档分级」一节，说明每份 reference 什么时候读；脚本表补 `pack.js`

## 1.4.7

- 新增 `npm run doctor` —— **环境自检**：node 版本 / config 与项目根可写 / 两个 TTF / 字体子集 / Python+fontTools+brotli / Playwright Chromium 或系统 Edge / curl / tvly（Windows 上还会提醒 `PYTHONIOENCODING`）/ `--net` 顺带探 AniList、safebooru、维基连通性。此前环境问题都要"跑到第几步才炸"，用户第一次用往往就死在这里
- 新增 `npm run audit` —— **数据完备度审计**（`evals/audit.js`）：逐个作品列出缺必填 / 还是"未核实" / 建议补哪些字段 / 封面与肖像文件是否存在 / `unit_synopses` 与 `units` 是否逐字对齐 / 简介字数 / `production` 是否会被降级成整段文本。`check` 只看"产物在不在、页码对不对"，**看不了"内容残不残"**——这是此前最大的验收盲区
- 新增 `npm run sources` —— **素材来源台账**：`sources.js` + `_ledger.js` 记录每张图的「渠道 + 出处 URL + 取得日期」，交付时导出 `anime_build/_sources.md`。`--pick` 会自动记一条图库来源，官方渠道取的图用 `sources add` 手工记。**把合规从"文档里写一句仅个人收藏"变成流水线自动产出的自证材料**——公开分享或被人质疑时能拿出处
- `fetch_candidates.js --pick` 增加 `--as <作品名>`，让取图来源能归属到具体作品
- 文档：SKILL.md 执行流程加 ⓪ 自检步骤、验收步骤改为 `audit → check → 目检`；一键命令块补三条；README 快速开始与脚本表同步；`evals/README` 增加「数据完备度审计」一节；`image-selection.md` 工作流补"记来源"步骤

## 1.4.6

- 技术债（速度）：`fetch_candidates.js` 的候选图**改为并发下载**（上限 4），`--pick` 收尾时删掉中间文件 `download.tmp`。原实现是 12 张逐张 `execFileSync` 同步下载、单张最长 90s，最坏要十几分钟且全程阻塞；顺带把"0 结果"的提示从「无候选（标签拼写？）」改成同时提示标签拼写**与网络可达性**（curl 的连接错误会被 `-s` 吞掉，容易把网络问题误诊成标签写错）
- 技术债（脏状态）：`collect_fonts.js` 的字体子集**改为先写 `.tmp` 再原子替换**——此前中途中断会留半截 `wk-sub-*.woff2`，而构建会照样把它 base64 内嵌进 HTML，`check` 只查 U+FFFD 也发现不了"字体静默回退"。另：源 TTF 缺失时先给中文提示（此前是 fontTools 抛一堆看不懂的错）
- 技术债（验收，重要）：`evals/check.js` 新增第 ⑦ 条断言「**两轮页码一致（已收敛）**」。原先只比"目录页码 vs 本轮 `_pagemap.json`"，而两者都是**同一轮**产物 → 页码漂移时会**错得一致而静默通过**。现在 `anime_pagemap.js` 每轮把上一轮映射存成 `_pagemap.prev.json`，断言两轮逐部相同；单轮产物会明确报缺失。**断言总数 12 → 13**，README / CONTRIBUTING / PR 模板 / evals/README 同步
- 修复：`build_anime_html.js` 的 `NOW` 从 UTC 改为**本地时区**——跨月跑两轮时 UTC 会让刊头月份不同，给"两轮一致"白添漂移源
- 验证：fixture 跑满两轮 + `npm run check` **13/13**；负向测试（人为篡改 `_pagemap.prev.json` 的一页 → 第 ⑦ 条必须失败）；`npm run candidates` 实跑（12 张并发下载）

## 1.4.5

- 合规（重要）：成品封底现在**默认自带两行声明**——「资料来源：公开资料整理（AniList / Bangumi / 维基百科等），文字为重新撰写」+「**非官方粉丝作品 · 仅供个人收藏** · 海报/立绘版权归原作者与制作委员会所有 · 请勿售卖或公开传播」。此前 `credits` 是纯可选项、默认留空，等于分发出去的册子**零署名**；现由 `DEFAULT_CREDITS` 兜底，填了 `credits` 仍可覆盖
- 合规：`npm run candidates` 的 safebooru 查询新增 **`-rating:explicit -rating:questionable`** 硬过滤（实测结果集不缩水）。涉未成年角色的性化素材在多国属刑事问题，风险远重于版权，不能只靠口头约定
- 文档：`SKILL.md` 新增「**素材与合规（交付前必读）**」小节——只做个人收藏 / 文字不得逐句搬运百科原文（表述受 CC BY-SA 约束）/ 只用全年龄素材 / 不用同人图与真人素材 / 不伪装官方 / 保留字体署名 / **外发前删 `config.json`、`names.txt`、`anime_research/`**。此前的合规声明只在 README 里，而实际执行的是读 SKILL.md 的 agent
- 文档：README 补「隐私：外发前请清理」表格（说明这三样不在版本库里，但手动拷文件夹会一起带走），并如实标注：**实测成品 HTML 与 PDF 正文及元数据均不含本机路径或用户名**；`references/image-selection.md` 增加「法律红线」一节
- 合规：`assets/names.txt` 示例名单改用虚构作品（此前仍是真实在播作品名，1.4.3 的素材合规扫尾漏网）
- 配置：`config.example.json` 补 `credits` 字段（留空即用内置默认）
- 文档：取图渠道明确**官方渠道优先**（动画官网/官方 X/发行方/原作出版社 → AniList、Bangumi 条目图 → safebooru 仅作候选对比兜底）；`references/image-selection.md` 的「来源优先级」拆成"先定渠道、再定素材"两段，工作流注明前提（官方找不到才走候选流）与"选中后回溯官方原图"
- 修复（取数，实测）：文档原先承诺"维基动画条目一页同含「主題歌」与「网络播放」两节，过滤关键词即可"——**不成立**。实测《葬送的芙莉莲》条目里这两个词根本不存在，音乐/平台信息在 `## 电视动画` 小节内、用「片头曲/片尾曲/放送」等词；且**同一条查询两次返回的正文长度差 3 倍**（28,328 vs 87,436 字符），偏短时完全没覆盖到目标小节。现改为"**先验证目标信息在场再解析；没命中就换更具体的查询或拆两次抓；不许静默跳过字段**"，并把 Windows 下 tvly 的写法（`PYTHONIOENCODING=utf-8` + 中文可直传）同步到 `pipeline.md`（此前只在 SKILL.md 修过）
- 文档：`SKILL.md` 模式 B 里的 `` `_其他文件` `` 明确为**示例约定**（你的视频库叫什么就填什么，`cover` 只需是相对作品文件夹的路径），此前全书未定义，等于让人猜
- 仓库：新增 `.gitattributes`（统一 LF，消除 Windows 检出后的 CRLF 噪音）与 `SECURITY.md`（报告渠道 + 本项目实在的威胁面与隐私边界：无服务端、无遥测，联网仅 tvly / AniList / safebooru 三处）

## 1.4.4

- 修复：`fetch_candidates.js` 的 `--pick` 入库入口引用**未定义变量 `COVERS`**，取图必崩（SKILL.md 与 1.4.0 都把它当用法宣传，实际最后一跳是断的）
- 修复：`evals/check.js` 的封面断言形同虚设——缺失封面只写进 `detail`，而 `detail` 只在断言失败时打印，缺封面的部又不计入分母，于是恒真；`catch { continue }` 还会把解析失败的 research 当成"没这部"。现改为**逐部断言 `anime_build/covers/showNN.jpg` 真实存在**、异常清单无条件打印、解析失败计入失败
- 修复：`anime_pagemap.js` 未命中书签时设 `exitCode = 3`，会掐断 `npm run pipeline` 的 `&&` 链——第二轮 build/render 不执行、目录页码永远停在占位符 `·`。现改为**告警后继续跑完两轮**，由 `npm run check` 把缺失报成失败（与 pipeline.md「两轮一致」的设计对齐）
- 修复：`build_anime_html.js` 对 `rating` / `unit_synopses` / `units` / `genres` 直接 `.filter/.find`，调研 JSON 写出非数组（如 `"rating": 8.5`）即抛 `TypeError` 中断整本构建；统一加数组兜底。同时让评分支持 **research 的 `rating`**（此前只读 base，模式 B 自备扫描脚本时评分会静默消失）
- 修复：`render_pw.js` 的 `browser.newPage()` 在 try/finally 之外（失败漏关浏览器）、msedge 兜底再失败时抛未处理 rejection 绕过友好报错；`contact_sheet.js` 缺 PDF 时抛原始 ENOENT 堆栈（其余脚本都有中文提示）；`export_cards.js` 异常路径不收尾浏览器
- 修复：`config.json` 缺失或解析失败时 9 个脚本静默回退到 `C:\anime-book`，报错指向错误方向（"未找到 anime_base.json"）；现统一提示「请复制 `config.example.json` 为 `config.json` 并改 root」
- 文档：`pipeline.md` 的 AniList 查询字段 `seasons` **在 AniList 不存在**（照抄必 HTTP 400，实测应为 `season seasonYear`）；pdf-lib 一节标注「未随包，需自行 `npm i pdf-lib`」并说明默认页脚由 Chromium `footerTemplate` 产出；删掉 pipeline.md 里并不存在的「调研 agent prompt 模板」承诺；`VROOT` 改为说明读 `config.json` 的 `vroot`（不要改脚本）；`pdf:visual-judge` 从「优先路径」降级为「可选增强」；tvly 的 Windows GBK 编码坑与 `PYTHONIOENCODING=utf-8` 写法补入（实测 `--json` 在 GBK 控制台必失败），并在「环境依赖」补上 tvly / curl
- 文档：`evals/README.md` 修正成品页数（实测 7 页，原文一处写 3-4 页与表格自相矛盾）、fixture 描述（最小样例没有 `unit_synopses`；novel 第二个样例并非"仅必填"）、复现步骤补 Windows 写法
- 修复：`package-lock.json` 根 `version` 停在 `1.0.0`；CI 新增**版本号 5 处一致**校验，防止 frontmatter 再次漏更
- 合规：`assets/research.template.json`（"写第一部前先读"的模板）此前整份使用**真实在播作品**的剧情与声优表，与 1.4.3「仓库内零第三方作品素材」不一致；现改用虚构演示作品
- 仓库：`.gitignore` 修正层级错误（`/_allpages/`、`/_sheets/` 实际在 `anime_build/` 下）并忽略字体子集中间产物 `fonts/wk_*`

## 1.4.3

- 展示素材合规化：预览图与截图全部改用**虚构演示作品**（evals/fixture + 程序生成的占位封面）重渲，仓库内零第三方作品素材
- 新增：README「关于素材版权」节——说明海报需使用者自备、成品仅供个人收藏、公开传播需自行评估授权
- 新增：fixture 补两张程序生成的占位封面（预览图可复现，同时覆盖封面渲染路径）
- 修复：`SKILL.md` frontmatter 的 `metadata.version` 自 1.4.0 起**漏更**（一直停在 1.3.0），现与 `marketplace.json` / `plugin.json` / `scripts/package.json` 四处对齐为 1.4.3

## 1.4.2

- 修复（合规）：成品内嵌霞鹜文楷子集，但此前**没有任何字体版权署名**——OFL 1.1 要求版权声明随字体软件分发。现封底**自动附完整署名**（© LXGW ｜ © The Klee Project Authors，基于 FONTWORKS「Klee One」衍生）
- 修复：README 许可节原写「版权归其作者」，**漏了上游 Klee Project Authors**（霞鹜文楷是二创字体）；同时补充「不得单独售卖 / 保留名」等 OFL 注意事项
- 文档：SKILL.md 与 collect_fonts 的字体说明同步补全版权链，并注明封底署名不要删

## 1.4.1

- 新增：**`extra` 补记卡**（可选 `{title, text}`）——装载彩蛋/考证/补注一类补充内容，渲染为章内卡片
- 新增：**`config.json` 的 `credits` 字段**——封底显示资料来源/版权署名（使用第三方资料时注明出处）
- 修复：无 `units` 的条目不再渲染只有表头的空「出场详情」表
- 实战首用：小说模式角色档案从 4 人扩到 10 人（含逐条补记卡）——书从 12 页增到 18 页

## 1.4.0

- 新增：**选图审美标准文档** `references/image-selection.md`——核心「有戏 > 清晰」：封面要氛围（有环境/动态/构图完整），章节肖像要干净（正脸/安静/清晰）；含要什么/避什么/来源优先级/禁止项
- 新增：**`portrait` 字段**（可选）——章节页肖像与封面图分离：封面用氛围图、章节用干净立绘；缺省回退 `cover`
- 新增：**候选图工作流固化** `npm run candidates -- <tag>`——自动抓 safebooru official_art 候选、按"非白底比例"打分排序、出 3:4 瓦片对比图；`--pick <编号>` 取图入库（真 JPEG q92，可选 `--keep-top` 裁宣传区）
- 文档：SKILL.md 质检铁律 #1/#2 重写为选图审美标准；执行流程与字段表同步

## 1.3.5

- 新增：封面瓦片**主题色渲染**——每格按其角色主题色做 multiply 叠加，白底立绘被"洗"成淡彩面板（附底部渐深层次），整版不再是白块；同时保留底色下划线
- 重构：**`config.json` 移出版本管理**（属于使用者本机配置）——仓库只提供 `config.example.json` 模板，`.gitignore` 已加规则；新装用户按 SKILL.md 复制模板即可
- 文档：SKILL.md 初始化说明改为「复制 config.example.json 为 config.json」

## 1.3.4

- 修复：collect_fonts 脚本缺 anime_base.json 时给出中文下一步指引（此前裸抛 ENOENT 堆栈——novel 实战清理中间产物后重跑时踩到）

## 1.3.3

- 修复：封面网格列数按封面数量自适应——4 张封面改为 2×2 大图布局（原 3 列会留 2 个空位），1 张居中放大，2 张双列，其余 3 列；双列网格限宽防溢出到第二页
- 修复：仓库内 config.json 恢复为默认值

## 1.3.2

- 修复：分享卡金句过长时压进底栏/裁掉说话人——卡片改 flex 流式布局（正文区自动裁剪、底栏归位），金句限两行
- 实测来源：小说模式 4 角色档案册实战首跑

## 1.3.1

- 修复（novel）：状态徽章只识别「放送中」，导致 novel 模式的「连载中」永远染琥珀、数说页「完结/连载中」恒为 0——现「连载中」正确显示绿色并计入统计
- 打磨：novel 统计卡标签「篇 篇章」→「篇章」；`names_to_base.js` 缺名单报错文案领域中立（提示番剧名或角色名）
- 更新：marketplace 与 plugin 清单描述升级为双领域（收藏册 + 设定集）
- 新增：`evals/fixture-novel/`——novel 领域的可复现数据集（2 个虚构角色，含全回收伏笔表），并补自测说明
- 补测：此前未实测的两条路径现已过真实渲染——>8 年时间轴紧凑模式（10 角色 × 10 年份）与伏笔「全回收 ✓」路径（章末卡 + 数说页）

## 1.3.0

- 新增：**领域包结构**——`config.json` 新增 `"domain"` 字段（`anime` 默认 / `novel`），同一引擎服务两个场景，界面标签整体查表切换（部/集/首播/系列收录 ↔ 位/章/初登场/伏笔回收），数据字段结构完全不变
- novel 领域包：每"部"=一个角色/势力；`units`=登场卷篇（eps=章数）、`franchise`=伏笔表（collected=已回收）、`production`=设定要点、`quote`=角色金句；**全程离线**（无联网调研环节）
- 新文档：`references/domain-novel.md`（字段映射、工作流、读者版脱敏技巧）
- SKILL.md description 升级为双场景触发；README 增加领域包说明
- 兼容性说明：不配置 `domain` 时行为与 1.2.0 完全一致

## 1.2.0

- 新增：**系列完整度审计**——research JSON 可选 `franchise` 字段（该系列全部条目盘点 + collected 标记），渲染刊头「系列收录 M/N」、章末待补清单（或「已收全 ✓」），数说页汇总「待补条目」
- 新增：**收藏卡导出**——构建产出独立 `share_cards.html`，`npm run cards` 对每张 750×1000 竖版卡截图成 PNG（deviceScaleFactor 2），同时导出高清整页图 `_gallery/`
- 加固：时间轴年份多时逐级收紧（>8 年缩字号，>14 年只留年份点），不再随收藏规模挤爆版面
- 加固：收藏详情表「单元」列宽按最长名字自适应（26–48mm，ASCII 半宽折算），长单元名不再硬折；表格单元格补 `overflow-wrap`
- 新脚本 `export_cards.js`；`npm run cards`；文档与 fixture 同步

## 1.1.0

- 新增：**封面页**——海报拼贴墙（最多 9 张，每张衬该作主题色底边）+ 大字书名 + 跨度/部数/集数 + 版本行
- 新增：**封底页**——淡色大「完」字收尾 + 书名/统计/生成署名（杂志版权页风格）
- 新增：`config.json` 可选 `title` 字段——自定义书名（默认《番剧收藏简介》），影响封面/总览/封底显示；字体子集自动收录新书名字符（防方块字）
- 重构：「书名硬编码 4 处」收口为 `BOOK_TITLE` 一处定义；输出文件名保持不变
- 新增：`npm run check` 第 12 条断言「封面封底页已生成」

## 1.0.3

- 新增：**封面自动取色**——构建时从每部封面提取主导色相自动生成该章主题色（饱和度加权、去黑白灰、全书明度统一）；`ACCENTS` 硬编码色表移除，`research.accent` 字段可手动覆盖
- 新增：**台词卡**——research JSON 可选 `quote` 字段（字符串或 `{text, speaker}`），章节刊头下方渲染大字居中台词（主题色引号）
- 新增：**数说收藏页**——总览之后的 Wrapped 式大数字统计页：收藏总量 / 收录跨度 / 最长系列（用该作主题色）/ 最高频类型 / 年代分布条形 / 完结与放送中盘点
- 变更：`build_anime_html.js` 组装段改 async（取色需解码图片），对命令行用法无影响
- 文档：SKILL.md 字段表与质检铁律 #3、README、fixture（星海旅人含台词）同步更新

## 1.0.2

- 修复（重要）：**数据类型漂移防御**——调研 JSON 的 `eps`/`airdate` 若为字符串（LLM 产出常见），原版统计会变字符串拼接（实测产出「共 012161212 集」）、字符串时间戳会让构建直接崩溃。现在 `names_to_base.js` 合成时归一化 + `build_anime_html.js` 读入后再兜底（数值/ISO 日期字符串均兼容）
- 修复：`build_anime_html.js` / `anime_pagemap.js` 缺 base.json/字体子集/PDF 时给出中文下一步指引（原先裸抛 ENOENT 堆栈）
- 新增：`npm run check` 第 11 条断言「目录页码与最终书签一致」——把「两轮渲染稳定」从人工比对变成机器断言
- 加固：`esc()` 补双引号转义（字段将来挪进 HTML 属性也不会破）
- 清理：移除未使用的 `--ac-rule` CSS 变量
- 规范：SKILL.md frontmatter 按 [Agent Skills 规范](https://agentskills.io/specification)补齐可选字段 `license` / `compatibility` / `metadata`（author+version）；`skills-ref validate` 零错误

## 1.0.1

- 修复：章节刊头年份原为硬编码 `2026`，改为动态 `${NOW}`（总览页与各章一致，跨年不再显示旧年份）
- 修复：`rating` 条目漏写 `site` 字段时不再抛错（原 `x.site.toUpperCase()` 会中断整个构建）
- 修复：状态徽章「未完结」不再被误判为已完结（`stClass` 加负向后顾，仅「已完结/完结/完结篇」染灰）
- 修复：年份计算统一为 UTC 口径（`getUTCFullYear`），消除与 `fmtDate` 的时区口径不一致
- 修复：`anime_pagemap.js` / `contact_sheet.js` 改用动态 `import()` 加载 pdfjs-dist 的 `.mjs`，兼容全部 Node ≥20（原 `require(ESM)` 需 20.19+/22.12+）
- 修复：`render_pw.js` 改用 `url.pathToFileURL()` 生成 `file://` 地址，避免 macOS/Linux 下多一个斜杠
- 修复：封面复制失败时打印告警（原先静默返回空）
- 修复：README 中 `references/pipeline.md` 链接指向修正（原相对路径从仓库根解析会 404）
- 元数据：`marketplace.json` 的 `owner.name` 与两个 `plugin.json` 的 `author.name` 改为 `123ccw`；LICENSE 补版权人署名

## 1.0.0

- 首个公开版：模式 A（报菜名：名单 → 全自动调研 → 杂志风 PDF）与模式 B（本机收藏库，进阶）
- 排版：总览统计卡 + 年份时间轴 + 带页码可点击目录；每部主题色章节（官方海报 / 无剧透简介 / 结构化制作表 / 主题歌与观看平台 / 补番顺序 / 逐季剧透表 / 状态徽章）
- 工程：中文字体子集防缺字（含 build 脚本文案兜底）、两轮渲染定页码（`npm run pipeline` 一键跑完）、config.json 统一配置、缺文件中文提示

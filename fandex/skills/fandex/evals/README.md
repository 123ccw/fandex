# evals —— 怎么验证这套管线是好的

## 一键验收（日常）

跑完 `npm run pipeline` 后执行：

```bash
npm run check
```

断言产物完整性：base 可解析、每部有调研稿、HTML/PDF 已生成、**无乱码方块字**、封面逐部真实落盘、页码映射全命中、**目录页码与最终书签一致**、**两轮页码一致（已收敛）**、**数说页含补充统计（[C18]）**；PDF 层另有体积上限、**正文含每部作品名**（防字体子集吞字）、**书签含每部作品名**（页码反查的输入源）、**书签标题无重复**（重名会让页码反查取错页）。任何一条失败都会给出排查方向。

> 前 13 条是 `check.js`（纯 fs）查的，`[C14]` 的体积也由它 `stat` 得到；`[C15]`-`[C17]` 要看 PDF 内部，由 `pdfprobe.js` 用 pdfjs 深检后写 `_pdfprobe.json` 收据，`check.js` 读它判定（跑 `npm run check` 会自动先跑探针；单独跑用 `npm run probe`）。

> 「两轮页码一致」比的是 `_pagemap.prev.json`（上一轮）与 `_pagemap.json`（本轮）——只比"目录 vs 本轮映射"是自证的（两者同轮），查不出漂移。这个断言要求用 `npm run pipeline` 跑满两轮，单轮产物会直接报缺失。

## 数据完备度审计（建议性，不阻断交付）

```bash
npm run audit
```

`check` 只管"产物在不在、页码对不对"，**不管内容残不残**：一部作品少了 `music` / `platforms` / `unit_synopses`，或者八个字段全写着"未核实"，`check` 照样全绿——你拿到的是"技术上合格、内容上残缺"的册子。

`audit` 逐个作品列出：**缺必填**（synopsis / source / genres / production / cover）· **还是占位或未核实** · **建议补**（music / platforms / status / watch_order / unit_synopses / title_jp / rating）· 封面与肖像文件是否真实存在 · `unit_synopses` 与 `units` 名字是否逐字对齐 · 简介字数（硬线 `<120` / `>800` 计入问题，300-500 只是软建议）· `production` 是否会被降级成整段文本。最后给"建议先补这几部"。

**渲染前跑一次最划算**——改 JSON 比重渲整本便宜得多。它是建议性的一步，**默认退出码 0**（有硬问题也不阻断交付）；要按硬问题（缺调研稿 / 坏 JSON / 缺必填 / 剧透表不对齐）gate，就让调用方加 `--strict`。

## 验收收据（check / audit 每次运行都会写）

两个脚本都会把结构化收据写进 `anime_build/`：

| 收据 | 内容 |
| --- | --- |
| `_check.json` | 18 条断言逐条结果、`exitCode`、被检查产物的 sha256 前 16 位 |
| `_pdfprobe.json` | PDF 层探针结果：页数、体积、书签条数、正文提取字数、两类缺失清单（`[C15]`/`[C16]` 的依据）与重复书签清单（`[C17]` 的依据） |
| `_audit.json` | 每部状态汇总（`complete` / `soft` / `hard` / `missing` / `broken`）、`needFix` |
| `receipts/<作品名>.json` | **每部一份**：状态 + 调研稿哈希 + 缺哪些字段 + 问题清单 |

它们的用途有两个：

1. **`npm run pack` 会读 `_check.json` 与 `_audit.json`**，在交付说明里生成「核验状态」表（见 `references/build.md`）。收据缺失、或成品比收据新（改完重渲没重跑 `check`）时，表上标 `⚠ 过期/无收据`；收据的 `root` / 书名 / 当前 PDF 的 sha256 有一项对不上就标 `❌ 收据不属于本产物`——这是防"check 全绿"被当成"全书已核验"、也防伪造/串项目收据被当成凭据的机制。
2. **做多部作品时，`receipts/` 就是可续跑清单**：中断后只挑 `hard` 与 `missing` 重做，不用重新扫全书。派子代理的契约见 `references/research-contract.md`。

## CI 跑的是**真流程**（不只是语法检查）

仓库根的 `.github/workflows/ci.yml`（**单独安装的 skill 副本不含 `.github/`，这一节需回仓库核验**）的 fixture job 会：程序生成两枚极小测试字体（`make_smoke_font.py`，无需下载霞鹜文楷）→ 跑满两轮 `pipeline` → `check` → 负向测试：封面缺失必须报 `[C7]`、页码漂移必须报 `[C12]`、交付说明必须如实标注未核验，另加 ④ 书名撞作品名时页码不得取到前置页、④b 注入重复书签必须报 `[C17]`、⑤ `--force` 不得删用户目录里的非本工具文件、⑥ 交付包不得含本机绝对路径、⑦ 伪造收据不得被标成 ✅。最后再跑一遍 **novel 领域包**（`fixture-novel`：两轮 pipeline → check 全绿 → audit），并做负向测试 ⑧：novel 下**声明了**不存在的 cover 仍必须报 `[C7]`（放宽只针对「未声明」）。

为什么值得单独建一条流水线：1.4.4 修掉的那批真 bug（`COVERS` 未定义、封面断言恒真、pagemap 掐断 `&&` 链）`node --check` 一条都抓不到。

## 从零复现（完整自测）

`fixture/` 是一份**可复现的最小数据集**（2 部虚构作品：一部全字段，一部是**故意残缺的降级样本**「测试小作品」——缺 `source`/`genres`/`production` 三个必填字段、synopsis 只有 60 字，低于 120 硬下限），用来验证"从零开始能不能跑通"与缺省降级路径。它因此会让 `npm run audit` **预期报硬问题**（CI 里的 `npm run audit || true` 是刻意为之），但 `npm run check` 仍应全绿。其中 `anime_research/covers/` 的两张封面是**程序生成的占位图**（`docs/preview-*.png` 即由这份数据渲染；`docs/` 只在仓库里，安装副本不含）——仓库不含任何第三方作品素材。

`fixture-novel/` 是 **novel 领域包**的对应数据集（2 个虚构角色：**沈观澜** 含 franchise 伏笔表与 watch_order，**白鹭洲** 只给到 status/quote/accent/rating 一类常规可选字段）——验证标签切换与伏笔渲染。

```bash
# 1. 建一个临时项目根（路径任意），把 fixture 内容拷进去，再把字体放进该根的 fonts/
#    （fixture 不含字体，这步不能省）
#    Windows: robocopy fixture "%TEMP%\anime-eval" /E
#    POSIX  : mkdir -p /tmp/anime-eval && cp -r fixture/* /tmp/anime-eval/
#
#    A. 有霞鹜文楷：把 LXGWWenKai-Regular.ttf / -Medium.ttf 放进 <根>/fonts/
#    B. 没有（CI / 离线自测）：用程序生成测试字体，然后用环境变量指过去——
#       python evals/make_smoke_font.py /tmp/anime-eval/fonts
#       export ANIME_BOOK_FONT_REGULAR=/tmp/anime-eval/fonts/Smoke-Regular.ttf
#       export ANIME_BOOK_FONT_MEDIUM=/tmp/anime-eval/fonts/Smoke-Medium.ttf

# 2. 用环境变量把 root 指到该目录（不必改 config.json），然后：
export ANIME_BOOK_ROOT=/tmp/anime-eval
npm run base && npm run pipeline && npm run check

# 3. 预期：pipeline 两轮页码一致；check 全绿（18 条）；成品 PDF 共 7 页（实测）
#    注意：测试字体的字形是方块占位、字宽与真字体不同，页数可能与正式字体不一致；
#    check 关心的是"两轮是否收敛、封面是否落盘"，与字体无关。
```

> `ANIME_BOOK_ROOT` / `ANIME_BOOK_FONT_REGULAR` / `ANIME_BOOK_FONT_MEDIUM` / `ANIME_BOOK_DOMAIN` / `ANIME_BOOK_TITLE`
> 都由 `scripts/_config.js` 统一读取，优先级高于 `config.json`——CI 与临时自测靠它避免改坏本机配置。
>
> **测试字体只能用于自测**：字形是程序生成的占位轮廓，不能拿来做成品。

> novel 自测：同样步骤换 `fixture-novel/`，且 config.json 需加 `"domain": "novel"` 与 `"title"`。预期：全部标签为角色/篇/章/伏笔回收；「连载中」状态徽章为绿色；沈观澜章末出现「伏笔回收 2/2 ——已全部回收 ✓」。

## 期望结果（fixture）

| 检查项 | 期望 |
|---|---|
| `npm run pipeline` | 两轮页码一致，无 ⚠ 警告（「星海旅人」的 unit_synopses name 与 units 逐字对齐；「测试小作品」未给 unit_synopses，故不触发缺文案告警） |
| `npm run check` | 全部通过（18 条断言） |
| `npm run audit` | 对「测试小作品」预期报硬问题（缺 3 个必填字段、synopsis 仅 60 字）；CI 里 `npm run audit \|\| true` 是刻意为之，默认退出码仍是 0 |
| 成品页数 | 7 页（实测：封面 1 + 总览 1 + 数说收藏 1 + 星海旅人 2 + 测试小作品 1 + 封底 1） |
| 特殊路径覆盖 | 「测试小作品」是故意残缺的降级样本（缺 source/genres/production，synopsis 仅 60 字）→ 验证缺省降级与"审计预期报硬问题"；「星海旅人」验证完整板块（两季剧透表 + 台词卡 + 系列待补清单）；封面页在完全无海报时降级为纯排印封面 |

## 错误码表（稳定编号，可直接引用）

断言与问题都带稳定编号，便于在 issue / 对话里直接指认（`[C7] 又出现了` 比贴一段日志快）。**编号只增不改**——含义变了就换新号。

| 码 | 含义 | 修法 |
| --- | --- | --- |
| `[C1]` | `anime_base.json` 解析失败 | 看报错行；`npm run base` 可重建（模式 A） |
| `[C2]` | 一部都没收录 | 检查 `names.txt` / 扫描脚本输出 |
| `[C3]` | 某部缺 `anime_research/<作品名>.json` | 补调研稿，或删掉 base 里多余条目 |
| `[C4]` | HTML 未生成 | 跑 `build_anime_html.js`，看它打印的第一个错误 |
| `[C5]` | HTML 里有 U+FFFD 方块字 | 漏跑字体子集：`npm run pipeline`（或单独 `collect_fonts.js`） |
| `[C6]` | HTML 里没有 `class="show"` 章节结构 | HTML 结构被改坏了，回看 `git diff` |
| `[C7]` | 封面缺失或未渲染 | 该部的 `cover` 没写 / 文件不存在 / 没复制到 `anime_build/covers/` |
| `[C8]` | 出现「2015-2015」这类年份区间 | 某部只有一年数据；补 units 的 airdate |
| `[C9]` | PDF 未生成或过小 | 跑 `render_pw.js`；浏览器没装会回退 Edge |
| `[C10]` | 页码映射条目数与收录部数不符 | 有部的标题没在书签里命中。匹配是"先全等、未命中再取最长的被包含标题"的**包含式模糊匹配**（见 `anime_pagemap.js`），且未命中只告警、不中断：排查书名/作品名与书签标题的差异（空白差异会被 `norm()` 去掉）。空作品集时本断言直接失败（`n > 0` 前置），不会"0 === 0"假绿 |
| `[C11]` | 目录页码 ≠ 最终书签页码 | 通常意味着两轮没跑完（用 `npm run pipeline`） |
| `[C12]` | 两轮页码不一致（未收敛） | 加一部/改标题后分页漂移；再跑一轮，仍不一致则查该部标题长度 |
| `[C13]` | 缺封面页或封底页 | HTML 被改坏，或在写自定义模板时漏了 `cover-pg`/`back-pg` |
| `[C14]` | PDF 体积超阈值（默认 25MB） | 字体没被子集化（`npm run pipeline` 第一步）；确属正常大文件用 `ANIME_BOOK_MAX_PDF_MB` 调阈值 |
| `[C15]` | PDF 正文里找不到某部作品名 | 文案改过却没重做字体子集（方块字在 PDF 里表现为整段消失）；或该部标题与渲染文案不一致。跑 `npm run pipeline` |
| `[C16]` | PDF 书签里找不到某部作品名 | 书签是 `_pagemap` 的唯一输入：丢了目录页码必然停在占位符。检查渲染是不是被换成了不带 `outline: true` 的方式（合并 PDF 也会丢书签） |
| `[C15]`/`[C16]` 报「探针未能运行」 | 缺 `_pdfprobe.json` 或 pdfjs 不可用或还没渲染 | 按提示做：缺收据跑 `npm run probe`；提示"还没渲染出 PDF"就先跑 `npm run pipeline`；pdfjs 不可用在 `scripts/` 执行 `npm i`（给的是可操作中文，不再抛 `pdf-missing` 这类内部标识符） |
| `[C17]` | 书签里出现重复的"当键用"标题（作品名/书名） | 页码反查以标题为键，重名会取到错误那一页。典型原因：**书名与某部作品名相同**（总览页标题也生成了书签）→ 目录页码会印成总览页页码。改书名，或让总览页标题不生成书签——**已修**：总览页书名改用 `div.thd-title`（非标题元素），不再生成书签。小节重名（如每部都有的「补记」）不触发本断言 |
| `[C18]` | 数说页缺少补充统计（单元构成 / 时长估算 / 类型 TOP3 / 平均评分） | 改了 `build_anime_html.js` 的 `miniBlocks` / 数说页结构后没重跑构建；重跑 `npm run pipeline` 再 `npm run check` |
| `[A1]` | 某部没有调研稿 | 同上 C3 |
| `[A2]` | 调研稿 JSON 解析失败 | 按报错行修（常见是尾随逗号、中文引号） |
| `[A3]` | 缺必填字段 | `synopsis`/`source`/`genres`/`production`/`cover` 优先级最高 |
| `[A4]` | 字段还是「未核实」占位 | 查证后替换；确实查不到就保留并写清 |
| `[A5]` | 建议补的可选字段缺失（music / platforms / status / watch_order / unit_synopses / title_jp / rating） | 缺了对应板块会整块消失（不致命） |
| `[A6]` | `cover`/`portrait` 文件不存在或路径含 `..` | 把图放进 `anime_research/covers/` 并改成相对路径 |
| `[A7]` | `unit_synopses` 与 `units` 名字不对齐 | **逐字**对齐，否则该单元渲染成空白 |
| `[A8]` | `synopsis` 字数硬线不在 120-800（`<120` 或 `>800` 计入问题） | 300-500 是软建议（进"建议补"清单，不阻断）：太短撑不起版面，太长挤版 |
| `[A9]` | `production` 未按「键：值；键：值」写 | 会被降级成整段文本（不致命） |
| `[A10]` | `accent` 不是 6 位 hex | 形如 `#e0407e` |
| `[E1]` | `export_cards.js` 缺 `share_cards.html`（或 0 张卡片 / PDF 页数为 0） | 先跑 `npm run pipeline` 生成分享卡源文件；这些情况现在非零退出，不再静默 exit 0 |
| `[L1]` | 来源台账 JSON 损坏 | `sources` / `fetch_candidates --pick` 会**拒绝写入**并备份 `_sources.json.bak`，不会用空台账清空历史；修好 JSON（或删掉损坏文件重新开始）后重试 |
| `[P1]`–`[P8]` | `pack.js` 的交付失败码 | 见 `scripts/pack.js` 头部注释：P2 目标目录非本工具产物（换 `--out`，或确属本工具旧产物时加 `--force`）、P4/P5 PDF 缺失或复制不完整、P8 替换失败（已自动回滚） |
| `[P9]` | 目标目录里有不是本工具生成的文件 | `pack` 拒绝覆盖并列出这些文件；`--force` 只放宽"这是不是本工具上次产物"的判定，**不会递归删除用户目录**——请换 `--out`，或先手动移走这些文件 |
| `[P11]` | `--strict` 下有未核验项 | 只是让退出码非零（交付物已生成）；补跑 `npm run check` / 补齐目检签署，或去掉 `--strict` 接受"已交付但未全核验" |
| `[V1]` | 交付说明里「产物断言」一行显示 **无收据** 或 **过期** | 跑 `npm run check`（过期＝改完重渲后没重跑验收，成品比收据新） |
| `[V2]` | 交付说明里「全页目检 / 封面逐张目检」显示 **未声明** | 这两件事机器验不了：真的逐页看过再用 `npm run pack -- --pages-reviewed --covers-reviewed` 签署；没看就让它写着「未声明」 |

> `[V]` 系列不阻断交付，它挡的是**"交付了"被读成"全书已核验"**。想让这两行变绿，只有一条路：真的去做那件事。

# 构建 · 渲染 · 验收 · 交付

> 主文件按需指到这里。所有命令都在 skill 的 `scripts/` 目录执行；首次先 `npm i`，再把 `config.example.json` 复制为 `config.json` 并把 `root` 改成你的项目根。

## config.json（本机配置，不入库）

`config.json` 含你的路径与书名，**已在 `.gitignore` 里**；仓库只提供 `config.example.json` 模板。**把文件夹拷给别人或上传前记得删掉它**（详见 `compliance.md` 末条）。

| 字段 | 作用 |
| --- | --- |
| `root` | 项目根（构建读写的都是它下面的目录） |
| `vroot` | 模式 B 的视频库根；脚本内是 `const VROOT = CFG.vroot`，**不要改脚本** |
| `domain` | `anime`（默认）/ `novel` |
| `title` | 书名：封面/总览/封底显示，**同时决定输出文件名**（`anime_build/<title>.html` 与 `.pdf`） |
| `credits` | 封底"资料来源"行；留空则用内置默认（公开资料整理 + 不指向具体站点的兜底表述） |
| `fonts` | 可选，仅 CI / 离线自测：`{ "regular": "<TTF 绝对路径>", "medium": "..." }` 顶替霞鹜文楷 |
| `userdata` | 可选，用户个人数据文件路径；默认 `<root>/userdata.json`（schema / 迁移 / 验收见 `userdata.md`）。**构建只读**，别在构建流程里改它 |

改完照常 `npm run pipeline`——字体子集会自动收录新书名字符。

**环境变量优先于 `config.json`**（CI 与临时自测靠它避免改坏本机配置）：
`ANIME_BOOK_ROOT` · `ANIME_BOOK_VROOT` · `ANIME_BOOK_DOMAIN` · `ANIME_BOOK_TITLE` · `ANIME_BOOK_CREDITS` · `ANIME_BOOK_USERDATA` · `ANIME_BOOK_FONT_REGULAR` · `ANIME_BOOK_FONT_MEDIUM`。
读取逻辑集中在 `scripts/_config.js`（单一事实源，所有脚本共用）。

## 一键命令

```bash
npm run doctor     # 环境自检（node / python+fonttools / 字体 / 浏览器 / curl / tvly / config / 重复安装；加 --net 顺带探网络）
npm run pipeline   # 字体子集 → 两轮「构建→渲染→页码反查」，一条命令跑完
npm run check      # 产物断言（完整性 / 页码全命中 / 无乱码 / 两轮收敛 / PDF 层，共 18 条；会自动先跑 probe）
npm run probe      # 只跑 PDF 层深检（pdfjs 提正文 + 读书签）→ 写 anime_build/_pdfprobe.json
npm run audit      # 数据完备度（哪部缺字段、哪些还写着"未核实"、剧透表对不对得上）
npm run sheet      # 生成全页联络表（目检用；也支持任意 PDF：node contact_sheet.js --pdf <路径> --out <目录> [--scale <n>]）
npm run cards      # 导出收藏卡 PNG + 高清整页图（anime_build/_cards 与 _gallery）
npm run sources    # 出素材来源台账（anime_build/_sources.md）——公开分享时的自证材料
npm run epub       # 导出 EPUB 3 可重排版（anime_build/<书名>.epub；手机/阅读器用；需 Python 3，字体子集另需 fonttools）
npm run userdata   # 把研究稿里的"已收"迁进 userdata.json（只补缺失、幂等；`-- --dry-run` 只看不写）
npm run test:userdata  # 用户数据层回归测试（读写 / 原子写 / 损坏保护 / 迁移幂等 / 写入入口 / 构建只读）
npm run userdata:set -- --folder "作品名" --score 8.5 --comment "短评"   # 写我的评分/短评（`-- --dry-run` 只看不写）
npm run userdata:list  # 列出已经写进 userdata 的作品与评分/已收状态
npm run pack       # 一键交付：把成品与说明归拢到 <项目根>/_deliver/
npm run candidates -- <safebooru_tag>   # 候选图对比（兜底渠道；--pick <编号> 取图入库，见 image-selection.md）
npm run lint       # skill 信封校验（frontmatter / 引用完整性 / 断言条数与坑位数是否与代码一致）
npm run version:check   # 版本号是否 6 处一致（仓库维护用；不一致会列出并可 --fix）
```

> **`check` 为什么拆成两个脚本**：`check.js` 是"纯 fs、零依赖"，连 `npm i` 之前都能跑，代价是它看不见 PDF 内部。
> "字体子集缺字"（在 PDF 里表现为整段消失，不是 HTML 那种 U+FFFD）与"书签丢失"只有解析 PDF 才知道，
> 所以由 `pdfprobe.js`（用 pdfjs）做深检并写 `_pdfprobe.json` 收据，`check.js` 读它判定 `[C15]`-`[C17]`——
> 与 `pack` 读 `_check.json` 是同一个模式。探针自己永远退出 0，避免 `&&` 链在验收前被掐断。

> **验收收据**：`check` / `audit` 每次运行都会把结构化收据写到 `anime_build/_check.json` / `_audit.json`
> （断言号、通过/失败、时间戳、被检查产物的哈希）。`pack` 读这两份收据生成交付说明里的**核验状态表**；
> 收据缺失、或成品比收据新（改完重渲没重跑验收）时，表上标 `⚠ 未核验`。详见下面「交付」。

## 手动分步（调试或理解原理时用）

```bash
node collect_fonts.js      # ① 字体子集（大量新文案后必须重跑，防缺字；需 python -m fontTools.subset）
node build_anime_html.js   # ② 构建 HTML（第一轮；目录页码为占位符）
node render_pw.js          # ③ 渲染 PDF（写入书签）
node anime_pagemap.js      # ④ 从书签反查每部起始页 → _pagemap.json
# 回到 ② 再跑一轮（把真实页码印进目录）→ ③ → ④；两轮 pagemap 输出一致即稳定
```

## 交付

推荐 `npm run pack`：产出 `<项目根>/_deliver/`，含 PDF、HTML 源、`covers/` 封面图、分享卡 PNG、来源台账与一份自动生成的交付说明。

> 目标目录里若已有不是本工具生成的文件，`pack` 会报 `[P9]` 拒绝覆盖并列出这些文件；`--force` 只放宽"这是不是本工具上次产物"的判定，**不会删用户目录里的文件**。

### 核验状态表（交付说明里的第一节）

交付说明会写明**哪几件事是被机器核验过的、哪几件是 agent 声称看过的**——这两类不能混为一谈：

| 行 | 来源 | 谁能证明 |
| --- | --- | --- |
| 产物断言 `[C1]-[C18]` | `anime_build/_check.json` | 脚本，可复现 |
| 数据完备度 `[A1]-[A10]` | `anime_build/_audit.json` | 脚本，可复现 |
| **全页目检** | `pack --pages-reviewed` 签署 | **只有 agent 的声明**（`npm run sheet` 的 PNG 是证据材料，不是证据） |
| **封面逐张目检** | `pack --covers-reviewed` 签署 | 同上 |

- 未签署时该行写「未声明」，交付说明顶部会出现 `⚠ 有未经人工目检的声明` —— **别把这一行删掉再说自己看过了**
- 收据要与产物对得上：`pack` 读 `_check.json` / `_audit.json` 时会校验 `root` / 书名 / 当前 PDF 的 sha256，任一对不上就标 `❌ 收据不属于本产物`（伪造或串项目的收据不会再被当成"✅ 全部通过"；audit 收据也会判过期）
- 收据比成品旧（改完重渲、没重跑 `check`）时，该行写 `⚠ 过期（成品更新时间晚于收据）`
- 想让未核验项直接失败（CI / 脚本用）：`npm run pack -- --strict`——有未核验项时非零退出（`[P11]`），默认只警告不阻断
- 想跳过签署：明确告诉用户"这次没做逐页目检"，让它留在表上——**删声明比签假声明安全**

### 手工交付的规矩

- 成品 PDF **只保留唯一一份**（别留两份同名新旧文件）
- **HTML 源一并保留**（`anime_build/番剧收藏简介.html`），用户可自行微调重渲
- 若用户只要成品 PDF：可把 PDF 复制到项目根并清理 `anime_build/`、`anime_base.json`、`fonts/wk_*` 中间产物——但
  **`anime_research/`（调研成果 + 已核验图片，重做成本最高）与 `fonts/*.ttf`（重建必需）必须保留**
- 交付前确认封底那两行声明（资料来源 / 非官方粉丝作品）在，**不要删**

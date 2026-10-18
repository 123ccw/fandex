---
name: fanbook
license: MIT
compatibility: Requires Node.js >=20 with npm, Python 3 + fonttools/brotli (font subsetting), Playwright Chromium (or system Edge), curl and the Tavily CLI (tvly; Windows needs PYTHONIOENCODING=utf-8 for --json), and internet access for anime research (novel mode is offline).
metadata:
  author: 123ccw
  version: "1.10.0"
description: Use when 用户想把番剧/动画做成"收藏册/图鉴/纪念册/简介 PDF"——可只给片名清单（清单也可来自对话上文或文件，无需本地视频文件），也可基于本机视频收藏库；TV/剧场版/OVA 及 Galgame 视觉小说的同类整理均适用。也用于把网文/小说的设定资料整理成"设定集/角色档案册/伏笔追踪手册/读者向无剧透图鉴 PDF"（数据来自用户本地稿件或笔记，离线完成）。产出杂志风 PDF：海报墙封面封底、无剧透简介（剧透独立成表）、结构化要点表、每部主题色章节、数说统计页（类型 TOP3 / 单元构成 / 平均评分 / 时长估算）、可点击目录与书签页脚，另可导出竖版分享卡 PNG。不用于：追番进度管理（这不是 tracker）、视频文件整理/重命名/媒体库刮削（Jellyfin/Emby/Plex 场景）、对已有 PDF 的格式转换、小说正文本身的写作或排版。
---

# 番剧收藏册 PDF

把一份片名清单（或本机视频收藏）做成杂志风 PDF 收藏册（产品形态见 frontmatter 的 `description`，另含制作与声优、补番顺序）。**同一引擎还内置 novel 领域包**：把小说设定资料做成角色档案册与伏笔追踪手册（离线）。

## 先读哪份文档（按需，别一次全读）

| 你现在要做的事 | 读这个 |
| --- | --- |
| 写/补某部作品的调研 JSON | `references/fields.md` + `assets/research.template.json`（完整示例） |
| 用户个人数据（我的评分/短评/首看日/已收状态） | `references/userdata.md` |
| **派出调研子代理（并发、分工、失败重试）** | `references/research-contract.md` |
| 跑构建、渲染、验收、交付 | `references/build.md` |
| 联网查证（tvly / AniList / 维基） | `references/pipeline.md` §一 数据源用法 |
| 选封面 / 立绘，判断该用哪张图 | `references/image-selection.md` |
| 交付前过一遍版权与隐私 | `references/compliance.md` |
| 遇到具体报错，要完整踩坑清单（14 条） | `references/pipeline.md` |
| 做小说设定集（novel 域） | `references/domain-novel.md` |

## 执行流程（五步，勿跳步）

- [ ] ⓪ 自检：`npm run doctor` —— 环境齐全再开工（**换机器时尤其别跳**）
- [ ] ① 调研：`names.txt` → 每部一份 research JSON + 官方海报（**并发 ≤2**，一次 3-4 部省 token；字段见 `references/fields.md`）
- [ ] 🔴 CHECKPOINT：每部 research JSON 与封面文件均已落盘、查不到的字段写「未核实」而非编造 → 通过才进 ②；不通过就补齐或明确告知缺口
- [ ] ② 合成：`npm run base`（模式 A）
- [ ] ③ 构建：`npm run pipeline`（字体子集 + 两轮「构建→渲染→页码反查」）
- [ ] 🔴 CHECKPOINT：两轮 `_pagemap.json` 一致、无 ⚠ 未命中 → 通过才进 ④；未命中先回查 `units[].name` 是否逐字一致
      ↳ 未收敛 → 再跑一轮 `npm run pipeline`；仍不一致 → 查该部标题长度是否变化导致分页漂移（[C12]）；若某部页码一直留「·」→ 到 ④ 看 `[C10]`（书签未命中该部）
- [ ] ④ 验收：`npm run check`（**产物断言 18 条** [C1]-[C18]；会自动先跑 `pdfprobe` 做 PDF 层深检）→ `npm run audit`（数据完备度 [A1]-[A10]）→ **全页目检** → 封面逐张目视核对
      ↳ `check` 报错 → 按 `[C#]/[A#]/[P#]` 码查 `evals/README.md` 的错误码表（每码带修法）；`[V1]/[V2]` 只提醒不阻断
      ↳ `[C15]` 报缺字 → 文案改过没重跑子集，回 ③ 重跑 `npm run pipeline`；`[C16]` 报书签缺 → 渲染丢了 `outline`（或成品被合并过），别在渲染后做页级合并
- [ ] 🛑 STOP：全页目检与封面逐张核对未完成（或未如实记录）**禁止**进入 ⑤
- [ ] ⑤ 交付：`npm run pack -- --pages-reviewed --covers-reviewed`（一键产出 `_deliver/`：PDF + HTML + 分享卡 + 来源台账 + 交付说明，说明里带**核验状态表**；想同时带上手机可读的 EPUB，先跑 `npm run epub`），细节见 `references/build.md`
- [ ] 🔴 CHECKPOINT：交付说明的**核验状态表**与实际做到哪一步一致，再发出

**④ 的全页目检是硬要求**：`npm run sheet` 出联络表 → **agent 亲自逐页读** `_sheets/` 的 PNG，核对空白页 / 溢出 / 封面张冠李戴 / 乱码；`check` 只能证明产物存在、页码对，**代替不了它**。（若你的环境另有视觉验收子代理，可作为可选增强接上——**它不是本 skill 的依赖**。）

**目检做了就说做了、没做就说没做**：`pack` 的 `--pages-reviewed` / `--covers-reviewed` 是把它**记进交付说明**的唯一途径；不签就写「未声明」，**也别签没做过的声明**。

## 质检铁律（不可省略）

1. **封面必须亲眼看**：每张下载的图用多模态读图确认真是这部/这个角色、构图对、不是截图充数。名字搜索必串味（Hades→Hades II、按 id 猜更糟），必须核对返回的 `title`
2. **选图审美：有戏 > 清晰**：封面要有环境/有动态/构图完整；章节肖像 `portrait` 要背景干净的正脸立绘——两者审美相反。标准见 `references/image-selection.md`
3. **主题色自动取自封面**：取色不满意时用 research 的 `accent` 覆盖；交付前目检各章刊头条与封面是否「色调打架」
4. **全页联络表目检**（见上，硬要求）
5. **每个字段要么带来源，要么写「未核实」**：`source` / `music` / `platforms` / `status` 这类查证型字段，调研稿里同时留下取得渠道（`npm run sources` 记图，文字在 JSON 里附 URL 或站点名）；查不到就写"未核实（截至 YYYY-MM）"，`npm run audit` 会把占位符逐条列出来
6. **数值断言能复算就复算**：集数、卷数、评分、跨度年份，把数字在原始来源里再核一遍（agent 报的统计数字要抽验）
7. **发册前做时效复核**：把每部的最新动态（续作官宣/定档/上映/放送进度）过一遍——"截至 YYYY-MM"写旧的册子一眼就显得没维护
8. **改版/删内容前备份成品**

## 我的评分与短评（可选，与调研无关）

用户给出**自己的**评分 / 短评 / 已收状态时，写进 userdata，**别写进调研稿**（调研稿是产物，重跑就覆盖）：

```bash
npm run userdata:list
npm run userdata:set -- --folder "作品名" --score 8.5 --comment "短评原文"
```

写完重跑 `npm run pipeline`（PDF）或 `npm run epub`（EPUB）：章节头出「我的评分」、章末出「我的短评」卡。没写就不渲染。字段与规矩见 `references/userdata.md`。

## 两个领域（`config.json` 的 `domain`）

- **anime**（默认）：番剧收藏册——本文件主体讲的就是它
- **novel**：小说设定集——每"部"＝一个角色/势力，伏笔表用 `franchise` 承载，界面标签自动切换（卷/章/伏笔回收…），**全程离线**（数据来自本地稿件）。字段映射与工作流见 `references/domain-novel.md`

## 两种模式

- **模式 A · 报菜名**（零本地依赖，推荐）：用户只给 `names.txt`（一行一部），全部内容在线调研
- **模式 B · 整理本机收藏**（进阶·可选）：用户有结构化视频库（每部一个文件夹）。**扫描脚本不随包提供**（各人目录结构不同）——让 agent 按下面的最小结构写一个

`anime_base.json` 最小结构（模式 B 自备扫描脚本的输出目标；模式 A 由 `names_to_base.js` 自动生成）：

```json
{
  "<作品名>": {
    "title": "作品名", "folder": "作品名",
    "airdate": 1700000000000,
    "genres": ["类型标签"],
    "units": [{ "name": "本篇", "eps": 12, "airdate": 1700000000000 }],
    "cover": "cover.jpeg"
  }
}
```
> `cover` 是**相对作品文件夹**的封面路径——本文示例视频库把它放在 `_其他文件/` 下，那只是示例约定，**你的库叫什么就填什么**；模式 B 靠 `config.json` 的 `vroot` 指向视频库根（脚本内是 `const VROOT = CFG.vroot`，**不要改脚本**）。`airdate` 为毫秒时间戳。

## 项目结构（在用户选定的项目根下）

```
<项目根>/
├─ names.txt                 模式 A：一行一部番剧名
├─ anime_base.json           构建输入（模式 B 扫描生成 / 模式 A 由 names_to_base.js 合成）
├─ userdata.json             用户个人数据（评分/短评/已收状态；构建只读，见 references/userdata.md）
├─ anime_research/
│  ├─ <作品名>.json          每部一份调研成果（字段见 references/fields.md）
│  └─ covers/<作品名>.jpg    官方海报（下载后必须目视核对）
├─ fonts/                    LXGWWenKai-Regular.ttf / -Medium.ttf（OFL，自行下载）
├─ anime_build/              中间产物（HTML / PDF / _pagemap.json / _sources.md，脚本自动建）
└─ _deliver/                 npm run pack 产出的交付目录（可直接发出去）
```

## 开工前必读的坑位（都是实测踩出来的）

> 这里是**最硬的 9 条**；完整 14 条在 `references/pipeline.md` §五（编号稳定，可直接引用）。

- **AniList 只用罗马字/英文名搜，拿到结果先核对返回的 `title` 再用**——中文/日文名当搜索词在各接口表现不一，按记忆猜 id 更危险（id 与作品的对应毫无规律）。这是"名字搜索必串味"的第一道闸门
- **维基不要按固定小节名捞**：实测「主題歌」「网络播放」这两个标题在条目里**根本不存在**，音乐与平台信息在 `## 电视动画` 小节内、用「片头曲/片尾曲/放送」等词。**抓到正文先确认目标信息在场再解析，没命中就换更具体的查询或拆两次抓**（同一条查询两次返回的正文长度可能差数倍，偏短＝没覆盖到该小节；确实查不到就在 JSON 里写明"未核实"，让 `npm run audit` 能扫到）
- **本机直连 zh.wikipedia.org 拿不到数据**（curl 返回空）——一切经 tvly 抓取；**Windows 上 tvly 输出 JSON 会撞控制台 GBK 编码**：先 `$env:PYTHONIOENCODING='utf-8'`（或 `chcp 65001`）再调用；中文当参数直传**可以**（实测，不必非要走 stdin）
- **曲名/人名常挂在标题行的下一行**（`片尾曲` ⏎ `: "曲名"`）——过滤时连取后 1-2 行，否则数据截断
- **`unit_synopses[].name` 必须与 `units[].name` 逐字一致**——不一致该单元渲染成空白（构建时会打印 ⚠，看到就回查名字）
- **封面要选角色正脸海报**——AniList 本篇条目封面常是舞台远景/背影，翻 `relations` 里的 MOVIE 条目找干净竖图
- **每改文案必须重跑字体子集**——漏跑会出现方块字（`npm run pipeline` 已内置这一步）
- **调研子代理并发 ≤2**（超发被杀）；代理挂掉先查它的产出文件落盘没有（常见"汇报时挂、稿子已写完"）
- **airdate 缺失会让总览时间轴静默丢列**——用 units 最早日期兜底（脚本已内置；自备数据时留意）

## 环境依赖

- **OS**：脚本按 **Windows** 优先编写；macOS/Linux 核心流程可用（python 自动探测 python3），Windows 专属步骤需自行适配
- **Node ≥20** + `npm i`（playwright / pdfjs-dist / @napi-rs/canvas）；**Python 3** + `pip install fonttools brotli`
- **中文字体**：缺省用**霞鹜文楷 TTF** 放 `<项目根>/fonts/`（OFL，需自行从上游 Releases 下载）；也可用 `config.json` 的 `fonts.regular` / `fonts.medium` 指向自备 TTF——**先确认它允许嵌入与再分发**，并同步改 `credits` 的署名
- **取数工具**：`tvly`（Tavily CLI，Windows 要 `PYTHONIOENCODING=utf-8`）与 `curl`——都不随包提供
- **agent 能力**：文件读写 + Shell + 联网搜索 + **多模态读图**（封面目检必需）。任何满足这四点的 agent（Claude Code / ZCode / Cursor / DSH 等）都能跑，无厂商绑定
- 模式 B 另需 ffmpeg（抽帧补封面；Windows 下中文路径要用 ASCII 临时目录中转）
- 拿不准就先跑 `npm run doctor`：它一次把 node / python / 字体 / 浏览器 / curl / tvly / config / 重复安装（同名 skill 装了两份）全查一遍并给出修法
- 组件与字体的许可义务见同目录 `THIRD_PARTY_NOTICES.md`

## 详细版

`references/` 下有 8 份文档：**fields**（调研字段）· **research-contract**（调研子代理的输入/产出/失败契约）· **build**（构建/验收/交付）· **pipeline**（数据源用法 + 14 条坑位 + pdf-lib 盖章进阶）· **image-selection**（选图审美与法律红线）· **compliance**（版权与隐私）· **domain-novel**（小说设定集）· **userdata**（用户个人数据的 schema / 迁移 / 验收）。

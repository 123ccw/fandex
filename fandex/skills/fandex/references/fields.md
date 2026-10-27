# 调研 JSON 字段表（`anime_research/<作品名>.json`）

> 主文件按需指到这里。**写第一部作品前先读 `assets/research.template.json`**——那里有每个字段的真实文风。

```json
{
  "folder": "与收藏文件夹名一致",
  "title_zh": "中文名", "title_jp": "日文原名",
  "synopsis": "无剧透简介（建议 300-500 字；硬线 <120 或 >800 会被审计报硬问题）",
  "source": "原作情报（作者/连载平台/卷数/完结与否）",
  "update": "动画更新动态（标注'截至 YYYY-MM'）",
  "genres": ["类型标签 4-6 个"],
  "production": "动画制作：X；导演：Y；系列构成：Z；主要声优：角色·CV、角色·CV（结构化渲染自动解析）",
  "watch_order": "补番顺序（多季/剧场版/OVA 的先后与必看可跳过）",
  "music": "OP「曲名」（演唱）／ED「曲名」（演唱）（第1期）；OP「曲名」／ED「曲名」（第2期）",
  "platforms": "中国大陆：B站、爱奇艺；国际：Crunchyroll（只在有据可查时写）",
  "status": "第 3 期放送中；或 已完结 / 第 2 期制作决定（档期待定） / 剧场版 2026-10-16 上映在即",
  "quote": {"text": "代表作品气质的一句台词（避开关键剧透；不需要可省略）", "speaker": "说话角色"},
  "extra": {"title": "补记（可选，默认标题「补记」）", "text": "章内补充说明：彩蛋/考证/补注一类"},
  "accent": "#e0407e",
  "franchise": [{"name": "剧场版 总集篇 前篇", "kind": "MOVIE", "year": "2015", "collected": true}],
  "units": [{"name": "第一季", "eps": 12, "airdate": 1700000000000}],
  "unit_synopses": [{"name": "第一季", "text": "100-250 字剧透简介：主线→转折→结局落点"}],
  "rating": [{"site": "bangumi", "score": 7.9}],
  "portrait": "covers/<作品名>-肖像.jpg",
  "cover": "covers/<作品名>.jpg"
}
```

## 逐字段说明

- `units`：**模式 A 必填**（逐季/剧场版查证集数与首播，`airdate` 为毫秒时间戳；10 位秒级会自动 ×1000，写成 `"2022"` 这类既非秒也非毫秒的值会告警并置空，不再静默印成 1970-01-01）。`eps` 为 0 或缺省的单元（如剧场版）保留在收藏详情表、集数显示 `—`，并计入「N 个单元」；总集数（eps 求和）不变。模式 B 由扫描生成，research 里不用写
- `rating`：可选，有就渲染成评分行（Bangumi/TMDB 等）；**纯数字**（如 `"rating": 8.5`）也按一条评分渲染
- `unit_synopses[].name` **必须与 `units[].name` 逐字一致**——不一致该单元渲染成空白（构建时会打印 ⚠）
- `music` / `platforms` / `status`：可选，缺失自动隐藏对应板块；**status 决定标题区徽章颜色**（含"已完结"=灰、"放送中"=绿、其它=琥珀）
- `quote`：可选，有就渲染成章节台词卡（大字居中记忆点）；直接给字符串或 `{text, speaker}` 结构均可
- `extra`：可选，`{title, text}`，渲染为章内补记卡（`title` 缺省用「补记」）；不写则不出现
- `portrait`：可选，**章节页肖像**用的干净立绘（背景干净、正脸、安静）——与 `cover` 分开：封面要"有戏"（有环境/动态），章节肖像要"干净"。缺省回退用 `cover`
- `accent`：可选，6 位 hex，手动指定主题色；**缺省自动从该部封面提取主色**（全书明度统一），仅取色不满意时覆盖
- `franchise`：可选，该系列**全部条目**盘点（TV/剧场版/OVA/SP；`collected` 标是否已在收藏）——渲染「系列收录 M/N」与章末待补清单，数说页汇总待补数。条目名用官方译名，`kind` 取 TV/MOVIE/OVA/SP
- `production` 请尽量按"键：值；键：值……主要声优：角色·CV、…"格式写——渲染端会自动拆成结构化表格（格式不符则降级为整段文本，不会出错）

## 写完自查

`npm run audit` 会逐部列出：缺必填 / 还是"未核实" / 建议补哪些 / 剧透表名字对不对得上 / 简介字数（硬线 `<120` / `>800`，300-500 是软建议）/ `production` 会不会被降级。**渲染前跑一次最划算**——改 JSON 比重渲整本便宜得多。它是建议性的一步，默认退出码 0；要按硬问题 gate 就加 `--strict`。

它同时会写两份收据：`anime_build/_audit.json`（整本）与 `anime_build/receipts/<作品名>.json`（每部——状态 `complete` / `soft` / `hard` / `missing` / `broken` + 调研稿哈希）。**做多部时这是"哪几部做完了"的可续跑清单**，中断后只挑 `hard` 与 `missing` 重做。派调研子代理的分工与失败处理见 `references/research-contract.md`。

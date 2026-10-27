# 管线详解与踩坑清单

> SKILL.md 是执行手册；这份是背景知识与完整的坑位记录。给 agent 或想深挖的人读。

## 一、数据源用法

### Tavily（tvly CLI——搜索首选；本机拿不到的页全靠它）
```
# Windows 先设 $env:PYTHONIOENCODING='utf-8'，否则 --json 会撞控制台 GBK（UnicodeEncodeError）
tvly search "查询词" --json                      # 中文可直接当参数（实测可行）
tvly search "site:zh.wikipedia.org <作品名> 动画" --max-results 1 --include-raw-content markdown --json
```
- `--include-raw-content` 建议显式给值 `markdown`
- ⚠ **不要指望固定的「主題歌」「网络播放」小节名**：实测《葬送的芙莉莲》条目里这两个词**根本不存在**——音乐与平台信息在 `## 电视动画` 小节内，正文用「片头曲 / 片尾曲 / 放送」等词。各条目用词不一，所以正确做法是：
  1. 抓到正文后**先验证目标信息在场**（正文里能 grep 到「片头曲」或「放送」之类再解析）；**没命中不许静默跳过字段**，要显式说明"该字段未查到"
  2. 没命中就换更具体的查询（加「动画」「主题曲」「播放平台」等词），或拆成两次抓（音乐一次、平台一次），必要时 `tvly extract` 直接抽条目 URL
- ⚠ **同一条查询两次返回的正文长度可能差数倍**（实测 28,328 vs 87,436 字符）：偏短多半意味着**没覆盖到目标小节**——这种结果要重抓或换查询，别拿它下结论
- **本机直连 zh.wikipedia.org 常返回空**（curl 全部失败），必须走 tvly 服务端抓取
- 曲名常挂在标题行下一行（`片尾曲` ⏎ `: "曲名"`），正则命中后连着后 1-2 行一起取；名字被 `[[链接]]` 语法截断时，同法补救
- 还有 tvly extract（指定 URL 抽正文）/ research（多源综合）子命令

### AniList（GraphQL，主用）
```
POST https://graphql.anilist.co
{"query":"query{Media(search:\"<罗马字/英文名>\",type:ANIME){id title{romaji native english} coverImage{extraLarge} episodes season seasonYear}}"}
```
- **搜索必须用罗马字/英文名，拿到结果先核对 title 再用**。中文/日文名直接当搜索词在不同接口表现不一；按记忆猜 id 更危险（AniList 的 id 与作品的对应毫无规律，想当然必翻车）
- 官方海报：返回的 `coverImage.extraLarge` 直接下载（s4.anilist.co 可达）
- **Windows 坑**：搜索词含「」等全角符号时，进程参数传非 ASCII 会转码损坏（AniList 收到空查询）→ 把请求体写进临时 JSON 文件，`curl --data-binary @file`

### Bangumi API
`api.bgm.tv`，中文标题/标签/放送时间好用，无需 key（限流宽松）。

### VNDB（galgame 用）
`api.vndb.org/kana/vn`，POST + `filters:["search","=","标题"]`；封面在 `t.vndb.org`。fields 里 `image.url` 可拿封面，注意选 sexual/violence 低的 main 图。

### Steam（游戏用）
`store.steampowered.com/api/appdetails?appids=<id>&l=schinese`；竖版封面 `cdn.cloudflare.steamstatic.com/steam/apps/<id>/library_600x900_2x.jpg`。按名字搜商店会串味，appid 必须核对 name。

## 二、两轮渲染（目录页码）原理

Chromium 排版时无法预知每章起始页。做法：
1. 目录页码先渲染成**等宽槽位**（`font-variant-numeric: tabular-nums` + 固定 `min-width`）
2. 第一轮渲染出 PDF → pdfjs 读 outline（书签来自 HTML 的 h1）→ 反查每部起始页 → `_pagemap.json`
3. 第二轮构建把真实页码印进槽位 → 再渲染 → **再反查一次**，两轮页码必须完全一致（槽位等宽保证印入真实页码后布局零漂移）

书签反查时**去掉所有空白比对**（`_titles.js` 的 `norm()` 用 `/\s+/g`）：Chromium 生成的书签标题会吞掉部分空格。

## 三、版式关键结论

- Chromium 单文档**做不到分章不同页眉**（`position:fixed` 每页重复同一份；`headerTemplate` 只给全局量）。要"每页显示当前作品名"只能：HTML 预留页边距 → 渲染 → pdf-lib 按页映射盖章
- 刊头条**负边距出血会被分页画到上一页页尾**（且表格会被压断）→ 用页内圆角横幅
- 竖版封面页放横图会缩成一条 → 「同图模糊放大垫底 + contain 居中」（CSS：外框 overflow:hidden + 背景层 `filter:blur(14px)` + 前景 `object-fit:contain`）
- 中文字体内嵌：子集化成 woff2 再 base64 内嵌 HTML（300+ 页 PDF 体积可从 20MB 控到个位数）；**每次新增文案都要重新子集化**，否则新字渲染成方块
- `page.pdf({outline:true, tagged:true})` 自动生成书签；内部锚点链接（`href="#id"`）会保留成可点击跳转

### 增强字段的渲染（都可缺省降级，缺字段自动隐藏对应板块）
- **status 徽章**：标题区胶囊；`stClass()` 按关键词着色（含"已完结"=灰、"放送中"=绿、其它=琥珀）
- **结构化「制作与声优」**：`splitProduction()` 把"键：值；…主要声优：角色·CV、…"字符串拆成 staff 表格 + cast 横排；**解析失败自动降级整段文本**，所以数据格式不统一也不会出错
- **「主题歌与观看」**：music/platforms 两个字段各渲染一行（`.mline`）
- **总览页时间轴**：按首播年份分列、作品名竖排（`writing-mode: vertical-rl`）；airdate 缺失时取 units 里最早的日期兜底——**没有兜底会静默丢列**（实际踩过）
- 收藏详情表：有 unit_synopses 时切四列（单元/集数/首播/剧情含剧透）；列宽：集数 14mm、首播 26mm，窄了"12 集""2022.10.08"会折行

## 四、pdf-lib 盖章（可选进阶，**未随包**）

> 默认交付根本不需要这一节：页脚页码与书签由 `render_pw.js` 的 Chromium `footerTemplate` + `page.pdf({outline:true})` 直接产出。
> 本节是"每页显示当前作品名"这类进阶需求的实验记录，用之前先 `npm i pdf-lib`（不在 `scripts/package.json` 依赖里），并自行验证字体子集与书签是否被破坏。

- pdf-lib 载入-保存**保留原书签与内链**
- 页脚跳转链接（低级 API）：
```js
page.node.addAnnot(pdf.context.obj({
  Type:'Annot', Subtype:'Link', Border:[0,0,0],
  Rect:[x1,y1,x2,y2],
  A:{Type:'Action',S:'GoTo',D:pdf.context.obj([pages[1].ref, PDFName.of('XYZ'), 0, H, 0])}
}));
```
- 中文：`pdf.registerFontkit(fontkit); embedFont(ttf, {subset:true})`

## 五、踩坑清单（14 条）

1. **AniList 只用罗马字/英文名搜，拿到结果先核对 `title` 再用**（详见 §一）：中文/日文名当搜索词在各接口表现不一；按记忆猜 id 更危险。**这条是"名字搜索必串味"的第一道闸门**，写在这里以防只读本节的人漏掉
2. 分章页眉做不到 → 边距预留 + 盖章（见上）
3. 负边距刊头画到上一页页尾（还会压断下一元素）
4. 书签标题吞空格 → 去掉所有空白比对（`norm()` 用 `/\s+/g`）
5. **ffmpeg 中文路径** `Illegal byte sequence`：cmd+chcp 65001 只能救输出，输入路径要用同卷 ASCII 临时目录中转；硬链接在 exFAT 分区不可用，直接复制
6. **Windows 进程参数非 ASCII 转码**：全角搜索词走临时文件 + `curl --data-binary @file`
7. **explorer 文件夹图标缓存顽固**：desktop.ini 改完不刷新 → 重启 explorer + 删 `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*.db`
8. Win11 文件夹缩略图：`IconArea_Image` 无效，用 `cover.ico`（PNG-in-ICO 容器）+ `IconResource=cover.ico,0`；ini/ico 设 Hidden/System，文件夹设 ReadOnly
9. Hidden/System 属性文件 node fs 打不开（EPERM）→ 先用 PowerShell 清成 Normal
10. 重发布内容删三处：数据源、HTML 中间产物、输出目录旧 PDF（渲染脚本不清空输出目录）
11. agent 后台并发超限直接 killed，失败要排队补发；agent 报的统计数字要抽查复算
12. 二次交付只覆盖唯一成品路径，别留两份同名新旧文件
13. **本机直连维基返回空**（curl 全挂）→ 一切靠 tvly 服务端抓。**中文当参数直传是可以的**（1.4.4 实测，复测：`tvly search "葬送的芙莉莲 动画" --json` 回显的 `"query"` 与原词逐字一致）；真正的坑是**输出编码**——Windows 控制台默认 GBK，不设 `PYTHONIOENCODING=utf-8` 时 `--json` 会抛 `UnicodeEncodeError: 'gbk' codec`。stdin 写法也可用，但**不是必须**（本条原先写作"必须走 stdin"，既与 SKILL.md 冲突也与实测不符）
14. **airdate 缺失会让总览时间轴静默丢列** → 渲染端必须做 units 兜底 + 定期检查 base 数据完整性

## 六、模式 B（本机收藏） extras

- 每集内嵌封面（mp4 covr atom）与归档 `NN_cover.jpeg` 保持一致；缓存缺封面时用 ffmpeg 从正片抽帧补：
  `ffmpeg -ss 300 -i ep.mp4 -frames:v 1 -q:v 3 NN_cover.jpeg`
- 内嵌补法（幂等，替换前校验封面哈希+时长）：
  `ffmpeg -i ep.mp4 -i cover.jpeg -map 0 -map 1 -c copy -disposition:v:1 attached_pic -movflags +faststart tmp.mp4`
- 文件整理用「复制 → 字节数校验 → 删源」三段式，绝不做无校验的 move

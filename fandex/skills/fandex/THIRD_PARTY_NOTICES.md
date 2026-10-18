# 第三方组件与素材声明（THIRD PARTY NOTICES）

本 skill 的**代码**为 MIT（见同目录 `LICENSE.txt`）。下面分开列三类东西，因为它们的义务完全不同：

## 一、随包依赖（不在本仓库内，安装时由用户自行获取）

| 组件 | 用途 | 许可 | 义务 |
| --- | --- | --- | --- |
| [playwright](https://github.com/microsoft/playwright) | 渲染 PDF | Apache-2.0 | 保留声明 |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | 读书签反查页码 / 数页数 | Apache-2.0 | 保留声明 |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | 生成联络表 / 分享卡位图 | MIT | 保留声明 |
| Python [fonttools](https://github.com/fonttools/fonttools) | 字体子集化 | MIT | 保留声明 |
| Python [brotli](https://github.com/google/brotli) | woff2 压缩 | MIT | 保留声明 |
| [Tavily CLI](https://github.com/tavily-ai/tavily-cli)（`tvly`） | 联网调研 | 见上游 | 需 API key，自行遵守其条款 |

这些依赖**不随本仓库分发**，由使用者 `npm i` / `pip install` 自行安装；本 skill 不修改它们。

## 二、字体：默认用霞鹜文楷，**可替换**

管线会把你选定的中文字体**子集化后内嵌进成品 PDF**——也就是说，成品的分发同时构成字体软件的分发，字体许可因此直接约束成品。

- **默认（文档与脚本的缺省路径）**：[霞鹜文楷 LXGW WenKai](https://github.com/lxgw/LxgwWenKai)，
  SIL OFL 1.1 —— © LXGW ｜ © The Klee Project Authors（基于 FONTWORKS「Klee One」衍生）。
  OFL 要求版权声明随字体软件分发，所以**成品封底会自动附署名，请勿删除**。
- **字体不入库**：仓库不含任何 TTF，需从上游 Releases 自行下载到 `<项目根>/fonts/`。
- **可换字体**：`config.json` 的 `fonts.regular` / `fonts.medium` 可指向任意 TTF；
  换之前请确认该字体的许可允许**嵌入与再分发**（很多商业字体不允许）。换字体后封底的
  署名文案仍是霞鹜文楷的，**记得同步改 `config.json` 的 `credits`**。

## 三、成品里的素材（海报 / 立绘 / 截图）

**本仓库不附带任何第三方作品素材**：`evals/fixture/` 里的两张封面是程序生成的占位图，
README 的预览图由这份虚构数据渲染。使用者自行取用的官方海报、版权绘、截图的版权属于
各制作委员会 / 原作者 / 出版社，本工具只做排版与来源记录（`npm run sources`）。

详见 `references/compliance.md` 与 `references/image-selection.md`（含"只用全年龄素材"这条法律红线）。

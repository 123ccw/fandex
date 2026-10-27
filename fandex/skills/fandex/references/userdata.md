# 用户数据层（userdata.json）

> 这一层只存**只有用户本人有**的数据：我的评分、短评、首看日、已收状态。
> 它和 anime_research/*.json 的区别只有一条：**研究稿可以重跑，用户写的字不能丢。**

## 为什么必须单独存

- `anime_research/<作品>.json` 是调研产物，重新调研会整个覆盖。而 `franchise[].collected`（是否已收）**现在就住在这个文件里** —— 这是本 skill 现存的数据丢失风险：重跑一次调研，用户标的"已收"就没了。
- 评分要分两类：站点均分（`research.rating`，随时可重查）与**我的评分**（userdata，只有用户本人有）。混在一起，前者会把后者冲掉。

## 文件位置

`<项目根>/userdata.json` —— 由 `scripts/_config.js` 统一读取，可用环境变量 `ANIME_BOOK_USERDATA` 覆盖（CI / 临时自测用）。

## Schema（v1）

```json
{
  "schema_version": 1,
  "updated_at": "2026-10-09T02:41:56.000Z",
  "works": {
    "w_01J8ZK3M7Q": {
      "work_id": "w_01J8ZK3M7Q",
      "folder": "政宗君的复仇",
      "ids": { "anilist": 21, "mal": 1735, "bangumi": 265 },
      "collected": true,
      "status": "completed",
      "score": { "value": 8.5, "scale": 10, "source": "mal" },
      "comment": "短评原文",
      "tags": ["重看"],
      "first_watched": "2022-04-10",
      "finished_at": "2022-06-26",
      "watched": { "units": 2, "eps": 24 },
      "rewatch_count": 1,
      "franchise": [
        { "key": "movie-2024", "name": "剧场版 归港", "collected": false }
      ],
      "provenance": { "source": "mal-xml", "imported_at": "2026-10-09T02:00:00.000Z" }
    }
  },
  "moments": []
}
```

| 字段 | 说明 |
| --- | --- |
| `work_id` | 本地稳定主键。迁移时由 folder 派生（sha1 前 10 位），**一旦生成永不改** |
| `folder` | 与研究稿的 join key（= `anime_research/<folder>.json`）。P0 阶段唯一可用的连接键；P1 起优先用 `ids` |
| `ids` | 外部站点 ID。**只放这里**，不要拿站点 ID 当主键：Bangumi 独有作品没有 AniList ID，多对多且覆盖不全 |
| `score` | 必带 `scale` 与 `source`。裸数字早晚出事（MAL 与 Bangumi 同为 10 分制但口径不同） |
| `franchise[]` | 系列条目的已收状态。匹配顺序：`key` 全等 → `name` 全等 → 查不到就用研究稿旧值 |
| `moments` | 预留：逐次观看记录，年度回顾页的原料。P0 可以是空数组 |

## 硬规则

1. **构建只读**：构建 / 渲染 / 验收 / 打包全程只读 userdata；唯一写入者是 `_userdata.js` 的调用方 —— `npm run userdata`（迁移）与 `npm run userdata:set`（手工写入），导入器是下一步。
2. **缺失 ≠ 错误**：文件不存在时构建静默回退研究稿（老项目零改动可跑）。
3. **损坏 ≠ 空**：解析失败时读侧告警并按现有机制非零退出，**绝不**当空数据继续、更不会被覆盖；写侧直接抛出。
4. **原子写**：tmp + rename（同 `anime_pagemap.js`）。
5. **不进交付包**：`pack.js` 只从 `anime_build/` 取件，userdata 不会被复制进 `_deliver/`（已核实）。短评是私人内容，别跟着分享包发出去。
6. 日期一律 ISO `YYYY-MM-DD`；未知写 `null`，**不要**把 MAL 的 `0000-00-00` 透传进来。

## 谁读它（渲染闭环，P0 已接通）

`build_anime_html.js` **只读** userdata，三处生效：

1. 系列条目的**已收状态** —— 优先 userdata，查不到回退研究稿（老项目零改动照跑）。
2. 章节头部的**我的评分** —— 按 `score.value` / `score.scale` 渲染，带 `source` 时标出来源。
3. 章末的**我的短评**卡。

字段没写就不渲染，不会出现空壳标题。`score` 写数字（如 `8.5`）会按 10 分制兜底。

## 怎么写入（手工，P0 已提供）

评分 / 短评这类"只有你自己有"的内容用命令写，**别手改 JSON**（写坏了会让构建非零退出）：

```bash
npm run userdata:list                                    # 看已经写了哪些
npm run userdata:set -- --folder "政宗君的复仇" --score 8.5 --source manual
npm run userdata:set -- --folder "政宗君的复仇" --comment "重看才发现前两集埋得够深"
npm run userdata:set -- --folder "政宗君的复仇" --collected true --first-watched 2022-04-10
npm run userdata:set -- --folder "政宗君的复仇" --clear score,comment     # 删掉某几个字段
```

（`npm run userdata:set -- …` 里的 `--` 是 npm 的传参分隔符，别省。）

- 评分默认 10 分制；换分制显式给 `--scale`。**超出分制会被拒绝**，不静默截断
- `--score` 可配 `--source` 标出处；手工写入会记 `provenance.source = "manual"`
- 默认真写；加 `--dry-run` 只看会改什么、不落盘
- 按 `folder` 定位：查不到会**新建**条目；已存在的条目**只改你传的字段**，其余原样（别的作品完全不受影响）
- `--list` / `--collected` / `--status` / `--first-watched` / `--finished-at` / `--rewatch` / `--tags` 都可用；`--help` 看全集

写完重跑 `npm run pipeline`（PDF）或 `npm run epub`（EPUB）就能看到。

## 迁移（P0 已提供）

```bash
npm run userdata              # 迁移（只补缺失，幂等）
npm run userdata -- --dry-run # 只看会补多少，不写文件
npm run userdata -- --force   # 没有新增也重写一次
```

把 `anime_research/*.json` 里的 `franchise[].collected` 搬进 userdata：**只补缺失，绝不覆盖已有用户值**；没有新增就完全不写文件（幂等，可反复跑）。

> 改名注意：userdata 里的系列条目按 `key` 或 `name` 匹配研究稿。研究稿把条目改名后，userdata 那条会失配并回退到研究稿的值 —— 这是刻意的（宁可回退，也不要错配）。

## 验收（P0 完成判据）

```bash
npm run test:userdata
```

13 条：缺文件正常、写入回读、原子写不留 tmp、损坏文件两种行为、迁移正确性 / 幂等 / 不覆盖、**手工写入入口**（只改传入字段 / 幂等 / 可清除）、CLI 的 `--dry-run` 不落盘与越界评分被拒，以及**跑一次 build 后 userdata 字节不变**（构建失败也必须不变）。

整册级别的不变量：连续两次 `npm run pipeline` 后 `userdata.json` 的 hash 不变。

## 下一步（P1 导入器）

第一版只吃 MAL / AniList 的 XML 导出（`.xml.gz`，MAL 标准字段），映射关系：

| MAL XML | userdata |
| --- | --- |
| `series_animedb_id` | `ids.mal` |
| `my_score` | `score.value`（`scale: 10`、`source: "mal"`） |
| `my_comments` | `comment` |
| `my_start_date` / `my_finish_date` | `first_watched` / `finished_at`（`0000-00-00` → null） |
| `my_status` | `status` |
| `my_watched_episodes` | `watched.eps` |
| `my_tags` | `tags` |
| `my_rewatching` | `rewatch_count` |

Bangumi 无官方导出（社区第三方 takeout 工具才有），走**用户自助生成的只读 access token** —— 这不是托管式 OAuth，不引入服务端。公开收藏页抓取与托管式 OAuth 排在最后。

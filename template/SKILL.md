---
name: your-skill-name
description: Use when <用户会怎么说 / 什么场景>。产出 <交付物形态>。<可选：也用于 <第二个场景>。>不用于：<明确排除的场景，避免抢别的 skill 的活>。
license: MIT
compatibility: Requires <Node.js ≥20 / Python 3 / 某个 CLI / 联网>。
metadata:
  author: your-github-name
  version: "0.1.0"
---

# <Skill 名>

一句话：给谁、解决什么、产出什么。**别写功能清单，写"没有它会怎样"**。

## 先读哪份文档（按需，别一次全读）

| 你现在要做的事 | 读这个 |
| --- | --- |
| <第一次要写的输入文件> | `references/<字段说明>.md` + `assets/<模板>.json` |
| <跑命令 / 构建> | `references/build.md` |
| <遇到报错> | `references/pipeline.md`（完整踩坑清单） |
| <交付前把关> | `references/compliance.md` |

## 执行流程（勿跳步）

- [ ] ⓪ 自检：`npm run doctor`（环境齐全再开工）
- [ ] ① 输入：<用户要提供什么>（<并发/批量建议>）
- [ ] ② 构建：`npm run pipeline`
- [ ] ③ 验收：`npm run audit` → `npm run check` → **人工目检**（<看什么>）
- [ ] ④ 交付：`npm run pack`

> ④ 的目检是**硬要求**：脚本断言替代不了看图/看版式。

## 质检铁律（不可省略）

1. **不编造**：查不到就写"未核实"
2. **关键产物必须亲眼看**（<列出哪些>）
3. **改<文案/数据>后必须重跑<哪一步>**
4. <这个领域最贵的那条教训>

## 环境依赖

- Node ≥20 + `npm i`；<其他依赖与安装方式>
- agent 能力要求：文件读写 + Shell + <联网/读图>
- 拿不准先跑 `npm run doctor`

## 详细版

`references/` 下：<文档清单，一句话各是什么>。

---

<!--
写 skill 的四条经验（来自本仓库 fandex 与高星 skill 的对照）：

1. **入口 ≤ 10 KB**：SKILL.md 只放「执行流程 + 质检铁律 + 最硬的坑位 + 路由表 + 环境依赖」，
   细节全部下沉到 references/，让 agent 按需读。20 KB 的入口意味着每次触发都要全量吃进上下文。
2. **description 是触发词，不是简介**：写清「用户会怎么说话」和「不用于什么」——
   撞车的 skill 会互相抢触发，抢输的那个等于不存在。
3. **同一份内容只放一处**：agent 的 skill 目录常常有多个（如 DSH 会读 ~/.dsh/skills 与 ~/.agents/skills），
   同一个 skill 放两处会重复加载、互相抢触发。
4. **把"每次都会错"的环节变成断言或默认行为**：不要写"请注意检查"，要写成 check/audit 的一条断言、
   或构建脚本的默认输出。写在文档里的纪律会被忽略，写成断言的不会。
-->

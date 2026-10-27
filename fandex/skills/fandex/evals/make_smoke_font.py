#!/usr/bin/env python3
"""生成两枚极小的测试 TTF（CI 与离线自测用，替代霞鹜文楷）。

为什么需要它：`npm run pipeline` 的第一步是字体子集化，缺 TTF 直接退出——
于是 CI 里只能做 `node --check` 语法检查，跑不到真正的断言。这份脚本用 fontTools
在现场造一个含所需字形的最小 TTF，让整条管线（子集 → 构建 → 渲染 → 页码反查 → check）
可以在没有 20 MB 正版字体的机器上跑完。

用法:
    python evals/make_smoke_font.py <输出目录>
    # 产出 <输出目录>/Smoke-Regular.ttf 与 Smoke-Medium.ttf

之后在 config.json 里写：
    "fonts": { "regular": "<绝对路径>/Smoke-Regular.ttf",
               "medium":  "<绝对路径>/Smoke-Medium.ttf" }
或设环境变量 ANIME_BOOK_ROOT 指向 fixture 根（见 .github/workflows/ci.yml）。

注意：测试字体的字形是程序生成的占位轮廓，**不用于成品交付**——
成品必须用霞鹜文楷（LXGW WenKai，OFL）或用户自备的可商用中文字体。
"""
import sys
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# 覆盖 fixture 用到的全部字符（外加 ASCII 与常用标点），保证子集化后无缺字
CHARS = (
    "星海旅人测试小作品第一季第二季剧场版"
    "动画制作监督系列构成主要声优角色集数首播简介剧透原作情报"
    "补番顺序主题歌观看平台状态更新动态收藏总览数说目录完"
    "番剧藏册未经核实以官网为准完结放送中制作决定上映在即"
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "·—（）()「」『』【】～.:：,、.!！?？~- "
)


def build(path: str, family: str) -> None:
    chars = sorted(set(CHARS))
    # 字形名用 uniXXXX，fontTools 子集化与 Chromium 都能正常处理
    names = [".notdef"] + ["uni%04X" % ord(c) for c in chars]

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)

    # 全部字形共用同一个方块轮廓：够让子集化与渲染跑通，字面本身不追求可读
    pen = TTGlyphPen(None)
    pen.moveTo((100, 0))
    pen.lineTo((100, 700))
    pen.lineTo((700, 700))
    pen.lineTo((700, 0))
    pen.closePath()
    square = pen.glyph()

    fb.setupGlyf({".notdef": square, **{n: square for n in names[1:]}})
    fb.setupHorizontalMetrics({n: (800, 100) for n in names})
    fb.setupHorizontalHeader(ascent=880, descent=-120)
    fb.setupCharacterMap({ord(c): "uni%04X" % ord(c) for c in chars})
    fb.setupNameTable({
        "familyName": family,
        "styleName": "Regular",
        "psName": family.replace(" ", "") + "-Regular",
        "fullName": family,
        "version": "1.000",
        "uniqueFontIdentifier": family + "-smoke",
    })
    fb.setupOS2(sTypoAscender=880, sTypoDescender=-120, usWinAscent=880, usWinDescent=120)
    fb.setupPost()
    fb.save(path)
    print("smoke font -> %s (%d glyphs, %d bytes)" % (path, len(names), os.path.getsize(path)))


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    build(os.path.join(out, "Smoke-Regular.ttf"), "Smoke Sans")
    build(os.path.join(out, "Smoke-Medium.ttf"), "Smoke Sans Medium")
    return 0


if __name__ == "__main__":
    sys.exit(main())

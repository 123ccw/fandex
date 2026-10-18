#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fandex EPUB 导出（其他输出形态的第一步）

把 <项目根> 的 anime_base.json + anime_research/*.json（可选 userdata.json）渲染成
可重排的 EPUB 3：封面页 → 目录 → 总览 → 每部一章 → 版权页。

用法:
  python export_epub.py [--root <项目根>] [--title <书名>] [--out <文件>] [--no-font]

输出:
  <项目根>/anime_build/<书名>.epub，并复制一份到 <项目根>/_deliver/（便于直接取用）
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import uuid
import zipfile
from xml.sax.saxutils import escape as xesc

HERE = os.path.dirname(os.path.abspath(__file__))

CSS = """@charset "utf-8";
html { font-size: 100%; }
body { font-family: "LXGW WenKai", "Noto Serif CJK SC", "Source Han Serif SC", serif;
  line-height: 1.8; margin: 0 5%; padding: 0; color: #1b1b20; }
h1 { font-size: 1.7em; line-height: 1.35; margin: 1.2em 0 .2em; }
h1 .jp { display: block; font-size: .5em; color: #6b6b76; font-weight: normal; margin-top: .5em; letter-spacing: .04em; }
h2 { font-size: 1.12em; margin: 1.6em 0 .5em; padding-left: .5em;
  border-left: 4px solid #4f46e5; border-bottom: 1px solid #e6e6ee; padding-bottom: .2em; }
p { margin: .7em 0; text-align: justify; }
.meta { font-size: .85em; color: #55555f; }
.genres { font-size: .85em; color: #3c3c46; }
.quote { margin: 1em 0; padding: .7em 1em; border-left: 4px solid #c8c8d4; background: #f6f6f9; }
.quote .who { display: block; text-align: right; font-size: .85em; color: #6b6b76; margin-top: .4em; }
table { width: 100%; border-collapse: collapse; font-size: .88em; margin: .8em 0; }
th { background: #4f46e5; color: #fff; text-align: left; padding: .4em .5em; font-weight: 500; }
td { border-bottom: 1px solid #e6e6ee; padding: .4em .5em; vertical-align: top; }
img.art { display: block; max-width: 100%; height: auto; margin: 1em auto; border-radius: 4px; }
.cover-page { margin: 0; padding: 0; text-align: center; }
.cover-page img { max-width: 100%; height: auto; }
.chips { font-size: .85em; color: #4f46e5; }
.center { text-align: center; }
.small { font-size: .82em; color: #6b6b76; }
nav#toc ol { padding-left: 1.2em; }
nav#toc li { margin: .35em 0; }
"""

def load_config():
    cfg = {}
    p = os.path.join(HERE, "config.json")
    try:
        with open(p, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    return cfg

def pick(env_key, cfg, key, default=""):
    v = os.environ.get(env_key)
    if v is not None and str(v).strip() != "":
        return str(v)
    v = cfg.get(key)
    if v is not None and str(v).strip() != "":
        return str(v)
    return default

def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def fmt_date(ms):
    if not ms:
        return ""
    try:
        d = datetime.datetime.fromtimestamp(int(ms) / 1000, datetime.timezone.utc)
        return d.strftime("%Y-%m-%d")
    except Exception:
        return ""

def arr(v):
    return v if isinstance(v, list) else []

def tags(texts):
    out = []
    for t in texts:
        t = xesc(str(t)).strip()
        if t:
            out.append(t)
    return out

def main():
    ap = argparse.ArgumentParser(description="fandex EPUB 导出")
    ap.add_argument("--root")
    ap.add_argument("--title")
    ap.add_argument("--out")
    ap.add_argument("--no-font", action="store_true", help="不内嵌字体（体积最小）")
    args = ap.parse_args()

    cfg = load_config()
    root = os.path.abspath(args.root or pick("ANIME_BOOK_ROOT", cfg, "root", ""))
    if not root or not os.path.isdir(root):
        print("项目根不存在：" + str(root), file=sys.stderr)
        return 1
    title = args.title or pick("ANIME_BOOK_TITLE", cfg, "title", "") or "番剧收藏册"
    domain = pick("ANIME_BOOK_DOMAIN", cfg, "domain", "anime")
    credits = pick("ANIME_BOOK_CREDITS", cfg, "credits", "") or "资料来源：公开资料整理"

    base = read_json(os.path.join(root, "anime_base.json"))
    rdir = os.path.join(root, "anime_research")
    research = {}
    if os.path.isdir(rdir):
        for fn in sorted(os.listdir(rdir)):
            if fn.lower().endswith(".json"):
                try:
                    r = read_json(os.path.join(rdir, fn))
                    research[r.get("folder") or fn[:-5]] = r
                except Exception as e:
                    print("跳过坏调研稿 " + fn + "：" + str(e), file=sys.stderr)

    userdata = {}
    ud_path = os.environ.get("ANIME_BOOK_USERDATA") or os.path.join(root, "userdata.json")
    if os.path.isfile(ud_path):
        try:
            userdata = read_json(ud_path).get("works", {}) or {}
        except Exception as e:
            print("userdata 读取失败（本次忽略）：" + str(e), file=sys.stderr)

    def ud_for(folder):
        for w in userdata.values():
            if w and w.get("folder") == folder:
                return w
        return {}

    shows = list(base.values())
    now = datetime.datetime.now().strftime("%Y-%m-%d")
    uid = "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, "fandex:" + title + ":" + str(len(shows))))

    # ---- 图片收集 ----
    images = []          # (zip 路径, 绝对路径, media-type)
    used_img = set()
    by_src = {}
    def add_image(abs_path, stem):
        if not abs_path or not os.path.isfile(abs_path):
            return ""
        key = os.path.normcase(os.path.abspath(abs_path))
        if key in by_src:
            return by_src[key]
        ext = os.path.splitext(abs_path)[1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            return ""
        mt = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
              ".webp": "image/webp", ".gif": "image/gif"}[ext]
        name = stem + ext
        if name in used_img:
            return "images/" + name
        used_img.add(name)
        images.append(("OEBPS/images/" + name, abs_path, mt))
        by_src[key] = "images/" + name
        return "images/" + name

    chapters = []        # (id, 标题, xhtml 正文片段)
    for i, rec in enumerate(shows, 1):
        folder = rec.get("folder") or rec.get("title") or ("作品" + str(i))
        r = research.get(folder, {})
        u = ud_for(folder)
        cid = "ch" + str(i).zfill(2)
        zh = r.get("title_zh") or rec.get("title") or folder
        jp = r.get("title_jp") or (arr(rec.get("titles")) or [""])[0]
        units = r.get("units") or rec.get("units") or []
        eps_total = sum(int(x.get("eps") or 0) for x in units if isinstance(x, dict))
        air0 = fmt_date(rec.get("airdate") or (min([x.get("airdate") for x in units if isinstance(x, dict) and x.get("airdate")] or [0]) or 0))
        cover = ""
        crel = r.get("cover") or ""
        if crel:
            cover = add_image(os.path.join(rdir, crel.replace("/", os.sep)), cid + "-cover")
        if not cover and rec.get("cover"):
            cover = add_image(os.path.join(root, folder, rec.get("cover")), cid + "-cover")
        body = []
        if cover:
            body.append('<img class="art" src="' + cover + '" alt="' + xesc(zh) + ' 海报"/>')
        metas = []
        if units:
            metas.append("收藏 %d 个单元" % len(units))
        if eps_total:
            metas.append("共 %d 集" % eps_total)
        if air0:
            metas.append("首播 " + air0)
        if metas:
            body.append('<p class="meta">' + xesc(" · ".join(metas)) + "</p>")
        gs = tags((r.get("genres") or rec.get("genres") or [])[:6])
        if gs:
            body.append('<p class="chips">' + xesc(" / ".join(gs)) + "</p>")
        site = [x for x in arr(r.get("rating") or rec.get("rating")) if isinstance(x, dict) and x.get("score")]
        if site:
            body.append('<p class="meta">' + xesc("站点评分　" + " · ".join(
                ((str(x.get("site")).upper() + " " if x.get("site") else "") + str(x.get("score"))) for x in site)) + "</p>")
        if isinstance(u.get("score"), dict) and u["score"].get("value"):
            scale = u["score"].get("scale") or 10
            src = u["score"].get("source") or ""
            body.append('<p class="meta">' + xesc("我的评分　" + str(u["score"]["value"]) + " / " + str(scale) + ((" · " + str(src)) if src else "")) + "</p>")
        q = r.get("quote")
        if isinstance(q, str):
            q = {"text": q}
        if isinstance(q, dict) and q.get("text"):
            body.append('<div class="quote">' + xesc(q["text"]) + (('<span class="who">—— ' + xesc(q.get("speaker")) + "</span>") if q.get("speaker") else "") + "</div>")
        if r.get("synopsis"):
            body.append("<h2>剧情简介（无剧透）</h2><p>" + xesc(r["synopsis"]) + "</p>")
        if u.get("comment"):
            body.append("<h2>我的短评</h2><p>" + xesc(u["comment"]) + "</p>")
        if r.get("production"):
            body.append("<h2>制作与声优</h2><p>" + xesc(r["production"]) + "</p>")
        if r.get("music") or r.get("platforms"):
            body.append("<h2>主题歌与观看</h2>")
            if r.get("music"):
                body.append("<p><strong>主题歌</strong>　" + xesc(r["music"]) + "</p>")
            if r.get("platforms"):
                body.append("<p><strong>观看平台</strong>　" + xesc(r["platforms"]) + "</p>")
        if r.get("watch_order"):
            body.append("<h2>补番顺序</h2><p>" + xesc(r["watch_order"]) + "</p>")
        if r.get("source"):
            body.append("<h2>原作情报</h2><p>" + xesc(r["source"]) + "</p>")
        if r.get("update"):
            body.append("<h2>动画更新</h2><p>" + xesc(r["update"]) + "</p>")
        if r.get("status"):
            body.append('<p class="meta">状态　' + xesc(r["status"]) + "</p>")
        ex = r.get("extra")
        if isinstance(ex, dict) and ex.get("text"):
            body.append("<h2>" + xesc(ex.get("title") or "补记") + "</h2><p>" + xesc(ex["text"]) + "</p>")
        if units:
            rows = "".join(
                "<tr><td>" + xesc(x.get("name") or "") + "</td><td>" + (str(x.get("eps")) if x.get("eps") else "—") + "</td><td>" + (fmt_date(x.get("airdate")) or "—") + "</td></tr>"
                for x in units if isinstance(x, dict))
            body.append("<h2>收藏详情</h2><table><thead><tr><th>单元</th><th>集数</th><th>首播</th></tr></thead><tbody>" + rows + "</tbody></table>")
        sops = arr(r.get("unit_synopses"))
        if sops:
            body.append("<h2>剧情（含剧透）</h2>")
            for s in sops:
                if isinstance(s, dict) and s.get("text"):
                    body.append("<p><strong>" + xesc(s.get("name") or "") + "</strong>　" + xesc(s["text"]) + "</p>")
        fr = [f for f in arr(r.get("franchise")) if isinstance(f, dict) and f.get("name")]
        if fr:
            def collected(f):
                for e in arr(u.get("franchise")):
                    if isinstance(e, dict) and (e.get("name") == f.get("name") or (e.get("key") and e.get("key") == f.get("key"))):
                        return bool(e.get("collected"))
                return bool(f.get("collected"))
            miss = [f for f in fr if not collected(f)]
            done = len(fr) - len(miss)
            txt = "系列条目　" + str(done) + " / " + str(len(fr)) + " 条"
            if miss:
                txt += "　待补：" + "、".join(((f.get("kind") or "") + " " + str(f.get("name"))).strip() for f in miss)
            else:
                txt += "　已收全"
            body.append('<p class="meta">' + xesc(txt) + "</p>")
        head = "<h1>" + xesc(zh) + (('<span class="jp">' + xesc(jp) + "</span>") if jp else "") + "</h1>"
        chapters.append((cid, zh, head + "".join(body)))

    # ---- XHTML 组装 ----
    def page(title_txt, inner, extra_attrs=""):
        return ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<!DOCTYPE html>\n'
                '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
                'xml:lang="zh-CN" lang="zh-CN">\n<head><meta charset="utf-8"/><title>' + xesc(title_txt) +
                '</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body' + extra_attrs + '>\n' +
                inner + "\n</body>\n</html>\n")

    files = {}   # zip 路径 -> 文本

    # 封面
    cover_img = ""
    if shows:
        r0 = research.get(shows[0].get("folder") or "", {})
        rel = r0.get("cover") or ""
        if rel:
            cover_img = add_image(os.path.join(rdir, rel.replace("/", os.sep)), "cover")
    if cover_img:
        files["OEBPS/cover.xhtml"] = page("封面", '<div class="cover-page"><img src="' + cover_img + '" alt="封面"/></div>')

    # 目录（nav）
    toc_items = ['<li><a href="title.xhtml">' + xesc(title) + "</a></li>"]
    for cid, zh, _ in chapters:
        toc_items.append('<li><a href="' + cid + '.xhtml">' + xesc(zh) + "</a></li>")
    toc_items.append('<li><a href="colophon.xhtml">版权与来源</a></li>')
    files["OEBPS/nav.xhtml"] = page("目录",
        '<nav epub:type="toc" id="toc"><h1>目录</h1><ol>' + "".join(toc_items) + "</ol></nav>")

    # 书名页 + 总览
    tot_units = sum(len((research.get(s.get("folder") or "", {}).get("units") or s.get("units") or [])) for s in shows)
    tot_eps = sum(sum(int(x.get("eps") or 0) for x in (research.get(s.get("folder") or "", {}).get("units") or s.get("units") or []) if isinstance(x, dict)) for s in shows)
    overview = ['<h1 class="center">' + xesc(title) + "</h1>",
                '<p class="center meta">' + xesc("收录 " + str(len(shows)) + " 部 · " + str(tot_units) + " 个单元 · 共 " + str(tot_eps) + " 集") + "</p>",
                '<p class="center small">' + xesc("导出日期 " + now) + "</p>"]
    if cover_img:
        overview.append('<img class="art" src="' + cover_img + '" alt="封面"/>')
    overview.append("<h2>收录作品</h2><table><tbody>" + "".join(
        "<tr><td>" + xesc(c[1]) + "</td></tr>" for c in chapters) + "</tbody></table>")
    files["OEBPS/title.xhtml"] = page(title, "".join(overview))

    for cid, zh, inner in chapters:
        files["OEBPS/" + cid + ".xhtml"] = page(zh, inner)

    files["OEBPS/colophon.xhtml"] = page("版权与来源",
        "<h1>版权与来源</h1>"
        "<p>" + xesc(credits) + "</p>"
        "<p class='small'>本册为非官方粉丝作品，仅供个人收藏与学习交流；作品、角色与海报版权归各自权利人所有，请勿用于商业用途。</p>"
        "<p class='small'>由 fandex（番剧收藏册引擎）导出 · " + xesc(now) + "</p>")

    # ---- 内嵌字体（子集）----
    font_zip = None
    binaries = {}
    # 字体来源与 PDF 一致：环境变量 > config.json 的 fonts.regular > 项目根 fonts/ 下的霞鹜文楷
    font_src = os.environ.get("ANIME_BOOK_FONT_REGULAR") or ""
    if not font_src and isinstance(cfg.get("fonts"), dict):
        font_src = cfg["fonts"].get("regular") or ""
    if not font_src:
        font_src = os.path.join(root, "fonts", "LXGWWenKai-Regular.ttf")
    if not args.no_font and os.path.isfile(font_src):
        try:
            text = "".join(re.sub(r"<[^>]+>", "", v) for k, v in files.items() if k.endswith(".xhtml"))
            chars = "".join(sorted(set(text)))
            with tempfile.TemporaryDirectory() as td:
                cf = os.path.join(td, "chars.txt")
                of = os.path.join(td, "sub.ttf")
                with open(cf, "w", encoding="utf-8") as f:
                    f.write(chars)
                subprocess.run([sys.executable, "-m", "fontTools.subset", font_src,
                                "--text-file=" + cf, "--output-file=" + of,
                                "--layout-features=*", "--no-hinting"],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.isfile(of) and os.path.getsize(of) > 0:
                    font_zip = "sub"
                    files["OEBPS/fonts/wenkai-sub.ttf"] = None   # 占位，二进制稍后写
                    with open(of, "rb") as f:
                        binaries["OEBPS/fonts/wenkai-sub.ttf"] = f.read()
        except Exception as e:
            print("字体子集失败，改为不内嵌：" + str(e), file=sys.stderr)
            font_zip = None
            files.pop("OEBPS/fonts/wenkai-sub.ttf", None)

    files["OEBPS/style.css"] = CSS
    if "OEBPS/fonts/wenkai-sub.ttf" in files:
        files["OEBPS/style.css"] = '@font-face { font-family: "LXGW WenKai"; src: url("fonts/wenkai-sub.ttf"); font-weight: normal; }\n' + CSS

    # ---- OPF ----
    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="css" href="style.css" media-type="text/css"/>']
    spine = []
    if cover_img:
        manifest.append('<item id="coverx" href="cover.xhtml" media-type="application/xhtml+xml"/>')
        manifest.append('<item id="cover-img" href="' + cover_img + '" media-type="image/jpeg" properties="cover-image"/>')
        spine.append("coverx")
    manifest.append('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>')
    spine.append("title")
    for cid, zh, _ in chapters:
        manifest.append('<item id="' + cid + '" href="' + cid + '.xhtml" media-type="application/xhtml+xml"/>')
        spine.append(cid)
    manifest.append('<item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>')
    spine.append("colophon")
    for zp, ap, mt in images:
        if zp == "OEBPS/" + cover_img:
            continue
        manifest.append('<item id="img-' + os.path.basename(zp) + '" href="' + zp[len("OEBPS/"):] + '" media-type="' + mt + '"/>')
    if "OEBPS/fonts/wenkai-sub.ttf" in files:
        manifest.append('<item id="font" href="fonts/wenkai-sub.ttf" media-type="font/ttf"/>')

    opf = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">\n'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
           '<dc:identifier id="bookid">' + uid + "</dc:identifier>\n"
           "<dc:title>" + xesc(title) + "</dc:title>\n"
           "<dc:language>zh-CN</dc:language>\n"
           "<dc:creator>" + xesc("fandex") + "</dc:creator>\n"
           '<meta property="dcterms:modified">' + datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "</meta>\n"
           + ('<meta name="cover" content="cover-img"/>\n' if cover_img else "")
           + "</metadata>\n<manifest>\n" + "\n".join(manifest) + "\n</manifest>\n<spine>\n"
           + "\n".join('<itemref idref="' + s + '"/>' for s in spine) + "\n</spine>\n</package>\n")
    files["OEBPS/content.opf"] = opf

    out = args.out or os.path.join(root, "anime_build", title + ".epub")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    container = ('<?xml version="1.0" encoding="utf-8"?>\n'
                 '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n'
                 "</container>\n")

    with zipfile.ZipFile(out, "w") as z:
        zi = zipfile.ZipInfo("mimetype")
        zi.compress_type = zipfile.ZIP_STORED
        z.writestr(zi, "application/epub+zip")
        z.writestr("META-INF/container.xml", container, zipfile.ZIP_DEFLATED)
        for k in sorted(files):
            v = files[k]
            if v is None:
                z.writestr(k, binaries[k], zipfile.ZIP_DEFLATED)
            else:
                z.writestr(k, v, zipfile.ZIP_DEFLATED)
    for zp, ap, mt in images:
        with zipfile.ZipFile(out, "a") as z:
            z.write(ap, zp, zipfile.ZIP_DEFLATED)

    size = os.path.getsize(out)
    print("EPUB -> " + out + "（" + str(round(size / 1024.0, 1)) + " KB，"
          + str(len(chapters)) + " 章，图片 " + str(len(images)) + " 张，字体"
          + ("已内嵌" if "OEBPS/fonts/wenkai-sub.ttf" in files else "未内嵌") + "）")

    deliver = os.path.join(root, "_deliver")
    if os.path.isdir(deliver):
        import shutil
        dst = os.path.join(deliver, title + ".epub")
        shutil.copyfile(out, dst)
        print("已复制 -> " + dst)
    return 0

if __name__ == "__main__":
    sys.exit(main())

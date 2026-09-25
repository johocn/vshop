# -*- coding: utf-8 -*-
"""验证本地使用的线上手册 op-38「多人协同盘库」渲染（手机视口 390x844, dpr2）。
用法: python _e2e/_verify_manual_op38.py [local|live]
"""
import os
import sys
from playwright.sync_api import sync_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else "local"
HTML = r"d:\zhao\vshop\web-admin\src\static\manual\index.html"
URL = "file:///" + HTML.replace("\\", "/") if MODE == "local" else "https://e.joho.cn/guanli/static/manual/index.html"
OUT = r"d:\zhao\vshop\web-admin\src\static\manual\shots"
os.makedirs(OUT, exist_ok=True)

EXPECT_IMGS = 11

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(800)

    ids = page.evaluate("(window.CHAPTERS||[]).map(function(c){return c.id;})")
    dup = sorted(set([i for i in ids if ids.count(i) > 1]))
    print("total chapters:", len(ids or []), "| op-38 in CHAPTERS:", "op-38" in (ids or []))
    print("duplicate ids:", dup if dup else "无")

    page.evaluate("openChapter('op-38')")
    page.wait_for_timeout(1200)
    page.evaluate("renderToc()")
    page.wait_for_timeout(300)
    toc_text = page.locator("#tocList").inner_text()
    toc_has = "多人协同盘库" in toc_text
    toc_items = page.evaluate(
        "Array.prototype.map.call(document.querySelectorAll('#tocList .toc-item'),"
        "function(e){return e.dataset.id+'|'+e.textContent;})"
    )
    print("TOC contains 多人协同盘库:", toc_has, "| toc items:", len(toc_items))
    hit = [t for t in toc_items if "op-38" in t]
    print("TOC entry op-38:", hit)
    title = page.locator("#readerContent h2").inner_text()
    imgs = page.locator("#readerContent img")
    n = imgs.count()
    broken = []
    for i in range(n):
        el = imgs.nth(i)
        w = el.evaluate("function(e){return e.naturalWidth;}")
        if not w:
            broken.append(el.get_attribute("src"))
    heads = page.evaluate(
        "Array.prototype.map.call(document.querySelectorAll('#readerContent h3'),function(h){return h.textContent;})"
    )
    print("chapter title:", title)
    print("images:", n, "| broken:", broken)
    print("h3 sections:", heads)
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(OUT, "_manual_op38_%s_390.png" % MODE))
    page.evaluate("openChapter('op-38');window.scrollTo(0,900)")
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, "_manual_op38_%s_390_b.png" % MODE))

    ok = (
        "op-38" in (ids or [])
        and toc_has
        and "多人协同盘库" in title
        and n >= EXPECT_IMGS
        and not broken
        and not errors
    )
    print("console/page errors:", errors if errors else "无")
    print("RESULT:", "PASS" if ok else "FAIL")
    b.close()
# -*- coding: utf-8 -*-
"""验证线上运营手册 op-20 章节渲染（手机视口 390x844, dpr2）。"""
import os
from playwright.sync_api import sync_playwright

URL = "https://e.joho.cn/guanli/static/manual/index.html"
OUT = r"d:\zhao\vshop\web-admin\src\static\manual\shots"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle", timeout=40000)
    page.wait_for_timeout(800)
    ids = page.evaluate("(window.CHAPTERS||[]).map(function(c){return c.id;})")
    print("chapters:", ids)
    ok = "op-20" in (ids or [])
    page.evaluate("openChapter('op-20')")
    page.wait_for_timeout(1000)
    title = page.locator("#readerContent h2").inner_text()
    print("chapter title:", title)
    imgs = page.locator("#readerContent img").count()
    print("images in chapter:", imgs)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(OUT, "s05_manual_op20_live.png"))
    print("RESULT:", "PASS" if (ok and "op-20" in title and imgs >= 4) else "FAIL", "| errors:", errors if errors else "无")
    b.close()

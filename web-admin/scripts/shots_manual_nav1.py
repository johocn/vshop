# -*- coding: utf-8 -*-
"""手册新章节渲染截图（390x844 dpr2）"""
import time
from playwright.sync_api import sync_playwright

URL = 'https://e.joho.cn/guanli/static/manual/index.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(URL, wait_until='networkidle', timeout=40000)
    page.evaluate("openChapter('op-4b')")
    time.sleep(1.5)
    print('title:', page.evaluate("document.querySelector('#readerContent h2').innerText"))
    print('imgs:', page.evaluate("[...document.querySelectorAll('#readerContent img')].map(i => i.naturalWidth)"))
    page.screenshot(path='e2e-shots/manual-nav1-chapter-390x844.png')
    page.evaluate('window.scrollTo(0, 900)')
    time.sleep(1.5)
    page.screenshot(path='e2e-shots/manual-nav1-chapter-shots-390x844.png')
    b.close()
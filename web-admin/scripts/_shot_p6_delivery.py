# -*- coding: utf-8 -*-
"""P6 配送体系 P1/P2 加固取证：催单告警/看板正常渲染（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p6-delivery"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE + "pages/login/index")
    pg.wait_for_timeout(2500)
    inputs = pg.locator("input")
    inputs.nth(0).fill(USER)
    inputs.nth(1).fill(PWD)
    pg.locator("button, .login-btn, uni-button").first.click()
    pg.wait_for_timeout(3000)

    pg.goto(BASE + "pages/campus/dispatch")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\01-dispatch-board.png")
    body = pg.inner_text("body")
    print("dispatch:", "调度" in body, "| 顾客催单:", "顾客催单" in body)

    pg.goto(BASE + "pages/campus/stats")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\02-stats.png")

    pg.goto(BASE + "pages/campus/merchant")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\03-merchant.png")
    browser.close()

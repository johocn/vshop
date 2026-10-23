# -*- coding: utf-8 -*-
"""P5 终态/口径修复取证：调度墙无终态单 + 商家台无送达残留 + 统计口径（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p5-delivery"
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

    # 1) 调度中心：终态单（已送达/取消/无人接）不再进墙
    pg.goto(BASE + "pages/campus/dispatch")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\01-dispatch-terminal-clean.png")
    dbody = pg.inner_text("body")
    print("dispatch loaded:", "调度" in dbody, "| 已送达:", "已送达" in dbody)

    # 2) 商家工作台：送达单不再挂在「配送中」
    pg.goto(BASE + "pages/campus/merchant")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\02-merchant-delivered-clean.png")
    print("merchant loaded:", "配送中" in pg.inner_text("body"))

    # 3) 配送统计：只计校园履约单
    pg.goto(BASE + "pages/campus/stats")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\03-stats-scope.png")
    print("stats loaded:", "单量" in pg.inner_text("body"))

    browser.close()

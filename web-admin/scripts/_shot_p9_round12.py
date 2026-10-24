# -*- coding: utf-8 -*-
"""第十二轮资金落账与退款兜底取证：调度中心/校园配置/商家接单正常渲染（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p9-round12"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

os.makedirs(OUT, exist_ok=True)

launch = {"headless": True}
if os.path.exists(CHROME):
    launch["executable_path"] = CHROME

with sync_playwright() as p:
    browser = p.chromium.launch(**launch)
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
    pg.screenshot(path=f"{OUT}\\01-dispatch.png", full_page=True)
    print("dispatch ok:", "调度" in pg.inner_text("body"))

    pg.goto(BASE + "pages/campus/config")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\02-campus-config.png", full_page=True)
    print("config ok:", "配置" in pg.inner_text("body"))

    pg.goto(BASE + "pages/campus/merchant")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\03-merchant.png", full_page=True)
    print("merchant ok:", "接单" in pg.inner_text("body"))
    browser.close()

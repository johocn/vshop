# -*- coding: utf-8 -*-
"""第十八轮配送体系 P3 收口取证：配送数据看板 + 店铺配置（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p9-round18"
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

    pg.goto(BASE + "pages/campus/stats")
    pg.wait_for_timeout(7000)
    pg.screenshot(path=f"{OUT}\\01-delivery-stats.png", full_page=True)
    body = pg.inner_text("body")
    print("stats ok:", ("店铺" in body or "准点" in body or "单量" in body), repr(body[:120]))

    pg.goto(BASE + "pages/campus/config")
    pg.wait_for_timeout(7000)
    pg.screenshot(path=f"{OUT}\\02-store-config.png", full_page=True)
    body2 = pg.inner_text("body")
    print("config ok:", ("赔付" in body2 or "配置" in body2), repr(body2[:120]))
    browser.close()

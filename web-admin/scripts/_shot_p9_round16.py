# -*- coding: utf-8 -*-
"""第十六轮配送体系收口取证：待付款超时任务页 / 订单列表（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p9-round16"
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

    pg.goto(BASE + "pages/order/payment-timeout/index")
    pg.wait_for_timeout(7000)
    pg.screenshot(path=f"{OUT}\\01-payment-timeout.png", full_page=True)
    body = pg.inner_text("body")
    print("payment-timeout ok:", ("超时" in body or "任务" in body), "| 已执行" , ("已执行" in body))

    pg.goto(BASE + "pages/order/list/index")
    pg.wait_for_timeout(7000)
    pg.screenshot(path=f"{OUT}\\02-order-list.png", full_page=True)
    print("order list ok:", "订单" in pg.inner_text("body"))
    browser.close()

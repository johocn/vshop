# -*- coding: utf-8 -*-
"""商家接单 + 调度中心页面手机视口截图（390x844 dpr=2）。"""
import time
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

ROUTES = [
    ("pages/campus/merchant", "wa-campus-merchant.png"),
    ("pages/campus/dispatch", "wa-campus-dispatch.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    # 登录
    pg.goto(BASE + "pages/login/index")
    pg.wait_for_timeout(2500)
    inputs = pg.locator("input")
    inputs.nth(0).fill(USER)
    inputs.nth(1).fill(PWD)
    pg.locator("button, .login-btn, uni-button").first.click()
    pg.wait_for_timeout(3000)
    print("after login url:", pg.url[:80])
    for route, fname in ROUTES:
        pg.goto(BASE + route)
        pg.wait_for_timeout(6000)  # 等 GraphQL 数据
        pg.screenshot(path=f"{OUT}\\{fname}", full_page=False)
        print("shot", fname, "| body has:", pg.inner_text("body")[:80].replace("\n", " "))
    browser.close()

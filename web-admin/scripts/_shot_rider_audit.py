# -*- coding: utf-8 -*-
"""骑手入驻审核页手机视口截图（390x844 dpr=2）。"""
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

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
    pg.goto(BASE + "pages/rider/audit/index")
    pg.wait_for_timeout(6000)
    body = pg.inner_text("body")
    pg.screenshot(path=f"{OUT}\\wa-rider-audit.png", full_page=True)
    print("has tabs:", "审核中" in body, "| has approved tab:", "已通过" in body, "| has suspended tab:", "已暂停" in body)
    print("empty pending:", "暂无待审核申请" in body)
    browser.close()

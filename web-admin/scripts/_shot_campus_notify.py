# -*- coding: utf-8 -*-
"""校园配置页（通知模板区块）手机视口截图（390x844 dpr=2）。"""
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
    pg.goto(BASE + "pages/campus/config")
    pg.wait_for_timeout(6000)
    # 展开第一张店铺卡片
    pg.locator(".head").first.click()
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    # 滚到页尾让通知模板区块可见
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(1000)
    pg.screenshot(path=f"{OUT}\\wa-campus-config-notify.png", full_page=True)
    print("has notifySection:", "节点通知模板" in body, "| has notifyAccepted:", "商家已接单" in body)
    browser.close()

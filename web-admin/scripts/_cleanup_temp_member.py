# -*- coding: utf-8 -*-
"""清理生产中的临时受限测试账号（redeemscope-test@example.com）。

截图脚本因未能读到初始密码而跳过清理，故单独补跑一次移除。
"""
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5280/guanli/#/"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER = "superadmin"
PWD = "z123123"
CHANNEL = "cnx87ezvmjx8nn3bth6c"
EMAIL = "redeemscope-test@example.com"


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                              has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    try:
        pg.goto(BASE + "pages/login/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_selector('input[type="text"]', timeout=30000)
        pg.fill('input[type="text"]', USER)
        pg.fill('input[type="password"]', PWD)
        pg.click("text=登 录")
        time.sleep(4)
        pg.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL)
        pg.goto(BASE + "pages/platform/members/index", wait_until="networkidle", timeout=60000)
        wait_ready(pg, ["本租户人员"], tries=20)

        rows = pg.locator(".item").filter(has_text=EMAIL)
        print("rows matching:", rows.count())
        if rows.count():
            rows.first.locator(".link").filter(has_text="移除").click()
            time.sleep(1.5)
            pg.locator("text=确定").first.click()
            time.sleep(3.5)
            body = pg.inner_text("body")
            print("still present after remove:", EMAIL in body)
        else:
            print("not found (already clean)")
    finally:
        browser.close()
# -*- coding: utf-8 -*-
"""校验：临时受限测试账号是否已从生产清理。"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5280/guanli/#/"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    pg = ctx.new_page()
    bodies = []
    pg.on("response", lambda r: bodies.append(r.text()) if "admin-api" in r.url and r.request.method == "POST" else None)
    pg.goto(BASE + "pages/login/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_selector('input[type="text"]', timeout=30000)
    pg.fill('input[type="text"]', "superadmin")
    pg.fill('input[type="password"]', "z123123")
    pg.click("text=登 录")
    time.sleep(3)
    pg.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", "cnx87ezvmjx8nn3bth6c")
    bodies.clear()
    pg.goto(BASE + "pages/platform/members/index", wait_until="networkidle", timeout=60000)
    time.sleep(5)
    found = False
    for b in bodies:
        if "tenantMembers" in b:
            print(b[:900])
            found = "redeemscope-test" in b
    print("TEMP MEMBER STILL PRESENT:", found)
    browser.close()
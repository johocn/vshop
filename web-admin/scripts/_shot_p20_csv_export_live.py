# -*- coding: utf-8 -*-
"""P3-2 线上核验：经营设置页「导出 CSV（近 30 日）」真实登录 + 真实数据导出（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p20-csv-export"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

os.makedirs(OUT, exist_ok=True)

launch = {"headless": True}
if os.path.exists(CHROME):
    launch["executable_path"] = CHROME

with sync_playwright() as p:
    browser = p.chromium.launch(**launch)
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844}, device_scale_factor=2,
        locale="zh-CN", timezone_id="Asia/Shanghai", accept_downloads=True,
    )
    pg = ctx.new_page()
    pg.goto(BASE + "pages/login/index")
    pg.wait_for_timeout(2500)
    inputs = pg.locator("input")
    inputs.nth(0).fill(USER)
    inputs.nth(1).fill(PWD)
    pg.locator("button, .login-btn, uni-button").first.click()
    pg.wait_for_timeout(3000)

    pg.goto(BASE + "pages/campus/store-settings")
    pg.wait_for_timeout(6000)
    body = pg.inner_text("body")
    print("page has export:", "导出 CSV" in body)
    pg.evaluate("document.querySelector('.export')?.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, "03-live-store-settings-export.png"), full_page=True)

    with pg.expect_download(timeout=20000) as dl_info:
        pg.click(".export-btn")
    dl = dl_info.value
    csv_path = os.path.join(OUT, "03-live-revenue-last30d.csv")
    dl.save_as(csv_path)
    text = open(csv_path, encoding="utf-8-sig").read()
    rows = text.split("\r\n")
    print("download:", dl.suggested_filename, "rows:", len(rows))
    print("head:", rows[:2])
    print("tail:", rows[-1:])
    browser.close()

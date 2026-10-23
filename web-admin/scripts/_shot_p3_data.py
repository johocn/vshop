# -*- coding: utf-8 -*-
"""P3 数据卫生：校验校园配置页新增「改址成功模板ID」并截手机视口图（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p3-cleanup"
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
    pg.goto(BASE + "pages/campus/config")
    pg.wait_for_timeout(6000)
    pg.locator(".head", has_text="canteen-a").first.click()
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}\\01-campus-config-address-notify.png", full_page=True)
    # 定位到「改址成功模板ID」输入项并截当前视口（便于手册展示）
    target = pg.get_by_text("改址成功模板ID").first
    target.scroll_into_view_if_needed()
    pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}\\02-address-changed-input.png")
    print("has notifySection:", "节点通知模板" in body, "| has addressChanged:", "改址成功模板ID" in body)
    browser.close()

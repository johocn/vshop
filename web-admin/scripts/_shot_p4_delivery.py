# -*- coding: utf-8 -*-
"""P4 配送体系补漏：赔付回扫窗口 + 商家拒单 + 调度权限提示（390x844 dpr=2）。"""
import os
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
OUT = r"d:\zhao\vshop\docs\screenshots\waimai\p4-delivery"
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

    # 1) 配置页：赔付回扫窗口（不保存，避免脏配置）
    pg.goto(BASE + "pages/campus/config")
    pg.wait_for_timeout(6000)
    pg.locator(".head", has_text="canteen-a").first.click()
    pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    if "赔付回扫窗口（小时）" not in body:
        # 赔付未开启时字段隐藏：仅切换开关展示，不点保存
        pg.locator(".pmode", has_text="未开启赔付").first.click()
        pg.wait_for_timeout(800)
    target = pg.get_by_text("赔付回扫窗口（小时）").first
    target.scroll_into_view_if_needed()
    pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}\\01-timeout-window.png")
    print("config has window:", "赔付回扫窗口（小时）" in pg.inner_text("body"))

    # 2) 商家工作台：拒单按钮（有待接/备餐订单时才可见）
    pg.goto(BASE + "pages/campus/merchant")
    pg.wait_for_timeout(6000)
    mbody = pg.inner_text("body")
    pg.screenshot(path=f"{OUT}\\02-merchant-board.png")
    print("merchant has reject:", "拒单" in mbody, "| pending:", "待接单" in mbody)

    # 3) 调度中心：超级管理员有写权限，按钮正常可见
    pg.goto(BASE + "pages/campus/dispatch")
    pg.wait_for_timeout(6000)
    pg.screenshot(path=f"{OUT}\\03-dispatch.png")
    print("dispatch has assign:", "强派" in pg.inner_text("body"))

    browser.close()

# -*- coding: utf-8 -*-
"""P4：商家工作台「拒单」按钮 + 原因选择 + 二次确认（390x844 dpr=2，canteen-a）。"""
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

    pg.evaluate("""() => {
        localStorage.setItem('wa_channel_code', 'canteen-a');
        localStorage.setItem('wa_channel_token', 'canteen-a-token');
    }""")

    pg.goto(BASE + "pages/campus/merchant")
    pg.wait_for_timeout(6000)
    mbody = pg.inner_text("body")
    for _ in range(3):
        if "拒单" in mbody:
            break
        pg.reload()
        pg.wait_for_timeout(6000)
        mbody = pg.inner_text("body")
    pg.screenshot(path=f"{OUT}\\02-merchant-board.png")
    print("merchant has reject:", "拒单" in mbody, "| has order:", "QYGNF39P1VLE58LP" in mbody)

    # 原因选择浮层
    if "拒单" not in mbody:
        print("skip reject dialog: button not found")
        browser.close()
        raise SystemExit(0)
    pg.get_by_text("拒单", exact=True).last.click()
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}\\04-reject-reasons.png")
    print("reasons:", "商品售罄" in pg.inner_text("body"))
    pg.get_by_text("商品售罄", exact=True).last.click()
    pg.wait_for_timeout(1200)
    # 二次确认弹层（只截取消，绝不点确认）
    pg.screenshot(path=f"{OUT}\\05-reject-confirm.png")
    cbody = pg.inner_text("body")
    print("confirm modal:", "确认拒单" in cbody)
    for t in ["取消", "Cancel"]:
        loc = pg.get_by_text(t, exact=True)
        if loc.count():
            loc.last.click()
            break
    pg.wait_for_timeout(800)
    browser.close()

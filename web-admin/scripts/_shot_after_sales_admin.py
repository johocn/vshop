# -*- coding: utf-8 -*-
"""售后页面优化 后台(web-admin H5)交付截图（390x844, dpr=2）。

产物：docs/superpowers/manual/aftersales-page-optimization/shots/
  a-list.png / a-detail.png

运行：python scripts/_shot_after_sales_admin.py
前置：web-admin 本地 dev 已起在 http://localhost:5280/guanli/
      （`$env:VITE_API_URL="https://e.joho.cn"; npm run dev:h5`，注意 base 是 /guanli/）。

数据说明：售后工单是**渠道维度**数据，C 端 QA 账号产生的工单都落在渠道
cnx87ezvmjx8nn3bth6c（youShop 商城），故登录后直接把 localStorage 的
wa_channel_token 设成该渠道，避免「默认选中别的店 → 列表空白」。

注：本脚本是本地探针，不入库（vshop 仓库 .gitignore 未覆盖 _shot_*，故保持未跟踪状态）。
"""
import os
import re
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5280/guanli/#/"
ROUTE_LIST = "pages/after-sale/list/index"
ROUTE_DETAIL = "pages/after-sale/detail/index"
OUT = r"d:\zhao\nshop\docs\superpowers\manual\aftersales-page-optimization\shots"
USER = "superadmin"
PWD = "z123123"
CHANNEL_TOKEN = "cnx87ezvmjx8nn3bth6c"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"


def dismiss_modal(page):
    """关掉 uni 的模态弹层（若出现）。"""
    try:
        page.evaluate(
            'document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("取消"))b.click()})'
        )
        time.sleep(0.6)
    except Exception:
        pass


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


def login(pg):
    pg.goto(BASE + "pages/login/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_selector('input[type="text"]', timeout=30000)
    pg.fill('input[type="text"]', USER)
    pg.fill('input[type="password"]', PWD)
    pg.click("text=登 录")
    try:
        pg.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    time.sleep(3)
    dismiss_modal(pg)


with sync_playwright() as p:
    os.makedirs(OUT, exist_ok=True)
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        locale="zh-CN",
    )
    pg = ctx.new_page()
    try:
        login(pg)
        print("login url:", pg.url)

        # 固定渠道，保证列表里有 C 端刚产生的工单
        pg.evaluate(
            "t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL_TOKEN
        )
        print("channel token:", pg.evaluate("localStorage.getItem('wa_channel_token')"))

        pg.goto(BASE + ROUTE_LIST, wait_until="networkidle", timeout=60000)
        body = wait_ready(pg, ["待处理", "全部", "暂无售后"])
        pg.wait_for_timeout(1500)
        dismiss_modal(pg)
        raw = re.findall(r"afterSale\.[a-zA-Z.]+", body)
        pg.screenshot(path=os.path.join(OUT, "a-list.png"))
        print("a-list   | 裸key:", raw)

        # 进入详情：卡片整体可点（goDetail），点第一张卡片
        cards = pg.locator(".card, .item, .as-card")
        print("card count:", cards.count())
        if cards.count():
            cards.first.click()
        else:
            pg.goto(BASE + ROUTE_DETAIL, wait_until="networkidle", timeout=60000)
        time.sleep(3)
        body = wait_ready(pg, ["处理进度", "售后单号", "未找到"], tries=20)
        pg.wait_for_timeout(1200)
        raw = re.findall(r"afterSale\.[a-zA-Z.]+", body)
        pg.screenshot(path=os.path.join(OUT, "a-detail.png"))
        print("a-detail | url:", pg.url)
        print("a-detail | 裸key:", raw)
    finally:
        browser.close()
    print("\n[DONE]", OUT)
    for f in sorted(os.listdir(OUT)):
        print("  ", f)

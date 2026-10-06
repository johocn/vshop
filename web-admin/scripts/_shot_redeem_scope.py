# -*- coding: utf-8 -*-
"""到店核销「租户归属 + 销售员配送档案范围」交付截图（390x844, dpr=2）。

产物（docs/superpowers/manual/coupon/shots/）：
  scope-01-members-role-scope.png   人员授权：角色弹层内「可核销配送档案」多选
  scope-02-restricted-empty.png     受限核销员：待核销列表空态（默认拒绝）
  scope-03-owner-bills.png          店主/超管：到店买单全量流水

运行：python scripts/_shot_redeem_scope.py
前置：web-admin 本地 dev 已起在 http://localhost:5280/guanli/
      （$env:VITE_API_URL="https://e.joho.cn"; npm run dev:h5，base=/guanli/）
"""
import os
import re
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5280/guanli/#/"
OUT = r"d:\zhao\nshop\docs\superpowers\manual\coupon\shots"
USER = "superadmin"
PWD = "z123123"
CHANNEL_TOKEN = "cnx87ezvmjx8nn3bth6c"
TEST_EMAIL = "redeemscope-test@example.com"
TEST_PWD = "Test@12345"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"


def dismiss_modal(pg):
    try:
        pg.evaluate(
            'document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("取消"))b.click()})'
        )
        time.sleep(0.5)
    except Exception:
        pass


def set_channel(pg):
    pg.evaluate("t => { localStorage.setItem('wa_channel_token', t); }", CHANNEL_TOKEN)


def login(pg, user, pwd):
    pg.goto(BASE + "pages/login/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_selector('input[type="text"]', timeout=30000)
    pg.fill('input[type="text"]', user)
    pg.fill('input[type="password"]', pwd)
    pg.click("text=登 录")
    try:
        pg.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    time.sleep(3)
    dismiss_modal(pg)


def logout(pg):
    pg.evaluate("() => localStorage.clear()")
    pg.goto(BASE + "pages/login/index", wait_until="networkidle", timeout=60000)
    time.sleep(1.5)


def wait_ready(pg, texts, tries=25):
    body = ""
    for _ in range(tries):
        pg.wait_for_timeout(1000)
        body = pg.inner_text("body")
        if any(t in body for t in texts):
            return body
    return body


def pick_role(pg, name):
    """在角色多选弹层里勾选指定名称的角色。"""
    pg.locator(".pick-item-name").filter(has_text=name).first.click()
    time.sleep(0.6)


with sync_playwright() as p:
    os.makedirs(OUT, exist_ok=True)
    browser = p.chromium.launch(headless=True, executable_path=CHROME)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale="zh-CN")
    pg = ctx.new_page()
    created = False
    try:
        # ---------- 1. 人员授权：角色弹层含「可核销配送档案」 ----------
        login(pg, USER, PWD)
        set_channel(pg)
        pg.goto(BASE + "pages/platform/members/index", wait_until="networkidle", timeout=60000)
        wait_ready(pg, ["本租户人员", "添加人员"])
        pg.locator(".item .link").filter(has_text="角色").first.click()
        wait_ready(pg, ["分配角色"], tries=8)
        pick_role(pg, "销售")
        body = wait_ready(pg, ["可核销配送档案"], tries=10)
        pg.wait_for_timeout(900)
        pg.screenshot(path=os.path.join(OUT, "scope-01-members-role-scope.png"))
        print("scope-01 saved | scope block:", "可核销配送档案" in body)
        pg.locator(".pop .btn.ghost").first.click()  # 取消，不落库
        time.sleep(1)

        # ---------- 2. 受限核销员：列表空态 ----------
        pg.locator(".head-btn").first.click()
        wait_ready(pg, ["添加人员", "请选择角色"], tries=8)
        pg.locator(".pop input").first.fill(TEST_EMAIL)
        pg.locator(".pick-trigger").first.click()
        time.sleep(1)
        pick_role(pg, "销售")
        pg.locator(".pop .btn").last.click()  # 确定
        time.sleep(1)
        pg.locator(".pop .btn").last.click()  # 添加
        time.sleep(3)
        pwd_txt = ""
        try:
            pwd_txt = pg.locator(".pwd-val.mono").first.inner_text(timeout=6000)
        except Exception:
            pass
        print("temp member created, initial pwd:", repr(pwd_txt))
        created = bool(pwd_txt)
        if created:
            pg.locator(".done").first.click()
            time.sleep(1)

        logout(pg)
        login(pg, TEST_EMAIL, pwd_txt or TEST_PWD)
        if "change-password" in pg.url:
            print("forced password change page")
            fields = pg.locator('input[type="password"]')
            fields.nth(fields.count() - 2).fill(TEST_PWD)
            fields.nth(fields.count() - 1).fill(TEST_PWD)
            pg.locator(".chg .btn").first.click()
            time.sleep(4)
        print("temp login url:", pg.url)
        set_channel(pg)
        pg.goto(BASE + "pages/pickup/redeem/index", wait_until="networkidle", timeout=60000)
        body = wait_ready(pg, ["待核销", "授权", "配送档案", "核销"], tries=20)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(OUT, "scope-02-restricted-empty.png"))
        raw = re.findall(r"pickupRedeem\.[a-zA-Z.]+", body)
        print("scope-02 saved | url:", pg.url, "| rawkeys:", raw)

        # ---------- 3. 店主/超管全量流水 ----------
        logout(pg)
        login(pg, USER, PWD)
        set_channel(pg)
        pg.goto(BASE + "pages/in-store/bills/index", wait_until="networkidle", timeout=60000)
        body = wait_ready(pg, ["流水", "汇总", "金额", "核销"], tries=20)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(OUT, "scope-03-owner-bills.png"))
        raw = re.findall(r"inStoreBills\.[a-zA-Z.]+", body)
        print("scope-03 saved | url:", pg.url, "| rawkeys:", raw)
    finally:
        if created:
            try:
                logout(pg)
                login(pg, USER, PWD)
                set_channel(pg)
                pg.goto(BASE + "pages/platform/members/index", wait_until="networkidle", timeout=60000)
                wait_ready(pg, ["本租户人员"], tries=15)
                row = pg.locator(".item").filter(has_text=TEST_EMAIL).first
                row.locator(".link").filter(has_text="移除").click()
                time.sleep(1)
                pg.locator("text=确定").first.click()
                time.sleep(2)
                print("temp member removed")
            except Exception as e:
                print("cleanup failed:", e)
        browser.close()
    print("\n[DONE]", OUT)
    for f in sorted(os.listdir(OUT)):
        if f.startswith("scope-"):
            print("  ", f)
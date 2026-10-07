# -*- coding: utf-8 -*-
"""支付超时观测 + 商品专享券绑定 生产截图（桌面视口 1440x900 dpr=1，is_mobile=False）。
目标：
  1. 支付超时观测页（KPI 行 + 筛选 + 任务表）
  2. 支付超时观测页（今日开关开启态）
  3. 券编辑页「商品绑定」卡片区（含已绑商品/搜索/绑定入口）
  4. （附带）券详情弹窗统计块（已发放/已使用/使用率）
登录沿 web-admin 截图先例（_shot_campus_ops.py）：superadmin UI 登录；
券模板定位走 admin-api 直查（找 distributionChannels 含 PRODUCT 且已绑商品的券）。
"""
import json
import os
import time

import requests
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli/#/"
API = "https://e.joho.cn/admin-api"
OUT = r"d:\zhao\vshop\web-admin\docs\screenshots\payment-timeout"
CHROME = "C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
USER, PWD = "superadmin", "z123123"

os.makedirs(OUT, exist_ok=True)


def gql(s, token, query):
    r = s.post(API, json={"query": query}, headers={"Authorization": "Bearer " + token}, timeout=20)
    return r.json()


def pick_product_coupon():
    """找一张 distributionChannels 含 PRODUCT 且已绑定商品的券。"""
    s = requests.Session()
    lr = s.post(API, json={"query": 'mutation { login(username: "%s", password: "%s") '
                                    '{ ... on CurrentUser { id identifier } '
                                    '... on ErrorResult { errorCode message } } }' % (USER, PWD)}, timeout=20)
    token = lr.headers.get("vendure-auth-token")
    data = lr.json().get("data", {})
    print("api login:", json.dumps(data)[:80], "| token:", bool(token))
    assert token, "admin-api 登录失败"
    res = gql(s, token, 'query { couponTemplates(options: { take: 100 }) '
                        '{ items { id nameZh enabled distributionChannels } totalItems } }')
    items = (res.get("data", {}).get("couponTemplates") or {}).get("items") or []
    print("templates total:", len(items))
    for it in items:
        ch = it.get("distributionChannels") or ""
        if "PRODUCT" not in ch:
            continue
        b = gql(s, token, 'query { couponBoundProducts(templateId: "%s") { id productId } }' % it["id"])
        bound = (b.get("data") or {}).get("couponBoundProducts") or []
        print("  candidate:", it["id"], it.get("nameZh"), "| bound:", len(bound))
        if bound:
            return it["id"], it.get("nameZh"), len(bound)
    return None


def main():
    tpl = pick_product_coupon()
    print("chosen template:", tpl)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                                  is_mobile=False, locale="zh-CN")
        pg = ctx.new_page()
        # —— 登录（先例姿势）——
        pg.goto(BASE + "pages/login/index")
        pg.wait_for_timeout(2500)
        inputs = pg.locator("input")
        inputs.nth(0).fill(USER)
        inputs.nth(1).fill(PWD)
        pg.locator("button, .login-btn, uni-button").first.click()
        pg.wait_for_timeout(3000)
        print("after login url:", pg.url[:90])

        # —— 1. 支付超时观测页 ——
        pg.goto(BASE + "pages/order/payment-timeout/index")
        pg.wait_for_timeout(7000)
        body = pg.inner_text("body")
        print("pt page has KPI:", ("今日提醒" in body), "| table:", ("订单号" in body))
        pg.screenshot(path=OUT + r"\pt_01_overview.png")

        # —— 2. 今日开关开启态 ——
        try:
            pg.locator(".chip", has_text="今日").first.click(timeout=5000)
            pg.wait_for_timeout(4000)
            pg.screenshot(path=OUT + r"\pt_02_today_on.png")
            print("today toggle shot ok")
        except Exception as e:
            print("today toggle skipped:", type(e).__name__)

        # —— 3. 券编辑页绑定卡片区 ——
        if tpl:
            pg.goto(BASE + "pages/coupon/edit/index?id=" + tpl[0])
            pg.wait_for_timeout(7000)
            body = pg.inner_text("body")
            print("coupon edit has binding card:", ("商品绑定" in body), "| bound text:", ("已绑定" in body))
            pg.screenshot(path=OUT + r"\pt_03_coupon_bind_card.png")
            cbc = pg.locator(".cbc").first
            if cbc.count():
                cbc.scroll_into_view_if_needed()
                pg.wait_for_timeout(800)
                cbc.screenshot(path=OUT + r"\pt_03b_bind_card_element.png")
                print("bind card element shot ok")
            # —— 4.（附带）券列表 → 详情弹窗统计块 ——
            try:
                pg.goto(BASE + "pages/coupon/index")
                pg.wait_for_timeout(6000)
                card = pg.locator(".card", has_text=tpl[1]).first
                card.locator(".ops").get_by_text("明细").first.click(timeout=5000)
                pg.wait_for_timeout(4000)
                if pg.locator(".modal").count():
                    pg.screenshot(path=OUT + r"\pt_04_coupon_detail_stats.png")
                    print("detail modal shot ok")
                else:
                    print("detail modal not visible")
            except Exception as e:
                print("detail modal skipped:", type(e).__name__)

        browser.close()

    print("\n== 截图清单 ==")
    for f in sorted(os.listdir(OUT)):
        print("  " + f + "  " + str(os.path.getsize(OUT + "\\" + f) // 1024) + " KB")


if __name__ == "__main__":
    main()

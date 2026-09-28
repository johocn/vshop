# -*- coding: utf-8 -*-
"""2026-09-28 审查第二阶段取证（web-admin）：F-WA-08 订单详情后台改价服务端强校验。

手机视口 390x844 dpr=2。链路：web-admin H5 dev(8090, base /guanli/) → admin-api(3000) adjustOrderPrice。
覆盖：① 改价弹层（含当前实付）② 超限被服务端拒绝 ③ 正常改价 +1.00 元成功。
"""
import json
import os
import urllib.request

from playwright.sync_api import sync_playwright

OUT = r"d:\zhao\vshop\web-admin\docs\verify"
ADMIN_API = "http://localhost:3000/admin-api"
CHANNEL_TOKEN = "default-token"      # dev 默认渠道 token（channel __default_channel__）
CHANNEL_CODE = "__default_channel__"
ADMIN_USER = "superadmin"
ADMIN_PASS = "superadmin"

os.makedirs(OUT, exist_ok=True)


def admin_gql(query, variables=None, auth=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    headers = {"Content-Type": "application/json", "vendure-token": CHANNEL_TOKEN}
    if auth:
        headers["Authorization"] = "Bearer " + auth
    req = urllib.request.Request(ADMIN_API, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.headers.get("vendure-auth-token") or "", json.loads(r.read().decode())


def admin_session():
    token, data = admin_gql(
        'mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id identifier } '
        '... on ErrorResult { message } } }' % (ADMIN_USER, ADMIN_PASS)
    )
    if not token:
        raise RuntimeError("管理员登录失败: " + json.dumps(data, ensure_ascii=False))
    return token


def adjustable_order(auth):
    _, data = admin_gql(
        "query { orders(options: { take: 50, sort: { id: DESC } }) "
        "{ items { id code state totalWithTax } } }",
        auth=auth,
    )
    items = ((data.get("data") or {}).get("orders") or {}).get("items") or []
    for o in items:
        if o["state"] in ("AddingItems", "ArrangingPayment"):
            return o
    raise RuntimeError("没有处于 AddingItems/ArrangingPayment 的订单，无法演示改价")


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def toast_text(pg):
    try:
        return pg.inner_text("uni-toast")[:120]
    except Exception:
        return "(无 toast)"


def main():
    auth = admin_session()
    order = adjustable_order(auth)
    print("订单:", order)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            locale="zh-CN", is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(repr(e)))
        api_calls = []

        def on_resp(resp):
            if "admin-api" in resp.url:
                api_calls.append({"status": resp.status, "body": resp.text()[:400]})
        pg.on("response", on_resp)
        pg.on("console", lambda m: api_calls.append({"console": m.type + ": " + m.text[:200]})
              if m.type in ("error", "warning") else None)

        pg.goto("http://127.0.0.1:5280/guanli/", timeout=90000, wait_until="load")
        pg.wait_for_timeout(6000)
        print("首页 body 前60=", repr(pg.inner_text("body")[:60]))
        pg.evaluate(
            """([t, ch, code]) => {
                localStorage.setItem('wa_auth_token', t);
                localStorage.setItem('wa_channel_token', ch);
                localStorage.setItem('wa_channel_code', code);
                localStorage.setItem('wa_user_id', '1');
            }""",
            [auth, CHANNEL_TOKEN, CHANNEL_CODE],
        )
        pg.goto("http://127.0.0.1:5280/guanli/#/pages/order/detail/index?id=%s" % order["id"],
                timeout=90000, wait_until="load")
        pg.wait_for_timeout(2000)
        pg.reload(timeout=90000, wait_until="load")   # 带 hash 全量重载，让应用以该路由冷启动
        pg.wait_for_timeout(15000)
        body = pg.inner_text("body")
        print("详情页 body 前120=", repr(body[:120]))
        print("详情页 url=", pg.url)
        print("admin-api 调用=", json.dumps(api_calls, ensure_ascii=False)[:900])
        if errs:
            print("pageerror=", errs[:3])
        shot(pg, "audit-webadmin-order-detail-adjust.png")

        # 打开改价弹层
        pg.click("text=改价")
        pg.wait_for_timeout(1200)
        shot(pg, "audit-webadmin-order-adjust-sheet.png")

        # ① 超限：目标金额 = 当前 + 10000 元（差额 100 万分 > 渠道上限）
        over = (order["totalWithTax"] + 1000000) / 100
        pg.fill(".amt input", "%.2f" % over)
        pg.wait_for_timeout(300)
        pg.click("text=确认改价")
        pg.wait_for_timeout(900)          # toast 默认 1.5s 消失，抢在消失前截图
        print("超限 toast=", toast_text(pg))
        shot(pg, "audit-webadmin-order-adjust-overlimit.png")
        pg.wait_for_timeout(2500)

        # ② 正常：目标金额 = 当前 + 1.00 元
        ok = (order["totalWithTax"] + 100) / 100
        pg.fill(".amt input", "%.2f" % ok)
        pg.wait_for_timeout(300)
        pg.click("text=确认改价")
        pg.wait_for_timeout(900)
        print("正常改价 toast=", toast_text(pg))
        shot(pg, "audit-webadmin-order-adjust-success.png")
        pg.wait_for_timeout(2500)

        # ③ 回退：改回原价，保持库内数据整洁
        pg.click("text=改价")
        pg.wait_for_timeout(1200)
        pg.fill(".amt input", "%.2f" % (order["totalWithTax"] / 100))
        pg.wait_for_timeout(300)
        pg.click("text=确认改价")
        pg.wait_for_timeout(2500)
        print("回退 toast=", toast_text(pg))

        if errs:
            print("pageerror=", errs[:2])
        ctx.close()
        b.close()
    print("DONE")


if __name__ == "__main__":
    main()

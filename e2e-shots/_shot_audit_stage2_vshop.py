# -*- coding: utf-8 -*-
"""2026-09-28 审查第二阶段取证（vshop）：F-VS-09 售后申请页凭证图片真实上传。

手机视口 390x844 dpr=2。链路：vshop H5 dev(8091) → uni.uploadFile → 本地 vendure shop-api(3000)
→ uploadCustomerAsset → 缩略图 src 为后端返回的绝对 URL。
"""
import json
import os
import urllib.request

from playwright.sync_api import sync_playwright

OUT = r"d:\zhao\vshop\e2e-shots"
SHOP_API = "http://localhost:3000/shop-api"
CHANNEL_TOKEN = "default-token"
EMAIL = "audit-verify@example.com"
PASSWORD = "Audit#2026"
UPLOAD_FILE = r"d:\zhao\vshop\docs\demo\playwright\shots\c02_pending_list.png"  # 作为「凭证截图」上传的真实 PNG

os.makedirs(OUT, exist_ok=True)


def shop_gql(query, variables=None, auth=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    headers = {"Content-Type": "application/json", "vendure-token": CHANNEL_TOKEN}
    if auth:
        headers["Authorization"] = "Bearer " + auth
    req = urllib.request.Request(SHOP_API, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.headers.get("vendure-auth-token") or "", json.loads(r.read().decode())


def customer_session():
    """注册（幂等）+ 原生登录，返回 (auth_token, customer_id)。"""
    shop_gql(
        'mutation { registerCustomerAccount(input: { emailAddress: "%s", firstName: "Audit", '
        'lastName: "Verify", password: "%s" }) { ... on Success { success } ... on ErrorResult { message } } }'
        % (EMAIL, PASSWORD)
    )
    token, data = shop_gql(
        'mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id identifier } '
        '... on ErrorResult { message } } }' % (EMAIL, PASSWORD)
    )
    if not token:
        raise RuntimeError("客户登录失败: " + json.dumps(data, ensure_ascii=False))
    _, profile = shop_gql("query { activeCustomer { id } }", auth=token)
    return token, (((profile.get("data") or {}).get("activeCustomer") or {}).get("id") or "")


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def main():
    auth_token, customer_id = customer_session()
    print("customer session:", customer_id, "token.len", len(auth_token))

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            locale="zh-CN", is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(repr(e)))
        uploads = []

        def on_resp(resp):
            req = resp.request
            if "shop-api" in req.url and req.method == "POST" and "uploadCustomerAsset" in (req.post_data or ""):
                uploads.append({"status": resp.status, "body": resp.text()[:600]})
        pg.on("response", on_resp)

        pg.goto("http://127.0.0.1:8091/", timeout=90000, wait_until="domcontentloaded")
        pg.wait_for_timeout(3000)
        # 注入客户会话（uni.setStorageSync 与页面读取的 key 一致）
        pg.evaluate(
            """([t, uid]) => {
                const set = (k, v) => { if (window.uni && uni.setStorageSync) uni.setStorageSync(k, v); else localStorage.setItem(k, v); };
                set('auth_token', t); set('auth_userId', uid); set('vendure_session_token', t); set('tenant_code', 'default');
            }""",
            [auth_token, str(customer_id)],
        )

        pg.goto("http://127.0.0.1:8091/#/pkg-after-sale/pages/apply?orderId=1",
                timeout=90000, wait_until="domcontentloaded")
        pg.wait_for_timeout(6000)
        body = pg.inner_text("body")
        print("apply page 含『凭证图片』=", "凭证图片" in body, "| 前120字=", repr(body[:120]))
        shot(pg, "audit-vshop-after-sale-upload-before.png")

        # 选择「添加图片」→ 原生 file chooser → 上传真实文件
        with pg.expect_file_chooser(timeout=20000) as fc:
            pg.click("text=添加图片")
        fc.value.set_files(UPLOAD_FILE)
        pg.wait_for_timeout(9000)

        imgs = pg.eval_on_selector_all(
            ".image-upload__preview img", "els => els.map(e => e.getAttribute('src'))"
        )
        bg = pg.eval_on_selector_all(
            ".image-upload__preview", "els => els.map(e => (e.querySelector('div')||{}).style ? (e.querySelector('div').style.backgroundImage||'') : '')"
        )
        body2 = pg.inner_text("body")
        print("上传响应=", json.dumps(uploads, ensure_ascii=False)[:800])
        print("缩略图 img src=", imgs)
        print("缩略图 background=", bg)
        print("页面含『上传失败』=", "上传失败" in body2)
        if errs:
            print("pageerror=", errs[:2])
        shot(pg, "audit-vshop-after-sale-upload-after.png")
        ctx.close()
        b.close()
    print("DONE")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright
from login_util import admin_login_state, list_tenants

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]
EMAIL = "chendi-demo@joho.cn"
PWD = "B5hZ-#Jnuba@"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1500, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('wa_auth_token','');localStorage.setItem('wa_channel_token',{json.dumps(TOKEN)});localStorage.setItem('wa_channel_code','t2');")
    pg = ctx.new_page()
    msgs = []
    pg.on("console", lambda m: msgs.append(m.text))
    pg.on("response", lambda r: msgs.append("RESP %s" % r.url) if "admin-api" in r.url else None)
    pg.goto("https://e.joho.cn/guanli/", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1200)
    pg.locator(".uni-input-input").nth(0).fill(EMAIL)
    pg.locator(".uni-input-input").nth(1).fill(PWD)
    pg.locator("uni-button:has-text('登')").first.click()
    pg.wait_for_timeout(2500)
    print("after login url:", pg.url)
    ls = pg.evaluate("""() => { const g=k=>localStorage.getItem(k); return {t:g('wa_auth_token'),c:g('wa_channel_token'),cc:g('wa_channel_code')}; }""")
    pg.goto("https://e.joho.cn/guanli/#/pages/product/list/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    print("product list body:", pg.inner_text('body')[:150])
    pg.screenshot(path="shots/_debug_merchant_list.png", full_page=True)
    # 直接 fetch admin-api 看商户当前渠道返回
    auth = pg.evaluate("localStorage.getItem('wa_auth_token')")
    ch = pg.evaluate("localStorage.getItem('wa_channel_token')")
    q = 'query{ products(options:{take:10}){ totalItems items{ id name } } }'
    res = pg.evaluate("""async ([q,auth,ch]) => { const r = await fetch('/admin-api',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth,'vendure-token':ch},body:JSON.stringify({query:q})}); return {status:r.status, body: await r.text()}; }""", [q, auth, ch])
    print("direct fetch:", res)
    print("---console---")
    for m in msgs[-8:]:
        print(m[:200])
    b.close()
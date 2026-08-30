# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright
from login_util import admin_login, list_tenants, admin_login_state

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]
EMAIL = "chendi-demo@joho.cn"
PWD = "B5hZ-#Jnuba@"

# 1) 浏览器登录一次
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('wa_auth_token','');localStorage.setItem('wa_channel_token',{json.dumps(TOKEN)});localStorage.setItem('wa_channel_code','t2');")
    pg = ctx.new_page()
    pg.goto("https://e.joho.cn/guanli/", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.locator(".uni-input-input").nth(0).fill(EMAIL)
    pg.locator(".uni-input-input").nth(1).fill(PWD)
    pg.locator("uni-button:has-text('登')").first.click()
    pg.wait_for_timeout(2500)
    print("browser after login url:", pg.url)
    b.close()

# 2) API 登录 + createProduct，打印真实 body
mt, mb = admin_login(EMAIL, PWD)
print("api login:", "OK" if mt else mb)
q = """mutation($i:CreateProductInput!){
  createProduct(input:$i){ id name slug customFields{ merchantRef{ id code } marketplaceStatus } } }"""
v = {"i": {"translations": [{"languageCode": "zh_Hans", "name": "REPRO-曲奇", "slug": "repro-cookie", "description": "测试"}]}}
req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": v}).encode(),
              headers={"Content-Type": "application/json", "Authorization": "Bearer " + mt, "vendure-token": TOKEN}, method="POST")
try:
    with urlopen(req, timeout=40) as r:
        print("CREATE OK", r.status, r.read().decode()[:300])
except HTTPError as e:
    print("CREATE HTTPErr", e.code, e.read().decode()[:800])
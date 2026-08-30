# -*- coding: utf-8 -*-
"""阶段D：商户复登，展示商品已通过审批并在默认站点上架。"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright
from login_util import admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
APP = "https://e.joho.cn/guanli/"
meta_a = json.load(open(os.path.join(SHOTS, "meta_phase_a.json"), encoding="utf-8"))
meta_b = json.load(open(os.path.join(SHOTS, "meta_phase_b.json"), encoding="utf-8"))
EMAIL = meta_a["admin_email"]
PW = meta_a["initial_password"]
CH_TOKEN = meta_b["channel_token"]

ms = admin_login_state(EMAIL, PW, channel_code=meta_a["tenant_code"])
AUTH = ms["auth_token"]
TOKEN = ms["channel_token"]
print("merchant relogin ok, token len:", len(TOKEN))

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token',{json.dumps(AUTH)});
localStorage.setItem('wa_channel_token', {json.dumps(TOKEN)});
localStorage.setItem('wa_channel_code', {json.dumps(meta_a['tenant_code'])});""")
    pg = ctx.new_page()
    pg.goto(APP + "#/pages/product/list/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3500)
    body = pg.inner_text('body')
    print("dashboard/prod body head:", body[:120])
    if "登录" in body and "密码" in body:
        pg.locator(".uni-input-input").nth(0).fill(EMAIL)
        pg.locator(".uni-input-input").nth(1).fill(PW)
        pg.locator("uni-button:has-text('登')").first.click()
        pg.wait_for_timeout(2500)
        pg.goto(APP + "#/pages/product/list/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(3500)
    pg.screenshot(path=os.path.join(SHOTS, "d01_merchant_approved_product.png"), full_page=False)
    print("d01 body:", pg.inner_text('body')[:300])
    b.close()
print("PHASE_D_UI_DONE")
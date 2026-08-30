# -*- coding: utf-8 -*-
"""侦察2：注入超管登录态 -> 进入后台 -> 导航到平台/租户页与商品审批页，截图+抓 DOM"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
APP = "https://e.joho.cn/guanli/"

state = admin_login_state("superadmin", "z123123", channel_code=None)
print("LOGIN channel:", state["channel_code"], state["channel_name"])

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=1.5)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token', {json.dumps(state['auth_token'])});
localStorage.setItem('wa_channel_token', {json.dumps(state['channel_token'])});
localStorage.setItem('wa_channel_code', {json.dumps(state['channel_code'])});""")
    pg = ctx.new_page()
    pg.on("console", lambda m: print("CONSOLE:", m.type, m.text[:200]))
    pg.on("request", lambda r: (r.url.__contains__("admin-api") and print("REQ:", r.url.split("/guanli")[-1])))
    pg.on("response", lambda r: (r.url.__contains__("admin-api") and print("RESP:", r.url.split("/guanli")[-1], r.status, r.text()[:160])))
    pg.goto(APP, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    print("URL:", pg.url)
    print("LS_AUTH:", pg.evaluate("window.localStorage.getItem('wa_auth_token') && window.localStorage.getItem('wa_auth_token')!==''"))
    print("LS_CHANNEL:", pg.evaluate("window.localStorage.getItem('wa_channel_token')"))
    txt = pg.inner_text("body")
    print("DASH_TEXT:", txt[:600])
    pg.screenshot(path=os.path.join(SHOTS, "02_dashboard.png"), full_page=True)

    # 抓取页面中所有可点击文本（导航项候选）
    texts = pg.eval_on_selector_all(
        "view, div, text, uni-view, uni-text",
        """nodes => { const out=[]; const seen=new Set();
           for(const n of nodes){ const t=(n.textContent||'').replace(/\\s+/g,' ').trim();
           if(t && t.length<=12 && !seen.has(t)){ seen.add(t); out.push(t);} if(out.length>=160) break;} return out; }""")
    print("TEXT_NODES:", texts)

    b.close()
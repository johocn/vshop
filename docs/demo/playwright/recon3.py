# -*- coding: utf-8 -*-
"""侦察3：注入登录态，直接访问 租户页/商品审批页 报表哈希路由，截图+收集可交互文本"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
APP = "https://e.joho.cn/guanli/"

state = admin_login_state("superadmin", "z123123", channel_code=None)
print("LOGIN channel:", state["channel_code"], state["channel_name"])

ROUTES = {
    "tenants": "pages/platform/tenants/index",
    "approval": "pages/platform/product-approval/index",
}

def collect(page):
    texts = page.eval_on_selector_all(
        "view, div, text, uni-view, uni-text, button, uni-button",
        """nodes => { const out=[]; const seen=new Set();
           for(const n of nodes){ const t=(n.textContent||'').replace(/\\s+/g,' ').trim();
           if(t && t.length<=30 && !seen.has(t)){ seen.add(t); out.push(t);} if(out.length>=220) break;} return out; }""")
    return texts

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token', {json.dumps(state['auth_token'])});
localStorage.setItem('wa_channel_token', {json.dumps(state['channel_token'])});
localStorage.setItem('wa_channel_code', {json.dumps(state['channel_code'])});""")
    pg = ctx.new_page()
    for key, route in ROUTES.items():
        pg.goto(APP + "#/"+route, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(3000)
        print(f"\n===== {key} URL: {pg.url}")
        pg.screenshot(path=os.path.join(SHOTS, f"recon_{key}.png"), full_page=True)
        try:
            print("TEXT:", collect(pg))
        except Exception as e:
            print("collect err", e)
        open(os.path.join(SHOTS, f"recon_{key}.html"), "w", encoding="utf-8").write(
            pg.eval_on_selector('html', 'el => el.innerHTML'))
    b.close()
# -*- coding: utf-8 -*-
"""阶段一-侦察：超管打开租户页 -> 点『＋新建租户』-> 抓弹窗 DOM 与按钮结构 """
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
APP = "https://e.joho.cn/guanli/"

state = admin_login_state("superadmin", "z123123", channel_code=None)

def btn_info(page, txt):
    els = page.eval_on_selector_all("*", f"""
      nodes => {{ const out=[]; for(const n of nodes){{
        if((n.childElementCount===0 || /uni-button|button/i.test(n.tagName)) && (n.textContent||'').includes({json.dumps(txt)})){{
          out.push({{tag:n.tagName, cls:(n.className||'').toString().slice(0,60), txt:(n.textContent||'').trim()}});
        }} }} return out.slice(0,8); }}""")
    return els

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1600, "height": 1100}, device_scale_factor=1.5)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token', {json.dumps(state['auth_token'])});
localStorage.setItem('wa_channel_token', {json.dumps(state['channel_token'])});
localStorage.setItem('wa_channel_code', {json.dumps(state['channel_code'])});""")
    pg = ctx.new_page()
    pg.goto(APP + "#/pages/platform/tenants/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    print("URL:", pg.url)
    # 点击新建租户
    pg.locator("text=＋新建租户").first.click()
    pg.wait_for_timeout(1000)
    pg.screenshot(path=os.path.join(SHOTS, "p1_create_tenant_dialog.png"), full_page=False)
    # dialog 内文本
    dlg_txt = pg.inner_text("text=新建租户")
    print("DIALOG_PARENT_TEXT:", pg.evaluate(
        "() => { const t=[...document.querySelectorAll('*')].find(n=>(n.textContent||'').trim()==='新建租户'); if(!t) return 'none'; return t.closest('.pop').innerText; }"))
    print("BTN_CREATE:", btn_info(pg, "创建"))
    print("BTN_CANCEL:", btn_info(pg, "取消"))
    print("INPUTS:", pg.locator(".uni-input-input").count())
    b.close()
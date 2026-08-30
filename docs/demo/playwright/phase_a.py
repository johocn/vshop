# -*- coding: utf-8 -*-
"""阶段A：超管 UI 创建商户租户 + 添加商户管理员，全程截图，并解析初始口令"""
import sys, io, os, json, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import admin_login_state, list_tenants, import_default_roles, tenant_roles

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
APP = "https://e.joho.cn/guanli/"

STATE = admin_login_state("superadmin", "z123123", channel_code=None)
AUTH = STATE["auth_token"]

TENANT_NAME = "陈记烘焙馆·手机版"
ADMIN_EMAIL = "chendi-mobile@joho.cn"
ADMIN_NAME = "陈店长"
ADMIN_PHONE = "13800003333"

def new_ctx(b, state):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token', {json.dumps(state['auth_token'])});
localStorage.setItem('wa_channel_token', {json.dumps(state['channel_token'])});
localStorage.setItem('wa_channel_code', {json.dumps(state['channel_code'])});""")
    return ctx

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = new_ctx(b, STATE)
    pg = ctx.new_page()
    pg.goto(APP, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1500)
    # S01 登录页
    pg.screenshot(path=os.path.join(SHOTS, "m01_login.png"), full_page=False)
    print("S01 login ok")

    # S02 租户列表
    pg.goto(APP + "#/pages/platform/tenants/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(SHOTS, "m02_tenants.png"), full_page=False)
    print("S02 tenants ok")

    # S03 新建租户对话框，填入店铺名
    pg.locator("text=＋新建租户").first.click()
    pg.wait_for_timeout(900)
    pg.locator(".uni-input-input").first.fill(TENANT_NAME)
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(SHOTS, "m03_create_tenant_dialog.png"), full_page=False)
    print("S03 dialog ok, inputs:", pg.locator(".uni-input-input").count())

    # 创建
    pg.locator("uni-button:has-text('创建')").first.click()
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(SHOTS, "m04_tenants_after_create.png"), full_page=False)
    print("S04 after create ok")

    # 通过 HTTP 找到刚创建租户 id
    time.sleep(1)
    tl = list_tenants(AUTH)
    tgt = None
    for t in tl:
        name = (t.get("customFields") or {}).get("shopName")
        if name and name.strip() == TENANT_NAME:
            tgt = t; break
    if not tgt:
        print("!! tenant not found. existing:", [(t.get('code'), (t.get('customFields') or {}).get('shopName')) for t in tl])
        b.close(); sys.exit(1)
    tid, tcode = tgt["id"], tgt["code"]
    print("TENANT id=", tid, "code=", tcode)

    # 确保角色存在（供添加管理员授权）
    roles = tenant_roles(AUTH, tid)
    if not roles:
        roles = import_default_roles(AUTH, tid)
    print("ROLES:", [(r["code"], r["description"]) for r in roles])

    # S05 租户详情（管理员 tab）
    pg.goto(APP + f"#/pages/platform/tenants/detail?id={tid}&name={json.dumps(TENANT_NAME)}", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(SHOTS, "m05_tenant_detail_admins.png"), full_page=False)
    print("S05 detail ok")

    # S06 添加管理员对话框
    pg.locator("text=＋添加管理员").first.click()
    pg.wait_for_timeout(900)
    # 填邮箱/姓名/手机号
    ins = pg.locator(".uni-input-input")
    ins.nth(0).fill(ADMIN_EMAIL)
    ins.nth(1).fill(ADMIN_NAME)
    ins.nth(2).fill(ADMIN_PHONE)
    pg.screenshot(path=os.path.join(SHOTS, "m06_add_admin_dialog_filled.png"), full_page=False)
    print("S06 add admin dialog ok, inputs:", pg.locator(".uni-input-input").count())

    # 选择角色
    pg.locator("text=请选择角色").first.click()
    pg.wait_for_timeout(700)
    # 勾选第一个角色
    role_elm = pg.locator(".pick-item").first
    role_elm.click()
    pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(SHOTS, "m06b_role_pick.png"), full_page=False)
    pg.locator("uni-button:has-text('确定')").first.click()
    pg.wait_for_timeout(500)
    print("S06 role selected")

    # 添加管理员
    pg.locator("uni-button:has-text('添加')").first.click()
    pg.wait_for_timeout(2500)
    # 初始口令弹层
    try:
        pg.wait_for_selector("text=初始口令（仅显示一次）", timeout=8000)
        popup_inner = pg.evaluate("""() => { const t=[...document.querySelectorAll('.pop')].find(n=>(n.textContent||'').includes('初始口令')); return t? t.innerText : ''; }""")
        print("PWD_POPUP:", popup_inner)
        pg.screenshot(path=os.path.join(SHOTS, "m07_initial_password.png"), full_page=False)
        # 解析口令
        import re
        m = re.search(r'初始口令[^\n]*\n([^\n]+)\n([^\n]+)', popup_inner)
        pwd = None
        if m:
            account_line, pwd_line = m.groups()
            pwd = pwd_line.strip()
        print("RESOLVED_PWD:", pwd)
    except Exception as e:
        print("!! password popup not shown:", e)
        pwd = None
    # 关闭弹层
    b.close()

    with open(os.path.join(SHOTS, "meta_phase_a.json"), "w", encoding="utf-8") as f:
        json.dump({"tenant_id": tid, "tenant_code": tcode, "admin_email": ADMIN_EMAIL,
                   "admin_name": ADMIN_NAME, "initial_password": pwd}, f, ensure_ascii=False, indent=2)
    print("PHASE_A_DONE")
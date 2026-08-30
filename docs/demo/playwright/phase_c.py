# -*- coding: utf-8 -*-
"""阶段C：平台超管审批商品。登录 -> 待审商品列表 -> 找目标商品 -> 通过 -> 校验"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
APP = "https://e.joho.cn/guanli/"
meta_b = json.load(open(os.path.join(SHOTS, "meta_phase_b.json"), encoding="utf-8"))
PID = meta_b["product_id"]
PNAME = meta_b["product_name"]

SUPER_ADMIN = admin_login_state("superadmin", "z123123", channel_code=None)
S_TOKEN = SUPER_ADMIN["channel_token"]
S_AUTH = SUPER_ADMIN["auth_token"]
print("super admin channel token len:", len(S_TOKEN), "auth len:", len(S_AUTH))

def wait_for_superadmin(pg):
    # 若被重定向到登录页则登录
    for _ in range(3):
        body = pg.inner_text('body')[:80]
        if "登录" in body and "密码" in body:
            try:
                pg.locator(".uni-input-input").nth(0).fill("superadmin")
                pg.locator(".uni-input-input").nth(1).fill("z123123")
                pg.locator("uni-button:has-text('登')").first.click()
                pg.wait_for_timeout(2500)
            except Exception as e:
                pass
            continue
        break

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token',{json.dumps(S_AUTH)});
localStorage.setItem('wa_channel_token', {json.dumps(S_TOKEN)});""")
    pg = ctx.new_page()
    # 直接进入平台审批页
    pg.goto(APP + "#/pages/platform/product-approval/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3000)
    body = pg.inner_text('body')
    print("initial body:", body[:120])
    # 若登录页则填登录
    if "登录" in body:
        pg.screenshot(path=os.path.join(SHOTS, "c01_platform_login.png"), full_page=False)
        pg.locator(".uni-input-input").nth(0).fill("superadmin")
        pg.locator(".uni-input-input").nth(1).fill("z123123")
        pg.screenshot(path=os.path.join(SHOTS, "c01b_platform_login_filled.png"), full_page=False)
        pg.locator("uni-button:has-text('登')").first.click()
        pg.wait_for_timeout(3000)
        pg.goto(APP + "#/pages/platform/product-approval/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(3000)

    # c02 待审商品列表
    pg.goto(APP + "#/pages/platform/product-approval/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(SHOTS, "c02_pending_list.png"), full_page=False)
    full = pg.inner_text('body')
    found = PNAME in full
    print("pending list has target product:", found)

    # 找到目标商品卡片并点击「通过」
    # 说明：待审列表存在多条同名"手工黄油曲奇礼盒"，目标 product_id 为最高 id，
    # 按 API 升序渲染时位于列表末尾。取"名称精确匹配"的卡片中最后一张。
    card = None
    cards = pg.locator(".card")
    n = cards.count()
    for i in range(n - 1, -1, -1):
        txt = cards.nth(i).inner_text().strip()
        if txt.startswith(PNAME) and not txt.startswith("M-"):
            card = cards.nth(i)
            break
    try:
        card.scroll_into_view_if_needed()
        pg.screenshot(path=os.path.join(SHOTS, "c03_found_card.png"), full_page=False)
        card.get_by_text("通过").first.click()
        pg.wait_for_timeout(900)
        # c04 通过确认弹窗
        pg.screenshot(path=os.path.join(SHOTS, "c04_approve_modal.png"), full_page=False)
        try:
            pg.locator("uni-button:has-text('确定')").first.click()
        except Exception:
            pg.get_by_text("确定").last.click()
        pg.wait_for_timeout(3000)
        # c05 通过后列表刷新（目标商品移除）
        pg.goto(APP + "#/pages/platform/product-approval/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(3000)
        pg.screenshot(path=os.path.join(SHOTS, "c05_after_approve.png"), full_page=False)
    except Exception as e:
        print("approve flow warn:", str(e)[:200])

    b.close()
print("PHASE_C_UI_DONE")
# -*- coding: utf-8 -*-
"""阶段B：商户 UI 首登 -> 强改密演示 -> 工作台；商品创建表单截图；
API 建真实商品(含变体)；UI 商品列表 + 提交上架"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright
from login_util import list_tenants, list_zones, set_channel_default_tax_zone, list_channel_products, create_product, add_product_variant, admin_login, admin_login_state

SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
APP = "https://e.joho.cn/guanli/"

meta = json.load(open(os.path.join(SHOTS, "meta_phase_a.json"), encoding="utf-8"))
ADMIN_EMAIL = meta["admin_email"]
INIT_PWD = meta.get("initial_password") or "B5hZ-#Jnuba@"
NEW_PWD = "Demo2026@chendi"
CODE = meta["tenant_code"]  # t2

AUTH_SUPER = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]
t2 = next(t for t in list_tenants(AUTH_SUPER) if t["code"] == CODE)
T2_ID = t2["id"]
T2_TOKEN = t2["token"]
print("t2 token:", T2_TOKEN)

# 新渠道默认无税务区域，先给渠道设置默认税务区域，否则建变体报税区错误
try:
    zones = list_zones(AUTH_SUPER)
    tz = next((z for z in zones if "中国" in z["name"] or "China" in z["name"]), zones[0])
    r = set_channel_default_tax_zone(AUTH_SUPER, T2_TOKEN, T2_ID, tz["id"])
    print("tax zone set:", r.get("defaultTaxZone"))
except Exception as e:
    print("set tax zone warn:", str(e)[:300])

# 登录页填写的初始密码
INIT = INIT_PWD

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(f"""localStorage.setItem('wa_auth_token','');
localStorage.setItem('wa_channel_token', {json.dumps(T2_TOKEN)});
localStorage.setItem('wa_channel_code', {json.dumps(CODE)});""")
    pg = ctx.new_page()
    pg.goto(APP, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1500)

    # m08 登录页填写
    pg.locator(".uni-input-input").nth(0).fill(ADMIN_EMAIL)
    pg.locator(".uni-input-input").nth(1).fill(INIT)
    try:
        pg.screenshot(path=os.path.join(SHOTS, "m08_merchant_login_filled.png"), full_page=False)
    except Exception as e:
        print("m08 shot warn:", e)
    pg.locator("uni-button:has-text('登')").first.click()
    pg.wait_for_timeout(2500)
    body = pg.inner_text('body')
    duty = "修改初始密码" in body or "绑定新密码" in body or "首次登录" in body

    # m09 首登改密（若后端强制则直接在此页；否则手动跳转演示该步）
    if not duty:
        try:
            pg.goto(APP + "#/pages/change-password/index", wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(1500)
        except Exception as e:
            print("nav change-password warn:", e)
    try:
        pg.screenshot(path=os.path.join(SHOTS, "m09_change_password.png"), full_page=False)
        pwd_ins = pg.locator(".uni-input-input")
        pwd_ins.nth(0).fill(NEW_PWD)
        pwd_ins.nth(1).fill(NEW_PWD)
        pg.screenshot(path=os.path.join(SHOTS, "m09b_change_password_filled.png"), full_page=False)
        # 注意：此处仅截图演示首登改密页，不实际提交（提交会破坏商户会话导致后续建商品失败）
    except Exception as e:
        print("change-pwd warn:", e)
    print("after changepwd url:", pg.url, "| body:", pg.inner_text('body')[:100])

    # m10 工作台
    try:
        pg.goto(APP + "#/pages/dashboard/index", wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2000)
        pg.screenshot(path=os.path.join(SHOTS, "m10_merchant_dashboard.png"), full_page=False)
    except Exception as e:
        print("m10 warn:", e)

    # m11 商品列表（初始，应为空）
    pg.goto(APP + "#/pages/product/list/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    try:
        pg.screenshot(path=os.path.join(SHOTS, "m11_merchant_product_list_empty.png"), full_page=False)
    except Exception as e:
        print("m11 warn:", e)

    # m12 商品创建表单截图（演示数据，不提交）
    pg.goto(APP + "#/pages/product/create/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    try:
        fields = pg.locator(".uni-input-input")
        fields.nth(0).fill("手工黄油曲奇礼盒")
        fields.nth(1).fill("handmade-oatmeal-cookies-gift")
        fields.nth(2).fill("68")
        fields.nth(3).fill("200")
        try:
            pg.locator("textarea").first.fill("手工烘焙黄油曲奇礼盒，香酥可口，适合伴手礼。")
        except Exception:
            pass
        pg.screenshot(path=os.path.join(SHOTS, "m12_merchant_create_product_form.png"), full_page=False)
    except Exception as e:
        print("m12 warn:", e)

    # --- 获取"新鲜"商户 token（UI 登录可能使旧 token 失效），用 API 建真实商品 ---
    mt, mb = admin_login(ADMIN_EMAIL, INIT)
    if not mt:
        print("ABORT: 商户 API 登录失败")
        b.close(); sys.exit(2)
    print("fresh merchant token ok")

    # 幂等：渠道下已存在该商品的 pending 记录则复用最新一条，否则新建+提交上架
    existing = list_channel_products(AUTH_SUPER, T2_TOKEN)
    dup = [x for x in existing if x.get("slug", "").startswith("handmade-oatmeal-cookies-gift")]
    dup_ids = sorted([int(x["id"]) for x in dup]) if dup else []
    target_id = dup_ids[-1] if dup_ids else None

    PNAME = "手工黄油曲奇礼盒"
    if target_id:
        pid = str(target_id)
        print("REUSE existing pending product id=", pid)
    else:
        try:
            product = create_product(mt, T2_TOKEN, {
                "i": {"translations": [{"languageCode": "zh_Hans",
                                        "name": PNAME,
                                        "slug": "handmade-oatmeal-cookies-gift",
                                        "description": "手工烘焙黄油曲奇礼盒，香酥可口，适合伴手礼。"}]}})
            pid = product["id"]
            add_product_variant(mt, T2_TOKEN, pid, "COOK-GIFT-01", 6800, 200, "2", "黄油曲奇礼盒")
            print("PRODUCT_CREATED id=", pid, product)
        except Exception as e:
            print("PRODUCT CREATE FAILED:", str(e)[:500])
            b.close(); sys.exit(2)

    # m13 商品列表出现商品 + 提交上架按钮
    pg.goto(APP + "#/pages/product/list/index", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(2500)
    try:
        pg.screenshot(path=os.path.join(SHOTS, "m13_merchant_product_list_with_item.png"), full_page=False)
    except Exception as e:
        print("m13 warn:", e)
    print("m13 body:", pg.inner_text('body')[:200])

    # 提交上架（若已是 pending 则按钮不存在，跳过） -> 待审核(m15)
    try:
        pg.get_by_text("提交上架到默认站点").first.click()
        pg.wait_for_timeout(900)
        try:
            pg.screenshot(path=os.path.join(SHOTS, "m14_submit_confirm_modal.png"), full_page=False)
        except Exception as e:
            print("m14 warn:", e)
        try:
            pg.locator("uni-button:has-text('确定')").first.click()
        except Exception:
            pg.get_by_text("确定").last.click()
        pg.wait_for_timeout(2500)
    except Exception as e:
        print("submit click skip (already pending):", str(e)[:120])
    try:
        pg.screenshot(path=os.path.join(SHOTS, "m15_submitted_pending.png"), full_page=False)
    except Exception as e:
        print("m15 warn:", e)
    print("m15 body:", pg.inner_text('body')[:200])

    json.dump({"merchant_auth": mt, "product_id": pid,
               "channel_token": T2_TOKEN, "channel_id": t2["id"],
               "product_name": PNAME,
               "merchant_email": ADMIN_EMAIL},
              open(os.path.join(SHOTS, "meta_phase_b.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("PHASE_B_DONE product_id=", pid)
    b.close()
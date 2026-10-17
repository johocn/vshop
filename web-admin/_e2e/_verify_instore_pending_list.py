# -*- coding: utf-8 -*-
"""买单核销页「默认待核销券列表」回归验证（390x844 dpr=2，硬规范）
线上 https://e.joho.cn/guanli/（已部署最新版）
登录：superadmin / z123123；t2 渠道经 localStorage 注入（superadmin 店铺列表不含 t2）

验证手段：
1) UI 券卡数 vs admin-api 直查 inStorePendingCoupons totalItems 比对；
2) 券码一致性：UI 首张券码 = API 首条 couponCode（临期优先排序）。
输出：web-admin/src/static/manual/shots/op56-instore-redeem-390.png
"""
import time
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/op56-instore-redeem-390.png'


def api_pending(pg):
    """页面上下文内直查 admin-api（复用 localStorage 里的会话/渠道 token）"""
    return pg.evaluate(
        """async () => {
      const headers = {'Content-Type': 'application/json'};
      const auth = localStorage.getItem('wa_auth_token');
      const ch = localStorage.getItem('wa_channel_token');
      if (auth) headers['Authorization'] = 'Bearer ' + auth;
      if (ch) headers['vendure-token'] = ch;
      const res = await fetch('https://e.joho.cn/admin-api', { method: 'POST', headers, body: JSON.stringify({ query: 'query { inStorePendingCoupons(options: { skip: 0, take: 20 }) { totalItems items { couponCode couponName discountType discountValue } } }' }) });
      const body = await res.json();
      if (body?.errors) return { error: JSON.stringify(body.errors).slice(0, 300) };
      return body?.data?.inStorePendingCoupons ?? { error: 'empty' };
    }""")


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()

    # 登录
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('superadmin')
    pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    print('after login url =', pg.url)
    pg.evaluate("""() => {
      localStorage.setItem('wa_channel_code', 't2');
      localStorage.setItem('wa_channel_token', '66ruvnhh34svhckaa2i');
    }""")

    # ---------- 买单核销页：默认待核销券列表 ----------
    pg.goto(BASE + '#/pages/in-store/redeem/index', wait_until='networkidle', timeout=45000)
    pg.locator('.pending').first.wait_for(state='visible', timeout=30000)
    time.sleep(2)

    cards = pg.locator('.pending .cpn')
    ui_count = cards.count()
    api = api_pending(pg)
    assert 'error' not in api, api
    api_count = api['totalItems']
    print('UI 券卡数 =', ui_count, '| API totalItems =', api_count)
    print('API items =', [it['couponCode'] for it in api['items']])
    assert ui_count == api_count, f'UI 券卡数({ui_count}) != API totalItems({api_count})'
    if ui_count > 0:
        # UI 首张券码 = API 首条（临期优先排序一致性）
        ui_code = cards.first.locator('.code').first.inner_text().strip()
        api_code = api['items'][0]['couponCode']
        print('UI 首张券码 =', ui_code, '| API 首条 =', api_code)
        assert api_code in ui_code, f'首张券码不一致：UI={ui_code!r} API={api_code!r}'
    print(f'[OK] 待核销券列表：UI {ui_count} 张 = API {api_count} 张，排序一致')

    pg.screenshot(path=SHOT)
    print('shot:', SHOT)

    b.close()
print('ALL OK')

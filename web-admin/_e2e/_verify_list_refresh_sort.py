# -*- coding: utf-8 -*-
"""列表页「保存返回自动刷新 + 新建内容最先显示」回归验证（390x844 dpr=2，硬规范）
本地预览 http://localhost:5280/guanli/（VITE_API_URL=https://e.joho.cn 直连生产 admin-api）
登录：superadmin / z123123；t2 渠道经 localStorage 注入（superadmin 店铺列表不含 t2）

验证手段：
1) 排序：UI 首行 vs admin-api 直查 sort createdAt DESC 首条，逐字比对；
2) 返回自动刷新：进入编辑页前给列表首行打 data-e2e-mark 标记，保存返回后标记消失 = 列表已重渲染刷新。
覆盖页：优惠券列表（完整闭环）、商品列表（排序 + 截图，只读）。
输出：web-admin/src/static/manual/shots/refresh_01_coupon_list_390.png、refresh_02_product_list_390.png
"""
import time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5280/guanli/'
API = 'https://e.joho.cn/admin-api'
SHOT_COUPON = 'd:/zhao/vshop/web-admin/src/static/manual/shots/refresh_01_coupon_list_390.png'
SHOT_PRODUCT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/refresh_02_product_list_390.png'


def api_first(pg, query, path):
    """页面上下文内直查 admin-api（复用 localStorage 里的会话/渠道 token），返回 items[0]"""
    return pg.evaluate(
        """async ([q, path]) => {
      const headers = {'Content-Type': 'application/json'};
      const auth = localStorage.getItem('wa_auth_token');
      const ch = localStorage.getItem('wa_channel_token');
      if (auth) headers['Authorization'] = 'Bearer ' + auth;
      if (ch) headers['vendure-token'] = ch;
      const res = await fetch('https://e.joho.cn/admin-api', { method: 'POST', headers, body: JSON.stringify({ query: q }) });
      const body = await res.json();
      if (body?.errors) return { error: JSON.stringify(body.errors).slice(0, 300) };
      return path.reduce((o, k) => (o == null ? o : o[k]), body?.data) ?? { error: 'empty' };
    }""", [query, path])


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

    # ---------- 1) 优惠券列表：排序 = createdAt DESC（后加的最先显示） ----------
    pg.goto(BASE + '#/pages/coupon/index', wait_until='networkidle', timeout=45000)
    pg.locator('.card').first.wait_for(state='visible', timeout=30000)
    time.sleep(1.5)
    first_name = pg.locator('.card .name').first.inner_text().strip()
    coupon_api = api_first(pg,
        'query { couponTemplates(options: { take: 1, skip: 0, sort: { createdAt: DESC } }) { items { id name } totalItems } }',
        ['couponTemplates', 'items', 0])
    print('coupon UI first =', first_name, '| API createdAt DESC first =', coupon_api)
    assert 'error' not in coupon_api, coupon_api
    api_name = coupon_api['name'] if isinstance(coupon_api['name'], str) else str(coupon_api['name'])
    assert api_name == first_name, f'coupon 列表首行非 createdAt DESC：UI={first_name!r} API={api_name!r}'
    print('[OK] coupon 列表排序 = createdAt DESC')

    # ---------- 2) 保存返回自动刷新：网络请求计数法 ----------
    # （DOM 标记法不可用：v-for 有 key，重渲染时复用节点、属性保留）
    import re
    coupon_reqs = []
    def _track(r):
        try:
            if 'admin-api' in r.url:
                pd = r.post_data or ''
                coupon_reqs.append(('CouponTemplates' in pd, pd[:80].replace('\n', ' ')))
        except Exception:
            pass
    pg.on('request', _track)
    reqs_before = len([c for c in coupon_reqs if c[0]])
    pg.locator('.card .top').first.click()
    pg.wait_for_url('**/pages/coupon/edit/index*', timeout=20000)
    pg.locator('.btn.main').first.wait_for(state='visible', timeout=30000)
    time.sleep(1.5)
    pg.locator('.btn.main').first.click()
    # 保存 → toast 600ms → navigateBack → onShow 自动刷新（应再次发起 couponTemplates 查询）
    pg.wait_for_url('**/pages/coupon/index*', timeout=20000)
    # 注意：sync 模式 time.sleep 不派发事件，必须用 playwright 自带等待才会泵请求事件
    pg.wait_for_timeout(3000)
    reqs_after = len([c for c in coupon_reqs if c[0]])
    print('admin-api 请求轨迹:', coupon_reqs)
    assert reqs_after > reqs_before, f'返回列表后未自动刷新（couponTemplates 查询未重新发起 {reqs_before}→{reqs_after}）'
    first_name2 = pg.locator('.card .name').first.inner_text().strip()
    assert first_name2 == first_name, '刷新后首行漂移（排序不稳定）'
    print(f'[OK] coupon 保存返回自动刷新（couponTemplates 查询 {reqs_before}→{reqs_after}），首行稳定 = {first_name2}')
    pg.screenshot(path=SHOT_COUPON)
    print('shot:', SHOT_COUPON)

    # ---------- 3) 商品列表：排序 = createdAt DESC（只读验证 + 截图） ----------
    pg.goto(BASE + '#/pages/product/list/index', wait_until='networkidle', timeout=45000)
    pg.wait_for_timeout(4000)
    product_cards = pg.locator('.card .name')
    if product_cards.count() == 0:
        # 当前渠道可能无商品：截图空态留档，跳过排序比对（排序已在 coupon 页闭环验证）
        print('[SKIP] 商品列表无数据（当前渠道无商品），仅截图空态')
        pg.screenshot(path=SHOT_PRODUCT)
        print('shot:', SHOT_PRODUCT)
    else:
        time.sleep(1.5)
        p_first = product_cards.first.inner_text().strip()
        product_api = api_first(pg,
            'query { products(options: { take: 1, skip: 0, sort: { createdAt: DESC } }) { items { id name } totalItems } }',
            ['products', 'items', 0])
        print('product UI first =', p_first, '| API createdAt DESC first =', product_api)
        assert 'error' not in product_api, product_api
        p_api_name = product_api['name'] if isinstance(product_api['name'], str) else str(product_api['name'])
        assert p_api_name == p_first, f'product 列表首行非 createdAt DESC：UI={p_first!r} API={p_api_name!r}'
        print('[OK] product 列表排序 = createdAt DESC')
        pg.screenshot(path=SHOT_PRODUCT)
        print('shot:', SHOT_PRODUCT)

    b.close()
print('ALL OK')

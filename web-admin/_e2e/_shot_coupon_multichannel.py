# -*- coding: utf-8 -*-
"""计划3 券多渠道：web-admin 商户端截图（390x844 dpr=2，硬规范）
本地预览 http://localhost:5280/guanli/ （serve-h5 代理 /admin-api → localhost:3000）
登录：superadmin@china.test / superadmin
输出：web-admin/src/static/manual/shots/
  coupon3_01_edit_channels.png   券编辑页「分发渠道」多选 + 出售价（模板 32: CENTRE,SALE）
  coupon3_02_edit_bind.png       券编辑页「适用商品」区块（批量选品入口）
  coupon3_03_pick_products.png   批量选品页（1 商品勾选 + 展开规格）
  coupon3_04_bundle_list.png     券包管理列表
  coupon3_05_bundle_edit.png     券包编辑页
  coupon3_06_sale_orders.png     出售单流水
  coupon3_07_sale_refund.png     出售单退款确认弹层
"""
import os, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
os.makedirs(SHOT, exist_ok=True)


def scroll_to(pg, text, offset=40):
    return pg.evaluate(
        """(t) => {
      const els = Array.from(document.querySelectorAll('*')).filter(e =>
        (e.textContent||'').trim() === t && e.offsetParent !== null);
      if (els.length) { const r = els[0].getBoundingClientRect();
        window.scrollBy(0, r.top + window.scrollY - %d); return 'SCROLLED'; }
      return 'NOBLOCK';
    }""" % offset, text)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()

    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('superadmin@china.test')
    pg.locator('input').nth(1).fill('superadmin')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    print('after login url =', pg.url)

    # 若出现选店铺页，选第一个店铺
    if 'channel-select' in pg.url:
        pg.locator('.store, .item, .card').first.click()
        time.sleep(4)
        print('after channel select url =', pg.url)

    # ===== 1/2 券编辑页：分发渠道 + 出售价 / 适用商品 =====
    pg.goto(BASE + '#/pages/coupon/edit/index?id=32', wait_until='networkidle', timeout=45000)
    time.sleep(5)
    print('edit url =', pg.url)
    body = pg.inner_text('body')
    print('edit has channels:', '分发渠道' in body, '| salePrice:', '出售价' in body, '| bind:', '适用商品' in body)
    if '分发渠道' not in body:
        print('edit body head:', body[:400])
        raise SystemExit('券编辑页未加载')

    scroll_to(pg, '分发渠道', 120)
    time.sleep(1.5)
    pg.screenshot(path=SHOT + 'coupon3_01_edit_channels.png')
    print('shot: coupon3_01_edit_channels.png')

    scroll_to(pg, '适用商品', 120)
    time.sleep(1.5)
    pg.screenshot(path=SHOT + 'coupon3_02_edit_bind.png')
    print('shot: coupon3_02_edit_bind.png')

    # ===== 3 批量选品页 =====
    pg.goto(BASE + '#/pages/coupon/pick-products/index?templateId=32', wait_until='networkidle', timeout=45000)
    time.sleep(5)
    print('pick url =', pg.url)
    n = pg.locator('.card .row').count()
    print('pick rows =', n)
    assert n > 0, '选品页无商品'
    pg.locator('.card .row .cb').first.click()
    time.sleep(0.6)
    pg.locator('.card .row .expand').first.click()
    time.sleep(1.2)
    pg.screenshot(path=SHOT + 'coupon3_03_pick_products.png')
    print('shot: coupon3_03_pick_products.png')

    # ===== 4 券包列表 =====
    pg.goto(BASE + '#/pages/coupon/bundle/index', wait_until='networkidle', timeout=45000)
    time.sleep(5)
    body = pg.inner_text('body')
    print('bundle list has 新建券包:', '新建券包' in body, '| 券包数:', '券包数' in body)
    pg.screenshot(path=SHOT + 'coupon3_04_bundle_list.png')
    print('shot: coupon3_04_bundle_list.png')

    # ===== 5 券包编辑页（取首个券包 id）=====
    bid = pg.evaluate(
        """() => fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('wa_auth_token')},
        body: JSON.stringify({query:'query{couponBundles(options:{take:1}){items{id}}}'})
      }).then(r=>r.json()).then(d=>d.data.couponBundles.items[0].id)""")
    print('bundle id =', bid)
    pg.goto(BASE + '#/pages/coupon/bundle/edit/index?id=' + str(bid), wait_until='networkidle', timeout=45000)
    time.sleep(5)
    body = pg.inner_text('body')
    print('bundle edit has 包含优惠券:', '包含优惠券' in body, '| 出售价:', '出售价' in body)
    pg.screenshot(path=SHOT + 'coupon3_05_bundle_edit.png')
    print('shot: coupon3_05_bundle_edit.png')

    # ===== 6/7 出售单流水 + 退款弹层 =====
    pg.goto(BASE + '#/pages/coupon/sale-orders/index', wait_until='networkidle', timeout=45000)
    time.sleep(5)
    body = pg.inner_text('body')
    print('sale orders has 已支付:', '已支付' in body, '| 来源:', '来源' in body)
    pg.screenshot(path=SHOT + 'coupon3_06_sale_orders.png')
    print('shot: coupon3_06_sale_orders.png')

    # 切到「已支付」tab 找可退单
    pg.evaluate(
        """() => { const els = Array.from(document.querySelectorAll('.chip, text')).filter(e => (e.textContent||'').trim() === '已支付'); if (els.length) els[0].click(); }""")
    time.sleep(3)
    refunds = pg.locator('.refund')
    print('refund buttons =', refunds.count())
    if refunds.count() > 0:
        refunds.first.click()
        time.sleep(1.5)
        pg.screenshot(path=SHOT + 'coupon3_07_sale_refund.png')
        print('shot: coupon3_07_sale_refund.png')
    else:
        print('WARN: 无 PAID 单可退款，跳过退款弹层截图')

    b.close()
print('done')
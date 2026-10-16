# -*- coding: utf-8 -*-
"""券编辑页布局优化截图（390x844 dpr=2，硬规范）：批量选品区上移 + 移除内联搜索
本地预览 http://localhost:5280/guanli/（VITE_API_URL=https://e.joho.cn 直连生产 admin-api）
登录：superadmin / z123123；t2 渠道经 localStorage 注入（superadmin 店铺列表不含 t2）
输出：web-admin/src/static/manual/shots/coupon3_02_edit_bind.png（适用商品区块 + 批量选品入口）
"""
import time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/coupon3_02_edit_bind.png'


def scroll_to(pg, text, offset=120):
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
    pg.locator('input').nth(0).fill('superadmin')
    pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    print('after login url =', pg.url)

    # superadmin 店铺列表不含 t2：直接注入 t2 渠道 token
    pg.evaluate("""() => {
      localStorage.setItem('wa_channel_code', 't2');
      localStorage.setItem('wa_channel_token', '66ruvnhh34svhckaa2i');
    }""")

    pg.goto(BASE + '#/pages/coupon/edit/index?id=82', wait_until='networkidle', timeout=45000)
    time.sleep(5)
    body = pg.inner_text('body')
    print('edit has 适用商品:', '适用商品' in body, '| 折扣:', '折扣' in body, '| 他老婶铁锅炖:', '他老婶铁锅炖' in body)
    assert '他老婶铁锅炖' in body, 't2 渠道未生效：看不到已绑商品'

    scroll_to(pg, '适用商品', 160)
    time.sleep(1.5)
    pg.screenshot(path=SHOT)
    print('shot:', SHOT)
    b.close()
print('done')

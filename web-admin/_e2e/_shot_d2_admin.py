# -*- coding: utf-8 -*-
"""D1 批次：web-admin 后台截图（390x844 dpr=2，硬规范）
场景：
  d2_05_admin_coupon_edit.png : 券编辑页「领取设置」区（允许领取/凭码领券/有效天数/新客/会员等级）
  d2_06_admin_product_bind.png: 商品编辑页「商品专属券」区块（已绑定温泉专享券）
登录：guoxinnanshan@163.com / you123123（租户 t2）+ 注入 t2 channel token
输出：web-admin/src/static/manual/shots/d2_05/d2_06
"""
import os, time
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
os.makedirs(SHOT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()

    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    print('login url=', pg.url)

    # 注入 t2 channel token（web-admin 租户 t2）
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = (d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if (c) { localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2'); return 'OK:'+c.token.slice(0,6); }
        return 'NOCHANNEL:'+JSON.stringify(d).slice(0,150);
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('channel inject=', tok)
    pg.reload(wait_until='networkidle', timeout=45000); time.sleep(3)

    # ===== 场景5: 券编辑页「领取设置」区（t2 模板 id=9 专属券-t2-温泉房间）=====
    pg.goto(BASE + '#/pages/coupon/edit/index?id=9', wait_until='networkidle', timeout=45000); time.sleep(5)
    # 滚动到「领取设置」区（表单较长，该区在下方）
    pg.evaluate("""() => {
      const els = Array.from(document.querySelectorAll('*')).filter(e =>
        (e.textContent||'').trim() === '领取设置' && e.offsetParent !== null);
      if (els.length) { const r = els[0].getBoundingClientRect();
        window.scrollBy(0, r.top + window.scrollY - 40); return 'SCROLLED';
      }
      return 'NOBLOCK';
    }""")
    time.sleep(2)
    body5 = pg.inner_text('body')
    ok5 = '领取设置' in body5 and '允许用户自行领取' in body5 and '凭码领券' in body5
    print('coupon edit 领取设置区:', ok5, '| 含新客:', '仅限新客领取' in body5)
    assert ok5, '领取设置区缺失: ' + body5[:200]
    pg.screenshot(path=SHOT + 'd2_05_admin_coupon_edit.png')
    print('shot: d2_05_admin_coupon_edit.png')

    # ===== 场景6: 商品编辑页「商品专属券」区块（t2 商品 id=60 温泉节假日房间）=====
    pg.goto(BASE + '#/pages/product/edit/index?id=60', wait_until='networkidle', timeout=45000); time.sleep(6)
    # 滚动到绑券区块（页面较长，区块在表单下方）
    pg.evaluate("""() => {
      const els = Array.from(document.querySelectorAll('*')).filter(e =>
        (e.textContent||'').trim() === '商品专属券' && e.offsetParent !== null);
      if (els.length) { const r = els[0].getBoundingClientRect();
        window.scrollBy(0, r.top + window.scrollY - 60); return 'SCROLLED';
      }
      return 'NOBLOCK';
    }""")
    time.sleep(2)
    body6 = pg.inner_text('body')
    ok6 = '商品专属券' in body6 and '专属券-t2-温泉房间' in body6
    print('product bind 区块:', ok6, '| 绑定券:', '专属券-t2-温泉房间' in body6)
    if not ok6:
        # 打印绑券区上下文用于定位
        idx = body6.find('商品专属券')
        print('bind ctx:', body6[idx:idx+300] if idx >= 0 else '未找到商品专属券')
    assert ok6, '商品绑券区块缺失'
    pg.screenshot(path=SHOT + 'd2_06_admin_product_bind.png')
    print('shot: d2_06_admin_product_bind.png')

    b.close()
print('done')

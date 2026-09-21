# -*- coding: utf-8 -*-
# 临时诊断：列出本渠道全部订单（订单号 + 件数），挑一个「非幽灵单且不在第 1 页」的搜索词
from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2');
        return c.token;
      });
    }""")
    res = pg.evaluate("""async (tok) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST', headers:{
          'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
        body: JSON.stringify({query:'query{ orders(options:{take:60}){ totalItems items{ code state totalQuantity totalWithTax orderPlacedAt customer{ firstName lastName phoneNumber } } } }'})});
      return await r.json();
    }""", tok)
    orders = (((res or {}).get('data') or {}).get('orders') or {})
    print('totalItems =', orders.get('totalItems'))
    for i, o in enumerate(orders.get('items') or []):
        c = o.get('customer') or {}
        print(i, o.get('code'), o.get('state'), 'qty=%s' % o.get('totalQuantity'),
              'amt=%s' % o.get('totalWithTax'), o.get('orderPlacedAt'),
              (c.get('firstName') or '') + (c.get('lastName') or ''), c.get('phoneNumber') or '')
    b.close()

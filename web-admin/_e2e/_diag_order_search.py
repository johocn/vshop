# -*- coding: utf-8 -*-
# 临时诊断：搜索「跨页订单号中段子串」为什么 0 行
from playwright.sync_api import sync_playwright
import time, json

BASE = 'https://e.joho.cn/guanli/'
KW = 'GMUSDEF'

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
    print('token =', str(tok)[:8])

    # 1) 直接打 API：4 元素 _or（= 前端 buildOrderFilter 的真实产物）
    tests = {
        'code only': {'_or': [{'code': {'contains': KW}}]},
        '4-or(前端口径)': {'_or': [
            {'code': {'contains': KW}},
            {'contactName': {'contains': KW}},
            {'contactPhone': {'contains': KW}},
            {'remark': {'contains': KW}},
        ]},
        '4-or + filterOperator AND': {'_or': [
            {'code': {'contains': KW}},
            {'contactName': {'contains': KW}},
            {'contactPhone': {'contains': KW}},
            {'remark': {'contains': KW}},
        ], 'filterOperator': 'AND'},
        'baseline': None,
    }
    for label, f in tests.items():
        opts = {'take': 5}
        if f: opts['filter'] = f
        res = pg.evaluate("""async ([tok, opts]) => {
          const t = localStorage.getItem('wa_auth_token');
          const r = await fetch('/admin-api', {method:'POST', headers:{
              'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
            body: JSON.stringify({query:'query Q($o: OrderListOptions){ orders(options:$o){ totalItems items{ code } } }', variables:{o: opts}})});
          return await r.json();
        }""", [tok, opts])
        n = (((res or {}).get('data') or {}).get('orders') or {}).get('totalItems')
        err = ((res or {}).get('errors') or [{}])[0].get('message')
        print(' API', label, '→', n if n is not None else 'ERR:' + str(err))

    # 2) 走 UI：填词 + 点搜索，看 DOM 与页面 body
    pg.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000); time.sleep(6)
    pg.locator('.search .kw input').first.fill(KW)
    time.sleep(1)
    print(' input value =', pg.locator('.search .kw input').first.input_value())
    pg.get_by_text('搜索', exact=True).first.tap()
    time.sleep(5)
    print(' cards =', pg.locator('.card').count(), ' cp =', pg.locator('.cp').count())
    print(' body =', pg.inner_text('body')[:260].replace('\n', '|'))
    b.close()

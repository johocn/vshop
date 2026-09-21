# -*- coding: utf-8 -*-
# 只读探针（二）：判定 OrderListOptions 默认 filterOperator 语义（AND vs OR），
# 以及 options 级 filterOperator 是否可显式切换。用于决定 buildOrderFilter 的正确修法。
from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'
PICKUP = {'deliveryType': {'eq': 'pickup'}}
ST_IN = {'state': {'in': ['PaymentAuthorized', 'PaymentSettled']}}
BOTH = {**PICKUP, **ST_IN}

CASES = [
    ('单·pickup', PICKUP, {}),
    ('单·state.in', ST_IN, {}),
    ('组合·默认(不写)', BOTH, {}),
    ('组合·options AND', BOTH, {'filterOperator': 'AND'}),
    ('组合·options OR', BOTH, {'filterOperator': 'OR'}),
]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
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
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2');
        return c.token;
      });
    }""")
    print('channel token =', str(tok)[:8])
    for label, flt, extra in CASES:
        opts = {'take': 1, 'filter': flt}
        opts.update(extra)
        res = pg.evaluate("""async ([tok, opts]) => {
          const t = localStorage.getItem('wa_auth_token');
          const r = await fetch('/admin-api', {method:'POST', headers:{
              'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
            body: JSON.stringify({query:'query Q($o: OrderListOptions){ orders(options:$o){ totalItems } }', variables:{o: opts}})});
          return await r.json();
        }""", [tok, opts])
        n = (((res or {}).get('data') or {}).get('orders') or {}).get('totalItems')
        err = ((res or {}).get('errors') or [{}])[0].get('message')
        print(f'{label:20s} → ' + (str(n) if n is not None else 'ERR: ' + str(err)))
    b.close()

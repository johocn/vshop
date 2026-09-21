# -*- coding: utf-8 -*-
# 只读探针：验证「多条件组合」的 filterOperator 正确落点。
# 背景：buildOrderFilter 在多条件时把 filterOperator 写进 filter 对象内；
#       探针已证 OrderFilterParameter 无该字段 → 组合筛选会 GraphQL 报错。
# 本探针判定三种写法谁可用：① filter 内嵌 ② options 级 ③ 不写（依赖默认 AND）
from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'

# 组合条件：关键词 + 今日时间 + 状态（三者同时生效，最贴近真实「搜索+时间+tab」）
KW = {'_or': [{'code': {'contains': '2'}}, {'contactName': {'contains': '2'}}]}
STATE = {'state': {'in': ['Created', 'AddingItem', 'AddingItems', 'ArrangingPayment', 'PaymentAuthorized', 'PaymentSettled']}}


def today_window():
    import datetime
    s = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).astimezone()
    e = s + datetime.timedelta(days=1)
    return {'orderPlacedAt': {'between': {'start': s.isoformat(), 'end': e.isoformat()}}}


def merged():
    f = {}
    f.update(KW)
    f.update(STATE)
    f.update(today_window())
    return f


CASES = [
    # (标签, filter, options 级附加)
    ('A 单条件 state.in', STATE, {}),
    ('B 组合·filter 内嵌 filterOperator', {**merged(), 'filterOperator': 'AND'}, {}),
    ('C 组合·options 级 filterOperator', merged(), {'filterOperator': 'AND'}),
    ('D 组合·不写 filterOperator', merged(), {}),
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
        print(f'{label:36s} → ' + (str(n) if n is not None else 'ERR: ' + str(err)))
    b.close()

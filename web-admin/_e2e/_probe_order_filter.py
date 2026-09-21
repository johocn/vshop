# -*- coding: utf-8 -*-
# 只读探针：验证生产 admin-api 的 OrderFilterParameter 过滤真实生效（各条件 totalItems 有区分度）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import json, time

BASE = 'https://e.joho.cn/guanli/'
QUERIES = [
    # (标签, filter)
    ('baseline(无filter)', None),
    ('state.in 待发货', {'state': {'in': ['PaymentAuthorized', 'PaymentSettled']}}),
    ('keyword _or 冒烟', {'_or': [{'code': {'contains': '2'}}]}),
    ('今日 createdAt.between', 'TODAY'),
    ('配送=自提', {'deliveryType': {'eq': 'pickup'}}),
    ('配送=快递', {'deliveryType': {'eq': 'delivery'}}),
    ('配送 deliveryType 为空', {'deliveryType': {'isNull': True}}),
    ('异常 exceptionType 非空', {'exceptionType': {'isNull': False}}),
    ('异常类型 damaged', {'exceptionType': {'eq': 'damaged'}}),
    ('售后 in 集合', {'afterSalesStatus': {'in': ['Pending', 'Approved', 'Returning', 'Received', 'RefundFailed']}}),
]

def today_window():
    import datetime
    # 必须带时区偏移：Vendure 的 DateTime 标量拒绝 "2026-09-22T00:00:00"（无偏移）——
    # 前端实现用 Date#toISOString()（带 Z）不受影响，此处仅为探针自身修正。
    s = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).astimezone()
    e = s + datetime.timedelta(days=1)
    return {'createdAt': {'between': {'start': s.isoformat(), 'end': e.isoformat()}}}

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
    out = []
    for label, f in QUERIES:
        flt = today_window() if f == 'TODAY' else f
        opts = {'take': 1}
        if flt: opts['filter'] = flt
        res = pg.evaluate("""async ([tok, opts]) => {
          const t = localStorage.getItem('wa_auth_token');
          const r = await fetch('/admin-api', {method:'POST', headers:{
              'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
            body: JSON.stringify({query:'query Q($o: OrderListOptions){ orders(options:$o){ totalItems } }', variables:{o: opts}})});
          return await r.json();
        }""", [tok, opts])
        n = (((res or {}).get('data') or {}).get('orders') or {}).get('totalItems')
        err = ((res or {}).get('errors') or [{}])[0].get('message')
        out.append((label, n if n is not None else 'ERR:' + str(err)))
    for label, n in out:
        print(f'{label:28s} → {n}')
    b.close()

# -*- coding: utf-8 -*-
# 只读探针（三）：时间维度口径核对。假设：加购中/待处理单 orderPlacedAt 为 null，
# 故 orderPlacedAt.between 会把它们排除（今日=0、本月=0）。对比 createdAt.between。
from playwright.sync_api import sync_playwright
import time, datetime

BASE = 'https://e.joho.cn/guanli/'


def month_window(field):
    now = datetime.datetime.now()
    s = datetime.datetime(now.year, now.month, 1).astimezone()
    e = datetime.datetime(now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1, 1).astimezone()
    return {field: {'between': {'start': s.isoformat(), 'end': e.isoformat()}}}


PENDING = ['Created', 'AddingItems', 'ArrangingPayment']

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
        localStorage.setItem('wa_channel_token', c.token);
        return c.token;
      });
    }""")

    def q(opts):
        return pg.evaluate("""async ([tok, opts]) => {
          const t = localStorage.getItem('wa_auth_token');
          const r = await fetch('/admin-api', {method:'POST', headers:{
              'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
            body: JSON.stringify({query:'query Q($o: OrderListOptions){ orders(options:$o){ totalItems } }', variables:{o: opts}})});
          const d = await r.json();
          return ((d.data||{}).orders||{}).totalItems ?? ('ERR:'+JSON.stringify((d.errors||[{}])[0].message));
        }""", [tok, opts])

    cases = [
        ('createdAt 本月', month_window('createdAt')),
        ('orderPlacedAt 本月', month_window('orderPlacedAt')),
        ('createdAt 本月 + 待处理', {**month_window('createdAt'), 'state': {'in': PENDING}}),
        ('orderPlacedAt 本月 + 待处理', {**month_window('orderPlacedAt'), 'state': {'in': PENDING}}),
        ('待处理(无时间)', {'state': {'in': PENDING}}),
    ]
    for label, f in cases:
        print(f'{label:26s} → {q({"take": 1, "filter": f})}')

    # 抽样看几单的 orderPlacedAt / createdAt 实际值
    sample = pg.evaluate("""async ([tok]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST', headers:{
          'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':tok},
        body: JSON.stringify({query:'query{ orders(options:{take:6}){ items{ code state orderPlacedAt createdAt } } }'})});
      const d = await r.json();
      return ((d.data||{}).orders||{}).items || [];
    }""", [tok])
    print('--- 抽样 6 单 ---')
    for s in sample:
        print(f"  {s['code']:20s} {s['state']:18s} placed={s['orderPlacedAt']} created={s['createdAt']}")
    b.close()

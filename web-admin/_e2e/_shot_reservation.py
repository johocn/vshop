# -*- coding: utf-8 -*-
# 预留单多仓拆分发货截图（租户管理员视角，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 路径：优先用 t2 预留单 orderId 直进发货页（有仓库选择器）；无预留单则订单列表找待发货订单点「发货」进发货页
from playwright.sync_api import sync_playwright
import time, json
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/src/static/manual/shots/'
def shot(pg, name, delay=0):
    if delay: time.sleep(delay)
    pg.screenshot(path=SHOT+name)
    print('shot:', name)
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg=ctx.new_page()
    pg.goto(BASE,wait_until='networkidle',timeout=45000)
    pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible',timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click(); time.sleep(7)
    print('登录后 url=',pg.url, 'body=', pg.inner_text('body')[:120].replace('\n','|'))
    # 选店：通过 API 获取 t2 channel token 注入 localStorage（绕开选店 UI 交互不稳定）
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = (d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if (c) { localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2'); return 'OK:'+c.token.slice(0,6); }
        return 'NOCHANNEL';
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('channel token inject=', tok)
    # 查 t2 是否有预留单（admin-api, Bearer wa_auth_token）
    rinfo = pg.evaluate("""async () => {
      const t = localStorage.getItem('wa_auth_token');
      if (!t) return JSON.stringify({ err: 'NOTOKEN' });
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query { reservations(pageSize: 20) { totalItems items { orderId status } } }'})
      });
      const d = await r.json();
      if (d.errors) return JSON.stringify({ err: JSON.stringify(d.errors).slice(0,200) });
      const items = (d.data && d.data.reservations && d.data.reservations.items) || [];
      return JSON.stringify({ total: d.data.reservations.totalItems, first: items[0] || null });
    }""")
    print('reservations query=', rinfo)
    path = 'unknown'
    orderId = ''
    try:
        info = json.loads(rinfo)
        if info.get('err'):
            print('reservation query err, fallback to order list:', info['err'])
            path = 'fallback-query-err'
        elif info.get('first') and info['first'].get('orderId'):
            orderId = info['first']['orderId']
            path = 'reservation-direct'
        else:
            path = 'fallback-no-reservation'
    except Exception as e:
        path = 'fallback-parse-err'
        print('reservation info parse err:', str(e)[:120])
    if orderId:
        pg.goto(BASE+'#/pages/order/ship/index?id='+orderId,wait_until='networkidle',timeout=45000); time.sleep(6)
        print('ship page (reservation direct) url=',pg.url)
    else:
        # 无预留单：订单列表 → 待发货 tab → 点「发货」→ 确认「进入发货」
        pg.goto(BASE+'#/pages/order/list/index',wait_until='networkidle',timeout=45000); time.sleep(6)
        try:
            pg.locator('.tabs text', has_text='待发货').first.tap(); time.sleep(3)
        except Exception as e:
            print('tab 待发货 tap fail:', str(e)[:120])
        print('order list body=',pg.inner_text('body')[:300].replace('\n','|'))
        try:
            pg.locator('.act.ship').first.tap(); time.sleep(2)
            pg.locator('text=进入发货').first.tap(timeout=8000); time.sleep(6)
        except Exception as e:
            print('ship tap/modal fail（仍截图当前页）:', str(e)[:160])
    print('ship page body=',pg.inner_text('body')[:400].replace('\n','|'))
    print('ACTUAL PATH:', path)
    shot(pg,'r15_reservation_ship.png')
    b.close()
print('done')

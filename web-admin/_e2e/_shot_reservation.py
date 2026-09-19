# -*- coding: utf-8 -*-
# 预留单多仓拆分发货截图（租户管理员视角，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 路径：订单列表（本店渠道单）找可发货订单点「发货」→ 确认「进入发货」→ 发货页
# 只读导航：不提交发货（不进 submit），出现确认框一律点取消/关闭。
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
    # 预留单探测（只读，不写；需带 channel token 上下文 vendure-token）
    rinfo = pg.evaluate("""async () => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const h = {'Content-Type':'application/json','Authorization':'Bearer '+t};
      if (ct) h['vendure-token'] = ct;
      const r = await fetch('/admin-api', {method:'POST',
        headers:h,
        body: JSON.stringify({query:'query { reservations(pageSize: 20) { totalItems items { orderId status } } }'})});
      const d = await r.json();
      if (d.errors) return JSON.stringify({ err: JSON.stringify(d.errors).slice(0,120) });
      const items = (d.data && d.data.reservations && d.data.reservations.items) || [];
      return JSON.stringify({ total: d.data.reservations.totalItems, first: items[0] || null });
    }""")
    print('reservations query=', rinfo)
    # 进入订单列表（默认本店渠道单 scope）
    pg.goto(BASE+'#/pages/order/list/index',wait_until='networkidle',timeout=45000); time.sleep(6)
    print('order list body=',pg.inner_text('body')[:300].replace('\n','|'))
    # 路径一：UI 点「发货」→ 确认「进入发货」（click 而非 tap，兼容 uni-modal 按钮事件）
    ship_ok = False
    flow = 'unknown'
    for attempt in range(3):
        try:
            pg.locator('.act.ship').first.tap(timeout=8000)
        except Exception as e:
            print(f'ship btn tap fail attempt={attempt}:', str(e)[:120])
            break
        time.sleep(1.5)
        try:
            if pg.locator('text=进入发货').count() > 0:
                pg.locator('text=进入发货').first.click(timeout=5000)
                print('confirm modal clicked')
            else:
                print('no confirm modal（可能直进）')
        except Exception as e:
            try:
                pg.locator('text=进入发货').first.tap(timeout=4000)
                print('confirm modal tapped (fallback)')
            except Exception as e2:
                print('confirm tap fail:', str(e2)[:120])
        try:
            pg.wait_for_url('**/pages/order/ship/index*', timeout=12000)
            ship_ok = True
            flow = 'ui-flow'
            break
        except Exception as e:
            print(f'attempt={attempt} 未到发货页 url=', pg.url[:140])
    # 路径二（兜底）：orders API 取第一个待发货订单直进发货页（绕开 Modal 自动化不确定性）
    if not ship_ok:
        order_info = pg.evaluate("""async () => {
          const t = localStorage.getItem('wa_auth_token');
          const ct = localStorage.getItem('wa_channel_token');
          const h = {'Content-Type':'application/json','Authorization':'Bearer '+t};
          if (ct) h['vendure-token'] = ct;
          const r = await fetch('/admin-api', {method:'POST',
            headers:h,
            body: JSON.stringify({query:'query { orders(options: { take: 10 }) { items { id code state } } }'})});
          const d = await r.json();
          if (d.errors) return JSON.stringify({err: JSON.stringify(d.errors).slice(0,120)});
          const items = (d.data && d.data.orders && d.data.orders.items) || [];
          const picked = items.find(o => o.state === 'PaymentAuthorized' || o.state === 'PaymentSettled') || items[0] || null;
          return JSON.stringify({total: items.length, picked: picked ? {id: picked.id, code: picked.code, state: picked.state} : null});
        }""")
        print('order info=', order_info)
        try:
            oi = json.loads(order_info)
            oid = (oi.get('picked') or {}).get('id','')
            if oid:
                pg.goto(BASE+'#/pages/order/ship/index?id='+oid,wait_until='networkidle',timeout=45000); time.sleep(5)
                flow = 'direct-flow'
                ship_ok = True
            else:
                print('no shippable order found:', order_info)
        except Exception as e:
            print('direct flow fail:', str(e)[:120])
    # UI 流程残留的确认 Modal 会遮挡发货页：直进后 reload 一次清掉（页面状态重置，重新加载发货数据）
    if ship_ok and flow == 'direct-flow' and pg.locator('text=进入发货').count() > 0:
        pg.reload(wait_until='networkidle', timeout=45000); time.sleep(5)
        print('reloaded to clear residual confirm modal')
    time.sleep(3)
    if ship_ok:
        body_txt = pg.inner_text('body')
        print('ship page url=', pg.url)
        print('ship page body=', body_txt[:400].replace('\n','|'))
        wh = '仓库：' in body_txt or 'wh-pick' in pg.inner_html('body')
        path = (flow or '') + ('/ship-multi-wh' if wh else '/ship-single-wh')
    else:
        path = 'not-reached'
        print('未到达发货页 body=', pg.inner_text('body')[:200].replace('\n','|'))
    print('ACTUAL PATH:', path)
    shot(pg,'r15_reservation_ship.png')
    b.close()
print('done')

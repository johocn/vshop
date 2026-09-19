# -*- coding: utf-8 -*-
# 订单列表多版式（classic/status-first/status-group）截图（租户管理员视角，390x844 dpr=2）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import time
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
    # 1) 订单列表（默认 classic 版式，390x844 手机卡片）
    pg.goto(BASE+'#/pages/order/list/index',wait_until='networkidle',timeout=45000); time.sleep(6)
    print('order list body=',pg.inner_text('body')[:500].replace('\n','|'))
    shot(pg,'order_classic.png')
    # 2) 顶栏「版式」→ 弹层选「状态优先（运维视角）」
    pg.locator('.layout-btn').tap(); time.sleep(1.5)
    print('layout pop body=',pg.inner_text('body')[:300].replace('\n','|'))
    pg.locator('.pop-item', has_text='状态优先').tap(); time.sleep(2.5)
    shot(pg,'order_status_first.png')
    # 3) 再点「版式」→ 选「按状态分组（分区导航）」
    pg.locator('.layout-btn').tap(); time.sleep(1.5)
    pg.locator('.pop-item', has_text='按状态分组').tap(); time.sleep(2.5)
    shot(pg,'order_status_group.png')
    b.close()
print('done')

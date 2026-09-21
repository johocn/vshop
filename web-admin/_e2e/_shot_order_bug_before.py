# -*- coding: utf-8 -*-
# 「修复前」证据截图：线上旧构建在多条件组合（时间 + 状态）下 GraphQL 报错 →
# 列表空白 + 错误 toast。用于操作手册「问题复现」小节，与本修复后的同名截图形成对照。
# 只读（不改任何数据），仅截图。
from playwright.sync_api import sync_playwright
import time, os

BASE = 'https://e.joho.cn/guanli/'
OUT = 'd:/zhao/vshop/web-admin/_e2e/orderlist_bug_before_390.png'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

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
    pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if(c){ localStorage.setItem('wa_channel_token', c.token); localStorage.setItem('wa_channel_code','t2'); }
      });
    }""")
    pg.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
    time.sleep(6)
    # 组合条件：时间（今日）+ 状态（待发货）
    pg.get_by_text('今日', exact=True).first.tap(); time.sleep(3)
    pg.locator('.grp', has_text='进行中').first.locator('.gh').tap(); time.sleep(2)
    pg.locator('.gtab', has_text='待发货').first.tap()
    # toast 只显示约 2s，必须等它出现立刻截，否则截到空白
    try:
        pg.wait_for_selector('uni-toast', state='visible', timeout=8000)
    except Exception as e:
        print('toast 未出现:', e)
    print('body =', pg.inner_text('body')[:400].replace('\n', '|'))
    print('toast text =', (pg.locator('uni-toast').first.inner_text() if pg.locator('uni-toast').count() else '(none)'))
    pg.screenshot(path=OUT)
    print('shot:', OUT)
    b.close()

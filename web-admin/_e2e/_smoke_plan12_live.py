# -*- coding: utf-8 -*-
# 线上冒烟核对（只读）：确认 Plan 1 订单列表页 / Plan 2 库存页当前线上状态正常。
from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'


def login(pg):
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


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    login(pg)

    # Plan 1：订单列表
    pg.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
    time.sleep(6)
    print('[Plan1 订单列表] toast =', pg.locator('uni-toast').count(),
          '| 统计卡 =', pg.locator('.stat').count(),
          '| 分组 =', pg.locator('.grp').count(),
          '| 卡片 =', pg.locator('.card, .cp').count(),
          '| 版式入口 =', pg.locator('.layout-btn').count())

    # Plan 2：库存页
    pg.goto(BASE + '#/pages/inventory/stock/index', wait_until='networkidle', timeout=45000)
    time.sleep(8)
    print('[Plan2 库存页] toast =', pg.locator('uni-toast').count(),
          '| KPI 卡 =', pg.locator('.kpi, .kpi-item, .kpi-card').count(),
          '| 分桶 tab =', pg.locator('.bucket, .b-tab').count(),
          '| 库存卡 =', pg.locator('.sku-card, .stock-card, .card').count())
    print('  body head =', pg.inner_text('body')[:220].replace('\n', '|'))
    b.close()

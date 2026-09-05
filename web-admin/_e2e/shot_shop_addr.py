# -*- coding: utf-8 -*-
# 本店商品单补地址：在「本店商品单」scope、「全部」tab 下截图(含真实收货地址行), 供操作手册。
# 输出: docs/webadmin-bugfix-manual/assets/shop-addr-mobile-390.png / shop-addr-desk-1440.png
from playwright.sync_api import sync_playwright
import time, os
BASE='https://e.joho.cn/guanli/'
ASSET='d:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets'
os.makedirs(ASSET, exist_ok=True)
def run(vp, name):
    with sync_playwright() as p:
        b=p.chromium.launch(headless=True)
        pg=b.new_page(viewport=vp); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
        pg.goto(BASE,wait_until='networkidle',timeout=45000)
        pg.evaluate('localStorage.clear()'); pg.reload(wait_until='networkidle',timeout=45000)
        pg.locator('input').nth(0).fill('superadmin'); pg.locator('input').nth(1).fill('z123123')
        pg.locator('button, .btn').first.click(); time.sleep(4)
        pg.locator('.item',has_text='t1').first.click(); time.sleep(4)
        pg.goto(BASE+'#/pages/order/list/index',wait_until='networkidle',timeout=45000); time.sleep(3)
        pg.locator('.scope').get_by_text('本店商品单',exact=True).click(); time.sleep(3)
        # 确认停在「全部」tab, 有真实地址数据
        addr = pg.locator('.card .addr').count() + pg.locator('.dt-row:not(.head) .c-addr').count()
        pg.screenshot(path=os.path.join(ASSET, name), full_page=True)
        print(f'SHOT {name}: ADDR_NODES={addr} PAGEERRORS={errs if errs else "(none)"}')
        b.close()
run({'width':390,'height':844},'shop-addr-mobile-390.png')
run({'width':1440,'height':900},'shop-addr-desk-1440.png')
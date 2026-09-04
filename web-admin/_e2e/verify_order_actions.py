# -*- coding: utf-8 -*-
# 回归：操作区状态化快捷按钮 + 卡片缩略图。superadmin 选店 t1。
from playwright.sync_api import sync_playwright
import time
BASE='https://e.joho.cn/guanli/'
SHOT='d:/zhao/vshop/web-admin/_e2e/'
def run(vp,tag):
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
        body=pg.inner_text('body')
        has_ship  = '发货' in body
        has_redeem= '去核销' in body
        has_detail= '详情' in body
        has_thumb = pg.locator('image.g-thumb').count()>0
        pg.screenshot(path=SHOT+'order_actions_'+('desk_1440.png' if tag=='desk' else 'mobile_390.png'),full_page=True)
        print('=== TAG',tag,'===  ALL_OK', has_ship and has_redeem and has_detail)
        print('HAS_SHIP=',has_ship,'HAS_REDEEM=',has_redeem,'HAS_DETAIL=',has_detail,'HAS_THUMB_IMG=',has_thumb)
        print('PAGEERRORS=',errs if errs else '(none)','| BODY_HEAD=',body[:80].replace('\n','|'))
        b.close()
run({'width':390,'height':844},'mobile')
run({'width':1440,'height':900},'desk')
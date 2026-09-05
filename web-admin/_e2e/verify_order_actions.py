# -*- coding: utf-8 -*-
# 回归：操作区状态化快捷按钮 + 卡片缩略图/占位 + 桌面 headbar。superadmin 选店 t1。
# 注：线上 t1「本店渠道单」为空(订单建于默认/其他渠道, myShopOrders 按 shopId 归集)，
#     核销 myPickupOrders 未授权。故本脚本切到「本店商品单」scope 用选择器断言按钮/占位缩略图。
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
        # 桌面 headbar 单行：title 与 redeem 在同一视觉行（CSS 断言仅 desktop 意义，这里只报 DOM 存在）
        has_headbar = pg.locator('.headbar .title').count()>0 and pg.locator('.headbar .redeem-btn').count()>0
        # 切到「本店商品单」（有真实数据 18 单）
        pg.locator('.scope').get_by_text('本店商品单',exact=True).click(); time.sleep(3)
        body=pg.inner_text('body')
        ship_btns  = pg.locator('.act.ship').count()     # 发货按钮
        detail_btns= pg.locator('.act.ghost').count()     # 详情按钮
        redeem_btns= pg.locator('.act.redeem').count()    # 去核销按钮（线上核销未授权→可能为0）
        thumb_total = pg.locator('.g-thumb').count()      # 缩略图位：商品单=占位 view，渠道单=image
        thumb_img   = pg.locator('.g-thumb image, .g-thumb uni-image, .g-thumb img').count()
        ok_ship   = ship_btns>0
        ok_detail = detail_btns>0
        ok_thumb  = thumb_total>0
        pg.screenshot(path=SHOT+'order_actions_'+('desk_1440.png' if tag=='desk' else 'mobile_390.png'),full_page=True)
        print('=== TAG',tag,'===  ALL_OK', ok_ship and ok_detail and ok_thumb)
        print('HEADBAR=',has_headbar,'SHIP_BTNS=',ship_btns,'DETAIL_BTNS=',detail_btns,'REDEEM_BTNS=',redeem_btns)
        print('THUMB_TOTAL=',thumb_total,'THUMB_IMG=',thumb_img,'| PAGEERRORS=',errs if errs else '(none)')
        b.close()
run({'width':390,'height':844},'mobile')
run({'width':1440,'height':900},'desk')
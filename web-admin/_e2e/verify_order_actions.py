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
        # 按商品名搜索（商品单全量本地过滤）：取首单首个商品名，填写应命中 >=1 单，随后清空
        product_name_ok = False
        gname_el = pg.locator('.card .goods .g-name').first
        if gname_el.count() > 0:
            nm = gname_el.inner_text().strip()
            if nm:
                # uni-app H5 把 <input class="kw"> 编译成 <uni-input>，fill 需定位内部 input
                pg.locator('.kw input').fill(nm)
                pg.locator('.search .btn').click(); time.sleep(3)
                product_name_ok = pg.locator('.card').count() >= 1
                pg.locator('.kw input').fill('')
                pg.locator('.search .btn').click(); time.sleep(3)
        ship_btns  = pg.locator('.act.ship').count()     # 发货按钮
        detail_btns= pg.locator('.act.ghost').count()    # 详情按钮
        redeem_btns= pg.locator('.act.redeem').count()   # 去核销按钮（线上核销未授权→可能为0）
        thumb_total = pg.locator('.g-thumb').count()      # 缩略图位：商品单=占位 view，渠道单=image
        thumb_img   = pg.locator('.g-thumb image, .g-thumb uni-image, .g-thumb img').count()
        remind_btns = pg.locator('.act.remind').count()   # 催付按钮(仅待付款单出现)
        ok_ship      = ship_btns>0
        ok_detail    = detail_btns>0
        ok_thumb     = thumb_total>0
        ok_thumb_img = thumb_img>0                        # 新feature: 商品单商品行出现真实缩略图
        stat_cards   = pg.locator('.stat').count()          # 统计卡 = 4(今日/待付款/待发货/待退款)
        dg_rows      = pg.locator('.dt .c-goods .dg').count() if tag=='desk' else 0  # 桌面商品缩略图行
        ok_stat4     = stat_cards==4
        ok_dg        = (not (tag=='desk')) or dg_rows>0
        filter_chips = pg.locator('.filters .f-chip').count()
        pgbar_ok = True
        if tag == 'desk':
            # 分页条仅渲染于「本店渠道单」scope；桌面切过去验证再切回商品单（保持截图视角）
            try:
                pg.locator('.scope').get_by_text('本店渠道单', exact=True).click(); time.sleep(3)
                pgbar_ok = pg.locator('.pgbar .pg-info').count() >= 1
                pg.locator('.scope').get_by_text('本店商品单', exact=True).click(); time.sleep(3)
            except Exception:
                pgbar_ok = False
        copied = False
        # 桌面用「非表头行的 c-code」（表头也有 .c-code 但无 @tap）；手机卡片 .code 无表头
        sel = '.dt .dt-row:not(.head) .c-code' if tag=='desk' else '.card .code'
        code_el = pg.locator(sel).first
        if code_el.count()>0:
            code_el.click(); time.sleep(1)
            copied = '订单号已复制' in pg.inner_text('body')
        ALL_OK = (ok_ship and ok_detail and ok_thumb and ok_thumb_img
                  and ok_stat4 and ok_dg and copied
                  and product_name_ok and filter_chips >= 2 and pgbar_ok)
        # 若未付款单存在则切到「待付款」tab 再统计催付按钮(数据依赖; 无待付款单允许为 0)
        remind_on_unpaid = remind_btns
        try:
            pg.locator('.tabs').get_by_text('待付款',exact=True).first.click()
            time.sleep(2)
            remind_on_unpaid = pg.locator('.act.remind').count()
        except Exception:
            remind_on_unpaid = remind_btns
        pg.screenshot(path=SHOT+'order_actions_'+('desk_1440.png' if tag=='desk' else 'mobile_390.png'),full_page=True)
        print('=== TAG',tag,'===  ALL_OK', ALL_OK, 'STAT_4=',stat_cards,'DG_ROWS=',dg_rows,'COPY_OK=',copied,'PRODUCT_NAME_OK=',product_name_ok,' FILTER_CHIPS=',filter_chips,' PGBAR_OK=',pgbar_ok)
        print('HEADBAR=',has_headbar,'SHIP_BTNS=',ship_btns,'DETAIL_BTNS=',detail_btns,'REDEEM_BTNS=',redeem_btns)
        print('THUMB_TOTAL=',thumb_total,'THUMB_IMG=',thumb_img,'REMIND_BTNS=',remind_btns,'REMIND_ON_UNPAID=',remind_on_unpaid,'| PAGEERRORS=',errs if errs else '(none)')
        b.close()
run({'width':390,'height':844},'mobile')
run({'width':1440,'height':900},'desk')
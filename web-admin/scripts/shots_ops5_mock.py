# -*- coding: utf-8 -*-
"""ops5 mock 兜底截图：①库存预警列表(拦截 stockLevels 渲染假数据+勾选) ②POS 小票卡(拦截 myPendingRedemptions/lookup/claim)。
仅拦截读取类接口渲染 UI，不改动生产数据。390x844 dpr2。"""
import time, json as J
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
EMAIL = 'guoxinnanshan@163.com'; PWD = 'you123123'
OUT = 'src/static/manual/shots/'

MOCK_STOCK = {"data": {"stockLevels": {"totalItems": 4, "items": [
    {"id": "m1", "productVariantId": "1001", "stockLocationId": "3", "stockOnHand": 3, "stockAllocated": 0},
    {"id": "m2", "productVariantId": "1002", "stockLocationId": "3", "stockOnHand": 0, "stockAllocated": 0},
    {"id": "m3", "productVariantId": "1003", "stockLocationId": "3", "stockOnHand": 12, "stockAllocated": 0},
    {"id": "m4", "productVariantId": "1004", "stockLocationId": "3", "stockOnHand": 4, "stockAllocated": 0},
]}}}

MOCK_PENDING = {"data": {"myPendingRedemptions": {"items": [
    {"orderId": "88", "orderCode": "ZP202609210001", "code": "FTW68F", "status": "active",
     "expiresAt": None, "version": 1, "claimed": False, "paymentType": "cod",
     "collected": False,
     "lines": [{"name": "验证基线商品", "quantity": 1, "lineTotalWithTax": 8800}]},
], "totalItems": 1}}}

MOCK_LOOKUP = {"data": {"redemptionLookup": {
    "order": {"id": "88", "code": "ZP202609210001", "state": "PaymentAuthorized", "totalWithTax": 8800},
    "claimed": False, "claimedAt": None, "status": "active", "expiresAt": None,
    "version": 1, "reissueable": True, "paymentType": "cod", "collected": False,
}}}

MOCK_CLAIM = {"data": {"redemptionClaim": {
    "claimed": True, "claimedAt": "2026-09-21T10:30:00.000Z", "message": "ok",
    "status": "active", "expiresAt": None, "version": 2,
    "collectRequired": False, "collected": True,
    "order": {"id": "88", "code": "ZP202609210001", "state": "Delivered", "totalWithTax": 8800},
}}}

def dismiss_modal(page):
    try:
        page.evaluate('document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("取消"))b.click()})')
        time.sleep(0.6)
    except Exception:
        pass

def click_confirm(page):
    try:
        page.evaluate('document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("收款")||b.innerText.includes("确定")||b.innerText.includes("确认"))b.click()})')
        time.sleep(0.8)
    except Exception:
        pass

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = ctx.new_page()

        def make_interceptor(mode):
            def handler(route):
                body = route.request.post_data or ''
                if mode == 'stock' and 'stockLevels' in body and 'locationId' in body:
                    route.fulfill(status=200, content_type='application/json',
                                  body=J.dumps(MOCK_STOCK))
                elif mode == 'pos':
                    if 'myPendingRedemptions' in body:
                        print('  [route] myPendingRedemptions'); route.fulfill(status=200, content_type='application/json', body=J.dumps(MOCK_PENDING))
                    elif 'redemptionLookup' in body:
                        print('  [route] redemptionLookup'); route.fulfill(status=200, content_type='application/json', body=J.dumps(MOCK_LOOKUP))
                    elif 'redemptionClaim' in body:
                        print('  [route] redemptionClaim'); route.fulfill(status=200, content_type='application/json', body=J.dumps(MOCK_CLAIM))
                    elif 'activeChannel' in body:
                        print('  [route] activeChannel'); route.fulfill(status=200, content_type='application/json', body=J.dumps({"data": {"activeChannel": {"id": "2", "code": "t2", "token": "66ruvnhh34sv", "customFields": {"shopName": "t2 测试店铺"}}}}))
                    else:
                        print('  [route] other'); route.continue_()
                else:
                    route.continue_()
            return handler

        # ===== 登录 =====
        page.goto(BASE + '#/pages/login/index', wait_until='networkidle', timeout=40000)
        page.wait_for_selector('input[type="text"]', timeout=20000)
        fields = page.query_selector_all('input')
        fields[0].fill(EMAIL); fields[1].fill(PWD)
        page.click('text=登 录')
        page.wait_for_load_state('networkidle', timeout=15000); time.sleep(3)
        dismiss_modal(page)
        cht = page.evaluate('localStorage.getItem("wa_channel_token")')
        if not cht:
            page.goto(BASE + '#/pages/channel-select/index', wait_until='networkidle', timeout=20000); time.sleep(2)
            dismiss_modal(page)
            page.evaluate('document.querySelectorAll(".uni-mask").forEach(m=>m.remove())')
            t2 = page.query_selector('.item:has-text("t2")') or page.query_selector('.item:has-text("T2")') or page.query_selector('.item')
            if t2: t2.click()
            time.sleep(2.5)
            dismiss_modal(page)
        print('cht=', (page.evaluate('localStorage.getItem("wa_channel_token")') or '')[:12])

        # ===== ① 库存预警（mock stockLevels）=====
        page.route('**/admin-api', make_interceptor('stock'))
        page.goto(BASE + '#/pages/inventory/stock/index', wait_until='networkidle', timeout=25000)
        time.sleep(3)
        dismiss_modal(page)
        page.screenshot(path=OUT + 'inv_alert.png')
        print('inv_alert shot done')
        # 勾选第一行（低库存）与第二行（缺货）
        try:
            rows = page.query_selector_all('.card')
            for idx in [0, 1]:
                if idx < len(rows):
                    rows[idx].click()
                    time.sleep(0.5)
        except Exception as e:
            print('check fail', e)
        time.sleep(1)
        page.screenshot(path=OUT + 'inv_alert_checked.png')
        print('inv_alert_checked shot done')
        page.unroute('**/admin-api')

        # ===== ② POS 小票卡（mock 待核销/查询/核销）=====
        page.route('**/admin-api', make_interceptor('pos'))
        page.goto(BASE + '#/pages/pos/index', wait_until='networkidle', timeout=25000)
        time.sleep(2)
        dismiss_modal(page)
        page.fill('.code-input input', 'FTW68F')
        page.click('.query-btn')
        time.sleep(2.5)
        dismiss_modal(page)
        has_result = page.evaluate('document.querySelector(".result")!==null')
        print('result:', has_result)
        if has_result:
            page.screenshot(path=OUT + 'ops5_pos_result.png')
            page.click('.collect-btn')
            time.sleep(1.5)
            print('after collect txt:', page.evaluate('document.body.innerText').replace(chr(10),'|')[:200])
            btns = page.evaluate('Array.from(document.querySelectorAll(".uni-modal__btn")).map(b=>b.innerText)')
            print('modal btns:', btns)
            page.screenshot(path=OUT + '_dbg_modal.png')
            click_confirm(page)
            time.sleep(2.5)
            rc = page.evaluate('document.querySelector(".receipt-mask")!==null')
            print('receipt visible:', rc)
            print('after confirm txt:', page.evaluate('document.body.innerText').replace(chr(10),'|')[:250])
            page.screenshot(path=OUT + 'ops5_pos_receipt.png')
        else:
            page.screenshot(path=OUT + 'ops5_pos.png')
        b.close()
        print('DONE')

if __name__ == '__main__':
    main()

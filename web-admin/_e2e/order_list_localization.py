# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import sys, time

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5280/guanli/'
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'order_local_'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'

def run(viewport, tag):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport=viewport)
        errs = []
        console_msgs = []
        graphql_errs = []  # 捕获 orders/shopOrders 响应里的 GraphQL error message
        page.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)[:400]))
        page.on('console', lambda m: console_msgs.append(f'{m.type}: {m.text[:300]}'))
        def on_response(res):
            u = res.url
            if 'graphql' in u or 'orders' in u.lower():
                try:
                    j = res.json()
                    errm = j.get('errors')
                    if errm:
                        for e in errm:
                            graphql_errs.append('GRAPHQL_ERROR@%s: %s' % (u[-80:], str(e.get('message'))[:400]))
                except Exception:
                    pass
        page.on('response', on_response)
        page.goto(BASE, wait_until='networkidle', timeout=45000)
        time.sleep(1)
        # 登录
        page.locator('input').nth(0).fill('superadmin')
        page.locator('input').nth(1).fill('z123123')
        page.locator('button, .btn').first.click()
        time.sleep(4)
        page.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
        time.sleep(2)

        body = ''
        try:
            body = page.inner_text('body')
        except Exception:
            body = ''
        has_stats = ('今日订单' in body) and ('待发货' in body) and ('待退款' in body)
        # 有数据 = 不是"暂无订单"空态（真实数据下列表应有内容）
        has_data = ('暂无订单' not in body)
        has_redeem = '去核销' in body
        shot = SHOT + PREFIX + ('desk_1440.png' if tag == 'desk' else 'mobile_390.png')
        page.screenshot(path=shot, full_page=True)

        print('=== TAG', tag, '===')
        print('HAS_STATS=', has_stats)
        print('HAS_DATA(populated)=', has_data)
        print('HAS_REDEEM_ACTIONS=', has_redeem)
        print('BODY_HEAD=', body[:160].replace('\n', '|'))
        print('PAGEERRORS=', errs if errs else '(none)')
        print('GRAPHQL_ERRORS=', graphql_errs if graphql_errs else '(none)')
        print('CONSOLE_WITH_ERR=', [m for m in console_msgs if 'error' in m.lower() or 'graphql' in m.lower()] if True else '')
        browser.close()

run({'width': 390, 'height': 844}, 'mobile')
run({'width': 1440, 'height': 900}, 'desk')
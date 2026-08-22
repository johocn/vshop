from playwright.sync_api import sync_playwright
import time

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'

PAGES = [
    ('product/list', '商品列表'),
    ('product/create', '新增商品'),
    ('product/categories', '分类管理'),
    ('order/list', '订单列表'),
    ('after-sale/list', '售后处理'),
    ('decorate/home', '首页装修'),
    ('decorate/theme', '主题风格'),
    ('decorate/shop-info', '店铺信息'),
    ('inventory/stock', '库存与预警'),
    ('shipping/methods', '配送方式'),
    ('payment/methods', '支付方式'),
    ('data/dashboard', '数据看板'),
    ('distribution/relations', '分销关系'),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {str(e)[:200]}'))

    # 登录 + 选店
    page.goto(BASE, wait_until='networkidle', timeout=30000)
    time.sleep(1)
    inputs = page.locator('input')
    inputs.nth(0).fill('superadmin')
    inputs.nth(1).fill('superadmin')
    page.locator('.btn').first.click()
    time.sleep(3)
    # 选 shop-a
    page.locator('text=shop-a').first.click()
    time.sleep(2.5)
    print('LOGIN_OK, URL:', page.url)

    for path, title in PAGES:
        errors.clear()
        page.goto(f'{BASE}#/pages/{path}/index', wait_until='networkidle', timeout=30000)
        time.sleep(1.5)
        body = page.inner_text('body')
        # 判断页面是否渲染出内容（非空白）
        has_content = len(body.strip()) > 20
        errs = list(errors)
        status = 'OK' if (has_content and not errs) else ('CONTENT_EMPTY' if not has_content else 'JS_ERROR')
        print(f'[{status}] {path} ({title}) body_len={len(body.strip())}')
        if errs:
            for e in errs[:3]:
                print('   ', e)
        if not has_content:
            print('    BODY:', body[:150].replace('\n', ' | '))
        page.screenshot(path=f'{SHOT}pg_{path.replace("/", "_")}.png', full_page=True)

    browser.close()

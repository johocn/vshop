from playwright.sync_api import sync_playwright
import time

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text[:200]}'))
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {str(e)[:300]}'))

    # 1) 登录页
    page.goto(BASE, wait_until='networkidle', timeout=30000)
    time.sleep(1)
    page.screenshot(path=SHOT + '01_login.png', full_page=True)
    print('PAGE_TITLE:', page.title())
    print('URL:', page.url)

    # 找输入框
    inputs = page.locator('input')
    print('INPUT_COUNT:', inputs.count())
    if inputs.count() >= 2:
        inputs.nth(0).fill('superadmin')
        inputs.nth(1).fill('superadmin')
        page.screenshot(path=SHOT + '02_login_filled.png')
        # 点登录按钮（uni-app H5 渲染为 uni-button 自定义元素，用 .btn 定位）
        btn = page.locator('.btn')
        print('BUTTON_COUNT:', btn.count())
        for i in range(btn.count()):
            print('BTN', i, repr(btn.nth(i).inner_text()))
        btn.first.click()
        time.sleep(3)
        page.screenshot(path=SHOT + '03_after_login.png', full_page=True)
        print('URL_AFTER_LOGIN:', page.url)

    # 2) 选店页
    page.wait_for_timeout(1500)
    page.screenshot(path=SHOT + '04_channel.png', full_page=True)
    body = page.inner_text('body')
    print('BODY_SNIPPET:', body[:400])

    # 尝试点 shop-a
    shop_a = page.locator('text=shop-a').first
    if shop_a.count() > 0:
        shop_a.click()
        time.sleep(2.5)
        page.screenshot(path=SHOT + '05_workbench.png', full_page=True)
        print('URL_AFTER_PICK:', page.url)
        body2 = page.inner_text('body')
        print('WORKBENCH_SNIPPET:', body2[:500])
    else:
        print('NO shop-a FOUND')

    print('--- CONSOLE LOGS ---')
    for l in logs[:40]:
        print(l)
    browser.close()

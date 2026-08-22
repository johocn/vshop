from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/prod_'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text[:200]}'))
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {str(e)[:300]}'))

    # 1) 登录页
    page.goto(BASE, wait_until='networkidle', timeout=40000)
    time.sleep(1.5)
    page.screenshot(path=SHOT + '01_login.png', full_page=True)
    print('PAGE_TITLE:', page.title())
    print('URL:', page.url)

    inputs = page.locator('input')
    print('INPUT_COUNT:', inputs.count())
    if inputs.count() >= 2:
        inputs.nth(0).fill('superadmin')
        inputs.nth(1).fill('superadmin')
        page.locator('.btn').first.click()
        time.sleep(4)
        page.screenshot(path=SHOT + '02_after_login.png', full_page=True)
        print('URL_AFTER_LOGIN:', page.url)
        body = page.inner_text('body')
        print('BODY:', body[:300].replace('\n', ' | '))

        # 选第一个渠道（生产只有 __default_channel__）
        channel_item = page.locator('.item').first
        if channel_item.count() > 0:
            channel_item.click()
            time.sleep(3)
            page.screenshot(path=SHOT + '03_workbench.png', full_page=True)
            print('URL_AFTER_PICK:', page.url)
            body2 = page.inner_text('body')
            print('WORKBENCH:', body2[:300].replace('\n', ' | '))
        else:
            print('NO CHANNEL ITEM FOUND')

    print('--- CONSOLE LOGS ---')
    for l in logs[:30]:
        print(l)
    browser.close()

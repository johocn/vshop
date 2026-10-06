# 拾光达配置页「初始化配送档案」按钮：手机视口截图（390x844 dpr=2）
from playwright.sync_api import sync_playwright
import time, sys

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/docs/screenshots/waimai/'
ROUTE = 'https://e.joho.cn/guanli/#/pages/campus/config'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)

    # 1) 登录
    page.goto(BASE, wait_until='networkidle', timeout=60000)
    time.sleep(2)
    inputs = page.locator('input')
    if inputs.count() >= 2:
        inputs.nth(0).fill('superadmin')
        inputs.nth(1).fill('z123123')
        page.locator('.btn').first.click()
        time.sleep(3)
    print('AFTER_LOGIN_URL:', page.url)

    # 2) 拾光达配置页（uni hash 路由直达）
    page.goto(ROUTE, wait_until='networkidle', timeout=60000)
    time.sleep(3)
    page.screenshot(path=SHOT + '10-1-campus-config-list.png', full_page=True)
    print('CONFIG_URL:', page.url)

    # 3) 展开第一张卡（A 店）
    head = page.locator('.head').first
    head.click()
    time.sleep(1.5)
    # 滚到按钮区可见
    btn = page.locator('.ensure').first
    if btn.count() > 0:
        btn.scroll_into_view_if_needed()
        time.sleep(1)
    page.screenshot(path=SHOT + '10-2-campus-config-profile-btn.png', full_page=True)
    print('ENSURE_BTN_COUNT:', btn.count())
    if btn.count() > 0:
        print('ENSURE_BTN_TEXT:', btn.inner_text())

    browser.close()
print('DONE')

# -*- coding: utf-8 -*-
"""nav3：返回按钮位置与线上产物校验（390x844 dpr2）"""
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
USER, PWD = 'superadmin', 'z123123'


def main():
    # 1) 线上产物含新定位样式
    with urllib.request.urlopen(BASE + 'index.html', timeout=30) as r:
        html = r.read().decode('utf-8')
    import re
    js = re.findall(r'assets/index-[A-Za-z0-9_-]+\.js', html)
    print('entry js:', js)
    for f in set(js):
        with urllib.request.urlopen(BASE + f, timeout=30) as r:
            code = r.read().decode('utf-8', 'ignore')
        print('live contains /2-17px:', '/ 2 - 17px' in code, '| len:', len(code))

    # 2) 视觉：按钮是否落在导航条内、不压内容
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE + '#/pages/login/index', wait_until='networkidle', timeout=40000)
        page.wait_for_selector('input[type="text"]', timeout=20000)
        page.fill('input[type="text"]', USER)
        page.fill('input[type="password"]', PWD)
        page.click('text=登 录')
        page.wait_for_load_state('networkidle', timeout=25000)
        time.sleep(3)
        if 'channel-select' in page.evaluate('location.hash'):
            page.locator('.item').first.click()
            time.sleep(3.5)
        print('route:', page.evaluate('location.hash'))
        print('nav bar height (--window-top):', page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--window-top')"))
        print('back rect:', page.evaluate(
            """() => { const b = document.querySelector('div[aria-label="退出后台"], div[aria-label="返回首页"]');
                        const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }"""))
        page.screenshot(path='e2e-shots/nav3-dashboard-390x844.png')
        page.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=30000)
        time.sleep(3)
        page.screenshot(path='e2e-shots/nav3-orderlist-390x844.png')
        b.close()


if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""ops5 截图：库存预警 / 台账 / 优惠券 / 看板 / POS 五个增强页面（390x844 dpr2）"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
CREDS = [('guoxinnanshan@163.com', 'you123123')]
OUT = 'src/static/manual/shots/'

PAGES = [
    ('inv_alert', 'pages/inventory/stock/index'),
    ('ops5_ledger', 'pages/settle/ledger/index'),
    ('ops5_coupon', 'pages/coupon/index'),
    ('ops5_dashboard', 'pages/data/dashboard/index'),
    ('ops5_pos', 'pages/pos/index'),
]

def dismiss_modal(page):
    try:
        page.evaluate('document.querySelectorAll(".uni-modal__btn").forEach(b=>{if(b.innerText.includes("取消"))b.click()})')
        time.sleep(0.6)
    except Exception:
        pass

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = ctx.new_page()
        for uname, pwd in CREDS:
            page.goto(BASE + '#/pages/login/index', wait_until='networkidle', timeout=40000)
            page.wait_for_selector('input[type="text"]', timeout=20000)
            page.fill('input[type="text"]', uname)
            page.fill('input[type="password"]', pwd)
            page.click('text=登 录')
            page.wait_for_load_state('networkidle', timeout=20000); time.sleep(3)
            dismiss_modal(page)
            # 确保已选店
            cht = page.evaluate('localStorage.getItem("wa_channel_token")')
            if not cht:
                page.goto(BASE + '#/pages/channel-select/index', wait_until='networkidle', timeout=20000); time.sleep(2)
                dismiss_modal(page)
                try:
                    page.evaluate('document.querySelectorAll(".item")[0].click()')
                except Exception as e:
                    print('channel select fail:', e)
                time.sleep(2.5); dismiss_modal(page)
            for name, route in PAGES:
                page.goto(BASE + '#/' + route, wait_until='networkidle', timeout=25000)
                time.sleep(3.5)
                dismiss_modal(page)
                page.screenshot(path=OUT + name + '.png')
                print('shot:', name, page.url)
        b.close()

if __name__ == '__main__':
    main()

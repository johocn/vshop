# -*- coding: utf-8 -*-
"""nav2 截图：逐页核对「子页返回首页」覆盖度（390x844 dpr2，深链 stack=1 最严苛场景）"""
import time
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
OUT = 'e2e-shots/'  # 全量逐页回归证据（不入手册静态目录，手册仅引用 nav1 关键 4 张）
USER, PWD = 'superadmin', 'z123123'

ROUTES = [
    ('product-list', 'pages/product/list/index'),
    ('order-list', 'pages/order/list/index'),
    ('stock', 'pages/inventory/stock/index'),
    ('media-library', 'pages/media/library/index'),
    ('coupon-edit', 'pages/coupon/edit/index'),
    ('pickup-edit', 'pages/pickup/edit/index'),
    ('theme', 'pages/decorate/theme/index'),
    ('global-config', 'pages/platform/global-config/index'),
    ('pos', 'pages/pos/index'),
    ('data-dashboard', 'pages/data/dashboard/index'),
]


def modal_text(page):
    return page.evaluate(
        """() => {
          const visible = (el) => {
            let e = el;
            while (e && e !== document.body) {
              const s = getComputedStyle(e);
              if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
              e = e.parentElement;
            }
            return true;
          };
          const m = [...document.querySelectorAll('.uni-modal')].find(visible);
          return m ? (m.innerText || '').replace(/\\s+/g, ' ').trim() : '';
        }"""
    )


def back_state(page):
    return page.evaluate(
        """() => {
          const b = document.querySelector('div[aria-label="返回首页"], div[aria-label="退出后台"]');
          if (!b) return 'none';
          if (b.style.display === 'none') return 'hidden';
          return b.getAttribute('aria-label');
        }"""
    )


def main():
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

        bad = []
        for name, route in ROUTES:
            page.goto(BASE + '#/' + route, wait_until='networkidle', timeout=30000)
            time.sleep(3.5)
            from_state = back_state(page)
            page.screenshot(path=OUT + 'nav2-%s-subpage.png' % name)
            page.evaluate(
                """() => {
                  const b = document.querySelector('div[aria-label="返回首页"], div[aria-label="退出后台"]');
                  if (b) b.click();
                }"""
            )
            time.sleep(2.6)
            landed = page.evaluate('location.hash')
            modal = modal_text(page)
            ok = landed.endswith('pages/dashboard/index') and not modal
            print('%-16s from=%-18s back=%-5s -> %-30s modal=%-4s %s' % (name, route, from_state, landed, modal or '-', 'OK' if ok else 'FAIL'))
            if not ok:
                bad.append((name, from_state, landed, modal))
                page.screenshot(path=OUT + 'nav2-%s-FAIL.png' % name)
        print('FAILED:', bad if bad else 'none')
        b.close()


if __name__ == '__main__':
    main()
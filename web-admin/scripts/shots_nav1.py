# -*- coding: utf-8 -*-
"""nav1 截图：后台 H5「返回首页 / 首页退出确认」行为验收（390x844 dpr2，手机视口）"""
import time
from playwright.sync_api import sync_playwright

BASE = 'https://e.joho.cn/guanli/'
OUT = 'src/static/manual/shots/'
USER, PWD = 'superadmin', 'z123123'


def modal_text(page):
    try:
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
              if (!m) return '';
              return (m.innerText || '').replace(/\\s+/g, ' ').trim();
            }"""
        )
    except Exception:
        return ''


def click_modal_btn(page, label):
    page.evaluate(
        """(label) => {
          document.querySelectorAll('.uni-modal .uni-modal__btn').forEach(b => {
            if ((b.innerText || '').includes(label)) b.click();
          });
        }""",
        label,
    )
    time.sleep(1.3)


def back_state(page):
    return page.evaluate(
        """() => {
          const b = document.querySelector('div[aria-label="返回首页"], div[aria-label="退出后台"]');
          if (!b) return 'none';
          if (b.style.display === 'none') return 'hidden';
          return b.getAttribute('aria-label');
        }"""
    )


def click_back(page):
    page.evaluate(
        """() => {
          const b = document.querySelector('div[aria-label="返回首页"], div[aria-label="退出后台"]');
          if (b) b.click();
        }"""
    )
    time.sleep(2.4)


def route(page):
    return page.evaluate('location.hash')


def shot(page, name):
    page.screenshot(path=OUT + name + '.png')
    print('shot: %-44s | %-32s | back=%-5s | modal=%s' % (name, route(page), back_state(page), modal_text(page) or '-'))


def click_text(page, selector, text):
    page.locator(selector, has_text=text).first.click()
    time.sleep(2.6)


def drawer_item(page, text):
    """首页抽屉菜单 -> 应用内 navigateTo（保留页面栈）"""
    page.click('.menu')
    time.sleep(1.2)
    click_text(page, '.drawer .tag', text)


def quick_item(page, label):
    """右下角高频快捷入口 -> 应用内 navigateTo"""
    page.click('div[aria-label="高频快捷入口"]')
    time.sleep(0.8)
    page.click('div[aria-label="%s"]' % label)
    time.sleep(2.6)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = ctx.new_page()

        # 登录（superadmin / z123123）-> 选店 -> 工作台
        page.goto(BASE + '#/pages/login/index', wait_until='networkidle', timeout=40000)
        page.wait_for_selector('input[type="text"]', timeout=20000)
        page.fill('input[type="text"]', USER)
        page.fill('input[type="password"]', PWD)
        page.click('text=登 录')
        page.wait_for_load_state('networkidle', timeout=25000)
        time.sleep(3)
        if 'channel-select' in route(page):
            page.locator('.item').first.click()
            time.sleep(3.5)
        print('entry:', route(page))

        # ① 首页：返回按钮语义 = 退出后台
        shot(page, 'nav1-01-home-back-means-exit')

        # ② 应用内进入子页：返回按钮语义 = 返回首页
        drawer_item(page, '订单')
        shot(page, 'nav1-02-subpage-back-means-home')

        # ③ 子页点返回 -> 首页，且不得弹退出确认
        click_back(page)
        shot(page, 'nav1-03-subpage-back-lands-home-no-modal')

        # ④ 二级子页（栈更深）点返回 -> 首页
        drawer_item(page, '订单')
        quick_item(page, '数据看板')
        shot(page, 'nav1-04-nested-subpage')
        click_back(page)
        shot(page, 'nav1-05-nested-back-lands-home')

        # ⑤ 深链直达子页（页面栈仅 1 层，旧逻辑回不去首页）
        page.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=30000)
        time.sleep(3)
        shot(page, 'nav1-06-deeplink-subpage-stack1')
        click_back(page)
        shot(page, 'nav1-07-deeplink-back-lands-home')

        # ⑥ 首页再点返回 -> 退出确认弹窗
        click_back(page)
        shot(page, 'nav1-08-home-back-exit-confirm')

        # ⑦ 取消 -> 留在首页，无弹窗
        click_modal_btn(page, '取消')
        shot(page, 'nav1-09-cancel-stays-home')

        # ⑧ 浏览器返回：子页 -> 首页不弹窗
        drawer_item(page, '订单')
        page.evaluate('history.back()')
        time.sleep(3)
        shot(page, 'nav1-10-browser-back-subpage-no-modal')

        # ⑨ 菜单「退出登录」-> 退出确认（取消后仍留在首页）
        page.click('.menu')
        time.sleep(1.2)
        click_text(page, '.drawer .tag', '退出登录')
        time.sleep(1.2)
        shot(page, 'nav1-11-menu-logout-confirm')
        click_modal_btn(page, '取消')
        shot(page, 'nav1-12-logout-cancel-stays-home')

        # ⑩ 首页浏览器返回 -> 退出确认（取消后仍留在首页）
        page.evaluate('history.back()')
        time.sleep(2.5)
        shot(page, 'nav1-13-browser-back-on-home-confirm')
        click_modal_btn(page, '取消')
        shot(page, 'nav1-14-cancel-stays-home-again')

        # ⑪ 确认「退出」-> 回到登录页
        click_back(page)
        click_modal_btn(page, '退出')
        time.sleep(2)
        shot(page, 'nav1-15-confirm-exit-lands-login')

        b.close()


if __name__ == '__main__':
    main()
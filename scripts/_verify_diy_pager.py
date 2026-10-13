# -*- coding: utf-8 -*-
"""素材面板分页专项验证：
- 分页条自动出现、页码切换/上一页/下一页
- 过滤联动（切分类/搜索回第 1 页）
- 交互响应延迟（点击→DOM 更新）< 100ms
- 自定义滚动条样式生效（::-webkit-scrollbar 5px 品牌橙）
- 手机视口截图
运行前提：dev:h5 已在 5180。
"""
import os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5180/#/pkg-diy/pages/designer?tenant=default'
SHOT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'pkg-diy-p7-screens', 'p72-panel-pager.png')
CHROME = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), name, detail)

# 点击后测 DOM 更新延迟：observe 列表容器子树变更
JS_LATENCY = """(sel) => new Promise(res => {
  const host = document.querySelector(sel);
  const t0 = performance.now();
  const mo = new MutationObserver(() => { mo.disconnect(); res(performance.now() - t0); });
  mo.observe(host, { childList: true, subtree: true });
  window.__pgTap(t0);
})"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                                  has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.goto(BASE, wait_until='networkidle')
        page.wait_for_timeout(1500)
        if 'guide' in page.url:
            page.goto(BASE, wait_until='networkidle')
            page.wait_for_timeout(1500)
        page.wait_for_selector('.mat-panel__item', timeout=25000)
        page.wait_for_timeout(600)

        # 1) 分页条自动出现（68 款 / 9 = 8 页）
        pgs = page.eval_on_selector_all('.mat-panel__pg', "els => els.map(e => e.textContent.trim())")
        check('pager-auto', '1' in pgs and '8' in pgs, f'pgs={pgs}')

        # 2) 翻页：点页码 2 → 网格首卡变化 + 延迟 <100ms
        first_before = page.eval_on_selector('.mat-panel__item .mat-panel__name', 'e => e.textContent')
        page.evaluate("""() => {
            const pgs = [...document.querySelectorAll('.mat-panel__pg')];
            window.__pgTap = () => { pgs.find(e => e.textContent.trim() === '2').dispatchEvent(new MouseEvent('click', { bubbles: true })); };
        }""")
        dt = page.evaluate(JS_LATENCY, '.mat-panel__list')
        first_after = page.eval_on_selector('.mat-panel__item .mat-panel__name', 'e => e.textContent')
        check('page-switch', first_before != first_after, f'首卡 {first_before} → {first_after}')
        check('latency-page', dt < 100, f'{dt:.1f}ms')

        # 3) 下一页/上一页
        page.tap('.mat-panel__pg >> nth=-1')
        page.wait_for_timeout(260)
        n3 = page.eval_on_selector('.mat-panel__pg--on', 'e => e.textContent')
        check('page-next', n3 == '3', f'on={n3}')
        page.tap('.mat-panel__pg >> nth=0')
        page.wait_for_timeout(260)
        n2 = page.eval_on_selector('.mat-panel__pg--on', 'e => e.textContent')
        check('page-prev', n2 == '2', f'on={n2}')

        # 4) 过滤联动：切分类 → 回第 1 页 + 延迟
        page.evaluate("""() => {
            const cats = [...document.querySelectorAll('.mat-panel__cat')];
            window.__pgTap = () => { cats[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); };
        }""")
        dt2 = page.evaluate(JS_LATENCY, '.mat-panel__body')
        on1 = page.query_selector('.mat-panel__pg--on')
        n_cat_items = page.eval_on_selector_all('.mat-panel__item', 'els => els.length')
        # 素材 ≤ 单页时分页条自动隐藏（on1 is None）；否则必须回第 1 页
        check('filter-reset-page', n_cat_items <= 9 and (on1 is None or on1.text_content().strip() == '1'),
              f'切分类后 items={n_cat_items} on={None if on1 is None else on1.text_content().strip()}')
        check('latency-filter', dt2 < 100, f'{dt2:.1f}ms')

        # 5) 搜索联动
        page.fill('.mat-panel__search input', '紫')
        page.wait_for_timeout(400)
        on2 = page.query_selector('.mat-panel__pg--on')
        n_items = page.eval_on_selector_all('.mat-panel__item', 'els => els.length')
        check('search-linkage', on2 is None or on2.eval_on_selector(':scope', 'e => e.textContent') == '1', f'搜索后 items={n_items}')

        # 6) 自定义滚动条样式生效
        sb = page.evaluate("""() => {
            const el = document.querySelector('.mat-panel__list .uni-scroll-view');
            if (!el) return null;
            const st = getComputedStyle(el, '::-webkit-scrollbar');
            const th = getComputedStyle(el, '::-webkit-scrollbar-thumb');
            return { width: st.width, display: st.display, thumb: th.backgroundColor };
        }""")
        check('custom-scrollbar', sb and sb['width'] == '5px' and sb['display'] == 'block' and '255, 102, 0' in (sb['thumb'] or ''),
              f"{sb}")

        # 7) 恢复 + 截图（回到全部第 1 页）
        page.fill('.mat-panel__search input', '')
        page.wait_for_timeout(300)
        page.tap('.mat-panel__cat >> nth=0')
        page.wait_for_timeout(400)
        page.screenshot(path=SHOT)
        print('shot:', SHOT)
        browser.close()
    fails = [r for r in results if not r[1]]
    print(f'\n== {len(results) - len(fails)}/{len(results)} PASS ==')

if __name__ == '__main__':
    main()

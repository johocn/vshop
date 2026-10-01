# -*- coding: utf-8 -*-
# 多语言链路手机视口截图（390x844, dpr=2）：
#   1) t1 店铺信息页「多语言」卡片 + 方案库动态语言列（Deutsch）
#   1b) 分类命名弹窗多语言输入行（含 Deutsch）——UI 证据，不保存
#   2) 新建商品表单的多语言页签（含 Deutsch）——只截图不保存
#   3) C 端 t1 德文页 https://www.youshop.cn/t1/?languageCode=de
# 输出: docs/webadmin-bugfix-manual/assets/multilang-*.png
from playwright.sync_api import sync_playwright
import os, time

BASE = 'https://e.joho.cn/guanli/'
ASSET = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets'
SHOP_DE = 'https://www.youshop.cn/t1/?languageCode=de'
os.makedirs(ASSET, exist_ok=True)


def shot(pg, name):
    pg.screenshot(path=os.path.join(ASSET, name), full_page=True)
    print('SHOT', name)


def run():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))

        pg.goto(BASE, wait_until='networkidle', timeout=60000)
        pg.evaluate('localStorage.clear()')
        pg.reload(wait_until='networkidle', timeout=60000)
        pg.locator('input').nth(0).fill('superadmin')
        pg.locator('input').nth(1).fill('z123123')
        pg.locator('button, .btn').first.click()
        time.sleep(4)
        pg.locator('.item', has_text='t1').first.click()
        time.sleep(4)

        # 1) 店铺信息页：多语言卡片 + 方案库动态列
        pg.goto(BASE + '#/pages/decorate/shop-info/index', wait_until='networkidle', timeout=60000)
        time.sleep(4)
        lang_rows = pg.locator('.lang-row').count()
        de_on = pg.locator('.lang-row', has_text='Deutsch').locator('switch, .uni-switch-input').count()
        rows = pg.locator('.scheme-row').count()
        add_n = pg.locator('.add').count()
        print(f'  shopinfo pre: schemeRows={rows} addButtons={add_n}')
        if rows == 0 and add_n:
            # 本地新增一行方案（仅前端渲染，不保存）以展示「Deutsch」输入列
            for sel in ['.add', '.tpl']:
                loc = pg.locator(sel)
                if loc.count() == 0:
                    continue
                try:
                    loc.first.evaluate('el => el.click()')
                except Exception as e:
                    print('  WARN click', sel, str(e)[:80])
                time.sleep(1.5)
                rows = pg.locator('.scheme-row').count()
                print(f'  shopinfo after js-click {sel}: schemeRows={rows}')
                if rows:
                    break
        placeholders = pg.evaluate(
            "() => Array.from(document.querySelectorAll('.scheme-row input')).map(i => i.placeholder)"
        )
        shot(pg, 'multilang-shopinfo-mobile-390.png')
        print(f'  shopinfo: langRows={lang_rows} deutschSwitches={de_on} schemeRows={rows} placeholders={placeholders}')

        # 1b) 分类命名弹窗（多语言输入行，含 Deutsch）——不保存
        pg.goto(BASE + '#/pages/product/categories/index', wait_until='networkidle', timeout=60000)
        time.sleep(4)
        ren = pg.locator('text=重命名').first
        ren.click()
        time.sleep(2)
        dlg_rows = pg.locator('.dlg-row').count()
        labels = pg.locator('.dlg-row .dlg-lbl').all_inner_texts()
        shot(pg, 'multilang-category-dialog-mobile-390.png')
        print(f'  categoryDialog: rows={dlg_rows} labels={labels}')
        # 取消，绝不保存
        pg.locator('.dlg-btn').first.click()
        time.sleep(1)

        # 2) 新建商品表单：多语言页签含 Deutsch（只截图，不保存）
        pg.goto(BASE + '#/pages/product/create/index', wait_until='networkidle', timeout=60000)
        time.sleep(5)
        langbar = pg.locator('.langbar').count()
        lgs = pg.locator('.langbar .lg').all_inner_texts()
        de_tab = pg.locator('.langbar .lg', has_text='Deutsch')
        de_count = de_tab.count()
        if de_count:
            de_tab.first.click()
            time.sleep(2)
        shot(pg, 'multilang-productform-mobile-390.png')
        print(f'  productForm: langbar={langbar} lgs={lgs} deutschTab={de_count}')

        # 3) C 端 t1 德文页
        pg.goto(SHOP_DE, wait_until='networkidle', timeout=60000)
        time.sleep(5)
        title = pg.title()
        snippet = pg.evaluate("() => (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200)")
        shot(pg, 'multilang-cshop-de-mobile-390.png')
        print(f'  cshop: title={title!r} snippet={snippet!r}')

        print('PAGEERRORS =', errs if errs else '(none)')
        b.close()


run()

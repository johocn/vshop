# -*- coding: utf-8 -*-
"""i18n 地基验证：登录页 zh-Hans / en 双语对照截图 + console 错误捕获（视口 390x844 dpr=2）"""
import time
from playwright.sync_api import sync_playwright
BASE = 'https://e.joho.cn/guanli/'
SHOT = r'd:\zhao\vshop\web-admin\src\static\manual\shots'

def shoot(locale, name):
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        pg = c.new_page()
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(f"localStorage.setItem('wa_locale','{locale}');")
        pg.goto(BASE + '#/pages/login/index', wait_until='networkidle', timeout=30000)
        time.sleep(2.5)
        # 提取主体可见文本，确认 $t 生效而非报错白屏
        body_text = pg.evaluate("document.body ? document.body.innerText : ''")
        pg.screenshot(path=f'{SHOT}/{name}.png', full_page=False)
        b.close()
    print(f'[{name}] console_errors={errors[:5]}')
    print(f'[{name}] body_text={body_text.strip()[:120]!r}')
    print(f'[{name}] shot OK')
    return not errors

if __name__ == '__main__':
    ok = True
    ok &= shoot('zh-Hans', 'i18n_login_zh')
    ok &= shoot('en', 'i18n_login_en')
    print('DONE', 'PASS' if ok else 'FAIL')
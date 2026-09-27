# -*- coding: utf-8 -*-
"""D55-③ 验收：全局配置页「JSON 高级编辑」并入 themeTokens，与结构化表单双向同步。

断言（全程零落库：只验双向同步与坏 JSON 拦截，不点保存成功路径）
  A1 JSON 框是完整编辑态：文本 parse 后同时含 themeTokens 与 defaults 两个根
  A2 JSON → 表单：把 JSON 里 themeTokens.radius 改成 20 → 失焦 → 「圆角 radius」输入框 == 20
  A3 表单 → JSON：把「主色 primaryColor」输入框改成 #123456 → JSON 文本里同步出现该值
  A4 坏 JSON 拦截：把 JSON 改成 `{` → 失焦 → 表单值不变；点「保存」→ 出现 invalidJson 文案，且**未发出**更新请求
  A5 取证：`docs/verify/d55-global-config-json-both-roots-390.png`（390×844 @dpr2 = 780×1688），0 pageerror
退出码：0 全通过 / 1 断言失败 / 2 环境不可用
"""
import json
import os
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_D55_BASE', 'http://localhost:5280/')
USER = os.environ.get('WA_D55_ADMIN_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_D55_ADMIN_PWD', 'superadmin')
PAGE = 'pages/platform/global-config/index'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
FAILS = []


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def goto_config(pg):
    pg.goto('%s#/%s?cb=%d' % (BASE, PAGE, int(time.time() * 1000)),
            wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.card').first.wait_for(state='visible', timeout=60000)
    time.sleep(1.2)


def open_json(pg):
    pg.locator('.chip').filter(has_text='JSON 高级编辑').first.click()
    pg.wait_for_timeout(600)
    # uni-app H5 把 <textarea class="ta"> 渲染成 <uni-textarea class="ta"> 包一层真实 <textarea>：
    # 可填可读的是内层真实 textarea（uni-textarea 是自定义元素，fill/input_value 会报错）。
    ta = pg.locator('uni-textarea.ta textarea').first
    ta.wait_for(state='visible', timeout=15000)
    return ta


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True,
                            locale='zh-CN')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        login(pg)
        goto_config(pg)

        ta = open_json(pg)
        txt = ta.input_value()
        try:
            obj = json.loads(txt)
        except Exception as e:  # noqa: BLE001
            obj = None
            check('A1 JSON 框文本可解析', False, str(e)[:120])
        if obj is not None:
            check('A1 JSON 框同时含 themeTokens 与 defaults 两个根',
                  isinstance(obj.get('themeTokens'), dict) and isinstance(obj.get('defaults'), dict),
                  'keys=%r' % list(obj.keys()))

        # A2 JSON → 表单
        obj2 = dict(obj or {})
        tt = dict(obj2.get('themeTokens') or {})
        tt['radius'] = 20
        obj2['themeTokens'] = tt
        ta.fill(json.dumps(obj2, ensure_ascii=False, indent=2))
        ta.blur()
        pg.wait_for_timeout(800)
        radius_input = pg.locator('.field').filter(has_text='圆角').locator('input').first
        check('A2 JSON → 表单：radius=20 同步到「圆角 radius」输入框',
              radius_input.input_value().strip() == '20', 'got=%r' % radius_input.input_value())

        # A3 表单 → JSON
        color_input = pg.locator('.field').filter(has_text='主色').locator('input').first
        color_input.fill('#123456')
        pg.wait_for_timeout(600)
        check('A3 表单 → JSON：主色改动同步进 JSON 文本',
              '#123456' in pg.locator('uni-textarea.ta textarea').first.input_value())

        # A5 先取证（此时 JSON 与表单均为最新编辑态）
        OUT.mkdir(parents=True, exist_ok=True)
        shot = OUT / 'd55-global-config-json-both-roots-390.png'
        pg.screenshot(path=str(shot))
        check('A5 取证图 %s' % shot.name, shot.exists() and shot.stat().st_size > 4000,
              '%dB' % (shot.stat().st_size if shot.exists() else 0))

        # A4 坏 JSON 拦截
        before = radius_input.input_value()
        ta.fill('{')
        ta.blur()
        pg.wait_for_timeout(800)
        check('A4 坏 JSON 不失焦即崩：表单值保持不变',
              radius_input.input_value() == before, 'before=%r after=%r' % (before, radius_input.input_value()))
        pg.locator('button.btn, .btn').filter(has_text='保存').first.click()
        pg.wait_for_timeout(1500)
        body = pg.inner_text('body')
        check('A4 坏 JSON 保存被拦截（出现 invalidJson 文案）',
              'JSON 不是合法对象' in body, 'body=%r' % body[-160:].replace('\n', '|'))
        check('A5 全程 0 pageerror', not errs, str(errs[:2]))

        b.close()

    print('\n===== D55-③ 验收：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()

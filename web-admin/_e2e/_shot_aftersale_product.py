# -*- coding: utf-8 -*-
"""售后详情「商品」栏修复 · 手机视口截图回归

验证：仅退款单（无 orderLineId）售后详情商品卡回退展示 order.lines 清单。
用例：售后 #27（canteen-a 渠道，Appealed，整单退款）→ 商品卡应出现「可乐鸡排饭」。
铁律：390x844 @dpr2（=780x1688）、is_mobile、has_touch；0 pageerror / 0 console.error。
退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
"""
import os
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_SHOT_BASE', 'https://e.joho.cn/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
AS_ID = os.environ.get('WA_AS_ID', '27')
EXPECT_NAME = os.environ.get('WA_EXPECT_NAME', '可乐鸡排饭')
# 依次尝试的账号（登录后需能取到目标渠道 token；必须精确渠道——跨渠道查售后单 order.lines 会解析报错）
ACCOUNTS = [
    ('superadmin', 'z123123'),
    ('guoxinnanshan@163.com', 'you123123'),
]
CHANNEL = os.environ.get('WA_CHANNEL', 'canteen-a')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
PAGE_PATH = 'pages/after-sale/detail/index?id=' + AS_ID

FAILS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def try_login(pg, user, pwd, channel_kw):
    """UI 登录 → myTenantAccess 取渠道 token；成功返回渠道 code，失败返回原因串。"""
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill(user)
    pg.locator('input').nth(1).fill(pwd)
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    return pg.evaluate("""async ([kw]) => {
      const t = localStorage.getItem('wa_auth_token');
      if (!t) return 'NO_TOKEN';
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})});
      const d = await r.json();
      const cs = ((d.data||{}).myTenantAccess||{}).channels || [];
      const c = cs.find(x=>x.code===kw) || cs.find(x=>(x.code||'').includes(kw));
      if(!c) return 'NOCHANNEL:' + cs.map(x=>x.code).join(',');
      localStorage.setItem('wa_channel_token', c.token);
      localStorage.setItem('wa_channel_code', c.code);
      return 'OK';
    }""", [channel_kw])


def goto(pg, path, settle=8.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        bag = []
        pg.on('pageerror', lambda e: bag.append('PAGEERR:%s' % e))
        pg.on('console', lambda m: bag.append('CONSOLE:%s' % m.text) if m.type == 'error' else None)

        # 1. 登录（多账号尝试，渠道取含 canteen 的）
        ok_login, who = '', ''
        for u, w in ACCOUNTS:
            who = u
            ok_login = try_login(pg, u, w, CHANNEL)
            if ok_login == 'OK':
                break
            print('  .. 账号 %s 登录/渠道不可用: %s' % (u, ok_login[:120]))
        if ok_login != 'OK':
            print('ENV-FAIL: 所有账号均无法取得 canteen 渠道')
            raise SystemExit(2)
        print('  OK   登录 %s' % who)

        # 2. 打开售后详情（#27）
        goto(pg, PAGE_PATH, 8)
        body = pg.evaluate('document.body.innerText')

        # 3. 断言：商品卡出现整单商品名（修复前仅退款单显示 "—"）
        check('商品卡含「%s」' % EXPECT_NAME, EXPECT_NAME in body)
        # 商品卡区块应至少有一处数量行
        check('商品卡含数量行 ×', '×' in body.split('商品')[-1] if '商品' in body else False)

        # 4. 截图
        OUT.mkdir(parents=True, exist_ok=True)
        f = OUT / ('aftersale-product-fallback-%s.png' % AS_ID)
        pg.screenshot(path=str(f))
        check('截图输出 %s' % f.name, f.exists() and f.stat().st_size > 5000,
              '%d B' % (f.stat().st_size if f.exists() else 0))

        # 5. 控制台/页面异常
        errs = [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]
        check('0 pageerror/console.error', len(errs) == 0, '; '.join(errs[:3]))

        b.close()

    print('PASS' if not FAILS else 'FAIL(%d)' % len(FAILS))
    raise SystemExit(0 if not FAILS else 1)


if __name__ == '__main__':
    main()

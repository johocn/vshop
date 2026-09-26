# -*- coding: utf-8 -*-
"""D41 验收：经营数据看板「库存健康」卡在**租户管理员账号**下的取数正确性。

背景：该卡后两格原走核心 `stockLevels`（`@Allow(ViewStock)`），而 `ViewStock` 是 inventory-plugin 的
超管语义全局库存权限、不在租户白名单内（`PERMISSION_CATALOG` 的 `inventory` 组只有网点增/改/删）→
租户账号恒 403，卡片退化成「93 / − / −」并在控制台打 `fetchInventoryHealth failed … not authorized`。
修复后统一走 cjk-plugin 租户级 `inventoryStockPage`（`@Allow` 含 `ReadCatalog`，租户管理员可用）。

断言（同一脚本两态可跑：部署前 = 缺陷态取证 / 部署后 = 修复态取证）：
  A 控制台 / 页面零错误（尤其不得出现 "not authorized"）
  B 库存健康卡三格均为数字（非「—」/「−」）
  C UI 与 API 逐字一致：`lowStockCount` / `outCount` / `skuCount` 三项相等
  D 截图 390×844 @dpr2（卡片滚动入视口后，令其自证）

环境变量：WA_D41_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN（默认 https://e.joho.cn/admin-api）、
  WA_SMOKE_USER / WA_SMOKE_PWD（默认租户账号 guoxinnanshan@163.com）、WA_D41_CHANNEL（渠道 code，默认 t2）、
  WA_D41_TAG（输出文件名标签，如 before- / after-）
退出码：0 = 全部通过；1 = 断言失败；2 = 环境不可用
"""
import json
import os
import time
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_D41_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D41_CHANNEL', 't2')
TAG = os.environ.get('WA_D41_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
PAGE = 'pages/data/dashboard/index'

FAILS = []


def info(msg):
    print('  %s' % msg)


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def api(query, variables=None, token=None, channel=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if channel:
        headers['vendure-token'] = channel
    req = urllib.request.Request(ADMIN, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:200]}


def tenant_token():
    """租户账号登录 + 取渠道 t2 的 token（vendure-token 必须用 token，不是 code）。"""
    tok, r = api('mutation($u:String!,$p:String!,$e:Boolean){login(username:$u,password:$p,rememberMe:$e)'
                 '{... on CurrentUser{id identifier}}}', {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        print('ENV-FAIL: 租户账号登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    _, r2 = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r2.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL_CODE), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (CHANNEL_CODE, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return tok, ch['token']


def api_truth(tok, ctoken):
    """API 侧真值：看板 lowStockCount + 租户库存聚合 skuCount / outCount。"""
    _, r1 = api('query{dashboardOverview(range:"today"){inventory{lowStockCount}}}', token=tok, channel=ctoken)
    _, r2 = api('query{inventoryStockPage(input:{page:1,pageSize:1}){summary{skuCount outCount}}}',
                token=tok, channel=ctoken)
    low = ((((r1.get('data') or {}).get('dashboardOverview') or {}).get('inventory') or {}).get('lowStockCount'))
    sm = (((r2.get('data') or {}).get('inventoryStockPage') or {}).get('summary') or {})
    errs = (r1.get('errors') or []) + (r2.get('errors') or [])
    if errs:
        print('ENV-FAIL: API 真值查询失败 %s' % str(errs[0].get('message'))[:200])
        raise SystemExit(2)
    return low, sm.get('outCount'), sm.get('skuCount')


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def main():
    tok, ctoken = tenant_token()
    low_api, out_api, sku_api = api_truth(tok, ctoken)
    info('API 真值：lowStockCount=%s outCount=%s skuCount=%s（账号 %s / 渠道 %s）' % (low_api, out_api, sku_api, USER, CHANNEL_CODE))

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:400])) if m.type == 'error' else None)

        login(pg)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [CHANNEL_CODE, ctoken])
        info('已登录并注入渠道 %s' % CHANNEL_CODE)

        url = BASE + '#/' + PAGE + '?cb=' + str(int(time.time() * 1000))
        pg.goto(url, wait_until='domcontentloaded', timeout=60000)
        pg.reload(wait_until='domcontentloaded', timeout=60000)
        pg.wait_for_selector('.health', timeout=90000)
        time.sleep(2.0)

        cells = pg.locator('.health .num')
        texts = [t.strip() for t in cells.all_inner_texts()]

        # B 三格均为数字
        num_ok = len(texts) == 3 and all(t.isdigit() for t in texts)
        check('B 库存健康三格均为数字', num_ok, '实际 %s' % texts)

        # C UI 与 API 逐字一致
        if num_ok:
            check('C-1 lowStockCount UI==API', int(texts[0]) == int(low_api), '%s vs %s' % (texts[0], low_api))
            check('C-2 outCount UI==API', int(texts[1]) == int(out_api), '%s vs %s' % (texts[1], out_api))
            check('C-3 skuCount UI==API', int(texts[2]) == int(sku_api), '%s vs %s' % (texts[2], sku_api))

        # D 截图（卡片入视口，令其自证）
        pg.locator('.health').scroll_into_view_if_needed()
        time.sleep(0.5)
        OUT.mkdir(parents=True, exist_ok=True)
        f = OUT / ('gap4-d41-%shealth.png' % TAG)
        pg.screenshot(path=str(f))
        check('D 截图 %s' % f.name, f.exists() and f.stat().st_size > 5000,
              '%dB' % (f.stat().st_size if f.exists() else 0))

        # A 零错误（含 not authorized 排查）
        auth = [e for e in errs if 'authoriz' in e.lower()]
        check('A 控制台/页面零错误', not errs, '%d 条' % len(errs))
        check('A-2 无 not authorized', not auth, '%d 条' % len(auth))
        for e in errs[:6]:
            print('     ↳ %s' % e[:200])

        b.close()

    if FAILS:
        print('\n== 结果：%d 项失败 ==\n失败项：%s' % (len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果：全部通过 ==')
    raise SystemExit(0)


if __name__ == '__main__':
    main()
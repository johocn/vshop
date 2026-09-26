# -*- coding: utf-8 -*-
"""D42 验收：库存明细页「调整」在**租户管理员账号**下的改数能力。

背景：该动作原走核心 `setVariantStock`（`@Allow(ViewStock)`），而 `ViewStock` 是 inventory-plugin 的
超管语义全局库存权限、不在租户白名单内 → 租户账号恒 403、弹「失败」且改不动数（与 D41 同源）。
修复后改走 cjk-plugin `createStockDoc(type: 'STOCKTAKE')`（`@Allow(ViewStock, UpdateStockLocation)`，
租户持有后者）：服务端取 `realQty ?? qty` 作目标存量（绝对值），并落 `StockDoc` 单据 + 台账流水。

断言（同一脚本两态可跑：部署前 = 缺陷态取证 / 部署后 = 修复态取证）：
  A 页面不出现授权失败（控制台无 "authoriz"，Toast 不含授权/失败字样）
  B 写入前基线与「单据中心」STOCKTAKE 计数留档
  C 改数生效：UI 提交后 API 回读该 SKU 该仓 onHand == 目标值
  D 留痕落库：STOCKTAKE 单据数 +1，且新单 code 出现在 Toast 里
  E 复原：再用一次单据写回原始值（仅 C 通过时执行，确保不污染生产数据）
  F 截图 390×844 @dpr2（调整弹层 + 调整后行，令其自证）

环境变量：WA_D42_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN（默认 https://e.joho.cn/admin-api）、
  WA_SMOKE_USER / WA_SMOKE_PWD（默认租户账号 guoxinnanshan@163.com）、WA_D42_CHANNEL（渠道 code，默认 t2）、
  WA_D42_SKU（测试 SKU，默认 P1789043229213）、WA_D42_TAG（输出文件名标签 before- / after-）
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

BASE = os.environ.get('WA_D42_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D42_CHANNEL', 't2')
SKU = os.environ.get('WA_D42_SKU', 'P1789043229213')
TAG = os.environ.get('WA_D42_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
PAGE = 'pages/inventory/stock/index'
REMARK = 'D42 验收-临时单据（可忽略）'

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
        return None, {'TRANSPORT': str(e)[:300]}


def gerr(r):
    es = r.get('errors') or []
    return str(es[0].get('message'))[:200] if es else None


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


def target_location(tok, ctoken):
    """本店兜底目标仓，与前端 defaultTargetId 同口径：默认物理仓 → 首个物理仓 → 虚拟仓。"""
    _, r = api('query{tenantInventoryOverview{physicalStockEnabled virtualLocationId '
               'defaultPhysicalLocationId locations{id name code kind isSystem}}}', token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: 取租户库存方案失败 %s' % gerr(r))
        raise SystemExit(2)
    ov = (r.get('data') or {}).get('tenantInventoryOverview') or {}
    loc = ov.get('defaultPhysicalLocationId') or next(
        (l['id'] for l in (ov.get('locations') or []) if l.get('kind') == 'physical'), None) \
        or ov.get('virtualLocationId')
    if not loc:
        print('ENV-FAIL: 无可用目标仓')
        raise SystemExit(2)
    return loc


def read_row(tok, ctoken, lid, sku):
    """按 sku + 仓回读一行（{variantId, onHand}）。"""
    _, r = api('query($kw:String,$lid:ID){inventoryStockPage(input:{keyword:$kw,locationId:$lid,page:1,pageSize:5})'
               '{items{variantId sku stockLocationId onHand}}}', {'kw': sku, 'lid': lid},
               token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: 库存回读失败 %s' % gerr(r))
        raise SystemExit(2)
    items = (((r.get('data') or {}).get('inventoryStockPage') or {}).get('items') or [])
    return next((i for i in items if i['sku'] == sku), None)


def write_abs(tok, ctoken, vid, lid, qty, remark):
    """经 createStockDoc(STOCKTAKE) 设绝对存量（服务端取 realQty ?? qty）。返回 (doc, error)。"""
    _, r = api('mutation($input:StockDocCreateInput!){createStockDoc(input:$input)'
               '{id code type remark operator createdAt}}',
               {'input': {'type': 'STOCKTAKE', 'remark': remark,
                          'items': [{'variantId': vid, 'toStockLocationId': lid, 'qty': qty, 'realQty': qty}]}},
               token=tok, channel=ctoken)
    return (r.get('data') or {}).get('createStockDoc'), gerr(r)


def stocktake_count(tok, ctoken):
    _, r = api('query($t:String){stockDocList(type:$t,page:1,pageSize:5)'
               '{totalItems items{code type remark operator createdAt}}}', {'t': 'STOCKTAKE'},
               token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: 单据中心查询失败 %s' % gerr(r))
        raise SystemExit(2)
    d = ((r.get('data') or {}).get('stockDocList') or {})
    return d.get('totalItems'), (d.get('items') or [])


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
    lid = target_location(tok, ctoken)
    base0 = read_row(tok, ctoken, lid, SKU)
    if not base0:
        print('ENV-FAIL: 测试 SKU %s 在仓 %s 取不到明细行' % (SKU, lid))
        raise SystemExit(2)
    vid, base = base0['variantId'], base0['onHand']
    doc_cnt0, _ = stocktake_count(tok, ctoken)
    info('测试对象：sku=%s variantId=%s 仓=%s 原始 onHand=%d；STOCKTAKE 单据数=%d（账号 %s / 渠道 %s）'
         % (SKU, vid, lid, base, doc_cnt0, USER, CHANNEL_CODE))
    target = base + 1
    check('B 基线留档', isinstance(base, int) and base >= 0, 'onHand=%s 单据数=%s' % (base, doc_cnt0))

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
        pg.wait_for_selector('.fbar', timeout=90000)

        # 搜索定位测试 SKU（走真实搜索路径，顺带覆盖 keyword 过滤）
        si = pg.locator('.search input').first
        si.fill(SKU)
        pg.keyboard.press('Enter')
        card = pg.locator('.card', has_text=SKU).first
        card.wait_for(state='visible', timeout=60000)
        time.sleep(0.6)

        # 打开调整弹层
        card.locator('.act').nth(1).click()
        sheet = pg.locator('.sheet').first
        sheet.wait_for(state='visible', timeout=30000)
        pg.locator('.sheet .inp input').first.fill(str(target))
        OUT.mkdir(parents=True, exist_ok=True)

        # 截图①：调整弹层
        f1 = OUT / ('gap4-d42-%ssheet.png' % TAG)
        pg.screenshot(path=str(f1))

        pg.locator('.sheet .sbtn').last.click()
        # 等 Toast（成功或失败都会弹）
        toast_txt = ''
        try:
            tt = pg.locator('uni-toast').first
            tt.wait_for(state='visible', timeout=20000)
            time.sleep(1.0)
            toast_txt = (tt.inner_text() or '').strip()
        except Exception:  # noqa: BLE001
            toast_txt = ''
        info('Toast：%s' % (toast_txt or '(未捕获)'))

        time.sleep(1.5)

        # C 改数生效（API 回读，不信任 UI）
        after = read_row(tok, ctoken, lid, SKU)
        wrote_ok = bool(after) and after['onHand'] == target
        check('C 改数生效 onHand==目标值', wrote_ok,
              '期望 %d，实际 %s' % (target, after and after['onHand']))

        # D 留痕落库
        cnt1, docs = stocktake_count(tok, ctoken)
        new_cnt = (cnt1 == doc_cnt0 + 1)
        code_in_toast = False
        if new_cnt and docs:
            code = docs[0]['code']
            code_in_toast = code in toast_txt
            check('D 留痕落库 STOCKTAKE +1', True, '%d → %d，新单 %s op=%s' % (doc_cnt0, cnt1, code, docs[0].get('operator')))
            check('D-2 新单 code 出现在 Toast', code_in_toast, 'toast=%r code=%s' % (toast_txt, code))
        else:
            check('D 留痕落库 STOCKTAKE +1', new_cnt, '%d → %d' % (doc_cnt0, cnt1))
            check('D-2 新单 code 出现在 Toast', False, '无新单')

        # A 无授权失败
        auth = [e for e in errs if 'authoriz' in e.lower()]
        bad_toast = ('authoriz' in toast_txt.lower()) or ('失败' in toast_txt) or ('Failed' in toast_txt)
        check('A 无授权失败（控制台）', not auth, '%d 条' % len(auth))
        check('A-2 Toast 非失败态', (not bad_toast) and bool(toast_txt), 'toast=%r' % toast_txt)
        for e in errs[:6]:
            print('     ↳ %s' % e[:200])

        # 截图②：调整后的行（令其自证）
        try:
            pg.locator('.mask').first.wait_for(state='detached', timeout=15000)
        except Exception:  # noqa: BLE001
            pass
        try:
            pg.locator('uni-toast').first.wait_for(state='hidden', timeout=15000)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.8)
        card2 = pg.locator('.card', has_text=SKU).first
        if card2.count():
            card2.scroll_into_view_if_needed()
            time.sleep(0.5)
        f2 = OUT / ('gap4-d42-%srow.png' % TAG)
        pg.screenshot(path=str(f2))
        check('F 截图 %s / %s' % (f1.name, f2.name),
              f1.exists() and f1.stat().st_size > 5000 and f2.exists() and f2.stat().st_size > 5000,
              '%dB / %dB' % (f1.stat().st_size if f1.exists() else 0, f2.stat().st_size if f2.exists() else 0))

        b.close()

    # E 复原（仅当真正写入成功，避免污染生产）
    if wrote_ok:
        doc, e = write_abs(tok, ctoken, vid, lid, base, REMARK + '（复原）')
        back = read_row(tok, ctoken, lid, SKU)
        check('E 复原 onHand==原值', bool(back) and back['onHand'] == base,
              '%s → %s' % (e or (doc or {}).get('code'), back and back['onHand']))
    else:
        info('未写入成功，跳过复原（生产数据未被改动）')

    if FAILS:
        print('\n== 结果：%d 项失败 ==\n失败项：%s' % (len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果：全部通过 ==')
    raise SystemExit(0)


if __name__ == '__main__':
    main()
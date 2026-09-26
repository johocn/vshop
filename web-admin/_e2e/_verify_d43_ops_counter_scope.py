# -*- coding: utf-8 -*-
"""D43 验收：手工改数不得计入看板「作业员明细」的作业量口径。

背景：D42 起库存明细页「调整」复用 `stock_doc(type='STOCKTAKE')`（与「盘点任务过账单」同 type），
而看板「作业员明细」原先把「单据中心最近 100 条」**不过滤 type** 按 operator 聚合 → 手工改数被算成作业量。
修复：聚合前走 `opsCountableDocs()` 排除 STOCKTAKE（真盘库的人工作业量已由 `stocktakeStats(taskId)` 的
盘次/应盘行口径覆盖；手工改数是数据修正、不是作业量）。

断言（同一脚本两态可跑：部署前 = 缺陷态 / 部署后 = 修复态）：
  A 正对照：新建 **1 张 TRANSFER**（from == to，净零、不动库存）——它**必须**被计入
  B 反对照：新建 **2 张 STOCKTAKE**（手改 +1 与其复原）——它们**必须不计入**
  C 判定：作业员明细的增量 = **恰好 1 单 / 1 件**（缺陷态会得到 3 单 / 54 件）
  D 库存未被污染：两次写测试后收尾 onHand == 基线
  E 截图 390×844 @dpr2（作业员明细卡）

环境变量：WA_D43_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、WA_SMOKE_USER / WA_SMOKE_PWD、
  WA_D43_CHANNEL（默认 t2）、WA_D43_SKU（默认 P1789043229213）、WA_D43_TAG（before- / after-）
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

BASE = os.environ.get('WA_D43_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D43_CHANNEL', 't2')
SKU = os.environ.get('WA_D43_SKU', 'P1789043229213')
TAG = os.environ.get('WA_D43_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
DASH = 'pages/data/dashboard/index'
FLAG = 'MANUAL-ADJUST'

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
    _, r = api('query{tenantInventoryOverview{physicalStockEnabled virtualLocationId '
               'defaultPhysicalLocationId locations{id name kind}}}', token=tok, channel=ctoken)
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
    _, r = api('query($kw:String,$lid:ID){inventoryStockPage(input:{keyword:$kw,locationId:$lid,page:1,pageSize:5})'
               '{items{variantId sku stockLocationId onHand}}}', {'kw': sku, 'lid': lid}, token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: 库存回读失败 %s' % gerr(r))
        raise SystemExit(2)
    items = (((r.get('data') or {}).get('inventoryStockPage') or {}).get('items') or [])
    return next((i for i in items if i['sku'] == sku), None)


def create_doc(tok, ctoken, type_, items, remark):
    _, r = api('mutation($input:StockDocCreateInput!){createStockDoc(input:$input)'
               '{id code type remark operator createdAt}}',
               {'input': {'type': type_, 'remark': remark, 'items': items}}, token=tok, channel=ctoken)
    return (r.get('data') or {}).get('createStockDoc'), gerr(r)


def read_ops_card(pg):
    """读「作业员明细」卡片的行 → {operator: (count, qty)} 与合计。"""
    card = pg.locator('.card', has=pg.locator('.sec', has_text='作业员明细')).first
    card.wait_for(state='visible', timeout=60000)
    rows = card.locator('.top-row')
    n = rows.count()
    per, tc, tq = {}, 0, 0
    for i in range(n):
        name = (rows.nth(i).locator('.name').inner_text() or '').strip()
        cnt = int(''.join(ch for ch in rows.nth(i).locator('.cnt').inner_text() if ch.isdigit()) or 0)
        qty = int(''.join(ch for ch in rows.nth(i).locator('.qty').inner_text() if ch.isdigit()) or 0)
        per[name] = (cnt, qty)
        tc += cnt
        tq += qty
    return per, tc, tq, card


def open_ops(pg):
    pg.goto(BASE + '#/' + DASH + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    # 必须等「单据中心」那次请求真的回来再读表：作业员明细卡先以空态渲染，
    # 若在读表前只等卡片可见，基线会被读成 0（首轮实测踩坑）。
    pred = lambda r: 'stockDocList' in ((r.request.post_data or '') if r.request.method == 'POST' else '')
    with pg.expect_response(pred, timeout=90000):
        pg.locator('.seg.views .seg-item').nth(1).click()
    pg.locator('.card', has=pg.locator('.sec', has_text='作业员明细')).first.wait_for(state='visible', timeout=30000)
    time.sleep(0.5)


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
    base_row = read_row(tok, ctoken, lid, SKU)
    if not base_row:
        print('ENV-FAIL: 测试 SKU %s 在仓 %s 取不到明细行' % (SKU, lid))
        raise SystemExit(2)
    vid, base = base_row['variantId'], base_row['onHand']
    info('测试对象：sku=%s variantId=%s 仓=%s 基线 onHand=%d；账号 %s / 渠道 %s'
         % (SKU, vid, lid, base, USER, CHANNEL_CODE))

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        login(pg)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [CHANNEL_CODE, ctoken])

        open_ops(pg)
        before, tc0, tq0, _ = read_ops_card(pg)
        info('调整前作业员明细：%s（合计 %d 单 / %d 件）' % (before or '空', tc0, tq0))

        # ---- 写测试（3 张单）：2 张 STOCKTAKE（手改 +1 与复原）+ 1 张 TRANSFER（from==to 净零，正对照）----
        d1, e1 = create_doc(tok, ctoken, 'STOCKTAKE',
                            [{'variantId': vid, 'toStockLocationId': lid, 'qty': base + 1, 'realQty': base + 1}],
                            '%s | D43 验收-手改单（可忽略）' % FLAG)
        d2, e2 = create_doc(tok, ctoken, 'STOCKTAKE',
                            [{'variantId': vid, 'toStockLocationId': lid, 'qty': base, 'realQty': base}],
                            '%s | D43 验收-手改复原（可忽略）' % FLAG)
        d3, e3 = create_doc(tok, ctoken, 'TRANSFER',
                            [{'variantId': vid, 'fromStockLocationId': lid, 'toStockLocationId': lid, 'qty': 1}],
                            'D43 验收-正对照 TRANSFER（可忽略）')
        if e1 or e2 or e3:
            print('ENV-FAIL: 造单失败 %s / %s / %s' % (e1, e2, e3))
            b.close()
            raise SystemExit(2)
        info('已造单：STOCKTAKE %s / %s；TRANSFER %s（正对照）' % (d1['code'], d2['code'], d3['code']))
        after_stock = read_row(tok, ctoken, lid, SKU)
        check('D 库存未被污染（from==to 净零 + 手改已复原）',
              bool(after_stock) and after_stock['onHand'] == base,
              'onHand %s（基线 %s）' % (after_stock and after_stock['onHand'], base))

        open_ops(pg)
        after, tc1, tq1, card = read_ops_card(pg)
        info('调整后作业员明细：%s（合计 %d 单 / %d 件）' % (after or '空', tc1, tq1))

        dcount, dqty = tc1 - tc0, tq1 - tq0
        check('A 正对照：TRANSFER 被计入', dcount >= 1 and dqty >= 1,
              '增量 %d 单 / %d 件' % (dcount, dqty))
        check('B 反对照：2 张 STOCKTAKE 未计入', dcount == 1, '增量应为 1 单（缺陷态为 3 单），实际 %d' % dcount)
        check('C 判定：增量恰好 1 单 / 1 件（若手改单泄漏则为 3 单 / 54 件）',
              dcount == 1 and dqty == 1, '实际 %d 单 / %d 件' % (dcount, dqty))

        OUT.mkdir(parents=True, exist_ok=True)
        f = OUT / ('gap4-d43-%sops-counter.png' % TAG)
        try:
            card.screenshot(path=str(f))
        except Exception:  # noqa: BLE001
            pg.screenshot(path=str(f))
        check('E 截图 %s' % f.name, f.exists() and f.stat().st_size > 4000,
              '%dB' % (f.stat().st_size if f.exists() else 0))

        auth = [e for e in errs if 'authoriz' in e.lower()]
        check('F 页面无授权/接口报错', not auth and not [e for e in errs if 'ops docs failed' in e],
              '%d 条' % len(errs))
        for e in errs[:5]:
            print('     ↳ %s' % e[:180])
        b.close()

    if FAILS:
        print('\n== 结果：%d 项失败 ==\n失败项：%s' % (len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果：全部通过 ==')
    raise SystemExit(0)


if __name__ == '__main__':
    main()
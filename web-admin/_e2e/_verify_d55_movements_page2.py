# -*- coding: utf-8 -*-
"""D55-② 验收：库存流水「上滑加载更多（第二页）」真实 UI 证据。

背景（偏差表 D22②）：本地 shop-a 恰好 20 条流水 == 单页 take:20，无第二页可加载，
当时改用 API 分页契约对账（C1–C5）留档。本脚本先**在本地库真实造 >20 条流水**，再驱动 UI 上滑加载，
实拍第二页累积。

安全：仅允许本地 BASE（localhost / 127.0.0.1），生产域名直接 ENV-FAIL 退出码 2；绝不触碰生产。
副作用：本地 shop-a 会增加若干条采购入库单与流水（本地库脏数据，已在计划 D55 行留档）。

断言
  S1 环境为本地 + 渠道流水总数 > 20（不足则自动补造到 25 条）
  S2 UI 首屏加载 20 条（== 单页上限）
  S3 上滑到底后累积条数 == min(totalItems, 40) 且 > 20（= 第二页真的加载出来）
  S4 出现「没有更多了」且 0 pageerror
  S5 取证 docs/verify/gap4-batch3-movements-page2-390.png（780×1688）
退出码：0 全通过 / 1 断言失败 / 2 环境不可用

与计划的偏差（执行期实测修正，已在 D55 偏差行登记）：
  1. `stockMovementLedger` 的 SDL **没有 `channelCode` 入参**（见 cjk-plugin/src/plugin.ts:1252），
     渠道一律靠请求头 `vendure-token` 收口 —— 故本脚本不再传 channelCode，改为传真实渠道 token 头。
  2. 渠道 token ≠ 渠道 code：浏览器 localStorage 的 `wa_channel_token` 必须是
     `myTenantAccess.channels[].token`（沿用 _verify_gap4_batch3.py 既有口径），
     直接把 'shop-a' 写进去会切不过渠道 → UI 与 API 口径不一致。
  3. PURCHASE 入库的目标仓按「既有流水首行」推导；若该仓被后端拒（仓性质守卫 D52），
     自动换候选仓重试（从本页 20 行里逐个试）。
"""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_D55_BASE', 'http://localhost:5280/')
ADMIN = os.environ.get('WA_API_ADMIN', 'http://127.0.0.1:3000/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL = os.environ.get('WA_B3_CHANNEL', 'shop-a')
TARGET = int(os.environ.get('WA_D55_TARGET_ROWS', '25'))
MOVEMENTS = 'pages/inventory/movements/index'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
TAKE = 20
FAILS = []


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


def api(query, variables=None, token=None, channel=None, base=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if channel:
        headers['vendure-token'] = channel
    req = urllib.request.Request(base or ADMIN, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except urllib.error.HTTPError as e:  # noqa: BLE001
        return None, {'HTTPError': e.code, 'body': e.read().decode('utf-8', 'ignore')[:400]}
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:200]}


def admin_login():
    """返回 (超级管理员 token, 目标渠道的真实 vendure-token)"""
    tok, r = api('mutation($u:String!,$p:String!,$e:Boolean){login(username:$u,password:$p,rememberMe:$e){... on CurrentUser{id}}}',
                 {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        env_fail('admin 登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
    _, r2 = api('query{ myTenantAccess{ channels{ id code token } } }', token=tok)
    chans = ((r2.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL), None)
    if not ch:
        env_fail('渠道 %s 不在 %s' % (CHANNEL, [c['code'] for c in chans][:8]))
    return tok, ch['token']


# 注意：`stockMovementLedger` 没有 channelCode 入参，渠道靠 vendure-token 头（见插件 SDL）。
LEDGER_Q = ('query($page:Int,$pageSize:Int){stockMovementLedger(page:$page,pageSize:$pageSize)'
            '{totalItems items{id productVariantId stockLocationId bizType direction quantity}}}')


def ledger(tok, ctoken, page=1, take=TAKE):
    _, r = api(LEDGER_Q, {'page': page, 'pageSize': take}, token=tok, channel=ctoken)
    if r.get('errors'):
        env_fail('流水查询失败 %s' % str(r['errors'][0].get('message'))[:200])
    return (r.get('data') or {}).get('stockMovementLedger') or {'totalItems': 0, 'items': []}


def seed_purchase(tok, ctoken, variant_id, location_id, qty, tag):
    """返回 (ok, 错误简述)"""
    q = 'mutation($input:StockDocCreateInput!){createStockDoc(input:$input){id code type}}'
    _, r = api(q, {'input': {'type': 'PURCHASE', 'remark': 'D55-② 造流水 %s' % tag,
                             'items': [{'variantId': str(variant_id), 'toStockLocationId': str(location_id),
                                        'qty': qty}]}},
               token=tok, channel=ctoken)
    if r.get('errors'):
        return False, str(r['errors'][0].get('message'))[:160]
    if not (r.get('data') or {}).get('createStockDoc'):
        return False, json.dumps(r, ensure_ascii=False)[:160]
    return True, ''


def rows_loaded(pg):
    return pg.locator('.grp .card').count()


def scroll_to_bottom(pg):
    pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    pg.wait_for_timeout(1600)


def login(pg, ctoken):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)
    # 渠道注入：必须是真实渠道 token（不是 code），否则页面加载的是默认渠道数据
    pg.evaluate("(c)=>{localStorage.setItem('wa_channel_token',c.token);localStorage.setItem('wa_channel_code',c.code);}",
                {'token': ctoken, 'code': CHANNEL})
    pg.reload(wait_until='domcontentloaded', timeout=60000)


def main():
    host = urllib.parse.urlparse(BASE).hostname or ''
    if host not in ('localhost', '127.0.0.1'):
        env_fail('本脚本会真实写入库存，仅允许本地 BASE，当前 host=%s' % host)

    tok, ctoken = admin_login()
    print('  渠道 %s（token=%s…）' % (CHANNEL, ctoken[:6]))

    led = ledger(tok, ctoken, 1, 5)
    check('S1a 渠道 %s 已有流水 totalItems=%d' % (CHANNEL, led['totalItems']), True)
    if not led['items']:
        env_fail('渠道 %s 无任何流水，无法推导 variantId / stockLocationId' % CHANNEL)

    # 候选仓：取本页所有 locationId 去重（PURCHASE 目标仓可能被仓性质守卫拒，逐个试）
    cand_locs = []
    for it in led['items']:
        lid = str(it['stockLocationId'])
        if lid not in cand_locs:
            cand_locs.append(lid)
    variant_id = led['items'][0]['productVariantId']
    print('  推导 variantId=%s，候选仓=%s' % (variant_id, cand_locs))

    made = 0
    loc_used = ''
    loc_err = ''
    while ledger(tok, ctoken, 1, 1)['totalItems'] < TARGET:
        before = ledger(tok, ctoken, 1, 1)['totalItems']
        ok = False
        for lid in cand_locs:
            ok, loc_err = seed_purchase(tok, ctoken, variant_id, lid, 1, 'n%d' % (made + 1))
            if ok:
                loc_used = lid
                break
        if not ok:
            env_fail('造采购入库单失败（候选仓 %s 全部被拒）：%s' % (cand_locs, loc_err))
        after = ledger(tok, ctoken, 1, 1)['totalItems']
        if after <= before:
            env_fail('createStockDoc 成功但流水未增加（before=%d after=%d）——写链路不同步' % (before, after))
        made += 1
        if made > 60:
            env_fail('造数据超过 60 次仍未达 %d 条，请检查渠道数据' % TARGET)
    total = ledger(tok, ctoken, 1, 1)['totalItems']
    print('  使用目标仓 id=%s' % loc_used)
    check('S1b 流水总数 > %d（本轮新造 %d 条）' % (TAKE, made), total > TAKE, 'totalItems=%d' % total)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        login(pg, ctoken)
        pg.goto('%s#/%s?cb=%d' % (BASE, MOVEMENTS, int(time.time() * 1000)),
                wait_until='domcontentloaded', timeout=60000)
        pg.reload(wait_until='domcontentloaded', timeout=60000)
        pg.locator('.grp .card').first.wait_for(state='visible', timeout=90000)
        time.sleep(1.0)

        first = rows_loaded(pg)
        check('S2 首屏加载 %d 条（== 单页上限 %d）' % (first, TAKE), first == TAKE, 'rows=%d' % first)

        for _ in range(4):
            scroll_to_bottom(pg)
            if rows_loaded(pg) > first:
                break
        if rows_loaded(pg) == first:
            # 兜底：uni-app H5 的 onReachBottom 未必认 window.scrollTo，改用滚轮驱动
            for _ in range(4):
                pg.mouse.move(195, 700)
                pg.mouse.wheel(0, 20000)
                pg.wait_for_timeout(1600)
                if rows_loaded(pg) > first:
                    break

        loaded = rows_loaded(pg)
        expect = min(total, TAKE * 2)
        check('S3 上滑后累积 %d 条 == min(totalItems %d, 40) 且 > %d' % (loaded, total, TAKE),
              loaded == expect and loaded > TAKE, 'rows=%d expect=%d' % (loaded, expect))
        body = pg.inner_text('body')
        check('S4 出现「没有更多了」', '没有更多了' in body, 'body=%r' % body[-160:].replace('\n', '|'))
        check('S4 0 pageerror', not errs, str(errs[:2]))

        OUT.mkdir(parents=True, exist_ok=True)
        shot = OUT / 'gap4-batch3-movements-page2-390.png'
        pg.screenshot(path=str(shot))
        check('S5 取证图 %s' % shot.name, shot.exists() and shot.stat().st_size > 4000,
              '%dB' % (shot.stat().st_size if shot.exists() else 0))
        b.close()

    print('\n===== D55-② 验收：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()

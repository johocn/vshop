# -*- coding: utf-8 -*-
"""盘库接口只读探针（本地/生产通用）。默认只读；写链路自检在 Task 7 以 --write 开启。

渠道收口修正（相对计划初稿）：
裸 superadmin 不带渠道 token 时 ctx.channelId 会落到默认渠道，而 Task3 造的库位/绑定夹具
建在 shop-a 渠道，binOccupancy 会因渠道收口返回空 → 「binOccupancy 返回格子（含空格）」假失败。
故本脚本登录后按 WA_SMOKE_CHANNEL（默认 shop-a）取该渠道 token，并作为 vendure-token 头随请求带上。
登录/取渠道 token 的写法照 scripts/_smoke_picking_live.py。
"""
import argparse
import base64
import json
import os
import sys
import urllib.request

BASE = os.environ.get('WA_SMOKE_BASE', 'http://localhost:3000')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 'shop-a')
LOC = os.environ.get('WA_SMOKE_LOC', '1')

FAILED = []


def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + ((' | ' + str(detail)) if detail else ''))
    if not cond:
        FAILED.append(name)


def post(path, payload, token=None, channel_token=None):
    req = urllib.request.Request(
        BASE.rstrip('/') + path,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    if channel_token:
        req.add_header('vendure-token', channel_token)
    with urllib.request.urlopen(req) as resp:
        cookie = resp.headers.get('Set-Cookie')
        return json.loads(resp.read().decode('utf-8')), (cookie or '')


def login():
    """登录并取出 admin Bearer 令牌。

    本环境的 admin-api 走 Bearer 而不是 Cookie（实测裸 Cookie 会 FORBIDDEN）：
    login mutation 只回 CurrentUser，真正的会话令牌在响应的 `session` cookie 里（base64 的
    {"token": "..."}），取出后作为 Authorization: Bearer 使用。
    """
    payload = {
        'query': 'mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id identifier } } }'
        % (USER, PWD)
    }
    data, set_cookie = post('/admin-api', payload)
    if data.get('errors'):
        print('登录失败：', data['errors'])
        sys.exit(1)
    raw = (set_cookie or '').split(';')[0]
    if '=' not in raw:
        print('登录未返回会话 cookie：', set_cookie)
        sys.exit(1)
    value = raw.split('=', 1)[1]
    try:
        token = json.loads(base64.b64decode(value + '=' * (-len(value) % 4)))['token']
    except Exception as e:
        print('解析会话令牌失败：', e)
        sys.exit(1)
    return token


def gql(token, query, channel_token=None):
    data, _ = post('/admin-api', {'query': query}, token, channel_token)
    return data


def fetch_channel_token(token):
    """登录后按渠道 code 取渠道 token（myTenantAccess.channels 由 cjk-plugin 提供）。"""
    d = gql(token, 'query { myTenantAccess { channels { id code token } } }')
    if d.get('errors'):
        print('取渠道令牌失败：', d['errors'])
        sys.exit(1)
    channels = (d.get('data') or {}).get('myTenantAccess', {}).get('channels') or []
    hit = next((c for c in channels if c.get('code') == CHANNEL), None)
    if not hit:
        print('未找到渠道 %r；可用渠道：%s' % (CHANNEL, [c.get('code') for c in channels]))
        sys.exit(1)
    return hit.get('token')


QUERY_NAMES = ['stocktakeTasks', 'stocktakeTask', 'stocktakeWaves', 'stocktakeExpectedLines',
               'stocktakeDiff', 'stocktakeResolveCode', 'variantBinsByLocation', 'binOccupancy']
MUTATION_NAMES = ['createStocktakeTask', 'addStocktakeWave', 'assignStocktakeWave', 'claimStocktakeWave',
                  'releaseStocktakeWave', 'saveStocktakeCounts', 'submitStocktakeWave', 'postStocktake',
                  'cancelStocktakeTask', 'cancelStocktakeWave']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='启用写链路自检（建任务/录入/提交/过账/复位）')
    args = ap.parse_args()
    token = login()
    channel_token = fetch_channel_token(token)
    print('渠道令牌：code=%s token=%s' % (CHANNEL, (channel_token or '')[:12]))
    check('已取到渠道令牌 %s' % CHANNEL, bool(channel_token))

    intro = gql(token, '{ __schema { queryType { fields { name } } mutationType { fields { name } } } }')
    qs = {f['name'] for f in intro['data']['__schema']['queryType']['fields']}
    ms = {f['name'] for f in intro['data']['__schema']['mutationType']['fields']}
    for n in QUERY_NAMES:
        check('admin Query.%s 已注册' % n, n in qs)
    for n in MUTATION_NAMES:
        check('admin Mutation.%s 已注册' % n, n in ms)

    # 渠道收口（必测项）：只返回本渠道任务，且字段可查
    r = gql(token, '{ stocktakeTasks(options: { page: 1, pageSize: 5 }) { totalItems items { id code state waveCount expectedTotal } } }',
            channel_token)
    check('stocktakeTasks 可查且按渠道收口（无 errors）', not r.get('errors'), r.get('errors'))

    # 反向查询
    o = gql(token, '{ binOccupancy(stockLocationId: "%s") { binId binCode skuCount } }' % LOC, channel_token)
    check('binOccupancy 可查', not o.get('errors'), o.get('errors'))
    if not o.get('errors'):
        rows = o['data']['binOccupancy']
        check('binOccupancy 返回格子（含空格）', len(rows) > 0 and any(x['skuCount'] == 0 for x in rows), 'n=%d' % len(rows))

    b = gql(token, '{ variantBinsByLocation(stockLocationId: "%s", pageSize: 5) { totalItems items { variantId sku zoneCode binCode barcode } } }' % LOC,
            channel_token)
    check('variantBinsByLocation 可查', not b.get('errors'), b.get('errors'))

    # 有意单侧注册的验证：shop-api 不应有盘库字段
    shop = post('/shop-api', {'query': '{ __schema { queryType { fields { name } } } }'}, None)[0]
    shop_names = {f['name'] for f in shop['data']['__schema']['queryType']['fields']} if not shop.get('errors') else set()
    check('shop-api 不含盘库查询（有意单侧注册）', not any(n in shop_names for n in QUERY_NAMES),
          sorted(n for n in QUERY_NAMES if n in shop_names))

    if args.write:
        write_checks(token, channel_token)

    print('\n%s' % ('全部通过' if not FAILED else '失败 %d 项：%s' % (len(FAILED), FAILED)))
    sys.exit(1 if FAILED else 0)


def write_checks(token, channel_token):
    # 写链路自检（本地库专用；生产不要跑 --write）
    import time
    name = '自检-盘库-%d' % int(time.time())
    c = gql(token, 'mutation { createStocktakeTask(input: { stockLocationId: "%s", name: "%s", activityCode: "SMOKE" }) { id code waveCount expectedTotal } }' % (LOC, name),
            channel_token)
    check('建任务成功', not c.get('errors'), c.get('errors'))
    if c.get('errors'):
        return
    task = c['data']['createStocktakeTask']
    check('任务号形如 TKyyyymmdd-nnn', task['code'].startswith('TK') and '-' in task['code'], task['code'])
    check('已自动拆盘次', task['waveCount'] > 0, task['waveCount'])
    w = gql(token, '{ stocktakeWaves(taskId: "%s") { id state assigneeId expectedCount } }' % task['id'], channel_token)
    waves = w['data']['stocktakeWaves']
    check('盘次默认待认领', all(x['assigneeId'] is None for x in waves))
    wid = waves[0]['id']
    ln = gql(token, '{ stocktakeExpectedLines(taskId: "%s", waveId: "%s", pageSize: 1) { items { id variantId } } }' % (task['id'], wid), channel_token)
    line = ln['data']['stocktakeExpectedLines']['items'][0]
    denied = gql(token, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 1 }]) { id } }' % (wid, line['id']), channel_token)
    check('未认领时录入被拒（独占锁）', bool(denied.get('errors')) and '认领' in json.dumps(denied['errors'], ensure_ascii=False), denied.get('errors'))
    cl = gql(token, 'mutation { claimStocktakeWave(waveId: "%s") { id state assigneeName } }' % wid, channel_token)
    check('认领成功', not cl.get('errors'), cl.get('errors'))
    sv = gql(token, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 1 }]) { id state countedCount } }' % (wid, line['id']), channel_token)
    check('录入成功且盘次进入 COUNTING', not sv.get('errors') and sv['data']['saveStocktakeCounts']['state'] == 'COUNTING', sv.get('errors') or sv['data'])
    sb = gql(token, 'mutation { submitStocktakeWave(waveId: "%s") { id state } }' % wid, channel_token)
    check('提交成功', not sb.get('errors') and sb['data']['submitStocktakeWave']['state'] == 'SUBMITTED', sb.get('errors') or sb['data'])
    cc = gql(token, 'mutation { cancelStocktakeTask(taskId: "%s") { id state } }' % task['id'], channel_token)
    check('取消任务成功（清理）', not cc.get('errors') and cc['data']['cancelStocktakeTask']['state'] == 'CANCELLED', cc.get('errors') or cc['data'])


if __name__ == '__main__':
    main()
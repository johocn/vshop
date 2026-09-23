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
    ap.add_argument('--post', action='store_true', help='追加过账链路自检（会真实改库存，末尾复位；隐含 --write）')
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

    if args.write or args.post:
        task = write_checks(token, channel_token, args.post)
        if args.post and task:
            post_checks(token, channel_token, task)

    print('\n%s' % ('全部通过' if not FAILED else '失败 %d 项：%s' % (len(FAILED), FAILED)))
    sys.exit(1 if FAILED else 0)


def write_checks(token, channel_token, post=False):
    """写链路自检（**本地库专用**；生产不要跑 --write）。

    返回约定：`post=True` 时建任务后**不取消**，把任务字典返回给 `post_checks` 继续走
    过账链路；`post=False` 时跑完盘次写链路检查后**建完即取消**清理，返回 None。
    """
    import time
    name = '自检-盘库-%d' % int(time.time())
    c = gql(token, 'mutation { createStocktakeTask(input: { stockLocationId: "%s", name: "%s", activityCode: "SMOKE" }) { id code waveCount expectedTotal } }' % (LOC, name),
            channel_token)
    check('建任务成功', not c.get('errors'), c.get('errors'))
    if c.get('errors'):
        return None
    task = c['data']['createStocktakeTask']
    check('任务号形如 TKyyyymmdd-nnn', task['code'].startswith('TK') and '-' in task['code'], task['code'])
    check('已自动拆盘次', task['waveCount'] > 0, task['waveCount'])
    w = gql(token, '{ stocktakeWaves(taskId: "%s") { id state assigneeId expectedCount } }' % task['id'], channel_token)
    waves = w['data']['stocktakeWaves']
    check('盘次默认待认领', all(x['assigneeId'] is None for x in waves))
    if post:
        # 过账模式：盘次写链路检查改由 post_checks 在「全部盘次」循环里断言（避免重复认领已提交盘次）
        return task
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
    return None


def post_checks(token, channel_token, task):
    """过账链路自检（**本地专用**）：制造差异 → 过账 → 断言库存 → 复位。

    语义要点（用户裁决）：「整变体未盘」视为**真跳过** —— summarizeVariance 不把整变体未盘的
    变体放进 byVariant，故不进过账计划，**过账后账面保持不变**；只有已盘（含盘盈）变体被实盘覆盖。
    因此本函数除断言「已盘变体已按实盘覆盖（=0）」外，还断言「未盘变体账面与盘点前快照逐条一致」。
    """
    task_id = task['id']

    # ① 盘点前账面快照
    before = gql(token, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC, channel_token)
    book_before = {i['productVariantId']: i['stockOnHand'] for i in before['data']['stockLevels']['items']}
    check('盘点前账面快照可读', not before.get('errors') and len(book_before) > 0, 'n=%d' % len(book_before))

    # ② 全部盘次：认领 → 录入（第 1 行改成 0，制造 -N 差异）→ 提交
    waves = gql(token, '{ stocktakeWaves(taskId: "%s") { id state } }' % task_id, channel_token)['data']['stocktakeWaves']
    recorded = []          # 被录入（=0）的 variantId（过账后会改变，复位时需还原）
    target_variant = None  # 有正账面的被测变体（⑦ 断言其被写成 0）
    for idx, w in enumerate(waves):
        lines = gql(token, '{ stocktakeExpectedLines(taskId: "%s", waveId: "%s", pageSize: 200) { items { id variantId } } }'
                    % (task_id, w['id']), channel_token)['data']['stocktakeExpectedLines']['items']
        if idx == 0 and lines:
            denied = gql(token, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 0 }]) { id } }'
                         % (w['id'], lines[0]['id']), channel_token)
            check('未认领时录入被拒（独占锁）', bool(denied.get('errors')) and '认领' in json.dumps(denied['errors'], ensure_ascii=False), denied.get('errors'))
        cl = gql(token, 'mutation { claimStocktakeWave(waveId: "%s") { id state assigneeName } }' % w['id'], channel_token)
        if idx == 0:
            check('认领成功', not cl.get('errors'), cl.get('errors'))
        if lines:
            vid = lines[0]['variantId']
            recorded.append(vid)
            if target_variant is None and book_before.get(vid, 0) > 0:
                target_variant = vid
            sv = gql(token, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: 0 }]) { id state countedCount } }'
                     % (w['id'], lines[0]['id']), channel_token)
            if idx == 0:
                check('录入成功且盘次进入 COUNTING', not sv.get('errors') and sv['data']['saveStocktakeCounts']['state'] == 'COUNTING', sv.get('errors') or sv['data'])
        sb = gql(token, 'mutation { submitStocktakeWave(waveId: "%s") { id state } }' % w['id'], channel_token)
        if idx == 0:
            check('提交成功', not sb.get('errors') and sb['data']['submitStocktakeWave']['state'] == 'SUBMITTED', sb.get('errors') or sb['data'])
    if target_variant is None and recorded:
        target_variant = recorded[-1]
    ts = gql(token, '{ stocktakeTask(id: "%s") { state } }' % task_id, channel_token)
    check('全部盘次已提交（任务进入 COUNTED）', not ts.get('errors') and ts['data']['stocktakeTask']['state'] == 'COUNTED', ts.get('errors') or ts['data'])

    # ③ 差异必须看到未盘项（其余行未盘）
    d = gql(token, '{ stocktakeDiff(taskId: "%s") { uncountedCount extraCount recheck rows { variantSku countedTotal bookQty diff } } }' % task_id, channel_token)
    check('差异页可读且能列出未盘项', not d.get('errors') and d['data']['stocktakeDiff']['uncountedCount'] > 0, d.get('errors') or d['data'])

    # ④ 不 confirm 必须被拒（未盘项存在）
    p1 = gql(token, 'mutation { postStocktake(taskId: "%s") { ok message } }' % task_id, channel_token)
    check('有未盘项时过账被拒', not p1.get('errors') and p1['data']['postStocktake']['ok'] is False, p1.get('errors') or p1['data'])

    # ⑤ confirm 过账成功且有 stockDocId
    p2 = gql(token, 'mutation { postStocktake(taskId: "%s", confirm: true) { ok stockDocId message } }' % task_id, channel_token)
    pos = None if p2.get('errors') else p2['data']['postStocktake']
    check('过账成功并返回 stockDocId', bool(pos) and pos['ok'] is True and bool(pos['stockDocId']), p2.get('errors') or p2['data'])

    # ⑥ 重复过账被拒（幂等保护）
    p3 = gql(token, 'mutation { postStocktake(taskId: "%s", confirm: true) { ok } }' % task_id, channel_token)
    check('重复过账被拒（幂等保护）', bool(p3.get('errors')), p3.get('errors'))

    # ⑦ 库存已按实盘更新（被测变体被写成 0）
    after = gql(token, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC, channel_token)
    nb = {i['productVariantId']: i['stockOnHand'] for i in after['data']['stockLevels']['items']}
    check('过账后物理库存已更新为目标值（=0）', nb.get(target_variant, 0) == 0,
          'variant=%s before=%s after=%s' % (target_variant, book_before.get(target_variant), nb.get(target_variant)))

    # ⑦b 核心断言：未盘变体过账后账面不变（逐个比对，报告一致个数/总数）
    unrecorded = {vid: qty for vid, qty in book_before.items() if vid not in recorded}
    same = sum(1 for vid, qty in unrecorded.items() if nb.get(vid) == qty)
    check('未盘变体过账后账面不变', same == len(unrecorded), '一致 %d/%d' % (same, len(unrecorded)))

    # ⑧ 复位（必做）：把被录入的变体全部还原为盘点前账面
    for vid in dict.fromkeys(recorded):
        gql(token, 'mutation { setVariantStock(productVariantId: "%s", stockLocationId: "%s", stockOnHand: %d) }'
            % (vid, LOC, book_before.get(vid, 0)), channel_token)
    back = gql(token, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC, channel_token)
    rb = {i['productVariantId']: i['stockOnHand'] for i in back['data']['stockLevels']['items']}
    check('库存已复位到盘点前账面', rb.get(target_variant) == book_before.get(target_variant),
          'variant=%s want=%s got=%s' % (target_variant, book_before.get(target_variant), rb.get(target_variant)))
    check('全部被改变体均已复位', all(rb.get(vid) == book_before.get(vid) for vid in set(recorded)), 'variants=%s' % sorted(set(recorded)))

    # 自检数据（Task 15 手册「测试数据与复位」用）
    print('[自检数据] taskId=%s code=%s postedStockDocId=%s 被改变体=%s 复位目标=%s(账面=%s)'
          % (task_id, task['code'], (pos or {}).get('stockDocId'), sorted(set(recorded)),
             target_variant, book_before.get(target_variant)))

    # 收尾：过账后任务为终态 POSTED（状态机 POSTED→∅），cancelStocktakeTask 无法取消，只做尽力尝试并打印
    cc = gql(token, 'mutation { cancelStocktakeTask(taskId: "%s") { id state } }' % task_id, channel_token)
    print('[清理尝试] cancelStocktakeTask（POSTED 终态预期被拒）→ %s' % (cc.get('errors') or cc['data']))


if __name__ == '__main__':
    main()
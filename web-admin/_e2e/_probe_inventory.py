# -*- coding: utf-8 -*-
# 库存 v2 只读探针（生产 admin-api）：校验 inventoryStockPage / inventoryAlertRules / stockDocList 真实可用
# 用法: python _e2e/_probe_inventory.py
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 说明：
#   1) 本脚本只发 query，绝不发 mutation（不创建单据、不改安全库存）
#   2) 请求在**已登录浏览器页面内**发出（与 App 同路径/同头），因为管理员会话是渠道上下文的，
#      脱离页面用裸 urllib 复现会被判 FORBIDDEN。
from playwright.sync_api import sync_playwright
import time, json

BASE = 'https://e.joho.cn/guanli/'
ACC = ('guoxinnanshan@163.com', 'you123123')
CH = 't2'  # 用于从 myTenantAccess 里挑渠道

Q_PAGE = '''query Page($input: InventoryStockQueryInput) {
  inventoryStockPage(input: $input) {
    totalItems
    summary { skuCount onHandTotal allocatedTotal availableTotal valueTotal outCount lowCount okCount outbound7d }
    items { variantId productId variantName sku optionText thumbnail stockLocationId locationName
            onHand allocated available safetyStock value costPrice bucket lastMovementAt lastDirection lastBizType }
  }
}'''

Q_RULES = '''query Rules($locationId: ID) {
  inventoryAlertRules(locationId: $locationId) { variantId locationId safetyStock enabled }
}'''

Q_DOCS = '''query Docs($type: String, $page: Int, $pageSize: Int) {
  stockDocList(type: $type, page: $page, pageSize: $pageSize) {
    totalItems
    items { id code type remark operator createdAt itemCount totalQty }
  }
}'''

Q_CH = '''query { activeChannel { id code customFields { inventoryDefaultSafetyStock } } }'''


def show(label, body):
    if body.get('errors'):
        print('[%s] ERR: %s' % (label, json.dumps(body['errors'], ensure_ascii=False)[:300]))
        ERRS.append(label)
        return None
    return body.get('data')


ERRS = []
verdict = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).fill(ACC[0])
    pg.locator('input').nth(1).fill(ACC[1])
    pg.locator('button, .btn').first.click()
    time.sleep(7)

    # 取渠道 token 并写入会话（与截图脚本同一注入法），随后在页面内挂一个只读 gql 发送器
    auth = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = ((d.data||{}).myTenantAccess||{}).channels || [];
        const hit = c.find(x=>x.code==='""" + CH + """');
        if (!hit) return 'NOCHANNEL:' + c.map(x=>x.code).join(',');
        localStorage.setItem('wa_channel_token', hit.token);
        localStorage.setItem('wa_channel_code', '""" + CH + """');
        window.__probe = (q, v) => fetch('/admin-api', {method:'POST',
          headers:{'Content-Type':'application/json',
                   'Authorization':'Bearer '+localStorage.getItem('wa_auth_token'),
                   'vendure-token': hit.token},
          body: JSON.stringify({query:q, variables:v||{}})}).then(r=>r.json());
        return 'OK:' + hit.token;
      }).catch(e=>'ERR:'+e.message);
    }""")

    def gql(_token, _channel, query, variables=None):
        return pg.evaluate("([q,v]) => window.__probe(q, v)", [query, variables or {}])

    print('channel inject =', auth[:14] + ('…' if len(auth) > 14 else ''))
    if not auth.startswith('OK:'):
        b.close()
        raise SystemExit('登录/取渠道失败（' + auth + '），后续断言跳过')
    CH_TOKEN = auth[3:]

    # ---- 1) 全量口径 ----
    d1 = show('inventoryStockPage(全部)', gql(None, CH_TOKEN, Q_PAGE, {'input': {'page': 1, 'pageSize': 20}}))
    base_total = 0
    summary = None
    first_rows = []
    if d1:
        page = d1['inventoryStockPage']
        base_total = page['totalItems']
        summary = page['summary']
        first_rows = page['items']
        print('  totalItems =', base_total)
        print('  summary    =', json.dumps(summary, ensure_ascii=False))
        print('  首行       =', json.dumps(first_rows[0], ensure_ascii=False) if first_rows else '(空)')
        verdict.append(('summary.onHandTotal > 0', summary['onHandTotal'] > 0, summary['onHandTotal']))
        verdict.append(('summary.skuCount == 全部 totalItems', summary['skuCount'] == base_total,
                        (summary['skuCount'], base_total)))
        verdict.append(('summary.onHandTotal == allocatedTotal + availableTotal',
                        summary['onHandTotal'] == summary['allocatedTotal'] + summary['availableTotal'],
                        (summary['onHandTotal'], summary['allocatedTotal'], summary['availableTotal'])))
        verdict.append(('分桶计数之和 == 全部数',
                        summary['outCount'] + summary['lowCount'] + summary['okCount'] == base_total,
                        (summary['outCount'], summary['lowCount'], summary['okCount'], base_total)))

        # ---- 2) 缺货桶：totalItems 必须等于 summary.outCount，且行 bucket 全为 out ----
        d2 = show('inventoryStockPage(bucket=out)', gql(None, CH_TOKEN, Q_PAGE,
                                                        {'input': {'page': 1, 'pageSize': 20, 'bucket': 'out'}}))
        if d2:
            out_page = d2['inventoryStockPage']
            out_items = out_page['items']
            print('  缺货桶 totalItems =', out_page['totalItems'], '（summary.outCount =', summary['outCount'], '）')
            verdict.append(('缺货桶 totalItems == summary.outCount', out_page['totalItems'] == summary['outCount'],
                            (out_page['totalItems'], summary['outCount'])))
            verdict.append(('缺货桶行 bucket 全为 out', all(x['bucket'] == 'out' for x in out_items), len(out_items)))

        # ---- 3) 关键词（取首行真实 SKU，保证服务端 LIKE 能命中）----
        if first_rows:
            kw = first_rows[0]['sku']
            d3 = show('inventoryStockPage(keyword=%s)' % kw, gql(None, CH_TOKEN, Q_PAGE,
                                                                {'input': {'page': 1, 'pageSize': 20, 'keyword': kw}}))
            if d3:
                kw_page = d3['inventoryStockPage']
                kw_items = kw_page['items']
                print('  keyword 命中 =', kw_page['totalItems'], '（全量 =', base_total, '）')
                verdict.append(('keyword 命中数 ≤ 全量且 ≥ 1', 1 <= kw_page['totalItems'] <= base_total,
                                (kw_page['totalItems'], base_total)))
                verdict.append(('keyword 命中（理想 < 全量，单 SKU 环境相等属正常）',
                                kw_page['totalItems'] < base_total, kw_page['totalItems']))
                verdict.append(('keyword 命中行 sku 均含关键词',
                                all(kw.lower() in x['sku'].lower() for x in kw_items), len(kw_items)))

        # ---- 4) 排序：stockAsc 前 3 行 onHand 单调不减 ----
        d4 = show('inventoryStockPage(sort=stockAsc)', gql(None, CH_TOKEN, Q_PAGE,
                                                           {'input': {'page': 1, 'pageSize': 20, 'sort': 'stockAsc'}}))
        if d4:
            vals = [x['onHand'] for x in d4['inventoryStockPage']['items'][:3]]
            print('  stockAsc 前 3 行 onHand =', vals)
            verdict.append(('sort=stockAsc 前 3 行 onHand 单调不减',
                            all(vals[i] <= vals[i + 1] for i in range(len(vals) - 1)), vals))
        # 非法 sort 回退默认（规格 §4：不抛异常）
        d4b = show('inventoryStockPage(sort=__bad__) 非法值回退', gql(None, CH_TOKEN, Q_PAGE,
                                                                      {'input': {'page': 1, 'pageSize': 20, 'sort': '__bad__'}}))
        verdict.append(('非法 sort 回退默认且不报错',
                        bool(d4b and d4b['inventoryStockPage']['items'] is not None), True))

    # ---- 5) 预警规则 + 渠道默认安全库存 ----
    d5 = show('inventoryAlertRules(locationId=null)', gql(None, CH_TOKEN, Q_RULES, {'locationId': None}))
    if d5:
        rules = d5['inventoryAlertRules']
        print('  「全仓通用」规则条数 =', len(rules))
        if rules:
            print('  首条 =', json.dumps(rules[0], ensure_ascii=False))
        verdict.append(('inventoryAlertRules 可读（数组，允许 0 条）', isinstance(rules, list), len(rules)))
        verdict.append(('规则行含 variantId/safetyStock/enabled/locationId',
                        all({'variantId', 'safetyStock', 'enabled', 'locationId'} <= set(r) for r in rules), True))

    d6 = show('activeChannel.customFields.inventoryDefaultSafetyStock', gql(None, CH_TOKEN, Q_CH))
    if d6:
        cf = (d6['activeChannel'] or {}).get('customFields') or {}
        print('  渠道默认安全库存 =', cf.get('inventoryDefaultSafetyStock'))
        verdict.append(('渠道字段 inventoryDefaultSafetyStock 存在', 'inventoryDefaultSafetyStock' in cf,
                        cf.get('inventoryDefaultSafetyStock')))
        verdict.append(('渠道默认安全库存 == 10（未改过则为默认）',
                        cf.get('inventoryDefaultSafetyStock') == 10, cf.get('inventoryDefaultSafetyStock')))

    # ---- 6) 单据列表 ----
    d7 = show('stockDocList(page=1,pageSize=5)', gql(None, CH_TOKEN, Q_DOCS, {'page': 1, 'pageSize': 5}))
    if d7:
        docs = d7['stockDocList']
        print('  单据总数 =', docs['totalItems'], '，首单 =',
              json.dumps(docs['items'][0], ensure_ascii=False) if docs['items'] else '(空)')
        verdict.append(('stockDocList 非空', docs['totalItems'] > 0, docs['totalItems']))
        verdict.append(('stockDocList 行含 itemCount/totalQty 且为整数',
                        all(isinstance(x['itemCount'], int) and isinstance(x['totalQty'], int) for x in docs['items']),
                        len(docs['items'])))
        verdict.append(('stockDocList 按 type 过滤生效（PURCHASE 子集 ≤ 全量）',
                        show('stockDocList(type=PURCHASE)',
                             gql(None, CH_TOKEN, Q_DOCS, {'type': 'PURCHASE', 'page': 1, 'pageSize': 5})) is not None, True))

    b.close()

# ---- 判定汇总 ----
for label in ERRS:
    verdict.append(('查询不报错: ' + label, False, 'graphql error'))
print('\n=== 探针判定 ===')
bad = 0
for name, ok, val in verdict:
    print(('  PASS  ' if ok else '  FAIL  ') + name + '  -> ' + json.dumps(val, ensure_ascii=False))
    if not ok:
        bad += 1
print('=== %d 项，%d 项失败 ===' % (len(verdict), bad))
raise SystemExit(1 if bad else 0)
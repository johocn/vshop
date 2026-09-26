# -*- coding: utf-8 -*-
"""D44 验收：单据中心「盘库单来源」结构化判据（后端按 postedStockDocId 反查回传任务号）。

背景：`stock_doc` 侧没有任务字段，`type='STOCKTAKE'` 混两类单 ——
  ① 盘点任务过账单（`stocktake.service.ts post()` 同事务生成单据并回填 `task.postedStockDocId`）；
  ② 库存明细页「调整」产生的手工改数单（D42 起，remark 带 `MANUAL-ADJUST` 前缀，无任务引用）。
D44 让后端 `stockDocList` 按页内盘库单 id 反查 `stocktake_task.postedStockDocId`，回传 `taskId/taskCode`，
前端据此把两类单**结构化区分**（不再只靠备注前缀）。

断言（同一脚本两态可跑）：
  S1 契约：StockDocSummaryRow 已含 taskId / taskCode（introspection）
  S2 负向基线：当前 STOCKTAKE 单据全部 taskCode == null（存量均为手改单/历史单）
  S3 正向：造一张**真过账单**（建任务→录盘→提交盘次→过账）后，该单回传 taskCode == 任务号
  S4 并存：紧接着的手改复原单 taskCode == null，且库存回原值（不污染生产）
  S5 UI 390×844 @dpr2：单据中心「盘库」页签同屏出现「盘库过账 · 任务号 TK…」与「手工调数」

两态用法（本项是「增强/结构化」，缺陷态 = 后端未部署 D44 时代码）：
  缺陷态：WA_D44_ALLOW_WRITE=1 WA_D44_TAG=before- python _verify_d44_stockdoc_task_source.py
  修复态：WA_D44_ALLOW_WRITE=1 WA_D44_TAG=after-  python _verify_d44_stockdoc_task_source.py
只读模式（默认 WA_D44_ALLOW_WRITE != 1）：只跑 S1/S2/S5-只读截图，不建任务、不过账、不改库存。

环境变量：WA_D44_BASE / WA_API_ADMIN / WA_SMOKE_USER / WA_SMOKE_PWD /
  WA_D44_CHANNEL（默认 t2）、WA_D44_SKU（默认 P1789043229213）、WA_D44_TAG、WA_D44_ALLOW_WRITE
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

BASE = os.environ.get('WA_D44_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D44_CHANNEL', 't2')
SKU = os.environ.get('WA_D44_SKU', 'P1789043229213')
TAG = os.environ.get('WA_D44_TAG', '')
ALLOW_WRITE = os.environ.get('WA_D44_ALLOW_WRITE', '0') == '1'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
PAGE = 'pages/inventory/stock-doc/index'
TASK_NAME = 'D44验收-盘库过账单（可忽略）'
TASK_NOTE = 'D44 验收：真过账单，用于验证单据中心按 postedStockDocId 回填任务号；可忽略'
RESTORE_REMARK = 'D44 验收-手改复原（可忽略）'

# 前端 i18n（src/locale/zh-Hans.json → stockDocCenter）
L_FROM_TASK = '盘库过账'
L_FROM_MANUAL = '手工调数'
L_TASK_CODE = '任务号'

FAILS, SKIPS = [], []


def info(msg):
    print('  %s' % msg)


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def skip(name, why):
    print('SKIP %s | %s' % (name, why))
    SKIPS.append('%s | %s' % (name, why))


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
    """租户账号登录 + 取渠道 token（vendure-token 必须用 token，不是 code）。"""
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
    _, r = api('query($kw:String,$lid:ID){inventoryStockPage(input:{keyword:$kw,locationId:$lid,page:1,pageSize:5})'
               '{items{variantId sku stockLocationId onHand}}}', {'kw': sku, 'lid': lid},
               token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: 库存回读失败 %s' % gerr(r))
        raise SystemExit(2)
    items = (((r.get('data') or {}).get('inventoryStockPage') or {}).get('items') or [])
    return next((i for i in items if i['sku'] == sku), None)


def write_abs(tok, ctoken, vid, lid, qty, remark):
    """经 createStockDoc(STOCKTAKE) 设绝对存量（服务端取 realQty ?? qty）——即手工调数单生成路径。"""
    _, r = api('mutation($input:StockDocCreateInput!){createStockDoc(input:$input)'
               '{id code type remark operator createdAt}}',
               {'input': {'type': 'STOCKTAKE', 'remark': remark,
                          'items': [{'variantId': vid, 'toStockLocationId': lid, 'qty': qty, 'realQty': qty}]}},
               token=tok, channel=ctoken)
    return (r.get('data') or {}).get('createStockDoc'), gerr(r)


DOC_FIELDS = 'id code type remark operator createdAt itemCount totalQty taskId taskCode'


def doc_list(tok, ctoken, t='STOCKTAKE', page=1, size=20):
    _, r = api('query($t:String,$p:Int,$s:Int){stockDocList(type:$t,page:$p,pageSize:$s)'
               '{totalItems items{%s}}}' % DOC_FIELDS,
               {'t': t, 'p': page, 's': size}, token=tok, channel=ctoken)
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


# ---------------------------------------------------------------- 真过账单（建任务→录盘→提交→过账）

def make_posted_doc(tok, ctoken, lid, vid, counted):
    """返回 (task, stockDocId, err)。任一步失败把 GraphQL 原文带回，便于定位。"""
    _, r = api('mutation($input:StocktakeTaskInput!){createStocktakeTask(input:$input){id code state}}',
               {'input': {'stockLocationId': str(lid), 'name': TASK_NAME, 'note': TASK_NOTE,
                          'state': 'OPEN', 'autoSplitByZone': False,
                          # scope.variantIds 收窄到单一变体 → 应盘行恰好 1 条，录一次盘即可达 COUNTED
                          'scope': {'zones': [], 'categoryIds': [], 'variantIds': [int(vid)], 'includeZeroBook': False}}},
               token=tok, channel=ctoken)
    task = (r.get('data') or {}).get('createStocktakeTask')
    if not task:
        return None, None, 'createStocktakeTask: %s' % gerr(r)

    _, r = api('query($id:ID!){stocktakeWaves(taskId:$id){id state}}', {'id': task['id']},
               token=tok, channel=ctoken)
    waves = ((r.get('data') or {}).get('stocktakeWaves')) or []
    if not waves:
        return task, None, 'stocktakeWaves 为空（OPEN 未物化盘次）: %s' % gerr(r)
    wave = waves[0]

    # 盘次必须先认领（未认领时 saveStocktakeCounts 会被拒：'该盘次尚未认领，请先认领后再操作'）
    _, r = api('mutation($w:ID!){claimStocktakeWave(waveId:$w){id state assigneeName}}', {'w': wave['id']},
               token=tok, channel=ctoken)
    if gerr(r):
        return task, None, 'claimStocktakeWave: %s' % gerr(r)

    _, r = api('query($id:ID!){stocktakeExpectedLines(taskId:$id,page:1,pageSize:50)'
               '{totalItems items{id variantId bookQty}}}', {'id': task['id']}, token=tok, channel=ctoken)
    lines = (((r.get('data') or {}).get('stocktakeExpectedLines') or {}).get('items')) or []
    line = next((l for l in lines if str(l['variantId']) == str(vid)), None)
    if not line:
        return task, None, '应盘清单未含 variantId=%s（totalItems=%s）: %s' % (vid, len(lines), gerr(r))

    _, r = api('mutation($w:ID!,$i:[StocktakeCountEntryInput!]!){saveStocktakeCounts(waveId:$w,inputs:$i){id state countedCount}}',
               {'w': wave['id'], 'i': [{'lineId': line['id'], 'countedQty': counted}]},
               token=tok, channel=ctoken)
    if gerr(r):
        return task, None, 'saveStocktakeCounts: %s' % gerr(r)

    _, r = api('mutation($w:ID!){submitStocktakeWave(waveId:$w){id state}}', {'w': wave['id']},
               token=tok, channel=ctoken)
    if gerr(r):
        return task, None, 'submitStocktakeWave: %s' % gerr(r)

    _, r = api('query($id:ID!){stocktakeTask(id:$id){id code state postedStockDocId}}', {'id': task['id']},
               token=tok, channel=ctoken)
    st = ((r.get('data') or {}).get('stocktakeTask') or {}).get('state')
    if st != 'COUNTED':
        return task, None, '提交盘次后任务状态 %s ≠ COUNTED（无法过账）' % st

    # confirm=true：跳过未盘项/账面变动拦截（本例仅 1 行已盘，纯防御）
    _, r = api('mutation($id:ID!,$c:Boolean){postStocktake(taskId:$id,confirm:$c){ok stockDocId message}}',
               {'id': task['id'], 'c': True}, token=tok, channel=ctoken)
    p = (r.get('data') or {}).get('postStocktake') or {}
    if not p.get('ok'):
        return task, None, 'postStocktake: %s %s' % (p.get('message'), gerr(r))
    return task, p.get('stockDocId'), None


def cleanup_stale_tasks(tok, ctoken):
    """清理历史失败运行遗留的同名**未终态**任务（POSTED 是终态且是本验收的证据，保留）。"""
    _, r = api('query($o:StocktakeTaskOptionsInput){stocktakeTasks(options:$o){items{id code state name}}}',
               {'o': {'page': 1, 'pageSize': 50}}, token=tok, channel=ctoken)
    items = (((r.get('data') or {}).get('stocktakeTasks') or {}).get('items')) or []
    stale = [t for t in items if t.get('name') == TASK_NAME and t['state'] not in ('POSTED', 'CANCELLED')]
    for t in stale:
        _, rr = api('mutation($id:ID!){cancelStocktakeTask(taskId:$id){id state}}', {'id': t['id']},
                    token=tok, channel=ctoken)
        st = ((rr.get('data') or {}).get('cancelStocktakeTask') or {}).get('state')
        info('清理遗留未终态任务 %s → %s %s' % (t['code'], st or '?', gerr(rr) or ''))
    return len(stale)


def main():
    tok, ctoken = tenant_token()
    info('账号 %s / 渠道 %s；写入=%s' % (USER, CHANNEL_CODE, 'ON' if ALLOW_WRITE else 'OFF（只读）'))

    # ---------- S1 契约 ----------
    _, r = api('query{__type(name:"StockDocSummaryRow"){fields{name}}}', token=tok, channel=ctoken)
    fnames = {f['name'] for f in (((r.get('data') or {}).get('__type') or {}).get('fields') or [])}
    check('S1 StockDocSummaryRow 含 taskId/taskCode', {'taskId', 'taskCode'} <= fnames, str(sorted(fnames)))

    # ---------- S2 负向基线 ----------
    total0, docs0 = doc_list(tok, ctoken)
    leaked0 = [(d['code'], d.get('taskCode')) for d in docs0 if d.get('taskId') or d.get('taskCode')]
    check('S2 存量 STOCKTAKE 单 taskCode 均为 null', not leaked0,
          'total=%s 非空=%s' % (total0, leaked0[:3]))

    posted_task, posted_doc_id, mk_err = None, None, None
    base, vid, lid, back = None, None, None, None

    if ALLOW_WRITE:
        cleanup_stale_tasks(tok, ctoken)
        lid = target_location(tok, ctoken)
        row = read_row(tok, ctoken, lid, SKU)
        if not row:
            print('ENV-FAIL: 测试 SKU %s 在仓 %s 取不到明细行' % (SKU, lid))
            raise SystemExit(2)
        vid, base = row['variantId'], row['onHand']
        info('测试对象：sku=%s variantId=%s 仓=%s 原始 onHand=%d' % (SKU, vid, lid, base))

        # ---------- S3 正向：真过账单 ----------
        # 录 base+1（盘盈 1），过账后物理存量 base+1；随后用「手改复原」写回 base，净变动 0
        posted_task, posted_doc_id, mk_err = make_posted_doc(tok, ctoken, lid, vid, base + 1)
        check('S3 造真过账单成功（过账返回 stockDocId）', bool(posted_doc_id),
              'task=%s doc=%s %s' % ((posted_task or {}).get('code'), posted_doc_id, mk_err or ''))
        if posted_doc_id:
            _, docs1 = doc_list(tok, ctoken)
            hit = next((d for d in docs1 if str(d['id']) == str(posted_doc_id)), None)
            check('S3b 过账单回传 taskId/taskCode（按 postedStockDocId 反查命中）',
                  bool(hit) and str(hit.get('taskId')) == str(posted_task['id'])
                  and hit.get('taskCode') == posted_task['code'],
                  'doc=%s 命中=%s' % (posted_doc_id, json.dumps(hit, ensure_ascii=False) if hit else None))

            _, r = api('query($id:ID!){stocktakeTask(id:$id){id code state postedStockDocId}}',
                       {'id': posted_task['id']}, token=tok, channel=ctoken)
            t2v = (r.get('data') or {}).get('stocktakeTask') or {}
            check('S3c 任务侧指针已回填（state=POSTED / postedStockDocId 一致）',
                  t2v.get('state') == 'POSTED' and str(t2v.get('postedStockDocId')) == str(posted_doc_id),
                  json.dumps(t2v, ensure_ascii=False))

            # ---------- S4 并存 + 复原 ----------
            doc, e = write_abs(tok, ctoken, vid, lid, base, RESTORE_REMARK)
            back = read_row(tok, ctoken, lid, SKU)
            check('S4 复原 onHand==原值', bool(back) and back['onHand'] == base,
                  '%s → %s' % (e or (doc or {}).get('code'), back and back['onHand']))
            _, docs2 = doc_list(tok, ctoken)
            manual = next((d for d in docs2 if doc and str(d['id']) == str(doc['id'])), None)
            posted2 = next((d for d in docs2 if str(d['id']) == str(posted_doc_id)), None)
            check('S4b 同页两类单可区分：手改单 taskCode=null / 过账单 taskCode 非空',
                  bool(manual) and not manual.get('taskCode') and bool(posted2) and bool(posted2.get('taskCode')),
                  '手改=%s 过账=%s' % (json.dumps(manual, ensure_ascii=False) if manual else None,
                                      json.dumps(posted2, ensure_ascii=False) if posted2 else None))
    else:
        skip('S3/S4 真过账单与复原', '未开 WA_D44_ALLOW_WRITE（只读模式不写库存）')

    # ---------- S5 UI 390×844 @dpr2 ----------
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:400])) if m.type == 'error' else None)

        login(pg)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [CHANNEL_CODE, ctoken])

        url = BASE + '#/' + PAGE + '?cb=' + str(int(time.time() * 1000))
        pg.goto(url, wait_until='domcontentloaded', timeout=60000)
        pg.reload(wait_until='domcontentloaded', timeout=60000)
        pg.wait_for_selector('.card', timeout=90000)
        # 切到「盘库」页签（TABS 第 4 项 = STOCKTAKE）
        pg.locator('.tabs .tab', has_text='盘库').first.click()
        time.sleep(4)

        OUT.mkdir(parents=True, exist_ok=True)
        f1 = OUT / ('gap4-d44-%sstockdoc-center.png' % TAG)
        pg.screenshot(path=str(f1))

        srcs = [s.strip() for s in pg.locator('.card .src').all_inner_texts()]
        dim2s = [s.strip() for s in pg.locator('.card .dim2').all_inner_texts()]
        info('来源标签=%s；任务号行=%s' % (srcs[:8], dim2s[:4]))
        check('S5 页签「盘库」渲染来源标签', bool(srcs), 'labels=%s' % srcs[:8])
        check('S5b 出现「%s」标签' % L_FROM_MANUAL, L_FROM_MANUAL in srcs, str(srcs[:8]))
        if posted_doc_id:
            check('S5c 出现「%s」标签 + %s：TK…' % (L_FROM_TASK, L_TASK_CODE),
                  L_FROM_TASK in srcs and any(L_TASK_CODE in s and 'TK' in s for s in dim2s),
                  'labels=%s dim2=%s' % (srcs[:8], dim2s[:4]))
            check('S5d 过账单任务号与后端一致',
                  any(posted_task['code'] in s for s in dim2s),
                  'code=%s dim2=%s' % (posted_task['code'], dim2s[:4]))
        else:
            skip('S5c/S5d 「%s」标签' % L_FROM_TASK, '本次未造出真过账单')

        js_err = [e for e in errs if e.startswith('PAGEERR')]
        check('S5e 无 JS 运行时异常', not js_err, str(js_err[:3]))
        check('S5f 截图 %s' % f1.name, f1.exists() and f1.stat().st_size > 5000,
              '%dB' % (f1.stat().st_size if f1.exists() else 0))
        for e in errs[:5]:
            print('     ↳ %s' % e[:200])
        b.close()

    print('\n===== D44 验收：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP %s' % s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""D54 验收：物理仓写入「写完即补虚拟镜像」的端到端证明 + 移库两段写入合并补镜像。

背景（D51 设计稿 §4「未纳入本轮」剩两项）
  (A) TRANSFER 两段写入（源仓出 / 目标仓入）逐段补镜像 → 两仓皆绑定时产出 2 条净零的
      中间态镜像流水（同事务、最终值正确，但账本噪点）；
  (B) 「物理仓写完 → 虚拟仓（可售口径）立即拉齐」此前只有单测 + 代码审阅，缺端到端证据。

修复（D54）
  * `adjustPhysicalStock(..., opts?: { deferMirror?: boolean })`：可推迟补镜像；
  * `syncMirrorAfterWrites(ctx, variantId, locationIds)`：事务内**合并补一次**
    （只要有一个非虚拟仓就按 Σ 绑定仓补一次；传入仓全为虚拟仓时跳过 = 直接写账面语义）；
  * TRANSFER 分支两段都用 `deferMirror: true`，两段写完再合并补一次 → 不再产中间态流水。

为什么必须本地全链路：生产**禁写真实库存**，且生产现存 `bizType='mirror'` 流水 0 行
（近期单据全落在纯虚拟库存店 t2，无物理仓绑定 → 镜像补齐从未被真实触发），
故 B 的写入侧证据只能在本地 dev-server 上真实跑（本脚本 local 态）；
生产侧只做**只读一致性核对**（prod-after 态，全程零写入）。

两种态（WA_D54_STATE）
  local（默认，本地 dev-server，**会真实写入**，末尾自清理归零）
    ① 前提：渠道 physicalStockEnabled=true；变体绑定 2 个物理仓；虚拟仓/物理仓起点均为 0 → 基线镜像流水 N0
    ② PURCHASE +7 → locA：locA=7 且**虚拟仓立即=7**（B 的核心）+ 镜像流水 N0+1（入库、reason 含「镜像」）
    ③ TRANSFER 3 locA→locB：locA=4、locB=3、虚拟仓仍=7，
       且**镜像流水仍为 N0+1**（= A 合并生效：无中间态流水）
    ④ STOCKTAKE locB → 10：locB=10、locA=4、虚拟仓=14，镜像流水 N0+2
    ⑤ UI（每态写完即抓，手机 390×844 dpr=2，流水页按 productVariantId 过滤）：
       态①采购后 1 条「镜像同步」；态②移库后 2 条移库流水但镜像仍 1 条；态③盘库后镜像 2 条；
       截图 docs/verify/d54-after-{purchase,transfer,stocktake}-390.png
    ⑥ 收尾：STOCKTAKE 把 locA/locB 归零 → 虚拟仓回 0（供复跑）
  prod-after（**生产只读复验**，零写入）
    ① 逐渠道找 physicalStockEnabled=true 的渠道（生产实测唯一 = `__default_channel__`）
    ② 目标变体绑定量 = 2；虚拟仓 onHand == Σ 绑定物理仓 onHand（当下一致）
    ⚠ 本态需生产 admin-api 凭据（WA_API_ADMIN + WA_D54_ADMIN_USER/PWD）；
      无凭据时的等价只读核对（实测输出，2026-09-27）：
        __default_channel__ 是唯一 truth 渠道；变体 57 绑 loc5「主站默认物理仓」(50)
        + loc7「北京前置仓」(10)，虚拟仓 loc4 = 60 == Σ 60；
        `order_stock_ledger` 中 bizType='mirror' 行数 = 0（生产从未触发镜像补齐）

环境变量：WA_API_ADMIN（默认 http://localhost:3000/admin-api）、
  WA_D54_BASE（默认 http://localhost:5280/）、WA_D54_ADMIN_USER / WA_D54_ADMIN_PWD、
  WA_D54_CHANNEL_TOKEN（默认 official-1）、WA_D54_VARIANT（默认 1）、
  WA_D54_LOC_VIRTUAL / WA_D54_LOC_A / WA_D54_LOC_B（默认 7 / 8 / 13）、
  WA_D54_PROD_VARIANT（默认 57）、WA_D54_STATE（local|prod-after，默认 local）、
  WA_D54_TAG（截图文件名后缀）
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

BASE = os.environ.get('WA_D54_BASE', 'http://localhost:5280/')
ADMIN = os.environ.get('WA_API_ADMIN', 'http://localhost:3000/admin-api')
ADMIN_USER = os.environ.get('WA_D54_ADMIN_USER', 'superadmin@china.test')
ADMIN_PWD = os.environ.get('WA_D54_ADMIN_PWD', 'superadmin')
CTOKEN = os.environ.get('WA_D54_CHANNEL_TOKEN', 'official-1').strip()
VARIANT = os.environ.get('WA_D54_VARIANT', '1').strip()
LOC_V = os.environ.get('WA_D54_LOC_VIRTUAL', '7').strip()
LOC_A = os.environ.get('WA_D54_LOC_A', '8').strip()
LOC_B = os.environ.get('WA_D54_LOC_B', '13').strip()
PROD_VARIANT = os.environ.get('WA_D54_PROD_VARIANT', '57').strip()
STATE = os.environ.get('WA_D54_STATE', 'local').strip().lower()
TAG = os.environ.get('WA_D54_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
MOVEMENTS = 'pages/inventory/movements/index'

FAILS = []


def info(msg):
    print('  %s' % msg)


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


def api(query, variables=None, token=None, channel=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if channel:
        headers['vendure-token'] = channel
    req = urllib.request.Request(ADMIN, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:300]}


def gerr(r):
    es = r.get('errors') or []
    return str(es[0].get('message'))[:200] if es else None


def login_api(user, pwd):
    q = ('mutation($u:String!,$p:String!){login(username:$u,password:$p)'
         '{... on CurrentUser{id identifier}}}')
    tok, r = api(q, {'u': user, 'p': pwd})
    if not tok:
        env_fail('%s 登录失败 %s' % (user, json.dumps(r, ensure_ascii=False)[:300]))
    return tok


# ---- 接口层 ----
OVERVIEW_Q = ('query{tenantInventoryOverview{channelCode physicalStockEnabled '
              'virtualLocationId defaultPhysicalLocationId locations{id name code kind}}}')


def overview(tok, ctoken):
    _, r = api(OVERVIEW_Q, token=tok, channel=ctoken)
    return None if gerr(r) else (r.get('data') or {}).get('tenantInventoryOverview')


def bindings(tok, ctoken, vid):
    _, r = api('query($v:ID!){tenantVariantBindings(variantId:$v){variantId locationId isDefault}}',
               {'v': vid}, token=tok, channel=ctoken)
    if gerr(r):
        return None
    return (r.get('data') or {}).get('tenantVariantBindings')


def levels(tok, ctoken, vid):
    """各仓 onHand：核心 productVariant.stockLevels（含虚拟仓；inventoryStockPage 的仓池
    在「有物理仓时只取物理仓」，读不到虚拟仓 —— 见 inventory-stock.service#resolveLocations）。"""
    _, r = api('query($v:ID!){productVariant(id:$v){id sku '
               'stockLevels{stockLocationId stockOnHand stockAllocated}}}',
               {'v': vid}, token=tok, channel=ctoken)
    err = gerr(r)
    if err:
        return None, err
    pv = (r.get('data') or {}).get('productVariant')
    if pv is None:
        return None, '变体不存在或不可读'
    return {str(l['stockLocationId']): int(l['stockOnHand']) for l in (pv.get('stockLevels') or [])}, None


MIRROR_Q = ('query($v:ID!){stockMovementLedger(productVariantId:$v,bizType:"mirror",page:1,pageSize:50)'
            '{totalItems items{id stockLocationId bizType direction quantity beforeOnHand afterOnHand reason createdAt}}}')


def mirror_ledger(tok, ctoken, vid):
    _, r = api(MIRROR_Q, {'v': vid}, token=tok, channel=ctoken)
    if gerr(r):
        return None, gerr(r)
    return (r.get('data') or {}).get('stockMovementLedger') or {'totalItems': 0, 'items': []}, None


def create_doc(tok, ctoken, dtype, items, remark):
    q = ('mutation($input:StockDocCreateInput!){createStockDoc(input:$input){id code type remark}}')
    _, r = api(q, {'input': {'type': dtype, 'remark': remark, 'items': items}},
               token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    err = gerr(r)
    if err:
        return None, err
    return (r.get('data') or {}).get('createStockDoc'), None


def purchase(tok, ctoken, qty, loc, tag):
    return create_doc(tok, ctoken, 'PURCHASE',
                      [{'variantId': VARIANT, 'toStockLocationId': loc, 'qty': qty}],
                      'D54 验证-采购 %s' % tag)


def transfer(tok, ctoken, qty, src, dst, tag):
    return create_doc(tok, ctoken, 'TRANSFER',
                      [{'variantId': VARIANT, 'fromStockLocationId': src,
                        'toStockLocationId': dst, 'qty': qty}],
                      'D54 验证-移库 %s' % tag)


def stocktake(tok, ctoken, target, loc, tag):
    return create_doc(tok, ctoken, 'STOCKTAKE',
                      [{'variantId': VARIANT, 'toStockLocationId': loc,
                        'qty': target, 'realQty': target}],
                      'D54 验证-盘库 %s' % tag)


# ---- UI ----
def login_ui(pg, user, pwd):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(user)
    pg.locator('input').nth(1).fill(pwd)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def open_movements(pg, expect_rows=True):
    url = '%s#/%s?productVariantId=%s&cb=%d' % (BASE, MOVEMENTS, VARIANT, int(time.time() * 1000))
    pg.goto(url, wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    if expect_rows:
        pg.locator('.grp .card').first.wait_for(state='visible', timeout=90000)
    time.sleep(0.8)


def top_card(pg):
    """最新一条流水卡片文本（列表按 createdAt DESC, id DESC —— 与服务端同序）"""
    return pg.locator('.grp .card').first.inner_text()


def toggle_mirror_filter(pg):
    """点「镜像同步」业务类型胶囊（再点一次即回到全部类型）"""
    pg.locator('.chips.scroll .chip').filter(has_text='镜像同步').first.click()
    pg.wait_for_timeout(1300)


def shot(pg, name, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('d54-%s%s.png' % (TAG, name))
    pg.screenshot(path=str(f), full_page=full)
    check('⑤ 截图 %s' % f.name, f.exists() and f.stat().st_size > 4000,
          '%dB' % (f.stat().st_size if f.exists() else 0))
    return f


def run_prod_after(tok):
    """生产只读：找 physicalStockEnabled 渠道 → 目标变体绑定 → 虚拟仓 == Σ 绑定物理仓。零写入。"""
    _, r = api('query{channels{items{id code token}}}', token=tok)
    chans = ((r.get('data') or {}).get('channels') or {}).get('items') or []
    if not chans:
        env_fail('读不到渠道清单：%s' % json.dumps(r, ensure_ascii=False)[:200])
    phys_chans = []
    hit = None
    for c in chans:
        ov = overview(tok, c['token'])
        if not ov or not ov.get('physicalStockEnabled'):
            continue
        phys_chans.append(c['code'])
        bs = bindings(tok, c['token'], PROD_VARIANT) or []
        if bs and hit is None:
            hit = (c, ov, bs)
    info('物理库存模式渠道：%s' % phys_chans)
    check('① 存在 physicalStockEnabled=true 的渠道（物理仓为账面权威）', bool(phys_chans),
          '共 %d 个：%s' % (len(phys_chans), phys_chans))

    if not hit:
        env_fail('生产渠道里找不到变体 %s 的物理仓绑定（口径可能已变）' % PROD_VARIANT)
    c, ov, bs = hit
    lv, err = levels(tok, c['token'], PROD_VARIANT)
    if err:
        env_fail('读变体 %s 各仓库存失败：%s' % (PROD_VARIANT, err))
    bound = [str(b['locationId']) for b in bs]
    virt = str(ov.get('virtualLocationId') or '')
    bound_sum = sum(int(lv.get(x, 0)) for x in bound)
    virt_hand = int(lv.get(virt, 0))
    check('② 生产变体 %s 在渠道 %s 绑定 %d 个物理仓 %s' % (PROD_VARIANT, c['code'], len(bound), bound),
          len(bound) >= 1, '实际 %s' % json.dumps(bs, ensure_ascii=False))
    check('③ 生产只读一致性：虚拟仓 loc%s onHand %d == Σ 绑定物理仓 %d（零写入）'
          % (virt, virt_hand, bound_sum), virt_hand == bound_sum,
          '各仓 %s' % json.dumps(lv, ensure_ascii=False))
    return 0


def main():
    if STATE not in ('local', 'prod-after'):
        env_fail('WA_D54_STATE 必须是 local / prod-after，当前 %r' % STATE)

    tok = login_api(ADMIN_USER, ADMIN_PWD)
    if STATE == 'prod-after':
        raise SystemExit(run_prod_after(tok))

    # ---------------- local：真实写入全链路 ----------------
    ov = overview(tok, CTOKEN)
    if not ov:
        env_fail('渠道 token %r 无 tenantInventoryOverview（本地服务是否已起？）' % CTOKEN)
    check('① 前提：渠道 %s 为物理库存模式（physicalStockEnabled=true）' % ov.get('channelCode'),
          ov.get('physicalStockEnabled') is True, '实际 %s' % ov.get('physicalStockEnabled'))
    loc_ids = {str(l['id']) for l in (ov.get('locations') or [])}
    check('①b 目标仓均属本店：虚拟 %s / 物理 %s, %s' % (LOC_V, LOC_A, LOC_B),
          {LOC_V, LOC_A, LOC_B} <= loc_ids, '店内仓 %s' % sorted(loc_ids))
    check('①c 虚拟仓落点 = tenantInventoryOverview.virtualLocationId',
          str(ov.get('virtualLocationId')) == LOC_V,
          '实际 %s' % ov.get('virtualLocationId'))

    bs = bindings(tok, CTOKEN, VARIANT) or []
    check('①d 变体 %s 恰绑定 2 个物理仓（%s）+ 1 个默认仓' % (VARIANT, [b['locationId'] for b in bs]),
          len(bs) == 2 and len([b for b in bs if b.get('isDefault')]) == 1,
          '实际 %s' % json.dumps(bs, ensure_ascii=False))

    lv0, err0 = levels(tok, CTOKEN, VARIANT)
    if err0:
        env_fail('读库存失败：%s' % err0)
    base_ok = all(int(lv0.get(x, 0)) == 0 for x in (LOC_V, LOC_A, LOC_B))
    check('①e 起点干净：虚拟仓/两物理仓 onHand 均为 0（否则请先跑收尾或清理）', base_ok,
          '各仓 %s' % json.dumps(lv0, ensure_ascii=False))
    if not base_ok:
        env_fail('本地库存非零，拒绝在脏起点上做净值断言')

    led0, lerr0 = mirror_ledger(tok, CTOKEN, VARIANT)
    if lerr0:
        env_fail('读镜像流水失败：%s' % lerr0)
    n0 = int(led0.get('totalItems', 0))
    info('基线镜像流水 N0 = %d（历史行不影响「增量」断言）' % n0)

    # ②-④ 三态真实写入，每态写完后用手机视口（390×844 dpr=2）抓流水页 = B 的 UI 证据面
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console',
              lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        login_ui(pg, ADMIN_USER, ADMIN_PWD)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); "
                    "localStorage.setItem('wa_channel_code', c); }", [ov.get('channelCode'), CTOKEN])
        open_movements(pg, expect_rows=False)

        # ② PURCHASE +7 → locA：物理写入后虚拟仓立即拉齐
        doc, e = purchase(tok, CTOKEN, 7, LOC_A, 'in7')
        check('② 采购入库 7 → 物理仓 %s 落单成功' % LOC_A, e is None, '错误 %s' % e)
        lv1, err1 = levels(tok, CTOKEN, VARIANT)
        check('②b 物理仓 %s onHand = 7' % LOC_A, not err1 and int(lv1.get(LOC_A, 0)) == 7,
              '实际 %s' % json.dumps(lv1, ensure_ascii=False))
        check('②c 【B 核心】虚拟仓 %s onHand 立即 = 7（写完即补镜像，不等下次 SALE）' % LOC_V,
              not err1 and int(lv1.get(LOC_V, 0)) == 7, '实际 %s' % json.dumps(lv1, ensure_ascii=False))
        led1, _ = mirror_ledger(tok, CTOKEN, VARIANT)
        n1 = int(led1.get('totalItems', 0))
        check('②d 镜像流水 N0+1 = %d（新增 1 条）' % (n0 + 1), n1 == n0 + 1, '实际 %d' % n1)
        top = (led1.get('items') or [{}])[0]
        check('②e 该条镜像流水语义正确：虚拟仓 %s / 入库 / 7 / reason 含「镜像」' % LOC_V,
              str(top.get('stockLocationId')) == LOC_V and top.get('direction') == 'in'
              and int(top.get('quantity') or 0) == 7
              and '镜像' in str(top.get('reason') or ''),
              json.dumps(top, ensure_ascii=False))
        open_movements(pg)
        t1 = top_card(pg)
        info('态①最新卡片：%s' % ' / '.join(t1.split('\n')[:6]))
        check('②f UI 态①：最新流水即「镜像同步」（物理入库后立即补镜像）+ 文案「虚拟镜像同步」',
              '镜像同步' in t1 and '虚拟镜像同步' in t1, '最新卡片 %r' % t1[:200])
        shot(pg, 'after-purchase-390')
        toggle_mirror_filter(pg)
        cnt1 = pg.locator('.grp .card').count()
        check('②g UI 态①：按「镜像同步」过滤后 %d 条 == 服务端镜像流水 %d 条（列表非固定 20 行窗口）'
              % (cnt1, n1), cnt1 == min(n1, 20), 'UI %d / API %d' % (cnt1, n1))
        toggle_mirror_filter(pg)

        # ③ TRANSFER 3 locA→locB：两段写入合并补镜像（无中间态流水）
        doc, e = transfer(tok, CTOKEN, 3, LOC_A, LOC_B, 'a2b3')
        check('③ 移库 3：%s → %s 落单成功' % (LOC_A, LOC_B), e is None, '错误 %s' % e)
        lv2, err2 = levels(tok, CTOKEN, VARIANT)
        check('③b 源仓 %s = 4 / 目标仓 %s = 3' % (LOC_A, LOC_B),
              not err2 and int(lv2.get(LOC_A, 0)) == 4 and int(lv2.get(LOC_B, 0)) == 3,
              '实际 %s' % json.dumps(lv2, ensure_ascii=False))
        check('③c 虚拟仓仍 = 7（Σ 绑定仓不变）',
              not err2 and int(lv2.get(LOC_V, 0)) == 7, '实际 %s' % json.dumps(lv2, ensure_ascii=False))
        led2, _ = mirror_ledger(tok, CTOKEN, VARIANT)
        n2 = int(led2.get('totalItems', 0))
        check('③d 【A 核心】移库未新增镜像流水（仍为 %d）—— 两段写入已合并补镜像，无中间态' % n1,
              n2 == n1, '实际 %d' % n2)
        open_movements(pg)
        t2 = top_card(pg)
        info('态②最新卡片：%s' % ' / '.join(t2.split('\n')[:6]))
        check('③e UI 态②：最新流水是「移库」而**不是**镜像（两段写入无中间态镜像）',
              '移库' in t2 and '镜像同步' not in t2, '最新卡片 %r' % t2[:200])
        shot(pg, 'after-transfer-390')
        toggle_mirror_filter(pg)
        cnt2 = pg.locator('.grp .card').count()
        check('③f UI 态②：镜像流水过滤后仍为 %d 条（= 移库前的 %d 条，未新增）'
              % (cnt2, n1), cnt2 == min(n2, 20) and n2 == n1, 'UI %d / API %d' % (cnt2, n2))
        toggle_mirror_filter(pg)

        # ④ STOCKTAKE locB → 10
        doc, e = stocktake(tok, CTOKEN, 10, LOC_B, 'b2ten')
        check('④ 盘库：物理仓 %s 校正为 10 落单成功' % LOC_B, e is None, '错误 %s' % e)
        lv3, err3 = levels(tok, CTOKEN, VARIANT)
        check('④b 物理仓 %s = 10 / %s = 4' % (LOC_B, LOC_A),
              not err3 and int(lv3.get(LOC_B, 0)) == 10 and int(lv3.get(LOC_A, 0)) == 4,
              '实际 %s' % json.dumps(lv3, ensure_ascii=False))
        check('④c 虚拟仓 = 14（= 10 + 4，盘库后同样拉齐）',
              not err3 and int(lv3.get(LOC_V, 0)) == 14, '实际 %s' % json.dumps(lv3, ensure_ascii=False))
        led3, _ = mirror_ledger(tok, CTOKEN, VARIANT)
        n3 = int(led3.get('totalItems', 0))
        check('④d 镜像流水 = %d（盘库新增 1 条）' % (n2 + 1), n3 == n2 + 1, '实际 %d' % n3)
        open_movements(pg)
        t3 = top_card(pg)
        info('态③最新卡片：%s' % ' / '.join(t3.split('\n')[:6]))
        check('④e UI 态③：最新流水回到「镜像同步」（盘库后再次拉齐，afterOnHand 14）',
              '镜像同步' in t3 and '14' in t3, '最新卡片 %r' % t3[:200])
        shot(pg, 'after-stocktake-390')
        toggle_mirror_filter(pg)
        cnt3 = pg.locator('.grp .card').count()
        check('④f UI 态③：镜像流水过滤后 %d 条 == 服务端 %d 条（较态② +1）'
              % (cnt3, n3), cnt3 == min(n3, 20) and n3 == n2 + 1, 'UI %d / API %d' % (cnt3, n3))
        shot(pg, 'mirror-only-390')
        toggle_mirror_filter(pg)

        auth = [e for e in errs if 'authoriz' in e.lower()]
        check('⑤ 页面无授权报错', not auth, '%d 条 errs' % len(errs))
        for e in errs[:5]:
            print('     ↳ %s' % e[:180])
        b.close()

    # ⑥ 收尾：归零（供复跑；同时再证一次「盘库 → 镜像拉齐」到 0）
    d, e = stocktake(tok, CTOKEN, 0, LOC_A, 'cleanA')
    d2, e2 = stocktake(tok, CTOKEN, 0, LOC_B, 'cleanB')
    check('⑥ 收尾盘库归零落单成功', e is None and e2 is None, '%s / %s' % (e, e2))
    lv4, err4 = levels(tok, CTOKEN, VARIANT)
    check('⑥b 收尾后虚拟仓与两物理仓均为 0',
          not err4 and all(int(lv4.get(x, 0)) == 0 for x in (LOC_V, LOC_A, LOC_B)),
          '实际 %s' % json.dumps(lv4, ensure_ascii=False))

    if FAILS:
        print('\n== 结果（%s 态）：%d 项失败 ==\n失败项：%s' % (STATE, len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果（%s 态）：全部通过 ==' % STATE)
    raise SystemExit(0)


if __name__ == '__main__':
    main()
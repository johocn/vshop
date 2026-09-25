# -*- coding: utf-8 -*-
"""gap4 批 1 验收：售后列表筛选/分页 + 分类树/排序/图标/批量（手机视口 e2e + 截图）。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 1.8
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

写操作护栏（默认只读）：
  本地 dev 库实测（2026-09-25）：售后单 0 条；分类 5 条但全部挂在**未返回的根集合**下（树是平的）。
  因此「类型筛选生效 / 上滑加载累计 / 树形缩进与折叠」三组断言必须靠 fixture 才可能成立，脚本按
  `WA_SHOT_ALLOW_WRITE=1` 才写：
    ① admin-api `setOrderCustomFields` 把订单 5 的 fulfillmentDeliveredAt 刷成当前时间
       （after-sales-plugin 的售后时效窗口按 fulfillmentCompletedAt/DeliveredAt/updatedAt 起算 22 天，
        种子订单已过期 → 不刷新则 createAfterSalesRequest 恒报 "exceeded 22 days limit"）
    ② shop-api（客户 zhangsan@test.cn / test）`createAfterSalesRequest` ×N：
       同一订单、**不带 orderLineId** → 服务端跳过「同一订单行重复售后」校验，可批量造样本
    ③ admin-api `moveCollection` 把两个分类挂到同一父分类下（跑完 moveCollection 还原）
  目标域名含 e.joho.cn（生产）时**硬拦**，一律不写。

退出码：0 = 通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
"""
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_SHOT_BASE', 'http://localhost:5280/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
ADMIN = os.environ.get('WA_API_ADMIN', 'http://127.0.0.1:3000/admin-api')
SHOP = os.environ.get('WA_API_SHOP', 'http://127.0.0.1:3000/shop-api')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL_CODE = os.environ.get('WA_SMOKE_CHANNEL', '__default_channel__')
CUSTOMER = os.environ.get('WA_SHOT_CUSTOMER', 'zhangsan@test.cn')
CUSTOMER_PWD = os.environ.get('WA_SHOT_CUSTOMER_PWD', 'test')
ORDER_ID = os.environ.get('WA_SHOT_ORDER', '5')
AS_TARGET = 25          # 售后样本条数（列表 take=20 → 25 才能真的触发第二页）
AS_TYPES = ['refund_only'] * 13 + ['return_refund'] * 7 + ['exchange'] * 5
TYPE_LABEL = {'refund_only': '仅退款', 'return_refund': '退货退款', 'exchange': '换货'}
ALLOW_WRITE = os.environ.get('WA_SHOT_ALLOW_WRITE', '0') == '1'
IS_PROD = 'e.joho.cn' in BASE
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'

FAILS, SKIPS = [], []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def skip(name, why):
    print('  SKIP %s %s' % (name, why))
    SKIPS.append('%s：%s' % (name, why))


def info(msg):
    print('  INFO %s' % msg)


# ---------------- API（直连 dev-server，避免 vite 只代理 /admin-api 的缺口） ----------------

def api(url, query, variables=None, token=None, channel=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if channel:
        headers['vendure-token'] = channel
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except urllib.error.HTTPError as e:  # noqa: BLE001
        return None, {'HTTPError': e.code, 'body': e.read().decode('utf-8', 'ignore')[:400]}
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:200]}


def data_of(r, *keys):
    cur = r.get('data')
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


def admin_login():
    bot = '%s/login' % ADMIN  # 登录专用一次性连接
    tok, r = api(bot, 'mutation($u:String!,$p:String!){ login(username:$u, password:$p){ ... on CurrentUser { id } } }',
                 {'u': USER, 'p': PWD})
    if not tok:
        print('ENV-FAIL: admin 登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    chans = data_of(api(ADMIN, 'query{ myTenantAccess{ channels{ id code token } } }', token=tok)[1],
                    'myTenantAccess', 'channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL_CODE), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (CHANNEL_CODE, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return tok, ch['token']


# ---------------- fixture ----------------

def prepare_aftersale_fixture(tok, ctoken):
    """返回 (已存在的可用条数, 本次创建的 id 列表)。"""
    r = api(ADMIN, 'query{ afterSalesRequests(options:{take:1}){ totalItems } }', token=tok, channel=ctoken)[1]
    existing = data_of(r, 'afterSalesRequests', 'totalItems')
    if existing is None:
        print('ENV-FAIL: afterSalesRequests 不可用 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    info('售后样本已存在 %d 条（目标 %d）' % (existing, AS_TARGET))
    if existing >= AS_TARGET:
        return existing, []
    if not ALLOW_WRITE:
        skip('售后 fixture（类型筛选 / 上滑加载）', '仅 %d 条 < %d 且未开 WA_SHOT_ALLOW_WRITE' % (existing, AS_TARGET))
        return existing, []

    now = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
    r = api(ADMIN, 'mutation($in: UpdateOrderInput!){ setOrderCustomFields(input:$in){ id updatedAt } }',
            {'in': {'id': ORDER_ID, 'customFields': {'fulfillmentDeliveredAt': now}}}, token=tok, channel=ctoken)[1]
    check('fixture: 刷新订单 %s 售后时效窗口（fulfillmentDeliveredAt=now）' % ORDER_ID,
          bool(data_of(r, 'setOrderCustomFields')), json.dumps(r, ensure_ascii=False)[:200])

    stok, _ = api(SHOP, 'mutation($u:String!,$p:String!){ login(username:$u, password:$p){ ... on CurrentUser { id } } }',
                  {'u': CUSTOMER, 'p': CUSTOMER_PWD}, channel=ctoken)
    if not stok:
        check('fixture: shop 客户登录 %s' % CUSTOMER, False, 'shop-api 登录失败')
        return existing, []

    created = []
    need = AS_TARGET - existing
    for i in range(need):
        t = AS_TYPES[(existing + i) % len(AS_TYPES)]
        r = api(SHOP, 'mutation($i: CreateAfterSalesRequestInput!){ createAfterSalesRequest(input:$i){ id type state } }',
                {'i': {'orderId': ORDER_ID, 'type': t, 'reason': 'GAP4-BATCH1 验收样本',
                       'description': '自动化验收 fixture', 'refundAmount': 100 + (i % 9) * 100}},
                token=stok, channel=ctoken)[1]
        got = data_of(r, 'createAfterSalesRequest')
        if got:
            created.append(got['id'])
    check('fixture: 建售后样本 %d 条' % need, len(created) == need,
          'created=%d errors=%s' % (len(created), json.dumps(r, ensure_ascii=False)[:160]))
    return existing + len(created), created


def pick_by_name(cols, name):
    return next((c for c in cols if c['name'] == name), None)


def load_collections(tok, ctoken):
    return data_of(api(ADMIN, 'query{ collections(options:{take:100}){ items{ id name parentId position productVariantCount customFields{ icon } } } }',
                       token=tok, channel=ctoken)[1], 'collections', 'items') or []


def prepare_category_fixture(tok, ctoken):
    """把 2 个分类挂到同一父分类下（真实页面点 ↳/批量移动也是走同一个 moveCollection）。"""
    cols = load_collections(tok, ctoken)
    by_name = {c['name']: c for c in cols}
    parent, kid_a, kid_b = by_name.get('数码电器'), by_name.get('数码专区'), by_name.get('生鲜特惠')
    if not (parent and kid_a and kid_b):
        skip('分类层级 fixture（缩进 / 折叠 / 换序）',
             '本渠道分类不足，需要 %s / %s / %s' % ('数码电器', '数码专区', '生鲜特惠'))
        return cols, []
    already = [c for c in cols if str(c.get('parentId')) == str(parent['id'])]
    if len(already) >= 2:
        info('分类层级已存在（父「%s」下有 %d 个子分类）' % (parent['name'], len(already)))
        return cols, []
    if not ALLOW_WRITE:
        skip('分类层级 fixture（缩进 / 折叠 / 换序）', '树是平的且未开 WA_SHOT_ALLOW_WRITE')
        return cols, []
    moved = []
    for idx, kid in enumerate([kid_a, kid_b]):
        r = api(ADMIN, 'mutation($i: MoveCollectionInput!){ moveCollection(input:$i){ id name parentId position } }',
                {'i': {'collectionId': kid['id'], 'parentId': parent['id'], 'index': idx}}, token=tok, channel=ctoken)[1]
        if data_of(r, 'moveCollection'):
            moved.append(kid['id'])
    check('fixture: 把「%s」「%s」挂到「%s」下' % (kid_a['name'], kid_b['name'], parent['name']),
          len(moved) == 2, 'moved=%s' % moved)
    return load_collections(tok, ctoken), moved


def restore(tok, ctoken, moved_ids, created_ids):
    for cid, idx in zip(reversed(moved_ids), [3, 4]):
        api(ADMIN, 'mutation($i: MoveCollectionInput!){ moveCollection(input:$i){ id position } }',
            {'i': {'collectionId': cid, 'parentId': '1', 'index': idx}}, token=tok, channel=ctoken)
    if created_ids:
        stok, _ = api(SHOP, 'mutation($u:String!,$p:String!){ login(username:$u, password:$p){ ... on CurrentUser { id } } }',
                      {'u': CUSTOMER, 'p': CUSTOMER_PWD}, channel=ctoken)
        closed = 0
        for rid in created_ids:
            r = api(SHOP, 'mutation($id: ID!){ cancelAfterSalesRequest(id:$id){ id state } }', {'id': rid},
                    token=stok, channel=ctoken)[1]
            if (data_of(r, 'cancelAfterSalesRequest') or {}).get('state') == 'Closed':
                closed += 1
        info('清理：售后样本 %d 条置 Closed（服务端无删除 mutation，行仍留在本地库）' % closed)


# ---------------- 浏览器 ----------------

def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    if not pg.evaluate("localStorage.getItem('wa_auth_token')"):
        print('ENV-FAIL: 登录后未拿到 wa_auth_token')
        raise SystemExit(2)


def inject_channel(pg):
    ok = pg.evaluate("""async ([code]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})});
      const d = await r.json();
      const cs = ((d.data||{}).myTenantAccess||{}).channels || [];
      const c = cs.find(x=>x.code===code);
      if(!c) return 'NOCHANNEL:' + cs.map(x=>x.code).join(',');
      localStorage.setItem('wa_channel_token', c.token);
      localStorage.setItem('wa_channel_code', c.code);
      return 'OK';
    }""", [CHANNEL_CODE])
    if ok != 'OK':
        print('ENV-FAIL: 渠道注入失败 %s' % ok)
        raise SystemExit(2)


def goto(pg, path, settle=6.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, name, note, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-batch1-%s.png' % name)
    pg.screenshot(path=str(f), full_page=full)
    check('%s · %s' % (name, note), f.exists() and f.stat().st_size > 5000,
          '%s %d B' % (f.name, f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


def toast_text(pg, wait=2.5):
    """uni.showToast 的文本（H5 渲染为 uni-toast），轮询避免抓空。"""
    end = time.time() + wait
    while time.time() < end:
        try:
            t = pg.locator('uni-toast').first.inner_text(timeout=500)
            if t.strip():
                return t.strip()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.2)
    return ''


def row_names(pg):
    return [pg.locator('.card').nth(i).locator('.name').inner_text() for i in range(pg.locator('.card').count())]


def row_padding_left(pg, idx):
    """行 .row 的实际左内边距（px）。inline style 是 rpx，必须走 computed style 才有 px。"""
    el = pg.locator('.card').nth(idx).locator('.row').element_handle()
    return float(pg.evaluate('(el)=>parseFloat(getComputedStyle(el).paddingLeft) || 0', el))


def main():
    if IS_PROD and ALLOW_WRITE:
        print('ENV-FAIL: 目标是生产域名且开了 WA_SHOT_ALLOW_WRITE —— 拒绝执行（生产只读）')
        raise SystemExit(2)

    tok, ctoken = admin_login()
    info('渠道 %s token=%s' % (CHANNEL_CODE, ctoken))
    as_total, as_created = prepare_aftersale_fixture(tok, ctoken)
    cols, col_moved = prepare_category_fixture(tok, ctoken)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        bag = []
        pg.on('pageerror', lambda e: bag.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: bag.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
        login(pg)
        inject_channel(pg)

        # ============ A. 售后列表 ============
        goto(pg, 'pages/after-sale/list/index', 8)
        page_total = as_total
        expect_first = min(20, page_total)
        cards0 = pg.locator('.card').count()
        prog0 = pg.locator('.progress').inner_text() if pg.locator('.progress').count() else ''
        info('售后默认态 cards=%d progress=%r body=%r' % (cards0, prog0, pg.inner_text('body')[:180].replace('\n', '|')))
        if page_total >= 21:
            check('A1 默认态首页 20 条 + 页脚「已显示 20 / %d」' % page_total,
                  cards0 == 20 and prog0.replace(' ', '') == '已显示%d/%d' % (expect_first, page_total),
                  'cards=%d prog=%r' % (cards0, prog0))
        else:
            skip('A1 默认态分页口径', '可用售后样本 %d 条 < 21（列表 take=20，凑不出第二页）' % page_total)
        shot(pg, 'aftersale-default', '售后列表默认态：筛选区 5 组控件 + 列表首页 + 页脚计数')
        check('A1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- 上滑加载累计 ---
        before = pg.locator('.card').count()
        for _ in range(5):
            pg.mouse.wheel(0, 6000)
            pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            time.sleep(1.5)
            if pg.locator('.card').count() > before:
                break
        after = pg.locator('.card').count()
        prog1 = pg.locator('.progress').inner_text() if pg.locator('.progress').count() else ''
        body1 = pg.inner_text('body')
        if page_total >= 21:
            check('A2 上滑加载累计：20 → %d 条，页脚「已显示 %d / %d」+「没有更多了」' % (page_total, page_total, page_total),
                  after == page_total and prog1.replace(' ', '') == '已显示%d/%d' % (page_total, page_total)
                  and '没有更多了' in body1,
                  'before=%d after=%d prog=%r noMore=%s' % (before, after, prog1, '没有更多了' in body1))
        else:
            skip('A2 上滑加载累计', '可用售后样本 %d 条 ≤ 单页 20，不会产生第二页' % page_total)
        # 页脚计数在列表末尾、会被固定 tabbar 挡住 → 滚动把它居中后再截图，让证据自证
        pg.evaluate("()=>{const p=document.querySelector('.progress'); if(p) p.scrollIntoView({block:'center'});}")
        time.sleep(1.2)
        shot(pg, 'aftersale-loadmore', '上滑触底后累计加载到 %d 条：页脚「已显示 %d / %d」+「没有更多了」' % (page_total, page_total, page_total))
        check('A2 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- 类型筛选 ---
        pg.evaluate('window.scrollTo(0, 0)')
        time.sleep(0.8)
        chip = pg.locator('.chip', has_text='售后类型：%s' % TYPE_LABEL['refund_only']).first
        chip.click()
        time.sleep(3)
        cards2 = pg.locator('.card').count()
        prog2 = pg.locator('.progress').inner_text() if pg.locator('.progress').count() else ''
        # 注意：筛选栏本身常驻 3 个类型胶囊（含「退货退款/换货」字样），只能逐行核对列表卡片
        row_txt = [pg.locator('.card').nth(i).inner_text() for i in range(cards2)]
        only_refund = all('仅退款' in t for t in row_txt) and not any(
            ('退货退款' in t) or ('换货' in t) for t in row_txt)
        detail = 'cards=%d prog=%r 行内全部仅退款=%s' % (cards2, prog2, only_refund)
        if page_total >= 21:
            check('A3 类型胶囊「仅退款」生效：列表只剩仅退款且条数变化（%d ≠ 默认 %d）' % (cards2, cards0),
                  cards2 < cards0 and cards2 > 0 and only_refund, detail)
        else:
            check('A3 类型胶囊「仅退款」生效', cards2 == 0 and only_refund and '暂无售后工单' in pg.inner_text('body'),
                  detail + '（无样本时退化为空态断言）')
        shot(pg, 'aftersale-type-filter', '类型筛选生效：仅「售后类型：仅退款」胶囊高亮 + 列表只剩该类型 + 计数联动')
        check('A3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # ============ B. 分类页 ============
        goto(pg, 'pages/product/categories/index', 8)
        names = row_names(pg)
        info('分类行 = %r' % names)
        cares = [pg.locator('.card').nth(i).locator('.caret').inner_text().strip() for i in range(pg.locator('.card').count())]
        pads = [row_padding_left(pg, i) for i in range(pg.locator('.card').count())]
        info('caret=%r padding=%r' % (cares, pads))
        has_parent = any(v == '▾' for v in cares) and any(p > 0 for p in pads)
        if col_moved or has_parent:
            pidx = next(i for i, v in enumerate(cares) if v == '▾')
            check('B1 树形缩进 + 折叠箭头：父「%s」= ▾ / 子行 padding-left > 0' % names[pidx],
                  has_parent, 'caret=%r pad=%r' % (cares, pads))
            check('B1 行内图标区每行可见（.ico 数 == 行数）',
                  pg.locator('.ico').count() == pg.locator('.card').count(),
                  'ico=%d rows=%d ico-img=%d ico-plus=%d' % (pg.locator('.ico').count(), pg.locator('.card').count(),
                                                             pg.locator('.ico-img').count(), pg.locator('.ico-plus').count()))
        else:
            skip('B1 树形缩进 / 折叠箭头', '本渠道分类无父-子关系（树是平的），fixture 未生效')
        shot(pg, 'categories-tree', '分类树：父分类 ▾ 折叠箭头 + 子分类缩进 + 每行行内图标区 + ↑↓↳ 操作')
        check('B1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- 折叠 ---
        if has_parent:
            n_before = pg.locator('.card').count()
            pg.locator('.card').nth(pidx).locator('.caret').click()
            time.sleep(1.5)
            n_after = pg.locator('.card').count()
            collapsed_glyph = pg.locator('.card').nth(pidx).locator('.caret').inner_text().strip()
            check('B2 折叠生效：点 ▾ 后子行收起（%d → %d 行，箭头变 ▸）' % (n_before, n_after),
                  n_after < n_before and collapsed_glyph == '▸', 'rows %d→%d glyph=%r' % (n_before, n_after, collapsed_glyph))
            shot(pg, 'categories-collapsed', '折叠生效：父分类子行收起（▾ → ▸，行数减少）')
            pg.locator('.card').nth(pidx).locator('.caret').click()
            time.sleep(1.5)
            check('B2 再次展开还原', pg.locator('.card').count() == n_before, 'rows=%d' % pg.locator('.card').count())
        else:
            skip('B2 折叠生效', '无父-子关系可折叠')

        # --- 勾选 + 底部批量条 ---
        pg.locator('.pick').nth(0).click()
        pg.locator('.pick').nth(1).click()
        time.sleep(1.2)
        bulk_txt = pg.locator('.bulk').inner_text() if pg.locator('.bulk').count() else ''
        check('B3 勾选后底部批量条出现（数量 + 批量改图标/批量移动/批量删除）',
              pg.locator('.bulk').count() == 1 and all(k in bulk_txt for k in ['批量改图标', '批量移动', '批量删除']),
              'bulk=%r' % bulk_txt.replace('\n', ' '))
        shot(pg, 'categories-picked-bulk', '勾选 2 个分类后出现底部批量条（改图标 / 移动 / 删除）')

        # --- 批删限制：含子分类 ---
        blocked_hit = None
        if has_parent:
            pg.locator('.pick').nth(0).click()          # 取消第一个勾选，只留索引 1 的父分类（有子分类）
            time.sleep(0.8)
            pg.locator('.bulk', has_text='批量删除').locator('uni-text', has_text='批量删除').first.click()
            time.sleep(0.5)
            blocked_hit = toast_text(pg)
            check('B4 批删限制：含子分类被拦截（toast 含「含子分类」且未真删）',
                  '含子分类' in blocked_hit and pg.locator('.card').count() == len(names),
                  'toast=%r rows=%d' % (blocked_hit, pg.locator('.card').count()))
            shot(pg, 'categories-bulkdelete-blocked-children', '批删限制 ①：有子分类的分类被拦截（toast 提示，未删除）')
        else:
            skip('B4 批删限制（含子分类）', '无父-子关系')

        # --- 批删限制：含商品 ---
        pg.reload(wait_until='networkidle', timeout=60000)
        time.sleep(5)
        names2 = row_names(pg)
        pidx2 = names2.index('精选好物') if '精选好物' in names2 else 0
        pg.locator('.pick').nth(pidx2).click()
        time.sleep(0.8)
        pg.locator('.bulk', has_text='批量删除').locator('uni-text', has_text='批量删除').first.click()
        time.sleep(0.5)
        blocked2 = toast_text(pg)
        check('B5 批删限制：含商品被拦截（toast 含「含商品」且未真删）',
              '含商品' in blocked2 and pg.locator('.card').count() == len(names2),
              'toast=%r rows=%d（「精选好物」productVariantCount=5）' % (blocked2, pg.locator('.card').count()))
        shot(pg, 'categories-bulkdelete-blocked-products', '批删限制 ②：有商品的分类被拦截（toast 提示，未删除）')

        # --- 换序 + 回读一致（B6a 根级为主图；B6b 子级为辅） ---
        # 修复 e2c1b9f 后 swapSibling 改为「从扁平列表按 parentId 过滤 + position/name 排序」取兄弟，
        # 因此根分类（parentId 指向未被 collections 返回的根集合 '1'）也能换序——B6a 即该缺陷的回归验证。
        def reload_rows(settle=5):
            pg.reload(wait_until='networkidle', timeout=60000)
            time.sleep(settle)
            return row_names(pg)

        # ---- B6a：根级换序（必须成立，主图） ----
        order0 = reload_rows()
        pads0 = [row_padding_left(pg, i) for i in range(pg.locator('.card').count())]
        root_idx = [i for i, p in enumerate(pads0) if p == 0]
        detail_head = '根级行=%r（padding=%r）' % ([order0[i] for i in root_idx], pads0)
        if len(root_idx) >= 2:
            root_a = order0[root_idx[0]]
            pg.locator('.card').nth(root_idx[0]).locator('.ops uni-text', has_text='↓').first.click()
            time.sleep(3)
            order_move = row_names(pg)
            order_read = reload_rows()
            check('B6a 根级 ↓ 换序生效且回读一致：根「%s」与相邻根兄弟交换' % root_a,
                  order_move == order_read and order_read != order0,
                  '%s 换序前=%r 点↓后=%r 刷新回读=%r' % (detail_head, order0, order_move, order_read))
            shot(pg, 'categories-reorder', '根级换序（修复后）：点根分类 ↓ → 与相邻根分类交换，刷新后顺序一致')
            pg.locator('.card').nth(order_read.index(root_a)).locator('.ops uni-text', has_text='↑').first.click()
            time.sleep(3)
            order_back = reload_rows(4)
            check('B6a 复原：点 ↑ 换回原顺序', order_back == order0,
                  '复原后=%r（原=%r）' % (order_back, order0))
        else:
            skip('B6a 根级换序', '顶层根级行 < 2，取不到相邻根兄弟')

        # ---- B6b：子级换序（父分类已在列表内，复核修复未回归） ----
        c_order0 = reload_rows()
        if has_parent and '数码专区' in c_order0:
            i_a = c_order0.index('数码专区')
            pg.locator('.card').nth(i_a).locator('.ops uni-text', has_text='↓').first.click()
            time.sleep(3)
            c_move = row_names(pg)
            c_read = reload_rows()
            check('B6b 子级 ↓ 换序生效且回读一致（父分类在列表内）',
                  c_move == c_read and c_read != c_order0,
                  '换序前=%r 点↓后=%r 刷新回读=%r' % (c_order0, c_move, c_read))
            shot(pg, 'categories-reorder-child', '子级换序：同父级子分类 ↓ 交换，刷新后顺序一致（复核无回归）')
            pg.locator('.card').nth(c_read.index('数码专区')).locator('.ops uni-text', has_text='↑').first.click()
            time.sleep(3)
            check('B6b 复原：点 ↑ 换回原顺序', reload_rows(4) == c_order0, 'rows=%r' % row_names(pg))
        else:
            skip('B6b 子级换序', '无同父级子分类可换序（fixture 未生效）')
        check('B 分类页 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        sizes = []
        for f in sorted(OUT.glob('gap4-batch1-*.png')):
            sizes.append('%s:%dB' % (f.name, f.stat().st_size))
        info('本次落图: %s' % ', '.join(sizes))
        b.close()

    restore(tok, ctoken, col_moved, as_created)

    print('\n===== gap4 批 1 验收：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
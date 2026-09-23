# -*- coding: utf-8 -*-
# 配货台与库位 · 操作手册截图（Task 15 Step 1~3）
# 手机视口 390x844 dpr=2（输出 780x1688）；打印单据为纸质文档，按 A4/热敏比例单独输出。
# 数据准备全部走真实 admin-api，且**全程可逆**：生成库位 / 绑定库位 / 建批次 / 取消批次 / 切档位。
# 按用户确认：**不真实发货**（shipPickBatch 会把真实订单推进到已发货且不可撤销），
# 故「发货」环节只做只读存在性校验（见 _smoke_picking_live.py），不在生产执行。
import json
import os
import shutil
import time

from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5280/guanli/'
HOST = 'http://localhost:5280'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)

SHOTS = []
ERRS = []


# ---------------- 通用 ----------------
def gql(pg, q, var=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, var])


def gql_data(pg, q, var=None, tag=''):
    d = gql(pg, q, var)
    if d.get('errors'):
        raise SystemExit('[%s] GraphQL 失败：%s' % (tag, str(d['errors'])[:400]))
    return d['data']


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code','t2');
        return 'OK';
      });
    }""")
    print('  登录/渠道 =', ok)
    if ok != 'OK':
        raise SystemExit('渠道注入失败')


def set_mode(pg, mode):
    gql_data(pg, 'mutation($f: JSON!){ myUpdateChannelCustomFields(input:$f) }', {'f': {'binMode': mode}}, 'set_mode')
    print('  binMode ->', mode)


def goto(pg, path, settle=6.0):
    """uni-app H5 是 hash 路由：仅改 hash 不会重载页面，上一页的 picker 遮罩等残留 DOM
    会拦截后续点击 → 统一冷加载（goto + reload），同时保证切档位后读到新档位。"""
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def hide_devtools(pg):
    """dev server 下 uni-app H5 会在右下角渲染一个 30x30 的匿名调试按钮（截图里显示为「…」），
    production 构建不存在；截图前统一隐藏，避免污染手册配图。"""
    try:
        pg.evaluate("""() => {
          for (const e of document.querySelectorAll('div')) {
            if (e.className) continue;
            if (getComputedStyle(e).position !== 'fixed') continue;
            const r = e.getBoundingClientRect();
            if (Math.round(r.width) === 30 && Math.round(r.height) === 30 && r.right > 300) {
              e.style.display = 'none';
            }
          }
        }""")
    except Exception:  # noqa: BLE001
        pass


def hide_bulk_bar(pg, hide):
    """批次详情页底部固定条是 position:fixed：整页截图（full_page）时它会「钉」在视口底部，
    把中间的打印宫格压住。截图期间临时隐藏，截完恢复。"""
    try:
        pg.evaluate("""(hide) => {
          document.querySelectorAll('.bulk').forEach(e => { e.style.display = hide ? 'none' : ''; });
        }""", hide)
    except Exception:  # noqa: BLE001
        pass


def shot(pg, name, full=False):
    hide_devtools(pg)
    pg.screenshot(path=SHOT + name, full_page=full)
    SHOTS.append(name)
    print('  shot:', name)


def pick_option(pg, idx, wait=2.5):
    """uni-app H5 picker(mode=selector)：点 uni-picker 包裹层打开遮罩，
    再点**可见**的「完成」确认当前高亮项（3 个 picker 各自带一份隐藏容器，必须加 :visible）。"""
    try:
        pg.locator('uni-picker').nth(idx).tap()
        time.sleep(1.5)
        btn = pg.locator('.uni-picker-action-confirm:visible')
        if btn.count() == 0:
            print('    picker[%d] 未打开，跳过' % idx)
            return False
        btn.first.tap()
        time.sleep(wait)
        return True
    except Exception as e:  # noqa: BLE001
        print('    picker[%d] 交互失败：%s' % (idx, str(e)[:120]))
        return False


# ---------------- 数据准备（可逆） ----------------
def seed(pg, loc_id):
    """生成标准库位（幂等）+ 把前两个候选商品绑定到 A 库区，其余留空以产生「未归位」标黄行"""
    d = gql_data(pg, 'mutation($id: ID!){ generateStandardBins(stockLocationId:$id) }',
                 {'id': str(loc_id)}, 'genStandard')
    print('  生成标准库位 =', d['generateStandardBins'])
    zones = gql_data(pg, 'query($id: ID!){ storageZones(stockLocationId:$id){ id code name } }',
                     {'id': str(loc_id)}, 'zones')['storageZones']
    bins = gql_data(pg, 'query($id: ID!){ storageBins(stockLocationId:$id){ id code zoneId rowNo levelNo } }',
                    {'id': str(loc_id)}, 'bins')['storageBins']
    print('  zones =', len(zones), ' bins =', len(bins))

    cand = gql_data(pg, 'query{ pickBatchCandidates(options:{page:1,pageSize:6}){ items } }',
                    None, 'cand')['pickBatchCandidates']['items']
    order_ids = [str(x['id']) for x in cand]
    variants = []
    for oid in order_ids:
        o = gql_data(pg, 'query($id: ID!){ order(id:$id){ id code lines{ productVariant{ id sku } } } }',
                     {'id': oid}, 'orderLine')['order']
        for l in ((o or {}).get('lines') or []):
            vid = l['productVariant']['id']
            if vid and all(vid != v for v, _ in variants):
                variants.append((vid, l['productVariant']['sku']))
    print('  候选订单 =', len(order_ids), ' 去重变体 =', [s for _, s in variants][:6])

    za = next((z for z in zones if z['code'] == 'A'), zones[0] if zones else None)
    if za:
        z_bins = [b for b in bins if str(b['zoneId']) == str(za['id'])]
        for i, (vid, sku) in enumerate(variants[:2]):
            if i >= len(z_bins):
                break
            gql_data(pg, 'mutation($input: BindVariantBinInput!){ bindVariantToBin(input:$input) }',
                     {'input': {'variantId': str(vid), 'stockLocationId': str(loc_id),
                                'zoneId': str(za['id']), 'binId': str(z_bins[i]['id'])}}, 'bind')
            print('  绑定', sku, '->', za['code'], z_bins[i]['code'])
    return order_ids, variants


def create_batch(pg, loc_id, order_ids, n=3):
    d = gql_data(pg, 'mutation($input: CreatePickBatchInput!){ createPickBatch(input:$input){ id code state memberCount itemCount createdAt } }',
                 {'input': {'stockLocationId': str(loc_id), 'orderIds': order_ids[:n], 'note': None}}, 'createBatch')
    b = d['createPickBatch']
    print('  建批次 =', b['code'], b['memberCount'], '单', b['itemCount'], '件')
    return b


def cancel_batch(pg, bid):
    # SDL 实参名是 batchId（不是 id）：写 id 会报 Unknown argument "id"
    d = gql_data(pg, 'mutation($batchId: ID!){ cancelPickBatch(batchId:$batchId){ id code state } }',
                 {'batchId': str(bid)}, 'cancelBatch')
    print('  取消批次 =', d['cancelPickBatch']['code'], d['cancelPickBatch']['state'])


# ---------------- 打印单据预览（真实数据 + 真实模板） ----------------
PRINT_VIEWPORTS = {
    'picking_print_list': (900, 1273),
    'picking_print_note': (900, 1273),
    'picking_print_overview': (900, 636),
    'picking_print_label': (390, 844),
}


def print_previews(pg, bid, mode, tag, wh):
    rows = gql_data(pg, 'query($id: ID!){ pickBatchPickingList(id:$id){ sku name qty orderCodes binCode zoneCode zoneName pathIndex } }',
                    {'id': str(bid)}, 'pickingList')['pickBatchPickingList']
    batch = gql_data(pg, 'query($id: ID!){ pickBatch(id:$id){ id code state memberCount itemCount } }',
                     {'id': str(bid)}, 'batch')['pickBatch']
    members = gql_data(pg, 'query($id: ID!){ pickBatch(id:$id){ members } }', {'id': str(bid)}, 'members')['pickBatch']['members']
    doc = {'batch': batch, 'rows': rows, 'members': members, 'binMode': mode, 'wh': wh}
    html = pg.evaluate("""async (doc) => {
      const [pl, sn, pl2, bo, common] = await Promise.all([
        import('/guanli/src/utils/print/templates/picking-list.ts'),
        import('/guanli/src/utils/print/templates/shipping-note.ts'),
        import('/guanli/src/utils/print/templates/parcel-label.ts'),
        import('/guanli/src/utils/print/templates/batch-overview.ts'),
        import('/guanli/src/utils/print/doc-common.ts'),
      ]);
      const labels = Object.fromEntries(Object.keys(common.DEFAULT_LABELS).map(k => [k, common.DEFAULT_LABELS[k]]));
      const meta = { batchCode: doc.batch.code, warehouseName: doc.wh, printedAt: new Date('2026-09-23T10:30:00'), labels };
      const orders = (doc.members || []).map(m => ({
        code: m.code, customerName: m.customerName, phoneNumber: m.phoneNumber,
        address: m.address, itemCount: m.itemCount,
      }));
      return JSON.stringify({
        picking: pl.renderPickingList({ ...meta, binMode: doc.binMode, rows: doc.rows }),
        shipping: sn.renderShippingNote({ ...meta, orders }),
        label: pl2.renderParcelLabel({ ...meta, orders }),
        overview: bo.renderBatchOverview({ ...meta, batchState: doc.batch.state, orders }),
      });
    }""", doc)
    parts = json.loads(html)
    for key, stem in [('picking', 'picking_print_list'), ('shipping', 'picking_print_note'),
                      ('label', 'picking_print_label'), ('overview', 'picking_print_overview')]:
        name = '%s_%s.png' % (stem, tag)
        w, h = PRINT_VIEWPORTS[stem]
        pp = pg.context.new_page()
        pp.set_viewport_size({'width': w, 'height': h})
        pp.set_content(parts[key], wait_until='load')
        time.sleep(0.6)
        pp.screenshot(path=SHOT + name, full_page=True)
        SHOTS.append(name)
        pp.close()
        print('  shot:', name)


# ---------------- 页面级流程 ----------------
def bins_page(pg, mode, tag, expect_zones, expect_chips):
    goto(pg, 'pages/inventory/bins/index', 8)
    z = pg.locator('.card.zone').count()
    c = pg.locator('.chip').count()
    dis = pg.locator('.disabled').count()
    print('  库位页(%s) 库区=%d 库位格=%d 兜底块=%d' % (tag, z, c, dis))
    if (z, c, dis) != (expect_zones, expect_chips, 1 if mode == 'off' else 0):
        print('    !! 与预期不符，正文 =', pg.inner_text('body')[:160].replace('\n', '|'))
    shot(pg, 'picking_bins_%s_390.png' % tag, full=(mode != 'off'))


def purchase_page(pg, mode, tag, variant_id):
    goto(pg, 'pages/inventory/stock-doc/purchase/index', 6)
    pick_option(pg, 0)  # 目标仓库 → 默认仓
    if mode != 'off' and variant_id:
        # 填已归位变体 → blur 触发 checkExistingBin → 展示「该 SKU 现库位」并回填库区/库位
        # uni-app 把 <input class="ipt"> 渲染成 <uni-input class="ipt"><input class="uni-input-input">
        # 所以必须用 'uni-input.ipt input'，直接写 'input.ipt' 永远匹配不到。
        ipt = pg.locator('uni-input.ipt input').nth(0)
        ipt.fill(str(variant_id))
        ipt.press('Tab')
        time.sleep(3)
    print('  采购入库(%s) 现库位提示=%d 级联 picker=%d' % (tag, pg.locator('.exist').count(), pg.locator('uni-picker').count()))
    shot(pg, 'picking_purchase_%s_390.png' % tag, full=(mode != 'off'))


def batch_shot(pg, name):
    """批次详情整页截图：临时隐藏底部固定条，避免它压住打印单据宫格"""
    hide_bulk_bar(pg, True)
    shot(pg, name, full=True)
    hide_bulk_bar(pg, False)


def console_page(pg, tab, name, settle=4.5):
    goto(pg, 'pages/order/picking/index', 8)
    if tab:
        pg.locator('.tb').nth(tab).tap()
        time.sleep(settle)
    shot(pg, name)


# ---------------- 主流程 ----------------
ORIGIN_MODE = 'off'
LOC = ''
LOC_NAME = ''
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        # 页面异常收集（挂在 page 上，跨 reload 有效）
        pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

        login(pg)
        ch = gql_data(pg, 'query{ activeChannel{ id code customFields{ binMode } } }', None, 'channel')['activeChannel']
        ORIGIN_MODE = (ch.get('customFields') or {}).get('binMode') or 'off'
        print('  原始 binMode =', ORIGIN_MODE)

        locs = gql_data(pg, 'query{ stockLocations{ items{ id name } } }', None, 'locs')['stockLocations']['items']
        hit = next((l for l in locs if l['name'] == '默认仓'), locs[0])
        LOC, LOC_NAME = str(hit['id']), hit['name']
        print('  目标仓 =', LOC, LOC_NAME)

        order_ids, variants = seed(pg, LOC)
        first_variant = variants[0][0] if variants else ''

        # ===== 档位 bin =====
        set_mode(pg, 'bin')
        bins_page(pg, 'bin', 'bin', 4, 18)
        purchase_page(pg, 'bin', 'bin', first_variant)

        goto(pg, 'pages/order/picking/index', 8)
        print('  候选行 =', pg.locator('.row').count())
        shot(pg, 'picking_console_pending_390.png')
        for i in range(min(3, pg.locator('.row').count())):
            pg.locator('.row').nth(i).tap()
            time.sleep(0.6)
        print('  已勾选底部条 =', pg.locator('.bulk').count())
        shot(pg, 'picking_console_selected_390.png')
        pg.locator('.b').first.tap()
        time.sleep(4)
        shot(pg, 'picking_newbatch_sheet_390.png')
        if pg.locator('.btn.ghost').count():
            pg.locator('.btn.ghost').first.tap()
        time.sleep(2)

        batch = create_batch(pg, LOC, order_ids, 3)
        goto(pg, 'pages/order/picking/batch?id=%s' % batch['id'], 9)
        print('  批次详情 拣货行=%d 成员=%d 打印格=%d' % (
            pg.locator('.prow').count(), pg.locator('.row').count(), pg.locator('.pb').count()))
        batch_shot(pg, 'picking_batch_bin_390.png')

        if pg.locator('.edit').count():
            pg.locator('.edit').first.tap()
            time.sleep(3)
            shot(pg, 'picking_addr_edit_390.png')
            pg.locator('.btn.ghost').first.tap()
            time.sleep(2)

        print_previews(pg, batch['id'], 'bin', 'bin', LOC_NAME)

        console_page(pg, 1, 'picking_console_active_390.png')
        cancel_batch(pg, batch['id'])
        console_page(pg, 2, 'picking_console_done_390.png')

        # ===== 档位 zone =====
        set_mode(pg, 'zone')
        bins_page(pg, 'zone', 'zone', 4, 0)
        purchase_page(pg, 'zone', 'zone', first_variant)
        bz = create_batch(pg, LOC, order_ids, 3)
        goto(pg, 'pages/order/picking/batch?id=%s' % bz['id'], 9)
        batch_shot(pg, 'picking_batch_zone_390.png')
        print_previews(pg, bz['id'], 'zone', 'zone', LOC_NAME)
        cancel_batch(pg, bz['id'])

        # ===== 档位 off =====
        set_mode(pg, 'off')
        bins_page(pg, 'off', 'off', 0, 0)
        purchase_page(pg, 'off', 'off', '')
        bo = create_batch(pg, LOC, order_ids, 3)
        goto(pg, 'pages/order/picking/batch?id=%s' % bo['id'], 9)
        batch_shot(pg, 'picking_batch_off_390.png')
        print_previews(pg, bo['id'], 'off', 'off', LOC_NAME)
        cancel_batch(pg, bo['id'])

        print('  页面异常 =', ERRS[:5] if ERRS else '无')
        b.close()
finally:
    # 还原档位：t2 渠道上线前为 off（三次档位截图共用同一渠道，结束必须回到 off）
    try:
        with sync_playwright() as p2:
            b2 = p2.chromium.launch(headless=True)
            pg2 = b2.new_context(viewport={'width': 390, 'height': 844}).new_page()
            login(pg2)
            set_mode(pg2, 'off')
            print('  已还原 binMode = off')
            b2.close()
    except Exception as e:  # noqa: BLE001
        print('  !! 档位还原失败，请手工改回 off：', str(e)[:160])

# 同步到操作手册 assets
os.makedirs(MANUAL, exist_ok=True)
for n in SHOTS:
    shutil.copy(SHOT + n, MANUAL + n)
print('copied %d shots → manual assets' % len(SHOTS))
print('done')
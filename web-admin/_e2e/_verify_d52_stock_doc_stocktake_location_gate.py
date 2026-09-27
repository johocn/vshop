# -*- coding: utf-8 -*-
"""D52 验收：库存单据 STOCKTAKE（库存明细页「调整」/快捷盘点页）目标仓守卫。

背景：
  D51 只给「协同盘库任务」（createStocktakeTask/updateTask）加了仓性质校验，
  而 `createStockDoc(type:'STOCKTAKE')` 这条链路（D42 起被库存明细页「调整」与
  快捷盘点页 `pages/inventory/stock-doc/stocktake/index` 复用）当时**后端无 gate**：
  物理仓模式下可把盘点/调数写到虚拟仓 → 同一 SKU 出现「盘点账面（虚拟仓）」与
  「可售账面（物理仓）」二义，且下一次镜像触发就把刚写的数冲掉。
  D52 把守卫抽成 VirtualPhysicalStockService.assertStocktakeLocationAllowed
  （D51 定稿口径的唯一实现），协同盘库与库存单据共用。

本脚本验证（默认线上）：
  ① 前提：t2 开关 = false、`__default_channel__` 开关 = true（读 overview，不臆测）
  ② 拒绝态：`__default_channel__` + 虚拟仓 → createStockDoc 失败且文案含「必须选物理仓」
     并断言前后 `stockDocList(STOCKTAKE)` / `stockMovementLedger(bizType=stocktake)`
     totalItems 不变（守卫在事务内抛出 → 整单回滚，零残留）
  ③ 放行态探针（**零写入**）：t2（纯虚拟库存店）+ 虚拟仓 → 报错**不含**「必须选物理仓」，
     即守卫放行、请求走到了写入阶段（写入阶段因 variantId 不存在而失败并整体回滚）。
     故意用不存在的 variantId：`stock_level.productVariantId` 有 FK 指向 product_variant
     （已核实生产 pg_constraint），且整条链路在同一事务内 → 生产不会留下任何账面/流水/残单。
     **本脚本绝不在生产写真实库存**（不做成功路径的真实过账）。
  ④ UI（手机 390×844 dpr=2）：快捷盘点页仓候选 =
     · t2 → 全部仓（含虚拟仓，存量用法可選）
     · `__default_channel__` → 物理仓集合（虚拟仓已过滤，与后端同口径）
  ⑤ 全程 0 pageerror；截图 2 张落 docs/verify/

环境变量：WA_D52_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD（租户 t2）、WA_D52_ADMIN_USER / WA_D52_ADMIN_PWD
  （超管，默认 superadmin / z123123）、WA_D52_TAG（截图文件名后缀）
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

BASE = os.environ.get('WA_D52_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
ADMIN_USER = os.environ.get('WA_D52_ADMIN_USER', 'superadmin')
ADMIN_PWD = os.environ.get('WA_D52_ADMIN_PWD', 'z123123')
TAG = os.environ.get('WA_D52_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
QUICK_STOCKTAKE = 'pages/inventory/stock-doc/stocktake/index'
TENANT_CH = 't2'                 # 纯虚拟库存店（开关 f，存量调整/盘点写法所在渠道）
PHYS_CH = '__default_channel__'  # 唯一开关为 t 的渠道
GATE_TEXT = '必须选物理仓'          # 守卫拒绝文案判据（D51/D52 共用）
# 不存在的变体：守卫通过后必然在写入阶段失败 → 用于「放行」探针，保证零写入
GHOST_VARIANT = '99999999'

FAILS = []
OKS = []


def info(msg):
    print('  %s' % msg)


def ok(msg):
    OKS.append(msg)
    print('  [OK] %s' % msg)


def bad(msg):
    FAILS.append(msg)
    print('  [FAIL] %s' % msg)


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
    return str(es[0].get('message'))[:250] if es else None


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


def login_api(user, pwd):
    q = ('mutation($u:String!,$p:String!){login(username:$u,password:$p)'
         '{... on CurrentUser{id identifier}}}')
    tok, r = api(q, {'u': user, 'p': pwd})
    if not tok:
        body = json.dumps({'query': q, 'variables': {'u': user, 'p': pwd}}).encode()
        req = urllib.request.Request('%s/login' % ADMIN, data=body,
                                     headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                tok = resp.headers.get('vendure-auth-token')
        except Exception:  # noqa: BLE001
            tok = None
    if not tok:
        env_fail('%s 登录失败 %s' % (user, json.dumps(r, ensure_ascii=False)[:300]))
    return tok


def channels_of(tok):
    """渠道表（code → token）：租户走 myTenantAccess，超管回退核心 channels.items"""
    _, r = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    if not chans:
        _, r2 = api('query{channels{items{id code token}}}', token=tok)
        chans = ((r2.get('data') or {}).get('channels') or {}).get('items') or []
    return chans


OV = ('channelCode physicalStockEnabled virtualCode '
      'locations{id name code kind}')


def overview(tok, ctoken):
    _, r = api('query{tenantInventoryOverview{%s}}' % OV, token=tok, channel=ctoken)
    e = gerr(r)
    if e:
        env_fail('tenantInventoryOverview 失败：%s' % e)
    ov = ((r.get('data') or {}).get('tenantInventoryOverview') or {})
    if not ov:
        env_fail('tenantInventoryOverview 返回空：%s' % json.dumps(r, ensure_ascii=False)[:200])
    return ov


def totals(tok, ctoken):
    """残留基线：盘库单数 + 盘点流水数（只读）"""
    _, r1 = api('query{stockDocList(type:"STOCKTAKE",page:1,pageSize:1){totalItems}}',
                token=tok, channel=ctoken)
    _, r2 = api('query{stockMovementLedger(bizType:"stocktake",page:1,pageSize:1){totalItems}}',
                token=tok, channel=ctoken)
    d = ((r1.get('data') or {}).get('stockDocList') or {}).get('totalItems')
    m = ((r2.get('data') or {}).get('stockMovementLedger') or {}).get('totalItems')
    return d, m


def create_stocktake_doc(tok, ctoken, loc_id, variant_id, remark):
    q = ('mutation($input:StockDocCreateInput!){createStockDoc(input:$input)'
         '{id code type}}')
    _, r = api(q, {'input': {
        'type': 'STOCKTAKE',
        'remark': remark,
        'items': [{'variantId': str(variant_id), 'toStockLocationId': str(loc_id),
                   'qty': 1, 'realQty': 1}],
    }}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        env_fail('createStockDoc 传输失败：%s' % r['TRANSPORT'])
    return ((r.get('data') or {}).get('createStockDoc')), gerr(r)


# ---- UI ----
def login_ui(pg, user, pwd, ch_token=None, ch_code=None):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(user)
    pg.locator('input').nth(1).fill(pwd)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)
    if ch_token:
        pg.evaluate('([t, c]) => { localStorage.setItem("wa_channel_token", t);'
                    ' localStorage.setItem("wa_channel_code", c); }', [ch_token, ch_code])


def open_quick_stocktake(pg):
    pg.goto(BASE + '#/' + QUICK_STOCKTAKE + '?cb=' + str(int(time.time() * 1000)),
            wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.save').first.wait_for(state='visible', timeout=90000)
    time.sleep(1.5)  # 等 onMounted 的仓候选拉回


def picker_options(pg, shot):
    """点仓库 picker → 读候选文本 + 截图（返回 candidates）

    注意：uni-app H5 会同时渲染一份 **display:none 的隐藏模板**（`.uni-picker-select`
    内的 `.uni-picker-item`），`.uni-picker-item` 裸选会命中隐藏那份导致 wait_for 超时；
    真实弹出的滚轮在 `.uni-picker-view-content` 内（见 2026-09-27 DOM 探针）。
    """
    pg.locator('.card uni-picker').first.click()
    item = pg.locator('.uni-picker-view-content .uni-picker-item')
    item.first.wait_for(state='visible', timeout=20000)
    time.sleep(0.6)
    cands = [t.strip() for t in item.all_inner_texts()]
    pg.screenshot(path=str(shot))
    return cands


def shoot(name, suffix):
    OUT.mkdir(parents=True, exist_ok=True)
    return OUT / ('d52_stock_doc_stocktake_locations_%s%s_390.png' % (name, suffix))


def run():
    suffix = ('_' + TAG) if TAG else ''
    print('== 登录 ==')
    tenant_tok = login_api(USER, PWD)
    admin_tok = login_api(ADMIN_USER, ADMIN_PWD)
    t_chans = {c['code']: c['token'] for c in channels_of(tenant_tok)}
    a_chans = {c['code']: c['token'] for c in channels_of(admin_tok)}
    info('租户渠道：%s' % ','.join(sorted(t_chans)))
    if TENANT_CH not in t_chans:
        env_fail('租户会话看不到渠道 %s' % TENANT_CH)
    if PHYS_CH not in a_chans:
        env_fail('超管会话看不到渠道 %s' % PHYS_CH)

    print('== ① 前提：两渠道开关 ==')
    ov_t = overview(tenant_tok, t_chans[TENANT_CH])
    ov_p = overview(admin_tok, a_chans[PHYS_CH])
    info('t2: physicalStockEnabled=%s locations=%d' % (ov_t['physicalStockEnabled'], len(ov_t['locations'])))
    info('%s: physicalStockEnabled=%s locations=%d'
         % (PHYS_CH, ov_p['physicalStockEnabled'], len(ov_p['locations'])))
    if ov_t['physicalStockEnabled'] is not False:
        bad('t2 开关应为 false（前提不成立，后续断言无意义）')
        return
    if ov_p['physicalStockEnabled'] is not True:
        bad('%s 开关应为 true（前提不成立）' % PHYS_CH)
        return
    ok('前提成立：t2=纯虚拟库存店、%s=物理仓模式' % PHYS_CH)

    t_virtual = next((l for l in ov_t['locations'] if l['kind'] == 'virtual'), None)
    p_virtual = next((l for l in ov_p['locations'] if l['kind'] == 'virtual'), None)
    p_phys = next((l for l in ov_p['locations'] if l['kind'] == 'physical'), None)
    if not (t_virtual and p_virtual and p_phys):
        bad('仓夹具不足：t2 虚拟仓=%s / %s 虚拟仓=%s 物理仓=%s'
            % (bool(t_virtual), PHYS_CH, bool(p_virtual), bool(p_phys)))
        return
    info('t2 虚拟仓=%s(%s)；%s 虚拟仓=%s(%s) / 物理仓=%s(%s)'
         % (t_virtual['name'], t_virtual['id'], PHYS_CH,
            p_virtual['name'], p_virtual['id'], p_phys['name'], p_phys['id']))

    print('== ② 拒绝态：%s 用虚拟仓建 STOCKTAKE 单据（调整/快捷盘点链路）==' % PHYS_CH)
    d0, m0 = totals(admin_tok, a_chans[PHYS_CH])
    info('基线：stockDoc(STOCKTAKE)=%s 条，盘点流水=%s 条' % (d0, m0))
    doc, err = create_stocktake_doc(admin_tok, a_chans[PHYS_CH], p_virtual['id'], GHOST_VARIANT,
                                    'D52 校验演示(虚拟仓应被拒)')
    if not err:
        bad('虚拟仓未被拒（预期报错，实际成功：%s）' % json.dumps(doc, ensure_ascii=False)[:160])
    elif GATE_TEXT not in err:
        bad('报错文案不符（期望含「%s」）：%s' % (GATE_TEXT, err))
    else:
        ok('已拒绝：%s' % err)
    d1, m1 = totals(admin_tok, a_chans[PHYS_CH])
    if (d1, m1) != (d0, m0):
        bad('拒绝后仍有残留：单据 %s→%s、流水 %s→%s（事务未回滚）' % (d0, d1, m0, m1))
    else:
        ok('零残留：单据 %s 条、流水 %s 条（守卫在事务内抛出 → 整单回滚）' % (d1, m1))

    print('== ③ 放行态探针：t2 用虚拟仓（零写入，仅证明守卫未拦截）==')
    d2, m2 = totals(tenant_tok, t_chans[TENANT_CH])
    info('基线：stockDoc(STOCKTAKE)=%s 条，盘点流水=%s 条' % (d2, m2))
    doc2, err2 = create_stocktake_doc(tenant_tok, t_chans[TENANT_CH], t_virtual['id'], GHOST_VARIANT,
                                      'D52 校验演示(虚拟店放行探针)')
    if not err2 and doc2:
        # 不可能发生（variantId 不存在 + FK）；真发生说明探针选错了渠道，立即人工介入
        bad('t2 虚拟仓竟然成功建单（探针失效，请人工核对并清理 %s）' % json.dumps(doc2, ensure_ascii=False)[:160])
    elif err2 and GATE_TEXT in err2:
        bad('t2 虚拟仓被守卫拦截（回归！生产手工调整/快捷盘点会被废）：%s' % err2)
    elif not err2:
        bad('t2 虚拟仓既无成功也无报错（响应异常）：%s' % json.dumps(doc2, ensure_ascii=False)[:160])
    else:
        ok('守卫放行：报错来自写入阶段而非仓性质校验 → %s' % err2)
    d3, m3 = totals(tenant_tok, t_chans[TENANT_CH])
    if (d3, m3) != (d2, m2):
        bad('t2 探针留下残留：单据 %s→%s、流水 %s→%s' % (d2, d3, m2, m3))
    else:
        ok('零残留：单据 %s 条、流水 %s 条（探针全链路在同一事务内回滚）' % (d3, m3))

    print('== ④ UI：快捷盘点页仓候选（390×844 dpr=2）==')
    with sync_playwright() as p:
        br = p.chromium.launch()
        for label, ctoken, ccode, expect_phys_only, ov in (
            ('t2_virtual_allowed', t_chans[TENANT_CH], TENANT_CH, False, ov_t),
            ('default_physical_only', a_chans[PHYS_CH], PHYS_CH, True, ov_p),
        ):
            pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            try:
                login_ui(pg, ADMIN_USER, ADMIN_PWD, ctoken, ccode)
                open_quick_stocktake(pg)
                shot = shoot(label, suffix)
                cands = picker_options(pg, shot)
            except Exception as e:  # noqa: BLE001
                bad('UI %s 异常：%s' % (label, str(e)[:200]))
                pg.close()
                continue
            names_all = set(l['name'] for l in ov['locations'])
            names_phys = set(l['name'] for l in ov['locations'] if l['kind'] == 'physical')
            virt_names = set(l['name'] for l in ov['locations'] if l['kind'] == 'virtual')
            info('%s 候选 %d 项：%s' % (label, len(cands), cands))
            if expect_phys_only:
                if virt_names & set(cands):
                    bad('%s 候选仍含虚拟仓：%s' % (label, sorted(virt_names & set(cands))))
                elif set(cands) != names_phys:
                    bad('%s 候选 != 物理仓集合（候选 %s / 物理 %s）'
                        % (label, sorted(cands), sorted(names_phys)))
                else:
                    ok('%s 候选 %d 项 = 物理仓集合，虚拟仓已过滤' % (label, len(cands)))
            else:
                if not (virt_names & set(cands)):
                    bad('%s 候选不含虚拟仓（应放行）：%s' % (label, cands))
                elif set(cands) != names_all:
                    bad('%s 候选 != 全部仓集合（候选 %s / 全部 %s）'
                        % (label, sorted(cands), sorted(names_all)))
                else:
                    ok('%s 候选 %d 项 = 全部仓集合，虚拟仓可選' % (label, len(cands)))
            if errs:
                bad('%s 页面 JS 异常 %d 条：%s' % (label, len(errs), errs[:2]))
            else:
                ok('%s 0 pageerror；截图 %s' % (label, shot.name))
            pg.close()
        br.close()


if __name__ == '__main__':
    run()
    print('')
    print('== 结论：%d 项通过 / %d 项失败 ==' % (len(OKS), len(FAILS)))
    for f in FAILS:
        print('  FAIL: %s' % f)
    raise SystemExit(1 if FAILS else 0)
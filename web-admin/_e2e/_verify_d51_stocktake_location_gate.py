# -*- coding: utf-8 -*-
"""D51 验收：盘点仓「库存模式」校验 + 物理仓写入补镜像（口径修正）。

背景（2026-09-27 生产 SQL 核实，收口前逐行复跑校正）：
  存量 24 个盘点任务**全部指向虚拟仓**、且**全部属渠道 37 = `t2`**
  （loc 3 `默认仓` 21 个 / loc 6 `t2-virtual` 3 个），终态 23 × CANCELLED + 1 × POSTED；
  各渠道 `customFieldsPhysicalstockenabled` 除 `__default_channel__`
  以外**全为 f**（含 `official-01`：有 2 个物理仓但开关是关的）。
  → 原方案「后端硬拒 kind≠physical」会直接废掉生产唯一在用的盘点用法，故改为**跟渠道库存模式走**：
    · `physicalStockEnabled = true`：必须选物理仓（消除同一 SKU「盘点账面 vs 可售账面」二义）
    · `physicalStockEnabled = false`（纯虚拟库存店）：虚拟仓即唯一账面，放行

本脚本验证（默认线上）：
  ① 前提：t2 开关 = false、`__default_channel__` 开关 = true（读 overview，不臆测）
  ② 放行态：t2 用**虚拟仓**建 DRAFT 盘点任务 → 成功（存量用法未被废），随即取消清理
  ③ 拒绝态：`__default_channel__` 用**虚拟仓**建任务 → 失败且文案含「必须选物理仓」
  ④ 正例：`__default_channel__` 用**物理仓**建任务 → 成功，随即取消清理
  ⑤ UI（手机 390×844 dpr=2）：两渠道盘点看板「新建」表单的仓候选
     · t2 → 候选含虚拟仓（= overview 全部仓）
     · `__default_channel__` → 候选**不含**虚拟仓（= 物理仓数）
  ⑥ 全程 0 pageerror；截图 2 张落 docs/verify/

环境变量：WA_D51_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD（租户 t2）、WA_D51_ADMIN_USER / WA_D51_ADMIN_PWD
  （超管，默认 superadmin / z123123）、WA_D51_TAG（截图文件名后缀）
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

BASE = os.environ.get('WA_D51_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
ADMIN_USER = os.environ.get('WA_D51_ADMIN_USER', 'superadmin')
ADMIN_PWD = os.environ.get('WA_D51_ADMIN_PWD', 'z123123')
TAG = os.environ.get('WA_D51_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
BOARD = 'pages/inventory/stocktake/index'
TENANT_CH = 't2'          # 存量盘点用法所在渠道（开关 f）
PHYS_CH = '__default_channel__'   # 唯一开关为 t 的渠道

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


OV = ('channelCode physicalStockEnabled '
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


def create_task(tok, ctoken, loc_id, name):
    q = ('mutation($input:StocktakeTaskInput!){createStocktakeTask(input:$input)'
         '{id code state stockLocationId}}')
    _, r = api(q, {'input': {'stockLocationId': str(loc_id), 'name': name, 'state': 'DRAFT'}},
               token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        env_fail('createStocktakeTask 传输失败：%s' % r['TRANSPORT'])
    return ((r.get('data') or {}).get('createStocktakeTask')), gerr(r)


def cancel_task(tok, ctoken, task_id):
    q = 'mutation($t:ID!){cancelStocktakeTask(taskId:$t){id code state}}'
    _, r = api(q, {'t': str(task_id)}, token=tok, channel=ctoken)
    return ((r.get('data') or {}).get('cancelStocktakeTask')), gerr(r)


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


def open_board(pg):
    pg.goto(BASE + '#/' + BOARD + '?cb=' + str(int(time.time() * 1000)),
            wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.fab').first.wait_for(state='visible', timeout=90000)
    time.sleep(1.0)


def sheet_location_options(pg, shot):
    """打开新建表单 → 点仓库 picker → 读候选文本 + 截图（返回 candidates）

    注意：uni-app H5 会同时渲染一份 **display:none 的隐藏模板**（`.uni-picker-select`
    内的 `.uni-picker-item`），`.uni-picker-item` 裸选会命中隐藏那份导致 wait_for 超时；
    真实弹出的滚轮在 `.uni-picker-view-content` 内（见 2026-09-27 DOM 探针）。
    """
    pg.locator('.fab').first.click()
    pg.locator('.sheet').first.wait_for(state='visible', timeout=30000)
    time.sleep(1.0)
    pg.locator('.sheet uni-picker').first.click()
    item = pg.locator('.uni-picker-view-content .uni-picker-item')
    item.first.wait_for(state='visible', timeout=20000)
    time.sleep(0.6)
    cands = [t.strip() for t in item.all_inner_texts()]
    pg.screenshot(path=str(shot))
    return cands


def shoot(pg, name, suffix):
    OUT.mkdir(parents=True, exist_ok=True)
    shot = OUT / ('d51_stocktake_locations_%s%s_390.png' % (name, suffix))
    return shot


def run():
    suffix = ('_' + TAG) if TAG else ''
    print('== 登录 ==')
    tenant_tok = login_api(USER, PWD)
    admin_tok = login_api(ADMIN_USER, ADMIN_PWD)
    t_chans = {c['code']: c['token'] for c in channels_of(tenant_tok)}
    a_chans = {c['code']: c['token'] for c in channels_of(admin_tok)}
    info('租户渠道：%s' % ','.join(sorted(t_chans)))
    info('超管可见渠道数：%d' % len(a_chans))
    if TENANT_CH not in t_chans:
        env_fail('租户会话看不到渠道 %s' % TENANT_CH)
    if PHYS_CH not in a_chans:
        t_chans.update({PHYS_CH: a_chans[PHYS_CH]})

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
    info('t2 虚拟仓=%s(%s)；%s 虚拟仓=%s / 物理仓=%s'
         % (t_virtual['name'], t_virtual['id'], PHYS_CH, p_virtual['name'], p_phys['name']))

    print('== ② 放行态：t2 用虚拟仓建任务（存量 24 个任务的做法）==')
    task, err = create_task(tenant_tok, t_chans[TENANT_CH], t_virtual['id'],
                            'D51 校验演示(虚拟仓放行)')
    if err or not task:
        bad('t2 虚拟仓建任务被拒（回归！存量用法被废）：%s' % err)
    else:
        ok('放行成功：%s state=%s loc=%s' % (task['code'], task['state'], task['stockLocationId']))
        c, cerr = cancel_task(tenant_tok, t_chans[TENANT_CH], task['id'])
        if cerr or not c or c['state'] != 'CANCELLED':
            bad('清理失败：%s' % cerr)
        else:
            ok('清理：%s → CANCELLED' % c['code'])

    print('== ③ 拒绝态：%s 用虚拟仓建任务 ==' % PHYS_CH)
    task2, err2 = create_task(admin_tok, a_chans[PHYS_CH], p_virtual['id'],
                              'D51 校验演示(虚拟仓应被拒)')
    if not err2:
        bad('虚拟仓未被拒（预期报错，实际成功：%s）' % json.dumps(task2, ensure_ascii=False)[:160])
        if task2:
            cancel_task(admin_tok, a_chans[PHYS_CH], task2['id'])
    elif '必须选物理仓' not in err2:
        bad('报错文案不符（期望含「必须选物理仓」）：%s' % err2)
    else:
        ok('已拒绝：%s' % err2)

    print('== ④ 正例：%s 用物理仓建任务 ==' % PHYS_CH)
    task3, err3 = create_task(admin_tok, a_chans[PHYS_CH], p_phys['id'],
                              'D51 校验演示(物理仓放行)')
    if err3 or not task3:
        bad('物理仓建任务失败：%s' % err3)
    else:
        ok('放行成功：%s state=%s loc=%s' % (task3['code'], task3['state'], task3['stockLocationId']))
        c3, cerr3 = cancel_task(admin_tok, a_chans[PHYS_CH], task3['id'])
        if cerr3 or not c3 or c3['state'] != 'CANCELLED':
            bad('清理失败：%s' % cerr3)
        else:
            ok('清理：%s → CANCELLED' % c3['code'])

    print('== ⑤ UI：新建表单仓候选（390×844 dpr=2）==')
    with sync_playwright() as p:
        br = p.chromium.launch()
        for label, user, pwd, ctoken, ccode, expect_phys_only, ov in (
            ('t2_virtual_allowed', ADMIN_USER, ADMIN_PWD, t_chans[TENANT_CH], TENANT_CH, False, ov_t),
            ('default_physical_only', ADMIN_USER, ADMIN_PWD, a_chans[PHYS_CH], PHYS_CH, True, ov_p),
        ):
            pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            try:
                login_ui(pg, user, pwd, ctoken, ccode)
                open_board(pg)
                shot = shoot(pg, label, suffix)
                cands = sheet_location_options(pg, shot)
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
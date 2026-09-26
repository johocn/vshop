# -*- coding: utf-8 -*-
"""D47 验收：TenantMember 换键错位（User.id → Administrator.id）两态取证。

背景：`ctx.activeUserId` / `session.user.id` 是 **User.id**，而 `tenant_member.administratorId`
存的是 **Administrator.id**（生产实证：administrator.id=53 / user.id=15 / member.administratorId='53'）。
直接用 User.id 去匹配 administratorId 的查询**恒不匹配且不报错**，历史上分叉出两处缺陷：

  G1（高）`my-access.resolver.ts:52`：memberRows 恒空 → `memberEnabled` 恒 true、`mustChangePassword`
     恒 false。而 D45 已修好的守卫（`tenant-enabled.guard`）在 mustChangePassword=true 时会 403 掉
     除白名单外的**全部** admin 请求 → 成员看到的是「到处报错、却没有任何改密入口」的界面。
  G2（中）`pick-batch.admin.resolver.currentOperator`：两步都用 User.id 匹配 → 恒返回 null，
     租户账号创建的拣货批次「创建人」永远为空。

修复（D47）：新增 `tenant/resolve-tenant-member.ts`（User.id → Administrator → TenantMember 的唯一实现），
三处调用点（my-access / pick-batch / tenant-enabled.guard）全部收敛到它。

两态断言：
  suite=g1（fixture：把 t2 成员 48 的 mustChangePassword 置 true）
    before（旧后端）
      ① 接口层 myTenantAccess.mustChangePassword = false（缺陷：库里是 true 却读到 false）
      ② 守卫层 pickBatches 已 403（证明守卫侧正常，前后端判断失配 → 用户无处可去）
      ③ UI 登录后**不跳**改密页（hash 不含 change-password）
    after（新后端）
      ① 接口层 mustChangePassword = true（含 channel 级）
      ② 守卫层仍 403（不回归）
      ③ UI 登录后**跳转** /pages/change-password/index（缺陷态不可达）
    baseline（fixture 还原 mustChangePassword=false）
      ① 接口层 = false；② pickBatches 正常返回（守卫不误伤）；③ 登录后进后台非改密页
  suite=g2（fixture：无，直接以租户账号建一个可删批次）
    before ① detail.createdBy 为 null（缺陷）→ UI「创建人」显示 —
    after  ① detail.createdBy = 成员 displayName（默认「田经理」）→ UI「创建人」有值

三态共有：手机视口截图 390×844 @dpr2；无 pageerror。

fixture 变更（本脚本不自动改库，需在跑之前手动执行；跑后必须还原）：
    -- 置位（g1 before/after 前置）：
    UPDATE tenant_member SET "mustChangePassword"=true WHERE id=48;
    -- 还原（g1 baseline 与 g2 前置）：
    UPDATE tenant_member SET "mustChangePassword"=false WHERE id=48;
    -- g2 清理（跑完 after 后，批次为可删测试数据；orderId 无外键约束，直接删两表）：
    -- 注意 pick_batch."tenantChannelId" 存的是**渠道 id**（t2 = 37），不是渠道 token/代码
    DELETE FROM pick_batch_order WHERE "batchId" IN
      (SELECT id FROM pick_batch WHERE note LIKE 'D47验收%');
    DELETE FROM pick_batch WHERE note LIKE 'D47验收%';

环境变量：WA_D47_SUITE(g1|g2)、WA_D47_STATE(before|after|baseline)、WA_D47_BASE、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD、WA_D47_CHANNEL(t2)、WA_D47_ORDER_IDS(逗号分隔，默认 153)、
  WA_D47_STOCK_LOCATION(默认 3)、WA_D47_CREATOR_NAME(默认 田经理)、WA_D47_TAG(截图后缀)
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

BASE = os.environ.get('WA_D47_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D47_CHANNEL', 't2')
SUITE = os.environ.get('WA_D47_SUITE', 'g1').strip().lower()
STATE = os.environ.get('WA_D47_STATE', 'after').strip().lower()
TAG = os.environ.get('WA_D47_TAG', '%s-%s-' % (SUITE, STATE))
ORDER_IDS = [int(x) for x in os.environ.get('WA_D47_ORDER_IDS', '153').split(',') if x.strip()]
STOCK_LOCATION = int(os.environ.get('WA_D47_STOCK_LOCATION', '3'))
CREATOR_NAME = os.environ.get('WA_D47_CREATOR_NAME', '田经理')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
CHG_PAGE = 'pages/change-password/index'
BATCH_PAGE = 'pages/order/picking/batch'
NOTE = 'D47验收临时批次（可忽略）'

FAILS = []


def info(msg):
    print('  %s' % msg)


def check(name, ok, detail=''):
    print('%s %s%s' % ('PASS' if ok else 'FAIL', name, (' | %s' % detail) if detail else ''))
    if not ok:
        FAILS.append(name)


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


def is_forbidden(msg):
    """守卫 ForbiddenError 的文案（baseline 态同一查询可读，故该错误即守卫拦截）。"""
    m = str(msg or '').lower()
    return 'forbid' in m or 'not currently authorized' in m


def login_api():
    tok, r = api('mutation($u:String!,$p:String!,$e:Boolean){login(username:$u,password:$p,rememberMe:$e)'
                 '{... on CurrentUser{id identifier}}}', {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        print('ENV-FAIL: 租户账号登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    return tok


def tenant_token(tok):
    _, r = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL_CODE), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (CHANNEL_CODE, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return ch['token']


def probe_access(tok, channel=None):
    """读 myTenantAccess：顶层 mustChangePassword + 每个 channel 的 memberEnabled / mustChangePassword。"""
    _, r = api('query{myTenantAccess{isSuperAdmin mustChangePassword channels{id code token enabled memberEnabled mustChangePassword}}}',
               token=tok, channel=channel)
    if gerr(r) or not (r.get('data') or {}).get('myTenantAccess'):
        print('ENV-FAIL: myTenantAccess 不可用 %s' % (gerr(r) or json.dumps(r, ensure_ascii=False)[:200]))
        raise SystemExit(2)
    return (r['data'] or {}).get('myTenantAccess')


def probe_guard(tok, ctoken):
    """守卫探测：mustChangePassword=true 时期望被 403，正常时期望拿到数据。"""
    _, r = api('query{myTenantAccess{mustChangePassword}}', token=tok, channel=ctoken)
    access = (r.get('data') or {}).get('myTenantAccess')
    _, r2 = api('query{orders(options:{take:1}){totalItems}}', token=tok, channel=ctoken)
    msg = gerr(r2)
    total = ((r2.get('data') or {}).get('orders') or {}).get('totalItems')
    return msg, total, access is not None


def read_batch(tok, ctoken, batch_id):
    _, r = api('query($id:ID!){pickBatch(id:$id){id code createdBy state note}}',
               {'id': str(batch_id)}, token=tok, channel=ctoken)
    if gerr(r):
        return None, gerr(r)
    return (r.get('data') or {}).get('pickBatch'), None


def ui_login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)
    time.sleep(1.5)


def hash_of(pg):
    try:
        return pg.evaluate('() => location.hash || ""')
    except Exception:  # noqa: BLE001
        return ''


def shot(pg, name, target=None):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-d47-%s.png' % name)
    try:
        (target or pg).screenshot(path=str(f))
    except Exception:  # noqa: BLE001
        pg.screenshot(path=str(f))
    check('截图 %s' % f.name, f.exists() and f.stat().st_size > 4000,
          '%dB' % (f.stat().st_size if f.exists() else 0))
    return f


def run_g1(tok, ctoken):
    access = probe_access(tok)
    chans = {c['code']: c for c in (access.get('channels') or [])}
    t2 = chans.get(CHANNEL_CODE) or {}
    info('myTenantAccess：顶层 mustChangePassword=%s；%s 渠道 memberEnabled=%s / mustChangePassword=%s'
         % (access.get('mustChangePassword'), CHANNEL_CODE, t2.get('memberEnabled'), t2.get('mustChangePassword')))

    if STATE in ('before', 'after'):
        want = STATE == 'after'
        check('① 接口层 mustChangePassword = %s（%s）' % (want, '缺陷态为 false，与库中 true 不符' if not want else '与库中 fixture true 一致'),
              access.get('mustChangePassword') is want and t2.get('mustChangePassword') is want,
              '顶层 %s / %s 渠道 %s' % (access.get('mustChangePassword'), CHANNEL_CODE, t2.get('mustChangePassword')))
        msg, total, _ = probe_guard(tok, ctoken)
        check('② 守卫层：mcp=true 时其它 admin 查询被 403（守卫侧正常，不因 D47 回归）',
              is_forbidden(msg), 'orders 返回 msg=%r / totalItems=%r' % (msg, total))
    else:
        check('① 接口层 mustChangePassword = False（fixture 已还原为 false）',
              access.get('mustChangePassword') is False and t2.get('mustChangePassword') is False,
              '顶层 %s / %s 渠道 %s' % (access.get('mustChangePassword'), CHANNEL_CODE, t2.get('mustChangePassword')))
        msg, total, _ = probe_guard(tok, ctoken)
        check('② 守卫层：正常账号 orders 可读（守卫不误伤）', msg is None and total is not None,
              'msg=%r / totalItems=%r' % (msg, total))
    check('②b memberEnabled 为真实值（该成员 enabled=true）', t2.get('memberEnabled') is True,
          '实际 %s' % t2.get('memberEnabled'))

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        ui_login(pg)
        if STATE == 'after':
            try:
                pg.wait_for_function("() => (location.hash || '').indexOf('%s') >= 0" % CHG_PAGE, timeout=20000)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(1.0)
        h = hash_of(pg)
        info('登录后 hash = %s' % h)
        if STATE in ('before', 'after'):
            check('③ UI：登录后%s改密页' % ('跳转' if STATE == 'after' else '不跳'),
                  (CHG_PAGE in h) is (STATE == 'after'),
                  'hash=%s（缺陷态：接口全 403 却停在此页，无改密入口）' % h)
        else:
            check('③ UI：正常登录进后台（非改密页）', CHG_PAGE not in h, 'hash=%s' % h)
        if STATE == 'before':
            # 缺陷态补充：带着 t2 渠道直接进看板，取证「接口全 403、页面无从下手」
            pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                        [CHANNEL_CODE, ctoken])
            pg.goto(BASE + '#/pages/data/dashboard/index', wait_until='domcontentloaded', timeout=60000)
            try:
                pg.locator('text=销售趋势').first.wait_for(state='visible', timeout=40000)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(3)
            body = pg.inner_text('body')
            # 断言以 DOM 为准（控制台 403 是异步陆续到达的，轮询不可靠）；② 已在接口层证明 403
            check('④ 缺陷态佐证：看板卡片全空（接口 403 → 只有占位「暂无数据」，无改密入口）',
                  '暂无数据' in body, '页面文本片段=%r' % body[:80].replace('\n', ' '))
            auth_errs = [e for e in errs if '403' in e or 'forbid' in e.lower() or 'authoriz' in e.lower()]
            info('控制台 403 相关错误 %d 条（异步到达，仅作佐证）' % len(auth_errs))
            shot(pg, TAG + 'g1-dashboard-blocked')
        else:
            shot(pg, TAG + 'g1-after-login')
        check('⑤ 无页面级 JS 错误（pageerror）', not [e for e in errs if e.startswith('PAGEERR')],
              '%d 条 pageerror' % len([e for e in errs if e.startswith('PAGEERR')]))
        for e in errs[:5]:
            print('     ↳ %s' % e[:180])
        b.close()


def run_g2(tok, ctoken):
    if STATE not in ('before', 'after'):
        print('ENV-FAIL: suite=g2 仅支持 before / after')
        raise SystemExit(2)
    _, r = api('mutation($input:CreatePickBatchInput!){createPickBatch(input:$input){id code createdBy state note}}',
               {'input': {'stockLocationId': str(STOCK_LOCATION), 'orderIds': [str(i) for i in ORDER_IDS], 'note': NOTE}},
               token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        print('ENV-FAIL: createPickBatch 传输失败 %s' % str(r['TRANSPORT'])[:200])
        raise SystemExit(2)
    if gerr(r):
        print('ENV-FAIL: createPickBatch 失败 %s' % gerr(r))
        raise SystemExit(2)
    batch = (r.get('data') or {}).get('createPickBatch') or {}
    bid = batch.get('id')
    info('createPickBatch → id=%s code=%s createdBy=%r' % (bid, batch.get('code'), batch.get('createdBy')))

    if STATE == 'before':
        check('① 接口层 detail.createdBy 为空（缺陷：租户账号创建的批次恒无创建人）',
              not batch.get('createdBy'), '实际 %r' % batch.get('createdBy'))
    else:
        check('① 接口层 detail.createdBy = %s（缺陷态为 null）' % CREATOR_NAME,
              (batch.get('createdBy') or '') == CREATOR_NAME, '实际 %r' % batch.get('createdBy'))
    detail, derr = read_batch(tok, ctoken, bid)
    check('①b pickBatch 详情与创建返回一致', derr is None and (detail or {}).get('createdBy') == batch.get('createdBy'),
          'detail.createdBy=%r / err=%r' % ((detail or {}).get('createdBy'), derr))

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        ui_login(pg)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [CHANNEL_CODE, ctoken])
        pg.goto(BASE + '#/' + BATCH_PAGE + '?id=' + str(bid), wait_until='domcontentloaded', timeout=60000)
        card = pg.locator('.card.head').first
        card.wait_for(state='visible', timeout=60000)
        time.sleep(1.5)
        row = card.locator('.kv', has=pg.locator('.k')).filter(has_text='创建人').first
        shown = (row.locator('.v').inner_text() or '').strip() if row.count() else ''
        info('UI 批次详情「创建人」显示 = %r' % shown)
        if STATE == 'before':
            check('② UI：创建人显示占位「—」（缺陷）', shown in ('—', '-', ''), '实际 %r' % shown)
        else:
            check('② UI：创建人显示 %s（缺陷态为 —）' % CREATOR_NAME, shown == CREATOR_NAME, '实际 %r' % shown)
        shot(pg, TAG + 'g2-batch-created-by', card)
        check('③ 无页面级 JS 错误（pageerror）', not [e for e in errs if e.startswith('PAGEERR')],
              '%d 条 pageerror' % len([e for e in errs if e.startswith('PAGEERR')]))
        b.close()


def main():
    if SUITE not in ('g1', 'g2'):
        print('ENV-FAIL: WA_D47_SUITE 必须是 g1 / g2，当前 %r' % SUITE)
        raise SystemExit(2)
    if STATE not in ('before', 'after', 'baseline'):
        print('ENV-FAIL: WA_D47_STATE 必须是 before / after / baseline，当前 %r' % STATE)
        raise SystemExit(2)
    tok = login_api()
    ctoken = tenant_token(tok)
    info('suite=%s state=%s 渠道 %s token=%s' % (SUITE, STATE, CHANNEL_CODE, ctoken))
    if SUITE == 'g1':
        run_g1(tok, ctoken)
    else:
        run_g2(tok, ctoken)

    if FAILS:
        print('\n== 结果（%s/%s）：%d 项失败 ==\n失败项：%s' % (SUITE, STATE, len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果（%s/%s）：全部通过 ==' % (SUITE, STATE))
    raise SystemExit(0)


if __name__ == '__main__':
    main()

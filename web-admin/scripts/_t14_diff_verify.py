# -*- coding: utf-8 -*-
"""Task 14 差异页与过账 · 本地端到端验证（手机视口 390x844 / dpr=2 / touch）

前置：
  1) 本地 vendure：packages/dev-server 下 `npm run dev:server` + `npm run dev:worker`（localhost:3000）
  2) 本地 web-admin dev server：VITE_API_URL=http://localhost:3000，端口 5281

只写本地库；末尾复位被改库存、删除临时账号/角色，并打印演示任务 id（POSTED 终态不可取消）。
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_BASE', 'http://localhost:5281/guanli/')
SHOTS = os.environ.get('WA_SHOTS', r'd:\zhao\vshop\web-admin\src\static\manual\shots')
LOC = os.environ.get('WA_LOC', '1')
CHANNEL_CODE = os.environ.get('WA_CHANNEL', 'shop-a')
USER = os.environ.get('WA_USER', 'superadmin')
PWD = os.environ.get('WA_PWD', 'superadmin')

LIMITED_EMAIL = 'e2e-nopost@test.local'
LIMITED_PWD = 'e2e-test-1234'

FAILS = []
ERRS = []
PASS_N = 0

# 已知既有缺口（不计入本次失败，但照实打印）：受限账号（仅 ReadCatalog）登录后落到工作台，
# 工作台的 dashboardOverview 必然 FORBIDDEN 且未做降级 → 控制台报错。属计划 Task 15「前端权限消费」范畴。
KNOWN_ERRS = ('loadKpis failed',)


def check(name, ok, detail=''):
    global PASS_N
    print(('  OK  ' if ok else '  FAIL') + ' ' + name + ((' :: ' + str(detail)) if detail else ''))
    if ok:
        PASS_N += 1
    else:
        FAILS.append(name + ((' :: ' + str(detail)) if detail else ''))


def shot(pg, name):
    path = os.path.join(SHOTS, 't14_diff_%s.png' % name)
    pg.screenshot(path=path)
    print('  shot  %s' % path)


def gql(pg, q, v=None):
    """页面内同源打 /admin-api（vite 代理到本地 3000），带会话与渠道头。"""
    return pg.evaluate(
        """async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token') || '';
      const ct = localStorage.getItem('wa_channel_token') || '';
      const h = { 'Content-Type': 'application/json' };
      if (t) h['Authorization'] = 'Bearer ' + t;
      if (ct) h['vendure-token'] = ct;
      const r = await fetch('/admin-api', { method: 'POST', headers: h, body: JSON.stringify({ query: q, variables: v || {} }) });
      const nt = r.headers.get('vendure-auth-token');
      if (nt) localStorage.setItem('wa_auth_token', nt);
      return await r.json();
    }""",
        [q, v or {}],
    )


def data(pg, q, v=None, tag=''):
    d = gql(pg, q, v)
    if d.get('errors'):
        check(tag or 'GraphQL 无报错', False, str(d['errors'])[:300])
        return None
    return d.get('data')


def login_ui(pg, user, pwd):
    pg.goto(BASE + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.goto(BASE + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_selector('input', timeout=40000)
    pg.locator('uni-input input').nth(0).fill(user)
    pg.locator('uni-input input').nth(1).fill(pwd)
    pg.locator('.btn').first.click()
    pg.wait_for_selector('.pick .item', timeout=45000)
    items = pg.locator('.pick .item')
    target = None
    for i in range(items.count()):
        if CHANNEL_CODE in (items.nth(i).inner_text() or ''):
            target = items.nth(i)
            break
    (target or items.first).click()
    pg.wait_for_timeout(2000)
    tok = pg.evaluate("() => [localStorage.getItem('wa_auth_token'), localStorage.getItem('wa_channel_token'), localStorage.getItem('wa_channel_code')]")
    return tok


def open_diff(pg, tid):
    """带 search 破缓存强制整页加载（同文档 hash 变化不会重挂载页面实例）。"""
    pg.goto(BASE + '?cb=%d#/pages/inventory/stocktake/diff?taskId=%s' % (int(time.time() * 1000), tid),
            wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_selector('.postbar .main', timeout=40000)
    pg.wait_for_timeout(2000)


def soft(pg, sel):
    return (pg.locator(sel).first.inner_text() or '').strip() if pg.locator(sel).count() else ''


def tap(pg, sel):
    """uni-app H5 的自定义元素用 dispatch 触发 click（@tap 在 H5 上就是 click）。"""
    pg.locator(sel).first.dispatch_event('click')
    pg.wait_for_timeout(600)


def is_off(loc, tag='btn', verbose=True):
    """uni-button 不是原生 button，Playwright 的 is_disabled() 不认，改读属性/计算样式。"""
    n = loc.count()
    vals = [loc.nth(i).get_attribute('disabled') for i in range(n)]
    if verbose:
        ops = [loc.nth(i).evaluate('el => getComputedStyle(el).opacity') for i in range(n)]
        tags = [loc.nth(i).evaluate('el => el.tagName') for i in range(n)]
        print('  debug[%s] count=%d disabled=%s opacity=%s tag=%s' % (tag, n, vals, ops, tags))
    v = vals[0] if vals else None
    return v not in (None, 'false', '')


def wait_enabled(loc, tries=12, tag='wait'):
    """等按钮从 disabled 变为可点（Vue 更新 + uni-button 属性同步非同一 tick）。"""
    for _ in range(tries):
        if not is_off(loc, tag, verbose=False):
            return True
        loc.page.wait_for_timeout(250)
    is_off(loc, tag, verbose=True)
    return False


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        )
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: ERRS.append('pageerror: %s' % e))
        pg.on('console', lambda m: ERRS.append('console.error: %s' % m.text) if m.type == 'error' else None)

        # ---------------------------------------------------------- 0. 登录 + 选店
        tok = login_ui(pg, USER, PWD)
        check('登录成功并落库会话令牌', bool(tok[0]) and bool(tok[1]) and tok[2] == CHANNEL_CODE, tok)

        # ---------------------------------------------------------- 1. 造演示任务（本地）
        chans = data(pg, '{ myTenantAccess { channels { id code } } }', tag='取渠道失败')
        cid = next((c['id'] for c in (chans or {}).get('myTenantAccess', {}).get('channels', []) if c['code'] == CHANNEL_CODE), None)
        check('拿到渠道 %s 的 id' % CHANNEL_CODE, bool(cid), cid)

        # 预清理：取消上一轮遗留的演示任务，并把其行账面复位回建任务快照（幂等可重跑）
        old = data(pg, '{ stocktakeTasks(options: { activityCode: "T14", page: 1, pageSize: 50 }) { items { id state } } }',
                   tag='取旧演示任务失败')
        for o in ((old or {}).get('stocktakeTasks') or {}).get('items', []):
            if o['state'] in ('POSTED', 'CANCELLED'):
                continue
            ls = data(pg, '{ stocktakeExpectedLines(taskId: "%s", pageSize: 500) { items { variantId bookQty } } }' % o['id'],
                      tag='取旧应盘行失败')['stocktakeExpectedLines']['items']
            for l in ls:
                gql(pg, 'mutation { setVariantStock(productVariantId: "%s", stockLocationId: "%s", stockOnHand: %d) }'
                    % (l['variantId'], LOC, l['bookQty']))
            gql(pg, 'mutation { cancelStocktakeTask(taskId: "%s") { id state } }' % o['id'])
            print('  预清理遗留任务 %s（复位 %d 行账面并取消）' % (o['id'], len(ls)))

        # 预清理：上一轮遗留的「无过账」临时账号与角色
        mems = (data(pg, '{ tenantMembers { id displayName } }', tag='取成员失败') or {}).get('tenantMembers') or []
        for m in mems:
            if 'E2E 无过账' in str(m.get('displayName') or ''):
                gql(pg, 'mutation { deleteTenantAdministrator(id: "%s") }' % m['id'])
                print('  预清理遗留受限账号 member=%s' % m['id'])
        # createTenantAdministrator 按邮箱判重，而删成员只解关联不删账号本体 → 必须按邮箱清掉残留 Administrator
        for a in (data(pg, '{ administrators { items { id emailAddress } } }', tag='取后台账号失败') or {}).get('administrators', {}).get('items', []):
            if str(a.get('emailAddress') or '').lower() == LIMITED_EMAIL:
                gql(pg, 'mutation { deleteAdministrator(id: "%s") { result message } }' % a['id'])
                print('  预清理遗留后台账号 %s' % a['id'])
        roles = (data(pg, '{ roles { items { id code } } }', tag='取角色失败') or {}).get('roles', {}).get('items') or []
        for r in roles:
            if str(r.get('code') or '').startswith('E2E-NOPOST'):
                gql(pg, 'mutation { deleteTenantRole(roleId: "%s") }' % r['id'])
                print('  预清理遗留角色 %s' % r['code'])

        created = data(pg, 'mutation { createStocktakeTask(input: { stockLocationId: "%s", name: "T14-DIFF", activityCode: "T14" }) '
                           '{ id code state waveCount expectedTotal } }' % LOC, tag='建任务失败')
        task = (created or {}).get('createStocktakeTask')
        check('建演示任务成功', bool(task) and task['waveCount'] > 0, task)
        if not task:
            browser.close()
            return report()
        tid = task['id']

        waves = data(pg, '{ stocktakeWaves(taskId: "%s") { id scopeType zoneCode state expectedCount } }' % tid,
                     tag='取盘次失败')['stocktakeWaves']
        print('  盘次:', [(w['id'], w['scopeType'], w['expectedCount']) for w in waves])

        # 选一个被测行（取第一个有变体的盘次的第一行）
        target = None
        for w in waves:
            ls = data(pg, '{ stocktakeExpectedLines(taskId: "%s", waveId: "%s", pageSize: 500) { items { id variantId variantSku bookQty } } }'
                      % (tid, w['id']), tag='取应盘行失败')['stocktakeExpectedLines']['items']
            w['_lines'] = ls
            if ls and target is None:
                target = ls[0]
        check('演示任务有应盘行', bool(target), target)
        if not target:
            browser.close()
            return report()
        vid, tid_line = target['variantId'], target['id']

        lv = data(pg, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC,
                  tag='取账面失败')['stockLevels']['items']
        book0 = next((i['stockOnHand'] for i in lv if str(i['productVariantId']) == str(vid)), 0)
        print('  被测变体 %s(%s) 盘点前账面=%s' % (target['variantSku'], vid, book0))

        # 制造账面变动（盘点期间改账）→ 触发 recheck；同时留下快照=book0
        book_new = book0 + 5
        counted = book_new - 1
        data(pg, 'mutation { setVariantStock(productVariantId: "%s", stockLocationId: "%s", stockOnHand: %d) }' % (vid, LOC, book_new),
             tag='改账面失败')
        check('盘中账面已变动（book %s → %s）' % (book0, book_new), True, '为 recheck 用例制造条件')

        # ---------------------------------------------------------- 2. 逐盘次认领 / 录入 / 提交 → COUNTED
        for idx, w in enumerate(waves):
            cl = data(pg, 'mutation { claimStocktakeWave(waveId: "%s") { id state } }' % w['id'], tag='认领失败')
            if idx == 0:
                check('盘次认领成功', bool(cl) and cl['claimStocktakeWave']['state'] in ('CLAIMED', 'COUNTING'), cl)
            if idx == 0 and w['_lines']:
                sv = data(pg, 'mutation { saveStocktakeCounts(waveId: "%s", inputs: [{ lineId: "%s", countedQty: %d }]) { id state countedCount } }'
                          % (w['id'], tid_line, counted), tag='录入失败')
                check('录入成功（实盘 %d vs 账面 %d）' % (counted, book_new), bool(sv) and sv['saveStocktakeCounts']['state'] == 'COUNTING', sv)
            sb = data(pg, 'mutation { submitStocktakeWave(waveId: "%s") { id state } }' % w['id'], tag='提交失败')
            check('提交盘次 %s' % w['id'], bool(sb) and sb['submitStocktakeWave']['state'] == 'SUBMITTED', sb)

        st = data(pg, '{ stocktakeTask(id: "%s") { state } }' % tid, tag='取任务状态失败')['stocktakeTask']['state']
        check('全部盘次已提交 → 任务 COUNTED', st == 'COUNTED', st)

        d = data(pg, '{ stocktakeDiff(taskId: "%s") { expectedTotal countedTotal uncountedCount extraCount diffCount recheck '
                     'rows { variantSku countedTotal bookQty diff } changedVariants { variantSku snapBookQty currentBookQty } } }' % tid,
                 tag='取差异失败')['stocktakeDiff']
        print('  差异:', {k: d[k] for k in ('expectedTotal', 'countedTotal', 'uncountedCount', 'extraCount', 'diffCount', 'recheck')})
        check('差异含未盘项', d['uncountedCount'] > 0, d['uncountedCount'])
        check('差异含被测行的 -1 差异', any(str(r['variantSku']) == str(target['variantSku']) and r['diff'] == -1 for r in d['rows']), d['rows'][:3])
        check('recheck 为真（快照 %s → 当前 %s）' % (book0, book_new), d['recheck'] is True, d['changedVariants'])

        # ---------------------------------------------------------- 3. 差异页：摘要 / 未盘门控
        open_diff(pg, tid)
        cells = pg.locator('.sum .cell')
        check('四宫格摘要存在（4 格）', cells.count() == 4, cells.count())
        nums = [cells.nth(i).inner_text().strip() for i in range(cells.count())] if cells.count() == 4 else []
        print('  摘要原文:', nums)
        shot(pg, 'summary')

        btn = pg.locator('.postbar .main')
        check('未盘且未勾选 → 过账按钮置灰', is_off(btn), btn.get_attribute('disabled'))
        check('未盘块折叠开关存在', pg.locator('.blk .bh').count() > 0, pg.locator('.blk .bh').count())
        tap(pg, '.blk .bh')
        check('展开后未盘清单可见', pg.locator('.urow').count() > 0, pg.locator('.urow').count())
        shot(pg, 'uncounted_expanded')
        check('账面变动提示条可见', pg.locator('.recheck').count() > 0, soft(pg, '.recheck .rt')[:80])

        # ---------------------------------------------------------- 4. 勾选跳过 → 按钮可点
        tap(pg, '.skip')
        check('勾选「确认跳过 N 项未盘」后按钮可点', wait_enabled(btn, tag='after-skip'), btn.get_attribute('disabled'))
        check('勾选框进入选中态', pg.locator('.skip .box.on').count() > 0, pg.locator('.skip .box.on').count())
        shot(pg, 'skip_checked')

        # ---------------------------------------------------------- 5. 过账：被拦 → 二次确认 → 成功
        tap(pg, '.postbar .main')
        pg.wait_for_selector('.uni-modal__bd', timeout=20000)
        modal = soft(pg, '.uni-modal__bd')
        print('  二次确认弹窗:', modal.replace('\n', ' | '))
        check('账面变动被拦并弹二次确认', '账面已变动' in modal, modal[:120])
        shot(pg, 'confirm_modal')
        pg.locator('.uni-modal__btn').nth(1).dispatch_event('click')
        seen_toast = False
        for _ in range(24):
            pg.wait_for_timeout(250)
            if '过账完成' in pg.content():
                seen_toast = True
                break
        check('过账成功 toast「过账完成」', seen_toast, '')
        shot(pg, 'post_done')

        st2 = data(pg, '{ stocktakeTask(id: "%s") { state postedStockDocId } }' % tid, tag='取任务状态失败')['stocktakeTask']
        check('任务已 POSTED 且生成盘点单据', st2['state'] == 'POSTED' and bool(st2['postedStockDocId']), st2)
        lv2 = data(pg, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC,
                   tag='取账面失败')['stockLevels']['items']
        now = next((i['stockOnHand'] for i in lv2 if str(i['productVariantId']) == str(vid)), None)
        check('过账后被测变体账面=实盘值 %s' % counted, now == counted, 'now=%s' % now)

        # ---------------------------------------------------------- 6. 重复过账（幂等保护）
        open_diff(pg, tid)
        btn2 = pg.locator('.postbar .main')
        check('已过账 → 按钮置灰', is_off(btn2), btn2.get_attribute('disabled'))
        reason = soft(pg, '.postbar .block')
        check('已过账 → 提示「不可重复过账」', '已过账' in reason, reason)
        shot(pg, 'posted_reenter')

        # ---------------------------------------------------------- 7. 无过账权限账号（能盘≠能过账）
        role = data(pg, 'mutation { createTenantRole(channelId: "%s", input: { code: "E2E-NOPOST", description: "E2E 无过账", '
                        'permissions: ["ReadCatalog"] }) { id code } }' % cid, tag='建角色失败')
        role_id = (role or {}).get('createTenantRole', {}).get('id')
        check('建「无过账」角色成功', bool(role_id), role)
        mem = data(pg, 'mutation { createTenantAdministrator(channelId: "%s", input: { emailAddress: "%s", password: "%s", '
                       'displayName: "E2E 无过账", roleIds: ["%s"] }) { id administratorId } }' % (cid, LIMITED_EMAIL, LIMITED_PWD, role_id),
                   tag='建账号失败')
        mem_id = (mem or {}).get('createTenantAdministrator', {}).get('id')
        check('建受限账号成功', bool(mem_id), mem)

        tok2 = login_ui(pg, LIMITED_EMAIL, LIMITED_PWD)
        check('受限账号登录并选店', bool(tok2[0]) and tok2[2] == CHANNEL_CODE, tok2)
        open_diff(pg, tid)
        btn3 = pg.locator('.postbar .main')
        check('无 StocktakePost → 按钮置灰', is_off(btn3), btn3.get_attribute('disabled'))
        reason3 = soft(pg, '.postbar .block')
        check('无 StocktakePost → 提示「无过账权限」', '无过账权限' in reason3, reason3)
        shot(pg, 'no_permission')

        # 后端二次确认（前端门控之外，服务端也必须拒绝）
        denied = gql(pg, 'mutation { postStocktake(taskId: "%s", confirm: true) { ok } }' % tid)
        check('服务端同样拒绝受限账号过账', bool(denied.get('errors')), str(denied.get('errors'))[:160])

        # ---------------------------------------------------------- 8. 复位与清理（先切回超管会话）
        login_ui(pg, USER, PWD)
        data(pg, 'mutation { setVariantStock(productVariantId: "%s", stockLocationId: "%s", stockOnHand: %d) }' % (vid, LOC, book0),
             tag='复位失败')
        back = data(pg, '{ stockLevels(locationId: "%s", page: 1, pageSize: 2000) { items { productVariantId stockOnHand } } }' % LOC,
                    tag='复位校验失败')
        rb = next((i['stockOnHand'] for i in (back or {}).get('stockLevels', {}).get('items', [])
                   if str(i['productVariantId']) == str(vid)), None)
        check('被测变体账面已复位为 %s' % book0, rb == book0, 'now=%s' % rb)

        # 受限账号/角色清理（成员解关联 + 账号本体按邮箱删除，避免邮箱被占导致下轮建号失败）
        data(pg, 'mutation { deleteTenantAdministrator(id: "%s") }' % mem_id, tag='删账号失败')
        for a in (data(pg, '{ administrators { items { id emailAddress } } }', tag='取后台账号失败') or {}).get('administrators', {}).get('items', []):
            if str(a.get('emailAddress') or '').lower() == LIMITED_EMAIL:
                gql(pg, 'mutation { deleteAdministrator(id: "%s") { result message } }' % a['id'])
                print('  已清理后台账号本体 %s' % a['id'])
        data(pg, 'mutation { deleteTenantRole(roleId: "%s") }' % role_id, tag='删角色失败')
        print('\n[演示数据] taskId=%s code=%s postedStockDocId=%s 被测变体=%s(%s) 复位目标=%s'
              % (tid, task['code'], (st2 or {}).get('postedStockDocId'), target['variantSku'], vid, book0))

        browser.close()
    return report()


def report():
    known = [e for e in ERRS if any(k in e for k in KNOWN_ERRS)]
    real = [e for e in ERRS if not any(k in e for k in KNOWN_ERRS)]
    print('\n结果: PASS=%d FAIL=%d' % (PASS_N, len(FAILS)))
    if known:
        print('已知既有问题 %d 条（不计入失败，见脚本 KNOWN_ERRS 注释）:' % len(known))
        for e in known[:3]:
            print('  ' + e[:200])
    if real:
        print('运行时异常 %d 条:' % len(real))
        for e in real[:10]:
            print('  ' + e[:300])
    for f in FAILS:
        print('  FAILED: ' + f)
    sys.exit(1 if FAILS or real else 0)


if __name__ == '__main__':
    main()
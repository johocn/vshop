# -*- coding: utf-8 -*-
"""Task 15 前端权限消费（菜单门控 / 词条 / 入口）· 本地端到端验证（手机视口 390x844 / dpr=2 / touch）

前置：
  1) 本地 vendure：packages/dev-server 下 `npm run dev:server` + `npm run dev:worker`（localhost:3000）
  2) 本地 web-admin dev server：VITE_API_URL=http://localhost:3000，端口 5281

只写本地库；末尾删除临时账号（按邮箱清 Administrator 本体）与临时角色，不改动任何内置角色。
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_BASE', 'http://localhost:5281/guanli/')
SHOTS = os.environ.get('WA_SHOTS', r'd:\zhao\vshop\web-admin\src\static\manual\shots')
CHANNEL_CODE = os.environ.get('WA_CHANNEL', 'shop-a')
USER = os.environ.get('WA_USER', 'superadmin')
PWD = os.environ.get('WA_PWD', 'superadmin')

A_SALES = 'e2e-t15-sales@test.local'
A_STOCK = 'e2e-t15-stock@test.local'
A_NOREAD = 'e2e-t15-noread@test.local'
T_PWD = 'e2e-test-1234'
ROLE_NOREAD = 'E2E-T15-NOREAD'
ROLE_STOCK = 'E2E-T15-STOCK'

DOMAIN = '商品'          # menu.domain.product 的中文域标题（库存菜单挂在「商品」域）
ITEM_NEW = '协同盘库'     # menu.stocktakeTask
ITEM_OLD = '快捷盘点'     # menu.stocktake（改名后）

FAILS = []
ERRS = []
PASS_N = 0

# 已知既有缺口（不计入本次失败）：受限账号落工作台时 dashboardOverview 必然 FORBIDDEN 且未做降级。
KNOWN_ERRS = ('loadKpis failed',)


def check(name, ok, detail=''):
    global PASS_N
    print(('  OK  ' if ok else '  FAIL') + ' ' + name + ((' :: ' + str(detail)) if detail else ''))
    if ok:
        PASS_N += 1
    else:
        FAILS.append(name + ((' :: ' + str(detail)) if detail else ''))


def shot(pg, name):
    path = os.path.join(SHOTS, 't15_menu_%s.png' % name)
    pg.screenshot(path=path)
    print('  shot  %s' % path)


def gql(pg, q, v=None):
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


def login_ui(pg, user, pwd, land='dashboard'):
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
    pg.wait_for_timeout(2500)
    if land == 'dashboard':
        pg.wait_for_selector('.sec .sec-t', timeout=45000)
        pg.wait_for_timeout(1200)
    return pg.evaluate("() => [localStorage.getItem('wa_auth_token'), localStorage.getItem('wa_channel_token'), localStorage.getItem('wa_channel_code')]")


def open_page(pg, hash_url, sel, timeout=45000):
    pg.goto(BASE + '?cb=%d#%s' % (int(time.time() * 1000), hash_url), wait_until='domcontentloaded', timeout=60000)
    try:
        pg.wait_for_selector(sel, timeout=timeout)
    except Exception:
        pass
    pg.wait_for_timeout(2000)


def sec_items(pg, title):
    """工作台上指定域（.sec-t 文本含 title）下的菜单项文本列表；找不到该域返回 None。"""
    secs = pg.locator('.sec')
    for i in range(secs.count()):
        st = secs.nth(i).locator('.sec-t')
        if not st.count():
            continue
        if title in (st.first.inner_text() or ''):
            tags = secs.nth(i).locator('.tag')
            return [(tags.nth(j).inner_text() or '').strip() for j in range(tags.count())]
    return None


def tag_color(pg, title, text):
    """域内指定菜单项的计算样式 color（tier1 = 实心渐变底 + 白字，tier2 = 描边 + 主色字）"""
    secs = pg.locator('.sec')
    for i in range(secs.count()):
        st = secs.nth(i).locator('.sec-t')
        if not st.count() or title not in (st.first.inner_text() or ''):
            continue
        tags = secs.nth(i).locator('.tag')
        for j in range(tags.count()):
            if (tags.nth(j).inner_text() or '').strip() == text:
                return tags.nth(j).evaluate('el => getComputedStyle(el).color')
    return None


def toast_poll(pg, needle, tries=20):
    """uni-app toast 是短生命期元素，轮询比对内容。"""
    for _ in range(tries):
        t = pg.locator('uni-toast')
        if t.count():
            txt = (t.first.inner_text() or '').replace('\n', ' ').strip()
            if needle in txt:
                return txt
            last = txt
        pg.wait_for_timeout(250)
    return None


def find_role(pg, cid, suffix):
    roles = data(pg, '{ tenantRoles(channelId: "%s") { id code description permissions } }' % cid, tag='取角色失败')
    roles = (roles or {}).get('tenantRoles') or []
    return next((r for r in roles if str(r.get('code') or '').endswith(suffix)), None), roles


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

        # ---------------------------------------------------------- 0. 超管登录 + 取渠道
        tok = login_ui(pg, USER, PWD)
        check('超管登录并落库会话令牌', bool(tok[0]) and tok[2] == CHANNEL_CODE, tok)
        chans = data(pg, '{ myTenantAccess { channels { id code } } }', tag='取渠道失败')
        cid = next((c['id'] for c in (chans or {}).get('myTenantAccess', {}).get('channels', []) if c['code'] == CHANNEL_CODE), None)
        check('拿到渠道 %s 的 id' % CHANNEL_CODE, bool(cid), cid)

        # 预清理：残留临时账号（成员解关联 + 账号本体按邮箱删除）与临时角色
        for em in (A_SALES, A_STOCK, A_NOREAD):
            for a in (data(pg, '{ administrators { items { id emailAddress } } }', tag='取后台账号失败') or {}).get('administrators', {}).get('items', []):
                if str(a.get('emailAddress') or '').lower() == em:
                    gql(pg, 'mutation { deleteAdministrator(id: "%s") { result message } }' % a['id'])
                    print('  预清理残留账号 %s' % em)
        for r in (data(pg, '{ roles { items { id code } } }', tag='取角色失败') or {}).get('roles', {}).get('items', []):
            if str(r.get('code') or '') in (ROLE_NOREAD, ROLE_STOCK):
                gql(pg, 'mutation { deleteTenantRole(roleId: "%s") }' % r['id'])
                print('  预清理残留角色 %s' % r['code'])

        # ---------------------------------------------------------- 1. 超管：库存域新入口 + 快捷盘点原样保留
        sup = sec_items(pg, DOMAIN)
        print('  超管「%s」域菜单: %s' % (DOMAIN, sup))
        check('超管可见「%s」域' % DOMAIN, sup is not None, sup)
        # 「商品」域同时挂商品与库存菜单，故「第一项」按库存段内相对次序 + tier 样式断言
        # （tier 只改样式不重排：tier1 = 实心渐变底白字，tier2 = 描边主色字）
        check('超管：新入口排在既有「%s」之前' % ITEM_OLD,
              bool(sup) and ITEM_NEW in sup and ITEM_OLD in sup and sup.index(ITEM_NEW) < sup.index(ITEM_OLD), sup)
        c_new, c_old = tag_color(pg, DOMAIN, ITEM_NEW), tag_color(pg, DOMAIN, ITEM_OLD)
        print('  tier 样式: %s=%s / %s=%s' % (ITEM_NEW, c_new, ITEM_OLD, c_old))
        check('超管：「%s」为 tier 1（实心白字）' % ITEM_NEW, c_new == 'rgb(255, 255, 255)', c_new)
        check('超管：「%s」为 tier 2（描边主色）' % ITEM_OLD, bool(c_old) and c_old != 'rgb(255, 255, 255)', c_old)
        check('超管：既有「%s」保留' % ITEM_OLD, bool(sup) and ITEM_OLD in sup, sup)
        check('超管：旧文案「盘库」已不存在', bool(sup) and '盘库' not in sup, sup)
        shot(pg, 'superadmin_dashboard')

        # ---------------------------------------------------------- 2. 角色准备（内置 sales/stock + 无读权限临时角色）
        sales_role, all_roles = find_role(pg, cid, '-sales')
        stock_role, _ = find_role(pg, cid, '-stock')
        print('  本渠道角色码: %s' % [r['code'] for r in all_roles])
        check('找到内置「销售」角色', bool(sales_role), sales_role and sales_role['code'])
        check('内置「销售」不含 StocktakeCount', bool(sales_role) and 'StocktakeCount' not in (sales_role.get('permissions') or []),
              sales_role and sales_role.get('permissions'))

        stock_has = bool(stock_role) and 'StocktakeCount' in (stock_role.get('permissions') or [])
        print('  内置「库存」角色 %s 是否含 StocktakeCount: %s' % (stock_role and stock_role['code'], stock_has))
        if not stock_has:
            # 偏差说明区 #? 已记录：改的是角色「模板」，已落库的历史角色不会自动获得新权限点。
            # 这里不改内置角色（只读），改用临时角色承载同一权限组合。
            sr = data(pg, 'mutation { createTenantRole(channelId: "%s", input: { code: "%s", description: "E2E 库存(含盘库)", permissions: ["ReadCatalog", "ReadProduct", "UpdateProduct", "ReadOrder", "StocktakeCount"] }) { id code } }'
                      % (cid, ROLE_STOCK), tag='建临时库存角色失败')
            stock_role = (sr or {}).get('createTenantRole')
            check('内置库存角色缺新权限点 → 已用临时角色替代', bool(stock_role), stock_role)

        nr = data(pg, 'mutation { createTenantRole(channelId: "%s", input: { code: "%s", description: "E2E 无读目录权限", permissions: ["ReadOrder"] }) { id code } }'
                  % (cid, ROLE_NOREAD), tag='建无读权限角色失败')
        noread_role = (nr or {}).get('createTenantRole')
        check('建「无读目录」临时角色成功', bool(noread_role), noread_role)

        acc = {}
        for key, em, role in (('sales', A_SALES, sales_role), ('stock', A_STOCK, stock_role), ('noread', A_NOREAD, noread_role)):
            m = data(pg, 'mutation { createTenantAdministrator(channelId: "%s", input: { emailAddress: "%s", password: "%s", displayName: "E2E T15 %s", roleIds: ["%s"] }) { id administratorId } }'
                     % (cid, em, T_PWD, key, role['id']), tag='建账号 %s 失败' % key)
            acc[key] = ((m or {}).get('createTenantAdministrator') or {}).get('id')
            check('建账号 %s（角色 %s）' % (key, role['code']), bool(acc[key]), acc[key])

        # ---------------------------------------------------------- 3. 销售角色：菜单看不到「协同盘库」，「快捷盘点」仍在
        login_ui(pg, A_SALES, T_PWD)
        sales = sec_items(pg, DOMAIN)
        print('  销售「%s」域菜单: %s' % (DOMAIN, sales))
        check('销售：域可见（菜单未被整块清空）', sales is not None and len(sales) > 0, sales)
        check('销售：看不到「%s」' % ITEM_NEW, bool(sales) and ITEM_NEW not in sales, sales)
        check('销售：「%s」仍在' % ITEM_OLD, bool(sales) and ITEM_OLD in sales, sales)
        shot(pg, 'sales_dashboard')

        # ---------------------------------------------------------- 4. 库存角色：能看到「协同盘库」
        login_ui(pg, A_STOCK, T_PWD)
        stockm = sec_items(pg, DOMAIN)
        print('  库存「%s」域菜单: %s' % (DOMAIN, stockm))
        check('库存：能看到「%s」' % ITEM_NEW, bool(stockm) and ITEM_NEW in stockm, stockm)
        shot(pg, 'stock_dashboard')

        # ---------------------------------------------------------- 5. 超管点「协同盘库」→ 任务看板
        login_ui(pg, USER, PWD)
        click_new = pg.locator('.sec .tag', has_text=ITEM_NEW).first
        check('超管可点到「%s」入口' % ITEM_NEW, click_new.count() > 0, click_new.count())
        click_new.dispatch_event('click')
        pg.wait_for_timeout(2500)
        url = pg.evaluate('() => location.hash')
        check('进入协同盘库看板（hash）', 'pages/inventory/stocktake/index' in url, url)
        tabs = pg.locator('.tabs .tb')
        check('看板状态 Tab 渲染', tabs.count() >= 3, tabs.count())
        check('看板「新建任务」浮动按钮存在', pg.locator('.fab').count() > 0, pg.locator('.fab').count())
        shot(pg, 'superadmin_board')

        # 既有「快捷盘点」入口仍在且行为不变（指向上级目录的既有页面）
        login_ui(pg, USER, PWD)
        click_old = pg.locator('.sec .tag', has_text=ITEM_OLD).first
        check('超管可点到「%s」入口' % ITEM_OLD, click_old.count() > 0, click_old.count())
        click_old.dispatch_event('click')
        pg.wait_for_timeout(2500)
        url_old = pg.evaluate('() => location.hash')
        check('「%s」进入既有页面（stock-doc/stocktake）' % ITEM_OLD, 'stock-doc/stocktake' in url_old and 'stocktake/index' in url_old, url_old)
        check('既有页面渲染（保存条可见）', pg.locator('.savebar .save').count() > 0, pg.locator('.savebar .save').count())
        shot(pg, 'superadmin_quick_stocktake')

        # ---------------------------------------------------------- 6. 销售直连 URL：看板可只读打开 + 服务端拒绝建任务
        login_ui(pg, A_SALES, T_PWD)
        open_page(pg, '/pages/inventory/stocktake/index', '.tabs .tb')
        check('销售直连看板 URL 不白屏（看板渲染）', pg.locator('.tabs .tb').count() >= 3, pg.locator('.tabs .tb').count())
        denied = gql(pg, 'mutation { createStocktakeTask(input: { stockLocationId: "1", name: "T15-DENY", activityCode: "T15" }) { id } }')
        check('销售建任务被服务端拒绝（无 StocktakeCount）', bool(denied.get('errors')), str(denied.get('errors'))[:200])
        shot(pg, 'sales_board_direct')

        # ---------------------------------------------------------- 7. 无读目录权限账号直连 URL：后端报错 → toast 出原文、不白屏
        login_ui(pg, A_NOREAD, T_PWD)
        open_page(pg, '/pages/inventory/stocktake/index', '.tabs .tb', timeout=12000)
        txt = toast_poll(pg, 'authorized') or toast_poll(pg, 'Forbidden') or toast_poll(pg, '权限')
        page_ok = pg.locator('.page').count() > 0 or pg.locator('uni-view').count() > 0
        print('  无读权限直连 toast: %s' % txt)
        check('无读权限直连：后端拒绝并以 toast 出原文', bool(txt), txt)
        check('无读权限直连：页面未白屏（仍有 DOM 结构）', page_ok, page_ok)
        shot(pg, 'noread_board_direct')

        # ---------------------------------------------------------- 8. 清理（切回超管会话）
        login_ui(pg, USER, PWD)
        for key, em in (('sales', A_SALES), ('stock', A_STOCK), ('noread', A_NOREAD)):
            if acc.get(key):
                data(pg, 'mutation { deleteTenantAdministrator(id: "%s") }' % acc[key], tag='删账号 %s 失败' % key)
            for a in (data(pg, '{ administrators { items { id emailAddress } } }', tag='取后台账号失败') or {}).get('administrators', {}).get('items', []):
                if str(a.get('emailAddress') or '').lower() == em:
                    gql(pg, 'mutation { deleteAdministrator(id: "%s") { result message } }' % a['id'])
                    print('  已清理账号本体 %s' % em)
        for r in (data(pg, '{ roles { items { id code } } }', tag='取角色失败') or {}).get('roles', {}).get('items', []):
            if str(r.get('code') or '') in (ROLE_NOREAD, ROLE_STOCK):
                gql(pg, 'mutation { deleteTenantRole(roleId: "%s") }' % r['id'])
                print('  已清理临时角色 %s' % r['code'])

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
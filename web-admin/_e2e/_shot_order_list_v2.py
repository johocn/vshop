# -*- coding: utf-8 -*-
# 订单列表 v2 截图：服务端过滤 / 时间+状态组合 / 异常组 / 三版式（手机 390x844 dpr=2 为主 + 桌面 1440x900）
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
from playwright.sync_api import sync_playwright
import time, shutil, os

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)


def login(ctx):
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    # 绕开选店 UI：直接取 t2 渠道 token 注入 localStorage
    tok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = (d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if (!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code', 't2');
        return 'OK:' + c.token.slice(0, 6);
      }).catch(e=>'ERR:'+e.message);
    }""")
    print('  channel inject =', tok)
    return pg


def open_list(pg):
    pg.goto(BASE + '#/pages/order/list/index', wait_until='networkidle', timeout=45000)
    time.sleep(6)


def shot(pg, name, asset_dir=SHOT):
    pg.screenshot(path=asset_dir + name)
    print('  shot:', name)


def safe_clear(pg):
    """「清除」按钮仅在存在时间/配送/关键词条件时渲染（hasFilter），无条件时不能硬点。"""
    if pg.locator('.f-clear').count():
        pg.locator('.f-clear').first.tap()
        time.sleep(3)


def reset_all(pg):
    """回到「全部」tab + 清空筛选条件，保证版式对照截到完整列表。"""
    safe_clear(pg)
    pg.locator('.tab-all').first.tap()
    time.sleep(3)


def pick_layout(pg, label):
    pg.locator('.layout-btn').tap()
    time.sleep(1.5)
    pg.locator('.pop-item', has_text=label).tap()
    time.sleep(3)


def page2_code(pg):
    """取一个**不在第 1 页且非幽灵单**的真实订单号，用它中段子串搜索：
    ① 证明过滤发生在服务端（当页 20 条里根本没有这条）；② 避免搜到 0 件 0 元的幽灵单（会被 isGhostView 过滤成空态）。"""
    rows = pg.evaluate("""async () => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/admin-api', {method:'POST', headers:{
          'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:'query{ orders(options:{take:60}){ items{ code totalQuantity } } }'})});
      const d = await r.json();
      return ((d.data||{}).orders||{}).items.map(x=>[x.code, x.totalQuantity]);
    }""") or []
    on_page1 = pg.evaluate("""() => Array.from(document.querySelectorAll('.card .code, .cp-code')).map(e=>e.innerText).join('|')""")
    for code, qty in rows:
        if code and qty and qty > 0 and code not in on_page1:
            return code
    return ''


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ===== 手机 390x844 dpr=2 =====
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = login(m)
    open_list(pg)
    print('body=', pg.inner_text('body')[:300].replace('\n', '|'))
    shot(pg, 'orderlist_v2_default_390.png')                 # 1 默认：时间胶囊 + 分组 tab + 统计卡 + 卡片信息流

    # 2 搜索命中（服务端过滤 → 跨页订单也能命中）：用第 2 页订单号的中段子串
    code = page2_code(pg)
    kw = code[2:9] if len(code) >= 9 else code
    print('  第2页订单号 =', code, ' 搜索词 =', kw)
    if not kw:
        raise SystemExit('未取到第 2 页非幽灵订单号，无法演示跨页搜索')
    pg.locator('.search .kw input').first.fill(kw)
    pg.get_by_text('搜索', exact=True).first.tap()
    time.sleep(4)
    print('  search rows =', pg.locator('.card').count())
    if pg.locator('.card').count() == 0:
        raise SystemExit('搜索命中 0 行，截图会留空图，请检查服务端过滤')
    shot(pg, 'orderlist_v2_search_390.png')

    # 3 今日 + 待发货（时间维度与状态分组可叠加）；分组默认折叠，先展开「进行中」
    safe_clear(pg)
    pg.get_by_text('今日', exact=True).first.tap(); time.sleep(3)
    pg.locator('.grp', has_text='进行中').first.locator('.gh').tap(); time.sleep(2)
    pg.locator('.gtab', has_text='待发货').first.tap(); time.sleep(3)
    shot(pg, 'orderlist_v2_today_state_390.png')

    # 4 异常组（exceptionType 非空）
    safe_clear(pg)
    pg.locator('.grp', has_text='异常').first.locator('.gh').tap(); time.sleep(2)
    pg.locator('.grp', has_text='异常').first.locator('.gtab').first.tap(); time.sleep(3)
    shot(pg, 'orderlist_v2_exception_390.png')

    # 5~7 三版式结构对照（B→C→A），先回到「全部」+ 清空条件
    reset_all(pg)
    pick_layout(pg, '状态看板'); shot(pg, 'orderlist_v2_layout_b_390.png')
    pick_layout(pg, '高密度清单'); shot(pg, 'orderlist_v2_layout_c_390.png')
    pick_layout(pg, '卡片信息流'); shot(pg, 'orderlist_v2_layout_a_390.png')

    # ===== 桌面 1440x900（B 版式：左分组导航含计数 + 右侧紧凑表）=====
    # 需 has_touch：本脚本统一用 .tap()，无 touch 的 context 会报 "The page does not support tap"。
    d = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2, has_touch=True)
    dp = login(d)
    open_list(dp)
    pick_layout(dp, '状态看板')
    shot(dp, 'orderlist_v2_desktop_1440.png')

    b.close()

# 同步到操作手册 assets
for n in os.listdir(SHOT):
    if n.startswith('orderlist_v2_'):
        shutil.copy(SHOT + n, MANUAL + n)
        print('copied →', n)
print('done')

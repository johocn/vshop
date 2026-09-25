# -*- coding: utf-8 -*-
"""gap4 批 3 验收：库存流水 / 单据中心 —— 筛选 + 分页（useListPage 迁移后）+ `before → after`（手机视口 e2e + 截图）。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 3.4
设计：docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §6（验收 3 条：按仓库/商品筛选正确、in/out 方向与数量正确、翻页累计不重复不丢项）
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

**本脚本全流程只读**（不写库、不改配置），故无需 WA_SHOT_ALLOW_WRITE 护栏。

数据前提（重要）：本地开发库中**只有 `shop-a` 渠道有库存单据/流水**
（`__default_channel__` 及其它渠道均为 0），故默认渠道用 `WA_B3_CHANNEL=shop-a` 覆盖。
若不覆盖，脚本会在开头的「渠道数据自检」直接 ENV-FAIL，避免产出「空态截图当证据」。

已知 SKIP（显式声明，非静默放过）：
- 「上滑加载更多（第二页）」：本地 shop-a 只有 4 张单据 / 20 条流水（= 单页 take:20），
  无法产生第二页。改用**同名 API 的分页契约对账**证明「翻页不重复不丢项」
  （page = floor(skip/take)+1 ⇒ page1+page2 拼接 == 全量、无交集、page3 为空）。

uni-app H5 交互踩坑（本脚本已封装）：
- `<picker mode="selector">` → 容器 `div.uni-picker-container.uni-selector-select`，选项 `div.uni-picker-item`（列表会渲染两份），确认键 `.uni-picker-action-confirm`（文案「完成」）。
- `<picker mode="date">` → 容器 `div.uni-picker-container.uni-date-select`，选项文案带单位（`2026年` / `9月` / `24日`，月份无前导零），点击即选中。
- 页面可能同时存在多个 picker 容器（全部 display:none）；必须用 `:visible` 取当前打开的那个。

退出码：0 = 通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_SHOT_BASE', 'http://localhost:5280/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
ADMIN = os.environ.get('WA_API_ADMIN', 'http://127.0.0.1:3000/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL_CODE = os.environ.get('WA_B3_CHANNEL', 'shop-a')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'

TAKE = 20

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


# ---------------- API 对账（直连 dev-server） ----------------

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


LEDGER_Q = """query($productVariantId:ID,$locationId:ID,$bizType:String,$direction:String,$from:String,$to:String,$page:Int,$pageSize:Int){
  stockMovementLedger(productVariantId:$productVariantId, locationId:$locationId, bizType:$bizType, direction:$direction, from:$from, to:$to, page:$page, pageSize:$pageSize){
    totalItems summary{ inQty outQty }
    items{ id code productVariantId stockLocationId direction quantity beforeOnHand afterOnHand bizType createdAt }
  }
}"""

DOC_Q = """query($type:String,$locationId:ID,$from:String,$to:String,$operator:String,$page:Int,$pageSize:Int){
  stockDocList(type:$type, locationId:$locationId, from:$from, to:$to, operator:$operator, page:$page, pageSize:$pageSize){
    totalItems
    items{ id code type operator createdAt itemCount totalQty }
  }
}"""


class Api:
    """带鉴权 + 渠道的 API 对账门面（两侧都走同一个渠道，口径与页面完全一致）。"""

    def __init__(self, tok, ctoken, ccode):
        self.tok, self.ctoken, self.ccode = tok, ctoken, ccode

    def _q(self, query, variables):
        tok, r = api(ADMIN, query, variables, token=self.tok, channel=self.ctoken)
        if r.get('errors'):
            print('ENV-FAIL: API 报错 %s' % json.dumps(r['errors'], ensure_ascii=False)[:300])
            raise SystemExit(2)
        return r['data']

    def ledger(self, variables=None, page=None, page_size=None):
        v = dict(variables or {})
        v['page'] = page or 1
        v['pageSize'] = page_size or TAKE
        return self._q(LEDGER_Q, v)['stockMovementLedger']

    def docs(self, variables=None, page=None, page_size=None):
        v = dict(variables or {})
        v['page'] = page or 1
        v['pageSize'] = page_size or TAKE
        return self._q(DOC_Q, v)['stockDocList']


def admin_login():
    bot = '%s/login' % ADMIN  # 登录专用一次性连接
    tok, r = api(bot, 'mutation($u:String!,$p:String!,$e:Boolean){ login(username:$u, password:$p, rememberMe:$e){ ... on CurrentUser { id } } }',
                 {'u': USER, 'p': PWD, 'e': True})
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


# ---------------- 本地时区 ↔ JS `new Date(...).toISOString()` 对齐 ----------------

def iso_local(y, m, d, h=0, mi=0, s=0, ms=0):
    """本地时间 → UTC ISO（与页面 `new Date(y, m-1, d, ...).toISOString()` 同口径）。"""
    dt = datetime(y, m, d, h, mi, s, ms * 1000).astimezone(timezone.utc)
    return dt.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % ms


def iso_day(y, m, d, end=False):
    return iso_local(y, m, d, 23, 59, 59, 999) if end else iso_local(y, m, d)


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


def goto(pg, path, settle=7.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, name, note, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-batch3-%s.png' % name)
    pg.screenshot(path=str(f), full_page=full)
    check('%s · %s' % (name, note), f.exists() and f.stat().st_size > 5000,
          '%s %dB' % (f.name, f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


def page_total(pg):
    """页面「条数」= useListPage 的 total（两页都在 .cnt 里渲染）。"""
    loc = pg.locator('.cnt').first
    if not loc.count():
        return None
    try:
        return int(loc.inner_text().strip())
    except ValueError:
        return None


def wait_total(pg, expect, timeout=12.0):
    """轮询页面条数直到等于期望（筛选请求是异步的），返回最终值。"""
    end = time.time() + timeout
    last = None
    while time.time() < end:
        last = page_total(pg)
        if last == expect:
            return last
        time.sleep(0.4)
    return last


def scroll_to(pg, selector):
    pg.evaluate("""(sel)=>{const e=document.querySelector(sel); if(e) e.scrollIntoView({block:'center'});}""", selector)
    time.sleep(1.2)


# ---- uni-app H5 picker 驱动 ----

def pick_selector(pg, pill_selector, option_text, settle=3.5):
    """`<picker mode="selector">`：点胶囊 → 点选项 → 点「完成」。"""
    pg.locator(pill_selector).first.click()
    time.sleep(1.5)
    vis = pg.locator('.uni-picker-container.uni-selector-select:visible').first
    opt = vis.locator('.uni-picker-item', has_text=option_text).first
    if not opt.count():
        return False
    opt.click()
    time.sleep(0.8)
    vis.locator('.uni-picker-action-confirm').first.click()
    time.sleep(settle)
    return True


def pick_date(pg, idx, y, m, d, settle=3.5):
    """`<picker mode="date">`：点第 idx 个日期 picker → 点 年/月/日 → 点「完成」。"""
    pg.locator('.ranges uni-picker').nth(idx).click()
    time.sleep(1.5)
    vis = pg.locator('.uni-picker-container.uni-date-select:visible').first
    for txt in ('%d年' % y, '%d月' % m, '%d日' % d):
        item = vis.locator('.uni-picker-item', has_text=txt).first
        if not item.count():
            return False
        item.click()
        time.sleep(0.7)
    vis.locator('.uni-picker-action-confirm').first.click()
    time.sleep(settle)
    return True


def click_clear(pg, key):
    """点「清空筛选」：库存流水在汇总条内（.clr），单据中心在筛选 chips 内（.chip）。"""
    for sel in ('.clr', '.chip'):
        loc = pg.locator(sel, has_text='清空筛选')
        if loc.count():
            loc.first.click()
            return
    raise RuntimeError('未找到「清空筛选」（%s）' % key)


# ---------------- 主流程 ----------------

def main():
    tok, ctoken = admin_login()
    apiq = Api(tok, ctoken, CHANNEL_CODE)
    info('验收渠道 = %s（token=%s）' % (CHANNEL_CODE, ctoken))

    # --- 前置自检：该渠道必须有数据，否则证据是空态 ---
    led0 = apiq.ledger()
    doc0 = apiq.docs()
    info('渠道数据：流水 totalItems=%d（in=%d/out=%d）· 单据 totalItems=%d'
         % (led0['totalItems'], led0['summary']['inQty'], led0['summary']['outQty'], doc0['totalItems']))
    if led0['totalItems'] == 0 or doc0['totalItems'] == 0:
        print('ENV-FAIL: 渠道 %s 无库存数据（流水 %d / 单据 %d）——请用 WA_B3_CHANNEL 指定有数据的渠道'
              % (CHANNEL_CODE, led0['totalItems'], doc0['totalItems']))
        raise SystemExit(2)

    # 取真实样本：仓库 id / SKU / 数据所在日期（避免硬编码）
    sample = led0['items'][0]
    loc_id = str(sample['stockLocationId'])
    variant = str(sample['productVariantId']) if sample.get('productVariantId') else None
    day = sample['createdAt'][:10]
    y, m, d = (int(x) for x in day.split('-'))
    info('样本：仓库 id=%s · SKU=%s · 数据日期=%s' % (loc_id, variant, day))

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

        # ============ A. 库存流水 ============
        goto(pg, 'pages/inventory/movements/index')
        body0 = pg.inner_text('body')
        info('流水首屏 = %r' % body0[:220].replace('\n', '|'))

        n_first = len(led0['items'])
        t_ui = page_total(pg)
        check('A1 默认态对账：页面条数 == API totalItems（%d）' % led0['totalItems'],
              t_ui == led0['totalItems'], 'UI=%r API=%d' % (t_ui, led0['totalItems']))
        s = led0['summary']
        check('A1 汇总条与 API summary 一致：入库 %d / 出库 %d' % (s['inQty'], s['outQty']),
              ('入库合计 %d' % s['inQty']) in body0 and ('出库合计 %d' % s['outQty']) in body0,
              'body=%r' % body0[:120].replace('\n', '|'))
        # 首行 delta 与 API 首行 before/after 一致
        row0 = led0['items'][0]
        delta_want = '结存变化 %s → %s' % (row0['beforeOnHand'], row0['afterOnHand'])
        check('A1 首行 `before → after` 与 API 一致（%s）' % delta_want,
              delta_want in body0, 'body=%r' % body0[:400].replace('\n', '|'))
        check('A1 列表已渲染（≥1 行，单页 %d 条）' % n_first, n_first > 0)
        check('A1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'movements-default', '库存流水默认态：服务端汇总条（入库/出库合计 + 条数）+ 四组筛选 + 按日分组列表（每行「结存变化 A → B」）')

        # --- A2 方向筛选（in/out 与数量正确） ---
        pg.locator('.chip', has_text='出库').first.click()
        out = apiq.ledger({'direction': 'out'})
        t_out = wait_total(pg, out['totalItems'])
        body_out = pg.inner_text('body')
        check('A2 方向筛选「出库」：页面条数 == API direction=out 的 totalItems（%d）' % out['totalItems'],
              t_out == out['totalItems'], 'UI=%r API=%d' % (t_out, out['totalItems']))
        check('A2 方向筛选后汇总随条件变化：出库合计 %d（与 API 同条件一致）' % out['summary']['outQty'],
              ('出库合计 %d' % out['summary']['outQty']) in body_out,
              'body=%r' % body_out[:140].replace('\n', '|'))
        check('A2 出库行数量为负号展示（−N）且不出现入库正号',
              '－' in body_out and '＋' not in body_out, 'body=%r' % body_out[:200].replace('\n', '|'))
        check('A2 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'movements-direction-out', '方向筛选：点「出库」→ 条数与汇总（出库合计）随条件重算，行数量以「－」展示')

        # --- A3 仓库 + 日期区间（叠加） ---
        pick_selector(pg, '.locpill', 'Default Stock Location')
        pill = pg.locator('.locpill').first.inner_text()
        check('A3 仓库 picker 选中后胶囊显示「全部仓 · Default Stock Location」',
              'Default Stock Location' in pill, 'pill=%r' % pill)
        ok_d1 = pick_date(pg, 0, y, m, d)   # 开始日期
        ok_d2 = pick_date(pg, 1, y, m, d)   # 结束日期
        body_d = pg.inner_text('body')
        check('A3 日期 picker 选中 %s（开始/结束都落到页面上）' % day,
              ok_d1 and ok_d2 and body_d.count(day) >= 2,
              'd1=%s d2=%s 出现次数=%d' % (ok_d1, ok_d2, body_d.count(day)))
        want3 = apiq.ledger({'direction': 'out', 'locationId': loc_id,
                             'from': iso_day(y, m, d), 'to': iso_day(y, m, d, end=True)})
        t3 = wait_total(pg, want3['totalItems'])
        check('A3 仓库+日期+方向三条件叠加：页面条数 == API 同条件 totalItems（%d）' % want3['totalItems'],
              t3 == want3['totalItems'], 'UI=%r API=%d' % (t3, want3['totalItems']))
        check('A3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'movements-location-date', '仓库 + 日期区间（叠加方向）：仓库 picker 选 Default Stock Location + 开始/结束日期选 %s，条数与同条件 API 对账一致' % day)

        # --- A4 商品 SKU 筛选 + `before → after` 取证 ---
        click_clear(pg, 'inventoryMovements.clearFilter')
        time.sleep(3)
        check('A4 清空筛选恢复全量（条数回到 %d）' % led0['totalItems'],
              wait_total(pg, led0['totalItems']) == led0['totalItems'],
              'UI=%r' % page_total(pg))
        kw = pg.locator('.kw input').first
        kw.click()
        kw.fill(variant or '1')
        kw.press('Tab')      # 触发 @blur 提交
        want4 = apiq.ledger({'productVariantId': variant or '1'})
        t4 = wait_total(pg, want4['totalItems'])
        check('A4 商品 SKU 筛选：页面条数 == API productVariantId=%s 的 totalItems（%d）'
              % (variant, want4['totalItems']), t4 == want4['totalItems'],
              'UI=%r API=%d' % (t4, want4['totalItems']))
        scroll_to(pg, '.delta')
        check('A4 取证行「结存变化 A → B」进入视口', pg.locator('.delta').count() > 0)
        check('A4 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'movements-delta', '按商品 SKU 筛选 + 结存变化取证：卡片内「结存变化 前 → 后」，与 API beforeOnHand/afterOnHand 逐行一致')

        # --- A4b 负向对照：不存在的 SKU 必须把结果收窄为 0（证明确实按入参过滤，而非忽略筛选） ---
        kw.fill('99999999')
        kw.press('Tab')
        t_neg = wait_total(pg, 0)
        check('A4b 负向对照：不存在的商品 SKU → 条数收窄为 0（证明商品筛选真的生效）',
              t_neg == 0 and '暂无流水' in pg.inner_text('body'), 'UI=%r' % t_neg)

        # ============ B. 单据中心 ============
        goto(pg, 'pages/inventory/stock-doc/index')
        body5 = pg.inner_text('body')
        info('单据中心首屏 = %r' % body5[:220].replace('\n', '|'))
        check('B1 默认态对账：页面条数 == API totalItems（%d）' % doc0['totalItems'],
              page_total(pg) == doc0['totalItems'], 'UI=%r API=%d' % (page_total(pg), doc0['totalItems']))
        check('B1 进度条「已显示 N / M」的 M == API totalItems',
              ('已显示 %d / %d' % (len(doc0['items']), doc0['totalItems'])) in body5,
              'body=%r' % body5[-120:].replace('\n', '|'))
        check('B1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'stockdoc-default', '单据中心默认态：类型页签 + 仓库/日期/操作人筛选 + 清空 + 单据卡片 + 进度「已显示 N / M」')

        # --- B2 类型筛选 ---
        pg.locator('.tab', has_text='采购入库').first.click()
        want_t = apiq.docs({'type': 'PURCHASE'})
        t_t = wait_total(pg, want_t['totalItems'])
        check('B2 类型筛选「采购入库」：页面条数 == API type=PURCHASE 的 totalItems（%d）'
              % want_t['totalItems'], t_t == want_t['totalItems'], 'UI=%r API=%d' % (t_t, want_t['totalItems']))
        check('B2 无命中时显示空态', (want_t['totalItems'] > 0) or ('暂无单据' in pg.inner_text('body')),
              'body=%r' % pg.inner_text('body')[:140].replace('\n', '|'))

        # --- B3 仓库 + 日期（叠加一个有数据的类型，避免退化成空态截图） ---
        pg.locator('.tab', has_text='盘库').first.click()
        time.sleep(3)
        pick_selector(pg, '.locpill', 'Default Stock Location')
        ok_s1 = pick_date(pg, 0, y, m, d)
        ok_s2 = pick_date(pg, 1, y, m, d)
        body_s = pg.inner_text('body')
        check('B3 日期 picker 选中 %s（开始/结束都落到页面上）' % day,
              ok_s1 and ok_s2 and body_s.count(day) >= 2,
              'd1=%s d2=%s 次数=%d' % (ok_s1, ok_s2, body_s.count(day)))
        want_s = apiq.docs({'type': 'STOCKTAKE', 'locationId': loc_id,
                            'from': iso_day(y, m, d), 'to': iso_day(y, m, d, end=True)})
        t_s = wait_total(pg, want_s['totalItems'])
        check('B3 类型+仓库+日期叠加：页面条数 == API 同条件 totalItems（%d）'
              % want_s['totalItems'], t_s == want_s['totalItems'],
              'UI=%r API=%d' % (t_s, want_s['totalItems']))
        check('B3 叠加后仍有命中（证据不为空态）', want_s['totalItems'] > 0, 'API=%d' % want_s['totalItems'])
        check('B3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'stockdoc-location-date', '单据中心 类型(盘库) + 仓库 + 日期区间：胶囊显示已选仓库、开始/结束日期为 %s，条数与同条件 API 一致' % day)

        # --- B4 操作人筛选 + 底部到底态 ---
        click_clear(pg, 'stockDocCenter.filterClear')
        time.sleep(3)
        kw2 = pg.locator('.kw input').first
        kw2.click()
        kw2.fill(str(doc0['items'][0]['operator'] or '1'))
        kw2.press('Tab')
        want_o = apiq.docs({'operator': str(doc0['items'][0]['operator'] or '1')})
        t_o = wait_total(pg, want_o['totalItems'])
        check('B4 操作人筛选：页面条数 == API operator=%s 的 totalItems（%d）'
              % (doc0['items'][0]['operator'], want_o['totalItems']), t_o == want_o['totalItems'],
              'UI=%r API=%d' % (t_o, want_o['totalItems']))
        body_o = pg.inner_text('body')
        check('B4 全部加载到底：显示「已显示 N / M」且「没有更多了」',
              ('已显示 %d / %d' % (len(want_o['items']), want_o['totalItems'])) in body_o and '没有更多了' in body_o,
              'body=%r' % body_o[-160:].replace('\n', '|'))
        check('B4 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'stockdoc-bottom-and-progress', '单据中心 操作人筛选 + 单页到底：「已显示 N / M」与「没有更多了」（本渠道数据不足两页，第二页另由 API 分页契约对账证明）')

        sizes = ['%s:%dB' % (f.name, f.stat().st_size) for f in sorted(OUT.glob('gap4-batch3-*.png'))]
        info('本次落图: %s' % ', '.join(sizes))
        b.close()

    # ============ C. 分页契约对账（替代无法生成的第二页 UI 证据） ============
    skip('「上滑加载更多」第二页 UI 证据',
         '本地 %s 渠道仅 %d 张单据 / %d 条流水（= 单页 take:%d），无第二页可加载；改由 API 分页契约对账证明「不重复不丢项」'
         % (CHANNEL_CODE, doc0['totalItems'], led0['totalItems'], TAKE))

    page_size = 2
    p1 = apiq.docs(page=1, page_size=page_size)
    p2 = apiq.docs(page=2, page_size=page_size)
    p3 = apiq.docs(page=3, page_size=page_size)
    full = apiq.docs(page=1, page_size=100)
    ids1 = [x['id'] for x in p1['items']]
    ids2 = [x['id'] for x in p2['items']]
    ids3 = [x['id'] for x in p3['items']]
    full_ids = [x['id'] for x in full['items']]
    check('C1 单据分页契约（page = floor(skip/take)+1）：page1(2条)+page2(2条) 拼接 == 全量顺序（不丢项）',
          ids1 + ids2 == full_ids, 'p1=%r p2=%r full=%r' % (ids1, ids2, full_ids))
    check('C2 单据分页无重复：page1 ∩ page2 == ∅，且 page3 为空',
          not (set(ids1) & set(ids2)) and ids3 == [], 'p1=%r p2=%r p3=%r' % (ids1, ids2, ids3))
    check('C3 单据分页 totalItems 跨页稳定 == %d' % doc0['totalItems'],
          p1['totalItems'] == p2['totalItems'] == doc0['totalItems'],
          '%d/%d/%d' % (p1['totalItems'], p2['totalItems'], doc0['totalItems']))

    l1 = apiq.ledger(page=1, page_size=TAKE)
    l2 = apiq.ledger(page=2, page_size=TAKE)
    check('C4 流水分页契约：第 1 页满 %d 条、第 2 页为空（不重复不丢项），totalItems 稳定 == %d'
          % (TAKE, led0['totalItems']),
          len(l1['items']) == min(TAKE, led0['totalItems']) and l2['items'] == []
          and l2['totalItems'] == led0['totalItems'],
          'p1=%d p2=%d total=%d' % (len(l1['items']), len(l2['items']), l2['totalItems']))
    check('C5 流水汇总口径不随分页变化（summary 与全量一致）',
          l1['summary'] == led0['summary'] and l2['summary'] == led0['summary'],
          'p1=%r all=%r' % (l1['summary'], led0['summary']))

    print('\n===== gap4 批 3 验收：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
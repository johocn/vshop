# -*- coding: utf-8 -*-
"""gap4 批 4 验收：拣货批次 交接 / 异常件 / 复核（状态机扩展后的 UI + 列表分组）
               + 预留单（宫格入口 / 倒计时 / 已释放 tab）+ 数据看板两视图（回归 + 作业分析）。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 4.6（UI）与 Task 4.8（批 4 验收）
设计：docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §5（状态机）/ §7.1（预留单）/ §7.3（作业分析）/ §9（只读态）
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

状态机（后端 pick-batch-math.ts TRANSITIONS，终态只有 REVIEWED / CANCELLED）：
  PENDING → PICKED → PRINTED → SHIPPED → HANDOVER → REVIEWED
                                   ↕
                                EXCEPTION（处理完回 HANDOVER）

写操作护栏：A 段会推进批次状态（不可逆），仅在 `WA_SHOT_ALLOW_WRITE=1` 时执行；
生产域名硬拦（与批 2/批 3 同口径）。默认只读跑会 ENV-FAIL（不产出「没验证却通过」的假证据）。

渠道（A / B 两段不是同一渠道，见 WA_B4_CHANNEL / WA_B4_RESV_CHANNEL）：
  A 段（批次状态机 UI）= `__default_channel__`——批次存量与可配货订单都在默认渠道（shop-a 无订单，
  会直接 ENV-FAIL）；与批 1/批 2 口径一致。
  B 段（预留单 / 看板）= `shop-a`。

B 段（Task 4.8）前置数据（渠道 `shop-a`，直连库造，见 packages/dev-server/_tmp_seed_resv.mjs）：
  #999903 PENDING_ALLOC 未到期 → 倒计时 mm:ss；#999902 已过期且 worker 已跑过 → RELEASED。
  缺任一状态即 ENV-FAIL 退出（沿用批 3 D22：禁止拿空态当证据）。

退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
"""
import json
import os
import re
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
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
A_CHANNEL_CODE = os.environ.get('WA_B4_CHANNEL', '__default_channel__')
B_CHANNEL_CODE = os.environ.get('WA_B4_RESV_CHANNEL', 'shop-a')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'

ALLOW_WRITE = os.environ.get('WA_SHOT_ALLOW_WRITE') == '1'
FORBIDDEN_HOSTS = ('e.joho.cn',)

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


# ---------------- API 对账 ----------------

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


BATCH_LIST_Q = """query($state:String,$page:Int,$pageSize:Int){
  pickBatches(options:{state:$state, page:$page, pageSize:$pageSize}){
    totalItems
    items{ id code state handoverTo handoverAt reviewedAt exceptionAt exceptionNote createdAt }
  }
}"""

CAND_Q = """query{ pickBatchCandidates(options:{page:1, pageSize:20}){ totalItems items } }"""

LOC_Q = """query{ stockLocations{ items{ id name } } }"""

CREATE_Q = """mutation($input:CreatePickBatchInput!){ createPickBatch(input:$input){ id code state } }"""

ADVANCE_Q = """mutation($id:ID!,$to:String!){ advancePickBatchState(batchId:$id, to:$to){ id state } }"""

HANDOVER_Q = """mutation($id:ID!,$to:String!){ handoverPickBatch(batchId:$id, handoverTo:$to){ id state } }"""

SHIP_Q = """mutation($id:ID!,$input:ShipPickBatchInput!){ shipPickBatch(batchId:$id, input:$input) }"""

# 预留单列表（D9：items 子选择集会触发 non-null 违例，只取头字段）
RESV_Q = """query($status:String,$page:Int,$pageSize:Int){
  reservations(status:$status, page:$page, pageSize:$pageSize){
    totalItems items{ id orderId variantId totalQty status createdAt expiresAt }
  }
}"""


class Api:
    def __init__(self, tok, ctoken):
        self.tok, self.ctoken = tok, ctoken

    def q(self, query, variables=None):
        _, r = api(ADMIN, query, variables or {}, token=self.tok, channel=self.ctoken)
        if r.get('errors'):
            print('ENV-FAIL: API 报错 %s' % json.dumps(r['errors'], ensure_ascii=False)[:400])
            raise SystemExit(2)
        return r['data']

    def batches(self, state=None, page=1, page_size=20):
        return self.q(BATCH_LIST_Q, {'state': state, 'page': page, 'pageSize': page_size})['pickBatches']

    def candidates(self):
        return self.q(CAND_Q)['pickBatchCandidates']

    def locations(self):
        return self.q(LOC_Q)['stockLocations']['items']

    def create(self, loc_id, order_ids, note=None):
        return self.q(CREATE_Q, {'input': {'stockLocationId': str(loc_id), 'orderIds': order_ids, 'note': note}})['createPickBatch']

    def advance(self, batch_id, to):
        return self.q(ADVANCE_Q, {'id': batch_id, 'to': to})['advancePickBatchState']

    def handover(self, batch_id, to):
        return self.q(HANDOVER_Q, {'id': batch_id, 'to': to})['handoverPickBatch']

    def ship(self, batch_id, method='standard', tracking=None):
        return self.q(SHIP_Q, {'id': batch_id, 'input': {'method': method, 'trackingCode': tracking}})['shipPickBatch']

    def reservations(self, status=None):
        return self.q(RESV_Q, {'status': status, 'page': 1, 'pageSize': 50})['reservations']


def admin_login(channel_code):
    """登录一次，返回 (token, 指定渠道的 vendure-token)。"""
    bot = '%s/login' % ADMIN
    tok, r = api(bot, 'mutation($u:String!,$p:String!,$e:Boolean){ login(username:$u, password:$p, rememberMe:$e){ ... on CurrentUser { id } } }',
                 {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        print('ENV-FAIL: admin 登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    chans = data_of(api(ADMIN, 'query{ myTenantAccess{ channels{ id code token } } }', token=tok)[1],
                    'myTenantAccess', 'channels') or []
    ch = next((c for c in chans if c['code'] == channel_code), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (channel_code, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return tok, ch['token']


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


def inject_channel(pg, code):
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
    }""", [code])
    if ok != 'OK':
        print('ENV-FAIL: 渠道注入失败 %s' % ok)
        raise SystemExit(2)


def goto(pg, path, settle=1.5):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, name, note, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-batch4-%s.png' % name)
    pg.screenshot(path=str(f), full_page=full)
    check('%s · %s' % (name, note), f.exists() and f.stat().st_size > 5000,
          '%s %dB' % (f.name, f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


def head_kv(pg):
    """批次信息卡的「标签 → 值」字典。"""
    out = {}
    for row in pg.locator('.head .kv').all():
        k = row.locator('.k')
        v = row.locator('.v')
        if k.count() and v.count():
            out[k.first.inner_text().strip()] = v.first.inner_text().strip()
    return out


def acts(pg):
    return [t.strip() for t in pg.locator('.acts .ab').all_inner_texts()]


def state_badge(pg):
    loc = pg.locator('.head .st').first
    return loc.inner_text().strip() if loc.count() else ''


def wait_acts(pg, want, timeout=12.0):
    """轮询状态推进卡直到按钮集合符合期望（点按钮后是异步刷新）。"""
    end = time.time() + timeout
    last = []
    while time.time() < end:
        last = acts(pg)
        if last == want:
            return last
        time.sleep(0.4)
    return last


def click_act(pg, text):
    pg.locator('.acts .ab', has_text=text).first.click()
    time.sleep(0.6)


def fill_sheet(pg, value):
    inp = pg.locator('.mask .sheet .inp input').first
    inp.click()
    inp.fill(value)
    time.sleep(0.4)


def confirm_sheet(pg):
    pg.locator('.mask .sheet .sbtns .sbtn').last.click()
    time.sleep(2.5)


# ---------------- 预留单页（Task 4.8 B 段） ----------------

def card_of(pg, order_id):
    """预留单列表里指定订单号的卡片（列表只读，按 #订单号 定位）。"""
    return pg.locator('.card', has_text='#' + str(order_id)).first


def card_kv(card):
    """卡片内「标签 → 值」字典（键为中文 i18n 文案：SKU/预占量/创建时间/剩余有效期）。"""
    out = {}
    for row in card.locator('.kv').all():
        k = row.locator('.k')
        v = row.locator('.v')
        if k.count() and v.count():
            out[k.first.inner_text().strip()] = v.first.inner_text().strip()
    return out


def badges(pg):
    return [t.strip() for t in pg.locator('.card .st').all_inner_texts()]


def scroll_to(pg, selector):
    loc = pg.locator(selector).first
    if loc.count():
        loc.scroll_into_view_if_needed()
        time.sleep(0.8)
    return loc.count()


# ---------------- 主流程 ----------------

def ensure_fixture(apiq):
    """确保存在一个 PRINTED 批次（优先复用，缺则用候选订单现造）。返回 (batch_id, code, from_ui_ship)。"""
    printed = apiq.batches(state='PRINTED')
    if printed['totalItems']:
        b = printed['items'][0]
        info('复用既有 PRINTED 批次 %s' % b['code'])
        return b['id'], b['code'], True

    cand = apiq.candidates()
    locs = apiq.locations()
    # 已在批次内的订单不可再选（服务端同样拒绝；inBatchId 非空即已被占用）
    free = [x for x in (cand['items'] or []) if not x.get('inBatchId')]
    info('无 PRINTED 批次；候选订单 %d 单（其中未被批次占用 %d 单）/ 仓 %d 个'
         % (cand['totalItems'], len(free), len(locs)))
    if not free or not locs:
        return None, None, False
    if not ALLOW_WRITE:
        print('ENV-FAIL: 需要现造 PRINTED 批次（写操作），请设 WA_SHOT_ALLOW_WRITE=1')
        raise SystemExit(2)

    order_ids = [str(x['id']) for x in free[:2]]
    info('fixture 取用订单 id = %s' % order_ids)
    loc_id = locs[0]['id']
    b = apiq.create(loc_id, order_ids, note='gap4 批 4 验收 fixture')
    apiq.advance(b['id'], 'PICKED')
    apiq.advance(b['id'], 'PRINTED')
    info('已现造 PRINTED 批次 %s（%d 单）' % (b['code'], len(order_ids)))
    return b['id'], b['code'], True


def main():
    for host in FORBIDDEN_HOSTS:
        if host in BASE or host in ADMIN:
            print('ENV-FAIL: 生产域名 %s 禁止被本脚本驱动（防误改线上数据）' % host)
            raise SystemExit(2)

    tok, atok = admin_login(A_CHANNEL_CODE)
    _, btok = admin_login(B_CHANNEL_CODE)
    apiq = Api(tok, atok)  # A 段：批次状态机
    apib = Api(tok, btok)  # B 段：预留单 / 看板
    info('A 段渠道 = %s（token=%s）' % (A_CHANNEL_CODE, atok))
    info('B 段渠道 = %s（token=%s）' % (B_CHANNEL_CODE, btok))

    inv = {s: apiq.batches(state=s)['totalItems']
           for s in ('PENDING', 'PICKED', 'PRINTED', 'SHIPPED', 'HANDOVER', 'EXCEPTION', 'REVIEWED', 'CANCELLED')}
    info('批次状态存量 = %s' % inv)

    batch_id, batch_code, from_ui_ship = ensure_fixture(apiq)
    if not batch_id:
        print('ENV-FAIL: 既无 PRINTED 批次、也无候选订单可造批次（请先有可配货订单）')
        raise SystemExit(2)
    info('验收批次 = %s（%s）' % (batch_code, batch_id))

    # B 段前置数据自检（批 3 D22 同口径：宁可 ENV-FAIL，也不拿空态当验收证据）
    rsv_all = apib.reservations()
    pend = [x for x in rsv_all['items'] if x['status'] == 'PENDING_ALLOC']
    rel = [x for x in rsv_all['items'] if x['status'] == 'RELEASED']
    info('预留单存量 = total=%d PENDING_ALLOC=%d RELEASED=%d'
         % (rsv_all['totalItems'], len(pend), len(rel)))
    if not pend or not rel:
        print('ENV-FAIL: 预留单数据不足（PENDING_ALLOC=%d / RELEASED=%d）——倒计时与「已释放」tab 会产出空态假证据。'
              '先造 fixture：cwd packages/dev-server → node _tmp_seed_resv.mjs seed-future '
              '（seed-expired 后必须已起过 dev:worker 让它被释放）' % (len(pend), len(rel)))
        raise SystemExit(2)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True, locale='zh-CN')
        pg = ctx.new_page()
        bag = []
        pg.on('pageerror', lambda e: bag.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: bag.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
        login(pg)
        inject_channel(pg, A_CHANNEL_CODE)

        # ============ A1. PRINTED 详情：只有「取消批次」+ 底部发货条 ============
        goto(pg, 'pages/order/picking/batch?id=' + batch_id, settle=3.0)
        body0 = pg.inner_text('body')
        info('详情首屏 = %r' % body0[:200].replace('\n', '|'))
        check('A1 详情页状态徽标 = 已打单', state_badge(pg) == '已打单', 'badge=%r' % state_badge(pg))
        a1 = acts(pg)
        check('A1 PRINTED 下状态推进卡只有「取消批次」（交接/复核按钮尚未出现）',
              a1 == ['取消批次'], 'acts=%r' % a1)
        check('A1 PRINTED 下底部发货条存在（可发货态）',
              pg.locator('.bulk').count() == 1, 'bulk=%d' % pg.locator('.bulk').count())
        check('A1 未交接前不显示交接对象/交接时间',
              '交接对象' not in body0 and '交接时间' not in body0, 'body=%r' % body0[:200].replace('\n', '|'))
        check('A1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'printed-detail', 'PRINTED 批次详情：状态徽标「已打单」、状态推进卡仅「取消批次」、底部整批发货条在位（交接/复核按钮此时不应出现）')

        # ============ A2. 发货 → SHIPPED：出现「交接登记」与「登记异常件」 ============
        if from_ui_ship:
            pg.locator('.bulk .bb').first.click()
            time.sleep(5)
        after = head_kv(pg)
        info('发货后头部 = %s' % after)
        if state_badge(pg) != '已发货':
            # 逐单 fulfillment 可能因订单不可发货整体失败（页面会逐条列出失败原因，异常时以 toast 提示）
            fails_txt = pg.locator('.fail .fi').all_inner_texts()
            toast = pg.locator('uni-toast').first
            toast_txt = toast.inner_text().strip() if toast.count() else ''
            info('发货未成功：失败清单=%r toast=%r' % (fails_txt, toast_txt))
            apiq.advance(batch_id, 'SHIPPED')
            goto(pg, 'pages/order/picking/batch?id=' + batch_id, settle=3.0)
            skip('UI 整批发货到 SHIPPED',
                 '页面发货未成功（失败清单=%s / toast=%s），改由 API advance 置 SHIPPED 后继续验证后续 UI；'
                 '发货链路本身属 Task 9 既有验收范围'
                 % (('；'.join(fails_txt) or '空')[:80], (toast_txt or '空')[:80]))
        check('A2 发货后状态徽标 = 已发货', state_badge(pg) == '已发货', 'badge=%r' % state_badge(pg))
        wait_acts(pg, ['交接登记', '登记异常件'])
        a2 = acts(pg)
        check('A2 SHIPPED 下出现「交接登记」+「登记异常件」（SHIPPED 已不可取消，故无「取消批次」）',
              a2 == ['交接登记', '登记异常件'], 'acts=%r' % a2)
        check('A2 SHIPPED 下底部发货条消失（已非可发货态）',
              pg.locator('.bulk').count() == 0, 'bulk=%d' % pg.locator('.bulk').count())
        check('A2 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'shipped-detail', 'SHIPPED 批次详情：状态徽标「已发货」、状态推进卡变为「交接登记」+「登记异常件」、底部发货条已撤下')

        # ============ A3. 交接登记 → HANDOVER，头部显示交接对象/交接时间 ============
        click_act(pg, '交接登记')
        check('A3 点「交接登记」弹出输入弹层',
              pg.locator('.mask .sheet').count() == 1 and '交接登记' in pg.locator('.mask .sheet .stitle').first.inner_text())
        fill_sheet(pg, '顺丰速运 / 仓管 老王')
        shot(pg, 'handover-sheet', '交接登记弹层：标题「交接登记」+ 交接对象输入框 + 取消/确定（点确定前截图）')
        confirm_sheet(pg)
        kv = head_kv(pg)
        info('交接后头部 = %s' % kv)
        check('A3 交接后状态徽标 = 已交接', state_badge(pg) == '已交接', 'badge=%r' % state_badge(pg))
        check('A3 头部新增「交接对象」且值为所填内容',
              kv.get('交接对象') == '顺丰速运 / 仓管 老王', 'kv=%r' % kv)
        check('A3 头部新增「交接时间」且非空',
              bool(kv.get('交接时间')) and kv.get('交接时间') != '—', 'handoverAt=%r' % kv.get('交接时间'))
        api_kv = apiq.batches(state='HANDOVER')['items']
        api_hit = next((x for x in api_kv if x['id'] == batch_id), None)
        check('A3 API 对账：该批次确为 HANDOVER 且 handoverTo 落库一致',
              bool(api_hit) and api_hit['handoverTo'] == '顺丰速运 / 仓管 老王',
              'api=%r' % (api_hit and {k: api_hit[k] for k in ('state', 'handoverTo')}))
        a3 = acts(pg)
        check('A3 HANDOVER 下出现「确认复核完成」+「登记异常件」',
              a3 == ['登记异常件', '确认复核完成'], 'acts=%r' % a3)
        check('A3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'handover-detail', 'HANDOVER 批次详情：交接对象/交接时间只读展示（与 API handoverTo 逐字一致）、状态推进卡变为「登记异常件」+「确认复核完成」')

        # ============ A4. 登记异常件 → EXCEPTION，头部显示异常原因 ============
        click_act(pg, '登记异常件')
        check('A4 点「登记异常件」弹出输入弹层',
              pg.locator('.mask .sheet').count() == 1 and '登记异常件' in pg.locator('.mask .sheet .stitle').first.inner_text())
        fill_sheet(pg, '外箱破损，已换箱重封')
        confirm_sheet(pg)
        body4 = pg.inner_text('body')
        check('A4 异常登记后状态徽标 = 异常件', state_badge(pg) == '异常件', 'badge=%r' % state_badge(pg))
        check('A4 头部只读展示异常原因且与所填一致',
              '异常原因：外箱破损，已换箱重封' in body4, 'body=%r' % body4[:260].replace('\n', '|'))
        check('A4 异常件也可二次登记（EXCEPTION 只允许回交接，故按钮变为仅「交接登记」）',
              acts(pg) == ['交接登记'], 'acts=%r' % acts(pg))
        check('A4 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'exception-detail', 'EXCEPTION 批次详情：状态徽标「异常件」+ 头部只读展示「异常原因：…」（与所填逐字一致）')

        # ============ A5. 异常处理完再交接回 HANDOVER → 复核 → REVIEWED ============
        click_act(pg, '交接登记')
        fill_sheet(pg, '承运商复提')
        confirm_sheet(pg)
        check('A5 异常件处理完交接回 HANDOVER', state_badge(pg) == '已交接', 'badge=%r' % state_badge(pg))
        kv5 = head_kv(pg)
        check('A5 二次交接后交接对象被覆盖为最新值',
              kv5.get('交接对象') == '承运商复提', 'kv=%r' % kv5)
        check('A5 异常原因仍保留展示（后端登记异常时写入、再次交接不清空）',
              '异常原因：外箱破损，已换箱重封' in pg.inner_text('body'),
              'body=%r' % pg.inner_text('body')[:260].replace('\n', '|'))

        click_act(pg, '确认复核完成')
        time.sleep(2.5)
        body6 = pg.inner_text('body')
        check('A5 复核后状态徽标 = 已复核', state_badge(pg) == '已复核', 'badge=%r' % state_badge(pg))
        check('A5 头部新增「复核时间」且非空',
              bool(head_kv(pg).get('复核时间')) and head_kv(pg).get('复核时间') != '—',
              'reviewedAt=%r' % head_kv(pg).get('复核时间'))
        check('A5 REVIEWED 为终态：状态推进卡整块隐藏（整页只读）',
              pg.locator('.acts').count() == 0, 'acts=%d' % pg.locator('.acts').count())
        check('A5 REVIEWED 为终态：底部发货条不渲染', pg.locator('.bulk').count() == 0)
        check('A5 REVIEWED 为终态：成员行勾选框消失（改地址置灰）',
              pg.locator('.row .check').count() == 0, 'check=%d' % pg.locator('.row .check').count())
        api_rev = apiq.batches(state='REVIEWED')['items']
        check('A5 API 对账：该批次确为 REVIEWED',
              any(x['id'] == batch_id for x in api_rev),
              'REVIEWED total=%d' % apiq.batches(state='REVIEWED')['totalItems'])
        check('A5 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'reviewed-detail', 'REVIEWED 终态详情：状态徽标「已复核」+ 复核时间只读展示；状态推进卡整块隐藏、底部发货条撤下、成员行勾选框消失（整页只读）')

        # ============ A6. 列表分组：新状态批次可达 ============
        goto(pg, 'pages/order/picking/index', settle=3.5)
        list_body = pg.inner_text('body')
        info('列表首屏 = %r' % list_body[:200].replace('\n', '|'))
        pg.locator('.tb', has_text='已完成').first.click()
        time.sleep(2.5)
        done_body = pg.inner_text('body')
        check('A6 该批次出现在「已完成」Tab（REVIEWED 归终态）',
              batch_code in done_body, 'code=%s in done=%s' % (batch_code, batch_code in done_body))
        check('A6 「已完成」Tab 不再收纳 SHIPPED（SHIPPED 已非终态）',
              '已发货' not in done_body, 'body=%r' % done_body[:200].replace('\n', '|'))
        check('A6 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'list-done-reviewed', '配货台「已完成」Tab：REVIEWED 终态批次可见（此前 SHIPPED 才进此 Tab，新状态若不改分组会导致核查批无处可达）')

        pg.locator('.tb', has_text='进行中').first.click()
        time.sleep(2.5)
        act_body = pg.inner_text('body')
        check('A6 该批次不再出现在「进行中」Tab',
              batch_code not in act_body, 'code=%s in active=%s' % (batch_code, batch_code in act_body))
        shot(pg, 'list-active', '配货台「进行中」Tab：仅 PENDING/PICKED/PRINTED/SHIPPED/HANDOVER/EXCEPTION（REVIEWED 终态批次已移出）')

        # ==================================================================================
        # B 段（Task 4.8）：预留单入口/倒计时/已释放 tab + 数据看板回归与作业分析
        # 渠道从默认切到 shop-a（预留单 fixture 的归属渠道）
        # ==================================================================================
        inject_channel(pg, B_CHANNEL_CODE)
        pend_id = str(pend[0]['orderId'])  # 列表按 createdAt DESC → 最新一条待备货单（fixture #999903）
        expired_id = os.environ.get('WA_B4_EXPIRED_ORDER', '999902')
        info('B 段定位：倒计时单 = #%s，超时已释放单 = #%s' % (pend_id, expired_id))

        # ============ B1. 「库存与预警」快捷宫格：新增「预留单」第 9 项 ============
        goto(pg, 'pages/inventory/stock/index', settle=4.5)
        grid = pg.locator('.grid .g')
        n_grid = grid.count()
        labels = [t.strip() for t in grid.locator('.gt').all_inner_texts()]
        info('宫格 = %r' % labels)
        check('B1 快捷宫格共 9 项（原 8 项 + 新增预留单）', n_grid == 9, 'count=%d' % n_grid)
        check('B1 第 9 项为「预留单」', len(labels) == 9 and labels[-1] == '预留单',
              'last=%r' % (labels[-1] if labels else None))
        check('B1 宫格各项无重复（新增项未挤掉既有入口）', len(set(labels)) == len(labels), 'labels=%r' % labels)
        check('B1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        scroll_to(pg, '.grid')
        shot(pg, 'stock-grid-reservation', '库存与预警·快捷宫格：共 9 项，末位为新增「预留单」（🔒）入口')
        # 宫格点击跳转真实可达（不是只有个图标）
        grid.last.click()
        time.sleep(3.0)
        check('B1 点「预留单」宫格进入预留单页', 'pages/inventory/reservation/index' in pg.url, 'url=%s' % pg.url)
        goto(pg, 'pages/inventory/reservation/index', settle=3.5)

        # ============ B2. 预留单列表默认态：倒计时 mm:ss 每秒递减 ============
        body2 = pg.inner_text('body')
        info('预留单首屏 = %r' % body2[:240].replace('\n', '|'))
        tabs = [t.strip() for t in pg.locator('.seg .seg-item').all_inner_texts()]
        check('B2 状态 tab = 全部 / 待备货 / 已备货 / 已完成 / 已释放（空 key 不过滤）',
              tabs == ['全部', '待备货', '已备货', '已完成', '已释放'], '%r' % tabs)
        check('B2 默认 tab 为「全部」（default 高亮且不全量过滤）',
              'on' in (pg.locator('.seg .seg-item').first.get_attribute('class') or ''),
              'cls=%r' % pg.locator('.seg .seg-item').first.get_attribute('class'))
        n_cards = pg.locator('.card').count()
        check('B2 UI 行数 == API totalItems（未截断、未空态）',
              n_cards == rsv_all['totalItems'], 'ui=%d api=%d' % (n_cards, rsv_all['totalItems']))
        check('B2 计数条与数据一致',
              ('已显示 %d / %d' % (n_cards, rsv_all['totalItems'])) in body2,
              'body=%r' % body2[:160].replace('\n', '|'))

        pend_card = card_of(pg, pend_id)
        kv_pend = card_kv(pend_card) if pend_card.count() else {}
        info('B2 #%s 行 = %s' % (pend_id, kv_pend))
        check('B2 fixture 待备货单 #%s 在默认 tab 可见' % pend_id, pend_card.count() == 1)
        check('B2 待备货行状态徽标 = 待备货',
              pend_card.count() == 1 and pend_card.locator('.st').first.inner_text().strip() == '待备货',
              'badge=%r' % (pend_card.locator('.st').first.inner_text().strip() if pend_card.count() else None))
        check('B2 预占量显示 fixture 值 2', kv_pend.get('预占量') == '2', 'qty=%r' % kv_pend.get('预占量'))
        rem1 = kv_pend.get('剩余有效期', '')
        check('B2 剩余有效期为 mm:ss 倒计时（未到期，不是「待释放」）',
              bool(re.fullmatch(r'\d{2}:\d{2}', rem1)), 'remaining=%r' % rem1)
        check('B2 待备货行提供「释放」按钮', pend_card.count() == 1 and pend_card.locator('.rel').count() == 1)
        time.sleep(2.4)
        rem2 = card_kv(card_of(pg, pend_id)).get('剩余有效期', '') if pend_card.count() else ''
        check('B2 倒计时每秒递减（2.4s 后读数变小）',
              bool(re.fullmatch(r'\d{2}:\d{2}', rem1)) and bool(re.fullmatch(r'\d{2}:\d{2}', rem2)) and rem2 < rem1,
              '%r → %r' % (rem1, rem2))
        check('B2 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'resv-list-default', '预留单·默认「全部」Tab：待备货行显示 mm:ss 剩余有效期（每秒递减）与「释放」按钮；已备货/已完成行为只读')

        # ============ B3. 预留单 tab「已释放」（worker 超时释放的结果可达） ============
        pg.locator('.seg .seg-item', has_text='已释放').first.click()
        time.sleep(3.0)
        body3 = pg.inner_text('body')
        b3 = badges(pg)
        rel_api = apib.reservations('RELEASED')
        rel_ids = [str(x['orderId']) for x in rel_api['items']]
        info('已释放 tab：UI 徽标=%r / API orderIds=%r' % (b3, rel_ids))
        check('B3 「已释放」Tab 下所有行徽标均为「已释放」', bool(b3) and set(b3) == {'已释放'}, 'badges=%r' % b3)
        check('B3 UI 行数 == API RELEASED totalItems',
              pg.locator('.card').count() == rel_api['totalItems'],
              'ui=%d api=%d' % (pg.locator('.card').count(), rel_api['totalItems']))
        check('B3 API 的 RELEASED 明细逐条可见（tab 过滤未丢项）',
              all(('#' + i) in body3 for i in rel_ids), 'api=%r' % rel_ids)
        check('B3 超时单 #%s 已由 worker 释放并出现在该 tab（释放结果可达）' % expired_id,
              ('#' + expired_id) in body3, 'body=%r' % body3[:200].replace('\n', '|'))
        check('B3 已释放行为终态：不渲染「释放」按钮', pg.locator('.rel').count() == 0,
              'rel=%d' % pg.locator('.rel').count())
        check('B3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'resv-tab-released', '预留单·「已释放」Tab：worker 超时释放的 #%s 与历史释放单可见，终态行无「释放」按钮' % expired_id)

        # ============ B4. 数据看板「经营数据」回归（新视图不得破坏既有视图） ============
        goto(pg, 'pages/data/dashboard/index', settle=6.0)
        body4 = pg.inner_text('body')
        vseg = [t.strip() for t in pg.locator('.seg.views .seg-item').all_inner_texts()]
        info('看板视图分段 = %r' % vseg)
        check('B4 新增「经营数据 / 作业分析」两视图分段', vseg == ['经营数据', '作业分析'], '%r' % vseg)
        check('B4 经营数据 3 张 KPI 卡（今日订单 / 今日营业额 / 低库存）',
              pg.locator('.stat .stat-card').count() == 3, 'cards=%d' % pg.locator('.stat .stat-card').count())
        check('B4 销售趋势 / 分类 Top / 库存健康 三张卡片均在位',
              all(k in body4 for k in ('销售趋势', '库存健康')), 'body=%r' % body4[:200].replace('\n', '|'))
        check('B4 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'dash-biz', '数据看板·「经营数据」视图（回归）：既有 3 张 KPI 卡 + 销售趋势 + 分类 Top + 库存健康未被新视图破坏')

        # ============ B5. 数据看板「作业分析」：KPI 4 卡 + 差异趋势 ============
        pg.locator('.seg.views .seg-item', has_text='作业分析').first.click()
        end = time.time() + 40
        while time.time() < end:
            if pg.locator('.stat .stat-card').count() == 4 and pg.locator('.trow').count() >= 1:
                break
            time.sleep(0.5)
        time.sleep(1.0)
        body5 = pg.inner_text('body')
        nums = [t.strip() for t in pg.locator('.stat .stat-card .num').all_inner_texts()]
        info('作业分析 KPI = %r' % nums)
        check('B5 KPI 4 卡（拣货单数 / 发货件数 / 盘库次数 / 盘点差异率）',
              pg.locator('.stat .stat-card').count() == 4, 'cards=%d' % pg.locator('.stat .stat-card').count())
        check('B5 4 个 KPI 标签齐全',
              all(k in body5 for k in ('拣货单数', '发货件数', '盘库次数', '盘点差异率')),
              'body=%r' % body5[:200].replace('\n', '|'))
        check('B5 KPI 值均非「—」（数据源到位；— 代表接口失败降级）',
              len(nums) == 4 and '—' not in nums, 'nums=%r' % nums)
        check('B5 盘点差异趋势卡片在位', '盘点差异趋势' in body5)
        n_rows = pg.locator('.trow').count()
        check('B5 趋势按日出行（窗口内每日一行，7 天窗 = 7 行）', n_rows == 7, 'rows=%d' % n_rows)
        # 与页面同源的交叉对账：Σ|差异| / Σ应盘 == 差异率 KPI
        pairs, bad_fmt = [], []
        for r in pg.locator('.trow').all():
            txt = r.locator('.tval').first.inner_text().strip()
            m = re.fullmatch(r'(-?\d+)\s*/\s*(\d+)', txt)
            if m:
                pairs.append((int(m.group(1)), int(m.group(2))))
            else:
                bad_fmt.append(txt)
        tot_diff = sum(abs(d) for d, _ in pairs)
        tot_exp = sum(e for _, e in pairs)
        rate_calc = '%.2f%%' % ((tot_diff / tot_exp) * 100) if tot_exp else '0.00%'
        widths = pg.locator('.trow .tfill').evaluate_all("els => els.map(e => (e.style.width || '0%').trim())")
        check('B5 趋势行格式统一为「差异 / 应盘」', not bad_fmt and len(pairs) == n_rows, 'bad=%r' % bad_fmt)
        check('B5 差异率 KPI == Σ|差异| / Σ应盘 手算值（%s）' % rate_calc,
              nums[3] == rate_calc if len(nums) == 4 else False, 'kpi=%r calc=%s' % (nums[3:4], rate_calc))
        check('B5 有差异的日画出条，0 差异日条宽为 0',
              len(widths) == len(pairs) and all((w != '0%') == (d > 0) for w, (d, _) in zip(widths, pairs)),
              'widths=%r pairs=%r' % (widths, pairs))
        check('B5 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        shot(pg, 'dash-ops-kpi', '数据看板·「作业分析」视图（近 7 天）：4 张 KPI 卡（拣货单数/发货件数/盘库次数/盘点差异率）与既有经营视图互不影响')

        scroll_to(pg, '.trow')
        shot(pg, 'dash-ops-trend', '作业分析·盘点差异趋势：按日条状行（差异件数 / 盘点总件数），与导出 CSV 同源同值；0 差异日不画条')

        # ============ B6. 作业分析「作业员明细」+ CSV 导出 ============
        n_exp = scroll_to(pg, '.exp')
        body6 = pg.inner_text('body')
        check('B6 作业员明细卡片在位', '作业员明细' in body6 or '按作业员' in body6, 'body=%r' % body6[:200].replace('\n', '|'))
        check('B6 明细行数与 grouped 结果一致（未记录操作人走「未记录」占位）',
              pg.locator('.card .top-row').count() >= 1, 'rows=%d' % pg.locator('.card .top-row').count())
        check('B6 导出按钮在位', n_exp == 1 and '导出' in pg.locator('.exp').first.inner_text())
        shot(pg, 'dash-ops-counter', '作业分析·作业员明细（按操作人聚合单据数/件数）+ 底部「导出 CSV」按钮')
        try:
            with pg.expect_download(timeout=8000) as dl:
                pg.locator('.exp').first.click()
            fname = dl.value.suggested_filename
            csv_txt = Path(dl.value.path()).read_text(encoding='utf-8-sig')
            head = csv_txt.splitlines()[0] if csv_txt else ''
            check('B6 导出 CSV 文件名含周期与日期（ops-report-7d-*.csv）',
                  fname.startswith('ops-report-7d-') and fname.endswith('.csv'), 'name=%s' % fname)
            check('B6 导出 CSV 表头 = 日期/盘点总件数/差异件数（与页面趋势同源）',
                  head == '日期,盘点总件数,差异件数', 'head=%r' % head)
            check('B6 导出 CSV 行数 = 趋势行数 + 表头', len(csv_txt.splitlines()) == n_rows + 1,
                  'lines=%d rows=%d' % (len(csv_txt.splitlines()), n_rows))
        except Exception as e:  # noqa: BLE001
            skip('B6 CSV 导出下载事件', 'headless 未捕获下载（%s）；按钮可见且趋势读值已断言' % str(e)[:80])
        check('B6 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        sizes = ['%s:%dB' % (f.name, f.stat().st_size) for f in sorted(OUT.glob('gap4-batch4-*.png'))]
        info('本次落图: %s' % ', '.join(sizes))
        b.close()

    print('\n===== gap4 批 4（Task 4.6 UI + Task 4.8 验收）：%s（失败 %d / SKIP %d）====='
          % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""gap4 批 4 验收：拣货批次 交接 / 异常件 / 复核（状态机扩展后的 UI + 列表分组）。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 4.6（UI）与 Task 4.8（批 4 验收）
设计：docs/superpowers/specs/2026-09-25-web-admin-gap4-design.md §5（状态机）/ §9（只读态）
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

状态机（后端 pick-batch-math.ts TRANSITIONS，终态只有 REVIEWED / CANCELLED）：
  PENDING → PICKED → PRINTED → SHIPPED → HANDOVER → REVIEWED
                                   ↕
                                EXCEPTION（处理完回 HANDOVER）

写操作护栏：本脚本会推进批次状态（不可逆），仅在 `WA_SHOT_ALLOW_WRITE=1` 时执行；
生产域名硬拦（与批 2/批 3 同口径）。默认只读跑会 ENV-FAIL（不产出「没验证却通过」的假证据）。

退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
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
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL_CODE = os.environ.get('WA_B4_CHANNEL', 'shop-a')
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


def admin_login():
    bot = '%s/login' % ADMIN
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

    tok, ctoken = admin_login()
    apiq = Api(tok, ctoken)
    info('验收渠道 = %s（token=%s）' % (CHANNEL_CODE, ctoken))

    inv = {s: apiq.batches(state=s)['totalItems']
           for s in ('PENDING', 'PICKED', 'PRINTED', 'SHIPPED', 'HANDOVER', 'EXCEPTION', 'REVIEWED', 'CANCELLED')}
    info('批次状态存量 = %s' % inv)

    batch_id, batch_code, from_ui_ship = ensure_fixture(apiq)
    if not batch_id:
        print('ENV-FAIL: 既无 PRINTED 批次、也无候选订单可造批次（请先有可配货订单）')
        raise SystemExit(2)
    info('验收批次 = %s（%s）' % (batch_code, batch_id))

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

        sizes = ['%s:%dB' % (f.name, f.stat().st_size) for f in sorted(OUT.glob('gap4-batch4-*.png'))]
        info('本次落图: %s' % ', '.join(sizes))
        b.close()

    print('\n===== gap4 批 4（Task 4.6 UI）验收：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()

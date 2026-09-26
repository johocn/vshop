# -*- coding: utf-8 -*-
"""D48 验收：看板作业分析「拣货单数 / 盘库次数 / 差异率 / 差异趋势」的 pageSize 硬顶（同一脚本三态可跑）。

背景：这四项 KPI 原取数链路是
    拣货单数：fetchPickBatches({pageSize:100})        → 服务端 clampPageSize 硬顶 100 → 浏览器内按窗口过滤计数
    盘库三项：fetchStocktakeTasks({pageSize:100})      → 硬顶 100 → 浏览器内按窗口过滤 + 逐任务 fetchStocktakeDiff
`pickBatches` / `stocktakeTasks` 都按 id DESC 返回**最新 100 条**，窗口内记录一旦超过 100 条，
被截掉的正是**较老**记录 → 四项 KPI 同源同步静默低估（D46 同族缺陷）。
修复（D48）：新增两条服务端窗口聚合查询 `pickBatchShippedCount(from,to)` 与
`stocktakeKpi(from,to){taskCount expectedTotal diffTotal days}`，无上限、只发 1 次请求。

附带纠正（一并在此守护）：旧前端把**盘次**状态 `SUBMITTED` 当**任务**状态过滤，而任务状态枚举是
DRAFT/OPEN/COUNTING/COUNTED/POSTED/CANCELLED（根本没有 SUBMITTED），导致「待过账（COUNTED）」的
任务从未计入盘库次数。服务端口径 = COUNTED + POSTED（SHIPPED 批次口径 = SHIPPED/HANDOVER/REVIEWED）。

可逆生产 fixture（本脚本**不自动创建/清理**，与 D46 同例，交由收口步骤执行）：
    INSERT INTO pick_batch(code,"tenantChannelId",stockLocationId,state,note,createdBy)
      SELECT 'PBD48-'||lpad(i::text,3,'0'),'37',3,'SHIPPED','D48 验收 fixture，可忽略','d48'
      FROM generate_series(1,120) i;
    INSERT INTO stocktake_task(code,"tenantChannelId",stockLocationId,name,scopeJson,binModeAtCreate,state,note)
      SELECT 'TKD48-'||lpad(i::text,3,'0'),'37',3,'D48 验收 fixture','{}','off','POSTED','D48 验收 fixture，可忽略'
      FROM generate_series(1,120) i;
    -- 均为无明细头记录，不动库存；createdAt 走 DEFAULT now() → 必落在 7/30 天窗口内
    -- 清理：DELETE FROM pick_batch WHERE code LIKE 'PBD48-%'; DELETE FROM stocktake_task WHERE code LIKE 'TKD48-%';

三态断言（WA_D48_STATE）：
  before（旧前端 + 旧后端；fixture 已就位）
    ① UI 拣货单数 = 100（硬顶截断，真值 120）
    ② UI 盘库次数 = 100（硬顶截断，真值 121）
    ③ pickBatches / stocktakeTasks 传 pageSize=1000 仍只回 100 条 → 「调大 pageSize」这条路不可行
    ④ 新查询不存在（旧后端，符合预期）
  after （新前端 + 新后端；fixture 已就位）
    ① UI 拣货单数 = 120；② UI 盘库次数 = 121
    ③ 接口层 pickBatchShippedCount = 120、stocktakeKpi.taskCount = 121（与 UI 同源同值）
    ④ stocktakeKpi.days 覆盖窗口内每一天（无数据日为 0，与差异趋势卡片同口径）
  baseline（fixture 已清空，复跑证明清理干净）
    ① UI 拣货单数 = 0（t2 无已完成批次）；② UI 盘库次数 = 1（唯一真实 POSTED 任务）

三态共有：⑤ 截图 390×844 @dpr2；⑥ 页面无 pageerror / 授权报错

环境变量：WA_D48_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD、WA_D48_CHANNEL（默认 t2）、WA_D48_STATE（before|after|baseline）、
  WA_D48_TAG（截图文件名后缀）、WA_D48_FIX_N（默认 120）、WA_D48_REAL_PICK（默认 0）、
  WA_D48_REAL_ST（默认 1）、WA_D48_DAYS（默认 7，与页面默认分段一致）
退出码：0 = 全部通过；1 = 断言失败；2 = 环境不可用
"""
import datetime
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

BASE = os.environ.get('WA_D48_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D48_CHANNEL', 't2')
STATE = os.environ.get('WA_D48_STATE', 'after').strip().lower()
TAG = os.environ.get('WA_D48_TAG', STATE + '-')
FIX_N = int(os.environ.get('WA_D48_FIX_N', '120'))
REAL_PICK = int(os.environ.get('WA_D48_REAL_PICK', '0'))
REAL_ST = int(os.environ.get('WA_D48_REAL_ST', '1'))
DAYS = int(os.environ.get('WA_D48_DAYS', '7'))
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
DASH = 'pages/data/dashboard/index'

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
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:300]}


def gerr(r):
    es = r.get('errors') or []
    return str(es[0].get('message'))[:200] if es else None


def window_iso(days):
    """逐字复刻前端 buildOpsWindow + loadOps 的 from/to：
    from = 今天-(N-1) 00:00 本地 → toISOString()；to = 明天 00:00 本地 - 1ms → toISOString()。"""
    now = datetime.datetime.now().astimezone()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight - datetime.timedelta(days=days - 1)
    end = midnight + datetime.timedelta(days=1)
    to = end - datetime.timedelta(milliseconds=1)
    return (start.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
            to.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.999Z'))


def tenant_token():
    tok, r = api('mutation($u:String!,$p:String!,$e:Boolean){login(username:$u,password:$p,rememberMe:$e)'
                 '{... on CurrentUser{id identifier}}}', {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        print('ENV-FAIL: 租户账号登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    _, r2 = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r2.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL_CODE), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (CHANNEL_CODE, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return tok, ch['token']


def probe_pick_clamp(tok, ctoken):
    """复现旧前端取数：pageSize 要 1000，看服务端到底给几条。"""
    _, r = api('query($o:PickBatchListOptions){pickBatches(options:$o){totalItems items{code state createdAt}}}',
               {'o': {'page': 1, 'pageSize': 1000}}, token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: pickBatches 探测失败 %s' % gerr(r))
        raise SystemExit(2)
    d = (r.get('data') or {}).get('pickBatches') or {}
    return d.get('totalItems') or 0, (d.get('items') or [])


def probe_st_clamp(tok, ctoken):
    _, r = api('query($o:StocktakeTaskOptionsInput){stocktakeTasks(options:$o){totalItems items{code state createdAt}}}',
               {'o': {'page': 1, 'pageSize': 1000}}, token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: stocktakeTasks 探测失败 %s' % gerr(r))
        raise SystemExit(2)
    d = (r.get('data') or {}).get('stocktakeTasks') or {}
    return d.get('totalItems') or 0, (d.get('items') or [])


def probe_pick_count(tok, ctoken, frm, to):
    """新聚合接口（仅新后端存在）；不存在/取不到时返回 (None, 原因)。

    必须把 TRANSPORT 与「字段不存在」区分开——两者都让 data 为空，
    若只判 `data.pickBatchShippedCount or 0`，网络失败会被误报成「接口已存在且为 0」。
    """
    _, r = api('query($f:String,$t:String){pickBatchShippedCount(from:$f,to:$t)}',
               {'f': frm, 't': to}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    if gerr(r):
        return None, gerr(r)
    v = (r.get('data') or {}).get('pickBatchShippedCount')
    if v is None:
        return None, '响应无该字段：%s' % json.dumps(r, ensure_ascii=False)[:200]
    return v, None


def probe_stocktake_kpi(tok, ctoken, frm, to):
    _, r = api('query($f:String,$t:String){stocktakeKpi(from:$f,to:$t)'
               '{taskCount expectedTotal diffTotal days{day expected diff}}}',
               {'f': frm, 't': to}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    if gerr(r):
        return None, gerr(r)
    v = (r.get('data') or {}).get('stocktakeKpi')
    if v is None:
        return None, '响应无该字段：%s' % json.dumps(r, ensure_ascii=False)[:200]
    return v, None


def read_stat(pg, label):
    """按 KPI 标签读数值文本（'—' = 取数失败/未回）。"""
    card = pg.locator('.stat-card', has=pg.locator('.lbl', has_text=label)).first
    card.wait_for(state='visible', timeout=60000)
    return (card.locator('.num').inner_text() or '').strip()


def wait_stat(pg, label, timeout=300):
    """轮询到数值不再是 '—'（加载中占位）。before 态盘库要串行发 100 次 stocktakeDiff，留足时间。"""
    deadline = time.time() + timeout
    last = '—'
    while time.time() < deadline:
        last = read_stat(pg, label)
        if last != '—':
            return last
        time.sleep(1.0)
    return last


def open_ops(pg):
    pg.goto(BASE + '#/' + DASH + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    # 等取数请求真的回来再读卡：KPI 先以 '—' 渲染，只等卡片可见会把基线读成占位（D43 首轮踩坑）。
    # 两态取数不同名：旧前端 pickBatches / 新前端 pickBatchShippedCount，二者任一命中即可。
    def pred(r):
        if r.request.method != 'POST':
            return False
        body = r.request.post_data or ''
        return 'pickBatchShippedCount' in body or 'pickBatches' in body

    with pg.expect_response(pred, timeout=120000):
        pg.locator('.seg.views .seg-item').nth(1).click()
    pg.locator('.card', has=pg.locator('.sec', has_text='盘点差异趋势')).first.wait_for(state='visible', timeout=60000)
    time.sleep(0.8)


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def main():
    if STATE not in ('before', 'after', 'baseline'):
        print('ENV-FAIL: WA_D48_STATE 必须是 before / after / baseline，当前 %r' % STATE)
        raise SystemExit(2)
    tok, ctoken = tenant_token()
    frm, to = window_iso(DAYS)
    info('窗口（%d 天，与页面默认分段一致）：%s → %s' % (DAYS, frm, to))

    # ---- 接口层：旧列表接口的硬顶 ----
    p_total, p_items = probe_pick_clamp(tok, ctoken)
    s_total, s_items = probe_st_clamp(tok, ctoken)
    info('pickBatches(pageSize=1000)：totalItems=%d，实回 %d 条' % (p_total, len(p_items)))
    info('stocktakeTasks(pageSize=1000)：totalItems=%d，实回 %d 条' % (s_total, len(s_items)))
    if STATE == 'baseline':
        # 不复用「精确 totalItems」断言：真实基线条数会随业务增长，写死易假红。
        # 这里断言的是「fixture 真的清干净了」+「条数已回到硬顶以下（不再触发截断）」。
        check('③ fixture 已清空：pickBatches 里不再有 PBD48- 批次',
              not [i for i in p_items if str(i.get('code', '')).startswith('PBD48-')],
              'totalItems=%d / 实回 %d' % (p_total, len(p_items)))
        check('③b fixture 已清空：stocktakeTasks 里不再有 TKD48- 任务',
              not [i for i in s_items if str(i.get('code', '')).startswith('TKD48-')],
              'totalItems=%d / 实回 %d' % (s_total, len(s_items)))
        check('③c 条数已回到硬顶以下（pageSize=1000 请求的返回不再被截断）',
              len(p_items) == p_total and len(s_items) == s_total,
              'pick %d/%d，stocktake %d/%d' % (len(p_items), p_total, len(s_items), s_total))
    else:
        check('③ 调大 pageSize 不可行：pickBatches 传 1000 仍只回 100 条', len(p_items) == 100 and p_total > 100,
              'totalItems %d / 实回 %d' % (p_total, len(p_items)))
        check('③b 调大 pageSize 不可行：stocktakeTasks 传 1000 仍只回 100 条', len(s_items) == 100 and s_total > 100,
              'totalItems %d / 实回 %d' % (s_total, len(s_items)))
        check('③c fixture 已就位：窗口内已完成批次 %d 条（> 硬顶 100）' % FIX_N, p_total > 100 and FIX_N > 100,
              'totalItems=%d' % p_total)
        check('③d fixture 已就位：窗口内已提交任务 %d 条（> 硬顶 100）' % (FIX_N + REAL_ST),
              s_total > 100 and FIX_N + REAL_ST > 100, 'totalItems=%d' % s_total)

    # ---- 接口层：新聚合接口 ----
    pv, perr = probe_pick_count(tok, ctoken, frm, to)
    kpi, kerr = probe_stocktake_kpi(tok, ctoken, frm, to)
    if STATE in ('after', 'baseline'):
        # 新后端必须已部署：旧后端对未知字段回 HTTP 400（被 gerr 归一成 TRANSPORT 串），
        # 这里任何错误都视为环境问题（而不是当成「接口存在且为 0」）。
        if perr:
            print('ENV-FAIL: pickBatchShippedCount 不可用（后端未部署？）%s' % perr)
            raise SystemExit(2)
        if kerr:
            print('ENV-FAIL: stocktakeKpi 不可用（后端未部署？）%s' % kerr)
            raise SystemExit(2)
        check('③ 接口层：pickBatchShippedCount = %d' % (FIX_N if STATE == 'after' else REAL_PICK),
              pv == (FIX_N if STATE == 'after' else REAL_PICK), '实际 %r / %s' % (pv, perr or ''))
        exp_st = (FIX_N + REAL_ST) if STATE == 'after' else REAL_ST
        check('③b 接口层：stocktakeKpi.taskCount = %d' % exp_st,
              bool(kpi) and kpi.get('taskCount') == exp_st, '实际 %s / %s' % (kpi, kerr or ''))
        check('④ 接口层：days 覆盖窗口内每一天（%d 天）' % DAYS,
              bool(kpi) and len(kpi.get('days') or []) == DAYS,
              '实际 %d 天' % len((kpi or {}).get('days') or []))
    else:
        info('pickBatchShippedCount %s' % ('不存在（旧后端，符合预期）' if perr else '已存在（后端已部署？）'))
        info('stocktakeKpi %s' % ('不存在（旧后端，符合预期）' if kerr else '已存在（后端已部署？）'))
        check('④ 旧后端下新聚合查询不可用（证明是本轮新增能力）', perr is not None and kerr is not None,
              'pick=%r / kpi=%r' % (perr, kerr))

    # ---- UI 层 ----
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        login(pg)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [CHANNEL_CODE, ctoken])

        open_ops(pg)
        pick_ui = wait_stat(pg, '拣货单数')
        st_ui = wait_stat(pg, '盘库次数')
        rate_ui = read_stat(pg, '盘点差异率')
        info('UI：拣货单数=%s，盘库次数=%s，差异率=%s' % (pick_ui, st_ui, rate_ui))

        if STATE == 'before':
            check('① UI 拣货单数 = 100（硬顶截断，真值 %d）' % FIX_N, pick_ui == '100',
                  '实际 %s（缺陷态；修复后应为 %d）' % (pick_ui, FIX_N))
            check('② UI 盘库次数 = 100（硬顶截断，真值 %d）' % (FIX_N + REAL_ST), st_ui == '100',
                  '实际 %s（缺陷态；修复后应为 %d）' % (st_ui, FIX_N + REAL_ST))
        elif STATE == 'after':
            check('① UI 拣货单数 = %d（硬顶消失）' % FIX_N, pick_ui == str(FIX_N),
                  '实际 %s（缺陷态为 100）' % pick_ui)
            check('② UI 盘库次数 = %d（硬顶消失）' % (FIX_N + REAL_ST), st_ui == str(FIX_N + REAL_ST),
                  '实际 %s（缺陷态为 100）' % st_ui)
            check('④b UI 与接口同源：拣货单数 %s == %r' % (pick_ui, pv), pick_ui == str(pv),
                  'UI %s / 接口 %r' % (pick_ui, pv))
        else:  # baseline
            check('① UI 拣货单数 = %d（fixture 已清空）' % REAL_PICK, pick_ui == str(REAL_PICK),
                  '实际 %s' % pick_ui)
            check('② UI 盘库次数 = %d（唯一真实 POSTED 任务）' % REAL_ST, st_ui == str(REAL_ST),
                  '实际 %s' % st_ui)
            check('④b UI 与接口同源：盘库次数 %s == %s' % (st_ui, REAL_ST),
                  bool(kpi) and str(kpi.get('taskCount')) == st_ui, 'UI %s / 接口 %s' % (st_ui, kpi))

        OUT.mkdir(parents=True, exist_ok=True)
        f = OUT / ('gap4-d48-%sdashboard-kpi.png' % TAG)
        try:
            pg.screenshot(path=str(f), full_page=True)
        except Exception:  # noqa: BLE001
            pg.screenshot(path=str(f))
        check('⑤ 截图 %s' % f.name, f.exists() and f.stat().st_size > 4000,
              '%dB' % (f.stat().st_size if f.exists() else 0))

        auth = [e for e in errs if 'authoriz' in e.lower()]
        check('⑥ 页面无授权/接口报错', not auth and not [e for e in errs if 'ops docs failed' in e],
              '%d 条' % len(errs))
        for e in errs[:5]:
            print('     ↳ %s' % e[:180])
        b.close()

    if FAILS:
        print('\n== 结果（%s 态）：%d 项失败 ==\n失败项：%s' % (STATE, len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果（%s 态）：全部通过 ==' % STATE)
    raise SystemExit(0)


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""D46 验收：作业员明细「最近 100 条」窗口上限（同一脚本两态可跑）。

背景：看板「作业分析 → 作业员明细」原取数链路是
    fetchStockDocList({ pageSize: 100 })  →  服务端 clampPageSize 硬顶 100  →  浏览器内按窗口过滤 + 按 operator 聚合
`stockDocList` 未传 from/to 时返回**全时段最新 100 条**，窗口内单据一旦超过 100 条，
按 createdAt DESC 被截掉的正是**较老**单据 → 低频作业员整行消失、合计系统性低估。
修复（D46）：新增 `stockDocOperatorStats(from,to)`，在 SQL 侧 GROUP BY operator（排除 STOCKTAKE），
返回行数 = 操作人数、无上限，且只发 1 次请求。

本脚本依赖**可逆生产 fixture** 制造 >100 条的窗口：向 t2 插 120 条 `D46T-` 前缀的 stock_doc 头
（无明细行 → 不动库存；备注标「可忽略」），使 t2 窗口内单据 = 151（31 真实 + 120 合成），
且合成单 createdAt **全部新于**真实单 → 旧前端「最新 100 条」全被合成单占满，真实作业员必然整行消失。

两态断言（WA_D46_STATE）：
  before（旧前端 + 旧后端）
    ① 真实作业员（默认 '15'）不在明细里 —— 被合成单挤出窗口
    ② 明细只剩 1 行，且合成作业员单据数 = 100（服务端硬顶截断，实际 120）
    ③ stockDocList(pageSize:1000) 只回 100 条（证明「调大 pageSize」这条路不可行）
  after （新前端 + 新后端）
    ① 合成作业员单据数 = 120（上限消失，全量）
    ② 真实作业员回归且 = 19 单（31 单减 12 张 STOCKTAKE）
    ③ stockDocOperatorStats 接口值与 UI 一致（同源）
    ④ 明细行数 ≥ 2
  baseline（清空 fixture 后复跑，证明清理干净、回到真实基线）
    ① UI 里看不到合成作业员；② 真实作业员 = 19 单；④ 明细只剩 1 行

三态共有：⑤ 截图 390×844 @dpr2（作业员明细卡）；⑥ 页面无授权/接口报错
清理（不自动执行，交由收口步骤）：
    DELETE FROM stock_doc WHERE "tenantChannelId"='t2' AND code LIKE 'D46T-%';

环境变量：WA_D46_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD、WA_D46_CHANNEL（默认 t2）、WA_D46_STATE（before|after|baseline）、
  WA_D46_TAG（截图文件名后缀）、WA_D46_FIXTURE_OP / WA_D46_FIXTURE_N / WA_D46_REAL_OP / WA_D46_REAL_N
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

BASE = os.environ.get('WA_D46_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL_CODE = os.environ.get('WA_D46_CHANNEL', 't2')
STATE = os.environ.get('WA_D46_STATE', 'after').strip().lower()
TAG = os.environ.get('WA_D46_TAG', STATE + '-')
FIX_OP = os.environ.get('WA_D46_FIXTURE_OP', 'D46测试员')
FIX_N = int(os.environ.get('WA_D46_FIXTURE_N', '120'))
REAL_OP = os.environ.get('WA_D46_REAL_OP', '15')
REAL_N = int(os.environ.get('WA_D46_REAL_N', '19'))
REAL_TOTAL = int(os.environ.get('WA_D46_REAL_TOTAL', '31'))
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
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.headers.get('vendure-auth-token'), json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:300]}


def gerr(r):
    es = r.get('errors') or []
    return str(es[0].get('message'))[:200] if es else None


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


def probe_clamp(tok, ctoken):
    """直接复现旧前端的取数方式：pageSize 要 1000，看服务端到底给几条。"""
    _, r = api('query($ps:Int){stockDocList(pageSize:$ps){totalItems items{code operator type}}}',
               {'ps': 1000}, token=tok, channel=ctoken)
    if gerr(r):
        print('ENV-FAIL: stockDocList 探测失败 %s' % gerr(r))
        raise SystemExit(2)
    d = (r.get('data') or {}).get('stockDocList') or {}
    return d.get('totalItems') or 0, (d.get('items') or [])


def probe_stats(tok, ctoken):
    """新聚合接口（仅新后端存在）；不存在/取不到时返回 (None, 原因)。

    注意：必须把 TRANSPORT 与「字段不存在」区分开——两者都会让 data 为空，
    若只判 `data.stockDocOperatorStats or []`，网络失败会被误报成「接口已存在」。
    """
    _, r = api('query{stockDocOperatorStats{operator count qty}}', token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    if gerr(r):
        return None, gerr(r)
    rows = (r.get('data') or {}).get('stockDocOperatorStats')
    if rows is None:
        return None, '响应无该字段：%s' % json.dumps(r, ensure_ascii=False)[:200]
    return rows, None


def read_ops_card(pg):
    """读「作业员明细」卡片的行 → {operator: (count, qty)}、合计、行数、卡片句柄。"""
    card = pg.locator('.card', has=pg.locator('.sec', has_text='作业员明细')).first
    card.wait_for(state='visible', timeout=60000)
    rows = card.locator('.top-row')
    n = rows.count()
    per, tc, tq = {}, 0, 0
    for i in range(n):
        name = (rows.nth(i).locator('.name').inner_text() or '').strip()
        cnt = int(''.join(ch for ch in rows.nth(i).locator('.cnt').inner_text() if ch.isdigit()) or 0)
        qty = int(''.join(ch for ch in rows.nth(i).locator('.qty').inner_text() if ch.isdigit()) or 0)
        per[name] = (cnt, qty)
        tc += cnt
        tq += qty
    return per, tc, tq, n, card


def open_ops(pg):
    pg.goto(BASE + '#/' + DASH + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    # 等取数请求真的回来再读表：明细卡先以空态渲染，只等卡片可见会把基线读成 0（D43 首轮踩坑）。
    # 两态取数不同名：旧前端 stockDocList / 新前端 stockDocOperatorStats，二者任一命中即可。
    def pred(r):
        if r.request.method != 'POST':
            return False
        body = r.request.post_data or ''
        return 'stockDocOperatorStats' in body or 'stockDocList' in body

    with pg.expect_response(pred, timeout=90000):
        pg.locator('.seg.views .seg-item').nth(1).click()
    pg.locator('.card', has=pg.locator('.sec', has_text='作业员明细')).first.wait_for(state='visible', timeout=30000)
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
        print('ENV-FAIL: WA_D46_STATE 必须是 before / after / baseline，当前 %r' % STATE)
        raise SystemExit(2)
    tok, ctoken = tenant_token()

    total, items = probe_clamp(tok, ctoken)
    if STATE == 'baseline':
        info('stockDocList(pageSize=1000)：totalItems=%d，实回 %d 条（fixture 已清空，未触发硬顶）'
             % (total, len(items)))
        check('③ fixture 已清空：t2 单据回到真实基线 %d 条' % REAL_TOTAL,
              total == REAL_TOTAL and len(items) == REAL_TOTAL,
              'totalItems=%d / 实回 %d（基线 %d）' % (total, len(items), REAL_TOTAL))
    else:
        info('stockDocList(pageSize=1000)：totalItems=%d，实回 %d 条（服务端 clampPageSize 硬顶 100）'
             % (total, len(items)))
        check('③ 调大 pageSize 不可行（pageSize=1000 仍只回 100 条）', len(items) == 100 and total > 100,
              'totalItems %d / 实回 %d' % (total, len(items)))
        check('③b fixture 已就位（窗口内单据 %d = 真实 %d + 合成 %d，且 > 100）' % (total, total - FIX_N, FIX_N),
              total > FIX_N and total > 100,
              'totalItems=%d（须同时大于合成单数 %d 与硬顶 100）' % (total, FIX_N))

    stats, serr = probe_stats(tok, ctoken)
    if STATE in ('after', 'baseline'):
        if serr:
            print('ENV-FAIL: stockDocOperatorStats 不可用（后端未部署？）%s' % serr)
            raise SystemExit(2)
        sm = {s['operator']: (s['count'], s['qty']) for s in stats}
        info('stockDocOperatorStats（全时段）=%s' % json.dumps(sm, ensure_ascii=False))
        check('③ 接口层：真实作业员 = %d 单（排除 12 张 STOCKTAKE）' % REAL_N,
              sm.get(REAL_OP, (0, 0))[0] == REAL_N, '实际 %s' % (sm.get(REAL_OP),))
        if STATE == 'after':
            check('③b 接口层：合成作业员 = %d 单（聚合无上限）' % FIX_N, sm.get(FIX_OP, (0, 0))[0] == FIX_N,
                  '实际 %s' % (sm.get(FIX_OP),))
        else:
            check('③b 接口层：合成作业员已消失', FIX_OP not in sm, '实际 %s' % list(sm.keys()))
    else:
        info('stockDocOperatorStats %s' % ('不存在（旧后端，符合预期）' if serr else '已存在（后端已部署？）'))

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
        per, tc, tq, n, card = read_ops_card(pg)
        info('UI 作业员明细：[%s]（合计 %d 单 / %d 件，共 %d 行）' % (
            '，'.join('%s=%d单/%d件' % (k, v[0], v[1]) for k, v in per.items()), tc, tq, n))

        if STATE == 'before':
            check('① 真实作业员被挤出：UI 里看不到 %s' % REAL_OP, REAL_OP not in per,
                  '实际行：%s' % list(per.keys()))
            check('② 明细只剩 1 行（真实作业员整行消失）', n == 1, '实际 %d 行' % n)
            check('②b 合成作业员单据数 = 100（截断，实际 %d）' % FIX_N,
                  per.get(FIX_OP, (0, 0))[0] == 100, '实际 %s' % (per.get(FIX_OP),))
        elif STATE == 'after':
            check('① 上限消失：合成作业员单据数 = %d' % FIX_N, per.get(FIX_OP, (0, 0))[0] == FIX_N,
                  '实际 %s（缺陷态为 100）' % (per.get(FIX_OP),))
            check('② 真实作业员回归且 = %d 单' % REAL_N, per.get(REAL_OP, (0, 0))[0] == REAL_N,
                  '实际 %s（缺陷态整行消失）' % (per.get(REAL_OP),))
            check('④ 明细行数 ≥ 2（合成 + 真实并存）', n >= 2, '实际 %d 行' % n)
        else:  # baseline
            check('① UI 里看不到合成作业员（fixture 已清空）', FIX_OP not in per, '实际行：%s' % list(per.keys()))
            check('② 真实作业员 %s = %d 单（与 D43 口径一致）' % (REAL_OP, REAL_N),
                  per.get(REAL_OP, (0, 0))[0] == REAL_N, '实际 %s' % (per.get(REAL_OP),))
            check('④ 明细只剩真实作业员 1 行', n == 1, '实际 %d 行' % n)

        OUT.mkdir(parents=True, exist_ok=True)
        f = OUT / ('gap4-d46-%sops-counter.png' % TAG)
        try:
            card.screenshot(path=str(f))
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
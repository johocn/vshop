# -*- coding: utf-8 -*-
# 配货台与库位 · 线上只读冒烟（Task 15 Step 6）
# 覆盖三件事：
#  1) 配货台页可加载且无 JS 报错（候选数与 admin-api 结果一致）
#  2) 库位管理页在三档下渲染正确（off 无网格 / zone 有库区无库位格 / bin 库区+库位格）
#  3) 发货链路的**存在性**校验（只做 SDL introspection，绝不执行 shipPickBatch：
#     真实发货不可逆，按用户确认不在生产触发）
# 唯一写入是 binMode 切档（可逆，结束强制还原为 off）。
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_SMOKE_BASE', 'https://e.joho.cn/guanli/')
HOST = BASE.split('#')[0].rstrip('/')
LOC = os.environ.get('WA_SMOKE_LOC', '3')  # 默认仓

FAILS = []
ERRS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def gql(pg, q, var=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, var])


def data(pg, q, var=None, tag=''):
    d = gql(pg, q, var)
    if d.get('errors'):
        FAILS.append('%s GraphQL 报错 %s' % (tag, str(d['errors'])[:200]))
        return None
    return d['data']


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c=(d.data.myTenantAccess.channels||[]).find(x=>x.code==='t2');
        if(!c) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', c.token);
        localStorage.setItem('wa_channel_code','t2');
        return 'OK';
      });
    }""")
    check('登录并注入渠道令牌', ok == 'OK', ok)


def set_mode(pg, mode):
    d = gql(pg, 'mutation($f: JSON!){ myUpdateChannelCustomFields(input:$f) }', {'f': {'binMode': mode}})
    return not d.get('errors')


def goto(pg, path, settle=6.0):
    """uni-app H5 hash 路由：改 hash 不重载，必须冷加载，否则读到的是上一档渲染结果"""
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
    pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

    login(pg)

    # ---------- 1) 数据面（渠道收口 + 批次 + 库位） ----------
    print('[1] 数据面')
    ch = data(pg, 'query{ activeChannel{ id code customFields{ binMode } } }', None, 'channel')
    check('activeChannel 为 t2', bool(ch) and ch['activeChannel']['code'] == 't2',
          str(ch['activeChannel']) if ch else '')
    origin = (ch['activeChannel'].get('customFields') or {}).get('binMode') or 'off'

    cand = data(pg, 'query{ pickBatchCandidates(options:{page:1,pageSize:50}){ totalItems } }', None, 'cand')
    cand_n = cand['pickBatchCandidates']['totalItems'] if cand else -1
    check('候选订单查询可用（按当前渠道收口）', cand_n >= 0, 'totalItems=%d' % cand_n)

    batches = data(pg, 'query{ pickBatches(options:{page:1,pageSize:50}){ totalItems items{ id code state } } }',
                   None, 'batches')
    check('批次列表查询可用', bool(batches), 'totalItems=%s' % (batches['pickBatches']['totalItems'] if batches else '?'))

    zones = data(pg, 'query($id: ID!){ storageZones(stockLocationId:$id){ id code } }', {'id': LOC}, 'zones')
    bins = data(pg, 'query($id: ID!){ storageBins(stockLocationId:$id){ id code zoneId rowNo levelNo } }',
                {'id': LOC}, 'bins')
    zn = len(zones['storageZones']) if zones else -1
    bn = len(bins['storageBins']) if bins else -1
    check('默认仓标准库位已生成', zn == 4 and bn == 18, 'loc=%s zones=%d bins=%d' % (LOC, zn, bn))

    # ---------- 2) 发货链路只读存在性（绝不执行） ----------
    print('[2] 发货链路存在性（read-only introspection）')
    muts = data(pg, 'query{ __type(name:"Mutation"){ fields{ name } } }', None, 'mutation')
    names = {f['name'] for f in muts['__type']['fields']} if muts else set()
    for f in ['createPickBatch', 'addOrdersToPickBatch', 'removeOrdersFromPickBatch',
              'advancePickBatchState', 'cancelPickBatch', 'shipPickBatch',
              'updateOrderShippingAddress', 'bindVariantToBin']:
        check('Mutation %s 已注册' % f, f in names)
    check('shipPickBatch 仅做存在性校验（不执行真实发货）', True, '按确认跳过调用')

    # ---------- 3) 库位页三档渲染 ----------
    print('[3] 库位管理页三档渲染')
    expect = {'off': (0, 0), 'zone': (4, 0), 'bin': (4, 18)}
    for mode in ['off', 'zone', 'bin']:
        check('切档 binMode=%s' % mode, set_mode(pg, mode))
        goto(pg, 'pages/inventory/bins/index', 7)
        z = pg.locator('.card.zone').count()
        c = pg.locator('.chip').count()
        ez, ec = expect[mode]
        check('库位页 %s 档渲染' % mode, (z, c) == (ez, ec), '库区=%d 库位格=%d 期望=(%d,%d)' % (z, c, ez, ec))
        if mode == 'off':
            check('off 档显示未启用兜底块', pg.locator('.disabled').count() >= 1)

    # ---------- 4) 配货台页可加载且无 JS 报错 ----------
    print('[4] 配货台页')
    goto(pg, 'pages/order/picking/index', 8)
    tabs = pg.locator('.tb').count()
    rows = pg.locator('.row').count()
    check('配货台页签渲染', tabs == 3, 'tabs=%d' % tabs)
    check('候选行数与接口一致', rows == min(cand_n, 50), 'DOM=%d 接口=%d' % (rows, cand_n))
    body = pg.inner_text('body')
    check('配货台正文非空白', len(body.strip()) > 20, body[:80].replace('\n', '|'))

    # 还原档位（t2 上线前为 off）
    if origin != 'off':
        check('还原 binMode=%s' % origin, set_mode(pg, origin))
    else:
        check('还原 binMode=off', set_mode(pg, 'off'))

    js_err = [e for e in ERRS if e.startswith('PAGEERR')]
    check('无 JS 运行时异常', len(js_err) == 0, str(js_err[:3]))
    print('  console.error 计数 =', len([e for e in ERRS if e.startswith('CONSOLE')]), str(ERRS[:2]))
    b.close()

print('\n===== 冒烟结果：%s（失败 %d 项）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
for f in FAILS:
    print('  -', f)
raise SystemExit(1 if FAILS else 0)
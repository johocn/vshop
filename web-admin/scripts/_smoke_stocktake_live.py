# -*- coding: utf-8 -*-
# 多人协同盘库 · 只读冒烟（Task 16 Step 1/2/7）
# 覆盖五件事，**全程不建任务、不过账、不改库存**（唯一可选写入由 WA_SMOKE_SETMODE 控制，默认关）：
#  1) 盘库 admin SDL 齐备（6 查询 + 10 变更）
#  2) 权限点已注册进 Vendure 的 Permission 枚举（StocktakeCount / StocktakePost）
#  3) 数据面可查且按渠道收口（stocktakeTasks / stocktakeDiff / binOccupancy / variantBinsByLocation）
#  4) 前端三页可达、关键 DOM 存在、无 JS 运行时异常
#  5) shop-api **不含**盘库字段（规格 §3.8：有意只注册 admin，须显式断言，防将来误加）
import json
import os
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_SMOKE_BASE', 'https://e.joho.cn/guanli/')
LOC = os.environ.get('WA_SMOKE_LOC', '3')          # 默认仓
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 't2')
# shop-api 探针另走直连 HTTP：本地 vite dev server 的 proxy 只映射了 /admin-api，
# 页面内 fetch('/shop-api') 会打到 dev server 自己（返回非 JSON）而非后端。
# 线上（nginx 代理）用默认值即可；本地跑传 WA_SMOKE_SHOP_API=http://localhost:3000/shop-api。
SHOP_API = os.environ.get('WA_SMOKE_SHOP_API', BASE.split('/guanli')[0].rstrip('/') + '/shop-api')

FAILS = []
ERRS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def gql(pg, q, var=None, api='admin'):
    return pg.evaluate("""async ([q, v, api]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const h = {'Content-Type':'application/json'};
      if (t) h['Authorization'] = 'Bearer ' + t;
      if (ct) h['vendure-token'] = ct;
      const r = await fetch('/' + api + '-api', {method:'POST', headers:h,
        body: JSON.stringify({query:q, variables:v||{}})});
      const nt = r.headers.get('vendure-auth-token');
      if (nt) localStorage.setItem('wa_auth_token', nt);
      return await r.json();
    }""", [q, var, api])


def data(pg, q, var=None, tag='', api='admin'):
    d = gql(pg, q, var, api)
    if d.get('errors'):
        FAILS.append('%s GraphQL 报错 %s' % (tag, str(d['errors'])[:200]))
        return None
    return d['data']


def http_gql(url, q, var=None, channel_token=None):
    """直连后端（用于 shop-api）：不依赖前端 dev server 的 proxy，也就绕开了浏览器同源限制。"""
    body = json.dumps({'query': q, 'variables': var or {}}).encode()
    h = {'Content-Type': 'application/json'}
    if channel_token:
        h['vendure-token'] = channel_token
    req = urllib.request.Request(url, data=body, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001
        return {'_httpError': str(e)[:200]}


def login(pg):
    pg.goto(BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=40000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    time.sleep(8)
    ok = pg.evaluate("""async ([code]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})});
      const d = await r.json();
      const cs = ((d.data||{}).myTenantAccess||{}).channels || [];
      const c = cs.find(x=>x.code===code);
      if(!c) return 'NOCHANNEL:' + cs.map(x=>x.code).join(',');
      localStorage.setItem('wa_channel_token', c.token);
      localStorage.setItem('wa_channel_code', c.code);
      return 'OK';
    }""", [CHANNEL])
    check('登录并注入渠道令牌（%s）' % CHANNEL, ok == 'OK', ok)


def set_channel(pg, token):
    pg.evaluate('(t) => localStorage.setItem("wa_channel_token", t)', token)
    time.sleep(0.4)


def goto(pg, path, settle=6.0):
    """uni-app H5 hash 路由：改 hash 不重载，必须冷加载"""
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


TASK_Q = 'query{ stocktakeTasks(options:{page:1,pageSize:5}){ totalItems items{ id code state } } }'

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
    pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

    login(pg)
    # 渠道还原用：把目标渠道 token 存到局部变量（改 hash/冷加载后 window 变量会丢）
    TARGET_TOKEN = pg.evaluate('() => localStorage.getItem("wa_channel_token")')

    # ---------- 1) SDL 齐备 ----------
    print('[1] 盘库 SDL 齐备（仅 admin-api）')
    qs = data(pg, 'query{ __type(name:"Query"){ fields{ name } } }', None, 'queryType')
    ms = data(pg, 'query{ __type(name:"Mutation"){ fields{ name } } }', None, 'mutationType')
    qnames = {f['name'] for f in qs['__type']['fields']} if qs else set()
    mnames = {f['name'] for f in ms['__type']['fields']} if ms else set()
    for f in ['stocktakeTasks', 'stocktakeTask', 'stocktakeWaves', 'stocktakeExpectedLines',
              'stocktakeDiff', 'stocktakeResolveCode', 'variantBinsByLocation', 'binOccupancy']:
        check('Query %s 已注册' % f, f in qnames)
    for f in ['createStocktakeTask', 'addStocktakeWave', 'assignStocktakeWave', 'claimStocktakeWave',
              'releaseStocktakeWave', 'saveStocktakeCounts', 'submitStocktakeWave', 'postStocktake',
              'cancelStocktakeTask', 'cancelStocktakeWave']:
        check('Mutation %s 已注册' % f, f in mnames)

    # ---------- 2) 权限点枚举 ----------
    print('[2] 权限点已注册')
    perm = data(pg, 'query{ __type(name:"Permission"){ enumValues{ name } } }', None, 'perm')
    pnames = {v['name'] for v in perm['__type']['enumValues']} if perm else set()
    check('Permission StocktakeCount', 'StocktakeCount' in pnames)
    check('Permission StocktakePost', 'StocktakePost' in pnames)

    # ---------- 3) 数据面 + 渠道收口 ----------
    print('[3] 数据面（%s）' % CHANNEL)
    t2 = data(pg, TASK_Q, None, 'tasks')
    t2_items = (t2 or {}).get('stocktakeTasks', {}).get('items', [])
    check('stocktakeTasks 可查', t2 is not None,
          'totalItems=%s' % ((t2 or {}).get('stocktakeTasks', {}).get('totalItems')))

    occ = data(pg, 'query($id: ID!){ binOccupancy(stockLocationId:$id){ binId binCode skuCount } }',
               {'id': LOC}, 'occupancy')
    occ_n = len(occ['binOccupancy']) if occ else -1
    check('binOccupancy 可查（含空格）', occ_n > 0, 'loc=%s bins=%d' % (LOC, occ_n))
    if occ and occ['binOccupancy']:
        check('binOccupancy 返回含空格子（skuCount = 0）',
              any(x['skuCount'] == 0 for x in occ['binOccupancy']),
              'zeros=%d' % len([x for x in occ['binOccupancy'] if x['skuCount'] == 0]))

    vb = data(pg, 'query($id: ID!){ variantBinsByLocation(stockLocationId:$id, page:1, pageSize:5){ totalItems items{ sku binCode } } }',
              {'id': LOC}, 'variantBins')
    check('variantBinsByLocation 分页可查', vb is not None,
          'totalItems=%s items=%s' % ((vb or {}).get('variantBinsByLocation', {}).get('totalItems'),
                                      len((vb or {}).get('variantBinsByLocation', {}).get('items', []))))

    if t2_items:
        tid = str(t2_items[0]['id'])
        d = data(pg, 'query($taskId: ID!){ stocktakeDiff(taskId:$taskId){ expectedTotal countedTotal uncountedCount extraCount diffCount recheck } }',
                 {'taskId': tid}, 'diff')
        check('stocktakeDiff 可查', d is not None and d['stocktakeDiff'] is not None,
              'task=%s %s' % (t2_items[0]['code'], str((d or {}).get('stocktakeDiff'))[:120]))
        check('任务状态取值合法', t2_items[0]['state'] in
              {'DRAFT', 'OPEN', 'COUNTING', 'COUNTED', 'POSTED', 'CANCELLED'}, t2_items[0]['state'])
    else:
        check('stocktakeDiff 可查（无任务，跳过）', True, 'SKIP：%s 下暂无盘点任务' % CHANNEL)

    # 渠道收口：换另一渠道再查，两边 id 集合必须无交集（前车之鉴，规格 §12 必测）
    # 可比渠道优先取登录账号自己的 myTenantAccess.channels；线上该账号只属于单一渠道，
    # 此时退回 admin 的 channels 列表再找一个（拿不到就保持 SKIP，不虚报 OK）。
    raw = pg.evaluate("""async ([code]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ask = async (query) => {
        const r = await fetch('/admin-api', {method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
          body: JSON.stringify({query})});
        return await r.json();
      };
      let cs = (((await ask('query{ myTenantAccess{ channels{ id code token } } }')).data||{}).myTenantAccess||{}).channels || [];
      if (!cs.some(x => x.code !== code)) {
        const d2 = await ask('query{ channels{ items{ id code token } } }');
        cs = ((d2.data||{}).channels||{}).items || [];
      }
      const o = cs.find(x => x.code !== code) || {};
      return (o.code || '') + '|' + (o.token || '');
    }""", [CHANNEL])
    OTHER_CODE, other = (raw or '|').split('|', 1)
    if other and t2_items:
        set_channel(pg, other)
        oth = data(pg, TASK_Q, None, 'tasksOther')
        oth_items = (oth or {}).get('stocktakeTasks', {}).get('items', [])
        inter = {str(x['id']) for x in t2_items} & {str(x['id']) for x in oth_items}
        check('渠道收口：两渠道任务 id 无交集', len(inter) == 0,
              'channel=%s totalItems=%s 交集=%s' % (OTHER_CODE,
                                                    ((oth or {}).get('stocktakeTasks', {}) or {}).get('totalItems'),
                                                    list(inter)))
        set_channel(pg, TARGET_TOKEN)
        back = data(pg, 'query{ activeChannel{ code } }', None, 'backChannel')
        check('渠道已还原为 %s' % CHANNEL, bool(back) and back['activeChannel']['code'] == CHANNEL,
              str((back or {}).get('activeChannel')))
    else:
        check('渠道收口（无可比渠道或无任务，跳过）', True, 'SKIP')

    # ---------- 4) shop-api 不含盘库字段（有意单侧注册） ----------
    print('[4] shop-api 不含盘库字段（规格 §3.8）→ %s' % SHOP_API)
    sq = http_gql(SHOP_API, 'query{ __type(name:"Query"){ fields{ name } } }', None, TARGET_TOKEN)
    if sq.get('_httpError') or sq.get('errors'):
        check('shop-api introspection 可用', False, str(sq)[:200])
    else:
        snames = {f['name'] for f in (sq['data']['__type'] or {'fields': []})['fields']}
        leaked = [f for f in ['stocktakeTasks', 'stocktakeTask', 'stocktakeDiff', 'binOccupancy', 'variantBinsByLocation']
                  if f in snames]
        check('shop-api 未泄漏盘库字段', len(leaked) == 0, '泄漏=%s' % leaked)

    # ---------- 5) 页面可达 ----------
    print('[5] 前端页面')
    goto(pg, 'pages/inventory/stocktake/index', 8)
    tabs = pg.locator('.tabs .tb').count()
    check('看板页有状态 Tab', tabs >= 3, 'tabs=%d' % tabs)
    check('看板页正文非空白', len(pg.inner_text('body').strip()) > 20,
          pg.inner_text('body')[:60].replace('\n', '|'))

    if t2_items:
        tid = str(t2_items[0]['id'])
        goto(pg, 'pages/inventory/stocktake/task?id=%s' % tid, 8)
        check('任务详情页有盘次卡', pg.locator('.wcard').count() >= 1, 'waves=%d' % pg.locator('.wcard').count())
        goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % tid, 8)
        check('差异页有摘要四宫格或阻塞提示',
              pg.locator('.sum').count() >= 1 or len(pg.inner_text('body').strip()) > 20)
    else:
        check('任务详情页/差异页（无任务，跳过）', True, 'SKIP')

    js_err = [e for e in ERRS if e.startswith('PAGEERR')]
    check('无 JS 运行时异常', len(js_err) == 0, str(js_err[:3]))
    print('  console.error 计数 =', len([e for e in ERRS if e.startswith('CONSOLE')]), str(ERRS[:2]))
    b.close()

print('\n===== 盘库冒烟结果：%s（失败 %d 项）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
for f in FAILS:
    print('  -', f)
raise SystemExit(1 if FAILS else 0)
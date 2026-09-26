# -*- coding: utf-8 -*-
"""D25 验收：TrendChart（经营视图「近 7 日销售趋势」）渲染缺陷回归。

缺陷（修前）：uni-app H5 把 <canvas> 编译成 <uni-canvas> + 内层 <canvas class="uni-canvas-canvas">，
内层画布由 uni 的 hidpi 包装器接管（缓冲 = 元素尺寸 × dpr，并在 2d 上下文打 __hidpi__ 标记，
由打补丁过的原型方法把「CSS px 坐标」自动乘 dpr）。原实现又自己 setTransform(dpr, …) 把坐标
乘了第二次（dpr²）→ 整幅图右下偏移、超出画布右/下边缘被裁切（网格线跑到卡片外、「暂无数据」贴右缘被切）。

本脚本断言（不靠肉眼）：
  A. 缓冲尺寸 = round(offsetWidth × dpr) × round(offsetHeight × dpr)（与 uni 包装器同口径）；
  B. 该画布上**没有任何**缩放变换（setTransform 的 a/d 必须为 1）——即 D25 根因的回归护栏；
  C. 全部绘制坐标（还原成 CSS px 后）落在画布盒内 [-1, W+1] × [-1, H+1]；
  D. 空数据态：「暂无数据」水平居中（中心 ≈ W/2）、垂直居中（≈ H/2）；
  E. 有数据态：7 个日期标签 + 左右轴标签 + 图例齐全，双折线点位均在盒内。
每张图 0 pageerror / 0 console.error。视口 390×844 @dpr2、is_mobile、has_touch。

销售趋势用网络层拦截注入（只拦 salesTrend 一条，其余查询走真实后端）——渲染只取决于 points 契约。
退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
"""
import json
import os
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_SHOT_BASE', 'http://localhost:5280/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
ADMIN = os.environ.get('WA_API_ADMIN', 'http://127.0.0.1:3000/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'superadmin@china.test')
PWD = os.environ.get('WA_SMOKE_PWD', 'superadmin')
CHANNEL_CODE = os.environ.get('WA_D25_CHANNEL', 'shop-a')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
PAGE = 'pages/data/dashboard/index'

FAILS, SKIPS = [], []
MODE = {'v': 'empty'}

PROBE_JS = r"""
(() => {
  const log = [];
  window.__d25ops = log;
  const isUni = (el) => el && typeof el.className === 'string' && el.className.indexOf('uni-canvas-canvas') >= 0;
  const rec = (op, args, ctx) => {
    const c = ctx.canvas;
    if (!isUni(c)) return;
    const m = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
    log.push({ op, args: args.map((a) => (typeof a === 'number' ? +a.toFixed(3) : a)),
               W: c.offsetWidth, H: c.offsetHeight, dpr: window.devicePixelRatio || 1,
               hidpi: !!ctx.__hidpi__, attrW: c.width, attrH: c.height,
               ma: m.a, md: m.d, me: m.e, mf: m.f });
  };
  const P = CanvasRenderingContext2D.prototype;
  ['moveTo', 'lineTo', 'fillRect', 'strokeRect', 'rect', 'fillText', 'clearRect'].forEach((m) => {
    const o = P[m];
    P[m] = function () { rec(m, Array.prototype.slice.call(arguments), this); return o.apply(this, arguments); };
  });
  ['arc', 'setTransform'].forEach((m) => {
    const o = P[m];
    P[m] = function () { rec(m, Array.prototype.slice.call(arguments), this); return o.apply(this, arguments); };
  });
  const net = [];
  window.__d25net = net;
  const of = window.fetch;
  window.fetch = function (input, init) {
    const b = (init && init.body) || '';
    const hit = typeof b === 'string' && b.indexOf('salesTrend') >= 0;
    const p = of.apply(this, arguments);
    if (hit) {
      p.then((r) => r.clone().text().then((t) => net.push({ status: r.status, body: t.slice(0, 400) })),
             (e) => net.push({ err: String(e) }));
    }
    return p;
  };
})();
"""


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def info(msg):
    print('  INFO %s' % msg)


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
    except Exception as e:  # noqa: BLE001
        return None, {'TRANSPORT': str(e)[:200]}


def admin_token():
    tok, r = api(ADMIN, 'mutation($u:String!,$p:String!,$e:Boolean){login(username:$u,password:$p,rememberMe:$e){... on CurrentUser{id}}}',
                 {'u': USER, 'p': PWD, 'e': True})
    if not tok:
        print('ENV-FAIL: admin 登录失败 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    _, r2 = api(ADMIN, 'query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r2.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    ch = next((c for c in chans if c['code'] == CHANNEL_CODE), None)
    if not ch:
        print('ENV-FAIL: 渠道 %s 不在 %s' % (CHANNEL_CODE, [c['code'] for c in chans][:8]))
        raise SystemExit(2)
    return tok, ch['token']


def login(pg):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(USER)
    pg.locator('input').nth(1).fill(PWD)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def inject_channel(pg, code, token):
    pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                [code, token])


def goto_page(pg, wait_js, settle=1.0):
    url = BASE + '#/' + PAGE + '?cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_selector('canvas.uni-canvas-canvas', timeout=90000)
    pg.wait_for_function(wait_js, timeout=90000)
    time.sleep(settle)


def shot(pg, name):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-d25-%s.png' % name)
    pg.screenshot(path=str(f))
    check('截图 %s' % f.name, f.exists() and f.stat().st_size > 5000, '%dB' % (f.stat().st_size if f.exists() else 0))


def mat(ev):
    """返回探针记录的调用时 2D 变换矩阵 (ma, md, me, mf) 与 dpr。"""
    dpr = ev['dpr'] or 1
    return ev.get('ma', 1), ev.get('md', 1), ev.get('me', 0), ev.get('mf', 0), dpr


def px_x(ev, v):
    """把记录到的横坐标参数还原成 CSS px。"""
    ma, _, me, _, dpr = mat(ev)
    return (ma * v + me) / dpr


def px_y(ev, v):
    """把记录到的纵坐标参数还原成 CSS px。"""
    _, md, _, mf, dpr = mat(ev)
    return (md * v + mf) / dpr


def px_len(ev, v):
    """把记录到的长度类参数（半径 / 宽高 / maxWidth）还原成 CSS px。"""
    ma, _, _, _, dpr = mat(ev)
    return (ma * v) / dpr


def css_args(ev):
    """把探针记录的参数还原成 CSS px（仅用于打印）。

    探针装在 document-start，是 uni hidpi shim 的「_super」——记录到的是 shim 乘过 dpr 之后的参数；
    再叠加调用当时的 2D 变换 m：设备位置 = m.a*arg + m.e，最终 CSS px = 设备位置 / dpr。
    修好后的实现变换为单位阵 → css = arg/dpr；缺陷版自加 setTransform(dpr,…) → css = arg（被放大 dpr 倍）。
    """
    a, op = ev['args'], ev['op']
    if op in ('moveTo', 'lineTo'):
        return [round(px_x(ev, a[0]), 3), round(px_y(ev, a[1]), 3)]
    if op == 'arc':
        return [round(px_x(ev, a[0]), 3), round(px_y(ev, a[1]), 3), round(px_len(ev, a[2]), 3)]
    if op in ('fillRect', 'strokeRect', 'rect'):
        return [round(px_x(ev, a[0]), 3), round(px_y(ev, a[1]), 3),
                round(px_len(ev, a[2]), 3), round(px_len(ev, a[3]), 3)]
    if op == 'fillText':
        return [a[0], round(px_x(ev, a[1]), 3), round(px_y(ev, a[2]), 3)]
    return a


def geom_of(ev):
    """返回该绘制调用涉及的 (x, y) 点（CSS px）。"""
    op, a = ev['op'], ev['args']
    if op in ('moveTo', 'lineTo'):
        return [(px_x(ev, a[0]), px_y(ev, a[1]))]
    if op == 'arc':
        return [(px_x(ev, a[0]) - px_len(ev, a[2]), px_y(ev, a[1]) - px_len(ev, a[2])),
                (px_x(ev, a[0]) + px_len(ev, a[2]), px_y(ev, a[1]) + px_len(ev, a[2]))]
    if op in ('fillRect', 'strokeRect', 'rect'):
        return [(px_x(ev, a[0]), px_y(ev, a[1])),
                (px_x(ev, a[0]) + px_len(ev, a[2]), px_y(ev, a[1]) + px_len(ev, a[3]))]
    if op == 'fillText':
        return [(px_x(ev, a[1]), px_y(ev, a[2]))]
    return []


def audit(name, ops, expect_empty):
    draw = [e for e in ops if e['op'] not in ('setTransform', 'clearRect')]
    info('%s · draw 次数=%d（clearRect 计数）' % (name, len([e for e in ops if e['op'] == 'clearRect'])))
    hist = {}
    for e in ops:
        hist[e['op']] = hist.get(e['op'], 0) + 1
    info('%s · op 直方图 %s' % (name, json.dumps(hist, sort_keys=True)))
    if not draw:
        check('%s · 有绘制调用' % name, False, '探针未捕获到任何绘制')
        return
    ev0 = draw[-1]
    W, H, dpr = ev0['W'], ev0['H'], ev0['dpr']
    want_w, want_h = round(W * dpr), round(H * dpr)
    check('%s · 缓冲尺寸=元素尺寸×dpr' % name, ev0['attrW'] == want_w and ev0['attrH'] == want_h,
          'attr %dx%d vs want %dx%d (CSS %dx%d · dpr %s)' % (ev0['attrW'], ev0['attrH'], want_w, want_h, W, H, dpr))
    check('%s · uni hidpi 包装生效' % name, ev0['hidpi'] is True, 'hidpi=%s' % ev0['hidpi'])

    # 护栏：uni shim 只对 setTransform 的 e/f（下标 4/5）乘 dpr，不改 a/d；
    # 因此若组件自己再 setTransform(dpr,…)，args[0]/args[3] 会等于 dpr（缺陷版）而非 1。
    st = [e for e in ops if e['op'] == 'setTransform']
    bad_st = [(e['args'][0], e['args'][3], e['args'][4], e['args'][5]) for e in st
              if abs(e['args'][0] - 1) > 1e-6 or abs(e['args'][3] - 1) > 1e-6]
    check('%s · 无二次 dpr 缩放（D25 根因护栏）' % name, not bad_st, 'setTransform(a,d,e,f)=%s' % bad_st)

    out = []
    for e in draw:
        for (x, y) in geom_of(e):
            if x < -1 or x > W + 1 or y < -1 or y > H + 1:
                out.append('%s%s → (%.1f, %.1f) 越界 [0,%d]x[0,%d]' % (e['op'], css_args(e), x, y, W, H))
    check('%s · 全部绘制落在画布盒内' % name, not out, '；'.join(out[:4]))

    if expect_empty:
        t = [e for e in draw if e['op'] == 'fillText' and e['args'][0] == '暂无数据']
        if not t:
            check('%s · 空态文案「暂无数据」' % name, False, '未绘制')
        else:
            a = css_args(t[0])
            check('%s · 空态文案居中' % name, abs((a[1] + 28) - W / 2) <= 2 and abs(a[2] - H / 2) <= 2,
                  '中心 (%.1f, %.1f) vs (%.1f, %.1f)' % (a[1] + 28, a[2], W / 2, H / 2))
    else:
        texts = [css_args(e) for e in draw if e['op'] == 'fillText']
        labels = [t for t in texts if str(t[0]).count('-') == 1 and len(str(t[0])) == 5]
        axis = [t for t in texts if str(t[0]).startswith('¥') or t[0] in ('0',) or str(t[0]).isdigit()]
        legend = [t for t in texts if t[0] in ('销售额', '订单数')]
        check('%s · 7 个日期标签' % name, len(labels) == 7, 'labels=%s' % [t[0] for t in labels])
        check('%s · 轴标签（¥ / 0 / 订单数）' % name, len(axis) >= 3, 'axis=%s' % [t[0] for t in axis])
        check('%s · 图例齐全' % name, len(legend) == 2, 'legend=%s' % [t[0] for t in legend])
        arcs = [e for e in draw if e['op'] == 'arc']
        check('%s · 双折线数据点 7+7 个' % name, len(arcs) == 14, 'arcs=%d' % len(arcs))


def main():
    _, ctoken = admin_token()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:400])) if m.type == 'error' else None)
        pg.add_init_script(PROBE_JS)

        days = [time.strftime('%Y-%m-%d', time.gmtime(time.time() + (i - 6) * 86400)) for i in range(7)]
        data_pts = [{'date': d, 'orderCount': 3 + i, 'gmv': 12000 + i * 3300} for i, d in enumerate(days)]

        def handler(route):
            body = route.request.post_data or ''
            if 'salesTrend' in body:
                pts = [] if MODE['v'] == 'empty' else data_pts
                route.fulfill(status=200, content_type='application/json',
                              body=json.dumps({'data': {'salesTrend': pts}}))
            else:
                route.continue_()

        pg.route('**/admin-api', handler)
        pg.route('**/admin-api?*', handler)

        login(pg)
        inject_channel(pg, CHANNEL_CODE, ctoken)
        info('已登录，渠道 %s' % CHANNEL_CODE)

        for mode, expect_empty in (('empty', True), ('data', False)):
            MODE['v'] = mode
            errs.clear()
            # 等到「目标态真的画出来」再取证：避免读到 onMounted 那一帧空态
            wait_js = ("() => (window.__d25ops||[]).some(e => e.op==='fillText' && e.args[0]==='暂无数据')"
                       if expect_empty else
                       "() => (window.__d25ops||[]).filter(e => e.op==='arc').length >= 14")
            goto_page(pg, wait_js)
            ops = pg.evaluate('window.__d25ops || []')
            info('%s 态捕获 %d 次绘制调用' % (mode, len(ops)))
            info('%s 态 salesTrend 响应：%s' % (mode, json.dumps(pg.evaluate('window.__d25net || []'), ensure_ascii=False)[:500]))
            audit(mode, ops, expect_empty)
            shot(pg, mode)
            check('%s · 0 pageerror / 0 console.error' % mode, not errs, json.dumps(errs[:3], ensure_ascii=False))

        b.close()

    print('\n===== 结果：%d 失败 =====' % len(FAILS))
    for f in FAILS:
        print(' FAIL %s' % f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
# -*- coding: utf-8 -*-
"""gap4 批 2 验收：全局配置结构化表单 + 行内校验 + 合并预览 + 店铺覆盖预览（手机视口 e2e + 截图）。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 2.5
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

写操作护栏（默认只读）：
  「结构化表单渲染 / 非法主色标红 / 合并预览」三组断言**只读**（预览走 query，不改库）。
  「合法保存成功」需要写 `updateShopGlobalConfig`：
    - 未开 `WA_SHOT_ALLOW_WRITE=1` → 只做**幂等保存**（把当前读到的值原样写回）并断言 toast；
    - 开了 → 改成测试值 #123456 → 保存 → 刷新回读确认落库 → 再保存原值**还原**（不留脏数据）。
  目标域名含 e.joho.cn（生产）时**硬拦**，一律不写。

退出码：0 = 通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
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
CHANNEL_CODE = os.environ.get('WA_SMOKE_CHANNEL', '__default_channel__')
APP = 'nshop'
TEST_COLOR = '#123456'
FIELDS_N = 11          # config-schema：3 令牌 + 1 select + 7 block
TOKEN_N = 3
BLOCK_N = 7
ALLOW_WRITE = os.environ.get('WA_SHOT_ALLOW_WRITE', '0') == '1'
IS_PROD = 'e.joho.cn' in BASE
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'

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


# ---------------- API（直连 dev-server，避免 vite 只代理 /admin-api 的缺口） ----------------

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


def read_global_config(tok, ctoken):
    r = api(ADMIN, 'query($a:String!){ shopGlobalConfig(app:$a){ id app themeTokens defaults } }',
            {'a': APP}, token=tok, channel=ctoken)[1]
    cfg = data_of(r, 'shopGlobalConfig')
    if cfg is None and r.get('errors'):
        print('ENV-FAIL: shopGlobalConfig 不可用 %s' % json.dumps(r, ensure_ascii=False)[:300])
        raise SystemExit(2)
    info('库中 %s 全局配置 = %s' % (APP, json.dumps(cfg, ensure_ascii=False)[:220]))
    return cfg


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


def goto(pg, path, settle=6.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, name, note, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-batch2-%s.png' % name)
    pg.screenshot(path=str(f), full_page=full)
    check('%s · %s' % (name, note), f.exists() and f.stat().st_size > 5000,
          '%s %d B' % (f.name, f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


def toast_text(pg, wait=3.0, not_equal=None):
    """uni.showToast 的文本（H5 渲染为 uni-toast），轮询避免抓空。

    `not_equal`：上一次 toast 的文本。uni-toast 元素在 H5 里常驻 DOM、隐藏后 `inner_text`
    仍会返回旧文案，故断言「新 toast」时必须显式排除上一条，否则会读到陈旧的 toast。
    """
    end = time.time() + wait
    last = ''
    while time.time() < end:
        try:
            t = pg.locator('uni-toast').first.inner_text(timeout=500).strip()
            if t:
                last = t
                if not_equal is None or t != not_equal:
                    return t
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.2)
    return last if not_equal is None else ('' if last == not_equal else last)


def token_input(pg, idx):
    """第 idx 个令牌输入框的真实 <input>（<input class="in"> 在 H5 渲染为 uni-input 包裹）。"""
    return pg.locator('.in').nth(idx).locator('input')


def field_err(pg, idx):
    loc = pg.locator('.field').nth(idx).locator('.err')
    return loc.first.inner_text().strip() if loc.count() else ''


def set_color(pg, idx, val):
    el = token_input(pg, idx)
    el.click()
    el.fill(val)
    el.press('Tab')          # 触发 @blur → checkField
    time.sleep(0.6)


def main():
    if IS_PROD and ALLOW_WRITE:
        print('ENV-FAIL: 目标是生产域名且开了 WA_SHOT_ALLOW_WRITE —— 拒绝执行（生产只读）')
        raise SystemExit(2)

    tok, ctoken = admin_login()
    info('渠道 %s token=%s' % (CHANNEL_CODE, ctoken))
    cfg0 = read_global_config(tok, ctoken)
    orig_color = ((cfg0 or {}).get('themeTokens') or {}).get('primaryColor') or ''
    info('原主色 = %r' % orig_color)

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

        # ============ A. 全局配置页 ============
        goto(pg, 'pages/platform/global-config/index', 8)
        info('body=%r' % pg.inner_text('body')[:260].replace('\n', '|'))
        n_in = pg.locator('.in').count()
        n_sw = pg.locator('uni-switch').count()
        n_field = pg.locator('.field').count()
        body0 = pg.inner_text('body')
        info('结构化 DOM: .in=%d uni-switch=%d .field=%d' % (n_in, n_sw, n_field))
        chips = [pg.locator('.chip').nth(i).inner_text().strip() for i in range(pg.locator('.chip').count())]
        info('chips=%r' % chips)
        check('A1 结构化表单渲染：3 个令牌输入框 + 1 个版式 select（3 选项）+ 7 个功能块开关',
              n_in == TOKEN_N and n_sw == BLOCK_N and all(k in body0 for k in ['主题令牌 themeTokens', '商品详情版式'])
              and all(k in chips for k in ['经典', '楼层', '双通道'])
              and all(k in body0 for k in ['主图', '价格', '促销', '服务', '参数', '评价', '详情']),
              '.in=%d switch=%d chips=%r' % (n_in, n_sw, chips))
        check('A1 字段表与规格一致（config-schema 共 %d 项：3 令牌 + 1 select + %d 开关）' % (FIELDS_N, BLOCK_N),
              n_in == TOKEN_N and n_sw == BLOCK_N,
              '实际 .in=%d switch=%d' % (n_in, n_sw))
        shot(pg, 'globalconfig-form', '全局配置结构化表单：3 令牌输入 + 详情页版式 select（经典/楼层/双通道）+ 7 个功能块开关 + JSON 高级编辑')
        check('A1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- A2 非法主色标红 ---
        set_color(pg, 0, 'red')
        e0 = field_err(pg, 0)
        check('A2 非法主色行内标红：输入「red」失焦后该字段出现「颜色需为 #RRGGBB」',
              '颜色需为 #RRGGBB' in e0, 'field0.err=%r' % e0)
        shot(pg, 'globalconfig-invalid-color', '行内校验：主色输入「red」（非 #RRGGBB）→ 字段下方即显红字错误提示')
        # 点保存应被整体拦截并提示「有 N 处需要修正」
        pg.locator('.btn').first.click()
        block_toast = toast_text(pg)
        check('A2 保存前置校验：非法值下点「保存」被拦截（toast「有 1 处需要修正」，未提交）',
              '需要修正' in block_toast, 'toast=%r' % block_toast)
        check('A2 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- A3 合法保存成功 ---
        # 先取回原值（load 已把 default 填进输入框）
        cur_color = token_input(pg, 0).input_value().strip()
        info('当前输入框主色 = %r' % cur_color)
        target = TEST_COLOR if ALLOW_WRITE else (cur_color or '#ff6600')
        if not ALLOW_WRITE:
            skip('A3 保存后落库回读（写测试值）', '未开 WA_SHOT_ALLOW_WRITE → 只做幂等保存（原值写回）')
        set_color(pg, 0, target)
        e_ok = field_err(pg, 0)
        check('A3 合法值不再标红：#%s 失焦后该字段无错误' % target.lstrip('#'), e_ok == '', 'field0.err=%r' % e_ok)
        pg.locator('.btn').first.click()
        save_toast = toast_text(pg, not_equal=block_toast)
        check('A3 合法保存成功：点「保存」后 toast「已保存」', '已保存' in save_toast,
              'toast=%r target=%r（上一条 toast=%r）' % (save_toast, target, block_toast))
        shot(pg, 'globalconfig-saved', '合法保存成功：主色改为合法值后点「保存」，toast 提示「已保存」（底部可见）')

        if ALLOW_WRITE:
            pg.reload(wait_until='networkidle', timeout=60000)
            time.sleep(6)
            persisted = token_input(pg, 0).input_value().strip().lower()
            check('A3 落库回读一致：刷新后输入框主色 == 保存值 %s' % target,
                  persisted == target.lower(), 'persisted=%r' % persisted)
            # 还原（仍走页面保存，避免直连 API 绕过校验路径）
            # 注意：reload 后 DOM 已重置、无残留 toast，且本条 toast 文案与上一条相同（「已保存」），
            # 故这里不能再用 not_equal 排除，直接轮询即可。
            set_color(pg, 0, orig_color or '#ff6600')
            pg.locator('.btn').first.click()
            restore_toast = toast_text(pg)
            check('A3 还原原主色：恢复为 %r 并保存成功' % (orig_color or '#ff6600'),
                  '已保存' in restore_toast, 'toast=%r' % restore_toast)
        check('A3 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # --- A4 立即预览（合并 JSON + 来源徽标） ---
        pg.locator('.chip', has_text='立即预览').first.click()
        time.sleep(4)
        pre = pg.locator('pre.json')
        pre_txt = pre.first.inner_text() if pre.count() else ''
        srcs = [pg.locator('.src').nth(i).inner_text().replace('\n', '=') for i in range(pg.locator('.src').count())]
        src_badges = pg.locator('.src .v').all_inner_texts() if pg.locator('.src .v').count() else []
        info('merged JSON 头部=%r' % pre_txt[:200].replace('\n', '|'))
        info('sourceByKey（前 8）= %r' % srcs[:8])
        has_json = pre.count() > 0 and len(pre_txt) > 40 and pre_txt.strip().startswith('{')
        check('A4 合并预览输出 L0→L3 合并后的 JSON（含 themeTokens / defaults 键）',
              has_json and 'themeTokens' in pre_txt and 'defaults' in pre_txt,
              'pre.len=%d head=%r' % (len(pre_txt), pre_txt[:120]))
        check('A4 来源徽标渲染：每条 key 标注 L1/L2/L3 来源（sourceByKey 非空）',
              len(src_badges) > 0 and all(s in ('L1', 'L2', 'L3', 'L4') for s in src_badges),
              'badges=%r' % src_badges[:10])
        # JSON 在首屏之外 → 滚动把预览区居中，让证据自证
        pg.evaluate("()=>{const p=document.querySelector('pre.json'); if(p) p.scrollIntoView({block:'center'});}")
        time.sleep(1.2)
        shot(pg, 'globalconfig-preview', '合并预览：点「立即预览」→ 展示逐级合并后的最终 JSON + 每条 key 的来源徽标（L1/L2/L3）')
        check('A4 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # ============ B. 店铺覆盖页（配 L3 预览） ============
        goto(pg, 'pages/decorate/theme/index', 8)
        body1 = pg.inner_text('body')
        info('body=%r' % body1[:260].replace('\n', '|'))
        prev_rows = pg.locator('.prev-row').count()
        prev_keys = [pg.locator('.prev-row').nth(i).locator('.prev-k').inner_text().strip() for i in range(prev_rows)]
        prev_vals = [pg.locator('.prev-row').nth(i).locator('.prev-v').inner_text().strip() for i in range(prev_rows)]
        prev_srcs = [pg.locator('.prev-row').nth(i).locator('.src-badge').inner_text().strip() for i in range(prev_rows)]
        info('预览行 keys=%r vals=%r src=%r' % (prev_keys, prev_vals, prev_srcs))
        check('B1 店铺覆盖页合并预览卡：primaryColor/accentColor/radius 三行各带来源徽标（L1/L2/L3）',
              prev_keys == ['primaryColor', 'accentColor', 'radius'] and len(prev_srcs) == 3
              and all(s in ('L1', 'L2', 'L3', 'L4') for s in prev_srcs),
              'keys=%r src=%r' % (prev_keys, prev_srcs))
        check('B1 进页自动预览（onMounted 即展开，非空值）',
              any(v and v != '—' for v in prev_vals), 'vals=%r' % prev_vals)
        check('B1 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        # 预览卡在首屏之外 → 滚动把「合并结果预览」居中，让证据自证
        pg.evaluate("()=>{const el=[...document.querySelectorAll('.sec-title')].find(e=>e.innerText.includes('合并结果预览')); if(el) el.scrollIntoView({block:'start'});}")
        time.sleep(1.2)
        shot(pg, 'theme-preview', '店铺覆盖页（L3）：风格模板卡片 + 令牌覆盖 + 进页即自动展开的「合并结果预览」三行 + 来源徽标')

        sizes = []
        for f in sorted(OUT.glob('gap4-batch2-*.png')):
            sizes.append('%s:%dB' % (f.name, f.stat().st_size))
        info('本次落图: %s' % ', '.join(sizes))
        b.close()

    final = read_global_config(tok, ctoken)
    left = ((final or {}).get('themeTokens') or {}).get('primaryColor') or ''
    if ALLOW_WRITE:
        check('收尾：全局配置主色已还原为原值 %r' % (orig_color or '#ff6600'),
              left.lower() == (orig_color or '#ff6600').lower(), '现=%r' % left)
    else:
        info('收尾：主色 = %r（未开写开关，未改库）' % left)

    print('\n===== gap4 批 2 验收：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
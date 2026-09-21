# -*- coding: utf-8 -*-
# 库存 v2 · 失败场景回归（规格 §5 验收第 8 条）：
#   ① 搜索请求失败 ② 保存预警规则失败 ③ 调整库存失败
#   期望：三种情况都弹明确错误 Toast，且**列表保持上一次结果**（不清空、不显示空态）。
# 断网方式：Playwright route 拦截 admin-api 并 abort（等价于断网/接口不可用）。
# 账号：guoxinnanshan@163.com / you123123（t2 租户管理员）
from playwright.sync_api import sync_playwright
import time

BASE = 'https://e.joho.cn/guanli/'
API = '**/admin-api'

results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('  PASS  ' if ok else '  FAIL  ') + name + ('  -> ' + str(detail) if detail != '' else ''))


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
    pg.evaluate("""() => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = ((d.data||{}).myTenantAccess||{}).channels || [];
        const hit = c.find(x=>x.code==='t2');
        localStorage.setItem('wa_channel_token', hit.token);
        localStorage.setItem('wa_channel_code', 't2');
        return 'OK';
      });
    }""")
    return pg


_nav = [0]


def go(pg, path):
    _nav[0] += 1
    url = BASE + '#/pages/inventory/' + path + ('&' if '?' in path else '?') + '_r=' + str(_nav[0])
    pg.goto(url, wait_until='networkidle', timeout=45000)
    pg.reload(wait_until='networkidle', timeout=45000)
    time.sleep(5)


def toast(pg):
    try:
        return pg.locator('uni-toast').first.inner_text().strip().replace('\n', ' ')[:90]
    except Exception:
        return ''


def block(ctx):
    ctx.route(API, lambda route: route.abort())


def unblock(ctx):
    ctx.unroute(API)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                      is_mobile=True, has_touch=True)
    pg = login(m)

    # ---------- ① 搜索请求失败 ----------
    go(pg, 'stock/index')
    before = pg.locator('.list .card').count()
    first_text = pg.locator('.list .card').first.inner_text().replace('\n', '|')[:60] if before else ''
    print('  baseline rows =', before)
    block(m)
    pg.locator('.fbar .search input').first.fill('ZZZ-NOT-EXIST')
    time.sleep(4)  # 400ms 防抖 + 请求失败
    t1 = toast(pg)
    after = pg.locator('.list .card').count()
    empty_visible = pg.locator('.empty').count()
    print('  toast(search) =', t1, ' rows after =', after, ' empty block =', empty_visible)
    check('① 搜索失败弹 Toast', bool(t1), t1)
    check('① 搜索失败不清空列表', after == before and before > 0, [before, after])
    check('① 搜索失败不显示空态', empty_visible == 0, empty_visible)
    unblock(m)

    # ---------- ② 保存预警规则失败 ----------
    go(pg, 'alert-rules/index')
    rows = pg.locator('.rrow')
    r0 = rows.count()
    print('  alert rows =', r0)
    sub = rows.first.locator('.rsub').first.inner_text() if r0 else ''
    segs = [s.strip() for s in sub.split('·')]
    cur = int(segs[-1]) if segs and segs[-1].isdigit() else 10
    rows.first.locator('input').first.fill(str(cur + 7))
    time.sleep(0.8)
    block(m)
    pg.locator('.savebar .sbtn').first.tap()
    time.sleep(3)
    t2 = toast(pg)
    rows_after = pg.locator('.rrow').count()
    print('  toast(save) =', t2, ' rows after =', rows_after)
    check('② 保存规则失败弹 Toast', bool(t2), t2)
    check('② 保存规则失败不清空列表', rows_after == r0 and r0 > 0, [r0, rows_after])
    unblock(m)

    # ---------- ③ 调整库存失败 ----------
    go(pg, 'stock/index')
    before3 = pg.locator('.list .card').count()
    pg.locator('.list .card').first.locator('.acts .act').nth(1).tap()  # 第 2 个 = 调整
    time.sleep(1.5)
    sheet = pg.locator('.sheet').count()
    print('  adjust sheet =', sheet, ' rows =', before3)
    block(m)
    pg.locator('.sheet .sbtn').last.tap()  # 确认
    time.sleep(3)
    t3 = toast(pg)
    after3 = pg.locator('.list .card').count()
    print('  toast(adjust) =', t3, ' rows after =', after3)
    check('③ 调整库存失败弹 Toast', bool(t3), t3)
    check('③ 调整库存失败不清空列表', after3 == before3 and before3 > 0, [before3, after3])
    unblock(m)

    # ---------- ④ 恢复：解除断网后可正常加载（证明是拦截导致，不是页面坏了） ----------
    go(pg, 'stock/index')
    rec = pg.locator('.list .card').count()
    print('  recovered rows =', rec)
    check('④ 解除断网后可正常加载', rec > 0, rec)

    b.close()

fails = [r for r in results if not r[1]]
print('=== %d 项，%d 项失败 ===' % (len(results), len(fails)))

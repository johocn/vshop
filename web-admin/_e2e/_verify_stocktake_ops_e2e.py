# -*- coding: utf-8 -*-
"""盘库运营增强 · 手机视口截图回归（T46–T53，规格 §9 / §10.4）

铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。
写操作护栏：默认只读。草稿/开放任务相关用例需要 DRAFT / OPEN 任务；没有现成数据时，
  必须显式设 WA_SHOT_ALLOW_WRITE=1 才创建一个（不动库存、只写任务头与盘次），跑完立即取消；
  目标域名含 e.joho.cn（生产）时**硬拦**，一律不写。
退出码：0 = 通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用
"""
import os
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

BASE = os.environ.get('WA_SHOT_BASE', 'https://e.joho.cn/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 't2')
LOC = os.environ.get('WA_SMOKE_LOC', '3')
ALLOW_WRITE = os.environ.get('WA_SHOT_ALLOW_WRITE', '0') == '1'
IS_PROD = 'e.joho.cn' in BASE
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'webadmin-bugfix-manual' / 'assets'

FAILS, SKIPS = [], []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def skip(name, why):
    print('  SKIP %s %s' % (name, why))
    SKIPS.append('%s：%s' % (name, why))


def gql(pg, q, v=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const h = {'Content-Type':'application/json'};
      if (t) h['Authorization'] = 'Bearer ' + t;
      if (ct) h['vendure-token'] = ct;
      const r = await fetch('/admin-api', {method:'POST', headers:h, body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, v or {}])


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
    if ok != 'OK':
        print('ENV-FAIL: 登录失败 %s' % ok)
        raise SystemExit(2)


def goto(pg, path, settle=6.0):
    url = BASE + '#/' + path + ('&' if '?' in path else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def shot(pg, tag, note):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('stocktake-ops-%s.png' % tag)
    pg.screenshot(path=str(f))
    check('%s %s → %s' % (tag, note, f.name), f.exists() and f.stat().st_size > 5000, '%d B' % (f.stat().st_size if f.exists() else 0))


def errs_of(bag):
    """规格 §10.2：每张图都要 0 pageerror **且** 0 console.error —— 两者都算异常。
    bag 是累积的：一旦出现过异常，后续所有断言都会带上它（保守但不虚报）。"""
    return [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]


# ---------------- 修正 ①（计划 D28 / 偏差区已点名）：草稿/开放任务的入参形态 ----------------
# 实测 introspection（localhost:3000/admin-api）：
#   input StocktakeTaskInput { stockLocationId name activityCode scope autoSplitByZone note state }
#   input StocktakeScopeInput { zones categoryIds variantIds includeZeroBook }   ← 无 autoSplitByZone
# 计划原文把 autoSplitByZone 塞进 scope，GraphQL 会以「未定义字段」硬拒 → 上提到顶层，
# 与 src/apis/stocktake.ts 的 createStocktakeTask 归一逻辑同源（那里也是 scope 内不带该字段）。
def create_task(pg, name, state, extra_scope=None):
    scope = {'zones': [], 'categoryIds': [], 'variantIds': [], 'includeZeroBook': False}
    if extra_scope:
        scope.update(extra_scope)
    r = gql(pg, """mutation($input: StocktakeTaskInput!){
         createStocktakeTask(input:$input){ id code state } }""",
            {'input': {'stockLocationId': str(LOC), 'name': name, 'state': state,
                       'scope': scope, 'autoSplitByZone': False}})
    return r, (((r.get('data') or {}).get('createStocktakeTask')) or None)


def cancel_task(pg, task_id):
    return gql(pg, 'mutation($id: ID!){ cancelStocktakeTask(taskId:$id){ id state } }', {'id': task_id})


def main():
    if IS_PROD and ALLOW_WRITE:
        print('ENV-FAIL: 目标是生产域名且开了 WA_SHOT_ALLOW_WRITE —— 拒绝执行（生产只读）')
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

        created = []          # 本次创建的临时任务（跑完统一取消）

        # ---------------- 修正 ④：T49/T50 的 fixture 缺口 ----------------
        # 计划靠 state in ('OPEN','COUNTING','COUNTED') 找统计页签的任务，本地该渠道一条都没有
        # （21 CANCELLED + 4 POSTED）→ T49/T50 会永远 SKIP。按计划既有「WA_SHOT_ALLOW_WRITE 才建、
        # 跑完取消」模式，补建一个 OPEN 任务作为 fixture（空 scope、整仓单盘次、顶层 autoSplitByZone:false）。
        # 注意：OPEN 会物化应盘行（DRAFT 不会），因此统计「按库位」天然至少 1 行（未归位组）。
        if ALLOW_WRITE:
            r, open_task = create_task(pg, 'SHOT-OPEN', 'OPEN')
            if open_task:
                created.append(open_task['id'])
            check('创建临时 OPEN 任务（T49/T50 fixture，仅任务头+盘次）', bool(open_task), str(r.get('errors'))[:160])

        # 数据准备：一个已过账任务（用于 T51–T53）、一个可盘点任务（T49/T50）、一个草稿（T47–T48）
        tasks = gql(pg, 'query{ stocktakeTasks(options:{page:1,pageSize:50}){ totalItems items{ id code state } } }')
        items = (((tasks.get('data') or {}).get('stocktakeTasks') or {}).get('items')) or []
        total = (((tasks.get('data') or {}).get('stocktakeTasks') or {}).get('totalItems'))
        posted = next((t for t in items if t['state'] == 'POSTED'), None)
        counting = next((t for t in items if t['state'] in ('OPEN', 'COUNTING', 'COUNTED')), None)
        draft = next((t for t in items if t['state'] == 'DRAFT' and t.get('code', '').startswith('SHOT-')), None)
        print('  INFO 渠道 %s（loc=%s）任务 totalItems=%s；POSTED=%s；可盘点=%s；DRAFT=%s'
              % (CHANNEL, LOC, total,
                 (posted or {}).get('code'), (counting or {}).get('code'), (draft or {}).get('code')))
        if not draft and ALLOW_WRITE:
            r, d = create_task(pg, 'SHOT-DRAFT', 'DRAFT')
            draft = d
            if draft:
                created.append(draft['id'])
            check('创建临时草稿（仅任务头，不动库存）', bool(draft), str(r.get('errors'))[:160])

        # ---------- T46 看板分页：触底增量 ----------
        goto(pg, 'pages/inventory/stocktake/index', 8)
        check('T46 看板页签 >= 4（含草稿）', pg.locator('.tabs .tb').count() >= 4, 'tabs=%d' % pg.locator('.tabs .tb').count())
        before = pg.locator('.tcard').count()
        for _ in range(3):
            pg.mouse.wheel(0, 4000)
            time.sleep(1.2)
        after = pg.locator('.tcard').count()
        check('T46 触底后条目不减（分页追加不重置）', after >= before, 'before=%d after=%d' % (before, after))
        check('T46 出现分页脚注', pg.locator('.footnote').count() >= 1, 'footnote=%d' % pg.locator('.footnote').count())
        shot(pg, '46-pagination', '看板分页触底')
        check('T46 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

        # ---------- T47 / T48 草稿 ----------
        if draft:
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % draft['id'], 8)
            check('T47 草稿详情显示草稿态提示', '草稿' in pg.inner_text('body'), pg.inner_text('body')[:60].replace('\n', '|'))
            check('T47 草稿态动作条含「发布任务」', pg.locator('text=发布任务').count() >= 1)
            shot(pg, '47-draft-detail', '草稿详情与动作条（task id=%s）' % draft['id'])
            check('T47 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            goto(pg, 'pages/inventory/stocktake/index', 8)
            pg.locator('.tabs .tb', has_text='草稿').first.click()
            time.sleep(3)
            pg.locator('text=新建盘点任务').first.click()
            time.sleep(2)
            # 修正 ②：计划原文断言「创建并发布」，但真实词条 stocktake.board.formSubmit = 「创建任务」
            # （src/locale/zh-Hans.json:1353），formSaveDraft = 「存为草稿」（:1362）。照抄会恒 FAIL。
            # 只把文案改成真实标签，并把范围收紧到抽屉动作条 .acts，断言不放宽。
            check('T48 抽屉双按钮：存为草稿 + 创建任务',
                  pg.locator('.acts .ghost', has_text='存为草稿').count() >= 1
                  and pg.locator('.acts .submit', has_text='创建任务').count() >= 1,
                  'ghost=%d submit=%d' % (pg.locator('.acts .ghost', has_text='存为草稿').count(),
                                          pg.locator('.acts .submit', has_text='创建任务').count()))
            shot(pg, '48-new-draft-buttons', '新建抽屉双动作')
            check('T48 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T47/T48 草稿相关', '无 DRAFT 任务且未开 WA_SHOT_ALLOW_WRITE（生产只读）')

        # ---------- T49 / T50 统计 ----------
        if counting:
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % counting['id'], 8)
            pg.locator('.tabs .tb', has_text='统计').first.click()
            time.sleep(4)
            check('T49 统计表（按库位）有表头', pg.locator('.stats .tbl .th').count() >= 1)
            shot(pg, '49-stats-by-bin', '统计 · 按库位（task id=%s）' % counting['id'])
            check('T49 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            pg.locator('.stats .seg .sg', has_text='按盘点人').first.click()
            time.sleep(3)
            check('T50 统计表（按盘点人）有表头', pg.locator('.stats .tbl .th').count() >= 1)
            shot(pg, '50-stats-by-counter', '统计 · 按盘点人')
            check('T50 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T49/T50 统计', '无可盘点状态任务（OPEN/COUNTING/COUNTED）')

        # ---------- T51 / T52 / T53 差异页工具条 ----------
        if posted:
            goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % posted['id'], 8)
            check('T51 工具条三按钮', pg.locator('.tools .tbtn').count() == 3, 'btns=%d' % pg.locator('.tools .tbtn').count())
            shot(pg, '51-diff-toolbar', '差异页工具条（task id=%s / %s）' % (posted['id'], posted['code']))
            check('T51 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            # 规格 §10.2 要求「打印工具条**与打印区**」都要有手机视口截图。
            # 打印区在屏幕上 display:none（只属于 print 媒体），故临时注入样式强制显形来证明「分区与列数」；
            # A4 几何仍由 Task 16 基线承担，这张图只证明入口与分区存在。
            pg.add_style_tag(content='.st-print{display:block !important} .st-screen{display:none !important}')
            time.sleep(1)
            # 修正 ③：计划原文数 `.st-print .p-tbl thead th` == 9，但打印区含两张表
            # （差异表 9 列 + 未盘清单表 3 列）；本任务 uncountedCount=18 → 实际 12 → 恒 FAIL
            # （与 Task 16 已记录的 D39② 同类）。改为只数**第一张** .p-tbl 的 thead th，仍要求 == 9。
            first_tbl_th = pg.locator('.st-print .p-tbl').first.locator('thead th').count()
            all_tbl_th = pg.locator('.st-print .p-tbl thead th').count()
            check('T51b 打印区九列差异表 + 未盘清单 + 页脚齐备（强制显形后）',
                  first_tbl_th == 9 and pg.locator('.st-print .p-foot').count() == 1,
                  'first-tbl-ths=%d all-tbl-ths=%d foot=%d' % (first_tbl_th, all_tbl_th,
                                                               pg.locator('.st-print .p-foot').count()))
            shot(pg, '51b-print-region', '打印区（屏幕强制显形：任务头/四宫格/差异表/未盘清单/页脚）')
            check('T51b 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))

            # 修正 ⑥：上面为拍打印区把 .st-screen{display:none} 了，而 T52/T53 要点的
            # `.tools .tbtn` 正在 .st-screen 里 —— 不改回来 Playwright 会因元素不可见而 click 超时。
            # 故这里再注入一条反向样式把屏幕区还原（打印区回到隐藏），不动任何断言。
            pg.add_style_tag(content='.st-screen{display:block !important} .st-print{display:none !important}')
            time.sleep(1)

            with pg.expect_download(timeout=15000) as dl:
                pg.locator('.tools .tbtn').nth(0).click()
            name = dl.value.suggested_filename
            check('T52 当前视图导出真实落盘', name.startswith('stocktake-') and name.endswith('.csv'), name)
            time.sleep(0.6)
            shot(pg, '52-export-toast', '导出落盘提示')

            pg.locator('.tools .tbtn').nth(1).click()
            time.sleep(2)
            check('T53 完整导出动作面板四项 + 取消', pg.locator('.kinds .krow').count() >= 5, 'rows=%d' % pg.locator('.kinds .krow').count())
            shot(pg, '53-export-kinds', '完整导出类型面板（打印入口同屏可见）')
            check('T53 无 JS 异常', not errs_of(bag), str(errs_of(bag)[:2]))
        else:
            skip('T51/T52/T53 差异页', '无已过账任务')

        # 清理：取消本次创建的临时任务（草稿 + OPEN fixture）
        for tid in created:
            r = cancel_task(pg, tid)
            st = (((r.get('data') or {}).get('cancelStocktakeTask')) or {}).get('state')
            check('临时任务已取消（不留残留）', st == 'CANCELLED', 'id=%s state=%s %s' % (tid, st, str(r.get('errors'))[:120]))
        b.close()

    print('\n===== 手机视口截图回归：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
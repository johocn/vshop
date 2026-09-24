# -*- coding: utf-8 -*-
# 多人协同盘库 · 操作手册截图（Task 16 Step 3）
# 手机视口 390x844 dpr=2（输出 780x1688）。
# 数据准备走真实 admin-api 且**全程可逆**：建任务 → 捞盘次 → 认领 → 录入几行 → 提交盘次 → 截差异页 → 取消任务。
# **绝不调 postStocktake**（过账会真实改库存）。
#
# 相对计划正文的落点差异（见偏差说明区 #46）：
#  1) BASE / 账号 / 渠道 / 仓库 改为环境变量可覆盖，线上复验无需改脚本正文（计划 Step 7 原话是「临时改 BASE」）。
#  2) 选择器按实际 class 同步：格子是 `.cells .cell`（计划写的 `.bg` 不存在）；
#     关闭新建弹窗点 `.mask` 顶部空白（计划写的 `.btn.ghost` 不存在）；扫码页返回改 `goto` 重进录入页（计划已预警）。
#  3) 看板「空态」截图为条件产出：库里已有历史任务时改截「本仓第一屏」，空态另在「盘点中」Tab 为空时补截。
import os
import shutil
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('WA_SHOT_BASE', 'http://localhost:5281/guanli/')
USER = os.environ.get('WA_SHOT_USER', 'superadmin')
PWD = os.environ.get('WA_SHOT_PWD', 'superadmin')
CHANNEL = os.environ.get('WA_SHOT_CHANNEL', 'shop-a')
WANT_LOC = os.environ.get('WA_SHOT_LOC', '')            # 仓库名；空 = 默认仓优先，再退首个
# 线上复验开关（Step 7）：唯一写入 = 建演示任务 + 可逆切档（收尾还原 binMode），
# 不认领 / 不录入 / 不提交 / 不过账（生产账号在 t2 无 tenant_member 行，owner 锁会拒写入，见偏差 #20/#35）。
# 截图另用 stocktake_live_* 名，避免覆盖本地证据（偏差 #46 追加）。
LIVE = os.environ.get('WA_SHOT_LIVE', '') == '1'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)

SHOTS = []
ERRS = []


class _LiveDone(Exception):
    """线上复验分支跑完后的正常出口（跳过本地写链路，仍走 finally 还原档位）"""


def gql(pg, q, var=None):
    return pg.evaluate("""async ([q, v]) => {
      const t = localStorage.getItem('wa_auth_token');
      const ct = localStorage.getItem('wa_channel_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':ct},
        body: JSON.stringify({query:q, variables:v||{}})});
      return await r.json();
    }""", [q, var])


def gql_data(pg, q, var=None, tag=''):
    d = gql(pg, q, var)
    if d.get('errors'):
        raise SystemExit('[%s] GraphQL 失败：%s' % (tag, str(d['errors'])[:400]))
    return d['data']


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
    print('  登录/渠道 =', ok)
    if ok != 'OK':
        raise SystemExit('渠道注入失败')


def set_mode(pg, mode):
    gql_data(pg, 'mutation($f: JSON!){ myUpdateChannelCustomFields(input:$f) }', {'f': {'binMode': mode}}, 'set_mode')
    print('  binMode ->', mode)


def goto(pg, path, settle=6.0):
    """uni-app H5 hash 路由：改 hash 不重载，必须冷加载（否则切档位后读到旧档渲染）"""
    url = BASE + '#/' + path
    url += ('&' if '?' in url else '?') + 'cb=' + str(int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    time.sleep(settle)


def hide_devtools(pg):
    """dev server 下 uni-app H5 右下角的匿名调试按钮（30x30）会污染截图；production 不存在"""
    try:
        pg.evaluate("""() => {
          for (const e of document.querySelectorAll('div')) {
            if (e.className) continue;
            if (getComputedStyle(e).position !== 'fixed') continue;
            const r = e.getBoundingClientRect();
            if (Math.round(r.width) === 30 && Math.round(r.height) === 30 && r.right > 300) e.style.display = 'none';
          }
        }""")
    except Exception:  # noqa: BLE001
        pass


def shot(pg, name, full=False):
    hide_devtools(pg)
    pg.screenshot(path=SHOT + name, full_page=full)
    SHOTS.append(name)
    print('  shot:', name)


def card_count(pg):
    return pg.locator('.tcard').count()


# ---------------- 数据准备（可逆） ----------------
def make_task(pg, loc_id, name, activity, auto_split=True):
    d = gql_data(pg,
                 'mutation($input: StocktakeTaskInput!){ createStocktakeTask(input:$input){ id code state expectedTotal waveCount binModeAtCreate } }',
                 {'input': {'stockLocationId': str(loc_id), 'name': name, 'activityCode': activity,
                            'scope': None, 'autoSplitByZone': auto_split, 'note': None}}, 'createTask')
    t = d['createStocktakeTask']
    print('  建任务 =', t['code'], t['state'], '应盘', t['expectedTotal'], '盘次', t['waveCount'])
    return t


def waves(pg, tid):
    return gql_data(pg, 'query($taskId: ID!){ stocktakeWaves(taskId:$taskId){ id zoneId zoneCode zoneName scopeType state expectedCount countedCount assigneeId } }',
                    {'taskId': str(tid)}, 'waves')['stocktakeWaves']


def claim(pg, wid):
    return gql_data(pg, 'mutation($waveId: ID!){ claimStocktakeWave(waveId:$waveId){ id state assigneeName countedCount } }',
                    {'waveId': str(wid)}, 'claim')['claimStocktakeWave']


def count_some(pg, tid, wid, n=2):
    """给该盘次前 n 行写入实盘（账面 +1），制造差异，让差异页有内容"""
    lines = gql_data(pg, 'query($taskId: ID!, $waveId: ID!){ stocktakeExpectedLines(taskId:$taskId, waveId:$waveId, page:1, pageSize:%d){ items{ id variantId bookQty } } }' % n,
                     {'taskId': str(tid), 'waveId': str(wid)}, 'lines')['stocktakeExpectedLines']['items']
    inputs = [{'lineId': str(l['id']), 'variantId': None, 'countedQty': int(l['bookQty']) + 1,
               'zoneId': None, 'binId': None, 'note': None} for l in lines]
    if not inputs:
        print('    (该盘次无应盘行，跳过录入)')
        return 0
    r = gql_data(pg, 'mutation($waveId: ID!, $inputs: [StocktakeCountEntryInput!]!){ saveStocktakeCounts(waveId:$waveId, inputs:$inputs){ id state countedCount } }',
                 {'waveId': str(wid), 'inputs': inputs}, 'save')['saveStocktakeCounts']
    print('  录入 %d 行 -> 盘次 %s 已盘 %d' % (len(inputs), r['state'], r['countedCount']))
    return len(inputs)


def submit(pg, wid):
    return gql_data(pg, 'mutation($waveId: ID!){ submitStocktakeWave(waveId:$waveId){ id state } }',
                    {'waveId': str(wid)}, 'submit')['submitStocktakeWave']


def cancel_task(pg, tid):
    d = gql_data(pg, 'mutation($taskId: ID!){ cancelStocktakeTask(taskId:$taskId){ id code state } }',
                 {'taskId': str(tid)}, 'cancelTask')['cancelStocktakeTask']
    print('  取消任务 =', d['code'], d['state'])


# ---------------- 主流程 ----------------
ORIGIN_MODE = 'off'
LOC = ''
TASKS_TO_CANCEL = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: ERRS.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: ERRS.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)

        login(pg)
        ch = gql_data(pg, 'query{ activeChannel{ id code customFields{ binMode } } }', None, 'channel')['activeChannel']
        ORIGIN_MODE = (ch.get('customFields') or {}).get('binMode') or 'off'
        print('  渠道 =', ch['code'], ' 原始 binMode =', ORIGIN_MODE)

        locs = gql_data(pg, 'query{ stockLocations{ items{ id name } } }', None, 'locs')['stockLocations']['items']
        hit = next((l for l in locs if WANT_LOC and l['name'] == WANT_LOC), None) \
            or next((l for l in locs if l['name'] == '默认仓'), None) or locs[0]
        LOC = str(hit['id'])
        print('  目标仓 =', LOC, hit['name'])

        # ===== 0) 线上复验分支（Step 7）：只建演示任务 + 可逆切档，不认领/不录入/不提交/不过账 =====
        if LIVE:
            set_mode(pg, 'bin')
            goto(pg, 'pages/inventory/stocktake/index', 8)
            shot(pg, 'stocktake_live_board_390.png')
            if pg.locator('.fab').count():
                pg.locator('.fab').first.tap()
                time.sleep(2.5)
                shot(pg, 'stocktake_live_new_sheet_390.png')
                try:
                    pg.touchscreen.tap(195, 70)
                    time.sleep(1.5)
                except Exception as e:  # noqa: BLE001
                    print('    弹窗关闭跳过：%s' % str(e)[:80])
            t = make_task(pg, LOC, '协同盘库-线上复验', 'ACT-2026-09-24')
            TASKS_TO_CANCEL.append(t['id'])
            ws = waves(pg, t['id'])
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 8)
            shot(pg, 'stocktake_live_task_390.png', full=True)
            if ws:
                goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (t['id'], ws[0]['id']), 8)
                print('  线上录入页 库区Tab=%d 格子=%d 行=%d' % (
                    pg.locator('.ztabs .zt').count(), pg.locator('.cells .cell').count(),
                    pg.locator('.lrow').count()))
                shot(pg, 'stocktake_live_count_390.png', full=True)
                if pg.locator('.cells .cell').count():
                    pg.locator('.cells .cell').first.tap()
                    time.sleep(1.8)
                    shot(pg, 'stocktake_live_count_grid_sel_390.png', full=True)
                if pg.locator('.scan').count():
                    pg.locator('.scan').first.tap()
                    time.sleep(3)
                    shot(pg, 'stocktake_live_scan_390.png')
            goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % t['id'], 8)
            shot(pg, 'stocktake_live_diff_390.png', full=True)
            cancel_task(pg, t['id'])
            TASKS_TO_CANCEL.remove(t['id'])
            goto(pg, 'pages/inventory/stocktake/index', 8)
            shot(pg, 'stocktake_live_done_390.png')
            print('  页面异常 =', [e for e in ERRS if e.startswith('PAGEERR')][:5] or '无',
                  '| console.error =', len([e for e in ERRS if e.startswith('CONSOLE')]))
            b.close()
            raise _LiveDone()

        # 新建弹窗里的「库区多选 + 按库区拆分开关」只在 zone/bin 档出现，故先切 bin 档再截看板与弹窗
        set_mode(pg, 'bin')

        # ===== 1) 看板首屏（+ 条件产出空态）+ 新建弹窗 =====
        goto(pg, 'pages/inventory/stocktake/index', 8)
        n0 = card_count(pg)
        if n0 == 0:
            shot(pg, 'stocktake_board_empty_390.png')
        else:
            shot(pg, 'stocktake_board_first_390.png')
            pg.locator('.tabs .tb').nth(1).tap()          # 「盘点中」
            time.sleep(4)
            if card_count(pg) == 0:
                shot(pg, 'stocktake_board_empty_390.png')
            pg.locator('.tabs .tb').nth(0).tap()
            time.sleep(3)

        if pg.locator('.fab').count():
            pg.locator('.fab').first.tap()
            time.sleep(2.5)
            shot(pg, 'stocktake_new_sheet_390.png')
            # 关闭弹窗：点 .sheet 上方的遮罩空白带（页头导航栏 ≈44px，.sheet 最高 88vh ≈ 从 101px 起）
            try:
                pg.touchscreen.tap(195, 70)
                time.sleep(1.5)
            except Exception as e:  # noqa: BLE001
                print('    弹窗关闭跳过：%s' % str(e)[:80])

        # ===== 2) bin 档：建任务 → 详情 → 录入 → 差异 =====
        t = make_task(pg, LOC, '协同盘库-演示-常温', 'ACT-2026-09-23')
        TASKS_TO_CANCEL.append(t['id'])
        ws = waves(pg, t['id'])
        print('  盘次数 =', len(ws))

        goto(pg, 'pages/inventory/stocktake/index', 8)
        shot(pg, 'stocktake_board_bin_390.png')
        goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 8)
        shot(pg, 'stocktake_task_bin_390.png', full=True)

        if ws:
            w0 = ws[0]
            claim(pg, w0['id'])
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 7)
            shot(pg, 'stocktake_task_claimed_390.png', full=True)

            count_url = 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (t['id'], w0['id'])
            goto(pg, count_url, 8)
            print('  录入页 库区Tab=%d 格子=%d 行=%d' % (
                pg.locator('.ztabs .zt').count(), pg.locator('.cells .cell').count(), pg.locator('.lrow').count()))
            shot(pg, 'stocktake_count_bin_390.png', full=True)
            if pg.locator('.cells .cell').count():
                pg.locator('.cells .cell').first.tap()
                time.sleep(1.8)
                shot(pg, 'stocktake_count_grid_sel_390.png', full=True)
            if pg.locator('.scan').count():
                pg.locator('.scan').first.tap()
                time.sleep(3)
                shot(pg, 'stocktake_scan_390.png')
                if pg.locator('.sbtn.ghost').count():
                    pg.locator('.sbtn.ghost').first.tap()
                    time.sleep(1.5)
                    shot(pg, 'stocktake_scan_manual_390.png')
                goto(pg, count_url, 6)                      # 不用 go_back：hash 路由下返回落点不可靠

            count_some(pg, t['id'], w0['id'], 2)
            goto(pg, count_url, 8)
            # 默认筛选是「未盘」，已盘行会被筛掉；切「全部」才看得到已盘行的绿标与进度增长
            pg.locator('.frow .fb').nth(0).tap()
            time.sleep(2)
            shot(pg, 'stocktake_count_saved_390.png', full=True)
            submit(pg, w0['id'])

            goto(pg, 'pages/inventory/stocktake/diff?taskId=%s' % t['id'], 8)
            print('  差异页 摘要=%d 差异行=%d 未盘勾选=%d' % (
                pg.locator('.sum').count(), pg.locator('.trow').count(), pg.locator('.skip').count()))
            shot(pg, 'stocktake_diff_390.png', full=True)
            if pg.locator('.skip').count():
                pg.locator('.bh').first.tap()               # 展开未盘清单，勾选态与清单同框
                time.sleep(1.5)
                pg.locator('.skip').first.tap()
                time.sleep(1.5)
                shot(pg, 'stocktake_diff_skip_390.png', full=True)

            # 详情页此刻同时含「已提交盘次」与「待认领盘次」两种态（本任务按库区分了 2 个盘次）。
            # 不再调 releaseStocktakeWave：状态机禁止释放已提交/已取消的盘次（服务端报「盘次 #18 已提交或已取消」）。
            goto(pg, 'pages/inventory/stocktake/task?id=%s' % t['id'], 7)
            shot(pg, 'stocktake_task_open_390.png', full=True)

        # ===== 3) zone 档 =====
        set_mode(pg, 'zone')
        tz = make_task(pg, LOC, '协同盘库-演示-库区档', 'ACT-2026-09-23', auto_split=True)
        TASKS_TO_CANCEL.append(tz['id'])
        wzz = waves(pg, tz['id'])
        goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (tz['id'], wzz[0]['id'] if wzz else ''), 8)
        print('  zone 档 库区Tab=%d 格子=%d（zone 档应为 0 格）' % (
            pg.locator('.ztabs .zt').count(), pg.locator('.cells .cell').count()))
        shot(pg, 'stocktake_count_zone_390.png', full=True)
        cancel_task(pg, tz['id'])
        TASKS_TO_CANCEL.remove(tz['id'])

        # ===== 4) off 档 =====
        set_mode(pg, 'off')
        to = make_task(pg, LOC, '协同盘库-演示-整仓', 'ACT-2026-09-23', auto_split=False)
        TASKS_TO_CANCEL.append(to['id'])
        wo = waves(pg, to['id'])
        goto(pg, 'pages/inventory/stocktake/count?taskId=%s&waveId=%s' % (to['id'], wo[0]['id'] if wo else ''), 8)
        print('  off 档盘次 = %s 页头 = %s' % ([w['id'] for w in wo], pg.locator('.wt').first.inner_text()))
        shot(pg, 'stocktake_count_off_390.png', full=True)
        cancel_task(pg, to['id'])
        TASKS_TO_CANCEL.remove(to['id'])

        # ===== 5) 收尾：取消演示任务 =====
        cancel_task(pg, t['id'])
        TASKS_TO_CANCEL.remove(t['id'])
        goto(pg, 'pages/inventory/stocktake/index', 8)
        shot(pg, 'stocktake_board_done_390.png')
        js_err = [e for e in ERRS if e.startswith('PAGEERR')]
        print('  页面异常 =', js_err[:5] if js_err else '无',
              '| console.error =', len([e for e in ERRS if e.startswith('CONSOLE')]))
        b.close()
except _LiveDone:
    print('  线上复验分支完成：未认领 / 未录入 / 未提交 / 未过账，仅建 1 个演示任务并已取消')
finally:
    try:
        with sync_playwright() as p2:
            b2 = p2.chromium.launch(headless=True)
            pg2 = b2.new_context(viewport={'width': 390, 'height': 844}).new_page()
            login(pg2)
            # 兜底：任何未取消的演示任务
            for tid in TASKS_TO_CANCEL:
                try:
                    cancel_task(pg2, tid)
                except Exception as e:  # noqa: BLE001
                    print('  !! 任务取消失败', tid, str(e)[:120])
            set_mode(pg2, ORIGIN_MODE)
            print('  已还原 binMode = %s' % ORIGIN_MODE)
            b2.close()
    except Exception as e:  # noqa: BLE001
        print('  !! 档位还原失败，请手工改回 off：', str(e)[:160])

os.makedirs(MANUAL, exist_ok=True)
for n in SHOTS:
    shutil.copy(SHOT + n, MANUAL + n)
print('copied %d shots -> manual assets' % len(SHOTS))
print('done')
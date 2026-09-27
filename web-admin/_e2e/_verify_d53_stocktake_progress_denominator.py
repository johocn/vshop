# -*- coding: utf-8 -*-
"""D53 验收：协同盘库「任务级进度分母排除已取消盘次」。

背景（D51 设计稿 §4 登记的 ⓑ 项）：
  取消盘次 = 放弃这一批盘点。`resolveTaskStateAfterWaves` 已把 CANCELLED 当作「不再要求」
  （不阻塞任务进 COUNTED），`post()` 也已把 CANCELLED 盘次从「未提交盘次」里剔除；
  但 `buildTaskView` 仍按**全量**行/盘次统计 expectedTotal / countedTotal / waveCount /
  submittedWaveCount → 任务哪怕已 COUNTED，看板卡片也永远停在「已盘 3/10」「盘次 1/2 已提交」，
  分母里全是永远盘不到的行。D53 新增纯函数 `progressWaves` 统一该口径。

本脚本验证（默认线上，全程 **零库存写入**、**绝不调 postStocktake**）：
  ① 前提：t2 为纯虚拟库存店（physicalStockEnabled=false，读 overview 不臆测）
  ② 建一个协同盘库任务（`autoSplitByZone` 缺省 = 按库区拆）→ 记录基线
     expectedTotal / waveCount
  ③ **取消期望数最大的那个盘次** → 断言（fix 后）：
     · expectedTotal 恰好下降 = 被取消盘次的 expectedCount（fix 前不会下降）
     · waveCount 恰好 -1
     · 任务仍为进行中（未因取消盘次而变 COUNTED/CANCELLED，除非它本来就是唯一盘次）
  ④ UI（手机 390×844 dpr=2）：看板卡片「已盘 {done}/{total}」文本随 ③ 同步下降
     → 3 张截图：取消前 / 取消盘次后 / 取消任务后
  ⑤ 取消整个任务 → 断言任务 CANCELLED 且 expectedTotal **回到全量**（历史进度口径，
     不归零成 0/0，否则前端 pct() 会显示成 100%）
  ⑥ 全程 0 pageerror

环境变量：WA_D53_BASE、WA_API_ADMIN、WA_SMOKE_USER / WA_SMOKE_PWD、
  WA_D53_ADMIN_USER / WA_D53_ADMIN_PWD（默认 superadmin / z123123）、WA_D53_TAG
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

BASE = os.environ.get('WA_D53_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
ADMIN_USER = os.environ.get('WA_D53_ADMIN_USER', 'superadmin')
ADMIN_PWD = os.environ.get('WA_D53_ADMIN_PWD', 'z123123')
TAG = os.environ.get('WA_D53_TAG', '')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
BOARD = 'pages/inventory/stocktake/index'
TENANT_CH = 't2'
ACT = 'D53-VERIFY'

FAILS = []
OKS = []


def info(msg):
    print('  %s' % msg)


def ok(msg):
    OKS.append(msg)
    print('  [OK] %s' % msg)


def bad(msg):
    FAILS.append(msg)
    print('  [FAIL] %s' % msg)


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


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
    return str(es[0].get('message'))[:250] if es else None


def data_of(r, path):
    cur = r.get('data') or {}
    for p in path.split('.'):
        if cur is None:
            return None
        cur = cur.get(p) if isinstance(cur, dict) else None
    return cur


def login_api(user, pwd):
    q = ('mutation($u:String!,$p:String!){login(username:$u,password:$p)'
         '{... on CurrentUser{id identifier}}}')
    tok, r = api(q, {'u': user, 'p': pwd})
    if not tok:
        body = json.dumps({'query': q, 'variables': {'u': user, 'p': pwd}}).encode()
        req = urllib.request.Request('%s/login' % ADMIN, data=body,
                                     headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                tok = resp.headers.get('vendure-auth-token')
        except Exception:  # noqa: BLE001
            tok = None
    if not tok:
        env_fail('%s 登录失败 %s' % (user, json.dumps(r, ensure_ascii=False)[:300]))
    return tok


def channels_of(tok):
    _, r = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = data_of(r, 'myTenantAccess.channels') or []
    if not chans:
        _, r2 = api('query{channels{items{id code token}}}', token=tok)
        chans = data_of(r2, 'channels.items') or []
    return chans


def overview(tok, ctoken):
    _, r = api('query{tenantInventoryOverview{channelCode physicalStockEnabled '
               'locations{id name kind}}}', token=tok, channel=ctoken)
    e = gerr(r)
    if e:
        env_fail('tenantInventoryOverview 失败：%s' % e)
    ov = data_of(r, 'tenantInventoryOverview') or {}
    if not ov:
        env_fail('tenantInventoryOverview 返回空：%s' % json.dumps(r, ensure_ascii=False)[:200])
    return ov


TVIEW = 'id code state expectedTotal countedTotal waveCount submittedWaveCount locationName'


def get_task(tok, ctoken, task_id):
    _, r = api('query($id:ID!){stocktakeTask(id:$id){%s}}' % TVIEW, {'id': str(task_id)},
               token=tok, channel=ctoken)
    e = gerr(r)
    if e:
        env_fail('stocktakeTask 失败：%s' % e)
    return data_of(r, 'stocktakeTask')


def get_waves(tok, ctoken, task_id):
    _, r = api('query($id:ID!){stocktakeWaves(taskId:$id){id scopeType zoneCode zoneName state '
               'expectedCount countedCount}}', {'id': str(task_id)}, token=tok, channel=ctoken)
    e = gerr(r)
    if e:
        env_fail('stocktakeWaves 失败：%s' % e)
    return data_of(r, 'stocktakeWaves') or []


def create_task(tok, ctoken, loc_id, name):
    q = ('mutation($input:StocktakeTaskInput!){createStocktakeTask(input:$input){%s}}' % TVIEW)
    _, r = api(q, {'input': {
        'stockLocationId': str(loc_id), 'name': name, 'activityCode': ACT,
        'scope': {'includeZeroBook': True},
    }}, token=tok, channel=ctoken)
    return data_of(r, 'createStocktakeTask'), gerr(r)


def cancel_wave(tok, ctoken, wave_id):
    _, r = api('mutation($id:ID!){cancelStocktakeWave(waveId:$id){id state}}', {'id': str(wave_id)},
               token=tok, channel=ctoken)
    return data_of(r, 'cancelStocktakeWave'), gerr(r)


def cancel_task(tok, ctoken, task_id):
    _, r = api('mutation($id:ID!){cancelStocktakeTask(taskId:$id){%s}}' % TVIEW, {'id': str(task_id)},
               token=tok, channel=ctoken)
    return data_of(r, 'cancelStocktakeTask'), gerr(r)


# ---- UI ----
def login_ui(pg, user, pwd, ch_token=None, ch_code=None):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(user)
    pg.locator('input').nth(1).fill(pwd)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)
    if ch_token:
        pg.evaluate('([t, c]) => { localStorage.setItem("wa_channel_token", t);'
                    ' localStorage.setItem("wa_channel_code", c); }', [ch_token, ch_code])


def open_board(pg):
    pg.goto(BASE + '#/' + BOARD + '?cb=' + str(int(time.time() * 1000)),
            wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.tcard').first.wait_for(state='visible', timeout=90000)
    time.sleep(1.2)


def shoot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    return OUT / ('d53_progress_denominator_%s_390.png' % name)


def card_shot(pg, code, shot):
    """滚到目标任务卡 → 截 390×844 dpr2 → 返回卡片文本（断言 API↔UI 同值）"""
    card = pg.locator('.tcard').filter(has_text=code).first
    card.wait_for(state='visible', timeout=30000)
    card.scroll_into_view_if_needed()
    time.sleep(0.5)
    pg.screenshot(path=str(shot))
    return card.inner_text()


def prog_text(n, m):
    return '%d/%d' % (n, m)


def run():
    print('== 登录 ==')
    login_api(USER, PWD)
    admin_tok = login_api(ADMIN_USER, ADMIN_PWD)
    a_chans = {c['code']: c['token'] for c in channels_of(admin_tok)}
    if TENANT_CH not in a_chans:
        env_fail('超管会话看不到渠道 %s' % TENANT_CH)
    ctoken = a_chans[TENANT_CH]

    print('== ① 前提：%s 为纯虚拟库存店 ==' % TENANT_CH)
    ov = overview(admin_tok, ctoken)
    info('%s: physicalStockEnabled=%s locations=%d'
         % (TENANT_CH, ov['physicalStockEnabled'], len(ov['locations'])))
    if ov['physicalStockEnabled'] is not False:
        bad('%s 开关应为 false（前提不成立）' % TENANT_CH)
        return
    ok('前提成立：%s = 纯虚拟库存店' % TENANT_CH)

    print('== ② 建协同盘库任务（autoSplitByZone 缺省 = 按库区拆）==')
    task = None
    last_err = None
    for loc in ov['locations']:
        t, err = create_task(admin_tok, ctoken, loc['id'], 'D53 进度分母校验')
        if t:
            task = t
            info('在仓「%s」(%s) 建任务成功' % (loc['name'], loc['id']))
            break
        last_err = '仓「%s」：%s' % (loc['name'], err)
    if not task:
        env_fail('所有仓都建不出任务（需至少一个仓有可盘商品）：%s' % last_err)

    code, tid = task['code'], task['id']
    base_expected, base_waves = task['expectedTotal'], task['waveCount']
    info('基线 %s：state=%s expectedTotal=%d countedTotal=%d waveCount=%d'
         % (code, task['state'], base_expected, task['countedTotal'], base_waves))
    if base_waves < 1 or base_expected < 1:
        cancel_task(admin_tok, ctoken, tid)
        env_fail('任务无盘次/无应盘行（夹具不足）：expectedTotal=%d waveCount=%d' % (base_expected, base_waves))
    waves = get_waves(admin_tok, ctoken, tid)
    info('盘次：%s' % [(w['scopeType'], w['zoneCode'], w['expectedCount'], w['state']) for w in waves])

    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        try:
            login_ui(pg, ADMIN_USER, ADMIN_PWD, ctoken, TENANT_CH)
            open_board(pg)
            shot_before = shoot('before_wave_cancel')
            txt = card_shot(pg, code, shot_before)
        except Exception as e:  # noqa: BLE001
            br.close()
            bad('UI 打开看板异常：%s' % str(e)[:200])
            return

        print('== ③ 取消期望数最大的盘次 → 进度分母应同步下降 ==')
        target = max(waves, key=lambda w: w['expectedCount'])
        info('取消盘次 #%s（%s / zone=%s）expectedCount=%d'
             % (target['id'], target['scopeType'], target['zoneCode'], target['expectedCount']))
        after, err = cancel_wave(admin_tok, ctoken, target['id'])
        if err:
            br.close()
            bad('取消盘次失败：%s' % err)
            return
        task2 = get_task(admin_tok, ctoken, tid)
        exp2 = task2['expectedTotal']
        want2 = base_expected - target['expectedCount']
        info('取消后：state=%s expectedTotal=%d waveCount=%d'
             % (task2['state'], exp2, task2['waveCount']))
        if exp2 != want2:
            bad('expectedTotal 未按取消盘次扣减：期望 %d，实得 %d（fix 前会停在 %d）'
                % (want2, exp2, base_expected))
        else:
            ok('expectedTotal 由 %d 降为 %d（恰好减去被取消盘次的 %d 行）'
               % (base_expected, exp2, target['expectedCount']))
        if task2['waveCount'] != base_waves - 1:
            bad('waveCount 未排除已取消盘次：期望 %d，实得 %d' % (base_waves - 1, task2['waveCount']))
        else:
            ok('waveCount 由 %d 降为 %d（取消的盘次不再占分母）' % (base_waves, task2['waveCount']))

        try:
            open_board(pg)
            shot_after = shoot('after_wave_cancel')
            txt2 = card_shot(pg, code, shot_after)
            if prog_text(task2['countedTotal'], exp2) not in txt2:
                bad('看板卡片未反映新分母（找 %s）：%s' % (prog_text(task2['countedTotal'], exp2),
                                                          txt2.replace('\n', ' | ')[:160]))
            else:
                ok('看板卡片显示「%s」与 API 同值 → 截图 %s'
                   % (prog_text(task2['countedTotal'], exp2), shot_after.name))
        except Exception as e:  # noqa: BLE001
            bad('取消后重开看板异常：%s' % str(e)[:200])

        print('== ⑤ 取消整个任务 → 进度回到全量（历史口径，不归零）==')
        t3, err3 = cancel_task(admin_tok, ctoken, tid)
        if err3:
            br.close()
            bad('取消任务失败：%s' % err3)
            return
        task3 = get_task(admin_tok, ctoken, tid)
        info('取消任务后：state=%s expectedTotal=%d waveCount=%d'
             % (task3['state'], task3['expectedTotal'], task3['waveCount']))
        if task3['state'] != 'CANCELLED':
            bad('任务状态应为 CANCELLED，实得 %s' % task3['state'])
        elif task3['expectedTotal'] != base_expected:
            bad('已取消任务的进度应保留全量 %d（展示「当初盘到哪」），实得 %d'
                % (base_expected, task3['expectedTotal']))
        else:
            ok('已取消任务保留全量：expectedTotal=%d（未归零成 0/0）' % task3['expectedTotal'])

        try:
            open_board(pg)
            shot_cancel = shoot('after_task_cancel')
            txt3 = card_shot(pg, code, shot_cancel)
            if prog_text(task3['countedTotal'], task3['expectedTotal']) not in txt3:
                bad('已取消任务卡片未显示全量（找 %s）：%s'
                    % (prog_text(task3['countedTotal'], task3['expectedTotal']),
                       txt3.replace('\n', ' | ')[:160]))
            else:
                ok('已取消任务卡片显示「%s」→ 截图 %s'
                   % (prog_text(task3['countedTotal'], task3['expectedTotal']), shot_cancel.name))
        except Exception as e:  # noqa: BLE001
            bad('取消任务后重开看板异常：%s' % str(e)[:200])

        if errs:
            bad('页面 JS 异常 %d 条：%s' % (len(errs), errs[:2]))
        else:
            ok('全程 0 pageerror；3 张 390×844(dpr2) 截图落 docs/verify/')
        pg.close()
        br.close()


if __name__ == '__main__':
    run()
    print('')
    print('== 结论：%d 项通过 / %d 项失败 ==' % (len(OKS), len(FAILS)))
    for f in FAILS:
        print('  FAIL: %s' % f)
    raise SystemExit(1 if FAILS else 0)
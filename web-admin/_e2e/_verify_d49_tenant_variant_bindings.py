# -*- coding: utf-8 -*-
"""D49 验收：租户级「变体 × 物理仓」绑定（库存明细页卡片动作 → 底部弹层）。

背景（G4）：变体绑定物理仓的能力原本只有平台侧入口 `setVariantBindings`
（cjk-plugin admin SDL），其 `@Allow(InventoryPermissions.ViewStock)` 是 inventory-plugin 的
**超管语义全局库存权限**，不在租户角色白名单（`tenant/role-templates.ts` 的
`OFFICIAL_ROLE_TEMPLATES`）内 → 租户账号调用恒 403（与 D41 / D42 同病根）。
而租户侧前端**本来就能自建物理仓**（`createTenantStockLocation` 等租户级 mutation），
却无法把变体绑上去 —— 能力缺一块。

修复（D49）：新开租户级入口（不放宽核心 @Allow）
  query    tenantVariantBindings(variantId)                 @Allow(ReadCatalog, ReadStockLocation)
  mutation setTenantVariantBindings(variantId, bindings)    @Allow(UpdateStockLocation)
归属校验沿用平台侧逻辑（仓 kind='physical' 且 code 属当前租户，含 `{code}-` 前缀），
另加 `assertVariantInChannel` 防跨店读写他店变体。

两种会话（缺一不可）：
  * 租户会话（默认 guoxinnanshan@163.com）：证明**权限**结论 —— 核心入口仍 403、租户级入口可读写。
  * 超管会话（默认 superadmin@china.test）：UI 交互与截图。原因：租户名下唯一渠道 t2 是
    `physicalStockEnabled=false` 的纯虚拟库存店（物理仓 0 个），且库存明细页的仓池在「有物理仓时
    只取物理仓」（inventory-stock.service `resolveLocations`），故物理仓模式店铺才能渲染出可点的卡片。

三态断言（WA_D49_STATE）：
  before（旧前端 + 旧后端）
    ① 租户令牌调核心 setVariantBindings → 授权失败（病根；且核心权限**未**被放宽）
    ② 租户令牌调 tenantVariantBindings / setTenantVariantBindings → 字段不存在（本轮新增能力）
    ③ UI：库存卡片只有 3 个动作，**没有**「绑定」按钮
  after （新前端 + 新后端）
    ① 核心 setVariantBindings 仍授权失败（把事实钉住：没有放宽核心 @Allow）
    ② 租户级入口可用：读回空数组；写空数组成功（= UpdateStockLocation 权限通、幂等解绑）
    ②b 反例：绑虚拟仓被拒（且**不是**授权错误 → 证明权限已通过、性质校验生效）
    ②c 反例：不存在的变体被拒（assertVariantInChannel 生效）
    ③ UI：卡片出现「绑定」→ 弹层列出本店物理仓（行数 = API 物理仓数）
    ④ UI：勾选 → 设为默认 → 保存 → toast「物理仓绑定已更新」
    ⑤ 持久化：API 回读该变体恰好 1 条绑定且 isDefault=true；重开弹层勾选态与默认态仍在
    ⑥ 收尾：API 解绑回读为空（脚本自清理，供 baseline 态复跑）
  baseline（已解绑）
    ① 租户级读 = 空数组；② UI 重开弹层 0 条勾选（解绑已落库，非仅前端态）

环境变量：WA_D49_BASE（默认 https://e.joho.cn/guanli/）、WA_API_ADMIN、
  WA_SMOKE_USER / WA_SMOKE_PWD（租户）、WA_D49_ADMIN_USER / WA_D49_ADMIN_PWD（超管）、
  WA_D49_UI_CHANNEL（默认空 = 自动挑选「有物理仓且有库存行」的渠道）、
  WA_D49_STATE（before|after|baseline，默认 after）、WA_D49_TAG（截图文件名后缀）
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

BASE = os.environ.get('WA_D49_BASE', 'https://e.joho.cn/guanli/')
ADMIN = os.environ.get('WA_API_ADMIN', 'https://e.joho.cn/admin-api')
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
ADMIN_USER = os.environ.get('WA_D49_ADMIN_USER', 'superadmin@china.test')
ADMIN_PWD = os.environ.get('WA_D49_ADMIN_PWD', 'superadmin')
UI_CHANNEL = os.environ.get('WA_D49_UI_CHANNEL', '').strip()
STATE = os.environ.get('WA_D49_STATE', 'after').strip().lower()
TAG = os.environ.get('WA_D49_TAG', STATE + '-')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'
STOCK = 'pages/inventory/stock/index'

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


def env_fail(msg):
    print('ENV-FAIL: %s' % msg)
    raise SystemExit(2)


# ---- 登录 ----
def login_api(user, pwd):
    """登录拿令牌：先走常规 admin-api，失败再走 `/admin-api/login` 专用端点
    （历史脚本对 superadmin 走的就是后者，见 _verify_gap4_batch1.admin_login）。"""
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
    _, r2 = api('query{myTenantAccess{channels{id code token}}}', token=tok)
    chans = ((r2.get('data') or {}).get('myTenantAccess') or {}).get('channels') or []
    return tok, chans


OVERVIEW_Q = ('query{tenantInventoryOverview{physicalStockEnabled virtualLocationId '
              'defaultPhysicalLocationId locations{id name code kind isSystem}}}')


def overview(tok, ctoken):
    _, r = api(OVERVIEW_Q, token=tok, channel=ctoken)
    if gerr(r):
        return None
    return (r.get('data') or {}).get('tenantInventoryOverview')


def stock_rows(tok, ctoken):
    _, r = api('query($i:InventoryStockQueryInput){inventoryStockPage(input:$i){totalItems '
               'items{variantId sku onHand stockLocationId}}}',
               {'i': {'page': 1, 'pageSize': 5}}, token=tok, channel=ctoken)
    if gerr(r):
        return None, gerr(r)
    return ((r.get('data') or {}).get('inventoryStockPage') or {}), None


def pick_ui_channel(atok, chans):
    """挑「有物理仓 + 库存行非空」的渠道：绑定对象是物理仓，且 UI 卡片要能渲染出行。"""
    cands = [UI_CHANNEL] if UI_CHANNEL else [c['code'] for c in chans]
    tried = []
    for code in cands:
        ch = next((c for c in chans if c['code'] == code), None)
        if not ch:
            continue
        ov = overview(atok, ch['token'])
        if not ov:
            tried.append('%s:概览失败' % code)
            continue
        phys = [l for l in (ov.get('locations') or []) if l.get('kind') == 'physical']
        page, err = stock_rows(atok, ch['token'])
        n = len((page or {}).get('items') or [])
        tried.append('%s:物理仓%d/行%d%s' % (code, len(phys), n, '/err' if err else ''))
        if phys and n:
            info('自动选中 UI 渠道 %s（物理仓 %d 个、库存行 %d 条）' % (code, len(phys), n))
            return ch, phys, (page.get('items') or [])
    if UI_CHANNEL:
        env_fail('指定渠道 %s 不可用（需同时有物理仓与库存行）' % UI_CHANNEL)
    env_fail('没有「既有物理仓又有库存行」的渠道，候选：%s' % '；'.join(tried))


# ---- 接口层探针 ----
def core_set_bindings(tok, ctoken):
    """核心 setVariantBindings（租户令牌）。用**不存在的变体 id**：权限校验先于 resolver，
    有权限则报「变体不存在」，无权限则报授权失败 —— 两种结果都不会产生任何写入。"""
    _, r = api('mutation($v:ID!,$b:[VariantBindingInput!]!){setVariantBindings(variantId:$v,bindings:$b){id}}',
               {'v': '999999999', 'b': []}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    return gerr(r) or 'NO-ERROR'


def read_bindings(tok, ctoken, vid):
    """租户级读：返回 (值, 错误串)。字段不存在（旧后端）→ HTTP 400 → TRANSPORT。"""
    _, r = api('query($v:ID!){tenantVariantBindings(variantId:$v){id locationId isDefault}}',
               {'v': vid}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    err = gerr(r)
    if err:
        return None, err
    v = (r.get('data') or {}).get('tenantVariantBindings')
    if v is None:
        return None, '响应无该字段：%s' % json.dumps(r, ensure_ascii=False)[:200]
    return v, None


def write_bindings(tok, ctoken, vid, bindings):
    _, r = api('mutation($v:ID!,$b:[VariantBindingInput!]!){setTenantVariantBindings(variantId:$v,bindings:$b)'
               '{id locationId isDefault}}', {'v': vid, 'b': bindings}, token=tok, channel=ctoken)
    if 'TRANSPORT' in r:
        return None, 'TRANSPORT %s' % str(r['TRANSPORT'])[:150]
    err = gerr(r)
    if err:
        return None, err
    v = (r.get('data') or {}).get('setTenantVariantBindings')
    if v is None:
        return None, '响应无该字段：%s' % json.dumps(r, ensure_ascii=False)[:200]
    return v, None


# ---- UI 辅助 ----
def login_ui(pg, user, pwd):
    pg.goto(BASE, wait_until='domcontentloaded', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=60000)
    pg.locator('input').nth(0).fill(user)
    pg.locator('input').nth(1).fill(pwd)
    pg.locator('button, .btn').first.click()
    pg.wait_for_function("() => !!localStorage.getItem('wa_auth_token')", timeout=60000)


def open_stock(pg):
    pg.goto(BASE + '#/' + STOCK + '?cb=' + str(int(time.time() * 1000)), wait_until='domcontentloaded', timeout=60000)
    pg.reload(wait_until='domcontentloaded', timeout=60000)
    pg.locator('.list .card').first.wait_for(state='visible', timeout=90000)
    time.sleep(0.8)


def toast_text(pg, wait=6.0, not_equal=None):
    """uni.showToast 文案（H5 渲染为 uni-toast）。not_equal = 上一条文案（元素常驻 DOM，会读到旧值）。"""
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


def first_card(pg):
    return pg.locator('.list .card').first


def card_sku(pg):
    """卡片 SKU 文本：`.skuline` = `SKU · 规格`，取 `·` 前一段。"""
    t = first_card(pg).locator('.skuline').first.inner_text().strip()
    return t.split('·')[0].strip()


def act_texts(pg):
    return [e.strip() for e in first_card(pg).locator('.acts .act').all_inner_texts()]


def open_bind_sheet(pg):
    first_card(pg).locator('.acts .act').filter(has_text='绑定').first.click()
    pg.locator('.sheet').wait_for(state='visible', timeout=30000)
    time.sleep(0.8)


def bind_state(pg):
    """弹层当前态：(物理仓行数, 已勾选数, 是否有默认仓标记, 是否空态提示)"""
    sheet = pg.locator('.sheet').first
    return (sheet.locator('.blist .brow').count(),
            sheet.locator('.blist .bcheck.on').count(),
            sheet.locator('.blist .bdef.on').count() > 0,
            sheet.locator('.bhint').count() > 0)


def shot(pg, name, full=False):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-d49-%s.png' % name)
    pg.screenshot(path=str(f), full_page=full)
    check('⑦ 截图 %s' % f.name, f.exists() and f.stat().st_size > 4000,
          '%dB' % (f.stat().st_size if f.exists() else 0))
    return f


def main():
    if STATE not in ('before', 'after', 'baseline'):
        env_fail('WA_D49_STATE 必须是 before / after / baseline，当前 %r' % STATE)

    # ---- 租户会话：权限结论（不受 UI 渠道选择影响）----
    ttok, tchans = login_api(USER, PWD)
    if not tchans:
        env_fail('租户账号无渠道')
    tch = tchans[0]
    tov = overview(ttok, tch['token'])
    tpage, terr = stock_rows(ttok, tch['token'])
    if not tov or terr or not (tpage or {}).get('items'):
        env_fail('租户渠道 %s 概览/库存行不可用（%s / %s）' % (tch['code'], bool(tov), terr))
    tvid = str(tpage['items'][0]['variantId'])
    tphys = [l for l in tov['locations'] if l.get('kind') == 'physical']
    info('租户渠道 %s：探针变体 %s，物理仓 %d 个，虚拟仓 %s'
         % (tch['code'], tvid, len(tphys), tov.get('virtualLocationId')))

    # ① 核心入口对租户仍 403（修复前后都必须成立 = 未放宽核心 @Allow）
    core_err = core_set_bindings(ttok, tch['token'])
    check('① 核心 setVariantBindings 对租户令牌仍授权失败（未放宽核心 @Allow）',
          'not currently authorized' in core_err.lower(), '实际 %r' % core_err)

    tval, terr2 = read_bindings(ttok, tch['token'], tvid)
    if STATE == 'before':
        check('② 旧后端下 tenantVariantBindings 不存在（本轮新增能力）',
              tval is None and terr2 is not None, '实际 %r / %s' % (tval, terr2))
        if tval is not None:
            env_fail('后端已部署 D49（tenantVariantBindings 可用），before 态不适用')
        wval, werr0 = write_bindings(ttok, tch['token'], tvid, [])
        check('②b 旧后端下 setTenantVariantBindings 不存在',
              wval is None and werr0 is not None, '实际 %r / %s' % (wval, werr0))
    else:
        if terr2:
            env_fail('tenantVariantBindings 不可用（后端未部署？）%s' % terr2)
        if STATE == 'baseline':
            check('① baseline：tenantVariantBindings = 空数组（已解绑）', tval == [],
                  '实际 %s' % json.dumps(tval, ensure_ascii=False))
        else:
            # 先写空数组（幂等解绑）再读：脚本可重复跑，且同时证明「写」入口权限通
            wval, werr = write_bindings(ttok, tch['token'], tvid, [])
            check('② 租户级写可用：写空数组成功（UpdateStockLocation 权限通、幂等解绑）',
                  werr is None and wval == [], '实际 %r / %s' % (wval, werr))
            tval, terr2 = read_bindings(ttok, tch['token'], tvid)
            check('②b 租户级读可用：清空后 tenantVariantBindings = 空数组',
                  (not terr2) and tval == [], '实际 %r / %s' % (tval, terr2))
            # ②c 反例：绑虚拟仓 → 被拒，且错误**不是**授权错误（证明权限已过、性质校验生效）
            if tov.get('virtualLocationId'):
                bad, baderr = write_bindings(ttok, tch['token'], tvid,
                                             [{'locationId': str(tov['virtualLocationId']), 'isDefault': True}])
                check('②c 绑虚拟仓被拒（非「物理仓」校验生效，且非权限问题）',
                      bad is None and bool(baderr) and 'not currently authorized' not in baderr.lower(),
                      '实际 %r / %s' % (bad, baderr))
            # ②d 反例：越权变体 → assertVariantInChannel 生效
            bad2, baderr2 = write_bindings(ttok, tch['token'], '999999999', [])
            check('②d 不存在/他店变体被拒（assertVariantInChannel 生效）',
                  bad2 is None and bool(baderr2), '实际 %r / %s' % (bad2, baderr2))
            back, berr = read_bindings(ttok, tch['token'], tvid)
            check('②e 反例后回读仍为空（校验失败未留下脏数据）', berr is None and back == [],
                  '实际 %r / %s' % (back, berr))

    # ---- 超管会话：UI 交互 + 截图 ----
    atok, achans = login_api(ADMIN_USER, ADMIN_PWD)
    if not achans:
        env_fail('超管账号无渠道（myTenantAccess 为空）')
    ch, phys, rows = pick_ui_channel(atok, achans)
    ctoken = ch['token']
    uvk = str(rows[0]['variantId'])
    info('UI 渠道 %s：物理仓 %s，首行变体 %s' % (ch['code'], [l['code'] for l in phys], uvk))
    if STATE == 'after':
        w, e = write_bindings(atok, ctoken, uvk, [])
        if e:
            env_fail('UI 渠道预清理失败（%s）；请确认该渠道账号可写绑定' % e)

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR %s' % e))
        pg.on('console', lambda m: errs.append('CONSOLE[%s] %s' % (m.type, m.text[:300])) if m.type == 'error' else None)
        login_ui(pg, ADMIN_USER, ADMIN_PWD)
        pg.evaluate("([c, t]) => { localStorage.setItem('wa_channel_token', t); localStorage.setItem('wa_channel_code', c); }",
                    [ch['code'], ctoken])
        open_stock(pg)

        acts = act_texts(pg)
        info('首卡动作：%s' % acts)
        if STATE == 'before':
            check('③ 旧前端卡片无「绑定」动作（仅 %d 个动作）' % len(acts),
                  len(acts) == 3 and not any('绑定' in a for a in acts), '实际 %s' % acts)
            shot(pg, '%scard-no-bind' % TAG, full=False)
        else:
            check('③ 新前端卡片出现「绑定」动作', any('绑定' in a for a in acts), '实际 %s' % acts)
            open_bind_sheet(pg)
            n_rows, n_checked, has_def, empty = bind_state(pg)
            info('弹层：物理仓行 %d / 已勾选 %d / 有默认仓 %s / 空态 %s'
                 % (n_rows, n_checked, has_def, empty))
            check('③b 弹层列出本店全部物理仓（%d 条 = API 物理仓数）' % len(phys),
                  (not empty) and n_rows == len(phys), '实际 %d 行 / 空态 %s' % (n_rows, empty))
            if STATE == 'baseline':
                check('② baseline：弹层 0 条勾选（解绑已落库，非仅前端态）', n_checked == 0,
                      '实际 %d 条勾选' % n_checked)
                shot(pg, '%ssheet-unbound' % TAG, full=False)
            else:
                pg.locator('.sheet .blist .brow').first.click()
                time.sleep(0.5)
                _, n_checked, has_def, _ = bind_state(pg)
                check('④ 勾选物理仓后勾选态生效', n_checked >= 1, '实际 %d' % n_checked)
                if not has_def:
                    pg.locator('.sheet .bdef').first.click()
                    time.sleep(0.5)
                _, _, has_def, _ = bind_state(pg)
                check('④b 单选默认仓生效（出现「默认仓」标记）', has_def, '实际 %s' % has_def)
                shot(pg, '%ssheet-selected' % TAG, full=False)

                prev = toast_text(pg, wait=0.4)
                pg.locator('.sheet .sbtns .sbtn').last.click()
                tt = toast_text(pg, wait=12.0, not_equal=prev)
                check('④c 保存成功 toast「物理仓绑定已更新」', '绑定已更新' in tt, '实际 %r' % tt)
                time.sleep(1.2)

                v2, e2 = read_bindings(atok, ctoken, uvk)
                d = [x for x in (v2 or []) if x.get('isDefault')]
                check('⑤ 持久化：API 回读该变体恰好 1 条绑定且 isDefault=true（变体 %s）' % uvk,
                      (not e2) and len(v2 or []) == 1 and len(d) == 1,
                      '实际 %s / %s' % (json.dumps(v2, ensure_ascii=False), e2))
                check('⑤b 绑定仓 = 弹层首个物理仓 %s' % phys[0]['id'],
                      bool(v2) and str(v2[0].get('locationId')) == str(phys[0]['id']),
                      '实际 %s' % json.dumps(v2, ensure_ascii=False))

                # 保存成功后弹层自动关闭（bindRow 置空），无需再点取消
                pg.locator('.sheet').wait_for(state='hidden', timeout=15000)
                time.sleep(0.8)
                open_bind_sheet(pg)
                _, n_checked2, has_def2, _ = bind_state(pg)
                check('⑤c 重开弹层勾选态仍在（落库生效，非仅前端内存态）',
                      n_checked2 >= 1 and has_def2, '实际勾选 %d / 默认仓 %s' % (n_checked2, has_def2))
                shot(pg, '%ssheet-reopen' % TAG, full=False)

        auth = [e for e in errs if 'authoriz' in e.lower()]
        check('⑧ 页面无授权报错', not auth, '%d 条 errs' % len(errs))
        for e in errs[:5]:
            print('     ↳ %s' % e[:180])
        b.close()

    # ---- ⑥ 自清理（供 baseline 复跑；before 态不做任何写入）----
    if STATE == 'after':
        _, werr = write_bindings(atok, ctoken, uvk, [])
        if werr:
            check('⑥ 收尾解绑', False, werr)
        else:
            v3, e3 = read_bindings(atok, ctoken, uvk)
            check('⑥ 收尾解绑后回读为空（baseline 可复跑）', (not e3) and v3 == [],
                  '实际 %r / %s' % (v3, e3))

    if FAILS:
        print('\n== 结果（%s 态）：%d 项失败 ==\n失败项：%s' % (STATE, len(FAILS), '、'.join(FAILS)))
        raise SystemExit(1)
    print('\n== 结果（%s 态）：全部通过 ==' % STATE)
    raise SystemExit(0)


if __name__ == '__main__':
    main()

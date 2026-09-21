# -*- coding: utf-8 -*-
# 库存 v2 截图：手机 390x844 dpr=2 为主（概览/低库存/搜索/排序/预警规则/单据中心/流水/批量生成采购单）+ 桌面 1440x900
# 账号：guoxinnanshan@163.com / you123123（t2 二月兰会员 租户管理员「田经理」）
# 顺序铁律：必须先完成「后端部署 + 前端部署」再跑本脚本，否则截到旧版本。
#
# 本脚本含两处**真实写操作**（用于让「预警规则 / 单据中心 / 流水页」有真实数据）：
#   1) 预警规则页把首个 SKU（stockAsc 最低库存）安全库存设为 12 → 该行进入「低库存」分桶
#   2) 库存页低库存分桶勾选该行 → 生成采购入库单（入库目标 = 本店兜底仓：默认物理仓 → 虚拟仓）
# t2 为纯虚拟库存模式（physicalStockEnabled=false，无物理仓），入库落到「t2 虚拟仓」。
from playwright.sync_api import sync_playwright
import time, shutil, os

BASE = 'https://e.joho.cn/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/src/static/manual/shots/'
MANUAL = 'd:/zhao/vshop/web-admin/docs/webadmin-bugfix-manual/assets/'
os.makedirs(SHOT, exist_ok=True)


def login(ctx, channel='t2'):
    pg = ctx.new_page()
    pg.goto(BASE, wait_until='networkidle', timeout=45000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=45000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('guoxinnanshan@163.com')
    pg.locator('input').nth(1).fill('you123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    tok = pg.evaluate("""(ch) => {
      const t = localStorage.getItem('wa_auth_token');
      return fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query{ myTenantAccess{ channels{ id code token } } }'})
      }).then(r=>r.json()).then(d=>{
        const c = ((d.data||{}).myTenantAccess||{}).channels || [];
        const hit = c.find(x=>x.code===ch);
        if (!hit) return 'NOCHANNEL';
        localStorage.setItem('wa_channel_token', hit.token);
        localStorage.setItem('wa_channel_code', ch);
        return 'OK:' + hit.token.slice(0, 6);
      }).catch(e=>'ERR:'+e.message);
    }""", channel)
    print('  channel inject =', tok)
    return pg


_NAV = [0]


def go(pg, path):
    # 同 hash 的二次 goto 属 same-document 导航：uni-app 会**复用组件实例**（onLoad 不重跑），
    # 上一次的 tab/搜索/排序状态会残留（实测：切过「低库存」再回来仍是低库存，可能 0 行 → 定位超时）。
    # 故：先带 cache-buster 查询串 goto，再 reload 强制整文档重载，得到干净初始态。
    _NAV[0] += 1
    sep = '&' if '?' in path else '?'
    url = BASE + '#/pages/inventory/' + path + sep + '_r=' + str(_NAV[0])
    pg.goto(url, wait_until='networkidle', timeout=45000)
    pg.reload(wait_until='networkidle', timeout=45000)
    time.sleep(5)


def shot(pg, name):
    pg.screenshot(path=SHOT + name)
    print('  shot:', name)


def toast(pg):
    """读屏上 toast 文案（uni-app H5 渲染为 uni-toast），读不到返回 ''"""
    try:
        t = pg.locator('uni-toast').first.inner_text().strip()
        return t.replace('\n', ' ')[:80]
    except Exception:
        return ''


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ===== 手机 390x844 dpr=2 =====
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                      is_mobile=True, has_touch=True)
    pg = login(m)

    # 1 预警规则页：把首个 SKU（stockAsc 最低库存）安全库存设为「现存 + 2」（真实写操作）→ 该行进入「低库存」
    go(pg, 'alert-rules/index')
    rows = pg.locator('.rrow')
    print('  rrows =', rows.count())
    seeded_sku = ''
    if rows.count():
        sub = rows.first.locator('.rsub').first.inner_text()  # "SKU · [仓] · 现存"
        seeded_sku = sub.split('·')[0].strip()
        segs = [s.strip() for s in sub.split('·')]
        on_hand = int(segs[-1]) if segs[-1].isdigit() else 0
        # 目标安全库存 = 现存 + 2：保证该行进入「低库存」分桶，供后续批量补货演示
        rows.first.locator('input').first.fill(str(on_hand + 2))
        time.sleep(1)
        print('  seed %s: onHand=%d 安全库存→%d  savebar=%s'
              % (seeded_sku, on_hand, on_hand + 2, pg.locator('.savebar .count').first.inner_text()))
        pg.locator('.savebar .sbtn').first.tap()
        time.sleep(1.2)
        print('  toast(save rule) =', toast(pg))
        time.sleep(4)
    print('  seeded sku =', seeded_sku)
    shot(pg, 'inv2_05_alert_rules.png')

    # 2 库存页默认态（全部仓聚合）
    go(pg, 'stock/index')
    print('  body =', pg.inner_text('body')[:200].replace('\n', '|'))
    shot(pg, 'inv2_01_default.png')

    # 3 「低库存」tab（等价于点概览「低库存」卡）
    pg.locator('.fbar .tabs .tab.low').first.tap()
    time.sleep(3.5)
    print('  low rows =', pg.locator('.list .card').count())
    shot(pg, 'inv2_02_low.png')

    # 4 关键词搜索：回填首张卡片真实 SKU（证明是服务端命中）
    sku = ''
    if pg.locator('.list .card .skuline').count():
        sku = pg.eval_on_selector('.list .card .skuline', 'el => el.innerText.split("·")[0].trim()')
    if sku:
        pg.locator('.fbar .search input').first.fill(sku)
        time.sleep(3.5)
    print('  search sku =', sku)
    shot(pg, 'inv2_03_search.png')

    # 5 排序切换（第 3 个 chip = 缺口从大到小）
    if pg.locator('.fbar .search .clr').count():
        pg.locator('.fbar .search .clr').first.tap()
        time.sleep(3)
    # 回到「全部」分桶再排序：否则低库存分桶只有 1 行，截不出排序效果
    pg.locator('.fbar .tabs .tab').first.tap()
    time.sleep(3)
    pg.locator('.fbar .sorts .chip').nth(2).tap()
    time.sleep(3.5)
    shot(pg, 'inv2_04_sort.png')

    # 6 批量：勾选低库存行 → 生成采购入库单（真实写操作，给单据中心/流水页造数据）
    pg.locator('.fbar .tabs .tab.low').first.tap()
    time.sleep(3)
    checks = pg.locator('.list .card .check')
    n = min(2, checks.count())
    for i in range(n):
        checks.nth(i).tap()
        time.sleep(0.6)
    print('  checked rows =', n)
    if n:
        # 先截「批量条」（已选 N + 设安全库存 + 生成采购单）：生成后该行因补货已离开低库存分桶，
        # 列表会变空，截不到批量条本身。
        shot(pg, 'inv2_09_bulk_checked.png')
        pg.get_by_text('生成采购单', exact=False).first.tap()
        time.sleep(1.0)
        print('  toast(bulk gen) =', toast(pg))
        time.sleep(5)

    # 7 行内「补货」→ 采购入库页（预填 variantId/qty/locationId）→ 录成本价提交
    #   目的：让「库存货值」KPI 有真实成本数据（本页货值 = 最近采购成本 × 现存）
    go(pg, 'stock/index')
    first = pg.locator('.list .card').first
    first.locator('.acts .act').last.tap()  # 卡片操作行第 3 个 = 补货
    time.sleep(4)
    print('  purchase page url =', pg.url.split('#')[-1])
    # 注意：uni-app H5 的 <input class="ipt"> 会渲染成 <uni-input class="ipt"><input class="uni-input-input">，
    # 故必须定位到内层真实 input，`.ipt` 本身不是 input/textarea/select（input_value 会报错）。
    ipts = pg.locator('.card .field input')
    print('  prefilled variant =', ipts.nth(0).input_value(),
          ' qty =', ipts.nth(1).input_value())
    shot(pg, 'inv2_11_replenish_prefill.png')
    ipts.nth(2).fill('10000')  # 成本价（分）= ¥100
    time.sleep(0.6)
    pg.locator('.savebar .save').first.tap()  # 按钮文案 = stockDocPurchase.submit（「入库」）
    time.sleep(1.2)
    print('  toast(replenish) =', toast(pg))
    time.sleep(4)

    # 8 库存页默认态（货值已非 0）
    go(pg, 'stock/index')
    print('  body2 =', pg.inner_text('body')[:120].replace('\n', '|'))
    shot(pg, 'inv2_12_default_valued.png')

    # 9 单据中心
    go(pg, 'stock-doc/index')
    shot(pg, 'inv2_06_doc_center.png')

    # 10 流水页筛选（方向 = 出库 + 日期 = 近 7 天）
    go(pg, 'movements/index')
    pg.locator('.chips').nth(0).locator('.chip').nth(2).tap()
    time.sleep(2.5)
    pg.locator('.chips').nth(2).locator('.chip').nth(2).tap()
    time.sleep(3.5)
    shot(pg, 'inv2_07_movements.png')

    # 11 流水页默认（含刚生成的采购入库）——证明写操作落库
    go(pg, 'movements/index')
    shot(pg, 'inv2_10_movements_in.png')

    # ===== 桌面 1440x900 =====
    d = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    dp = login(d)
    go(dp, 'stock/index')
    shot(dp, 'inv2_08_desktop.png')

    b.close()

# 同步到操作手册 assets
for n in sorted(os.listdir(SHOT)):
    if n.startswith('inv2_'):
        shutil.copy(SHOT + n, MANUAL + n)
        print('copied →', n)
print('done')
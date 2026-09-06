# 生产验证：超管登录后，自提点「新增」编辑页应显示「全局可用」开关（isPublic）
import time
from playwright.sync_api import sync_playwright

PROD = 'https://e.joho.cn/guanli'
EDIT = PROD + '/#/pages/pickup/edit'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'
VW = {'width': 390, 'height': 844, 'device_scale_factor': 2}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport=VW, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)[:300]))
    pg.on('console', lambda m: errs.append(f'CONSOLE[{m.type}]: ' + (m.text[:200])) if m.type == 'error' else None)

    pg.goto(PROD, wait_until='networkidle', timeout=45000); time.sleep(2)
    print('LOGIN_URL', pg.url)
    ins = pg.locator('input'); print('LOGIN_INPUTS', ins.count())
    ins.nth(0).fill('superadmin'); ins.nth(1).fill('z123123')
    pg.locator('.btn').first.click(); time.sleep(3)
    print('AFTER_LOGIN_URL', pg.url)
    print('AFTER_LOGIN_BODY[:300]', pg.inner_text('body')[:300].replace('\n', ' | '))
    try:
        pg.locator('.item').first.click(timeout=6000); time.sleep(3)
    except Exception as e:
        print('click1 err', str(e)[:120]); time.sleep(1)
    print('AFTER_CHANNEL_URL', pg.url)
    print('AFTER_CHANNEL_BODY[:200]', pg.inner_text('body')[:200].replace('\n', ' | '))
    # 若仍停在选店页，尝试以文本定位第一个店铺名 + tap
    if '/channel-select' in pg.url and '官方自营01' in pg.inner_text('body'):
        try:
            pg.locator('.item', has_text='官方自营01').first.click(timeout=6000); time.sleep(3)
            print('CLICK2_URL', pg.url)
        except Exception as e:
            print('click2 err', str(e)[:120])
    # 兜底：dispatch tap
    if '/channel-select' in pg.url:
        try:
            pg.locator('.item').first.dispatch_event('tap'); time.sleep(3)
            print('TAP_URL', pg.url)
        except Exception as e:
            print('tap err', str(e)[:120])

    # 从配送档案页进入自提点管理（贴近真实路径）
    PROFILE = PROD + '/#/pages/shipping/profile/index'
    pg.goto(PROFILE, wait_until='networkidle', timeout=45000); time.sleep(2.5)
    print('PROFILE_URL', pg.url)
    print('PROFILE_BODY[:250]', pg.inner_text('body')[:250].replace('\n', ' | '))
    # 若有「新增自提点」入口直接进；否则需经档案。尝试进入自提点列表页
    # 配送档案列表通常有自提点管理入口，先检测是否存在「新增自提点」直达
    has_new_btn = '新增自提点' in pg.inner_text('body')
    print('PROFILE_HAS_NEWBTN:', has_new_btn)
    if has_new_btn:
        try:
            pg.locator('text=新增自提点').first.click(timeout=6000); time.sleep(2.5)
            print('VIA_PROFILE_EDIT_URL', pg.url)
        except Exception as e:
            print('via profile err', str(e)[:120])
    # 若前述未进入编辑页：改为进入自提点列表管理页
    if 'pickup/edit' not in pg.url:
        LIST = PROD + '/#/pages/pickup/index'
        pg.goto(LIST, wait_until='networkidle', timeout=45000); time.sleep(2.5)
        print('LIST_URL', pg.url)
        print('LIST_BODY[:250]', pg.inner_text('body')[:250].replace('\n', ' | '))
        # 列表页应有「新增」钮进入 edit 页
        for label in ['新增', '添加', '新建', '＋ 新增']:
            try:
                if label in pg.inner_text('body'):
                    pg.locator(f'text={label}').last.click(timeout=6000); time.sleep(2)
                    print('TAP_ADD', label, '->', pg.url)
                    break
            except Exception as e:
                continue
    time.sleep(1.5)
    body = pg.inner_text('body')
    print('EDIT_URL', pg.url)
    print('EDIT_BODY[:500]', body[:500].replace('\n', ' | '))
    print('EDIT_LOADED:', '名称' in body, '类型' in body, '保存' in body, '| 全局可用:', '全局可用' in body)
    # 关闭可能残留的退出弹窗
    if '取消' in body and '退出' in body and '离开后台' in body:
        try:
            pg.locator('text=取消').first.click(timeout=5000); time.sleep(1.5)
            print('CANCELLED_EXIT_DIALOG URL', pg.url)
            body = pg.inner_text('body')
        except Exception as e:
            print('cancel err', str(e)[:120])
    print('HAS_GLOBAL_BTN_FINAL:', '全局可用' in body)
    pg.screenshot(path=SHOT + 'superadmin_global_btn_full.png', full_page=True)
    # 找到全局可用开关
    has_global = '全局可用' in body
    print('HAS_GLOBAL_BTN:', has_global)
    if has_global:
        # 点击开关再刷新，验证保留（回填）
        try:
            pg.locator('text=全局可用').first.click(); time.sleep(0.8)
        except Exception as e:
            print('tap switch err', str(e)[:120])
        pg.screenshot(path=SHOT + 'superadmin_global_btn_toggled.png', full_page=True)
        print('URL', pg.url)
    print('===== ERR/LOG =====')
    for e in errs[-40:]:
        print(e)
    b.close()
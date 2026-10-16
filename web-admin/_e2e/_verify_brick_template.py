# -*- coding: utf-8 -*-
"""五级积木模板体系 e2e 回归 + 手机截图（Playwright 同步 API，390x844 dpr=2 硬规范）
四场景：
 1. 基线：C 端 t2 店铺首页（无 sections、displayTemplate='standard' 非白名单）→ DefaultHome 骨架
 2. layout 切换：web-admin 模板编辑页(platform/templates) chips 写 pages.home.layout='fresh' → FreshHome
    （实测 t2 未绑定 vshop 模板：shop-api shopTemplate(vshop)=null，故先经 admin-api 创建临时
      vshop 模板并以 channel.cf.templateId 绑定 t2，chips 编辑仍走 UI）
 3. 新楼层：web-admin 首页装修页(decorate/home)添加 video/coupon/pointsGoods 楼层 → DynamicHome 三楼层渲染
 4. 恢复：写回原 shopContent/templateId（走 admin-api 直调；装修页 UI 在楼层清空时拒绝保存、
    模板表单保存会以 chips 状态重建 pages JSON 无法还原原文，故退化 API——见汇报），并删除临时模板
本地双 dev（VITE_API_URL=https://e.joho.cn）：web-admin 约 5280、C 端端口见输出。
登录 superadmin/z123123；t2 渠道经 localStorage 注入（superadmin 店铺列表不含 t2）。
截图输出：web-admin/src/static/manual/shots/brick_01..04_390.png
"""
import json
import re
import sys
import time
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

ADMIN_API = 'https://e.joho.cn/admin-api'
WA_BASE = 'http://localhost:5280/guanli/'
C_END_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5281
C_BASE = f'http://localhost:{C_END_PORT}/?tenant=t2#/pages/home/index'
SHOT_DIR = 'd:/zhao/vshop/web-admin/src/static/manual/shots'
VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4'

LOGIN_MUT = """
mutation($u:String!,$p:String!){
  login(username:$u, password:$p){
    __typename
    ... on CurrentUser { id identifier }
    ... on InvalidCredentialsError { errorCode message }
  }
}
"""


def _gql(query, variables=None, headers=None):
    req = Request(ADMIN_API, data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
                  headers={'Content-Type': 'application/json', **(headers or {})}, method='POST')
    with urlopen(req, timeout=40) as r:
        return r, json.loads(r.read().decode())


T2_HEADERS = {'vendure-token': '66ruvnhh34svhckaa2i'}
AUTH_TOKEN = ''


def _gql_data(query, variables=None, headers=None):
    # web-admin 会话恒带 vendure-token（店铺上下文）+ Bearer 会话令牌
    h = {'Authorization': 'Bearer ' + AUTH_TOKEN, **T2_HEADERS, **(headers or {})}
    _, data = _gql(query, variables, h)
    if data.get('errors'):
        raise RuntimeError('GQL error: ' + json.dumps(data['errors'], ensure_ascii=False)[:500])
    return data.get('data') or {}


def api_login():
    resp, data = _gql(LOGIN_MUT, {'u': 'superadmin', 'p': 'z123123'})
    token = resp.headers.get('vendure-auth-token') or ''
    body = (data.get('data') or {}).get('login') or {}
    if not token or body.get('__typename') != 'CurrentUser':
        raise RuntimeError(f'admin-api 登录失败: {body}')
    global AUTH_TOKEN
    AUTH_TOKEN = token
    return token


BRICK_TPL_NAME = 'brick-e2e临时模板'
# t2 运行前基线（本 e2e 首跑前实测：displayTemplate=standard / templateId=1 / shopContent=null）
# 失败重跑时 Phase A 先重置到基线再开工，保证幂等；场景 4 恢复也写回该基线
BASELINE_TEMPLATE_ID = '1'
BASELINE_SHOP_CONTENT = None


def create_brick_template():
    """t2 未绑定 vshop 模板：创建临时 vshop 模板（不启用主题，仅承载 pages.home.layout）"""
    d = _gql_data('mutation($i:CreateShopTemplateInput!){ createShopTemplate(input:$i){ id name app } }',
                  {'i': {'name': BRICK_TPL_NAME, 'app': 'vshop', 'theme': {}, 'pages': {}, 'enabled': True}})
    t = d['createShopTemplate']
    print(f'临时模板已创建: id={t["id"]} name={t["name"]}')
    return t['id']


def bind_template(tpl_id):
    """channel.cf.templateId 绑定 t2 → 临时模板"""
    _gql_data('mutation($f:JSON!){ myUpdateChannelCustomFields(input:$f) }',
              {'f': {'templateId': str(tpl_id)}})
    print(f'临时模板 {tpl_id} 已绑定 t2')


def fetch_t2_channel():
    """t2 渠道上下文取 activeChannel：id + 原始装修字段（用于场景 4 恢复）"""
    d = _gql_data('query { activeChannel { id code customFields { shopContent displayTemplate templateId } } }')
    ch = d['activeChannel']
    return ch['id'], ch['customFields'].get('shopContent'), ch['customFields'].get('displayTemplate'), \
        ch['customFields'].get('templateId')


def restore_all(tpl_id):
    """场景 4：恢复渠道装修字段到运行前基线 + 删除临时模板"""
    reset_channel(BASELINE_TEMPLATE_ID, BASELINE_SHOP_CONTENT)
    _gql_data('mutation($id:ID!){ deleteShopTemplate(id:$id) }', {'id': tpl_id})
    print(f'已恢复 templateId={BASELINE_TEMPLATE_ID} shopContent={BASELINE_SHOP_CONTENT}，临时模板 {tpl_id} 已删除')


def reset_channel(orig_template_id, orig_shop_content):
    """恢复渠道装修字段原文（失败重跑的幂等基础）"""
    _gql_data('mutation($f:JSON!){ myUpdateChannelCustomFields(input:$f) }',
              {'f': {'shopContent': orig_shop_content, 'templateId': orig_template_id}})


def cleanup_leftover_templates():
    """删除历史失败运行遗留的同名临时模板"""
    tpls = _gql_data('query($a:String){ shopTemplates(app:$a){ id name } }',
                     {'a': 'vshop'}).get('shopTemplates') or []
    for t in tpls:
        if t['name'] == BRICK_TPL_NAME:
            _gql_data('mutation($id:ID!){ deleteShopTemplate(id:$id) }', {'id': t['id']})
            print(f'清理遗留临时模板: id={t["id"]}')


def c_home(pg):
    # 先跳空白页强制真实 reload：同 URL（含 hash）重复 goto 会被浏览器按同文档导航处理不刷新
    pg.goto('about:blank')
    pg.goto(C_BASE, wait_until='networkidle', timeout=60000)
    time.sleep(4)
    return pg


def c_home_until(pg, check, label, tries=6):
    """C 端首页轮询：shop-api 侧状态落定可能有秒级延迟，逐次刷新直到断言通过"""
    last = None
    for i in range(tries):
        c_home(pg)
        last = check(pg)
        if last:
            return
        print(f'{label} 第{i + 1}次未命中，3s 后重刷')
        time.sleep(3)
    raise AssertionError(label)


def shot(pg, name):
    path = f'{SHOT_DIR}/{name}'
    pg.screenshot(path=path)
    print('shot:', path)


with sync_playwright() as p:
    # ---- Phase A: admin-api 直调，重置到基线并准备临时模板 ----
    api_login()
    cleanup_leftover_templates()
    reset_channel(BASELINE_TEMPLATE_ID, BASELINE_SHOP_CONTENT)
    ch_id, orig_shop, display_tpl, orig_tpl_id = fetch_t2_channel()
    print(f't2 channel: id={ch_id} displayTemplate={display_tpl} '
          f'templateId={orig_tpl_id} shopContent={str(orig_shop)[:120]}')
    assert orig_tpl_id == BASELINE_TEMPLATE_ID and orig_shop == BASELINE_SHOP_CONTENT, \
        't2 基线与预期不符，人工确认后再跑'
    tpl_id = create_brick_template()
    bind_template(tpl_id)

    # ---- Phase B: web-admin UI 登录 + 注入 t2 ----
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()

    pg.goto(WA_BASE, wait_until='networkidle', timeout=60000)
    pg.evaluate('localStorage.clear()')
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.locator('input').nth(0).wait_for(state='visible', timeout=30000)
    pg.locator('input').nth(0).fill('superadmin')
    pg.locator('input').nth(1).fill('z123123')
    pg.locator('button, .btn').first.click()
    time.sleep(7)
    print('web-admin after login url =', pg.url)
    pg.evaluate("""() => {
      localStorage.setItem('wa_channel_code', 't2');
      localStorage.setItem('wa_channel_token', '66ruvnhh34svhckaa2i');
    }""")

    # ---- 场景 1：C 端基线（无楼层 → DefaultHome）----
    c_home_until(pg,
                 lambda g: g.locator('.default-home').count() > 0
                 and g.locator('.fresh-home').count() == 0 and g.locator('.dynamic-home').count() == 0
                 and '二月兰' in g.inner_text('body'),
                 '场景1失败：未渲染 DefaultHome 骨架（t2 基线）')
    print('场景1 PASS: DefaultHome 骨架（t2 基线）')
    shot(pg, 'brick_01_home_default_390.png')

    # ---- 场景 2：模板编辑页 chips 切首页版式为 fresh ----
    pg.goto(WA_BASE + '#/pages/platform/templates/index', wait_until='networkidle', timeout=60000)
    time.sleep(4)
    pg.locator('.chip', has_text='youshop 商城').first.click()
    time.sleep(3)
    item = pg.locator('.item', has_text=BRICK_TPL_NAME).first
    item.wait_for(state='visible', timeout=20000)
    item.click()
    time.sleep(2)
    pop = pg.locator('.pop')
    # 页面 chips 切到「首页」
    pop.locator('.chip', has_text=re.compile(r'^首页$')).first.click()
    time.sleep(1)
    # 首页版式 chips 选「清新模板」
    layout_field = pop.locator('.field', has_text='首页版式').first
    layout_field.locator('.chip', has_text='清新模板').click()
    time.sleep(1)
    pop.locator('.btn', has_text='保存').click()
    time.sleep(3)
    assert pg.locator('.pop').count() == 0 or '已保存' in pg.inner_text('body'), '场景2失败：模板保存未见成功反馈'
    print('场景2 web-admin 保存完成: pages.home.layout=fresh')
    c_home_until(pg,
                 lambda g: g.locator('.fresh-home').count() > 0 and '新鲜好物' in g.inner_text('body'),
                 '场景2失败：未渲染 FreshHome')
    print('场景2 PASS: FreshHome（绿色清新风格）')
    shot(pg, 'brick_02_home_fresh_390.png')

    # ---- 场景 3：装修页添加 video/coupon/pointsGoods 楼层 ----
    pg.goto(WA_BASE + '#/pages/decorate/home/index', wait_until='networkidle', timeout=60000)
    time.sleep(4)
    pg.locator('.mini', has_text='视频楼层').first.click()
    time.sleep(1)
    pg.locator('.mini', has_text='领券楼层').first.click()
    time.sleep(1)
    pg.locator('.mini', has_text='积分楼层').first.click()
    time.sleep(1)
    video_block = pg.locator('.block', has_text='视频楼层').first
    url_input = video_block.locator('.field', has_text='视频地址').locator('input')
    url_input.fill(VIDEO_URL)
    time.sleep(1)
    pg.locator('.save').click()
    time.sleep(3)
    body = pg.inner_text('body')
    print('装修保存反馈:', '已保存' if '已保存' in body else ('保存失败' if '失败' in body else 'toast 已消失'))
    if '保存失败' in body:
        raise AssertionError('场景3失败：装修保存报错')
    print('场景3 web-admin 保存完成: video/coupon/pointsGoods 三楼层')
    c_home_until(pg,
                 lambda g: g.locator('.dynamic-home').count() > 0
                 and g.locator('.sec-video').count() > 0
                 and g.locator('.sec-video video, .sec-video uni-video').count() > 0
                 and g.locator('.sec-coupon').count() > 0
                 and g.locator('.sec-points').count() > 0,
                 '场景3失败：DynamicHome 三楼层未齐')
    coupon_cards = pg.locator('.sec-coupon .coupon-card').count()
    points_cards = pg.locator('.sec-points .pg-card').count()
    print(f'场景3 PASS: DynamicHome 三楼层（券卡 {coupon_cards} 张 / 积分卡 {points_cards} 张）')
    shot(pg, 'brick_03_home_sections_390.png')

    # ---- 场景 4：恢复基线 + 删除临时模板（admin-api）----
    restore_all(tpl_id)
    c_home_until(pg,
                 lambda g: g.locator('.default-home').count() > 0
                 and g.locator('.fresh-home').count() == 0 and g.locator('.dynamic-home').count() == 0,
                 '场景4失败：未恢复 DefaultHome')
    print('场景4 PASS: 恢复 DefaultHome（基线已写回）')
    shot(pg, 'brick_04_home_restore_390.png')

    b.close()
print('ALL PASS')

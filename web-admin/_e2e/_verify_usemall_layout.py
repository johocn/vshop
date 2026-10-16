# -*- coding: utf-8 -*-
"""usemall 版式插件 e2e 回归 + 手机截图（Playwright 同步 API，390x844 dpr=2 硬规范）

流程（沿用 _verify_brick_template.py 的登录/渠道/轮询惯例）：
 Phase A（admin-api 直调）：清理同名遗留模板 → 创建「usemall 体验模板」
   （theme 珊瑚红 tokens + pages.home.layout=usemall + banner edgeScale/nav/limitGoods/flash/hotGoods）
   → 绑定 t2 渠道 cf.templateId
 Phase B（Playwright）：打开 C 端 H5 dev（?tenant=t2），断言：
   1. usemall 签名搜索条 .usemall-home__search 可见（文案「搜索商品」）
   2. banner 露边缩放 .banner-sec--edge 存在（两张图轮播）
   3. nav grid4x2 四项渲染
   4. limitGoods 横滑卡片 ≤ limit(6)
   5. flash 秒杀楼层渲染
   6. hotGoods 首屏卡片渲染 → 滚动到底触发加载更多（卡片增加或出现「没有更多了」）
 截图 5 张 → d:/zhao/vshop/e2e-shots/usemall_0*.png

 与 brick e2e 的差异：t2 运行前基线为 templateId=1（brick 场景4已恢复基线），本脚本运行后
 **不恢复基线** —— usemall 体验模板作为演示预设保留绑定（生产冒烟与手册截图均依赖 t2 展示 usemall）。
 本地启动：$env:VITE_API_URL='https://e.joho.cn'; npm run dev:h5  （端口见 vite.config.ts，默认 5180）
 用法：python _verify_usemall_layout.py [C端端口]
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

from playwright.sync_api import sync_playwright

ADMIN_API = 'https://e.joho.cn/admin-api'
SHOP_API = 'https://e.joho.cn/shop-api'
C_END_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
C_BASE = f'http://localhost:{C_END_PORT}/?tenant=t2#/pages/home/index'
SHOT_DIR = 'd:/zhao/vshop/e2e-shots'
# banner 图复用项目内现成 vendure 商品素材（e.joho.cn 自有域名，勿新造域名）
BANNER_1 = 'https://e.joho.cn/assets/preview/b0/0__preview.png'
BANNER_2 = 'https://e.joho.cn/assets/preview/57/media-1789738816927__preview.jpeg'

USEMALL_TPL_NAME = 'usemall 体验模板'
FLASH_ACT_NAME = 'usemall 体验秒杀'
USEMALL_THEME = {'primaryColor': '#ff6a6c', 'accentColor': '#fff1ed', 'radius': 12}
USEMALL_PAGES = {
    'home': {
        'layout': 'usemall',
        'sections': [
            {'type': 'banner', 'style': 'edgeScale',
             'images': [{'image': BANNER_1}, {'image': BANNER_2}]},
            {'type': 'nav', 'shape': 'round', 'layout': 'grid4x2', 'items': [
                {'label': '新品首发', 'link': '/pages/category/index'},
                {'label': '限时秒杀', 'link': '/pkg-promotion/pages/flash-sale'},
                {'label': '领券中心', 'link': '/pkg-promotion/pages/coupons'},
                {'label': '积分商城', 'link': '/pkg-user/pages/points-mall'},
            ]},
            {'type': 'limitGoods', 'collectionSlug': '', 'limit': 6},
            {'type': 'flash', 'source': 'flashSale', 'layout': 'row', 'limit': 4},
            {'type': 'hotGoods', 'collectionSlug': '', 'pageSize': 10},
        ],
    },
}

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


def cleanup_leftover_templates():
    """删除历史运行遗留的同名模板（幂等）"""
    tpls = _gql_data('query($a:String){ shopTemplates(app:$a){ id name } }',
                     {'a': 'vshop'}).get('shopTemplates') or []
    for t in tpls:
        if t['name'] == USEMALL_TPL_NAME:
            _gql_data('mutation($id:ID!){ deleteShopTemplate(id:$id) }', {'id': t['id']})
            print(f'清理遗留模板: id={t["id"]}')


def create_usemall_template():
    d = _gql_data('mutation($i:CreateShopTemplateInput!){ createShopTemplate(input:$i){ id name app } }',
                  {'i': {'name': USEMALL_TPL_NAME, 'app': 'vshop', 'theme': USEMALL_THEME,
                         'pages': USEMALL_PAGES, 'enabled': True}})
    t = d['createShopTemplate']
    print(f'usemall 模板已创建: id={t["id"]} name={t["name"]}')
    return t['id']


def bind_template(tpl_id):
    _gql_data('mutation($f:JSON!){ myUpdateChannelCustomFields(input:$f) }',
              {'f': {'templateId': str(tpl_id)}})
    print(f'usemall 模板 {tpl_id} 已绑定 t2（保留绑定，供生产冒烟/手册演示）')


def _shop_gql(query, variables=None):
    req = Request(SHOP_API, data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
                  headers={'Content-Type': 'application/json', **T2_HEADERS}, method='POST')
    with urlopen(req, timeout=40) as r:
        d = json.loads(r.read().decode())
    if d.get('errors'):
        raise RuntimeError('shop-api error: ' + json.dumps(d['errors'], ensure_ascii=False)[:300])
    return d.get('data') or {}


def ensure_flash_activity():
    """幂等准备一条进行中的秒杀活动（flash 楼层为数据驱动，无活动时整层不渲染）；
    保留不删，供生产冒烟在 t2 渠道看到秒杀楼层"""
    acts = _gql_data('query { flashSaleActivities(options:{ take: 50 }) { items { id name } } }'
                     ).get('flashSaleActivities') or {}
    for a in (acts.get('items') or []):
        if a['name'] == FLASH_ACT_NAME:
            print(f'flash 活动已存在: id={a["id"]}')
            return
    items = _shop_gql('query { search(input:{ take: 1, groupByProduct: true }) { items { '
                      'productId productVariantId productName } } }').get('search', {}).get('items') or []
    if not items:
        raise RuntimeError('shop-api 无在售商品，无法创建秒杀活动')
    p = items[0]
    now = datetime.now(timezone.utc)
    inp = {'name': FLASH_ACT_NAME,
           'startAt': (now - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
           'endAt': (now + timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
           'flashPrice': 100, 'totalStock': 50, 'limitPerUser': 2,
           'productId': p['productId'], 'variantId': p['productVariantId']}
    d = _gql_data('mutation($i:CreateFlashSaleActivityInput!){ createFlashSaleActivity(input:$i){ id name } }', {'i': inp})
    print(f'flash 活动已创建: id={d["createFlashSaleActivity"]["id"]} 商品={p["productName"]}')


def c_home(pg):
    pg.goto('about:blank')
    pg.goto(C_BASE, wait_until='networkidle', timeout=60000)
    time.sleep(4)
    return pg


def c_home_until(pg, check, label, tries=6):
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


def scroll_bottom(pg, times=4):
    for _ in range(times):
        pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        time.sleep(1.2)


with sync_playwright() as p:
    # ---- Phase A: admin-api 直调，幂等准备 usemall 模板/秒杀活动并绑定 t2 ----
    api_login()
    cleanup_leftover_templates()
    tpl_id = create_usemall_template()
    bind_template(tpl_id)
    ensure_flash_activity()

    # ---- Phase B: C 端 H5 手机视口断言 ----
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                        is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()

    # 场景1：usemall 签名——搜索条可见 + 骨架落位
    c_home_until(pg,
                 lambda g: g.locator('.usemall-home__search').count() > 0
                 and g.locator('.fresh-home').count() == 0 and g.locator('.dynamic-home').count() == 0,
                 '场景1失败：未渲染 usemall 骨架（搜索条缺失）')
    assert '搜索商品' in pg.inner_text('.usemall-home__search'), '场景1失败：搜索条文案缺失'
    print('场景1 PASS: usemall 骨架 + 搜索条（搜索商品）')
    shot(pg, 'usemall_01_home_first_390.png')

    # 场景2：banner 露边缩放轮播（两张图）
    c_home_until(pg,
                 lambda g: g.locator('.banner-sec--edge').count() > 0
                 and g.locator('.banner-sec--edge .img').count() == 2,
                 '场景2失败：banner 露边轮播未渲染（banner-sec--edge）')
    pg.locator('.banner-sec--edge').scroll_into_view_if_needed()
    time.sleep(2)
    edge_on = pg.locator('.banner-sec--edge .edge-item--on').count()
    assert edge_on == 1, f'场景2失败：露边当前项高亮数异常 ({edge_on})'
    print('场景2 PASS: banner 露边缩放轮播（edgeScale，当前项 scale=1）')
    pg.locator('.banner-sec--edge').screenshot(path=f'{SHOT_DIR}/usemall_02_banner_edge_390.png')
    print('shot:', f'{SHOT_DIR}/usemall_02_banner_edge_390.png')

    # 场景3：nav grid4x2 四项
    nav_cnt = pg.locator('.nav-sec .nav-item').count()
    assert nav_cnt == 4, f'场景3失败：nav 应 4 项，实际 {nav_cnt}'
    print('场景3 PASS: nav 四宫格渲染')

    # 场景4：limitGoods 限时精选横滑（≤6 张卡）
    c_home_until(pg,
                 lambda g: g.locator('.lsec__card').count() > 0,
                 '场景4失败：limitGoods 楼层未取到商品')
    lsec_cnt = pg.locator('.lsec__card').count()
    assert lsec_cnt <= 6, f'场景4失败：limitGoods 卡片 {lsec_cnt} 超过 limit=6'
    print(f'场景4 PASS: limitGoods 限时精选 {lsec_cnt} 张卡（≤6）')
    pg.locator('.lsec').scroll_into_view_if_needed()
    time.sleep(2)
    shot(pg, 'usemall_03_limit_390.png')

    # 场景5：flash 秒杀楼层（flashSale row）
    c_home_until(pg,
                 lambda g: g.locator('.flash-sec').count() > 0,
                 '场景5失败：flash 秒杀楼层未渲染')
    flash_cnt = pg.locator('.flash-sec .flash-card').count()
    assert 0 < flash_cnt <= 4, f'场景5失败：flash 卡片数异常 ({flash_cnt})'
    print(f'场景5 PASS: flash 秒杀楼层 {flash_cnt} 条活动')
    pg.locator('.flash-sec').scroll_into_view_if_needed()
    time.sleep(2)
    shot(pg, 'usemall_04_flash_390.png')

    # 场景6：hotGoods 瀑布流首屏 + 滚动到底加载更多
    c_home_until(pg,
                 lambda g: g.locator('.hsec__card').count() > 0,
                 '场景6失败：hotGoods 楼层未取到商品')
    hot_first = pg.locator('.hsec__card').count()
    print(f'场景6 hotGoods 首屏卡片数: {hot_first}')
    scroll_bottom(pg)
    time.sleep(3)
    hot_after = pg.locator('.hsec__card').count()
    no_more = pg.locator('.hsec__loadmore-text', has_text=re.compile('没有更多了|No more')).count() > 0
    loading_txt = pg.locator('.hsec__loadmore-text', has_text='加载中').count() > 0
    if loading_txt:
        time.sleep(4)
        hot_after = pg.locator('.hsec__card').count()
        no_more = pg.locator('.hsec__loadmore-text', has_text=re.compile('没有更多了|No more')).count() > 0
    assert hot_after > hot_first or no_more, \
        f'场景6失败：滚动加载未见效（{hot_first} → {hot_after}，无「没有更多了」）'
    print(f'场景6 PASS: hotGoods 加载更多（{hot_first} → {hot_after} 张，noMore={no_more}）')
    pg.locator('.hsec').scroll_into_view_if_needed()
    time.sleep(2)
    shot(pg, 'usemall_05_hot_390.png')

    b.close()
print('ALL PASS')

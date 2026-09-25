# -*- coding: utf-8 -*-
"""渲染级截图验证（规格 §11 补充）：手册截图必须「浏览器真渲染 + 图片真解码」。

为什么要单独一层：`_verify_manual_docs.py` 只判定「文件存在 + 页面含 op-39」，属静态判定——
手册引用的图 404 / 0 字节 / 路径写错 / 尺寸错版都发现不了。本脚本补渲染层。

L1 离线（file://，不依赖网络与登录）
  修复手册 webadmin-bugfix-manual.html#stocktake-ops
  用户手册源 src/static/manual/index.html → openChapter('op-39')
L2 线上（部署后真实链路）
  线上手册 openChapter('op-39') + 每张 PNG 响应码 200 + 与本地 shots/ 逐张字节一致
  取证截图（390x844 @dpr2 = 780x1688）归档 docs/webadmin-bugfix-manual/assets/

驱动要点：手册是单文件 JS 书、无 hash 路由，章节切换靠页内全局函数 `openChapter(id)`
（`renderReader()` 把章节 HTML 注入 `#readerContent`）。`#op-39` 或点导航项都定位不到。

环境变量：WA_MANUAL_URL（默认线上手册）、WA_MANUAL_RENDER_CH（默认 op-39）
退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
"""
import os
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs' / 'webadmin-bugfix-manual'
FIX = DOCS / 'webadmin-bugfix-manual.html'
ASSETS = DOCS / 'assets'
USER_MANUAL = ROOT / 'src' / 'static' / 'manual' / 'index.html'
SHOTS_DIR = USER_MANUAL.parent / 'shots'
ONLINE = os.environ.get('WA_MANUAL_URL', 'https://e.joho.cn/guanli/static/manual/index.html')
CH = os.environ.get('WA_MANUAL_RENDER_CH', 'op-39')
EXPECT_N = 9                    # op-39 / 16.9.8 共 9 张手机截图
EXPECT_W, EXPECT_H = 780, 1688  # 390x844 @dpr2

FAILS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def uri(p):
    return 'file:///' + str(p).replace('\\', '/')


IMG_JS = """(sel)=>Array.from(document.querySelectorAll(sel)).map(i=>({
  src:i.getAttribute('src'), w:i.naturalWidth, h:i.naturalHeight, c:i.complete }))"""
TITLE_JS = """(id)=>{var c=CHAPTERS.filter(function(c){return c.id===id;})[0];return c?c.title:''}"""
RENDER_JS = """(id)=>{openChapter(id);
  return (document.querySelector('#readerContent h2')||{}).textContent||''}"""


def new_page(browser, bag, codes):
    """手机视口 + 异常与响应码收集（bag / codes 由调用方按层清空，避免互相污染）。"""
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: bag.append('PAGEERR:' + str(e)[:200]))
    pg.on('console', lambda m: bag.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
    pg.on('response', lambda r: codes.__setitem__(r.url, r.status) if 'stocktake-ops-' in r.url else None)
    return ctx, pg


def assert_imgs(tag, imgs):
    check('%s 图数 = %d' % (tag, EXPECT_N), len(imgs) == EXPECT_N, 'got=%d' % len(imgs))
    undecoded = [i['src'] for i in imgs if not i['c'] or i['w'] <= 0 or i['h'] <= 0]
    check('%s 每图真实解码（complete 且 naturalWidth>0）' % tag, not undecoded, str(undecoded[:3]))
    wrong = ['%s %sx%s' % (i['src'], i['w'], i['h']) for i in imgs
             if i['w'] != EXPECT_W or i['h'] != EXPECT_H]
    check('%s 每图尺寸 = %dx%d' % (tag, EXPECT_W, EXPECT_H), not wrong, str(wrong[:3]))


def shoot(pg, name):
    ASSETS.mkdir(parents=True, exist_ok=True)
    f = ASSETS / name
    pg.screenshot(path=str(f))
    check('截图归档 %s' % name, f.exists() and f.stat().st_size > 5000,
          '%d B' % (f.stat().st_size if f.exists() else 0))


def main():
    if not FIX.exists() or not USER_MANUAL.exists():
        print('ENV-FAIL: 手册文件缺失 %s / %s' % (FIX, USER_MANUAL))
        raise SystemExit(2)
    if not ONLINE.startswith(('http://', 'https://')):
        print('ENV-FAIL: WA_MANUAL_URL 非 http(s) → %s' % ONLINE)
        raise SystemExit(2)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        bag, codes = [], {}

        # ---------- L1a 修复手册：区块可达 + 9 图真解码 ----------
        ctx, pg = new_page(b, bag, codes)
        pg.goto(uri(FIX) + '#stocktake-ops', wait_until='load', timeout=60000)
        pg.wait_for_timeout(1500)
        sec = pg.locator('#stocktake-ops')
        check('L1 修复手册 #stocktake-ops 唯一命中', sec.count() == 1, 'count=%d' % sec.count())
        head = sec.inner_text()[:40].replace('\n', '|') if sec.count() else ''
        check('L1 修复手册章标题含 16.9.8', '16.9.8' in head, head)
        # 只数「交付截图」（stocktake-ops-*）：16.9.8 第 9 小节自身的那张「渲染级验证取证图」
        # 也在这个区块里，若按「区块内全部 img」数会把它算进来（实测 10）。断言仍是 === 9，未放宽。
        assert_imgs('L1 修复手册', pg.evaluate(IMG_JS, '#stocktake-ops img[src*="stocktake-ops-"]'))
        check('L1 修复手册无 JS 异常', not bag, str(bag[:2]))
        ctx.close()

        # ---------- L1b 用户手册源：openChapter 渲染 + 9 图真解码 ----------
        bag, codes = [], {}   # 分层清空：L1/L2 异常互不污染
        ctx, pg = new_page(b, bag, codes)
        pg.goto(uri(USER_MANUAL), wait_until='load', timeout=60000)
        declared = pg.evaluate(TITLE_JS, CH)
        rendered = pg.evaluate(RENDER_JS, CH)
        check('L1 用户手册源 openChapter(%s) 渲染成功' % CH,
              bool(declared) and declared in rendered, rendered)
        assert_imgs('L1 用户手册源', pg.evaluate(IMG_JS, '#readerContent img.img[src*="stocktake-ops-"]'))
        check('L1 用户手册源无 JS 异常', not bag, str(bag[:2]))
        ctx.close()

        # ---------- L2 线上：同上 + 响应码 + 字节一致 + 取证截图 ----------
        bag, codes = [], {}
        ctx, pg = new_page(b, bag, codes)
        pg.goto(ONLINE, wait_until='networkidle', timeout=60000)
        rendered = pg.evaluate(RENDER_JS, CH)
        check('L2 线上手册 openChapter(%s) 渲染成功' % CH, bool(rendered.strip()), rendered)
        assert_imgs('L2 线上手册', pg.evaluate(IMG_JS, '#readerContent img.img[src*="stocktake-ops-"]'))
        shoot(pg, 'manual-render-online-op39.png')
        check('L2 线上手册无 JS 异常', not bag, str(bag[:2]))
        check('L2 每张 PNG 响应码 200', codes and set(codes.values()) == {200},
              str(sorted(set(codes.values()))) + ' n=%d' % len(codes))
        ctx.close()
        b.close()

    # ---------- L2 旁路复核：线上 shots/ 与本地逐张字节一致（防缺图 / 旧图） ----------
    local = sorted(SHOTS_DIR.glob('stocktake-ops-*.png'))
    check('本地 shots/ 有 %d 张待比对' % EXPECT_N, len(local) == EXPECT_N, 'got=%d' % len(local))
    base = ONLINE.rsplit('/', 1)[0] + '/shots/'
    bad = []
    for f in local:
        try:
            with urllib.request.urlopen(base + f.name, timeout=30) as r:
                n = len(r.read())
        except Exception as e:  # noqa: BLE001
            bad.append('%s 不可达 %s' % (f.name, str(e)[:60]))
            continue
        if n != f.stat().st_size:
            bad.append('%s 线上 %d ≠ 本地 %d' % (f.name, n, f.stat().st_size))
    check(' L2 线上 shots/ 与本地逐张字节一致', not bad, str(bad[:3]))

    print('\n===== 渲染级验证：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
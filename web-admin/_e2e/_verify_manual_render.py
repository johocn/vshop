# -*- coding: utf-8 -*-
"""渲染级截图验证（规格 §11 补充）：手册截图必须「浏览器真渲染 + 图片真解码」。

为什么要单独一层：`_verify_manual_docs.py` 只判定「文件存在 + 页面含 op-39」，属静态判定——
手册引用的图 404 / 0 字节 / 路径写错 / 尺寸错版都发现不了。本脚本补渲染层。

覆盖两条交付线（2026-09-25 合并：原独立脚本 `_verify_manual_op38.py` 已删除，避免两份真相）：
  op-39 / 16.9.8 盘库运营增强 → 修复手册 #stocktake-ops + 用户手册 op-39（9 张图）
  op-38 多人协同盘库         → 用户手册 op-38（11 张图 / 9 小节 / 6 条 FAQ）

L1 离线（file://，不依赖网络与登录）
  修复手册 webadmin-bugfix-manual.html#stocktake-ops
  用户手册源 src/static/manual/index.html → openChapter('op-39') / openChapter('op-38')
L2 线上（部署后真实链路）
  线上手册同章节渲染 + 每张 PNG 响应码 200 + 与本地 shots/ 逐张字节一致
  取证截图（390x844 @dpr2 = 780x1688）归档 docs/webadmin-bugfix-manual/assets/
双落点核对为 INFO（不计失败）：修复手册 assets/ 的同名副本若存在须字节一致，缺失 / 不一致如实打印

驱动要点：手册是单文件 JS 书、无 hash 路由，章节切换靠页内全局函数 `openChapter(id)`
（`renderReader()` 把章节 HTML 注入 `#readerContent`）。`#op-39` 或点导航项都定位不到。

环境变量：WA_MANUAL_URL（默认线上手册）、WA_MANUAL_RENDER_CH（默认 op-39，仅影响 op-39 组）
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
EXPECT_N38 = 11                 # op-38 用户手册章节共 11 张手机截图（命名无统一前缀，按章节内全量 img 数）
EXPECT_H3_38, EXPECT_FAQ_38 = 9, 6   # op-38：9 个小节（h3）+ 6 条 FAQ（<details>）
EXPECT_W, EXPECT_H = 780, 1688  # 390x844 @dpr2
CH38 = 'op-38'

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
H3_JS = """()=>document.querySelectorAll('#readerContent h3').length"""
FAQ_JS = """()=>document.querySelectorAll('#readerContent details').length"""


def new_page(browser, bag, codes, needle='stocktake-ops-'):
    """手机视口 + 异常与响应码收集（bag / codes 由调用方按层清空，避免互相污染）。
    needle = 只登记 URL 含该子串的响应当作「本章节图片」，op-39 用文件名前缀、op-38 用目录名 shots/。"""
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, locale='zh-CN')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: bag.append('PAGEERR:' + str(e)[:200]))
    pg.on('console', lambda m: bag.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
    pg.on('response', lambda r: codes.__setitem__(r.url, r.status) if needle in r.url else None)
    return ctx, pg


def assert_imgs(tag, imgs, expect_n=EXPECT_N):
    check('%s 图数 = %d' % (tag, expect_n), len(imgs) == expect_n, 'got=%d' % len(imgs))
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

    names38 = []   # op-38 的 11 张图文件名（从 L1 渲染的 DOM 取，避免在脚本里硬编码名单）
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

        # ---------- L1c 用户手册源 op-38：章节可达 + 结构计数 + 11 图真解码 ----------
        bag, codes = [], {}
        ctx, pg = new_page(b, bag, codes, needle='shots/')
        pg.goto(uri(USER_MANUAL), wait_until='load', timeout=60000)
        declared38 = pg.evaluate(TITLE_JS, CH38)
        rendered38 = pg.evaluate(RENDER_JS, CH38)
        check('L1 用户手册源 openChapter(%s) 渲染成功' % CH38,
              bool(declared38) and declared38 in rendered38, rendered38)
        check('L1 用户手册源 op-38 h3 小节 = %d' % EXPECT_H3_38,
              pg.evaluate(H3_JS) == EXPECT_H3_38, 'got=%d' % pg.evaluate(H3_JS))
        check('L1 用户手册源 op-38 FAQ 条数 = %d' % EXPECT_FAQ_38,
              pg.evaluate(FAQ_JS) == EXPECT_FAQ_38, 'got=%d' % pg.evaluate(FAQ_JS))
        imgs38 = pg.evaluate(IMG_JS, '#readerContent img.img')
        names38 = [Path(i['src']).name for i in imgs38]
        assert_imgs('L1 用户手册源 op-38', imgs38, EXPECT_N38)
        check('L1 用户手册源 op-38 无 JS 异常', not bag, str(bag[:2]))
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

        # ---------- L2b 线上 op-38：结构 + 11 图 + 响应码 + 取证截图 ----------
        bag, codes = [], {}
        ctx, pg = new_page(b, bag, codes, needle='shots/')
        pg.goto(ONLINE, wait_until='networkidle', timeout=60000)
        rendered38 = pg.evaluate(RENDER_JS, CH38)
        check('L2 线上手册 openChapter(%s) 渲染成功' % CH38, bool(rendered38.strip()), rendered38)
        check('L2 线上手册 op-38 h3 小节 = %d' % EXPECT_H3_38,
              pg.evaluate(H3_JS) == EXPECT_H3_38, 'got=%d' % pg.evaluate(H3_JS))
        check('L2 线上手册 op-38 FAQ 条数 = %d' % EXPECT_FAQ_38,
              pg.evaluate(FAQ_JS) == EXPECT_FAQ_38, 'got=%d' % pg.evaluate(FAQ_JS))
        assert_imgs('L2 线上手册 op-38', pg.evaluate(IMG_JS, '#readerContent img.img'), EXPECT_N38)
        shoot(pg, 'manual-render-online-op38.png')
        check('L2 线上手册 op-38 无 JS 异常', not bag, str(bag[:2]))
        # 线上手册会在空闲时预加载全册图片（实测 166 张响应），故只按「本章 11 个文件名」核对响应码，
        # 不按 needle 命中数断言——否则会把预加载的其它章节图算进来（断言强度不变，仍要求 11 张全 200）
        got38 = {u.rsplit('/', 1)[-1]: s for u, s in codes.items()
                 if u.rsplit('/', 1)[-1] in set(names38)}
        check('L2 线上手册 op-38 每张 PNG 响应码 200',
              len(got38) == EXPECT_N38 and set(got38.values()) == {200},
              str(sorted(set(got38.values()))) + ' n=%d' % len(got38))
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

    # ---------- L2 旁路复核（op-38 的 11 张）：线上 shots/ 与本地逐张字节一致 ----------
    bad38 = []
    for nm in names38:
        f = SHOTS_DIR / nm
        if not f.exists():
            bad38.append('%s 本地缺失' % nm)
            continue
        try:
            with urllib.request.urlopen(base + nm, timeout=30) as r:
                n = len(r.read())
        except Exception as e:  # noqa: BLE001
            bad38.append('%s 不可达 %s' % (nm, str(e)[:60]))
            continue
        if n != f.stat().st_size:
            bad38.append('%s 线上 %d ≠ 本地 %d' % (nm, n, f.stat().st_size))
    check(' L2 线上 shots/ 与本地逐张字节一致（op-38 %d 张）' % EXPECT_N38, not bad38, str(bad38[:3]))

    # ---------- 双落点核对（INFO，不计失败）：修复手册 assets/ 的同名副本 ----------
    same, no_copy, mismatch = [], [], []
    for nm in names38:
        m = ASSETS / nm
        if not m.exists():
            no_copy.append(nm)
        elif m.stat().st_size != (SHOTS_DIR / nm).stat().st_size:
            mismatch.append('%s assets %d ≠ shots %d' % (nm, m.stat().st_size,
                                                         (SHOTS_DIR / nm).stat().st_size))
        else:
            same.append(nm)
    print('  INFO  双落点核对（修复手册 assets/）：字节一致 %d / 无同名副本 %d / 不一致 %d %s'
          % (len(same), len(no_copy), len(mismatch), mismatch))

    print('\n===== 渲染级验证：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
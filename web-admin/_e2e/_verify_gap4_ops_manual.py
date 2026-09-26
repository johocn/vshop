# -*- coding: utf-8 -*-
"""gap4 Task 4.9 取证：线上使用手册新增章节 op-40「定时任务与常驻 worker」的手机视口截图。

计划：docs/superpowers/plans/2026-09-25-web-admin-gap4-plan.md · Task 4.9
铁律：390x844 @dpr2（= 780x1688）、is_mobile、has_touch；每张图 0 pageerror / 0 console.error。

与批 1/3/4 的验收脚本不同，本脚本**只读**：目标就是线上已部署的手册页
（默认 https://e.joho.cn/guanli/static/manual/index.html），不登录、不发写请求、不碰后台接口，
故不套用 FORBIDDEN_HOSTS 写护栏。断言口径 = 线上产物里确实能翻到该章且 5 条必含内容都在。

退出码：0 = 通过；1 = 断言失败；2 = 环境不可用
"""
import os
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:  # noqa: BLE001
    pass

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

URL = os.environ.get('WA_MANUAL_URL', 'https://e.joho.cn/guanli/static/manual/index.html')
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'verify'

FAILS = []
# op-40 五条必含内容（与修复手册 20.8 一一对应）
MUST_HAVE = [
    ('两个进程', 'vendure-worker'),
    ('注册日志', 'Registered scheduled task'),
    ('执行日志', 'Executing scheduled task'),
    ('自检命令', 'pm2 list'),
    ('TTL 入口', 'reservationTtlMinutes'),
]


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def info(msg):
    print('  INFO %s' % msg)


def shot(pg, name, note):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / ('gap4-ops-manual-%s.png' % name)
    pg.screenshot(path=str(f))
    check('%s · %s' % (name, note), f.exists() and f.stat().st_size > 5000,
          '%s %dB' % (f.name, f.stat().st_size if f.exists() else 0))


def main():
    bag = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: bag.append('PAGEERR %s' % e))
        pg.on('console', lambda m: bag.append('CONSOLE %s' % m.text) if m.type == 'error' else None)
        try:
            pg.goto(URL, wait_until='networkidle', timeout=60000)
        except Exception as e:  # noqa: BLE001
            print('ENV-FAIL: 手册不可达 %s → %s' % (URL, str(e)[:200]))
            raise SystemExit(2)
        time.sleep(1)

        # 0) 首页 → 进入「运营手册」分册（手册默认停在首页，目录只列当前分册的章节）
        card = pg.locator('.book-card', has_text='租户运营手册')
        check('首页有「租户运营手册」分册入口', card.count() == 1, 'count=%d' % card.count())
        card.first.click()
        time.sleep(1)

        # 1) 目录里能翻到 op-40（证明线上产物已含新章）
        pg.locator('#btnMenu').click()
        item = pg.locator('.toc-item[data-id="op-40"]')
        item.first.wait_for(state='attached', timeout=15000)
        check('目录含 op-40 条目', item.count() == 1, 'count=%d' % item.count())
        check('条目文案为「定时任务与常驻 worker」',
              '定时任务与常驻 worker' in (item.first.inner_text() if item.count() else ''))
        item.first.scroll_into_view_if_needed()
        time.sleep(0.4)
        shot(pg, '01-toc-op40', '目录中的新章条目')

        # 2) 点进该章，正文可达
        item.first.click()
        time.sleep(1.2)
        reader = pg.locator('#readerContent')
        check('点条目后进入阅读视图', reader.count() == 1 and reader.first.is_visible())
        head = pg.locator('#readerContent h2').first.inner_text() if reader.count() else ''
        check('章节标题正确', '定时任务与常驻 worker' in head, head.strip()[:60])
        shot(pg, '02-chapter-top', '章节首屏（第 1/2 节）')

        # 3) 五条必含内容逐条核对
        text = reader.inner_text() if reader.count() else ''
        for label, needle in MUST_HAVE:
            check('%s → 含 %s' % (label, needle), needle in text)
        check('含 TTL 默认值 30 分钟', '默认 30 分钟' in text)
        check('含「不用重启 worker」口径', '不用' in text and '重启' in text)

        # 4) 滚到第 3 节「四步自检」再取一图
        h3 = pg.locator('#readerContent h3')
        target = None
        for i in range(h3.count()):
            if '自检' in h3.nth(i).inner_text():
                target = h3.nth(i)
                break
        check('定位到「四步自检」小节', target is not None)
        if target is not None:
            target.evaluate('el => el.scrollIntoView({block:"start"})')
            time.sleep(0.6)
            shot(pg, '03-selfcheck', '四步自检与有效期配置')

        errs = [e for e in bag if e.startswith('PAGEERR') or e.startswith('CONSOLE')]
        check('全程无 JS 异常（pageerror / console.error）', not errs, str(errs[:3]))
        for e in bag:
            info(e[:160])
        b.close()

    print('\n===== op-40 手机视口取证：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
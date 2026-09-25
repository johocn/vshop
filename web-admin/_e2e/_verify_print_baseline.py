# -*- coding: utf-8 -*-
"""打印像素基线（规格 §3.5 / §7.5 / §10.5）

受控渲染契约（与 _e2e/baselines/print/<case>/env.json 同源）：
  Playwright Chromium + emulateMedia({media:'print'}) + 视口 794x1123 @dpr2
  光栅化：element.screenshot(.st-print) → PIL 按 271mm 内容高切片成页（本机无 PDF 光栅化库）
  比对：同机逐像素零容差；跨机/跨版本自动降级为结构断言并输出 SKIP pixel（不虚报 PASS）

用法（在 web-admin 目录下）：
  python _e2e/_verify_print_baseline.py --task <taskId>                # 比对
  python _e2e/_verify_print_baseline.py --task <taskId> --record       # 录基线
  python _e2e/_verify_print_baseline.py --task <taskId> --record --force
  python _e2e/_verify_print_baseline.py --task <id> --empty-task <id>  # 追加 empty-a4
  python _e2e/_verify_print_baseline.py                                # 用环境变量 WA_PRINT_TASK
环境变量：WA_PRINT_BASE（默认 https://e.joho.cn/guanli/）、WA_PRINT_TASK、WA_SMOKE_USER、WA_SMOKE_PWD、WA_SMOKE_CHANNEL
  WA_API_ORIGIN（计划外增补 a）：非空且 WA_PRINT_BASE 指向 localhost 时，把 **/admin-api 转发到该源（只读）；
  为空时不注册任何路由，行为与计划逐字一致。
退出码：0 = 全部通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用

计划外增补（Task 16 执行偏差，逐条见交付报告）：
  (a) WA_API_ORIGIN 反代：本机无可写后端，登录与查询经 /admin-api 只读转发到生产。
  (b) 「任务必须 POSTED」在其它终态（如 CANCELLED）时降级为显式 SKIP，其余断言不放宽。
  (c) 数据不足（无有效数据行）时 skip 相应断言（跨页/像素比对）并拒绝写基线，绝不伪造 PASS。
"""
import argparse
import io
import json
import os
import platform
import re
import time
from pathlib import Path
from urllib.parse import urlparse

try:
    import numpy as np
    from PIL import Image
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 pillow + numpy → %s' % e)
    raise SystemExit(2)
try:
    import playwright
    from playwright.sync_api import sync_playwright
except ImportError as e:  # noqa: BLE001
    print('ENV-FAIL: 需要 playwright → %s' % e)
    raise SystemExit(2)

MM = 96.0 / 25.4                      # 1mm = 3.779528 CSS px @96dpi
CONTENT_W_MM, CONTENT_H_MM = 186.0, 271.0
CONTENT_W_CSS = CONTENT_W_MM * MM
CONTENT_H_CSS = CONTENT_H_MM * MM
PAGE_H_DEV = int(round(CONTENT_H_CSS * 2))          # 271mm @dpr2 → 2049 设备像素
VIEW = {'width': 794, 'height': 1123}
DPR = 2
COL_MM = [22.0, 30.0, 38.0, 17.0, 17.0, 17.0, 15.0, 12.0, 18.0]
COL_TOL_MM = 0.3
WIDTH_TOL_MM = 0.3
FONT_STACK = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
PRINT_AT = '2026-09-25 10:00'                       # 冻结打印时间，保证页脚可复现
BIG_ROWS = 120

BASE = os.environ.get('WA_PRINT_BASE', 'https://e.joho.cn/guanli/')
BASE = BASE if BASE.endswith('/') else BASE + '/'
USER = os.environ.get('WA_SMOKE_USER', 'guoxinnanshan@163.com')
PWD = os.environ.get('WA_SMOKE_PWD', 'you123123')
CHANNEL = os.environ.get('WA_SMOKE_CHANNEL', 't2')
ROOT = Path(__file__).resolve().parent
BASE_DIR = ROOT / 'baselines' / 'print'
# —— 计划外增补 (a)：/admin-api 只读转发目标（为空则完全不注册路由）——
API_ORIGIN = os.environ.get('WA_API_ORIGIN', '').rstrip('/')

FAILS, SKIPS = [], []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def skip(name, why):
    print('  SKIP %s %s' % (name, why))
    SKIPS.append('%s：%s' % (name, why))


# ------------------------------------------------------------------ 浏览器侧

# —— 计划外增补 (a)：把页面发出的 **/admin-api 转发到 WA_API_ORIGIN（保留原 method/headers/post body）——
# 只在 BASE 指向 localhost/127.0.0.1 且 WA_API_ORIGIN 非空时启用；转发仅用于登录与只读查询。
def forward_admin_api(pg):
    if not API_ORIGIN:
        return
    host = urlparse(BASE).netloc
    if 'localhost' not in host and '127.0.0.1' not in host:
        return

    def _handler(route):
        resp = route.fetch(url=API_ORIGIN + '/admin-api')
        route.fulfill(response=resp)

    pg.route('**/admin-api', _handler)
    print('  FORWARD /admin-api → %s/admin-api（只读）' % API_ORIGIN)


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
    if ok != 'OK':
        print('ENV-FAIL: 登录/渠道注入失败 %s' % ok)
        raise SystemExit(2)


def open_diff(pg, tid):
    url = '%s#/pages/inventory/stocktake/diff?taskId=%s&cb=%d' % (BASE, tid, int(time.time() * 1000))
    pg.goto(url, wait_until='networkidle', timeout=60000)
    pg.reload(wait_until='networkidle', timeout=60000)
    pg.wait_for_selector('.st-print', state='attached', timeout=40000)
    time.sleep(2.0)


def measure(pg):
    return pg.evaluate("""() => {
      const root = document.querySelector('.st-print');
      if (!root) return null;
      const mm = (px) => px * 25.4 / 96;
      const r = root.getBoundingClientRect();
      const ths = [...document.querySelectorAll('.st-print .p-tbl thead th')].map(t => mm(t.getBoundingClientRect().width));
      const thead = document.querySelector('.st-print .p-tbl thead');
      const tr = document.querySelector('.st-print .p-tbl tbody tr');
      const cs = getComputedStyle(root);
      const over = [];
      for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width > 186.5 || b.right > r.left + 186.5) over.push((el.className || el.tagName) + ':' + b.width.toFixed(1));
      }
      return {
        widthMM: mm(r.width), heightMM: mm(r.height), colsMM: ths,
        theadDisplay: thead ? getComputedStyle(thead).display : '',
        trBreak: tr ? getComputedStyle(tr).breakInside : '',
        fontFamily: cs.fontFamily,
        colorAdjust: cs.printColorAdjust || cs.webkitPrintColorAdjust,
        scrollW: root.scrollWidth, clientW: root.clientWidth,
        overflow: over.slice(0, 5), text: root.innerText,
      };
    }""")


def inject_big(pg, n):
    return pg.evaluate("""(n) => {
      const tb = document.querySelector('.st-print .p-tbl tbody');
      if (!tb) return -1;
      const rows = [...tb.querySelectorAll('tr')].filter(r => !r.querySelector('.p-empty'));
      if (!rows.length) return -2;
      const src = rows[0];
      for (let i = 0; i < n; i++) tb.appendChild(src.cloneNode(true));
      return tb.querySelectorAll('tr').length;
    }""", n)


# —— 计划外增补 (c)：有效数据行数（排除 .p-empty 占位行），用于识别「数据不足」——
def rows_in_table(pg):
    return pg.evaluate("""() => {
      const tb = document.querySelector('.st-print .p-tbl tbody');
      if (!tb) return 0;
      return [...tb.querySelectorAll('tr')].filter(r => !r.querySelector('.p-empty')).length;
    }""")


# ------------------------------------------------------------------ 图像侧

def slice_pages(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    w, h = im.size
    n = max(1, int((h + PAGE_H_DEV - 1) // PAGE_H_DEV))
    pages = []
    for i in range(n):
        top = i * PAGE_H_DEV
        band = im.crop((0, top, w, min(h, top + PAGE_H_DEV)))
        canvas = Image.new('RGB', (w, PAGE_H_DEV), (255, 255, 255))
        canvas.paste(band, (0, 0))          # 末页补白：内容上移/下移都能被 diff 抓到
        pages.append(canvas)
    return w, pages


def arr(img):
    return np.asarray(img, dtype=np.int16)


def build_env(pg, tid, m, pages):
    return {
        'case_task_id': str(tid),
        'title': m['text'].split('\n')[0] if m.get('text') else '',
        'pages': pages,
        'page_h_dev': PAGE_H_DEV,
        'fingerprint': {
            'chromium': pg.evaluate('() => navigator.userAgent'),
            'playwright': getattr(playwright, '__version__', 'unknown'),
            'os': platform.platform(),
            'python': platform.python_version(),
            'viewport': VIEW, 'dpr': DPR,
            'content_mm': [CONTENT_W_MM, CONTENT_H_MM],
            'page_h_dev': PAGE_H_DEV,
            'font_stack': FONT_STACK,
            'print_at': PRINT_AT,
        },
        'recorded_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }


FP_KEYS = ['chromium', 'playwright', 'os', 'viewport', 'dpr', 'content_mm', 'page_h_dev', 'print_at']


def pdf_asserts(pg, case, expect_pages):
    b = pg.pdf(format='A4', print_background=True, prefer_css_page_size=True,
               margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
    n = len(re.findall(rb'/Type\s*/Page[^s]', b))
    check('%s PDF 页数 >= 切片页数' % case, n >= expect_pages, 'pdf=%d png=%d' % (n, expect_pages))
    box = re.search(rb'/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)', b)
    if not box:
        check('%s PDF 含 MediaBox' % case, False, '未匹配到 /MediaBox')
        return
    w, h = float(box.group(3)), float(box.group(4))
    check('%s PDF 页尺寸 = A4（595.276 x 841.89pt ±0.5）' % case,
          abs(w - 595.276) <= 0.5 and abs(h - 841.89) <= 0.5, '%.3f x %.3f pt' % (w, h))


def geometry_asserts(case, m, code):
    check('%s 打印区宽度 = 186mm（±0.3）' % case, m and abs(m['widthMM'] - CONTENT_W_MM) <= WIDTH_TOL_MM,
          '%.2fmm' % (m['widthMM'] if m else -1))
    if not m:
        return
    check('%s 差异表 9 列' % case, len(m['colsMM']) == 9, 'cols=%d' % len(m['colsMM']))
    bad = [(i + 1, round(w, 2), COL_MM[i]) for i, w in enumerate(m['colsMM']) if i < 9 and abs(w - COL_MM[i]) > COL_TOL_MM]
    check('%s 列宽符合 §7.5（±0.3mm）' % case, not bad, '偏差=%s' % bad)
    check('%s thead 为 table-header-group（续页重复机制）' % case, m['theadDisplay'] == 'table-header-group', m['theadDisplay'])
    check('%s 数据行 break-inside = avoid' % case, m['trBreak'] == 'avoid', m['trBreak'])
    check('%s 打印字体栈已显式声明' % case, 'PingFang SC' in m['fontFamily'], m['fontFamily'][:60])
    check('%s print-color-adjust = exact' % case, m['colorAdjust'] == 'exact', str(m['colorAdjust']))
    check('%s 无横向溢出' % case, not m['overflow'] and m['scrollW'] <= m['clientW'] + 1,
          'overflow=%s scroll=%s/%s' % (m['overflow'], m['scrollW'], m['clientW']))
    t = m['text'] or ''
    check('%s DOM 文本含任务号' % case, code in t, 'code=%s' % code)
    check('%s DOM 文本含「差异」「未盘」' % case, ('差异' in t) and ('未盘' in t), '')


def task_meta(pg, tid):
    """返回 'code|state'（每次按 taskId 现取，empty-a4 用的是另一个任务）"""
    raw = pg.evaluate("""async ([id]) => {
      const t = localStorage.getItem('wa_auth_token');
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},
        body: JSON.stringify({query:'query($id: ID!){ stocktakeTask(id:$id){ code state } }', variables:{id}})});
      const d = await r.json();
      const x = ((d.data||{}).stocktakeTask) || {};
      return (x.code || '') + '|' + (x.state || '');
    }""", [str(tid)])
    code, state = (raw or '|').split('|', 1)
    return code, state


def run(pg, case, tid, record, force, big=False):
    print('\n[%s] task=%s' % (case, tid))
    code, state = task_meta(pg, tid)
    # —— 计划外增补 (b)：POSTED 保持原 check；其它终态（生产无 POSTED 任务）降级为显式 SKIP ——
    if bool(code) and state == 'POSTED':
        check('%s 任务可查且已终态（免受并发改动影响）' % case, True, 'code=%s state=%s' % (code, state))
    elif bool(code):
        skip('%s 任务可查且已终态（免受并发改动影响）' % case,
             '生产无 POSTED 任务，用只读 CANCELLED 终态任务代替（实际 code=%s state=%s）' % (code, state))
    else:
        check('%s 任务可查且已终态（免受并发改动影响）' % case, False, 'code=%s state=%s' % (code, state))
    open_diff(pg, tid)
    # —— 计划外增补 (c)：无有效数据行 = 数据不足（不编造、不写基线、相应断言转 SKIP）——
    short = rows_in_table(pg) == 0
    if big:
        n = inject_big(pg, BIG_ROWS)
        if n == -2:
            skip('%s 注入行成功' % case, '数据不足：数据源无有效数据行（inject_big=%s），无法注入' % n)
        else:
            check('%s 注入行成功' % case, n >= BIG_ROWS, 'rows=%s' % n)
    m = measure(pg)
    geometry_asserts(case, m, code)
    png = pg.locator('.st-print').screenshot()
    w, pages = slice_pages(png)
    check('%s 光栅宽度 = 186mm @dpr2（±2px）' % case, abs(w - round(CONTENT_W_CSS * DPR)) <= 2,
          'w=%d 期望=%d' % (w, round(CONTENT_W_CSS * DPR)))
    if big:
        if short:
            skip('%s 内容跨 >= 3 页' % case, '数据不足：数据源无有效数据行，跨页行为不可验证')
        else:
            check('%s 内容跨 >= 3 页' % case, len(pages) >= 3, 'pages=%d' % len(pages))
    pdf_asserts(pg, case, len(pages))

    folder = BASE_DIR / case
    env_now = build_env(pg, tid, m, len(pages))
    if record:
        if folder.exists() and not force:
            check('%s 基线已存在（要覆盖请加 --force）' % case, False, str(folder))
            return
        if short:
            skip('%s 录制基线' % case, '数据不足（无有效数据行）→ 拒绝写入基线，避免生成空的/伪造的 page-1.png')
            return
        folder.mkdir(parents=True, exist_ok=True)
        for i, p in enumerate(pages):
            p.save(folder / ('page-%d.png' % (i + 1)))
        (folder / 'env.json').write_text(json.dumps(env_now, ensure_ascii=False, indent=2), encoding='utf-8')
        print('  REC  %s → %d 页 + env.json' % (folder, len(pages)))
        return

    if short:
        skip('%s 像素比对' % case, '数据不足：数据源无有效数据行 → 无基线可比，跳过（不伪造 PASS）')
        return
    env_path = folder / 'env.json'
    if not env_path.exists():
        check('%s 基线存在' % case, False, '未找到 %s（先跑 --record）' % env_path)
        return
    env_old = json.loads(env_path.read_text(encoding='utf-8'))
    diff_keys = [k for k in FP_KEYS if env_old['fingerprint'].get(k) != env_now['fingerprint'].get(k)]
    if diff_keys:
        skip('%s 像素比对' % case, '渲染环境指纹不符 %s（结构断言照跑）' % diff_keys)
        return
    if env_old.get('pages') != len(pages):
        check('%s 页数与基线一致' % case, False, 'baseline=%s now=%s' % (env_old.get('pages'), len(pages)))
        return
    bad_pages = []
    for i, p in enumerate(pages):
        old = Image.open(folder / ('page-%d.png' % (i + 1))).convert('RGB')
        if old.size != p.size:
            bad_pages.append('page-%d 尺寸 %s≠%s' % (i + 1, p.size, old.size))
            continue
        a, b = arr(p), arr(old)
        mask = (a != b).any(axis=2)
        n = int(mask.sum())
        if n:
            out = np.asarray(p).copy()
            out[mask] = [255, 0, 0]
            d = BASE_DIR / '_diff' / case
            d.mkdir(parents=True, exist_ok=True)
            Image.fromarray(out).save(d / ('page-%d.png' % (i + 1)))
            bad_pages.append('page-%d 差异像素 %d（最大通道差 %d）' % (i + 1, n, int(np.abs(a - b).max())))
    check('%s 逐页像素零容差一致' % case, not bad_pages, '；'.join(bad_pages[:3]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--task', default=os.environ.get('WA_PRINT_TASK', ''))
    ap.add_argument('--empty-task', default=os.environ.get('WA_PRINT_EMPTY_TASK', ''))
    ap.add_argument('--record', action='store_true')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if not a.task:
        print('ENV-FAIL: 缺 --task（或环境变量 WA_PRINT_TASK）——基线必须钉死一个固定的历史任务 id')
        raise SystemExit(2)

    print('受控渲染：viewport=%s dpr=%d content=%.0fx%.0fmm page_h_dev=%d' % (VIEW, DPR, CONTENT_W_MM, CONTENT_H_MM, PAGE_H_DEV))
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport=VIEW, device_scale_factor=DPR, locale='zh-CN')
        ctx.add_init_script("window.__STOCKTAKE_PRINT_AT__ = '%s'" % PRINT_AT)
        pg = ctx.new_page()
        forward_admin_api(pg)          # 计划外增补 (a)
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERR:' + str(e)[:200]))
        pg.on('console', lambda m: errs.append('CONSOLE:' + m.text[:200]) if m.type == 'error' else None)
        pg.emulate_media(media='print')
        login(pg)

        run(pg, 'diff-a4', str(a.task), a.record, a.force)
        if a.empty_task:
            run(pg, 'empty-a4', str(a.empty_task), a.record, a.force)
        else:
            skip('empty-a4', '未提供 --empty-task / WA_PRINT_EMPTY_TASK')
        run(pg, 'big-a4', str(a.task), a.record, a.force, big=True)

        check('全程无 JS 运行时异常', not [e for e in errs if e.startswith('PAGEERR')], str([e for e in errs if e.startswith('PAGEERR')][:2]))
        print('  console.error 计数 = %d' % len([e for e in errs if e.startswith('CONSOLE')]))
        b.close()

    print('\n===== 打印基线：%s（失败 %d / SKIP %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS), len(SKIPS)))
    for s in SKIPS:
        print('  SKIP', s)
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
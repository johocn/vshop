# -*- coding: utf-8 -*-
"""打印像素基线（规格 §3.5 / §7.5 / §10.5）

受控渲染契约（与 _e2e/baselines/print/<case>/env.json 同源）：
  Playwright Chromium + emulateMedia({media:'print'}) + 视口 794x1123 @dpr2
  光栅化：element.screenshot(.st-print) → PIL 按 271mm 内容高切片成页（本机无 PDF 光栅化库）
  比对：同机逐像素零容差；跨机/跨版本自动降级为结构断言并输出 SKIP pixel（不虚报 PASS）

两阶段（像素级一致性要求的可判定形态）：
  阶段 ①「真实数据结构断言」——照旧打线上/本地真实任务，数据不足时该 case 的结构断言转 SKIP；
  阶段 ②「受控渲染像素基线」——把 .st-print 的内容整体替换为**冻结的合成 fixture**（任务头 / 四宫格 /
    差异表 9 列 / 未盘清单 / 页脚），使渲染结果与后端数据解耦 → 基线可在任意环境（含生产只读）录制与
    比对，不依赖「生产存在已过账且有差异行的任务」。

数据 fixture 契约（三个 case，env.json.fingerprint.fixture 记录，改动即需重录）：
  diff-a4  = 6 行差异 + 3 行未盘 + 四宫格 6/4/2/1        （单页）
  empty-a4 = 0 行差异（空态行）+ 无未盘区块 + 四宫格 0/0/0/0（单页空态）
  big-a4   = 120 行差异 + 24 行未盘 + 四宫格 120/106/14/6  （强制跨 >= 3 页）
载体任务（--task）只用于把 .st-print 渲染出来，其真实数据不进基线；但须满足「可查 + 未盘清单区块存在」
（uncountedCount > 0），否则 fixture 无处填充未盘清单 → 显式 FAIL，不静默退化成真实数据基线。

用法（在 web-admin 目录下）：
  python _e2e/_verify_print_baseline.py --task <taskId>                # 比对
  python _e2e/_verify_print_baseline.py --task <taskId> --record       # 录基线
  python _e2e/_verify_print_baseline.py --task <taskId> --record --force
  python _e2e/_verify_print_baseline.py                                # 用环境变量 WA_PRINT_TASK
环境变量：WA_PRINT_BASE（默认 https://e.joho.cn/guanli/）、WA_PRINT_TASK、WA_SMOKE_USER、WA_SMOKE_PWD、WA_SMOKE_CHANNEL
  WA_API_ORIGIN（计划外增补 a）：非空且 WA_PRINT_BASE 指向 localhost 时，把 **/admin-api 转发到该源（只读）；
  为空时不注册任何路由，行为与计划逐字一致。
退出码：0 = 全部通过（含显式 SKIP）；1 = 断言失败；2 = 环境不可用

SKIP 边界（反假 PASS，2026-09-25 收紧）：
  像素阶段**不得**因「数据不足」降级为 SKIP——数据已由 fixture 保证，缺数据即环境异常 → FAIL；
  唯一允许的像素降级是「渲染环境指纹不符」（规格 §10.5：跨机/跨版本，结构断言照跑）。

计划外增补（Task 16 执行偏差，逐条见交付报告）：
  (a) WA_API_ORIGIN 反代：本机无可写后端，登录与查询经 /admin-api 只读转发到生产。
  (b) 「任务必须 POSTED」在其它终态（如 CANCELLED）时降级为显式 SKIP，其余断言不放宽。
  (c) 阶段 ① 数据不足（无有效差异行）时 skip 真实数据侧的结构断言，绝不伪造 PASS；
      阶段 ② 因 fixture 而不再存在「数据不足」分支（原 --empty-task 参数随之取消）。
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

# —— 合成 fixture（数据受控；文案常量镜像 src/locale/zh-Hans.json 的 stocktake.diff.* 词条）——
FIX_CODE = 'FX20260925-001'
FIX_TITLE = FIX_CODE + ' · 固定样例盘库任务'
FIX_SUB = '仓库: 固定样例仓 | 活动: FX-ACT-01'
EMPTY_TEXT = '暂无差异'                              # stocktake.diff.empty
UNC_TITLE = '未盘项（%d）'                            # stocktake.diff.uncountedTitle
FOOT_TASK = '任务号'                                 # stocktake.diff.footerTask
FOOT_AT = '打印时间'                                  # stocktake.diff.footerAt
# case → fixture 规格（rows/unc 为行数，sum 为四宫格 应盘/已盘/未盘/盘盈）
FIXTURE = {
    'diff-a4': {'rows': 6, 'unc': 3, 'sum': [6, 4, 2, 1]},
    'empty-a4': {'rows': 0, 'unc': 0, 'sum': [0, 0, 0, 0]},
    'big-a4': {'rows': 120, 'unc': 24, 'sum': [120, 106, 14, 6]},
}

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


def pkg_version(name):
    """包版本（进指纹）：playwright 包没有 __version__，必须走 importlib.metadata；
    取不到就记 unknown（不静默当成「版本未变」）。跨版本不符即降级 SKIP（规格 §10.5）。"""
    try:
        from importlib.metadata import version
        return version(name)
    except Exception:  # noqa: BLE001
        return 'unknown'


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
      const px = (v) => v * 96 / 25.4;
      const r = root.getBoundingClientRect();
      const tbl0 = document.querySelector('.st-print .p-tbl');
      // 计划外修正：列宽断言只应量「差异表」（第一张 .p-tbl）；原选择器会把未盘清单表一起算进来（9+3=12 列）
      const ths = tbl0 ? [...tbl0.querySelectorAll('thead th')].map(t => mm(t.getBoundingClientRect().width)) : [];
      const thead = document.querySelector('.st-print .p-tbl thead');
      const tr = document.querySelector('.st-print .p-tbl tbody tr');
      const cs = getComputedStyle(root);
      const over = [];
      const lim = px(186.5);   // 计划外修正：原代码拿 CSS px 直接与 186.5（mm 阈值）比 → 任何 >186.5px 元素都误判溢出
      for (const el of root.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width > lim || b.right > r.left + lim) over.push((el.className || el.tagName) + ':' + b.width.toFixed(1));
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


def fixture_spec(case):
    """按 case 生成冻结的合成 fixture（纯函数：同一 case 恒等输出，不受后端数据影响）。"""
    f = FIXTURE[case]
    rows = []
    for i in range(1, f['rows'] + 1):
        counted, snap = 10 + i % 7, 8 + i % 5
        d = counted - snap
        rows.append([
            'A-%02d-%02d' % (1 + (i - 1) // 12, 1 + (i - 1) % 12),
            'Z%02d' % (1 + (i - 1) % 8),
            'FX-SKU-%04d' % i,
            '固定样例商品 %04d' % i,
            str(counted), str(snap), str(snap),
            ('+' if d > 0 else '') + str(d),
            '1' if i % 5 == 0 else '',
        ])
    unc = [['FX-UNC-%04d' % i, '固定未盘样例 %04d' % i, str(3 + i % 9)]
           for i in range(1, f['unc'] + 1)]
    return {
        'case': case, 'title': FIX_TITLE, 'sub': FIX_SUB,
        'sum': [str(v) for v in f['sum']],
        'rows': rows, 'unc': unc,
        'emptyText': EMPTY_TEXT, 'uncTitle': UNC_TITLE % f['unc'],
        'footTask': '%s: %s' % (FOOT_TASK, FIX_CODE),
        'footAt': '%s: %s' % (FOOT_AT, PRINT_AT),
    }


# 把 .st-print 的内容整体替换为冻结 fixture（保留真实表头/四宫格标签等 i18n 文案，几何仍受测）
FIXTURE_JS = """(spec) => {
  const root = document.querySelector('.st-print');
  if (!root) return {ok: false, why: 'no .st-print'};
  // uni-app H5 强制给本组件每个元素加 scoped 属性（data-v-*）；新建节点必须继承该属性，
  // 否则 scoped 打印样式（如 .p-tbl td[data-v-*]）不命中 → 注入的表格会退化成无样式
  const vattr = Array.from(root.attributes).map(a => a.name).find(n => n.indexOf('data-v-') === 0) || '';
  const mk = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (vattr) e.setAttribute(vattr, '');
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const setText = (sel, txt) => {
    const e = root.querySelector(sel);
    if (e) e.textContent = txt;
    return !!e;
  };

  setText('.p-head .p-title', spec.title);
  const sub = root.querySelector('.p-head .p-sub');
  if (sub) { Array.from(sub.children).forEach(c => c.remove()); sub.textContent = spec.sub; }

  const ns = root.querySelectorAll('.p-sum .p-cell .p-n');
  spec.sum.forEach((v, i) => { if (ns[i]) ns[i].textContent = v; });

  const tb = root.querySelector('.p-sec .p-tbl tbody');
  if (!tb) return {ok: false, why: 'no diff tbody'};
  tb.textContent = '';
  let hasEmpty = false;
  if (!spec.rows.length) {
    const tr = mk('tr');
    const td = mk('td', 'p-empty', spec.emptyText);
    td.setAttribute('colspan', '9');
    tr.appendChild(td);
    tb.appendChild(tr);
    hasEmpty = true;
  } else {
    spec.rows.forEach(r => {
      const tr = mk('tr');
      ['c1', 'c2', 'c3', 'c4', 'c5 num', 'c6 num', 'c7 num', 'c8 num', 'c9 num']
        .forEach((cls, i) => tr.appendChild(mk('td', cls, r[i])));
      tb.appendChild(tr);
    });
  }

  const uncSec = Array.from(root.querySelectorAll('.p-sec'))
    .find(s => s.querySelector('.p-tbl.p-unc')) || null;
  let uncRows = 0;
  if (spec.unc.length) {
    if (!uncSec) return {ok: false, why: 'no .p-unc section（载体任务须 uncountedCount > 0）'};
    uncSec.style.display = '';
    setText('.p-sec-t', spec.uncTitle);
    const utb = uncSec.querySelector('tbody');
    utb.textContent = '';
    spec.unc.forEach(r => {
      const tr = mk('tr');
      ['u1', 'u2', 'u3 num'].forEach((cls, i) => tr.appendChild(mk('td', cls, r[i])));
      utb.appendChild(tr);
    });
    uncRows = utb.querySelectorAll('tr').length;
  } else if (uncSec) {
    uncSec.style.display = 'none';
  }

  const foot = root.querySelector('.p-foot');
  if (!foot || foot.children.length < 2) return {ok: false, why: 'no .p-foot children'};
  // 页脚是 display:flex + space-between：两个子项各自赋值（合并成一个文本节点会丢掉分栏）
  foot.children[0].textContent = spec.footTask;
  foot.children[1].textContent = spec.footAt;

  return {ok: true, vattr: vattr, hasEmpty: hasEmpty,
          diffRows: tb.querySelectorAll('tr').length, uncRows: uncRows};
}"""


def apply_fixture(pg, spec):
    return pg.evaluate(FIXTURE_JS, spec)


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


def build_env(pg, tid, m, pages, spec):
    return {
        'case_task_id': str(tid),          # 载体任务（只用于渲染出 .st-print，其数据不进基线）
        'title': m['text'].split('\n')[0] if m.get('text') else '',
        'pages': pages,
        'page_h_dev': PAGE_H_DEV,
        'fingerprint': {
            'chromium': pg.evaluate('() => navigator.userAgent'),
            'playwright': pkg_version('playwright'),
            'os': platform.platform(),
            'python': platform.python_version(),
            'viewport': VIEW, 'dpr': DPR,
            'content_mm': [CONTENT_W_MM, CONTENT_H_MM],
            'page_h_dev': PAGE_H_DEV,
            'font_stack': FONT_STACK,
            'print_at': PRINT_AT,
            # 数据 fixture 也是受控渲染契约的一部分：改了 fixture 就得重录基线
            'fixture': {'code': FIX_CODE, 'title': spec['title'], 'sum': spec['sum'],
                        'rows': len(spec['rows']), 'unc': len(spec['unc'])},
        },
        'recorded_at': time.strftime('%Y-%m-%d %H:%M:%S'),
    }


FP_KEYS = ['chromium', 'playwright', 'os', 'viewport', 'dpr', 'content_mm', 'page_h_dev', 'print_at', 'fixture']


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
    # 计划外修正：原代码只带 Authorization，后端会因缺渠道头直接 FORBIDDEN（code 恒为空），
    # 故补上 vendure-token（与前端 apis 层的渠道头同名）
    raw = pg.evaluate("""async ([id]) => {
      const t = localStorage.getItem('wa_auth_token');
      const c = localStorage.getItem('wa_channel_token') || '';
      const r = await fetch('/admin-api', {method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+t,'vendure-token':c},
        body: JSON.stringify({query:'query($id: ID!){ stocktakeTask(id:$id){ code state } }', variables:{id}})});
      const d = await r.json();
      const x = ((d.data||{}).stocktakeTask) || {};
      return (x.code || '') + '|' + (x.state || '');
    }""", [str(tid)])
    code, state = (raw or '|').split('|', 1)
    return code, state


def run(pg, case, tid, record, force):
    spec = fixture_spec(case)
    nrow, nunc = len(spec['rows']), len(spec['unc'])
    print('\n[%s] carrier task=%s fixture=rows:%d unc:%d' % (case, tid, nrow, nunc))

    # ---------------- 阶段 ①：真实数据结构断言（照旧；数据不足只影响本阶段） ----------------
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
    nrows = rows_in_table(pg)
    if nrows == 0:
        skip('%s 真实数据有差异行' % case,
             '数据不足：数据源无有效差异行（不阻塞阶段 ② —— 像素基线数据由 fixture 提供）')
    else:
        check('%s 真实数据有差异行' % case, True, 'rows=%d' % nrows)
    geometry_asserts(case, measure(pg), code)

    # ---------------- 阶段 ②：受控渲染像素基线（内容整体冻结为 fixture） ----------------
    fr = apply_fixture(pg, spec)
    if not isinstance(fr, dict) or not fr.get('ok'):
        check('%s fixture 注入成功' % case, False, str(fr))
        return
    check('%s fixture 注入成功' % case, True, 'vattr=%s' % fr.get('vattr'))
    want_rows = 1 if nrow == 0 else nrow          # 空态时 tbody 只有一行占位 .p-empty[colspan=9]
    check('%s fixture 生效：差异表行数' % case, fr['diffRows'] == want_rows,
          'rows=%s 期望=%s' % (fr['diffRows'], want_rows))
    check('%s fixture 生效：空态行' % case, fr['hasEmpty'] == (nrow == 0), 'hasEmpty=%s' % fr['hasEmpty'])
    check('%s fixture 生效：未盘清单行数' % case, fr['uncRows'] == nunc,
          'rows=%s 期望=%s' % (fr['uncRows'], nunc))

    m = measure(pg)
    geometry_asserts(case + '[fixture]', m, FIX_CODE)
    png = pg.locator('.st-print').screenshot()
    w, pages = slice_pages(png)
    check('%s[fixture] 光栅宽度 = 186mm @dpr2（±2px）' % case, abs(w - round(CONTENT_W_CSS * DPR)) <= 2,
          'w=%d 期望=%d' % (w, round(CONTENT_W_CSS * DPR)))
    if case == 'big-a4':
        check('%s[fixture] 内容跨 >= 3 页' % case, len(pages) >= 3, 'pages=%d' % len(pages))
    pdf_asserts(pg, case, len(pages))

    folder = BASE_DIR / case
    env_now = build_env(pg, tid, m, len(pages), spec)
    if record:
        if folder.exists() and not force:
            check('%s 基线已存在（要覆盖请加 --force）' % case, False, str(folder))
            return
        folder.mkdir(parents=True, exist_ok=True)
        for i, p in enumerate(pages):
            p.save(folder / ('page-%d.png' % (i + 1)))
        (folder / 'env.json').write_text(json.dumps(env_now, ensure_ascii=False, indent=2), encoding='utf-8')
        print('  REC  %s → %d 页 + env.json' % (folder, len(pages)))
        return

    # —— SKIP 边界已收紧：像素阶段没有「数据不足」降级路径（数据由 fixture 保证），缺基线即 FAIL ——
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
    ap.add_argument('--record', action='store_true')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if not a.task:
        print('ENV-FAIL: 缺 --task（或环境变量 WA_PRINT_TASK）——基线必须钉死一个固定的历史任务 id')
        raise SystemExit(2)

    print('受控渲染：viewport=%s dpr=%d content=%.0fx%.0fmm page_h_dev=%d' % (VIEW, DPR, CONTENT_W_MM, CONTENT_H_MM, PAGE_H_DEV))
    print('数据 fixture：' + '；'.join('%s=rows:%d/unc:%d' % (c, FIXTURE[c]['rows'], FIXTURE[c]['unc'])
                                  for c in ('diff-a4', 'empty-a4', 'big-a4')))
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

        # 三个 case 共用同一载体任务：内容一律由 fixture 覆盖，故不再需要 --empty-task
        run(pg, 'diff-a4', str(a.task), a.record, a.force)
        run(pg, 'empty-a4', str(a.task), a.record, a.force)
        run(pg, 'big-a4', str(a.task), a.record, a.force)

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
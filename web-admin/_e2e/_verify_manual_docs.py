# -*- coding: utf-8 -*-
"""交付文档门禁（规格 §11）：修复手册章节 / 线上手册 op-39 / 截图落盘 三件事可验证。

用法：python _e2e/_verify_manual_docs.py
环境变量：WA_MANUAL_URL（默认 https://e.joho.cn/guanli/static/manual/index.html）
退出码：0 = 通过；1 = 失败；2 = 环境不可用
"""
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / 'docs' / 'webadmin-bugfix-manual' / 'webadmin-bugfix-manual.html'
USER_MANUAL = ROOT / 'src' / 'static' / 'manual' / 'index.html'
ASSETS = ROOT / 'docs' / 'webadmin-bugfix-manual' / 'assets'
# 线上手册是单文件数据驱动，其图片目录是 `shots/`（部署后为
# https://e.joho.cn/guanli/static/manual/shots/...），与修复手册的 `assets/` 不是一个目录。
SHOTS_DIR = ROOT / 'src' / 'static' / 'manual' / 'shots'
PLAN = ROOT / 'docs' / 'superpowers' / 'plans' / '2026-09-25-stocktake-ops-enhancement-plan.md'
URL = os.environ.get('WA_MANUAL_URL', 'https://e.joho.cn/guanli/static/manual/index.html')
SHOTS = ['stocktake-ops-46-pagination.png', 'stocktake-ops-51-diff-toolbar.png',
         'stocktake-ops-51b-print-region.png', 'stocktake-ops-53-export-kinds.png']

FAILS = []


def check(name, ok, detail=''):
    print('%s %s %s' % ('  OK  ' if ok else '  FAIL', name, detail))
    if not ok:
        FAILS.append('%s %s' % (name, detail))


def refs(text, prefix):
    """取出 `text` 中以 `prefix/` 开头的 stocktake-ops 截图文件名。"""
    return re.findall(r'%s/(stocktake-ops-[0-9a-z\-]+\.png)' % prefix, text)


def main():
    if not FIX.exists() or not USER_MANUAL.exists():
        print('ENV-FAIL: 手册文件缺失 %s / %s' % (FIX, USER_MANUAL))
        raise SystemExit(2)
    fix = FIX.read_text(encoding='utf-8')
    check('修复手册含盘库运营增强章', 'id="stocktake-ops"' in fix and '16.9.8' in fix)
    check('修复手册引用门禁命令', 'verify:print' in fix and 'test:e2e:stocktake' in fix)
    um = USER_MANUAL.read_text(encoding='utf-8')
    check('线上手册源文件含 op-39', 'op-39' in um)
    missing = [s for s in SHOTS if not (ASSETS / s).exists()]
    check('关键截图已落盘', not missing, str(missing))
    check('计划文件含偏差说明区', PLAN.exists() and '偏差说明区' in PLAN.read_text(encoding='utf-8'))
    # 修正（计划 3256 行的正则只匹配 `assets/...`，对线上手册的 `shots/...` 会**空过**＝假 PASS）：
    # 改为**按目录分别解析、分别断言**——修复手册的 `assets/` 对 docs/webadmin-bugfix-manual/assets，
    # 线上手册的 `shots/` 对 src/static/manual/shots。
    gone = sorted({i for i in refs(fix, 'assets') if not (ASSETS / i).exists()}
                  | {i for i in refs(um, 'shots') if not (SHOTS_DIR / i).exists()})
    check('手册引用的截图全部存在', not gone, str(gone[:5]))
    try:
        with urllib.request.urlopen(URL, timeout=30) as r:
            body = r.read().decode('utf-8', 'ignore')
        check('线上手册已含 op-39', 'op-39' in body, URL)
    except Exception as e:  # noqa: BLE001
        check('线上手册可达', False, '%s %s' % (URL, str(e)[:120]))
    print('\n===== 文档门禁：%s（失败 %d）=====' % ('PASS' if not FAILS else 'FAIL', len(FAILS)))
    for f in FAILS:
        print('  -', f)
    raise SystemExit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
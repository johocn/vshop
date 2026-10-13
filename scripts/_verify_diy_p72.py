# -*- coding: utf-8 -*-
"""P7.2 七判据回归（v2）：
- 拖拽改用页面内合成 TouchEvent（CDP Input.dispatchTouchEvent 在本环境不送达 canvas，实测 events=[]）
- 几何实测校准：水平两侧扫最外珠像素 R_out=ring+bead，垂直向下扫首珠 u=ring-bead，解方程得 ring/bead
- 几何判据锚定 n=4 / n=8 状态（珠位含 0°/90°/180°，可校准；4 珠大珠会盖满轨道圆，轨道/水印判据移到 8 珠）
- hitBead 语义：落点径向距珠心轨迹线 ≤ 1.6r 即命中 → 落隙插入落点取环内圈（|d-ring|>1.6r）
视口 390x844 dpr=2。运行前提：dev:h5 已在 5180 端口（VITE_API_PROXY=e.joho.cn）。
"""
import math, os, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5180/#/pkg-diy/pages/designer?tenant=default'
SHOTS = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'docs', 'pkg-diy-p7-screens'))
CHROME = 'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
os.makedirs(SHOTS, exist_ok=True)

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS' if ok else 'FAIL'), name, detail)

JS_TOUCH = """(pts) => {
  const cv = document.querySelector('uni-canvas canvas') || document.querySelector('uni-canvas');
  const mk = (x, y) => new Touch({ identifier: 1, target: cv, clientX: x, clientY: y });
  const fire = (type, ts, cts) => cv.dispatchEvent(new TouchEvent(type,
      { touches: ts, targetTouches: ts, changedTouches: cts, bubbles: true, cancelable: true, composed: true }));
  const t0 = mk(pts[0][0], pts[0][1]);
  fire('touchstart', [t0], [t0]);
  for (let k = 1; k < pts.length; k++) {
    const t = mk(pts[k][0], pts[k][1]);
    fire('touchmove', [t], [t]);
  }
  return pts.length;
}"""

JS_TOUCH_END = """() => {
  const cv = document.querySelector('uni-canvas canvas') || document.querySelector('uni-canvas');
  cv.dispatchEvent(new TouchEvent('touchend',
      { touches: [], targetTouches: [], changedTouches: [], bubbles: true, cancelable: true, composed: true }));
}"""

def line(x0, y0, x1, y1, steps=12):
    return [[x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps] for k in range(steps + 1)]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                                  has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.goto(BASE, wait_until='networkidle')
        page.wait_for_timeout(1500)
        if 'guide' in page.url:
            page.goto(BASE, wait_until='networkidle')
            page.wait_for_timeout(1500)
        page.wait_for_selector('.mat-panel__item', timeout=25000)
        page.wait_for_timeout(800)

        def strip_colors():
            return page.evaluate("[...document.querySelectorAll('.seq-strip__dot')].map(e => e.style.background)")

        def cv_el():
            el = page.query_selector('uni-canvas canvas')
            assert el, 'canvas not found'
            return el

        # ---------- 判据 7：bbox 居中（画布相对预览容器水平居中） ----------
        bbox = cv_el().bounding_box()
        prev_bbox = page.query_selector('.designer__preview').bounding_box()
        cc, pc = bbox['x'] + bbox['width'] / 2, prev_bbox['x'] + prev_bbox['width'] / 2
        check('bbox-centered', abs(cc - pc) <= 2, f'canvas={cc:.1f} container={pc:.1f}')

        def center():
            b = cv_el().bounding_box()
            return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2

        # ---------- 合成事件自检（防止再次静默不送达） ----------
        fired = page.evaluate("""() => {
            const cv = document.querySelector('uni-canvas canvas');
            let n = 0;
            cv.addEventListener('touchstart', () => n++, { once: true, capture: true });
            const t = new Touch({ identifier: 9, target: cv, clientX: 10, clientY: 10 });
            cv.dispatchEvent(new TouchEvent('touchstart',
                { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
            return n;
        }""")
        assert fired == 1, f'合成 TouchEvent 未到达 canvas（fired={fired}）'

        def drag(pts, hold=False):
            page.evaluate(JS_TOUCH, pts)
            if hold:
                return
            page.evaluate(JS_TOUCH_END)
            page.wait_for_timeout(260)

        # ---------- 组序列 A,A,B,B（异色素材；误选同色则撤销） ----------
        items = page.query_selector_all('.mat-panel__item')
        assert len(items) >= 2, 'panel items < 2'
        def card_tap(i):
            page.tap(f'.mat-panel__item >> nth={i}')
            page.wait_for_timeout(260)
        def undo_last():
            page.tap(f'.seq-strip__cell >> nth={len(strip_colors()) - 1}')
            page.wait_for_timeout(500)
            btn = page.query_selector('.uni-modal__btn >> nth=-1')
            if btn:
                btn.tap()
            page.wait_for_timeout(350)

        card_tap(0); card_tap(0)
        colors2 = strip_colors()
        assert len(colors2) == 2, f'append A failed: {len(colors2)}'
        color_a = colors2[0]
        color_b, idx_b = None, -1
        for i in range(1, len(items)):
            card_tap(i)
            cs = strip_colors()
            if len(cs) == 3 and cs[2] != color_a:
                color_b, idx_b = cs[2], i
                break
            undo_last()
        if color_b is None:
            check('setup-two-materials', False, '未找到与 A 异色的素材卡')
            browser.close(); _summary(); return
        card_tap(idx_b)
        page.wait_for_timeout(300)
        seq0 = strip_colors()
        assert seq0 == [color_a, color_a, color_b, color_b], f'seq0={seq0}'

        # ---------- 实测几何校准（n=4） ----------
        # 注意：元素截图是元素相对坐标（图左上角=画布左上角），扫描一律用图心，禁止混用视口 bbox
        from PIL import Image
        def calibrate(tag):
            b = cv_el().bounding_box()
            tmp = os.path.join(tempfile.gettempdir(), f'_cal_{tag}.png')
            cv_el().screenshot(path=tmp)
            img = Image.open(tmp).convert('RGB')
            s = img.width / b['width']
            bg = img.getpixel((4, 4))
            def diff(p, q):
                return max(abs(a - b2) for a, b2 in zip(p, q))
            yc, xc = img.height // 2, img.width // 2
            xr = xl = None
            for x in range(img.width - 3, xc, -1):
                if diff(img.getpixel((x, yc)), bg) > 25:
                    xr = x; break
            for x in range(3, xc):
                if diff(img.getpixel((x, yc)), bg) > 25:
                    xl = x; break
            yd = None
            for yy in range(yc + int(12 * s), img.height - 2):
                if diff(img.getpixel((xc, yy)), bg) > 32:
                    yd = yy; break
            assert xr and xl and yd, f'scan fail xr={xr} xl={xl} yd={yd}'
            r_out = (xr - xl) / 2 / s          # ring + bead
            u = (yd - img.height / 2) / s      # ring - bead
            ring, bead = (r_out + u) / 2, (r_out - u) / 2
            print(f'  [cal {tag}] ring={ring:.1f} bead={bead:.1f} (R_out={r_out:.1f} u={u:.1f})')
            return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2, ring, bead

        cx, cy, ring4, bead4 = calibrate('n4')

        # ---------- 判据 4a：swap 实时预览（hold 截图）+ 判据 1：swap（0↔3） ----------
        drag(line(cx, cy - ring4, cx - ring4, cy), hold=True)
        page.wait_for_timeout(150)
        shot_swap = os.path.join(SHOTS, 'p72-swap-preview.png')
        cv_el().screenshot(path=shot_swap)
        page.evaluate(JS_TOUCH_END)
        page.wait_for_timeout(260)
        seq1 = strip_colors()
        check('swap', seq1 == [color_b, color_a, color_b, color_a], f'seq={seq1}')

        # ---------- 判据 1 复核：swap-2（0↔1） ----------
        drag(line(cx, cy - ring4, cx + ring4, cy))
        seq2 = strip_colors()
        check('swap-2', seq2 == [color_a, color_b, color_b, color_a], f'seq={seq2}')

        # ---------- 判据 3：出环删除（底部珠 i2 → 下方出环） ----------
        drag(line(cx, cy + ring4, cx, cy + ring4 * 1.9))
        seq3 = strip_colors()
        check('remove', len(seq3) == 3, f'{len(seq0)}->{len(seq3)} seq={seq3}')

        # ---------- 判据 5：常驻面板（追加/角标/分类/搜索） ----------
        panel = page.query_selector('.mat-panel')
        pb = panel.bounding_box()
        check('panel-visible', pb and pb['y'] >= 0 and pb['y'] + pb['height'] <= 845 and pb['height'] > 100,
              f"y={pb['y']:.0f} h={pb['height']:.0f}")
        len_before = len(strip_colors())
        card_tap(0)
        check('panel-append', len(strip_colors()) == len_before + 1)
        qx = page.eval_on_selector_all('.mat-panel__qx', "els => els.map(e => e.textContent.trim())")
        check('panel-badge', any(q.startswith('×') and q != '×1' for q in qx), f'qx={qx}')
        n_all = page.eval_on_selector_all('.mat-panel__item', 'els => els.length')
        cats = page.query_selector_all('.mat-panel__cat')
        if len(cats) > 1:
            page.tap('.mat-panel__cat >> nth=1')
            page.wait_for_timeout(300)
            n_cat = page.eval_on_selector_all('.mat-panel__item', 'els => els.length')
            check('panel-cat', n_cat <= n_all, f'{n_all}->{n_cat}')
            page.tap('.mat-panel__cat >> nth=0')
            page.wait_for_timeout(200)
        else:
            check('panel-cat', True, 'no categories, skip')
        page.fill('.mat-panel__search input', 'ZZZZ')
        page.wait_for_timeout(300)
        check('panel-search', page.query_selector('.mat-panel__empty') is not None)
        page.fill('.mat-panel__search input', '')
        page.wait_for_timeout(200)

        # ---------- 补到 8 珠 ----------
        for _ in range(4):
            card_tap(0)
        seq8 = strip_colors()
        assert len(seq8) == 8, f'append to 8 failed: {len(seq8)}'

        # ---------- 判据 2：落隙插入（8 珠校准；珠1(-45°) → 环内圈 70° 方向） ----------
        cx, cy, ring8, bead8 = calibrate('n8')
        b1 = (cx + ring8 * math.cos(-math.pi / 4), cy + ring8 * math.sin(-math.pi / 4))
        d_in = ring8 - 1.6 * bead8 - 10
        drop = (cx + d_in * math.cos(math.radians(70)), cy + d_in * math.sin(math.radians(70)))
        drag(line(b1[0], b1[1], drop[0], drop[1]), hold=True)
        page.wait_for_timeout(150)
        shot_ins = os.path.join(SHOTS, 'p72-insert-preview.png')
        cv_el().screenshot(path=shot_ins)
        page.evaluate(JS_TOUCH_END)
        page.wait_for_timeout(260)
        seq9 = strip_colors()
        expect9 = [color_a] * 4 + [color_b] + [color_a] * 3
        check('insert', seq9 == expect9, f'seq={seq9}')

        # ---------- 判据 6：轨道圆 + 水印（8 珠安静态像素，元素相对坐标） ----------
        shot_wm = os.path.join(SHOTS, 'p72-canvas-watermark.png')
        b8 = cv_el().bounding_box()
        cv_el().screenshot(path=shot_wm)
        img = Image.open(shot_wm).convert('RGB')
        s8 = img.width / b8['width']
        bg8 = img.getpixel((4, 4))
        bg_lum = sum(bg8) / 3
        ex, ey = b8['width'] / 2, b8['height'] / 2   # 画布中心（元素坐标）
        def px(x, y):
            return img.getpixel((min(max(int(x * s8), 0), img.width - 1),
                                 min(max(int(y * s8), 0), img.height - 1)))
        ok_track, trk = False, None
        for k in range(8):
            ang = math.radians(22.5 + 45 * k)
            tx, ty = ex + ring8 * math.cos(ang), ey + ring8 * math.sin(ang)
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    r0, g0, b0 = px(tx + ddx, ty + ddy)
                    lum = (r0 + g0 + b0) / 3
                    if max(r0, g0, b0) - min(r0, g0, b0) <= 6 and 200 <= lum <= 250 and abs(lum - bg_lum) >= 4:
                        ok_track, trk = True, (r0, g0, b0, f'{22.5 + 45 * k:.0f}deg')
                        break
                if ok_track: break
            if ok_track: break
        check('track-circle', ok_track, f'px={trk}')
        cnt = 0
        for dx in range(-20, 21, 2):
            for dy in range(-20, 21, 2):
                r0, g0, b0 = px(ex + dx, ey + dy)
                lum = (r0 + g0 + b0) / 3
                if 200 <= lum <= 248:
                    cnt += 1
        check('watermark', cnt > 20, f'dark={cnt}')

        # ---------- 判据 4b：delete 红圈预览（hold 截图）+ 8→7 ----------
        b4 = (cx, cy + ring8)
        drop_y = cy + min(ring8 * 1.9, b8['height'] / 2 - 6)
        drag(line(b4[0], b4[1], b4[0], drop_y), hold=True)
        page.wait_for_timeout(150)
        shot_del = os.path.join(SHOTS, 'p72-delete-preview.png')
        cv_el().screenshot(path=shot_del)
        page.evaluate(JS_TOUCH_END)
        page.wait_for_timeout(260)
        check('remove-after-preview', len(strip_colors()) == 7, f"8->{len(strip_colors())}")

        # ---------- 附加：非 free 摘要条 + 浮层 ----------
        page.tap('.mode-chips__chip >> nth=0')  # 定手围
        page.wait_for_timeout(450)
        summary = page.query_selector('.designer__summary')
        check('summary-bar', summary is not None and summary.is_visible())
        if summary:
            summary.tap(); page.wait_for_timeout(450)
            sheet = page.query_selector('.designer__sheet-panel')
            check('params-sheet', sheet is not None and sheet.is_visible())
            page.screenshot(path=os.path.join(SHOTS, 'p72-summary-sheet.png'))
            page.tap('.designer__sheet-mask')
            page.wait_for_timeout(300)
        page.tap('.mode-chips__chip >> nth=3')  # 回直觉流
        page.wait_for_timeout(350)

        # ---------- 截图（全景） ----------
        page.screenshot(path=os.path.join(SHOTS, 'p72-designer-full.png'))
        browser.close()
    _summary()

def _summary():
    fails = [r for r in results if not r[1]]
    print(f'\n== {len(results) - len(fails)}/{len(results)} PASS ==')
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()

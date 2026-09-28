# -*- coding: utf-8 -*-
"""2026-09-28 审查修复取证：web-admin / vshop 受保护页进入即鉴权（未登录深链被拦）。
手机视口 390x844 dpr=2。静态服务：web-admin 8090（base /guanli/）、vshop 8091。无后端，仅验证前端守卫。
"""
import os
from playwright.sync_api import sync_playwright

OUT = r"d:\zhao\vshop\e2e-shots"
os.makedirs(OUT, exist_ok=True)


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # ── web-admin：base /guanli/，深链受保护页 → 应被守卫 reLaunch 到登录页 ──
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        locale="zh-CN", is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    # 静态服务根目录不含 /guanli/ 前缀，重写请求路径以匹配构建 base
    pg.route("**/guanli/**", lambda route: route.continue_(
        url=route.request.url.replace("/guanli/", "/", 1)))
    try:
        pg.goto("http://127.0.0.1:8090/guanli/#/pages/pickup/index",
                timeout=60000, wait_until="domcontentloaded")
        pg.wait_for_timeout(4000)
        body = pg.inner_text("body")
        print("[web-admin] url=", pg.url)
        print("[web-admin] 含登录字样=", "登录" in body, "| body前80=", repr(body[:80]))
        if errs:
            print("[web-admin] pageerror=", errs[:2])
        shot(pg, "audit-webadmin-guard-pickup.png")
    except Exception as e:
        print("[web-admin] FAIL:", e)
    ctx.close()

    # ── vshop：深链 admin 管理页 → requireAdmin 未登录 → toast + reLaunch 首页 ──
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        locale="zh-CN", is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    try:
        pg.goto("http://127.0.0.1:8091/", timeout=60000, wait_until="domcontentloaded")
        pg.wait_for_timeout(1500)
        pg.goto("http://127.0.0.1:8091/#/pages/admin/distribution-settle",
                timeout=60000, wait_until="domcontentloaded")
        pg.wait_for_timeout(700)          # 抢在 1200ms 重定向前截 toast
        shot(pg, "audit-vshop-guard-admin-toast.png")
        print("[vshop] toast阶段 url=", pg.url)
        pg.wait_for_timeout(3000)
        shot(pg, "audit-vshop-guard-admin-redirected.png")
        print("[vshop] 重定向后 url=", pg.url)
    except Exception as e:
        print("[vshop] FAIL:", e)
    ctx.close()
    b.close()
print("DONE")

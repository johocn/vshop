# -*- coding: utf-8 -*-
"""2026-10-17 功能页六项手机截图（vshop）：搜索/足迹/签到/忘记密码/好友拼单/售后快递选择。

手机视口 390x844 dpr=2。dev:h5(5180) → 本地 vendure shop-api(3000)。
造数已完成：拼团活动 17（active）、售后单 32（Approved）、商品 slug nongfu-spring-water。
"""
import os

from playwright.sync_api import sync_playwright

OUT = r"d:\zhao\vshop\e2e-shots"
BASE = "http://localhost:5180"
TOKEN = "74d59cc56485ef67e6d8e528d79a023b43cab7cec23a932de7bb4958b835e456"
UID = "37"

os.makedirs(OUT, exist_ok=True)


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def goto(pg, route, wait_text, timeout=45000):
    url = BASE + "/#" + route
    pg.goto(url, timeout=90000, wait_until="domcontentloaded")
    try:
        pg.wait_for_selector(f"text={wait_text}", timeout=timeout)
        print("page ok:", route)
    except Exception as e:
        print("WARN wait_text not found:", route, wait_text, repr(e)[:160])
    pg.wait_for_timeout(1500)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            locale="zh-CN", is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(repr(e)))

        # 首页预热 + 注入登录态（uni.setStorageSync 与页面读取 key 一致）
        pg.goto(BASE + "/", timeout=90000, wait_until="domcontentloaded")
        pg.wait_for_timeout(6000)
        pg.evaluate(
            """([t, uid]) => {
                const set = (k, v) => { if (window.uni && uni.setStorageSync) uni.setStorageSync(k, v); else localStorage.setItem(k, v); };
                set('auth_token', t); set('auth_userId', uid); set('vendure_session_token', t);
            }""",
            [TOKEN, UID],
        )
        print("auth injected")

        # 1. 搜索页（历史+热词默认态）
        goto(pg, "/pkg-product/pages/search/index", "热门搜索")
        pg.wait_for_timeout(1000)
        shot(pg, "feat-search.png")

        # 2. 足迹页：先逛详情（自动记录），再进足迹列表
        goto(pg, "/pkg-product/pages/detail?slug=nongfu-spring-water", "农夫山泉")
        pg.wait_for_timeout(1500)
        goto(pg, "/pkg-user/pages/browsing/index", "农夫山泉")
        pg.wait_for_timeout(1000)
        shot(pg, "feat-browsing.png")

        # 3. 签到页：点「立即签到」出成功态
        goto(pg, "/pkg-user/pages/sign/index", "立即签到")
        try:
            pg.click("text=立即签到", timeout=8000)
            pg.wait_for_timeout(2500)
            print("checkin clicked")
        except Exception as e:
            print("WARN checkin click failed:", repr(e)[:160])
        shot(pg, "feat-sign.png")

        # 4. 忘记密码页（填手机号，不发送验证码）
        goto(pg, "/pages/login/forgot-password", "验证码", timeout=60000)
        try:
            pg.locator("input").first.fill("13800003333")
            pg.wait_for_timeout(600)
        except Exception as e:
            print("WARN fill phone failed:", repr(e)[:160])
        shot(pg, "feat-forgot.png")

        # 5. 好友拼单页（活动 17）
        goto(pg, "/pkg-promotion/pages/group-join?activityId=17", "参与拼单")
        pg.wait_for_timeout(1200)
        shot(pg, "feat-group-join.png")

        # 6. 售后详情页：展开快递公司选择弹层
        goto(pg, "/pkg-after-sale/pages/detail?id=32", "售后", timeout=60000)
        opened = False
        for sel in ["text=请选择快递公司", ".picker", "text=选择快递公司"]:
            try:
                pg.click(sel, timeout=5000)
                pg.wait_for_timeout(1200)
                opened = True
                print("picker opened via", sel)
                break
            except Exception:
                continue
        if not opened:
            print("WARN picker not opened, shoot form state")
        shot(pg, "feat-aftersale.png")

        if errs:
            print("pageerror=", errs[:3])
        ctx.close()
        b.close()
    print("DONE")


if __name__ == "__main__":
    main()

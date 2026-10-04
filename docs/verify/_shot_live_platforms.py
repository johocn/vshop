# -*- coding: utf-8 -*-
"""2026-10-04 直播多平台分发取证（Task 8）。手机视口 390x844 dpr=2。

覆盖：① 形态一 pill 行（抖音+视频号）② 视频号 H5 引导弹层 ③ 复制视频号名 toast
④ 形态二 ended+platforms → 海报+前往按钮 ⑤ 无 platforms 回归（直播已结束）
⑥ hls.js fatal error → 重试 UI（假播放地址真实失败）。
数据准备：_prep_live_platforms.py（房间1=live+双平台，房间2=ended+视频号，房间3=ended无平台）。
"""
import os
import sys

from playwright.sync_api import sync_playwright

OUT = r"e:\zhao\vshop\docs\verify"
URL = "https://e.joho.cn/#/pkg-promotion/pages/live-room?id={rid}"

fails = []


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        fails.append(label)


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def open_room(b, rid):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                        locale="zh-CN", is_mobile=True, has_touch=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    pg.goto(URL.format(rid=rid), timeout=60000, wait_until="load")
    pg.wait_for_timeout(6000)
    return ctx, pg


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)

        # ===== 房间1：形态一（live + douyin + wechat_channels） =====
        ctx1, pg = open_room(b, 1)

        # ① pill 行
        pg.wait_for_selector(".pill.p-wechat_channels", state="visible", timeout=15000)
        pills = pg.inner_text(".pills")
        check("抖音" in pills and "视频号" in pills, "形态一 pill 行显示 抖音+视频号")
        shot(pg, "live-plat-01-pills.png")

        # ② 视频号 → H5 引导弹层
        pg.click(".pill.p-wechat_channels")
        pg.wait_for_selector(".sheet", state="visible", timeout=5000)
        name_txt = pg.inner_text(".sheet-name").strip()
        check(name_txt == "@johocn_shop", "视频号弹层显示 @johocn_shop（实际 %r）" % name_txt)
        shot(pg, "live-plat-02-wxsheet.png")

        # ③ 复制 toast
        pg.click(".sheet-btn")
        pg.wait_for_timeout(800)
        toast_ok = pg.locator("text=视频号名已复制").count() > 0
        check(toast_ok, "复制视频号名 toast 出现")
        shot(pg, "live-plat-03-toast.png")

        # ⑥ hls fatal → 重试 UI（房间1 假播放地址）
        pg.click(".sheet-x")  # 关弹层
        try:
            pg.wait_for_selector(".retry", state="visible", timeout=30000)
            retry_txt = pg.inner_text(".retry")
            check("重试" in retry_txt, "hls 失败显示重试 UI（%r）" % retry_txt.strip())
        except Exception:
            check(False, "hls 失败显示重试 UI（30s 未出现）")
        shot(pg, "live-plat-06-retry.png")
        ctx1.close()

        # ===== 房间2：形态二（ended + wechat_channels） =====
        ctx2, pg2 = open_room(b, 2)
        try:
            pg2.wait_for_selector(".go-btn", state="visible", timeout=15000)
            go_txt = pg2.inner_text(".go-btn")
            check("前往视频号观看" in go_txt, "形态二 go-btn 显示（%r）" % go_txt)
            cover = pg2.locator(".no-live-cover").count()
            print("cover count =", cover)
        except Exception:
            check(False, "形态二 go-btn 未出现")
        shot(pg2, "live-plat-04-form2-gobtn.png")
        ctx2.close()

        # ===== 房间3：无 platforms 回归 =====
        ctx3, pg3 = open_room(b, 3)
        pg3.wait_for_timeout(2000)
        try:
            txt = pg3.inner_text(".no-live")
            check("直播已结束" in txt, "无 platforms 回归显示 直播已结束（%r）" % txt.strip())
            check(pg3.locator(".go-btn").count() == 0, "无 platforms 不出现 go-btn")
            check(pg3.locator(".pills").count() == 0, "无 platforms 不出现 pills")
        except Exception:
            check(False, "无 platforms 回归文案未找到")
        shot(pg3, "live-plat-05-plain-ended.png")
        ctx3.close()

        b.close()

    print("\n==== SUMMARY ====")
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()

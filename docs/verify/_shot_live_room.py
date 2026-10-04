# -*- coding: utf-8 -*-
"""2026-10-04 直播互动双端联调取证（Task 8）。

手机视口 390x844 dpr=2 × 两个独立上下文，进同一直播间（e.joho.cn 房间 1）。
覆盖：① 在线数徽标（1→2）② A 发弹幕 B 实时收到 ③ 历史回显 ④ B 点赞 A 收到聚合+心形动效
⑤ 浏览器真实点击限频（3 连发 → sys 提示）。篡改票/协议层限频见 test/live-negative.mjs（NEG1/NEG2 PASS）。
"""
import os
import sys

from playwright.sync_api import sync_playwright

OUT = r"e:\zhao\vshop\docs\verify"
URL = "https://e.joho.cn/#/pkg-promotion/pages/live-room?id=1"

os.makedirs(OUT, exist_ok=True)
fails = []


def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        fails.append(label)


def shot(pg, name):
    path = os.path.join(OUT, name)
    pg.screenshot(path=path)
    print("saved", path)


def online(pg):
    try:
        return pg.inner_text(".h-online")
    except Exception:
        return "(无徽标)"


def danmaku_text(pg):
    try:
        return pg.inner_text(".danmaku")
    except Exception:
        return ""


def send(pg, text):
    pg.fill(".actions input", text)
    pg.wait_for_timeout(150)
    pg.click("text=发送")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        mkctx = lambda: b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                      locale="zh-CN", is_mobile=True, has_touch=True)
        ctxA = mkctx()
        ctxB = mkctx()
        pgA = ctxA.new_page()
        pgB = ctxB.new_page()

        # --- A 进房 ---
        pgA.goto(URL, timeout=60000, wait_until="load")
        pgA.wait_for_timeout(6000)
        print("A url=", pgA.url)
        print("A online=", online(pgA))
        shot(pgA, "live-00-a-enter.png")

        # --- B 进房，在线数应变为 2 ---
        pgB.goto(URL, timeout=60000, wait_until="load")
        pgB.wait_for_timeout(6000)
        pgA.wait_for_timeout(1500)
        oa, ob = online(pgA), online(pgB)
        print("A online=", oa, "| B online=", ob)
        check("2 人在看" in oa, "A 在线数徽标变 2（广播）")
        check("2 人在看" in ob, "B 在线数徽标 2")

        # --- A 发弹幕 → B 实时收到（同时验证历史回显：B 进房即见既有历史）---
        pre_b = danmaku_text(pgB)
        print("B 历史回显=", repr(pre_b[:80]))
        check("hello-live" in pre_b or len(pre_b) > 0, "B 进房历史回显非空")
        send(pgA, "大家好，欢迎来到直播间")
        pgB.wait_for_timeout(2000)
        check("大家好" in danmaku_text(pgB), "B 实时收到 A 的弹幕")
        shot(pgB, "live-01-b-received.png")

        # --- B 点赞 → A 收到 like 聚合 + 心形动效 ---
        before_a = online(pgA)
        pgB.click("text=赞")
        pgA.wait_for_timeout(500)   # like 聚合 1s 窗口，先截心形
        shot(pgA, "live-02-a-hearts.png")
        pgA.wait_for_timeout(1500)
        print("A 点赞区=", repr(pgA.inner_text(".like-wrap")))
        check("♥" in pgA.inner_text(".like-wrap") or "赞" in pgA.inner_text(".like-wrap"), "A 收到点赞")

        # --- 限频：A 快速 3 连发 → 第 2 条起限频 + sys 提示 ---
        for t in ("连发一", "连发二", "连发三"):
            send(pgA, t)
        pgA.wait_for_timeout(1200)
        try:
            tip = pgA.inner_text(".sys-tip")
        except Exception:
            tip = "(无 sys 提示)"
        print("A sys tip=", repr(tip))
        check("太快" in tip, "浏览器真实点击触发限频 sys 提示")
        shot(pgA, "live-03-a-ratelimit.png")

        # --- 最终全景截图 ---
        shot(pgA, "live-04-a-final.png")
        shot(pgB, "live-05-b-final.png")

        ctxA.close()
        ctxB.close()
        b.close()

    print("\n==== SUMMARY ====")
    if fails:
        print("FAILED:", fails)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()

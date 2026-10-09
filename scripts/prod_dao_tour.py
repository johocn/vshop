# -*- coding: utf-8 -*-
# 线上医生账号(dao)全页面巡检：SSO 登录 → 首页/规划/随访/病志 截图
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent.parent / "docs" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ("#/pages/home/index", "14-prod-dao-home"),
    ("#/pages/plan/list", "15-prod-dao-plans"),
    ("#/pages/followup/list", "16-prod-dao-followups"),
    ("#/pages/record/list", "17-prod-dao-records"),
]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
        )
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto("https://e.joho.cn/workbench/", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        if "h.joho.cn" in page.url:
            inputs = page.locator("uni-input input")
            await inputs.nth(0).fill("dao")
            await inputs.nth(1).fill("a963963")
            await page.locator("uni-button", has_text="登录").first.click()
            for _ in range(30):
                await page.wait_for_timeout(1000)
                if "e.joho.cn/workbench" in page.url and "auth-callback" not in page.url:
                    break
            await page.wait_for_timeout(2500)
        print("LOGGED_IN:", page.url)

        ok_all = True
        for route, shot in ROUTES:
            await page.evaluate(f"location.hash = '{route}'")
            await page.wait_for_timeout(2200)
            body = await page.inner_text("body")
            empty = "暂无数据" in body
            await page.screenshot(path=str(SHOTS / f"{shot}.png"))
            print(f"PAGE {route}: empty={empty} snippet={body[:90].replace(chr(10), ' | ')}")
            ok_all = ok_all and not empty
        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:5]:
            print("  -", e[:150])
        print("RESULT:", "PASS" if ok_all else "CHECK")
        await browser.close()
        sys.exit(0)


asyncio.run(main())

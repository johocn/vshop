# -*- coding: utf-8 -*-
# 线上真实 SSO 登录闭环冒烟：workbench → 星枢通行(etao) → 回跳换会话 → 首页
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent.parent / "docs" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)


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
        url1 = page.url
        print("STEP1:", url1)
        await page.screenshot(path=str(SHOTS / "12-prod-sso-redirect.png"))

        # SSO 统一登录页：账号密码表单（uni-app h5 placeholder 渲染为 div）
        inputs = page.locator("uni-input input")
        await inputs.nth(0).fill("etao")
        await inputs.nth(1).fill("a963963")
        btn = page.locator("uni-button", has_text="登录").first
        await btn.click()
        print("STEP2: submitted, waiting for workbench callback...")
        for _ in range(30):
            await page.wait_for_timeout(1000)
            if "e.joho.cn/workbench" in page.url and "auth-callback" not in page.url:
                break
        await page.wait_for_timeout(2500)
        url2 = page.url
        print("STEP3:", url2)
        body = await page.inner_text("body")
        has_err = any(k in body for k in ("报错", "失败", "错误", "Error", "失败"))
        print("PAGE_SNIPPET:", body[:220].replace("\n", " | "))
        print("HAS_ERROR_TEXT:", has_err)
        await page.screenshot(path=str(SHOTS / "13-prod-login-success.png"))
        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:5]:
            print("  -", e[:150])
        await browser.close()
        ok = "e.joho.cn/workbench" in url2 and "sso/login" not in url2
        print("RESULT:", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


asyncio.run(main())

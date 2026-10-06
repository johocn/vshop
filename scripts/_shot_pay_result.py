# -*- coding: utf-8 -*-
"""pay-result 页手机视口截图验证（390x844, dpr=2）
mock /shop-api 的 orderByCode 响应，验证三种状态：pending / success / timeout
用法: python scripts/_shot_pay_result.py
"""
import asyncio
import json
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from playwright.async_api import async_playwright

BASE = "http://localhost:5180"
OUT = "docs/screenshots"


def make_route_handler(state: str | None):
    """state=None 时中断请求（模拟网络失败触发超时路径）"""

    async def handler(route):
        body = route.request.post_data or ""
        if "orderByCode" in body:
            if state is None:
                await route.abort()
                return
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"data": {"orderByCode": {"id": "1", "code": "TEST100", "state": state}}}),
            )
        else:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps({"data": {}}))

    return handler


async def shot(ctx, url, path, wait_ms):
    # uni-app 为 SPA：同页面 hash query 变化不会重新 onLoad，必须每个场景开新 page
    page = await ctx.new_page()
    await page.goto(url, wait_until="domcontentloaded")
    await page.wait_for_timeout(wait_ms)
    await page.screenshot(path=path, full_page=True)
    print("saved:", path)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )

        # 1. pending：订单未结算
        await ctx.route("**/shop-api", make_route_handler("ArrangingPayment"))
        await shot(ctx, f"{BASE}/#/pkg-order/pages/pay-result?code=TEST100", f"{OUT}/pay-result-pending.png", 1800)

        # 2. success：订单已结算（轮询 3s 后判定）
        await ctx.unroute("**/shop-api")
        await ctx.route("**/shop-api", make_route_handler("PaymentSettled"))
        await shot(ctx, f"{BASE}/#/pkg-order/pages/pay-result?code=TEST100", f"{OUT}/pay-result-success.png", 5000)

        # 3. timeout：查询失败 60s 后进入「支付确认中」
        await ctx.unroute("**/shop-api")
        await ctx.route("**/shop-api", make_route_handler(None))
        await shot(ctx, f"{BASE}/#/pkg-order/pages/pay-result?code=TEST404", f"{OUT}/pay-result-timeout.png", 66000)

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

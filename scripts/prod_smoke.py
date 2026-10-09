# 线上冒烟：手机视口访问 /workbench/，校验 SSO 守卫重定向，并截图留档
# 用法：python scripts/prod_smoke.py [site_url]
import sys
from playwright.sync_api import sync_playwright

SITE = sys.argv[1] if len(sys.argv) > 1 else "https://e.joho.cn/workbench/"
OUT = "docs/shots/12-prod-sso-redirect.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    )
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(SITE, wait_until="networkidle", timeout=30000)
    url = page.url
    print("final-url:", url)
    assert "pages/sso/login" in url or "h.joho.cn" in url, f"未重定向到 SSO 登录页：{url}"
    assert "app_code=tcm-workbench" in url, "缺少 app_code=tcm-workbench"
    assert "return_url=" in url and "workbench" in url, "缺少 return_url 回跳参数"
    page.screenshot(path=OUT, full_page=True)
    print("screenshot:", OUT)
    print("console-errors:", len(errors))
    for e in errors[:5]:
        print("  -", e)
    browser.close()
print("SMOKE OK")

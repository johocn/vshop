# -*- coding: utf-8 -*-
"""三件套样板用例：演示「回归断言 + 手机截图 + 手册生成」完整流程（只读，不落生产写操作）。

本用例演示：后台登录 + 打开平台租户页 + 打开超级管理员仪表盘，分步截图并生成 md。
新功能复用此骨架时，仅需替换「第 3 步(回归断言)」与「你要访问的页面路由/步骤」。
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from skeleton import Manual, mobile_context
# 导入留待骨架已把 playwright/ 加入 sys.path，随后导入 login_util
from login_util import admin_login_state, _admin_gql          # noqa: E402

CASE_ID = "example-demo"
TITLE = "示例：后台登录 + 仪表盘手机截图"
APP = "https://e.joho.cn/guanli/"

# 登录态（只读演示用官方默认店铺）
STATE = admin_login_state("superadmin", "z123123", channel_code=None)
AUTH = STATE["auth_token"]
print("登录成功 channel=", STATE["channel_code"], "superadmin=", STATE["is_superadmin"])


def main():
    from playwright.sync_api import sync_playwright

    manual = Manual(CASE_ID, TITLE, app=APP)

    # ① 回归断言：读 Admin API 确认后端就绪（只读）
    try:
        n = _admin_gql(AUTH, "query { tenants(options:{skip:0 take:1}){ totalItems } }")["tenants"]["totalItems"]
        manual.note(f"- **① 回归断言**：`tenants.totalItems` 查询成功（当前官方视角租户数 `{n}`）。")
    except Exception as e:
        manual.fail(f"回归断言失败：{e}")

    # ↓↓↓ ②③ 业务步骤：此处填入你要验证的页面/截图（示例只截登录后首屏与租户页）↓↓↓
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        try:
            page = mobile_context(b, STATE, app=APP)
            page.goto(APP, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)
            manual.shot(page, 1, "dashboard", "登录后仪表盘", "用 superadmin 注入登录态，直开后台首屏。")

            page.goto(APP + "#/pages/platform/tenants/index", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2500)
            manual.shot(page, 2, "tenants", "平台租户列表", "手机视口 390×844 @2x。")

            # 示例：叠加一个「读取场景」——这里演示多步截图，生产用例替换为你的真实功能步骤
            page.goto(APP + "#/pages/platform/tenants/index", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(800)
            manual.shot(page, 3, "tenants_scroll", "租户列表（同屏复核）", "演示连续截图登记。")
        finally:
            b.close()
    # ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

    md = manual.save_md()
    print("\n用例结果：", "PASS" if manual.ok else "FAIL")
    print("手册章节：", md)


if __name__ == "__main__":
    main()
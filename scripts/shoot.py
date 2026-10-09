# d:\zhao\tcm-workbench\scripts\shoot.py
# 医生工作台手机视口截图（Playwright 390x844 dpr=2，UI 驱动全流程）
# 运行前提：dev-fixture(3930) + pnpm dev:h5(5177) 已启动
# pip install playwright; playwright install chromium
from playwright.sync_api import sync_playwright
import pathlib
import sys

BASE = "http://localhost:5177/workbench"
OUT = pathlib.Path(__file__).parent.parent / "docs" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

ERRORS = []


def shot(page, name, full=True):
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("shot:", name)


def wait_text(page, text, timeout=20000):
    page.wait_for_selector(f"text={text}", timeout=timeout)


def confirm_picker(page):
    """点击 uni-h5 picker 弹层的确认按钮（该版本文案为“完成”，且各 picker 均内嵌弹层 DOM，需 :visible 过滤）"""
    page.wait_for_timeout(800)
    page.locator(".uni-picker-action-confirm:visible").first.click(timeout=8000)
    page.wait_for_timeout(600)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="zh-CN"
        )
        page = ctx.new_page()
        page.on("pageerror", lambda e: ERRORS.append(f"pageerror: {e}"))
        page.on(
            "console",
            lambda m: ERRORS.append(f"console.{m.type}: {m.text}") if m.type == "error" else None,
        )

        # 登录页
        page.goto(f"{BASE}/#/pages/mock-login/mock-login")
        wait_text(page, "进入工作台")
        shot(page, "00-login")

        # mock 登录
        page.locator(".phone input").fill("13800000001")
        page.get_by_text("进入工作台").click()
        wait_text(page, "李患者", timeout=30000)
        shot(page, "01-home")

        # 新建接诊（选患者）
        page.get_by_text("新建接诊").click()
        wait_text(page, "选择患者")
        shot(page, "02-encounter-create")
        page.get_by_text("李患者").first.click()
        page.wait_for_timeout(400)
        page.get_by_text("建档接诊").click()
        wait_text(page, "主诉", timeout=30000)

        # 流程四步：问诊 → 辨证 → 医嘱 → 完成
        shot(page, "03-flow-step1")
        page.locator("textarea").first.fill("咳嗽三日，恶寒无汗")
        page.get_by_text("确认").first.click()
        page.wait_for_timeout(800)
        page.locator("textarea").first.fill("风寒袭肺证")
        page.get_by_text("确认").first.click()
        wait_text(page, "提交病志")
        shot(page, "04-flow-step3")
        page.locator(".rx-item input").nth(0).fill("荆防败毒散")
        page.locator(".rx-item input").nth(1).fill("7剂")
        page.locator(".rx-item input").nth(2).fill("日一剂")
        page.get_by_text("提交病志").click()
        wait_text(page, "完成接诊", timeout=30000)
        shot(page, "05-flow-step4")
        page.get_by_text("完成接诊").click()
        wait_text(page, "待接诊", timeout=30000)
        page.wait_for_timeout(1500)

        # 康养规划
        page.goto(f"{BASE}/#/pages/plan/list")
        wait_text(page, "新建规划")
        shot(page, "06-plan-list")
        page.get_by_text("新建规划").click()
        page.wait_for_timeout(500)
        # 患者选择 picker：默认第一项即李患者，弹层确定
        page.locator("uni-picker").first.click()
        confirm_picker(page)
        page.locator("input").first.fill("冬季温养方案")
        page.get_by_text("提交").click()
        wait_text(page, "冬季温养方案", timeout=30000)
        page.get_by_text("冬季温养方案").first.click()
        wait_text(page, "添加计划项", timeout=30000)
        shot(page, "07-plan-detail")

        # 计划项
        page.get_by_text("添加计划项").click()
        page.locator("input").nth(0).fill("艾灸足三里")
        page.locator("input").nth(1).fill("每周2次")
        page.get_by_text("提交").click()
        wait_text(page, "艾灸足三里", timeout=30000)

        # 随访（日期 picker 默认今天）
        page.get_by_text("新建随访").click()
        page.locator("input").first.fill("一周后回访")
        page.locator("uni-picker").first.click()
        confirm_picker(page)
        page.get_by_text("提交").click()
        page.wait_for_timeout(1200)
        shot(page, "08-plan-detail-filled")

        # 随访页
        page.goto(f"{BASE}/#/pages/followup/list")
        wait_text(page, "一周后回访", timeout=30000)
        shot(page, "09-followups")

        # 病志
        page.goto(f"{BASE}/#/pages/record/list")
        wait_text(page, "风寒袭肺证", timeout=30000)
        shot(page, "10-records")
        page.get_by_text("风寒袭肺证").first.click()
        wait_text(page, "修改留痕", timeout=30000)
        shot(page, "11-record-detail")

        browser.close()

    if ERRORS:
        print("--- browser errors (first 10) ---")
        for e in ERRORS[:10]:
            print(e)
    print("done ->", OUT)


if __name__ == "__main__":
    sys.exit(main())

# -*- coding: utf-8 -*-
"""侦察：登录超管 -> 抓取租户页/商品审批页 DOM 与截图（webapp-testing: recon-then-action）"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli"
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)

USER = "superadmin"
PWD = "z123123"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=1.5)
    pg.goto(BASE, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(SHOTS, "recon_login.png"), full_page=False)

    # 保存当前页面原始状态
    pg.screenshot(path=os.path.join(SHOTS, "recon_login.png"), full_page=False)
    open(os.path.join(SHOTS, "recon_body0.html"), "w", encoding="utf-8").write(pg.eval_on_selector('html', 'el => el.innerHTML'))
    txt = pg.inner_text('body')
    print("URL:", pg.url)
    print("BODY_TEXT:", txt[:800])
    print("INPUTS:", pg.locator('input').count())

    # 填写登录表单：uni-app 输入框
    pg.wait_for_selector(".uni-input-input", timeout=15000)
    inputs = pg.locator(".uni-input-input")
    inputs.nth(0).fill(USER)
    inputs.nth(1).fill(PWD)
    pg.screenshot(path=os.path.join(SHOTS, "recon_login_filled.png"), full_page=False)
    pg.locator('button:has-text("登 录"), button:has-text("登录")').first.click()
    pg.wait_for_timeout(2500)
    print("AFTER_LOGIN_URL:", pg.url)
    pg.screenshot(path=os.path.join(SHOTS, "recon_after_login.png"), full_page=True)

    # 抓取当前页文本，判断是否落到选店/工作台
    body = pg.eval_on_selector('html', 'el => el.innerHTML')
    open(os.path.join(SHOTS, "recon_body.html"), "w", encoding="utf-8").write(body)
    print("HAS_CHANNEL_SELECT:", "channel-select" in pg.url or "选择" in pg.inner_text('body'))
    print("AFTER_LOGIN_TEXT:", pg.inner_text('body')[:1000])

    b.close()
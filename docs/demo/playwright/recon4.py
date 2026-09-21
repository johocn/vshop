# -*- coding: utf-8 -*-
"""四流对账页手机视口回归：触发今日批 → 390x844@2x 截图（列表 + 明细弹层）"""
import sys, io, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from login_util import admin_login_state, _admin_gql_ch
from playwright.sync_api import sync_playwright

BASE = "https://e.joho.cn/guanli"
RECON_URL = BASE + "/#/pages/platform/reconcile/index"
SHOTS = r"d:\zhao\vshop\web-admin\src\static\manual\shots"

st = admin_login_state("superadmin", "z123123", channel_code="t2")
auth, ch_token, ch_code = st["auth_token"], st["channel_token"], st["channel_code"]
print("channel:", ch_code, "token len:", len(ch_token), "super:", st["is_superadmin"])

# 触发今日对账（幂等：已 done 则返回 null，不影响列表展示）
today = "2026-09-15"
try:
    d = _admin_gql_ch(auth, ch_token, "mutation($d:String!){ runReconciliation(date:$d){ id date status d1Count d2Count d3Count d4Count orderTotal } }", {"d": today})
    print("runReconciliation:", json.dumps(d.get("runReconciliation"), ensure_ascii=False))
except Exception as e:
    print("runReconciliation skip:", e)

# 查看该批次差异行
try:
    lines = _admin_gql_ch(auth, ch_token, "query { reconciliationBatches { id date status d1Count d2Count d3Count d4Count orderTotal } }")
    print("batches:", json.dumps(lines.get("reconciliationBatches"), ensure_ascii=False))
    if lines.get("reconciliationBatches"):
        bid = lines["reconciliationBatches"][0]["id"]
        ls = _admin_gql_ch(auth, ch_token, "query($b:ID!){ reconciliationLines(batchId:$b){ id orderId diffTypes status } }", {"b": bid})
        print("lines:", json.dumps(ls.get("reconciliationLines"), ensure_ascii=False))
except Exception as e:
    print("query batches skip:", e)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    page.evaluate("""(args) => {
        localStorage.setItem('wa_auth_token', args[0]);
        localStorage.setItem('wa_channel_token', args[1]);
        localStorage.setItem('wa_channel_code', args[2]);
        localStorage.setItem('wa_user_id', '1');
    }""", (auth, ch_token, ch_code))
    page.goto(RECON_URL, wait_until="networkidle")
    page.wait_for_timeout(1800)
    body = page.locator("body").inner_text()
    print("PAGE TEXT:", body[:400].replace("\n", " | "))
    page.screenshot(path=os.path.join(SHOTS, "r13_reconcile.png"), full_page=False)
    print("saved r13_reconcile.png")

    cards = page.locator(".card")
    n = cards.count()
    print("cards:", n)
    if n:
        cards.first.click()
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(SHOTS, "r14_reconcile_lines.png"), full_page=False)
        print("saved r14_reconcile_lines.png")
    b.close()

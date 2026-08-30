# -*- coding: utf-8 -*-
"""拆单前置探针3：配送档案可用字段 + t2/t1/default 各渠道的租户默认档案，确认是否具备分箱条件。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

a = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]

def q(query, variables=None, channel_token=None):
    h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}
    if channel_token:
        h["vendure-token"] = channel_token
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode())
    except HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:400]}

# 1) 配送档案完整(合法字段)
r = q("""query{ shippingProfiles{ items{
  id code name isGlobal isTenantDefault enabled
  shippingMethods{ id code name }
  pickupLocations{ id name } } totalItems } }""")
print("=== shippingProfiles ===")
print(json.dumps(r, ensure_ascii=False, indent=1))

# 2) 各渠道视角下的配送方式 + 自提点（判断档案8在那个渠道生效）
for tok, label in [("cnx87ezvmjx8nn3bth6c","default"), ("66ruvnhh34svhckaa2i","t2")]:
    r2 = q("""query{ shippingMethods(options:{skip:0 take:50}){ items{ id code name } } }""", channel_token=tok)
    print(f"--- methods[{label}] ---")
    try:
        for m in r2["data"]["shippingMethods"]["items"]:
            print("   ", m["id"], m["code"], m["name"])
    except Exception:
        print(r2)

# 3) t2 的租户默认档案（通过商品视角间接判断：t2 商品若未绑定默认档案会报错）
r3 = q("""query{ productVariants(options:{skip:0 take:5}){ items{ id sku customFields{ shippingProfileId } } } }""", channel_token="66ruvnhh34svhckaa2i")
print("t2 variants:", json.dumps(r3, ensure_ascii=False))
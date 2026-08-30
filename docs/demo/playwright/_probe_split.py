# -*- coding: utf-8 -*-
"""拆单验证-前置探针：查看新商户商品35的租户/配送配置，以及default商城可拆单的配送方式与跨租户商品。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state, _admin_gql

st = admin_login_state("superadmin", "z123123", channel_code=None)
a = st["auth_token"]

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

# 1) product 35 配置
r = q("""query($id:ID!){ product(id:$id){ id name
  customFields{ merchantRef{ id code } marketplaceStatus listedInMarketplace shippingProfileId paymentProfileId } } }""", {"id":"35"})
print("product35:", json.dumps(r, ensure_ascii=False, indent=2))

# 2) default 商城的配送方式
r2 = q("""query{ shippingMethods(options:{skip:0 take:50}){ items{ id code name } totalItems } }""")
print("shippingMethods:", json.dumps(r2, ensure_ascii=False))

# 3) 支付方式
r3 = q("""query{ paymentMethods(options:{skip:0 take:50}){ items{ id code name } totalItems } }""")
print("paymentMethods:", json.dumps(r3, ensure_ascii=False))

# 4) 租户列表（识别跨租户组合）
r4 = q("""query{ tenants(options:{skip:0 take:50}){ items{ id code token customFields{ shopName tenantNo isOfficial } } totalItems } }""")
print("tenants:", json.dumps(r4, ensure_ascii=False, indent=1))

# 5) 各租户已上架商品（用于组合加购）——default商城视角下 approved 的商品
r5 = q("""query{ products(options:{skip:0 take:60}){ items{ id name customFields{ merchantRef{ id code } marketplaceStatus } } totalItems } }""")
items = r5.get("data",{}).get("products",{}).get("items",[])
print("product35 in default list?")
for p in items:
    if p.get("id") in ("35","3","1","2","29"):
        print("  ", p["id"], p["name"], (p.get("customFields") or {}).get("marketplaceStatus"), (p.get("customFields") or {}).get("merchantRef",{}).get("code"))
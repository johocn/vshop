# -*- coding: utf-8 -*-
"""拆单前置探针2：确认商家渠道(t2)下 曲奇变体31 的配送档案 vs 其它商品，是否能同一订单触发分箱。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

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

# 1) 所有配送档案（含 ownerChannelId / isGlobal / isTenantDefault / 配送方式 / 自提点）
r = q("""query{ shippingProfiles{ items{
  id code name isGlobal ownerChannelId isTenantDefault enabled
  shippingMethods{ id code name }
  pickupLocations{ id name } } totalItems } }""")
print("=== shippingProfiles ===")
print(json.dumps(r, ensure_ascii=False, indent=1))

# 2) 目标变体配送档案（曲奇31 / 蓝牙6 / 其它 t2 变体）
for vid in ["31", "6"]:
    r2 = q("""query($id:ID!){ productVariant(id:$id){ id sku enabled
        product{ id name }
        customFields{ shippingProfileId } } }""", {"id": vid})
    v = r2.get("data", {}).get("productVariant")
    if v is None:
        print("variant", vid, "not found:", r2)
        continue
    print(f"variant {vid}", v["sku"], v["product"]["name"], "profile=", (v.get("customFields") or {}).get("shippingProfileId"))

# 3) t2 商家渠道视角：变体列表 + 各自档案
print("=== t2 channel variants ===")
r3 = q("""query{ productVariants(options:{skip:0 take:50}){ items{ id sku name
    customFields{ shippingProfileId } product{ id name } } totalItems } }""", channel_token="66ruvnhh34svhckaa2i")
try:
    for v in r3["data"]["productVariants"]["items"]:
        print("  t2-var", v["id"], v["sku"], v["name"], "profile=", (v.get("customFields") or {}).get("shippingProfileId"), "prod=", v["product"]["name"])
except Exception as e:
    print("t2 variants err:", r3, e)
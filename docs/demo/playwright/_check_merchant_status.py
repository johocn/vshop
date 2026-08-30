# -*- coding: utf-8 -*-
"""确认商家商品35(曲奇)在 default 商城的挂牌/审批状态，佐证其可在 default 渠道同单加购。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from login_util import ADMIN_API, admin_login_state

a = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]
def q(query, variables=None, ct=None):
    h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}
    if ct: h["vendure-token"] = ct
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    with urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

r = q("""query($id:ID!){ product(id:$id){ id name enabled
  customFields{ marketplaceStatus listedInMarketplace rejectReason }
  variants{ id sku enabled customFields{ shippingProfileId } } } }""", {"id": "35"})
p = r.get("data", {}).get("product") or {}
print("product35:", json.dumps(p, ensure_ascii=False))
print("listings:", json.dumps(r.get("data",{}).get("product",{}).get("channels") if isinstance(p.get("channels"),list) else "（变体channel需另询）" , ensure_ascii=False))
# -*- coding: utf-8 -*-
"""拆单验证-步骤1：创建自提点配送档案并绑定到新商户商品35的变体31；确认 orderBoxes 分箱。"""
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
            return json.loads(r.read().decode()).get("data") or {}
    except HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:300]}

# 1) create profile bound to pickup-point method 2 (self-pickup point 自提点)
r = q("""mutation($i:CreateShippingProfileInput!){
  createShippingProfile(input:$i){ id code name isTenantDefault isGlobal shippingMethods{ id code } } }""",
      {"i": {"name": "拆单验证-自提点档案", "code": "split-pickup-demo2", "isGlobal": False, "shippingMethodIds": ["2"]}})
print("create profile:", json.dumps(r, ensure_ascii=False))
pid = r.get("createShippingProfile", {}).get("id")
prof = r.get("createShippingProfile", {})

# 2) assign variant 31 -> that profile
r2 = q("""mutation($variantIds:[ID!]!,$profileId:ID!){ assignShippingProfile(variantIds:$variantIds, profileId:$profileId) }""",
       {"variantIds": ["31"], "profileId": pid}) if pid else {}
print("assign:", json.dumps(r2, ensure_ascii=False))

# 3) confirm variant 31 now has profile
r3 = q("""query($id:ID!){ product(id:$id){ id name variants{ id customFields{ shippingProfileId } } } }""", {"id":"35"})
print("product35 after assign:", json.dumps(r3.get("product"), ensure_ascii=False))

# 4) conf profile saved
r4 = q("""query{ shippingProfiles{ items{ id code name isTenantDefault shippingMethods{ id code } } totalItems } }""")
for p in r4.get("shippingProfiles", {}).get("items", []):
    print("  SP", p["id"], p["code"], p.get("name"))
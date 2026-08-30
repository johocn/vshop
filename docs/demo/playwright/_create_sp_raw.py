# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

st = admin_login_state("superadmin", "z123123", channel_code=None)
a = st["auth_token"]
h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}

def raw(query, variables=None):
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    with urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

body = raw("""mutation($i:CreateShippingProfileInput!){
  createShippingProfile(input:$i){ id code name isTenantDefault isGlobal shippingMethods{ id code } } }""",
      {"i": {"name": "拆单验证-自提点档案", "code": "split-pickup-demo3", "description": "拆单验证用：绑定新商户曲奇商品，触发与默认档案分箱", "isGlobal": False, "shippingMethodIds": ["2"]}})
print(json.dumps(body, ensure_ascii=False, indent=2))

# subsequent: assign variant 31
body2 = raw("""mutation($variantIds:[ID!]!,$profileId:ID!){ assignShippingProfile(variantIds:$variantIds, profileId:$profileId) }""",
            {"variantIds": ["31"], "profileId": body.get("data",{}).get("createShippingProfile",{}).get("id")}) if body.get("data") else {}
print("assign:", json.dumps(body2, ensure_ascii=False))

# verify
body3 = raw("""query($id:ID!){ product(id:$id){ id name variants{ id customFields{ shippingProfileId } } } }""", {"id":"35"})
print("product35:", json.dumps(body3.get("data",{}).get("product"), ensure_ascii=False))
# -*- coding: utf-8 -*-
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

# 1) shipping profiles
sp = q("""query{ shippingProfiles{ items{ id name isGlobal isTenantDefault enabled ownerChannelId shippingMethods{ id code name } } totalItems } }""")
print("=== shippingProfiles ===")
print(json.dumps(sp, ensure_ascii=False, indent=1))

# 2) target product variants (3=t1蓝牙耳机, 35=t2曲奇) shippingProfileId
for pid in ["3", "35"]:
    r = q("""query($id:ID!){ product(id:$id){ id name
        variants{ id sku customFields{ shippingProfileId paymentProfileId } } } }""", {"id": pid})
    p = r.get("product")
    print(f"=== product {pid} ===")
    if p is None:
        print("  not found:", r)
        continue
    print("  name:", p["name"])
    for v in p["variants"]:
        print("   variant", v["id"], v["sku"], "shippingProfileId=", (v.get("customFields") or {}).get("shippingProfileId"),
              "paymentProfileId=", (v.get("customFields") or {}).get("paymentProfileId"))
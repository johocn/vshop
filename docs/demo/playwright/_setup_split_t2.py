# -*- coding: utf-8 -*-
"""拆单验证-步骤0 设置（幂等）：在 t2 商家渠道确保「租户默认配送档案」+「第二个商品(未绑定→回退默认)」存在。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

a = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]
T2 = "66ruvnhh34svhckaa2i"

def q(query, variables=None, channel_token=None):
    h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}
    if channel_token:
        h["vendure-token"] = channel_token
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode())
    except HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:500]}

# 0) 已存在的 t2 档案
r0 = q("""query{ shippingProfiles{ items{ id code name isGlobal isTenantDefault } totalItems } }""", channel_token=T2)
profiles = r0.get("data", {}).get("shippingProfiles", {}).get("items", [])
pid = next((p["id"] for p in profiles if p["code"] == "chendi-default"), None)
print("existing chendi-default profile:", pid)

if not pid:
    r = q("""mutation($i:CreateShippingProfileInput!){
      createShippingProfile(input:$i){ id code name isGlobal isTenantDefault shippingMethods{ id code } } }""",
     {"i": {"name": "陈记默认配送档案", "code": "chendi-default", "description": "拆单验证用：t2 商家默认档案，与曲奇自提档案分箱",
            "isGlobal": False, "shippingMethodIds": ["1"]}},
     channel_token=T2)
    pid = r.get("data", {}).get("createShippingProfile", {}).get("id")
    print("created profile:", r)

# 确保 t2 租户默认
r2 = q("""mutation($id:ID!){ setTenantDefaultShippingProfile(id:$id) }""", {"id": pid}, channel_token=T2)
print("setDefault:", r2)

# 3) 第二个商家商品（幂等：已存在则复用）；带 description
r3 = q("""query{ products(options:{skip:0 take:50}){ items{ id slug } } }""", channel_token=T2)
pids = r3.get("data", {}).get("products", {}).get("items", [])
prod = next((p for p in pids if p["slug"] == "chendi-egg-roll"), None)
if not prod:
    r3 = q("""mutation($i:CreateProductInput!){ createProduct(input:$i){ id slug } }""",
     {"i": {"translations": [{"languageCode": "zh_Hans", "name": "陈记手工蛋卷", "slug": "chendi-egg-roll",
                             "description": "陈记手工烘焙蛋卷，麻油香酥，适合伴手礼。"}]}},
     channel_token=T2)
    print("createProduct2:", json.dumps(r3, ensure_ascii=False))
    prod = (r3.get("data") or {}).get("createProduct")
    if not prod:
        print("ABORT product"); sys.exit(1)
pid2 = prod["id"]

# 4) 变体（未绑定档案→回退 t2 默认）
r4 = q("""query{ productVariants(options:{skip:0 take:50}){ items{ id sku } } }""", channel_token=T2)
vs = r4.get("data", {}).get("productVariants", {}).get("items", [])
v2 = next((v for v in vs if v["sku"] == "EGG-ROLL-01"), None)
if not v2:
    r4 = q("""mutation($i:[CreateProductVariantInput!]!){ createProductVariants(input:$i){ id sku } }""",
     {"i": [{"productId": pid2, "sku": "EGG-ROLL-01", "price": 4500,
             "trackInventory": "TRUE", "stockOnHand": 500, "taxCategoryId": "2",
             "translations": [{"languageCode": "zh_Hans", "name": "陈记手工蛋卷(麻油味)"}]}]},
     channel_token=T2)
    print("createVariant2:", json.dumps(r4, ensure_ascii=False))
    v2 = (r4.get("data", {}).get("createProductVariants") or [None])[0]

d = {"profile_id": pid, "product2_id": pid2, "variant2_id": v2["id"] if v2 else None}
json.dump(d, open("_split_t2_setup.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("done", d)
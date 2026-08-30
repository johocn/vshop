# -*- coding: utf-8 -*-
"""跨租户/跨档案探测：列出线上商品->变体{档案/租户}，并探测 default 商城可加购的跨档案组合。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state, list_shipping_profiles

SHOP_API = "https://e.joho.cn/shop-api"
USER, PW = "zhao@163.com", "23123"
AUTH = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]

# 0) 租户(渠道)列表 -> 名称映射
def admin_gql(query, variables=None, channel_token=""):
    h = {"Authorization": "Bearer " + AUTH, "Content-Type": "application/json"}
    if channel_token:
        h["vendure-token"] = channel_token
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    with urlopen(req, timeout=40) as r:
        data = json.loads(r.read().decode())
        return data.get("data") or {}

chans = admin_gql("query{ channels(options:{skip:0 take:100}){ items{ id code token } } }").get("channels", {}).get("items") or []
print("channels:", [(c["id"], c["code"]) for c in chans])

# 1) 各商品(所有租户视图) -> 变体档案分布
prods = admin_gql("""query($take:Int!){ products(options:{take:$take}){ items{
  id slug name variants{ id sku customFields{ shippingProfileId } } } } }""", {"take": 80}).get("products", {}).get("items", [])
print(f"\n== products({len(prods)}) variant->profile ==")
for p in prods:
    vs = p.get("variants") or []
    if not vs:
        continue
    profs = sorted({(v.get("customFields") or {}).get("shippingProfileId") for v in vs})
    print(f"  P{p['id']} {p.get('slug')} | variants={[(v['id'],v['sku'],(v.get('customFields') or {}).get('shippingProfileId')) for v in vs]}")

# 2) 档案列表(全局) 供参考
print("\n== shippingProfiles(全局) ==")
for sp in list_shipping_profiles(AUTH):
    print(f"  SP{sp['id']} {sp['code']} tenantDefault={sp['isTenantDefault']}")

# 3) 探测 default 商城可用维度：用 shop 登录 empty order, 逐个尝试加购所有变体
class Shop:
    def __init__(self):
        self.h = {"Content-Type": "application/json"}
    def gql(self, query, variables=None):
        req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=self.h, method="POST")
        try:
            with urlopen(req, timeout=45) as r:
                t = r.headers.get("vendure-auth-token")
                if t:
                    self.h["Authorization"] = "Bearer " + t
                return json.loads(r.read().decode())
        except HTTPError as e:
            return {"error": e.code, "body": e.read().decode()[:300]}

s = Shop()
s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename ... on CurrentUser{ id } } }""", {"u": USER, "p": PW})

print("\n== 探测 default 商城各变体可加购 ==")
all_variants = [(v["id"], p.get("slug"), v["sku"], (v.get("customFields") or {}).get("shippingProfileId"))
                for p in prods for v in (p.get("variants") or [])]
for vid, slug, sku, prof in all_variants:
    r = s.gql("""mutation($v:ID!){ addItemToOrder(productVariantId:$v,quantity:1){ __typename
      ... on Order{ id totalWithTax }
      ... on ErrorResult{ errorCode message } } }""", {"v": vid})
    od = (r.get("data") or {}).get("addItemToOrder") or r
    ok = od.get("__typename") == "Order"
    print(f"  v{vid} {slug}/{sku} profile={prof} -> {'OK' if ok else str(od)[:80]}")

# 清理活动订单（移除本次探测产物）
r = s.gql("""mutation{ activeOrder{ __typename ... on Order{ id lines{ id } } } }""")
lines = (r.get("data") or {}).get("activeOrder", {}).get("lines") or []
for ln in lines:
    s.gql("""mutation($i:ID!){ removeItemFromOrder(id:$i){ __typename ... on Order{ id } } }""", {"i": ln["id"]})
print("\ncleaned active order")
# -*- coding: utf-8 -*-
"""查证：订单76 的多渠道归属 + 曲奇商品(P35) 所在渠道/档案归属。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from login_util import ADMIN_API, admin_login_state

SHOP_API = "https://e.joho.cn/shop-api"

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
        except Exception as e:
            return {"error": str(e)[:120]}

s = Shop()
s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename ... on CurrentUser{ id } } }""",
      {"u": "zhao@163.com", "p": "23123"})
r = s.gql("""{ activeOrder{ id code channels{ id code } lines{ id productVariant{ sku } } } }""")
print("ACTIVE_ORDER_CHANNELS:", json.dumps(r, ensure_ascii=False))

# admin 查曲奇 P35 的渠道归属 + 三工档案SP8 归属
AUTH = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]
def admin_gql(query, variables=None, ch=""):
    h = {"Authorization": "Bearer " + AUTH, "Content-Type": "application/json"}
    if ch:
        h["vendure-token"] = ch
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    with urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

print("P35:", json.dumps(admin_gql("""query($id:ID!){ product(id:$id){ id slug channels{ id code } variants{ id sku } } }""", {"id": "35"}).get("data"), ensure_ascii=False))
print("SP8:", json.dumps(admin_gql("""query{ shippingProfile(id:"8"){ id code name isGlobal channels{ id code } } }""", ch="66ruvnhh34svhckaa2i").get("data"), ensure_ascii=False))
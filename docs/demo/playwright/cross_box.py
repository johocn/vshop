# -*- coding: utf-8 -*-
"""跨租户/跨档案 分箱验证（T1+T2）。
组合：v2(default 租户,回退默认档案SP5) + v31(t2 曲奇,档案SP8)。期望 2 箱、不同 tenantChannelId、不同档案。
"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"
USER, PW = "zhao@163.com", "23123"

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
            return {"error": e.code, "body": e.read().decode()[:700]}

def dump(r, tag):
    print(f"\n===== {tag} =====")
    print(json.dumps(r, ensure_ascii=False, default=str)[:4000])

s = Shop()
dump(s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename ... on CurrentUser{ id } } }""",
           {"u": USER, "p": PW}), "login")

# 清空活动订单（幂等）
r = s.gql("""mutation{ activeOrder{ __typename ... on Order{ id lines{ id } } } }""")
for ln in ((r.get("data") or {}).get("activeOrder") or {}).get("lines") or []:
    s.gql("""mutation($i:ID!){ removeItemFromOrder(id:$i){ __typename ... on Order{ id } } }""", {"i": ln["id"]})

# T1: 加购 v2(default) + v31(t2/档案8) —— 跨租户+跨档案
for v in ["2", "31"]:
    r = s.gql("""mutation($v:ID!){ addItemToOrder(productVariantId:$v,quantity:1){ __typename
      ... on Order{ id lines{ id productVariant{ sku name } } }
      ... on ErrorResult{ errorCode message } } }""", {"v": v})
    dump(r, f"add v{v}")

# 分箱结果
o = s.gql("""query{ orderBoxes {
  boxKey profileId profileName tenantChannelId shippingProfileIds lineIds
  availableShippingMethodIds defaultShippingMethodId availablePaymentMethodCodes
 } }""")
dump(o, "T1 orderBoxes(期望2箱:跨租户跨档案)")

# T2: 再加 default 同档商品 v4(手环) -> default 侧应合箱, 总箱仍为 2
r = s.gql("""mutation($v:ID!){ addItemToOrder(productVariantId:$v,quantity:1){ __typename
  ... on Order{ id totalWithTax } } }""", {"v": "4"})
o2 = s.gql("""query{ orderBoxes { boxKey profileId profileName tenantChannelId lineIds } }""")
dump(o2, "T2 orderBoxes(+v4同档,期望仍2箱:default侧合箱=t2箱独立)")

# 最终活动订单概览
final = s.gql("""query{ activeOrder{ id code state totalWithTax lines{ id productVariant{ sku } quantity } } }""")
dump(final, "final activeOrder")
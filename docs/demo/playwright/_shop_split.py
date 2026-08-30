# -*- coding: utf-8 -*-
"""拆单验证-步骤2：真实 shop 下单流程。登录顾客->加两种商品->orderBoxes 看分箱->按箱设配送->下单。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"
USER = "zhao@163.com"
PW = "23123"

class Shop:
    def __init__(self):
        self.h = {"Content-Type": "application/json"}
    def gql(self, query, variables=None):
        req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=self.h, method="POST")
        try:
            with urlopen(req, timeout=45) as r:
                token = r.headers.get("shop-auth-token")
                if token:
                    self.h["Authorization"] = "Bearer " + token
                return json.loads(r.read().decode())
        except HTTPError as e:
            return {"error": e.code, "body": e.read().decode()[:600]}

s = Shop()

# login
r = s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename
  ... on CurrentUser{ id identifier }
  ... on ErrorResult{ errorCode message } } }""", {"u": USER, "p": PW})
print("login:", json.dumps(r, ensure_ascii=False))

# ensure fresh active order: if exists merge or use active; add variants 31 (曲奇) + 6 (蓝牙音箱)
for v in ["31", "6"]:
    r = s.gql("""mutation($v:ID!){ addItemToOrder(productVariantId:$v, quantity:1){ __typename
      ... on Order{ id code totalWithTax lines{ id productVariant{ sku name } } }
      ... on ErrorResult{ errorCode message } } }""", {"v": v})
    print(f"add {v} RAW:", json.dumps(r, ensure_ascii=False)[:600])

# orderBoxes (分箱结果)
r = s.gql("""query{ orderBoxes {
  boxKey profileId profileName tenantChannelId
  lineIds
  availableShippingMethodIds defaultShippingMethodId
  availablePaymentMethodCodes
 } }""")
print("orderBoxes RAW:", json.dumps(r, ensure_ascii=False)[:1500], default=str)
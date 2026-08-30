# -*- coding: utf-8 -*-
"""拆单验证-步骤1（修正版）：正确捕获 shop-auth 会话 token(vendure-auth-token) 并在之后带上，
保证「曲奇31(档8)+蛋卷32(档9)」落入同一 t2 活动订单 -> orderBoxes 出 2 箱 -> 按箱设配送 -> 结算。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"
T2_TOKEN = "66ruvnhh34svhckaa2i"
USER, PW = "zhao@163.com", "23123"
AUTH_TOKEN_HDR = "vendure-auth-token"

class Shop:
    def __init__(self, channel_token=None):
        self.h = {"Content-Type": "application/json"}
        if channel_token:
            self.h["vendure-channel-token"] = channel_token
    def gql(self, query, variables=None):
        req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=self.h, method="POST")
        try:
            with urlopen(req, timeout=45) as r:
                t = r.headers.get(AUTH_TOKEN_HDR) or r.headers.get("vendure-session-token")
                if t:
                    self.h["Authorization"] = "Bearer " + t
                return json.loads(r.read().decode())
        except HTTPError as e:
            return {"error": e.code, "body": e.read().decode()[:600]}

def show(r, tag):
    print(f"\n===== {tag} =====")
    print(json.dumps(r, ensure_ascii=False)[:3000])

s = Shop(channel_token=T2_TOKEN)

show(s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename
  ... on CurrentUser{ id identifier } ... on ErrorResult{ errorCode message } } }""", {"u": USER, "p": PW}), "login")

def active():
    return s.gql("""query{ activeOrder{ id code state totalWithTax currencyCode
      lines{ id productVariant{ id sku name } quantity } } }""")
show(active(), "activeOrder(before)")

for v in ["31", "32"]:
    show(s.gql("""mutation($v:ID!){ addItemToOrder(productVariantId:$v, quantity:1){ __typename
      ... on Order{ id code } ... on ErrorResult{ errorCode message } } }""", {"v": v}), f"addItemToOrder({v})")
show(active(), "activeOrder(after add, 应为同1单)")

r = s.gql("""query{ orderBoxes { boxKey profileId profileName tenantChannelId
  lineIds availableShippingMethodIds defaultShippingMethodId availablePaymentMethodCodes } }""")
show(r, "orderBoxes(期望2箱)")

if r.get("data") and r["data"].get("orderBoxes"):
    for box in r["data"]["orderBoxes"]:
        m = box.get("defaultShippingMethodId")
        if m:
            show(s.gql("""mutation($k:String!,$m:ID!){ setOrderBoxShippingMethod(boxKey:$k, shippingMethodId:$m){
              id code state } }""", {"k": box["boxKey"], "m": m}), f"setBoxShip({box['boxKey']}->{box['profileName']})")

show(s.gql("""query{ activeOrder{ id code state total totalWithTax shippingWithTax charges{ __typename }
  shippingLines{ id shippingMethod{ code name } }
  lines{ id productVariant{ sku } unitPriceWithTax } } }"""), "activeOrder(final, 期望多条ShippingLine)")
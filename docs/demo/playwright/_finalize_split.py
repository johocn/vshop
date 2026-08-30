# -*- coding: utf-8 -*-
"""拆单验证-步骤2：在订单75基础上核对 2 条配送线，并推进至 ArrangingPayment + 余额支付结算。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"
USER, PW = "zhao@163.com", "23123"
AUTH_TOKEN_HDR = "vendure-auth-token"

class Shop:
    def __init__(self):
        self.h = {"Content-Type": "application/json"}
    def gql(self, query, variables=None):
        req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=self.h, method="POST")
        try:
            with urlopen(req, timeout=45) as r:
                t = r.headers.get(AUTH_TOKEN_HDR)
                if t:
                    self.h["Authorization"] = "Bearer " + t
                return json.loads(r.read().decode())
        except HTTPError as e:
            return {"error": e.code, "body": e.read().decode()[:700]}

def show(r, tag):
    print(f"\n===== {tag} =====")
    print(json.dumps(r, ensure_ascii=False)[:3500])

s = Shop()
show(s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename ... on CurrentUser{ id } } }""",
           {"u": USER, "p": PW}), "login(会指向用户活动订单75)")

# 1) 活动订单 + 分箱 + 配送线（关键：shippingLines 应含 2 条）
r = s.gql("""query{ activeOrder{ id code state totalWithTax shippingWithTax
  shippingLines{ id shippingMethod{ code name } }
  lines{ id productVariant{ sku name } quantity } } }""")
show(r, "activeOrder.shippingLines(期望2条=2箱)")

# 2) 推进到 ArrangingPayment 以锁定分箱
r = s.gql("""mutation{ transitionOrderToState(state:"ArrangingPayment"){ __typename
  ... on Order{ id state } ... on OrderStateTransitionError{ transitionError errorCode message } } }""")
show(r, "transition->ArrangingPayment")

# 3) 尝试结算（余额支付，观察分箱后总价与配送费核算）
r = s.gql("""mutation{ addPaymentToOrder(input:{ method:"balance-wallet", metadata:{} }){
  __typename ... on Order{ id state totalWithTax shippingWithTax payments{ method state amount } }
  ... on ErrorResult{ errorCode message } } }""")
show(r, "addPaymentToOrder(balance-wallet)")

# 4) 最终落库状态
r = s.gql("""query{ orderByCode(code:"YZWKW3Z6PW3R8AZD"){ id state totalWithTax
  payments{ id method state amount }
  shippingLines{ id shippingMethod{ code name } } } }""")
show(r, "orderByCode(final)")
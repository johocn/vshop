# -*- coding: utf-8 -*-
"""清空 zhao@163.com 的活动订单(幂等，循环删到空)。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen

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
for it in range(8):
    r = s.gql("""{ activeOrder{ __typename ... on Order{ id lines{ id } } } }""")
    o = (r.get("data") or {}).get("activeOrder")
    if not o or not (o.get("lines") or []):
        print("clean done (no lines) after iters", it)
        break
    for ln in (o.get("lines") or []):
        s.gql("""mutation($i:ID!){ removeItemFromOrder(id:$i){ __typename ... on Order{ id } } }""", {"i": ln["id"]})
r = s.gql("""{ activeOrder{ __typename ... on Order{ id code lines{ id } totalWithTax } } }""")
print("AFTER_CLEAN:", json.dumps(r, ensure_ascii=False))
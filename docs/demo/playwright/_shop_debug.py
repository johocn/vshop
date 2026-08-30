# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"

class Shop:
    def __init__(self):
        self.h = {"Content-Type": "application/json"}
    def gql(self, query, variables=None):
        req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=self.h, method="POST")
        with urlopen(req, timeout=45) as r:
            t = r.headers.get("shop-auth-token")
            if t:
                self.h["Authorization"] = "Bearer " + t
            return json.loads(r.read().decode())

s = Shop()
r = s.gql("""mutation($u:String!,$p:String!){ login(username:$u,password:$p){ __typename
   ... on CurrentUser{ id identifier } ... on ErrorResult{ errorCode message } } }""", {"u":"zhao@163.com","p":"23123"})
print("login:", json.dumps(r))

def activeOrder():
    r = s.gql("""query{ activeOrder{ id code state totalWithTax lines{ id productVariant{ sku } } } }""")
    print("  activeOrder:", json.dumps(r))
    return r

activeOrder()
r = s.gql("""mutation{ addItemToOrder(productVariantId:"31",quantity:1){ __typename ... on Order{ id code } } }""")
print("add 31:", json.dumps(r))
activeOrder()
r = s.gql("""mutation{ addItemToOrder(productVariantId:"6",quantity:1){ __typename ... on Order{ id code } } }""")
print("add 6:", json.dumps(r))
activeOrder()
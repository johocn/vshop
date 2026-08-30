# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SHOP_API = "https://e.joho.cn/shop-api"

def sgraph(query, variables=None, headers=None):
    req = Request(SHOP_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                  headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return r, json.loads(r.read().decode()).get("data") or {}
    except HTTPError as e:
        return None, {"error": e.code, "body": e.read().decode()[:400]}

# 默认商城检索该商品
_, d = sgraph("""query($t:String!){ search(input:{term:$t,take:10}){ totalItems items{ productId productName sku priceWithTax } } }""", {"t":"曲奇"})
print("search 曲奇:", json.dumps(d, ensure_ascii=False))

_, d2 = sgraph("""query($t:String!){ search(input:{term:$t,take:10}){ totalItems items{ productId productName sku priceWithTax } } }""", {"t":"蓝牙音箱"})
print("search 蓝牙音箱:", json.dumps(d2, ensure_ascii=False))

# activeOrder 各商品能否加购（用匿名会话）
_, ag = sgraph("""mutation($v:ID!){ addItemToOrder(productVariantId:$v, quantity:1){ __typename
  ... on Order{ id code totalWithTax lines{ id productVariant{ sku } } }
  ... on ErrorResult{ errorCode message } } }""", {"v":"31"})
print("addItem variant31:", json.dumps(ag, ensure_ascii=False))
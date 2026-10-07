# -*- coding: utf-8 -*-
"""探针：admin-api afterSalesRequestAdmin 的 order.lines 是否可解析（商品栏回退展示前置验证）。"""
import json

import requests

ADMIN_API = "https://e.joho.cn/admin-api"

s = requests.Session()
lr = s.post(ADMIN_API, json={"query": "mutation { login(username: \"superadmin\", password: \"z123123\") { ... on CurrentUser { id } } }"}, timeout=20)
tok = lr.headers.get("vendure-auth-token")
assert tok, "login failed: " + lr.text[:200]
s.headers["Authorization"] = "Bearer " + tok
s.headers["vendure-token"] = "canteen-a-token"

q = """query($id: ID!){ afterSalesRequestAdmin(id: $id){
  id state type orderLineId
  order { id code lines { id quantity productVariant { name sku } featuredAsset { preview } } }
  orderLine { id productVariant { name } }
} }"""
r = s.post(ADMIN_API, json={"query": q, "variables": {"id": "27"}}, timeout=20)
d = r.json()
print(json.dumps(d, ensure_ascii=False, indent=1)[:1200])

# -*- coding: utf-8 -*-
import os
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

USER = os.environ.get("ADMIN_USER")
PWD = os.environ.get("ADMIN_PASS")
if not USER or not PWD:
    raise SystemExit("缺少 ADMIN_USER / ADMIN_PASS 环境变量")

A = admin_login_state(USER, PWD)["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]

def gql(q, vars, h):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": vars}).encode(),
                  headers={"Content-Type": "application/json", **(h or {})}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, {"raw": e.read().decode()[:600]}

h = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}
q = """mutation($i:CreateProductInput!,$v:[CreateProductVariantInput!]!){
  createProduct(input:$i,variants:$v){ id name slug customFields{ merchantRef{ id code } marketplaceStatus listedInMarketplace } } }"""
v = {"i": {"translations": [{"languageCode": "zh_Hans",
                             "name": "手工黄油曲奇礼盒",
                             "slug": "handmade-oatmeal-cookies-gift",
                             "description": "手工烘焙黄油曲奇礼盒，香酥可口，适合伴手礼。"}]},
     "v": [{"sku": "COOK-GIFT-01", "price": 6800, "trackInventory": "TRUE", "stockOnHand": 200,
            "translations": [{"languageCode": "zh_Hans", "name": "黄油曲奇礼盒"}]}]}
s, d = gql(q, v, h)
print("status:", s)
print(json.dumps(d, ensure_ascii=False)[:1500])
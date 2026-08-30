# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login, list_tenants, admin_login_state

def gql(q, vars, h):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": vars}).encode(),
                  headers={"Content-Type": "application/json", **(h or {})}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, {"raw": e.read().decode()[:400]}

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]

# merchant token + t2 context
mt, mb = admin_login("chendi-demo@joho.cn", "B5hZ-#Jnuba@")
h_m = {"Authorization": "Bearer " + mt, "vendure-token": TOKEN}

# 1) merchant createProduct
q_create = """mutation($i:CreateProductInput!){ createProduct(input:$i){ id name slug } }"""
s, d = gql(q_create, {"i": {"translations": [{"languageCode": "zh_Hans",
          "name": "M-测试-手工黄油曲奇礼盒", "slug": "m-merchant-cookie", "description": "测试"}]}}, h_m)
print("MERCHANT createProduct:", s, json.dumps(d, ensure_ascii=False)[:300])

# 2) merchant getTaxCategories (may need for variants)
s2, d2 = gql('query{ taxCategories { id name } }', {}, h_m)
print("MERCHANT taxCategories:", s2, json.dumps(d2, ensure_ascii=False)[:300])
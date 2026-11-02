# -*- coding: utf-8 -*-
import os
import sys, io, json, traceback
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login, list_tenants, admin_login_state

USER = os.environ.get("ADMIN_USER")
PWD = os.environ.get("ADMIN_PASS")
if not USER or not PWD:
    raise SystemExit("缺少 ADMIN_USER / ADMIN_PASS 环境变量")

A = admin_login_state(USER, PWD)["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]
mt, mb = admin_login("chendi-demo@joho.cn", "__REDACTED__")
print("merchant login:", "OK" if mt else mb)

q = """mutation($i:CreateProductInput!){
  createProduct(input:$i){ id name slug customFields{ merchantRef{ id code } marketplaceStatus listedInMarketplace } } }"""
v = {"i": {"translations": [{"languageCode": "zh_Hans", "name": "手工黄油曲奇礼盒",
       "slug": "handmade-oatmeal-cookies-gift", "description": "手工烘焙黄油曲奇礼盒，香酥可口，适合伴手礼。"}]}}
req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": v}).encode(),
              headers={"Content-Type": "application/json", "Authorization": "Bearer " + mt, "vendure-token": TOKEN}, method="POST")
try:
    with urlopen(req, timeout=40) as r:
        print("OK", r.status, r.read().decode()[:500])
except HTTPError as e:
    print("HTTPErr", e.code)
    print(e.read().decode()[:800])
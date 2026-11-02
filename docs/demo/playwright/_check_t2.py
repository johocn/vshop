# -*- coding: utf-8 -*-
import os
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants, _admin_gql

USER = os.environ.get("ADMIN_USER")
PWD = os.environ.get("ADMIN_PASS")
if not USER or not PWD:
    raise SystemExit("缺少 ADMIN_USER / ADMIN_PASS 环境变量")

A = admin_login_state(USER, PWD)["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]

def gql(query, headers, variables=None):
    req = Request("https://e.joho.cn/admin-api",
                  data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                  headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except HTTPError as e:
        return e.code, e.read().decode()[:1200]
    except Exception as e:
        return "ERR", str(e)[:400]

h = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}
s, b = gql(
    'query{ products(options:{take:50}){ totalItems items{ id slug enabled customFields{ marketplaceStatus } } } }',
    h)
print("t2 products status:", s)
print(b[:3000])
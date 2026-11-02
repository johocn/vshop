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
        return e.code, {"raw": e.read().decode()[:400]}

h = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}

# delete orphan product 26 (M-测试)
if True:
    s, d = gql('mutation($id:ID!){ deleteProduct(id:$id){ result } }', {"id": "26"}, h)
    print("delete 26:", s, json.dumps(d, ensure_ascii=False)[:200])

# tax categories (items list form)
s, d = gql('query{ taxCategories { items { id name isDefault } } }', {}, h)
print("taxCategories:", s, json.dumps(d, ensure_ascii=False)[:500])
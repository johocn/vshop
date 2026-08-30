# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]
h = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}
def gql(q, v=None):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                  headers={"Content-Type": "application/json", **(h or {})}, method="POST")
    with urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())
d = gql('query{ products(options:{take:100}){ items{ id slug name } } }')
for i in d["data"]["products"]["items"]:
    if i["slug"] in ("repro-cookie",) or i["name"].startswith("REPRO") or i["name"].startswith("M-测试") or "曲奇" in i["name"] or "oatmeal" in i["slug"]:
        gql('mutation($id:ID!){ deleteProduct(id:$id){ result } }', {"id": i["id"]})
        print("deleted", i["id"], i["slug"])
print("t2 now:", [(i["id"], i["slug"]) for i in gql('query{ products(options:{take:50}){ items{ id slug } } }')["data"]["products"]["items"]])
# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state

A = admin_login_state("superadmin", "z123123")["auth_token"]

def gql(q):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q}).encode(),
                  headers={"Content-Type": "application/json", "Authorization": "Bearer " + A}, method="POST")
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

d = gql('query{ __type(name:"ProductCustomFields"){ fields { name type { kind name ofType { kind name } } } } }')
print("ProductCustomFields:")
for f in d["data"]["__type"]["fields"]:
    print("  ", f["name"], f["type"]["name"] or f["type"].get("ofType", {}).get("name"))

# 检查 Product 上是否可直接选 slug 与 customFields
d2 = gql('query{ __type(name:"Product"){ fields { name } } }')
pf = {f["name"] for f in d2["data"]["__type"]["fields"]}
for tk in ("slug", "customFields", "translations", "featuredAsset"):
    print("Product has", tk, ":", tk in pf)
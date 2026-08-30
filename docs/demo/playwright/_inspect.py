# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

ADMIN_API = "https://e.joho.cn/admin-api"

def gql(query, headers, variables=None):
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                  headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except HTTPError as e:
        return e.code, e.read().decode()[:800]
    except Exception as e:
        return "ERR", str(e)[:400]

A = admin_login_state("superadmin", "z123123")["auth_token"]
h = {"Authorization": "Bearer " + A}
print("== Query type fields ==")
s, b = gql('query{ __type(name:"Query"){ fields { name } } }', h)
names = [f["name"] for f in json.loads(b)["data"]["__type"]["fields"]]
targets = ["marketplacePendingProducts", "marketplaceMerchantChannel", "tenants",
           "tenantRoles", "approveMarketplaceProduct"]
print("has fields:", {t: (t in names) for t in targets})
print("marketplace fields:", [n for n in names if "arketplace" in n or "enant" in n])

print("== pending products raw ==")
s, b = gql('query{ marketplacePendingProducts{ id slug customFields{ marketplaceStatus } } }', h)
pay = json.loads(b)
pend = pay["data"]["marketplacePendingProducts"]
print("total pending:", len(pend))
print("cookies?", [p for p in pend if "cookie" in p["slug"] or "oatmeal" in p["slug"]])
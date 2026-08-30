# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login, list_tenants, admin_login_state

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]
mt, mb = admin_login("chendi-demo@joho.cn", "B5hZ-#Jnuba@")

def gql(q, v, hh):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": v}).encode(),
                  headers={"Content-Type": "application/json", **(hh or {})}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, {"raw": e.read().decode()[:500]}

# 商户视角看 t2 商品
hm = {"Authorization": "Bearer " + mt, "vendure-token": TOKEN}
s, d = gql('query{ products(options:{take:50}){ totalItems items{ id name enabled slug customFields{ marketplaceStatus merchantRef{code} } } } }', {}, hm)
print("MERCHANT t2 products:", s, json.dumps(d, ensure_ascii=False)[:700])

# 超管视角看 t2 商品（对照）
hs = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}
s2, d2 = gql('query{ products(options:{take:50}){ totalItems items{ id name enabled slug } } }', {}, hs)
print("SUPER t2 products:", s2, json.dumps(d2, ensure_ascii=False)[:400])
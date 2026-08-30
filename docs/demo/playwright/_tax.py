# -*- coding: utf-8 -*-
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
TOKEN = t2["token"]

def gql(q, v, hh):
    req = Request("https://e.joho.cn/admin-api", data=json.dumps({"query": q, "variables": v}).encode(),
                  headers={"Content-Type": "application/json", **(hh or {})}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, {"raw": e.read().decode()[:400]}

h = {"Authorization": "Bearer " + A}
s, d = gql('query{ zones{ items{ id name } } }', {}, h)
print("zones:", s, json.dumps(d, ensure_ascii=False)[:600])
items = d["data"]["zones"]["items"]
# 默认税务区：找标准/欧洲(默认)区，取第一个
zid = items[0]["id"] if items else None
# 各国默认：默认税务区应为覆盖主力国家的区；这里直接取列表第一个并同时设到国家
if zid:
    # t2 上下文设置默认区
    ht = {"Authorization": "Bearer " + A, "vendure-token": TOKEN}
    q = 'mutation{ updateChannel(input:{ id:"%s", defaultTaxZoneId:"%s", defaultShippingZoneId:"%s" }){ ... on Channel{ id code defaultTaxZone{ id name } defaultShippingZone{ id name } } ... on ErrorResult{ message errorCode } } }' % (t2["id"], zid, zid)
    s2, d2 = gql(q, {}, ht)
    print("set t2 zones:", s2, json.dumps(d2, ensure_ascii=False)[:400])
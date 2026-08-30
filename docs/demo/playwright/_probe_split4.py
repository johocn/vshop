# -*- coding: utf-8 -*-
"""确认 t2 渠道视角：配送档案列表 + 是否存在租户默认档案。"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

a = admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]

def q(query, variables=None, channel_token=None):
    h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}
    if channel_token:
        h["vendure-token"] = channel_token
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode())
    except HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:400]}

tok = "66ruvnhh34svhckaa2i"  # t2
r = q("""query{ shippingProfiles{ items{
  id code name isGlobal isTenantDefault enabled
  shippingMethods{ id code name } } totalItems } }""", channel_token=tok)
print("=== t2 shippingProfiles ===")
print(json.dumps(r, ensure_ascii=False, indent=1))
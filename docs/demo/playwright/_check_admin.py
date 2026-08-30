# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

A = admin_login_state("superadmin", "z123123")["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
print("t2 channel:", t2)

# 商户自己的 access
ma = admin_login_state("chendi-demo@joho.cn", "B5hZ-#Jnuba@")
print("merchant access:")
print(json.dumps({k: ma[k] for k in ("must_change", "is_superadmin")}, ensure_ascii=False))
for c in ma["all_channels"]:
    print("  ch:", c.get("code"), "memberEnabled=", c.get("memberEnabled"), "mustChange=", c.get("mustChangePassword"))
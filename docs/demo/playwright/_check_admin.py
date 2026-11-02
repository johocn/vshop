# -*- coding: utf-8 -*-
import os
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login_state, list_tenants

USER = os.environ.get("ADMIN_USER")
PWD = os.environ.get("ADMIN_PASS")
if not USER or not PWD:
    raise SystemExit("缺少 ADMIN_USER / ADMIN_PASS 环境变量")

A = admin_login_state(USER, PWD)["auth_token"]
t2 = next(t for t in list_tenants(A) if t["code"] == "t2")
print("t2 channel:", t2)

# 商户自己的 access
ma = admin_login_state("chendi-demo@joho.cn", "__REDACTED__")
print("merchant access:")
print(json.dumps({k: ma[k] for k in ("must_change", "is_superadmin")}, ensure_ascii=False))
for c in ma["all_channels"]:
    print("  ch:", c.get("code"), "memberEnabled=", c.get("memberEnabled"), "mustChange=", c.get("mustChangePassword"))
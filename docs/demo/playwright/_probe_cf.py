# -*- coding: utf-8 -*-
import os
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from login_util import ADMIN_API, admin_login_state

USER = os.environ.get("ADMIN_USER")
PWD = os.environ.get("ADMIN_PASS")
if not USER or not PWD:
    raise SystemExit("缺少 ADMIN_USER / ADMIN_PASS 环境变量")

st = admin_login_state(USER, PWD, channel_code=None)
a = st["auth_token"]

def q(s):
    req = Request(ADMIN_API, data=json.dumps({"query": s}).encode(),
                  headers={"Authorization": "Bearer " + a, "Content-Type": "application/json"}, method="POST")
    return json.loads(urlopen(req, timeout=40).read().decode())

d = q('''{ __type(name:"ProductCustomFields"){ fields{ name type{ kind name ofType{ name kind ofType{ name } } } } } }''')
print("ProductCustomFields:")
for f in d["data"]["__type"]["fields"]:
    t = f["type"]
    print("  ", f["name"], "::", t["kind"], t.get("name"), "->", (t.get("ofType") or {}).get("name"))
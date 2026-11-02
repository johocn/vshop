# -*- coding: utf-8 -*-
import os
import sys, io, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from login_util import admin_login, fetch_access, ADMIN_API

def login(u, p):
    try:
        tok, body = admin_login(u, p)
        return "OK token=" + (tok[:12] + "..." if tok else "NONE"), body.get("__typename")
    except HTTPError as e:
        return "HTTP" + str(e.code), e.read().decode()[:300]
    except Exception as e:
        return "ERR", str(e)[:200]

EMAIL = os.environ.get("MERCHANT_USER")
INIT_PWD = os.environ.get("MERCHANT_INIT_PASS")
NEW_PWD = os.environ.get("MERCHANT_NEW_PASS")
if not EMAIL or not INIT_PWD or not NEW_PWD:
    raise SystemExit("缺少 MERCHANT_USER / MERCHANT_INIT_PASS / MERCHANT_NEW_PASS 环境变量")
print("INIT_PWD  :", login(EMAIL, INIT_PWD))
print("NEW_PWD   :", login(EMAIL, NEW_PWD))
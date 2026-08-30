# -*- coding: utf-8 -*-
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

EMAIL = "chendi-demo@joho.cn"
print("INIT_PWD  :", login(EMAIL, "B5hZ-#Jnuba@"))
print("NEW_PWD   :", login(EMAIL, "Demo2026@chendi"))
# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from login_util import ADMIN_API, admin_login_state

st = admin_login_state("superadmin", "z123123", channel_code=None)
a = st["auth_token"]

def q(query, variables=None, channel_token=None):
    h = {"Authorization": "Bearer " + a, "Content-Type": "application/json"}
    if channel_token:
        h["vendure-token"] = channel_token
    req = Request(ADMIN_API, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=h, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode()).get("data") or {}
    except HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:300]}

# Introspect variant customFields
d = q('''{ __type(name:"ProductVariantCustomFields"){ fields{ name type{ kind name ofType{ name } } } } }''')
print("VariantCustomFields:", [f["name"] for f in d.get("__type",{}).get("fields",[])])

# Shipping profiles
sp = q('''query{ __type(name:"Query"){ fields{ name } } }''') 
fnames = [f["name"] for f in sp.get("__type",{}).get("fields",[])]
print("query has shippingProfiles:", [n for n in fnames if "hippingProfile" in n.lower() or "hipping" in n])
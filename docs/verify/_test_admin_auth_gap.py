# -*- coding: utf-8 -*-
"""补充负例：未登录用合法 input 调 createLiveRoom，必须 FORBIDDEN。"""
import json
import urllib.error
import urllib.request

req = urllib.request.Request(
    "https://e.joho.cn/admin-api",
    data=json.dumps({"query": 'mutation { createLiveRoom(input: {name: "hack", type: "normal"}) { id } }'}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("HTTP", r.status)
        print(r.read().decode()[:400])
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode()[:400])

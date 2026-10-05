# -*- coding: utf-8 -*-
"""把所有直播间的 wechat_channels 配置替换为真实视频号 ID（其余平台配置原样保留）。"""
import json
import os
import urllib.request

BASE = "https://e.joho.cn"
FID = "sphVymTBbxX448X"
NEW_URL = "wxchannels://finder=" + FID
SECRETS = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".secrets"))
PASS = open(os.path.join(SECRETS, "admin_pass.txt"), encoding="utf-8").read().strip()


def gql(endpoint, query, variables=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(
        BASE + endpoint,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


data = gql("/admin-api", 'mutation { login(username: "superadmin", password: "%s") { ... on CurrentUser { id } } }' % PASS)
token = None
# token 从响应头取：urllib 需要返回 headers，这里重新发一次拿 header
req = urllib.request.Request(BASE + "/admin-api", data=json.dumps({"query": 'mutation { login(username: "superadmin", password: "%s") { ... on CurrentUser { id } } }' % PASS}).encode(), headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=30) as r:
    token = r.headers.get("vendure-auth-token")
assert token, "no token"

for rid in ("1", "2", "3", "4", "5"):
    data = gql("/admin-api", 'query($id: ID!) { liveRoom(id: $id) { id name status platforms { platform externalUrl } } }', {"id": rid}, token=token)
    room = data.get("data", {}).get("liveRoom")
    if not room or not room["platforms"]:
        continue
    has_wx = any(p["platform"] == "wechat_channels" for p in room["platforms"])
    if not has_wx:
        print("room %s [%s] skip (no wechat_channels)" % (rid, room["name"]))
        continue
    if all(p["externalUrl"] == NEW_URL for p in room["platforms"] if p["platform"] == "wechat_channels"):
        print("room %s [%s] already up-to-date" % (rid, room["name"]))
        continue
    plats = [{"platform": p["platform"],
              "externalUrl": NEW_URL if p["platform"] == "wechat_channels" else p["externalUrl"]}
             for p in room["platforms"]]
    data = gql("/admin-api",
               'mutation($id: ID!, $plats: [LiveRoomPlatformInput!]!) { setLiveRoomPlatforms(roomId: $id, platforms: $plats) { id platforms { platform externalUrl } } }',
               {"id": rid, "plats": plats}, token=token)
    assert not data.get("errors"), data.get("errors")
    print("room %s [%s] updated:" % (rid, room["name"]), json.dumps(data["data"]["setLiveRoomPlatforms"]["platforms"], ensure_ascii=False))

# shop-api 读回验证
for rid in ("1", "2", "3", "4", "5"):
    data = gql("/shop-api", 'query($id: ID!) { liveRoom(id: $id) { id platforms { platform externalUrl } } }', {"id": rid})
    room = (data.get("data") or {}).get("liveRoom")
    if room and room["platforms"]:
        print("shop room %s:" % rid, json.dumps(room["platforms"], ensure_ascii=False))
    elif data.get("errors"):
        print("shop room %s: errors=%s" % (rid, json.dumps(data["errors"], ensure_ascii=False)[:120]))
print("DONE")

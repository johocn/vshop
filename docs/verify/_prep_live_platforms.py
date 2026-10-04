# -*- coding: utf-8 -*-
"""Task 8 数据准备（生产）：
1. 房间1 回写 douyin + wechat_channels（不还原，留作演示）
2. 确保房间1 status=live（形态一：pill 行 + hls 兜底）
3. 新建「平台分发演示间」ended + platforms（形态二：海报+go-btn）
4. 新建「无分发回归间」ended 无 platforms（回归：直播已结束文案）
5. shop-api 验证 C 端可读 platforms
凭据从 .secrets/admin_pass.txt 读取，不入库。
"""
import json
import os
import urllib.request

BASE = "https://e.joho.cn"
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
        return json.loads(r.read().decode()), r.headers


def must(res, label):
    errs = res.get("errors")
    if errs:
        print("[FAIL]", label, json.dumps(errs, ensure_ascii=False)[:300])
        raise SystemExit(1)
    return res


# 1. 登录
data, hdr = gql("/admin-api", 'mutation { login(username: "superadmin", password: "%s") { ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }' % PASS)
token = hdr.get("vendure-auth-token")
assert token, "no vendure-auth-token header"
cur = data["data"]["login"]
assert cur.get("id"), cur
print("[1] login OK id=%s" % cur["id"])

# 2. 房间1 现状
data, _ = gql("/admin-api", 'query { liveRoom(id: "1") { id name status playUrl platforms { platform externalUrl } } }', token=token)
room1 = must(data, "liveRoom 1")["data"]["liveRoom"]
print("[2] room1 before:", json.dumps(room1, ensure_ascii=False))

# 3. 确保房间1 live
if room1["status"] != "live":
    data, _ = gql("/admin-api", 'mutation { startLiveRoom(id: "1") { id status } }', token=token)
    must(data, "startLiveRoom")
    print("[3] room1 started")

# 4. 回写 platforms（整清单，不还原）
data, _ = gql("/admin-api", '''mutation {
  setLiveRoomPlatforms(roomId: "1", platforms: [
    { platform: "douyin", externalUrl: "https://live.douyin.com/joho_demo" },
    { platform: "wechat_channels", externalUrl: "wxchannels://finder=johocn_shop" }
  ]) { id platforms { platform externalUrl } }
}''', token=token)
plats = must(data, "setLiveRoomPlatforms")["data"]["setLiveRoomPlatforms"]["platforms"]
assert {p["platform"] for p in plats} == {"douyin", "wechat_channels"}, plats
print("[4] room1 platforms:", json.dumps(plats, ensure_ascii=False))

# 5. 形态二演示间（ended + platforms）
data, _ = gql("/admin-api", 'mutation { createLiveRoom(input: { name: "平台分发演示间", type: "normal" }) { id } }', token=token)
demo_id = must(data, "create demo")["data"]["createLiveRoom"]["id"]
gql("/admin-api", 'mutation { stopLiveRoom(id: "%s", replayUrl: "") { id status } }' % demo_id, token=token)
data, _ = gql("/admin-api", 'mutation { setLiveRoomPlatforms(roomId: "%s", platforms: [ { platform: "wechat_channels", externalUrl: "wxchannels://finder=johocn_shop" } ]) { id platforms { platform } } }' % demo_id, token=token)
must(data, "demo platforms")
print("[5] demo room id=%s (ended + wechat_channels)" % demo_id)

# 6. 无分发回归间（ended 无 platforms）
data, _ = gql("/admin-api", 'mutation { createLiveRoom(input: { name: "无分发回归间", type: "normal" }) { id } }', token=token)
plain_id = must(data, "create plain")["data"]["createLiveRoom"]["id"]
gql("/admin-api", 'mutation { stopLiveRoom(id: "%s", replayUrl: "") { id status } }' % plain_id, token=token)
print("[6] plain room id=%s (ended, no platforms)" % plain_id)

# 7. C 端 shop-api 验证（默认渠道）
for rid in ("1", demo_id, plain_id):
    data, _ = gql("/shop-api", 'query($id: ID!) { liveRoom(id: $id) { id name status platforms { platform externalUrl } } }', {"id": rid})
    room = must(data, "shop read %s" % rid)["data"]["liveRoom"]
    print("[7] shop room %s:" % rid, json.dumps({k: room[k] for k in ("status", "platforms")}, ensure_ascii=False))

print("DONE room1=1 demo=%s plain=%s" % (demo_id, plain_id))

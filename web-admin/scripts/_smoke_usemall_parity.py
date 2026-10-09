# -*- coding: utf-8 -*-
"""usemall→vshop 全功能差距矩阵 生产探针（只读，不写任何数据）

用法（PowerShell）：
    python web-admin/scripts/_smoke_usemall_parity.py
可选环境变量（与 _smoke_usemall_align.py 同源）：
    SHOP_API_URL（默认 https://e.joho.cn/shop-api）、VENDURE_TOKEN、AUTH_TOKEN

口径（计划 0.7）：
- 只打无需登录的公开查询与 introspection；CHECKS 仅覆盖矩阵 Task 2
  「Vendure 后端」列「注册:是」且有公开 Query 的功能；
- Query 名取自 Task 2 盘点的真实 SDL（coupon-plugin plugin.ts L522-531；
  秒杀/拼团沿 _smoke_usemall_align.py 已实证写法）；
- 需登录态 / 无公开 Query / 纯写操作的功能不进 CHECKS，尾部打印 SKIP 清单。
"""
import json
import os
import urllib.error
import urllib.request

SHOP_API = os.environ.get("SHOP_API_URL", "https://e.joho.cn/shop-api")
VENDURE_TOKEN = os.environ.get("VENDURE_TOKEN", "")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if VENDURE_TOKEN:
        headers["vendure-token"] = VENDURE_TOKEN
    if AUTH_TOKEN:
        headers["Authorization"] = "Bearer " + AUTH_TOKEN
    req = urllib.request.Request(SHOP_API, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {detail}") from None


# 1) introspection：一次拿全 schema Query 字段名
INTROSPECT = "query { __schema { queryType { fields { name } } } }"
names = {f["name"] for f in gql(INTROSPECT)["data"]["__schema"]["queryType"]["fields"]}

# 2) 每功能一条定向查询（存在性 + 可出数据）。F12 无专属 Query，
#    用 __type introspection 断言 ChannelCustomFields 暴露（兜底口径）。
CHECKS = [
    ("F06", "领券中心", "query { couponCentre { id } }",
     lambda d: "couponCentre" in d),
    ("F06", "领券中心即将开始", "query { couponCentreUpcoming { id } }",
     lambda d: "couponCentreUpcoming" in d),
    ("F12", "店铺装修customFields(Channel)",
     'query { __type(name:"ChannelCustomFields"){ fields { name } } }',
     lambda d: bool(d.get("__type"))
     and "shopContent" in {f["name"] for f in d["__type"]["fields"]}),
    ("F13", "积分商城模板", "query { pointsMallTemplates { id } }",
     lambda d: "pointsMallTemplates" in d),
    ("F23", "进行中秒杀活动",
     "query { activeFlashSaleActivities { id productId variantId endAt totalStock soldCount status } }",
     lambda d: "activeFlashSaleActivities" in d),
    ("F23", "进行中拼团活动",
     "query { activeGroupBuyActivities { id productId variantId groupPrice endAt } }",
     lambda d: "activeGroupBuyActivities" in d),
]

# SKIP：需登录态（my*/会话绑定）、无公开 Query（注册:否/无承载）或纯写操作
SKIP = [
    ("F01", "需登录态：myOrderTracks/myOrderPackages/confirmOrderReceipt 均绑定客户订单"),
    ("F02", "无后端承载：海报纯 C 端 canvas 生成"),
    ("F03", "需登录态+写操作：createRechargeOrder/createWechatRechargePayment/redeemRechargeCard"),
    ("F04", "需登录态：myRechargeBalance/myBalanceTransactions/myRechargeOrders"),
    ("F05", "需登录态+写操作：requestWithdrawal/myWithdrawalRequests"),
    ("F07", "需登录态：myCoupons；applyCouponToOrder 需购物车会话（公开面由 F06 couponCentre 覆盖）"),
    ("F08", "需登录态：applyDistributor/myDistributorProfile/myCommissionRecords/myTeamSummary"),
    ("F09", "无插件专属 Query：core product variants 承载（introspection 已含 products/product）"),
    ("F10", "注册:条件env 且均为写操作：sendPhoneVerificationCode 会发短信，探针不触发"),
    ("F11", "无后端承载：全仓无 feedback/FAQ 后端"),
    ("F14", "需登录态：myPointsHistory"),
    ("F15", "无后端承载：core search 承担，纯 C 端版式"),
    ("F16", "无插件专属 Query：core Collection/facetValue 承载"),
    ("F17", "需登录态：myMemberInfo/myTier"),
    ("F18", "需登录态：checkinToday/checkin 绑定当前客户会话"),
    ("F19", "后端 community-plugin 注册:否（生产 schema 无公开社区 Query）"),
    ("F20", "无后端承载：全仓无 lottery/抽奖插件"),
    ("F21", "无公开 Query：shippingFee 为包裹字段/计算器，delivery-plugin 仅 admin-api"),
    ("F22", "无后端承载：激励视频为端内广告能力"),
]


def summarize(data):
    parts = []
    for k, v in data.items():
        if isinstance(v, list):
            parts.append(f"{k}={len(v)}条")
        elif isinstance(v, dict):
            parts.append(f"{k}({len(v)}字段)")
        else:
            parts.append(k)
    return " ".join(parts) if parts else "空data"


def main():
    print(f"== 探针目标：{SHOP_API} ==")
    print(f"== introspection: {len(names)} query fields ==")
    for fid, desc, q, assert_fn in CHECKS:
        try:
            resp = gql(q)
            if resp.get("errors"):
                print(f"[FAIL] {fid} {desc}: graphql errors {str(resp['errors'])[:200]}")
                continue
            data = resp.get("data") or {}
            ok = assert_fn(data)
            print(f"[{'OK' if ok else 'EMPTY'}] {fid} {desc} ({summarize(data)})")
        except Exception as e:
            print(f"[FAIL] {fid} {desc}: {e}")
    print("== SKIP（需登录态/无公开Query，静态验证 SDL 暴露即可）==")
    for fid, reason in SKIP:
        print(f"  SKIP {fid}: {reason}")


if __name__ == "__main__":
    main()

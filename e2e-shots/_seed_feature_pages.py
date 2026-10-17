# -*- coding: utf-8 -*-
"""为功能页面手机截图造数（本地 dev-server）：拼团活动 + 已发货订单 + 已同意售后单。

链路：shop(audit 账号) 注册登录 / 下单（加购→地址→快递配送→ArrangingPayment→dummy-payment 结算）；
admin(superadmin) 作废历史脏单 / 流转到 Shipped / 建拼团活动 / 批准售后单。
可重复运行：先作废上次的未完成订单，再走全新流程。
"""
import json
import urllib.request
from datetime import datetime, timedelta, timezone

SHOP = "http://localhost:3000/shop-api"
ADMIN = "http://localhost:3000/admin-api"
CHANNEL_TOKEN = "default-token"
PASS = "superadmin"
EMAIL = "audit-verify@example.com"
PWD = "Audit#2026"


def gql(url, query, variables=None, token=None, get_header=False):
    headers = {"Content-Type": "application/json", "vendure-token": CHANNEL_TOKEN}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                                 headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read().decode())
        if get_header:
            return r.headers.get("vendure-auth-token"), body
        return body


def ok(body, *path):
    node = body
    for p in path:
        node = node.get(p) if isinstance(node, dict) else None
    return node


def state_of(body, field):
    """取 Order/OrderResult 的 state；失败时打印错误并返回 None"""
    node = ok(body, "data", field) or {}
    return node.get("state")


print("== 0. shop register + login (audit account)")
gql(SHOP, 'mutation { registerCustomerAccount(input: { emailAddress: "%s", firstName: "Audit", lastName: "Verify", password: "%s" }) { ... on Success { success } ... on ErrorResult { message } } }' % (EMAIL, PWD))
AUTH, body = gql(SHOP, 'mutation { login(username: "%s", password: "%s") { ... on CurrentUser { id } ... on ErrorResult { message } } }' % (EMAIL, PWD), get_header=True)
assert AUTH, body
print("shop ok, customer", ok(body, "data", "login", "id"))

print("== 1. admin login")
admin_token, body = gql(ADMIN, 'mutation { login(username: "superadmin", password: "%s") { ... on CurrentUser { id } } }' % PASS,
                        get_header=True)
assert admin_token, body
print("admin ok")

print("== 1.5 cancel stale active order (rerun safety)")
body = gql(SHOP, "{ activeOrder { id state } }", None, AUTH)
stale = ok(body, "data", "activeOrder") or {}
if stale.get("id") and stale.get("state") not in (None, "Cancelled"):
    body = gql(ADMIN, 'mutation($id: ID!) { transitionOrderToState(id: $id, state: "Cancelled") { ... on Order { id state } ... on ErrorResult { message } } }',
               {"id": stale["id"]}, admin_token)
    print("stale order", stale["id"], "->", ok(body, "data", "transitionOrderToState", "state") or body)
else:
    print("no stale order")

print("== 2. pick a product variant")
body = gql(SHOP, '{ search(input: { take: 5, groupByProduct: false }) { items { productId productName productVariantId priceWithTax { ... on SinglePrice { value } ... on PriceRange { min } } } } }')
items = ok(body, "data", "search", "items") or []
assert items, body

def _price_of(x):
    p = x.get("priceWithTax") or {}
    return p.get("value", p.get("min", 0)) if isinstance(p, dict) else 0

item = min(items, key=_price_of)
pid, vid, price = str(item["productId"]), str(item["productVariantId"]), _price_of(item)
print("product:", item["productName"], "pid", pid, "vid", vid, "price", price)

print("== 3. create group-buy activity")
now = datetime.now(timezone(timedelta(hours=8)))
act_in = {
    "name": "功能验收拼团组", "description": "截图造数",
    "targetCount": 3, "maxCount": 10, "groupPrice": price,
    "startAt": (now - timedelta(hours=1)).isoformat(), "endAt": (now + timedelta(days=7)).isoformat(),
    "productId": pid, "variantId": vid,
}
body = gql(ADMIN, "mutation($input: CreateGroupBuyActivityInput!) { createGroupBuyActivity(input: $input) { id name status } }",
           {"input": act_in}, admin_token)
act = ok(body, "data", "createGroupBuyActivity")
assert act, body
print("activity:", act)

print("== 4. shop order for audit account")
body = gql(SHOP, "mutation($v: ID!) { addItemToOrder(productVariantId: $v, quantity: 1) { ... on Order { id code state lines { id quantity } } ... on ErrorResult { errorCode message } } }", {"v": vid}, AUTH)
order = ok(body, "data", "addItemToOrder")
assert order and order.get("id"), body
oid = str(order["id"])
print("order:", oid, order.get("state"))

body = gql(SHOP, 'mutation { setOrderShippingAddress(input: { fullName: "审计验证", streetLine1: "自由大路123号", city: "长春市", province: "吉林省", postalCode: "130000", countryCode: "CN", phoneNumber: "13800003333" }) { ... on Order { id } ... on ErrorResult { message } } }', None, AUTH)
print("address:", ok(body, "data", "setOrderShippingAddress", "id") or body)

body = gql(SHOP, "{ eligibleShippingMethods { id price description } }", None, AUTH)
ships = ok(body, "data", "eligibleShippingMethods") or []
# 排除自提方式，取普通快递配送（自提需额外选点，且流转语义不同）
delivery = [s for s in ships if "自提" not in (s.get("description") or "")] or ships
assert delivery, body
body = gql(SHOP, "mutation($m: [ID!]!) { setOrderShippingMethod(shippingMethodId: $m) { ... on Order { id state } ... on ErrorResult { message } } }",
           {"m": [delivery[0]["id"]]}, AUTH)
print("shipping:", state_of(body, "setOrderShippingMethod") or body)

print("== 5. arrange payment and settle")
body = gql(SHOP, 'mutation { transitionOrderToState(state: "ArrangingPayment") { ... on Order { id state } ... on ErrorResult { message } } }', None, AUTH)
print("arranging:", state_of(body, "transitionOrderToState") or body)

body = gql(SHOP, "{ eligiblePaymentMethods { id code } }", None, AUTH)
pays = ok(body, "data", "eligiblePaymentMethods") or []
assert pays, body
pay_code = next((p["code"] for p in pays if p["code"] == "dummy-payment"), pays[0]["code"])
body = gql(SHOP, "mutation($m: String!) { addPaymentToOrder(input: { method: $m, metadata: {} }) { ... on Order { id state } ... on ErrorResult { errorCode message } } }",
           {"m": pay_code}, AUTH)
pay_state = state_of(body, "addPaymentToOrder")
print("payment via", pay_code, "->", pay_state or body)
assert pay_state in ("PaymentSettled", "PaymentAuthorized", "Delivered", "Shipped", "Completed"), body

print("== 6. settle payment then ship")
# 本 fork：PaymentAuthorized 不能直接 transitionOrderToState 到 PaymentSettled，
# 须用 admin settlePayment 结算支付单，订单随附自动流转 PaymentSettled
body = gql(ADMIN, "query($id: ID!) { order(id: $id) { payments { id state } } }", {"id": oid}, admin_token)
payments = ok(body, "data", "order", "payments") or []
assert payments, body
body = gql(ADMIN, "mutation($id: ID!) { settlePayment(id: $id) { ... on Payment { id state } ... on ErrorResult { message } } }",
           {"id": payments[-1]["id"]}, admin_token)
print("settle:", json.dumps(ok(body, "data", "settlePayment"), ensure_ascii=False) or body)
# PaymentSettled -> Shipped 须走履约：addFulfillmentToOrder（manual-fulfillment 处理器）
body = gql(SHOP, "query($id: ID!) { order(id: $id) { lines { id quantity } } }", {"id": oid}, AUTH)
lines = ok(body, "data", "order", "lines") or []
ful_lines = [{"orderLineId": str(l["id"]), "quantity": l["quantity"]} for l in lines]
body = gql(ADMIN, "mutation($input: FulfillOrderInput!) { addFulfillmentToOrder(input: $input) { ... on Fulfillment { id state } ... on ErrorResult { errorCode message } } }",
           {"input": {"lines": ful_lines, "handler": {"code": "manual-fulfillment", "arguments": [
               {"name": "method", "value": "快递"}]}}}, admin_token)
print("fulfillment:", json.dumps(ok(body, "data", "addFulfillmentToOrder"), ensure_ascii=False) or body)
# 履约单 Pending -> Shipped -> Delivered（本地售后白名单=PaymentSettled/Delivered，订单须 Delivered）
ful = ok(body, "data", "addFulfillmentToOrder") or {}
if ful.get("id"):
    for st in ["Shipped", "Delivered"]:
        body = gql(ADMIN, "mutation($id: ID!, $st: String!) { transitionFulfillmentToState(id: $id, state: $st) { ... on Fulfillment { id state } ... on ErrorResult { errorCode message } } }",
                   {"id": ful["id"], "st": st}, admin_token)
        print("fulfillment ->", st, ":", json.dumps(ok(body, "data", "transitionFulfillmentToState"), ensure_ascii=False) or body)
body = gql(ADMIN, "query($id: ID!) { order(id: $id) { state } }", {"id": oid}, admin_token)
print("order state:", ok(body, "data", "order", "state"))

# 本地 dev-config 售后门槛：customFields.deliveryStatus 必须为 delivered
body = gql(ADMIN, 'mutation($input: UpdateOrderInput!) { setOrderCustomFields(input: $input) { id state customFields { deliveryStatus } } }',
           {"input": {"id": oid, "customFields": {"deliveryStatus": "delivered"}}}, admin_token)
print("deliveryStatus:", json.dumps(ok(body, "data", "setOrderCustomFields"), ensure_ascii=False) or body)

print("== 7. shop create after-sales request")
# 指定 orderLineId：maxRefund 取该行 proratedLinePrice（整单退款上限会被优惠后总额卡住）
body = gql(ADMIN, "query($id: ID!) { order(id: $id) { lines { id proratedLinePrice } } }", {"id": oid}, admin_token)
al_lines = ok(body, "data", "order", "lines") or []
assert al_lines, body
line_id = str(al_lines[0]["id"])
line_refund = min(price, al_lines[0].get("proratedLinePrice") or price)
body = gql(SHOP, "mutation($input: CreateAfterSalesRequestInput!) { createAfterSalesRequest(input: $input) { id state } }",
           {"input": {"orderId": oid, "orderLineId": line_id, "type": "return_refund", "reason": "七天无理由退货", "description": "功能页面截图造数",
                      "refundAmount": line_refund, "evidenceImages": []}}, AUTH)
req = ok(body, "data", "createAfterSalesRequest")
if not req:
    # 订单状态不满足（Shipped 校验失败等）时打印诊断信息后失败
    raise SystemExit("createAfterSalesRequest failed: %s" % json.dumps(body, ensure_ascii=False))
rid = str(req["id"])
print("after-sale:", req)

print("== 8. admin approve")
body = gql(ADMIN, "mutation($ids: [ID!]!) { batchApproveAfterSalesRequests(ids: $ids) { success } }", {"ids": [rid]}, admin_token)
print("approve:", body.get("data") or body)
body = gql(SHOP, "query { myAfterSalesRequests { items { id state orderId } } }", None, AUTH)
print("final after-sale state:", json.dumps(ok(body, "data", "myAfterSalesRequests", "items"), ensure_ascii=False))
print("SEEDED group-join activityId =", act["id"], " afterSaleId =", rid, " orderId =", oid)

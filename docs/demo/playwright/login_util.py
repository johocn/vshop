# -*- coding: utf-8 -*-
"""登录工具：通过 Admin API 登录获取会话 token，并注入 localStorage 供 web-admin 复用。
返回 (auth_token, channel_token, channel_code, channel_id, is_superadmin)。
用法：from login_util import admin_login_state
"""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ADMIN_API = "https://e.joho.cn/admin-api"
LOGIN_MUT = """
mutation($u:String!,$p:String!){
  login(username:$u, password:$p){
    __typename
    ... on CurrentUser { id identifier }
    ... on InvalidCredentialsError { errorCode message }
  }
}
"""
ACCESS_QUERY = """
query{ myTenantAccess {
  isSuperAdmin
  channels { id code token name enabled tenantNo isOfficial memberEnabled mustChangePassword }
  mustChangePassword
}}
"""

def _gql(url, query, variables, headers=None):
    req = Request(url, data=json.dumps({"query": query, "variables": variables}).encode(),
                  headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    with urlopen(req, timeout=30) as r:
        return r, json.loads(r.read().decode())


def _admin_gql(auth_token, query, variables=None):
    """以超管 token 调用 admin-api，返回 payload data。"""
    headers = {"Authorization": "Bearer " + auth_token}
    _, data = _gql(ADMIN_API, query, variables or {}, headers=headers)
    if data.get("errors"):
        raise RuntimeError("GQL error: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data.get("data") or {}

def admin_login(username, password):
    """返回 tuple: (auth_token, access_json, reset_token_flag_ignore)"""
    resp, data = _gql(ADMIN_API, LOGIN_MUT, {"u": username, "p": password})
    auth_token = resp.headers.get("vendure-auth-token") or ""
    body = data.get("data", {}).get("login") or {}
    return auth_token, body

def fetch_access(auth_token):
    headers = {"Authorization": "Bearer " + auth_token}
    _, data = _gql(ADMIN_API, ACCESS_QUERY, {}, headers=headers)
    return data.get("data", {}).get("myTenantAccess")

def admin_login_state(username, password, channel_code=None):
    """登录并返回可在页面注入 localStorage 的状态字典。channel_code 省略时选官方(默认)店铺。"""
    auth_token, body = admin_login(username, password)
    if not auth_token:
        raise RuntimeError(f"登录失败: {body}")
    access = fetch_access(auth_token)
    if not access:
        raise RuntimeError("myTenantAccess 为空")
    channels = access.get("channels") or []
    pick = None
    if channel_code:
        pick = next((c for c in channels if c.get("code") == channel_code), None)
    if pick is None:
        pick = next((c for c in channels if c.get("isOfficial")), None) or (channels[0] if channels else None)
    return {
        "auth_token": auth_token,
        "channel_token": pick.get("token") if pick else "",
        "channel_code": pick.get("code") if pick else "",
        "channel_id": pick.get("id") if pick else "",
        "channel_name": pick.get("name") if pick else "",
        "is_superadmin": bool(access.get("isSuperAdmin")),
        "must_change": bool(access.get("mustChangePassword")),
        "all_channels": access.get("channels") or [],
    }


# ---- 商户入驻/商品提审相关 Admin API 封装 ----
def superadmin_client():
    return admin_login_state("superadmin", "z123123", channel_code=None)["auth_token"]


def create_tenant(auth, name, is_official=False):
    q = """mutation($i:CreateTenantInput!){ createTenant(input:$i){ id code token
          customFields { shopName enabled tenantNo isOfficial merchantStatus } } }"""
    d = _admin_gql(auth, q, {"i": {"name": name, "isOfficial": is_official}})
    t = d["createTenant"]
    return {"id": t["id"], "code": t["code"], "token": t["token"],
            "name": t.get("customFields", {}).get("shopName") or name,
            "tenantNo": t.get("customFields", {}).get("tenantNo"),
            "isOfficial": t.get("customFields", {}).get("isOfficial")}


def list_tenants(auth):
    q = """query { tenants(options:{skip:0 take:100}){ items{ id code token
          customFields{ shopName enabled tenantNo isOfficial merchantStatus } } totalItems } }"""
    d = _admin_gql(auth, q)
    return d["tenants"]["items"]


def list_zones(auth):
    """查询全局区域列表（ZoneList.items），用于给新渠道设置默认税务/配送区域。"""
    q = """query { zones { items{ id name } } }"""
    d = _admin_gql(auth, q)
    return (d.get("zones") or {}).get("items") or []


def list_channel_products(auth, channel_token):
    """在指定渠道上下文下列出商品（含 marketplaceStatus）。"""
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    q = """query { products(options:{take:100}){ items{ id slug
          customFields{ marketplaceStatus } } totalItems } }"""
    req = Request(ADMIN_API, data=json.dumps({"query": q}).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    with urlopen(req, timeout=40) as r:
        data = json.loads(r.read().decode())
    if data.get("errors"):
        raise RuntimeError("channel products err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]["products"]["items"]


def set_channel_default_tax_zone(auth, channel_token, channel_id, zone_id):
    """为指定渠道设置默认税务区域，解决 'active tax zone could not be determined'。"""
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    # updateChannel 返回 UpdateChannelResult 联合，需内联片段；input 需 id（用 vendure-token 定位 + id 双重保险）
    q = """mutation($i:UpdateChannelInput!){ updateChannel(input:$i){ ... on Channel{ id code defaultTaxZone{ id name } } } }"""
    body = {"query": q, "variables": {"i": {"id": channel_id, "defaultTaxZoneId": zone_id}}}
    req = Request(ADMIN_API, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            data = json.loads(r.read().decode())
    except HTTPError as e:
        raise RuntimeError("set tax zone HTTP%s: %s" % (e.code, e.read().decode()[:500]))
    if data.get("errors"):
        raise RuntimeError("set tax zone err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]["updateChannel"]


def tenant_roles(auth, channel_id):
    q = """query($id:ID!){ tenantRoles(channelId:$id){ id code description permissions } }"""
    return _admin_gql(auth, q, {"id": channel_id}).get("tenantRoles") or []


def import_default_roles(auth, channel_id):
    q = """mutation($id:ID!){ importDefaultRoles(channelId:$id){ id code description permissions } }"""
    return _admin_gql(auth, q, {"id": channel_id}).get("importDefaultRoles") or []


def tenant_administrators(auth, channel_id):
    q = """query($id:ID!){ tenantAdministrators(channelId:$id){
          id administratorId channelId enabled displayName remark phone roleIds createdAt } }"""
    return _admin_gql(auth, q, {"id": channel_id}).get("tenantAdministrators") or []


def create_tenant_administrator(auth, channel_id, email, role_ids, display_name=None, phone=None):
    q = """mutation($c:ID!,$i:CreateTenantAdministratorInput!){
          createTenantAdministrator(channelId:$c,input:$i){ id initialPassword } }"""
    inp = {"emailAddress": email, "roleIds": role_ids, "displayName": display_name or email}
    if phone:
        inp["phone"] = phone
    d = _admin_gql(auth, q, {"c": channel_id, "i": inp})
    return d["createTenantAdministrator"]


def create_product(auth, channel_token, payload):
    """按商户渠道上下文创建商品（不含 variants，createProduct 生产 schema 无 variants 参数）。"""
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    q = """
    mutation($i:CreateProductInput!){
      createProduct(input:$i){ id name slug
        customFields{ merchantRef{ id code } marketplaceStatus listedInMarketplace } } }"""
    body = {"query": q, "variables": payload}
    req = Request(ADMIN_API, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            data = json.loads(r.read().decode())
    except HTTPError as e:
        raise RuntimeError("product create HTTP%s: %s" % (e.code, e.read().decode()[:500]))
    if data.get("errors"):
        raise RuntimeError("product create err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]["createProduct"]


def add_product_variant(auth, channel_token, product_id, sku, price, stock, tax_category_id, variant_name):
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    q = """mutation($i:[CreateProductVariantInput!]!){
      createProductVariants(input:$i){ id sku enabled } }"""
    inp = [{"productId": product_id, "sku": sku, "price": price,
            "trackInventory": "TRUE", "stockOnHand": stock,
            "taxCategoryId": tax_category_id,
            "translations": [{"languageCode": "zh_Hans", "name": variant_name}]}]
    body = {"query": q, "variables": {"i": inp}}
    req = Request(ADMIN_API, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urlopen(req, timeout=40) as r:
            data = json.loads(r.read().decode())
    except HTTPError as e:
        raise RuntimeError("variant create HTTP%s: %s" % (e.code, e.read().decode()[:500]))
    if data.get("errors"):
        raise RuntimeError("variant create err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]["createProductVariants"]


def product_marketplace_status(auth, channel_token, product_id):
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    q = """query($id:ID!){ product(id:$id){ id slug customFields{ marketplaceStatus } } }"""
    body = {"query": q, "variables": {"id": product_id}}
    req = Request(ADMIN_API, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    with urlopen(req, timeout=40) as r:
        data = json.loads(r.read().decode())
    if data.get("errors"):
        raise RuntimeError("product get err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]["product"]


def submit_for_marketplace(auth, channel_token, product_id):
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    q = """mutation($id:ID!){ submitForMarketplaceAdmin(productId:$id) }"""
    body = {"query": q, "variables": {"id": product_id}}
    req = Request(ADMIN_API, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json", **headers}, method="POST")
    with urlopen(req, timeout=40) as r:
        data = json.loads(r.read().decode())
    if data.get("errors"):
        raise RuntimeError("submit err: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data["data"]


def marketplace_pending(auth):
    q = """query { marketplacePendingProducts { id
          translations{ languageCode name } customFields{ marketplaceStatus rejectReason } } }"""
    return _admin_gql(auth, q).get("marketplacePendingProducts") or []


def approve_product(auth, product_id):
    q = """mutation($id:ID!){ approveMarketplaceProduct(productId:$id) }"""
    return _admin_gql(auth, q, {"id": product_id})


# ---- 配送/支付档案 封装（分箱/拆单验证用；channel_token 走 vendure-token 定位租户渠道）----
def _admin_gql_ch(auth, channel_token, query, variables=None):
    """以超管 token + 指定渠道(租户)上下文调 admin-api，返回 payload data。"""
    headers = {"Authorization": "Bearer " + auth, "vendure-token": channel_token}
    _, data = _gql(ADMIN_API, query, variables or {}, headers=headers)
    if data.get("errors"):
        raise RuntimeError("GQL(channel) error: " + json.dumps(data["errors"], ensure_ascii=False)[:500])
    return data.get("data") or {}


def list_shipping_profiles(auth, channel_token=""):
    """列出(租户上下文)配送档案。channel_token 为空=全局视角。"""
    q = """query { shippingProfiles(options:{skip:0 take:100}){ items{
      id code name isGlobal isTenantDefault enabled paymentProfileId
      shippingMethods{ id code } } totalItems } }"""
    return _admin_gql_ch(auth, channel_token, q).get("shippingProfiles", {}).get("items") or []


def create_shipping_profile(auth, channel_token, name, code, shipping_method_ids,
                            is_global=False, payment_profile_id=None, description=None,
                            pickup_location_ids=None):
    """创建配送档案并绑定配送方式(可空绑定支付档案)。返回 ShippingProfile dict。"""
    inp = {"name": name, "code": code, "isGlobal": is_global,
           "shippingMethodIds": [str(x) for x in shipping_method_ids]}
    if description is not None:
        inp["description"] = description
    if payment_profile_id is not None:
        inp["paymentProfileId"] = payment_profile_id
    if pickup_location_ids:
        inp["pickupLocationIds"] = [str(x) for x in pickup_location_ids]
    q = """mutation($i:CreateShippingProfileInput!){ createShippingProfile(input:$i){
      id code name isGlobal isTenantDefault paymentProfileId shippingMethods{ id code } } }"""
    return _admin_gql_ch(auth, channel_token, q, {"i": inp}).get("createShippingProfile")


def set_tenant_default_shipping_profile(auth, channel_token, profile_id):
    """将某配送档案设为该租户默认(唯一)。返回 Boolean。"""
    q = """mutation($id:ID!){ setTenantDefaultShippingProfile(id:$id) }"""
    return _admin_gql_ch(auth, channel_token, q, {"id": profile_id}).get("setTenantDefaultShippingProfile")


def assign_shipping_profile(auth, channel_token, variant_ids, profile_id):
    """将变体分配/绑定到配送档案(变体级 shippingProfileId)。返回 Boolean。"""
    q = """mutation($variantIds:[ID!]!,$profileId:ID!){ assignShippingProfile(variantIds:$variantIds, profileId:$profileId) }"""
    return _admin_gql_ch(auth, channel_token, q,
                         {"variantIds": [str(x) for x in variant_ids], "profileId": str(profile_id)}).get("assignShippingProfile")


def list_payment_profiles(auth, channel_token=""):
    """列出(租户上下文)支付档案。channel_token 为空=全局视角。"""
    q = """query { paymentProfiles(options:{skip:0 take:100}){ items{
      id code name isGlobal isTenantDefault enabled paymentMethods{ id code } } totalItems } }"""
    return _admin_gql_ch(auth, channel_token, q).get("paymentProfiles", {}).get("items") or []


def create_payment_profile(auth, channel_token, name, code, payment_method_ids,
                           is_global=False, description=None):
    """创建支付档案并绑定支付方式(白名单)。返回 PaymentProfile dict。"""
    inp = {"name": name, "code": code, "isGlobal": is_global,
           "paymentMethodIds": [str(x) for x in payment_method_ids]}
    if description is not None:
        inp["description"] = description
    q = """mutation($i:CreatePaymentProfileInput!){ createPaymentProfile(input:$i){
      id code name isGlobal isTenantDefault paymentMethods{ id code } } }"""
    return _admin_gql_ch(auth, channel_token, q, {"i": inp}).get("createPaymentProfile")


def set_tenant_default_payment_profile(auth, channel_token, profile_id):
    """将某支付档案设为该租户默认(唯一)。返回 Boolean。"""
    q = """mutation($id:ID!){ setTenantDefaultPaymentProfile(id:$id) }"""
    return _admin_gql_ch(auth, channel_token, q, {"id": profile_id}).get("setTenantDefaultPaymentProfile")


def assign_payment_profile(auth, channel_token, variant_ids, profile_id):
    """将变体分配/绑定到支付档案。返回 Boolean。"""
    q = """mutation($variantIds:[ID!]!,$profileId:ID!){ assignPaymentProfile(variantIds:$variantIds, profileId:$profileId) }"""
    return _admin_gql_ch(auth, channel_token, q,
                         {"variantIds": [str(x) for x in variant_ids], "profileId": str(profile_id)}).get("assignPaymentProfile")


def admin_wallet(auth):
    """查询全局共享余额钱包(余额单位为分)。"""
    return _admin_gql(auth, "query { wallet { id balance currencyCode } }").get("wallet")


def admin_credit_wallet(auth, amount):
    """给全局共享钱包充值 amount 分。返回 Wallet dict。"""
    return _admin_gql(auth, "mutation($a:Int!){ adminCreditWallet(amount:$a){ id balance } }", {"a": amount}).get("adminCreditWallet")


def admin_debit_wallet(auth, amount):
    """从全局共享钱包扣减 amount 分。返回 Wallet dict。"""
    return _admin_gql(auth, "mutation($a:Int!){ adminDebitWallet(amount:$a){ id balance } }", {"a": amount}).get("adminDebitWallet")


if __name__ == "__main__":
    import sys
    u = sys.argv[1] if len(sys.argv) > 1 else "superadmin"
    p = sys.argv[2] if len(sys.argv) > 2 else "z123123"
    st = admin_login_state(u, p)
    print(json.dumps(st, ensure_ascii=False, indent=2))
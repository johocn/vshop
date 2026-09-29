# -*- coding: utf-8 -*-
"""vshop 对齐 usemall 版式 —— 生产 shop-api 只读探针（不写任何数据）

用法（PowerShell）：
    $env:SHOP_API_URL="https://e.joho.cn/shop-api"
    $env:VENDURE_TOKEN="<渠道 token>"
    $env:AUTH_TOKEN="<C 端用户 token>"
    python web-admin/scripts/_smoke_usemall_align.py
"""
import json
import os
import urllib.error
import urllib.request

SHOP_API_URL = os.environ.get("SHOP_API_URL", "https://e.joho.cn/shop-api")
VENDURE_TOKEN = os.environ.get("VENDURE_TOKEN", "")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")


def shop_api(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if VENDURE_TOKEN:
        headers["vendure-token"] = VENDURE_TOKEN
    if AUTH_TOKEN:
        headers["Authorization"] = "Bearer " + AUTH_TOKEN
    req = urllib.request.Request(SHOP_API_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"HTTP {e.code} {e.reason}：{detail}") from None
    if payload.get("errors"):
        raise RuntimeError(payload["errors"])
    return payload["data"]


def check_flash() -> None:
    data = shop_api("{ activeFlashSaleActivities { id productId variantId endAt totalStock soldCount status } }")
    acts = data["activeFlashSaleActivities"]
    assert isinstance(acts, list), "activeFlashSaleActivities 应为列表"
    print(f"[flash] 活动数={len(acts)}")
    for a in acts:
        assert a.get("endAt"), f"活动 {a['id']} 缺 endAt"
        assert a.get("productId"), f"活动 {a['id']} 缺 productId"
        assert a.get("variantId"), f"活动 {a['id']} 缺 variantId"
    if not acts:
        print("[flash] 当前无进行中活动，跳过补拉断言（不算失败）")
        return
    ids = [a["productId"] for a in acts if a.get("productId")]
    # 注意：Vendure 的 ProductFilter.id.in 是 [String!]，写成 [ID!] 会被 GraphQL 校验拒绝
    q = "query($ids:[String!]!){ products(options:{filter:{id:{in:$ids}},take:50}){ items { id name } } }"
    products = shop_api(q, {"ids": ids})["products"]["items"]
    got = {str(p["id"]) for p in products}
    missing = [i for i in ids if str(i) not in got]
    assert not missing, f"以下 productId 补拉不到商品：{missing}"
    print(f"[flash] productId 断言通过（{len(ids)} 个全部可补拉）")


def check_group_buy() -> None:
    data = shop_api("{ activeGroupBuyActivities { id productId variantId groupPrice endAt } }")
    acts = data["activeGroupBuyActivities"]
    print(f"[group-buy] 活动数={len(acts)}")
    for a in acts:
        assert a.get("productId"), f"活动 {a['id']} 未返回 productId（Task 1 后端字段未上线？）"
        assert a.get("variantId"), f"活动 {a['id']} 未返回 variantId"
    print("[group-buy] productId/variantId 断言通过")


def check_facet_filter() -> None:
    collections = shop_api("{ collections(options:{topLevelOnly:true}){ items { id slug } } }")["collections"]["items"]
    if not collections:
        print("[facet] 无顶级分类，跳过")
        return
    slug = collections[0]["slug"]
    plain = shop_api("query($slug:String!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1}){ totalItems } }", {"slug": slug})["search"]["totalItems"]
    facets = shop_api("query($slug:String!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1}){ facetValues { facetValue { id } } } }", {"slug": slug})["search"]["facetValues"]
    ids = [f["facetValue"]["id"] for f in facets if f.get("facetValue")]
    if not ids:
        print("[facet] 该分类无 facet，跳过过滤断言")
        return
    filtered = shop_api(
        "query($slug:String!,$ids:[ID!]!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1,facetValueFilters:[{or:$ids}]}){ totalItems } }",
        {"slug": slug, "ids": ids},
    )["search"]["totalItems"]
    print(f"[facet] 不带过滤={plain} 带过滤={filtered}")
    assert filtered != plain, "带 facetValueFilters 后 totalItems 未变化，服务端过滤可能未生效"
    print("[facet] 服务端过滤生效断言通过")


def check_cart_selection() -> None:
    # shop-api 的 ProductVariant.enabled 由 cjk-plugin 的 shopApiExtensions 扩展暴露
    # （Vendure 默认只在 admin-api 暴露该字段），C 端据此判定购物车「已下架」失效行。
    data = shop_api("{ activeOrder { id lines { id quantity productVariant { id enabled stockLevel } } } }")
    order = data.get("activeOrder")
    if not order:
        print("[cart] 无 activeOrder，跳过（需登录且有购物车）")
        return
    print(f"[cart] activeOrder 行数={len(order['lines'])}（人工核对：勾选 N 行结算时应为 N）")
    for line in order["lines"]:
        v = line.get("productVariant")
        assert v and "stockLevel" in v, f"行 {line['id']} 的 productVariant 缺 stockLevel"
        assert isinstance(v.get("enabled"), bool), f"行 {line['id']} 的 productVariant.enabled 未暴露（应为 Boolean）"
    print("[cart] ORDER_FRAGMENT 的 enabled / stockLevel 断言通过")


if __name__ == "__main__":
    print(f"== 探针目标：{SHOP_API_URL} ==")
    check_flash()
    check_group_buy()
    check_facet_filter()
    check_cart_selection()
    print("== 全部断言通过 ==")

# 门店自提 · 全流程演示文档

> 场景：t1 第三方租户（店铺）发布商品、配置配送/支付档案 → 提交上架到平台默认商城 → 平台超管审批通过 → C 端顾客门店自提下单并付款 → 商品备货生成核销码 → 顾客到店 → t1 销售在门店收银台（POS）核销订单并确认收款。
>
> 系统：Vendure 多租户电商后端 + vshop uni-app（C 端 H5 + 租户后台 web-admin）。
> 演示日期：2026-08-26（生产环境  POSTGRES）

---

## 1. 账号清单

| 角色 | 登录端 | 账号 | 密码 | 归属 |
| --- | --- | --- | --- | --- |
| 平台超管 | 租户后台 web-admin | `superadmin` | `z123123` | 平台（default 商城） |
| t1 租户店主/销售 | 租户后台 web-admin | `zhao@163.com` | `23123` | t1 店铺 |
| C 端顾客（兼买家/店主） | C 端 H5 | `zhao@163.com` | `23123` | t1 店铺顾客 |

> 说明：演示为单账号双身份（shop-api 买家 + admin-api 收银员）；C 端另一个示例顾客为 `customer@joho.cn`（王小明）。

## 2. 入口地址

- C 端商城（nshop/Nuxt）：`https://www.youshop.cn`
- 租户后台（web-admin）登录：`https://e.joho.cn/guanli`
- 后端 GraphQL：
  - Shop API：`https://e.joho.cn/shop-api`
  - Admin API：`https://e.joho.cn/admin-api`

## 3. 业务配置

### 3.1 商品（t1 店铺）
- 商品：**便携蓝牙音箱**（product id=3），SKU 变体 **SPK-BT-01 · 石墨黑**（variant id=6）
- 售价：¥129.00（对应应付分 12900）

### 3.2 配送档案（门店自提）
- **自由大路自提点**（pickup location id=3，type=point）
- 地址：吉林省长春市朝阳区自由大路123号；营业 09:00-21:00；联系人 王店长 13800138000
- 配送方式：门店自提（store-pickup，shippingMethod id=1）

### 3.3 支付档案（到店固定聚合码）
- 收款方式：**固定聚合码收款**（paymentMethod id=3，fixed-aggregate-collection）
- t1 支付档案已关联该收款方式（paymentMethodIds=["3"]）

## 4. 全流程操作路径

### 第 1 步 · t1 店铺发布商品
- 登录入口：t1 店主 `zhao@163.com` 登录后台 → 商品 → 新增商品 → 录入「便携蓝牙音箱」及 SKU 石墨黑
- 截图：`01-superadmin-t1-dashboard.png`（超管查看 t1 店铺工作台）

### 第 2 步 · 配置配送档案 / 门店自提
- 后台 → 履约/配置 → 配送方式 → 新增「门店自提」；并维护自提点「自由大路自提点」（自提点 id=3）
- 支付方式：后台 → 履约/配置 → 支付方式 → 关联「固定聚合码收款」（paymentMethod id=3）

### 第 3 步 · 提交上架到平台默认商城
- t1 后台商品列表 → 将该商品「提交上架」到 default 商城，等待平台审批
- 商品状态：`listedInMarketplace=true`，`marketplaceStatus=pending`

### 第 4 步 · 平台超管审批通过
- 入口：`superadmin / z123123` 登录后台 → 商品/市场审批 → 通过「便携蓝牙音箱」
- 结果：`approveMarketplaceProduct(productId:3)` → `marketplaceStatus=approved`
- 截图：`00-superadmin-login.png`、`02-product-approval-pending.png`（商品上架审批页，蓝牙音箱已在本次演示前置操作中通过）
- 校验（Admin API）：product 3 `{ listedInMarketplace:true, marketplaceStatus:"approved" }`，default 商城检索可命中该商品。

### 第 5 步 · C 端顾客门店自提下单并付款
- C 端商城 `https://www.youshop.cn`（手机访问模拟）
- 路径：进店 → 数码电子分类 → 商品详情「便携蓝牙音箱」→ 加入购物车 → 结算 → 选择**门店自提（自由大路自提点）** + **固定聚合码收款** → 提交订单
- 订单：#WJ2FCSW9NQXG4X69（order id=28），应付 ¥129.00，`deliveryType=pickup`
- 支付：固定聚合码 → `createPayment` 返回 Authorized（订单 PaymentAuthorized）→ 店主在 Admin 侧 `settlePayment` → 支付 Settled，订单自动 `PaymentSettled`
- 截图：`c_shop_home`、`c1_category_electronics`、`c2_product_detail`、`c3_after_add_cart`、`c4_checkout`、`c5_checkout_store_bank`、`c6_order_confirmation`、`c_shop_home_mobile`

### 第 6 步 · t1 店铺备货，生成自提核销码
- t1 店主在 Admin API 履约订单：`addFulfillmentToOrder`（method=到店自提）→ `transitionFulfillmentToState(Shipped)` → 订单 → Shipped
- 顾客端取码：`myPickupCode(orderId:28)` → **核销码 FTW68F**，status=`generated`
- 核销码（PickupRedemption id=4）

### 第 7 步 · 顾客到店，t1 销售在门店收银台 POS 核销并确认收款
- 入口：t1 店主 `zhao@163.com` 登录后台 → 门店收银（`#/pages/pos/index`）
- 输入核销码 `FTW68F` 查询 → 显示订单 #WJ2FCSW9NQXG4X69 · 待核销 · 顾客 TestZhao · 应付 ¥129.00 · 待交付商品 石墨黑 ×1
- 点「确认收款」→ 完成核销 + 确认收款，界面回到初始查询态
- 截图：`p1_pos_cashier`、`p2_pos_pending_confirm`、`p3_pos_after_confirm`

## 5. 闭环验证结果（Admin API 实测）

```jsonc
// 核销码 FTW68F
{
  "id": "4",
  "orderId": "28",
  "orderCode": "WJ2FCSW9NQXG4X69",
  "code": "FTW68F",
  "status": "redeemed",        // 已核销
  "claimedAt": "2026-08-26T08:57:49Z",
  "claimChannel": "shop"       // 门店收银台核销
}

// 订单 28
{
  "state": "Delivered",                         // 订单终态已送达
  "fulfillments": [{ "state": "Delivered", "method": "到店自提" }],
  "customFields": { "deliveryType": "pickup", "pickupClaimed": true }
}
```

- 核销码一次性：对已核销核销码再次 `claimPickupByShop` 将被拒绝（`rejected`）。

## 6. 截图清单（`vshop/docs/demo/shots/`）

| 阶段 | 文件 | 内容 |
| --- | --- | --- |
| 后台登录 | `00-superadmin-login.png` | 超管登录后台工作台 |
| 平台审批 | `02-product-approval-pending.png` | 超管商品上架审批页 |
| 租户就绪 | `01-superadmin-t1-dashboard.png` | t1 店铺工作台 |
| C 端逛店 | `c_shop_home.png` / `c_shop_home_mobile.png` | 商城首页（PC / 手机） |
| C 端分类 | `c1_category_electronics.png` | 数码电子分类 |
| C 端详情 | `c2_product_detail.png` | 便携蓝牙音箱详情 |
| C 端加购 | `c3_after_add_cart.png` | 已加入购物车 |
| C 端结算 | `c4_checkout.png` | 结算页 |
| C 端配送/支付 | `c5_checkout_store_bank.png` | 门店自提 + 固定聚合码收款 |
| C 端下单成功 | `c6_order_confirmation.png` | 订单确认（待核销） |
| POS 收银台 | `p1_pos_cashier.png` | 门店收银入口 |
| POS 待核销 | `p2_pos_pending_confirm.png` | 核销码查询命中，待确认收款 |
| POS 核销完成 | `p3_pos_after_confirm.png` | 确认收款完成，界面复位 |

> 备注：截图文件置于 `docs/demo/shots/` 集中管理，供本演示文档与运营/售前使用。
# web-admin 商品经营闭环 + 图片库设计文档

- 日期：2026-08-23
- 项目：vshop 的 web-admin（`d:\zhao\vshop\web-admin`，手机管理后台，访问 `https://e.joho.cn/guanli`）
- 技术栈：uni-app CLI（Vue3 + Vite）+ graphql-request 直连 Vendure `admin-api`
- 关联：承接 2026-08-22-vshop-tenant-admin-design.md（手机管理后台总体设计）

---

## 1. 背景与目标

web-admin 已具备完整骨架与 API 层，但多数管理页仍是**半成品或只读列表**。「商品」是销售最常用、最直接卖货的模块，却最薄弱：新增/编辑只有名称+slug+状态，缺图片/价格/库存/描述；列表只读；图片只能填 URL。

但「商品卖货闭环」不只是一张商品表单——它依赖的基础档案（**分类、配送档案、支付档案**）和商品级多配送能力必须一并设计，否则商品建完没处挂配送、按不了分类，等于白做。

本需求要把商品及其经营档案补成销售能直接在手机上卖货的完整闭环，并配套图片库作为上传与选图中枢。

### 目标
1. **商品闭环**：新增/编辑/列表增强/库存预警四件套。
2. **图片库**：上传集中管理、按渠道天然隔离、商品从图库选图复用。
3. **经营档案**：分类增删改、配送档案、支付档案，手机上一屏管好。
4. **商品级多配送/支付**：商品选 profile，结算自动按交集过滤。

### 非目标（本次不做，后续迭代）
- 营销（促销/优惠券）——全新页面+动态表单，复杂度最高，下一期
- 多 SKU / 规格
- 按「上传者」筛选图片、图片名称模糊搜索
- 文件夹 / 多维分类的完整图片库中枢

---

## 2. 关键决策与取舍

| 决策点 | 选择 | 理由 |
|---|---|---|
| 商品形态 | **单 SKU 商品** | 生鲜/食品/日用 SKU 少，手机表单最简；一个商品 = 唯一 Variant |
| 库存来源 | **商品自带库存** | 不依赖仓库/批次体系，商品页直接维护 |
| 图片来源 | **原生相册选图上传 + 资产库** | 手机实操必须能真传图 |
| 图片库方案 | **方案 A：渠道隔离 + 前端图片库，后端零改动** | Vendure 原生 `assets` + `vendure-token` 天然按租户隔离 |
| 经营档案 | **复用 cjk-plugin 已有 profile 模型** | ShippingProfile/PaymentProfile 后端 CRUD+交集过滤已完备，纯前端页面 |
| 分类 | **Collection 增删改（product-id-filter）** | 商品按分类归属，列表可筛选 |
| 商品级多配送 | **商品选 shippingProfileId/paymentProfileId** | 走既有 profile 档案，结算已自动交集过滤，无需新建 checker |
| 预警线 | **常量 5（源码）** | 本期不做配置界面，后续可配 |

### 取舍说明（后端零改动边界）
探查确认：分类/配送/支付/营销四块 Vendure **全部原生支持 CRUD**；ShippingProfile/PaymentProfile 已在 cjk-plugin 完整实现（实体、Admin CRUD、Shop 交集查询、assign 接口、ProductVariant 字段、渠道隔离 `ownerChannelId`+`channels`）。因此**本期后端零改动**，全部是 web-admin 前端开发。

---

## 3. 系统架构

```
┌─ 手机浏览器 ─ e.joho.cn/guanli ─┐
│  web-admin（uni-app H5 子工程）    │
│  src/apis/  asset/product/collection/shipping-profile/payment-profile
│  src/components/ ImagePicker / ProductForm
│  src/pages/ media/library · product/* · shipping/profile · payment/profile
└──────────────┬───────────────────┘
               │ Authorization: Bearer <authToken>
               │ vendure-token: <channelToken>   ← 按渠道天然隔离
               ▼
          Nginx e.joho.cn
        location /admin-api （反代 Vendure admin）
               ▼
          Vendure admin-api（后端零改动）
    商品/资产/ Collection / cjk-plugin ShippingProfile/PaymentProfile
```

---

## 4. 图片库（方案 A）

### 4.1 后端复用（零开发）
| 能力 | Vendure 原生 |
|---|---|
| 上传 | `createAssets(input:{ file: Upload! })` |
| 租户隔离 | admin-api 带 `vendure-token`，`assets()` 只返回当前渠道 Asset |
| 列表 | `assets(options){ totalItems items{ id preview name width height assetType } }` |
| 筛选 | `filter:{ assetType:{ eq: IMAGE } }`、`tags` |
| 删除 | `deleteAsset(assetId, force)` |
| 分类 | `tags`（上传打 tag 当分类） |

### 4.2 文件
| 文件 | 动作 | 内容 |
|---|---|---|
| `src/apis/asset.ts` | 新增 | `uploadAsset(file)`、`fetchAssets(paging)`、`deleteAsset(id)`；内含独立 multipart |
| `src/components/ImagePicker.vue` | 新增 | 网格+上传+分页+单选/多选回调 |
| `src/pages/media/library/index.vue` | 新增 | 图片库独立管理页 |
| `src/pages/product/*` | 改动 | 用 ImagePicker 替代 URL 输入 |

### 4.3 上传（`asset.ts` 内独立 multipart）
现有 `client.ts` 固定 `Content-Type: application/json`，无法传文件。新增独立上传函数：拼接 GraphQL multipart（operations+map+file），fetch POST `{origin}/admin-api`，头带 `Authorization`+`vendure-token`（不设 Content-Type 让浏览器生成 boundary），解析 `createAssets` 返回 `{id, preview}`。

### 4.4 `ImagePicker.vue`
- 打开加载当前渠道图片库网格（6 列缩略，懒加载分页）
- 「选图/上传」切换：上传 → `uni.chooseImage` → `uploadAsset` → 追加并自动勾选
- 单选（主图）/ 多选（相册）
- 回调 `assets:[{id,preview}]`，第一张默认 `featuredAssetId`；点击预览/删除（带确认）

### 4.5 不在本节范围
按上传者筛选、名称模糊搜索（各留方案 B）；文件夹/多维分类（方案 C）。

---

## 5. 商品 create/edit 与列表

### 5.1 商品表单（create/edit 共用）
可复用组件 `src/components/ProductForm.vue`。

| 分组 | 字段 | 说明 |
|---|---|---|
| 基本信息 | 商品名（必填）、Slug、描述 | slug 默认由名称转，可改 |
| 图片 | 相册多图 + 主图 | ImagePicker（§4.4）；第一张默认主图 |
| 销售 | 价格（元，必填）、库存（件，必填）、SKU | 前端元→Vendure 分；库存走 stockLevels；SKU 默认 `P{时间戳}` |
| 档案 | 配送档案、支付档案（下拉单选） | 从 `shippingProfiles`/`paymentProfiles` 选，存 `customFields.shippingProfileId/paymentProfileId` |
| 分类 | 分类（下拉选择） | 选后关联到 Collection |
| 状态 | 上架/下架 | 默认上架 |

**新增两步创建（单 SKU）**：
1. `createProduct({translations{name slug}, assetIds, featuredAssetId})`
2. `createProductVariants([{productId, sku, price, stockLevels[{stockLocationId, stockOnHand}], trackInventory:true, assetIds}])`，同时写 customFields 的 shippingProfileId/paymentProfileId

**编辑**：读详情回填（含 featuredAsset、assets、变体 price/stockOnHand/trackInventory/customFields），保存 `updateProduct` + `updateProductVariants`；名称改则更新 slug。

**分类关联**：商品保存后，用 `updateCollection` 把该商品 id 写入所选分类 Collection 的 `product-id-filter.productIds`，并从旧分类移除（或按新选集合整体重算）。

### 5.2 商品列表增强（`product/list`）
| 能力 | 实现 |
|---|---|
| 主图列 | `featuredAsset.preview` 缩略 |
| 信息列 | 名称、slug、分类、价格、库存 |
| 低库存标红 | `stockOnHand <= 5`（常量）红字+「缺货」角标 |
| 搜索 | `products(filter:{ name:{ contains } })`（商品 filter 原生支持 contains） |
| 筛选 | tab：全部/上架/下架（`filter:{ enabled:{ eq } }`） |
| 分页 | `take/skip` 无限滚动或分页 |
| 快捷操作 | 行内上下架开关（复用 `setProductEnabled`）、点行进编辑 |

### 5.3 明确不在本节范围
多 SKU/规格；预警线阈值配置界面；商品搜索页按分类筛选（若分类做平移则一并接上）。

---

## 6. 分类 / 配送档案 / 支付档案（后端零开发）

### 6.1 分类（Collection）
`product/categories` 从只读改增删改。
| 项 | 内容 |
|---|---|
| mutation | `createCollection`/`updateCollection`/`deleteCollection` |
| 核心 | `filters` 用内置 `product-id-filter`，`productIds` 的 `products` 归集；商品名可搜索添加 |
| 页面 | 列表（含商品数）+ 新建/编辑表单（名称/slug）+ 删除 |
| 商品差额 | 商品表单选分类后调用 `updateCollection` 更新该分类的 productIds |

### 6.2 配送档案（ShippingProfile）
新增 `shipping/profile` 列表+表单页。
| 项 | 内容 |
|---|---|
| mutation | cjk-plugin `createShippingProfile`/`updateShippingProfile`/`deleteShippingProfile` |
| 输入 | name、code、description、isGlobal、freeShippingThreshold、shippingMethodIds（多选配送方式）、pickupLocationIds |
| 商品差额 | 商品表单下拉选 shippingProfileId |

### 6.3 支付档案（PaymentProfile）
新增 `payment/profile` 列表+表单页。
| 项 | 内容 |
|---|---|
| mutation | cjk-plugin `createPaymentProfile`/`updatePaymentProfile`/`deletePaymentProfile` |
| 输入 | name、code、description、isGlobal、installmentOptions、paymentMethodIds（多选支付方式） |
| 商品差额 | 商品表单下拉选 paymentProfileId |

### 6.4 商品级多配送/支付结算链路（已存在，无需改）
C 端 `extractProfileIds` 提取商品 profile → `eligibleShippingMethodsByProfile`/`eligiblePaymentMethodsByProfile` 求交集 → 只显示购物车所有商品都兼容的方式。因此「商品选 profile」即实现商品级多配送/支付，前端商品表单填好字段即自动生效。

---

## 7. 文件清单汇总

### 新增
| 文件 | 内容 |
|---|---|
| `web-admin/src/apis/asset.ts` | 图片上传/列表/删除 + multipart |
| `web-admin/src/apis/collection.ts` | 分类 CRUD |
| `web-admin/src/apis/shipping-profile.ts` | 配送档案 CRUD |
| `web-admin/src/apis/payment-profile.ts` | 支付档案 CRUD |
| `web-admin/src/components/ImagePicker.vue` | 选图组件 |
| `web-admin/src/components/ProductForm.vue` | 商品表单组件 |
| `web-admin/src/pages/media/library/index.vue` | 图片库页 |
| `web-admin/src/pages/shipping/profile/index.vue` | 配送档案页 |
| `web-admin/src/pages/payment/profile/index.vue` | 支付档案页 |

### 改造
| 文件 | 内容 |
|---|---|
| `web-admin/src/apis/product.ts` | 补变体/库存/分类字段、profile 字段 |
| `web-admin/src/pages/product/create/index.vue` | 接 ProductForm + 两步创建 |
| `web-admin/src/pages/product/edit/index.vue` | 读详情回填 + 保存 + 关联分类 |
| `web-admin/src/pages/product/list/index.vue` | 列表增强 |
| `web-admin/src/pages/product/categories/index.vue` | 只读 → 增删改 |
| `web-admin/src/pages.json` | 追加图片库 + profile 路由 |

注：后端（vendure/cjk-plugin）**零改动**。

---

## 8. 上线方式（沿用部署铁律）
- web-admin 走已有 `web-admin/scripts/deploy.mjs`：本地 `build:h5` → tar → scp → 服务器解压到宿主机 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli/`，静态站 nginx 直接 serve，无需 openresty reload。
- 后端无改动，无需重启 Vendure。

---

## 9. 明确不做清单（防范围蔓延）
- 营销（促销/优惠券）→ 下一期
- 多 SKU/规格
- 按上传者筛选图片、图片名称模糊搜索
- 文件夹 / 多维分类图片库
- 预警线阈值配置界面（本期常量 5）
- 服务端级多租户数据硬隔离（见 tenant-admin 设计二期）
# web-admin 商品管理闭环 + 图片库设计文档

- 日期：2026-08-23
- 项目：vshop 的 web-admin（`d:\zhao\vshop\web-admin`，手机管理后台，访问 `https://e.joho.cn/guanli`）
- 技术栈：uni-app CLI（Vue3 + Vite）+ graphql-request 直连 Vendure `admin-api`
- 关联：承接 2026-08-22-vshop-tenant-admin-design.md（手机管理后台总体设计）

---

## 1. 背景与目标

web-admin 已具备完整骨架与 API 层（登录、店铺选择、商品、订单、库存、支付、配送、分销、统计均已接入），但多数管理页仍是**半成品或只读列表**。其中「商品」是销售最常用、最直接卖货的模块，目前却是最薄弱的环节：

- 新增/编辑商品页只有「名称 + slug + 状态」，**缺图片、价格、库存、描述**
- 商品列表是**只读**，无主图、无价格/库存列、无搜索筛选
- 商品图片只能填 URL，**无法手机相册选图上传**

本次要把商品功能从「只读半成品」补成**销售能直接在手机上卖货的完整闭环**，并配套一个「图片库」作为上传与选图的中枢。

### 目标
1. **商品闭环**：新增 / 编辑 / 列表增强 / 库存预警四件套，让销售一次建好可卖、随时可改可下架。
2. **图片库**：上传图片集中管理，按租户（渠道）天然隔离，商品表单从图片库选图复用而非每次都孤零零传一张。
3. **手机实操友好**：图片来自相册/拍照（原生选择上传），表单在手机上一屏内可完成。

### 非目标（本次不做，后续迭代）
- 分类（Vendure Collection）的增删改、挂载、筛选
- 多 SKU / 规格
- 仓库批次体系
- 按「上传者」筛选图片
- 名称模糊搜索图片（图片库原生 filter 不支持 contains）
- 文件夹 / 多维分类的完整图片库中枢（zhao-oss 全套）

---

## 2. 关键决策与取舍

| 决策点 | 选择 | 理由 |
|---|---|---|
| 商品形态 | **单 SKU 商品** | 生鲜/食品/日用 SKU 少，手机端表单最简单；一个商品 = 唯一 Variant |
| 库存来源 | **商品自带库存** | 不依赖仓库/批次体系，商品页直接维护，手机端最简 |
| 图片来源 | **原生相册选图上传 + 资产库** | 手机实操必须能真传图，而非填 URL |
| 图片库方案 | **方案 A：渠道隔离 + 前端图片库，后端零改动** | Vendure 原生 `assets` 查询 + `vendure-token` 头即天然按租户隔离，零后端开发最快落地 |
| 分类管理 | **本期暂缓** | Collection 的 filters 规则复杂、非销售高频，单独迭代 |
| 预警线 | **常量 5（源码）** | 本期不建配置界面，后续做成可配 |

### 取舍说明（图片库）

Vendure 原生已覆盖：上传 `createAssets`、自动预览、分页列表 `assets(options)`、标签/类型筛选、删除 `deleteAssets`、**按当前渠道 channel 上下文自动隔离**（Asset 是 ChannelAware，`findAll` 按 `ctx.channelId` 过滤）。

缺口（原生没有）：GraphQL Asset 类型不暴露 `channels` 与 `createdBy/uploader`；`filter.name` 只支持等值不支持 contains 模糊搜索；web-admin 无资产 API 封装与页面。

因此方案 A 后端零改动，只做前端图片库。「按上传者筛选」「名称搜索」留待方案 B（cjk-plugin 加 uploader 自定义字段 + 扩展 schema）后续迭代。

---

## 3. 系统架构（图片库部分）

```
┌─ 手机浏览器 ─ e.joho.cn/guanli ─┐
│  web-admin（uni-app H5 独立子工程）│
│  src/apis/asset.ts（新增）        │
│    ├─ uploadAsset()  → 独立 multipart
│    └─ fetchAssets()  → assets(options)
│  src/components/ImagePicker.vue   │
│  src/pages/media/library/index.vue│
└──────────────┬───────────────────┘
               │ Authorization: Bearer <authToken>
               │ vendure-token: <channelToken>   ← 按渠道天然隔离
               ▼
          Nginx e.joho.cn
        location /admin-api （反代 Vendure admin）
               ▼
          Vendure admin-api  assets (原生零改动)
     createAssets / assets / deleteAsset / assignAssetsToChannel
```

---

## 4. 图片库（第 2 节）

### 4.1 后端复用（零开发）

| 能力 | Vendure 原生 |
|---|---|
| 上传 | `createAssets(input: { file: Upload! })` |
| 租户隔离 | admin-api 带 `vendure-token`，`assets()` 只返回当前渠道 Asset |
| 列表 | `assets(options){ totalItems items{ id preview name width height assetType } }` |
| 筛选 | `filter: { assetType: { eq: IMAGE } }`、`tags` |
| 删除 | `deleteAsset(assetId: ID!, force: Boolean)` |
| 分类 | `tags`（上传时打 tag，图片库按 tag 过滤即当分类） |

### 4.2 新增/改动文件

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/apis/asset.ts` | 新增 | `uploadAsset(file)`、`fetchAssets(paging)`、`deleteAsset(id)`；内含独立 multipart |
| `src/components/ImagePicker.vue` | 新增 | 图片库选图组件（网格 + 上传 + 分页 + 单选/多选回调） |
| `src/pages/media/library/index.vue` | 新增 | 独立图片库管理页（上传/预览/删除/浏览） |
| `src/pages/product/create/index.vue`、`edit/index.vue` | 改动 | 用 `ImagePicker` 选图替代 URL 输入 |

### 4.3 图片上传（`asset.ts` 内独立 multipart）

现有 `client.ts` 固定 `Content-Type: application/json` 且用 graphql-request，无法直接传文件。**新增独立上传函数**：

```ts
export async function uploadAsset(file: File): Promise<{ id: string; preview: string }> {
  // 1. 拼 GraphQL multipart：operations + map + file（vendure createAssets）
  // 2. fetch POST {origin}/admin-api
  // 3. headers: Authorization: Bearer <authToken>、vendure-token: <channelToken>
  //    （不设 Content-Type，让浏览器生成 multipart boundary）
  // 4. 解析 createAssets → asset{ id preview }
  // 5. 可选打 tag（如 'product'）便于图片库分类
}
```

### 4.4 `ImagePicker.vue` 选图组件

- 打开即加载当前渠道图片库网格（6 列缩略图，懒加载分页）
- 顶部「选图 / 上传」切换：上传 → 相册选图（`uni.chooseImage`）→ `uploadAsset` → 追加到网格并自动勾选
- 支持**单选**（设主图）与**多选**（商品相册）
- 选中回调 `assets: [{ id, preview }]`；第一张默认 `featuredAssetId`
- 网格点击预览大图、可删除（`deleteAsset`，带确认）

### 4.5 明确不在本节范围
- 按上传者筛选、名称模糊搜索（方案 B）
- 文件夹 / 多维分类（方案 C）

---

## 5. 商品 create/edit 与列表（第 3 节）

### 5.1 商品表单（create 与 edit 共用）

建可复用组件 `src/components/ProductForm.vue`，create 空表单、edit 读详情回填。

| 分组 | 字段 | 说明 |
|---|---|---|
| 基本信息 | 商品名（必填）、描述 | 多行文本 |
| 图片 | 相册多图 + 主图 | `ImagePicker`（§4.4）；第一张默认主图，可设/换主图 |
| 销售 | 价格（元，必填）、库存（件，必填） | 前端元 → Vendure 分；库存走 Variant stockLevels |
| 状态 | 上架/下架开关 | 默认上架 |

**新增（create）两步创建（单 SKU）**：
1. `createProduct(input: { translations{name slug}, assetIds, featuredAssetId })`
2. `createProductVariants(input: [{ productId, sku, price, stockLevels[{stockLocationId, stockOnHand}], trackInventory: true, assetIds }])`

Slug 默认由名称字母/拼音转（slug 生成函数），可手改。SKU 默认 `P{时间戳}`，可手改。

**编辑（edit）**：
- 读详情回填：`fetchProductDetail`（含 `featuredAsset`、`assets`、变体 `price`/`stockOnHand`/`trackInventory`）
- 保存：`updateProduct`（translations/assets）+ `updateProductVariants`（price/stockLevels）
- 名称改则同步更新 slug

### 5.2 商品列表增强（`product/list`）

| 能力 | 实现 |
|---|---|
| 主图列 | 左侧缩略图（`featuredAsset.preview`） |
| 信息列 | 名称、slug、价格、库存 |
| 低库存标红 | `stockOnHand <= 5`（常量）时库存红字 + 「缺货」角标 |
| 搜索 | 顶部搜索框 → `products(filter:{ name:{ contains } })`（商品 filter 原生支持 contains） |
| 上/下架筛选 | tab：全部 / 上架 / 下架（`filter:{ enabled:{ eq } }`） |
| 分页 | `take/skip` 无限滚动或分页控件 |
| 快捷操作 | 行内上/下架开关（复用 `setProductEnabled`）、点行进编辑 |

### 5.3 路由注册
pages.json 追加 `pages/media/library/index`（图片库独立页），商品页复用现有路由。

### 5.4 明确不在本节范围
- 分类（Collection）挂载 / 筛选
- 多 SKU / 规格
- 预警线阈值配置界面（本期常量 5）

---

## 6. 文件清单汇总

| 文件 | 动作 |
|---|---|
| `web-admin/src/apis/asset.ts` | 新增（上传/列表/删除 + multipart） |
| `web-admin/src/components/ImagePicker.vue` | 新增（选图组件） |
| `web-admin/src/components/ProductForm.vue` | 新增（商品表单组件） |
| `web-admin/src/pages/media/library/index.vue` | 新增（图片库独立页） |
| `web-admin/src/pages/product/create/index.vue` | 改造（接 ProductForm + 两步创建） |
| `web-admin/src/pages/product/edit/index.vue` | 改造（读详情回填 + 保存） |
| `web-admin/src/pages/product/list/index.vue` | 改造（列表增强） |
| `web-admin/src/pages.json` | 追加图片库路由 |
| `web-admin/src/templates/shared/product-slug.ts`（或并入表单） | 新增（slug/sku 生成） |

后端（vendure）**零改动**。

---

## 7. 上线方式（沿用部署铁律）

- web-admin 走已有 `web-admin/scripts/deploy.mjs`：本地 `build:h5` → tar → scp → 服务器解压到宿主机 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/guanli/`，静态站 nginx 直接 serve，无需 openresty reload。
- 后端无改动，无需重启 Vendure。
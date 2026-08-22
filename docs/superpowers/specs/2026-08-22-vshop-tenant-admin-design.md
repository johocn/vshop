# vshop 手机管理后台（租户店铺运营）设计文档

- 日期：2026-08-22
- 项目：vshop（Vendure C 端商城）配套的移动端管理后台
- 访问地址：`https://e.joho.cn/guanli`
- 风格参考：strapi-backend（移动端优先、卡片/宫格、橙色调）
- 技术栈：uni-app CLI（Vue3 + Vite）+ graphql-request 直连 Vendure `admin-api`

---

## 1. 背景与目标

vshop 是 Vendure 重度二次开发的 C 端商城（含大量业务插件）。店主目前在手机上没有统一的经营后台，需要单独操作商家上架、审批等零散页面，体验割裂。

本需求要"**用 vshop 目录重新做一个手机能访问的管理后台**"，**只做常用租户功能**，风格参考 strapi-backend，最终访问地址为 `e.joho.cn/guanli`，聚焦"销售所需常用功能"。

### 目标
1. 店主在手机上即可完成日常店铺经营：装修、商品、订单、库存、配送、支付、看板、分销。
2. 单一后台入口 `/guanli`，无需装 App，浏览器直开。
3. 与商城端（vshop）代码/构建/部署完全隔离，互不影响。

### 非目标（本次不做）
- 服务端级别的多租户数据硬隔离（见 §6 二期）。
- 分销管理模块（本次最后，见 §7 二期）。
- PC 端后台；多语言；WebSocket 实时推送。

---

## 2. 关键决策与取舍

| 决策点 | 选择 | 理由 |
|---|---|---|
| 登录模型 | **单总账号 + 选店铺** | Vendure admin-api 原生是全局管理员模型，此方案最快最稳，可平滑升级为独立账号 |
| 工程结构 | **vshop 内独立「web-admin」子工程** | 与商城隔离，复用同一套 Vue3+vite 技术栈，独立构建部署 |
| 数据接口 | 直连 Vendure `admin-api` | 商品/订单/库存/分销/结算/售后/装修插件已全部就绪 |
| 数据隔离 | **UI 层隔离**（本期） | 登录后锁定当前店铺，请求都带店铺上下文；服务端真隔离二期再做 |
| 导航 | **工作台宫格 + 底部固定工具栏 + 右上角 ☰ 全量抽屉** | 高频永驻底栏、常用宫格直达、全量功能抽屉一屏看齐 |
| 视觉 | **仿 strapi-backend** | 移动端优先、卡片/宫格、橙色调#ff6600，业务方熟悉 |

### 取舍说明（登录/隔离）
Vendure admin-api 原生"全局超级管理员"模型并不天然支持"每个租户各管各的店"。本期采用**单总账号 + UI 层隔离 + 请求带店铺上下文**，实现最快、最稳。若未来要求"商家 A 不可见商家 B 数据"的服务端硬隔离，需新增 `zhao-admin` 插件做权限拦截，列为二期。

---

## 3. 系统架构

```
┌─ 手机浏览器 ─ e.joho.cn/guanli ─┐
│  web-admin（uni-app H5 独立子工程）│   ← d:\zhao\vshop\web-admin
│  src/api → graphql-request        │   ← https://e.joho.cn/admin-api
└──────────────┬───────────────────┘
               │ admin token + 店铺上下文
               ▼
          Nginx e.joho.cn
        location /guanli/ （静态 admin 产物）
        location /admin-api （反代 Vendure admin）
               ▼
          Vendure admin-api
   （business/order/inventory/distribution/settlement/after-sales/装修 插件）
```

### 数据流
1. 用户打开 `/guanli` → 静态 uni-app H5。
2. `login` mutation 登录总账号 → 拿到 admin token + `me { channels }`。
3. 选店铺 → 记录当前店铺上下文。
4. 后续所有 admin-api 请求带 admin token + 店铺上下文，页面数据按店铺筛选。
5. 各业务模块对应 Vendure 已有插件的 admin 能力（见 §4）。

---

## 4. 功能模块与页面清单（按优先级）

### P0 · 登录 + 店铺选择
- `pages/login/index` — 总账号登录
- `pages/channel-select` — 选择要经营的店铺（记忆最近选择）

### P1 · 店铺装修（优先）
- `decorate/home` — 首页装修：轮播图 / 导航宫格 / 推荐位
- `decorate/theme` — 主题风格切换（复用 `displayTemplate` / `themeId` 自定义字段）
- `decorate/shop-info` — 店铺信息：头像 / 名称 / 简介 / 客服

### P1 · 商品管理
- `product/list` — 商品列表（搜索 / 筛选 / 上架下架 / 排序）
- `product/create` — 新增商品
- `product/edit` — 编辑商品（基本资料 / 规格 SKU / 图片 / 价格库存 / 上下架）
- `product/categories` — 分类管理

### P1 · 订单管理
- `order/list` — 订单列表（状态筛选：待付款/待发货/已发货/已完成/已取消）
- `order/detail` — 订单详情（商品 / 收货信息 / 金额 / 物流）
- `order/ship` — 发货操作
- `after-sale` — 售后处理（同意 / 拒绝 / 退款，复用 after-sales 插件）

### P1 · 仓库 + 配送 + 支付档案
- `inventory/stock` — 库存与库存预警（复用 inventory 插件）
- `shipping/methods` — 配送方式管理
- `payment/methods` — 支付方式档案（微信 / 支付宝 / 余额 开关与配置）

### P2 · 数据看板
- `pages/dashboard` — 首页看板（销售额 / 订单量 / 访客趋势 / 商品排行 / 库存预警，复用 dashboard 插件）

### P3 · 分销管理（最后开发）
- `distribution/relations` — 分销关系 / 推广员列表
- `distribution/settle` — 佣金结算（复用 distribution + settlement 插件）

---

## 5. 导航结构（仿 strapi-backend，C 方案落地）

**落地页 = 工作台**，顶部栏固定，右上角永远放 `☰ 抽屉`。

### 5.1 工作台页（纵向看板，全部展开不用滑）
- **顶部运营卡片**：今日销售额 · 待发货单数 · 库存预警数（三个大字）
- **常用功能区**（从上到下按使用频率）：
  1. **商品**：商品列表 / 新增商品 / 分类 / 库存预警
  2. **订单**：全部订单 / 待发货 / 售后处理
  3. **装修**：首页装修 / 主题风格 / 店铺信息
  4. **经营**：数据看板 / 配送方式 / 支付方式
  5. **分销**（最后上线，届时在该区底部追加）
- **底部固定工具栏**（4 格）：`工作台 | ＋商品 | 订单 | 我的`

### 5.2 右上角 ☰ 抽屉（全量导航，一屏列完不滚动）
- 顶：当前店铺名 + `切换店铺`
- 按业务逻辑分组列出**全部模块**：
  - **商品**：商品列表 · 新增商品 · 分类管理 · 库存与预警
  - **订单**：全部订单 · 待发货 · 售后处理
  - **装修**：首页装修 · 主题风格 · 店铺信息
  - **经营**：数据看板 · 配送方式 · 支付方式 · 分销管理（上线后）
  - **我的**：个人中心 · 修改账号 · 关于 / 退出登录
- 半屏抽屉、每项一行、字体适中，**无需滑动即可看到全部入口**。

### 5.3 高频逻辑
- 底栏 `＋商品` / `订单` 永驻，店主最常用。
- 工作台宫格覆盖次高频。
- 低频（切店、修改账号）收进抽屉 / 我的。

---

## 6. 技术实现

### 6.1 独立子工程（uni-app H5，与商城隔离）
- 在 `d:\zhao\vshop` 下新建 `web-admin\`，作为独立 uni-app 工程，拥有独立 `src/pages.json`、`src/main.ts`、`package.json`。
- 复用 Vue3 + Vite + graphql-request；`web-admin/src/api/client.ts` 指向 `https://e.joho.cn/admin-api`。
- `build:h5` 产出到 `web-admin/dist/build/h5/<admin>`。
- 商城工程（原 vshop）与 admin 工程互不影响，各自构建。

### 6.2 admin-api 鉴权与店铺隔离（**已验证 ✅ 2026-08-22**）
本地连通性验证结论：
- `login(username,password)` mutation → 会话 token 从响应头 **`vendure-auth-token`** 读取。
- `me { channels { id code token } }` 返回该账号可经营的店铺列表。
- **店铺上下文切换**：每个 admin-api 请求带上 **`vendure-token: <所选店铺token>`** 请求头，`requestContext.channel` 即锁定到该店铺，`activeChannel` 与业务数据自动按该店铺隔离。
- 实测：带 `vendure-token: shop-a-token` 后，`products` 仅返回 shop-a 的 17 个商品。
- **本期 Commit 范围**：UI 层隔离（登录 → me.channels 选店 → 之后所有请求带 `vendure-token`）。
- 二期：`zhao-admin` 插件做服务端硬隔离（商家互不可见超集）。

### 6.3 Nginx /guanli 部署
- `e.joho.cn` 新增 `location /guanli/` 指向 admin 产物目录，`/guanli` 302 → `/guanli/`。
- `/admin-api` 反代到 Vendure admin API。
- 首页 `= /guanli/` 加 `Cache-Control: no-cache, no-store, must-revalidate` 防微信缓存。
- 遵循部署铁律：本地构建 → 提交 dist 产物 → 服务器 git pull → pm2 restart；**绝不在服务器构建**。

### 6.4 数据来源（对齐已有插件的 admin 能力）
- 商品/分类：Vendure core Product/Collection 管理。
- 订单/售后：core + after-sales-plugin。
- 库存/仓库：inventory-plugin。
- 分销/结算：distribution-plugin + settlement-plugin。
- 装修：Channel 自定义字段 `displayTemplate` / `themeId` + 装修相关实体。
- 数据看板：dashboard 插件。

---

## 7. 二期范围（本次不做）
1. `zhao-admin` 服务端权限隔离插件（商家互不可见）。
2. 分销管理模块（最后上线）。
3. 每租户独立管理员账号登录（可在 UI 隔离之上演进）。

---

## 8. 附加说明：无自有域名租户的共享域名方案
> 备案/支付合规：`e.joho.cn` 已备案，主域名备案覆盖其下子域名。支付平台校验"回调域名在已备案域名上"，所有租户共享 e.joho.cn，回调域名只需在其下配置一次过校验，归属由回调中的店铺标识识别。
> **采用 B 方案**：C 端店面临时路由 `e.joho.cn/?tenant=<channelCode>`（vshop 前端已内置 `?tenant=` 路由，后端零改动）。
>
> **待处理技术改造（共享域名前置条件）**：当前 `src/stores/tenant.ts` 的 `TENANT_CONFIGS` 是前端写死的店铺清单，新增租户需改前端重发商城。要支持"后台动态上租户 + C 端按域名/参数动态归属"，需改为**从后端动态拉取店铺映射**（如复用 `resolveChannelByDomain`/新增 `listChannels` 查询），或将 `TENANT_CONFIGS` 改由服务端下推。此项列为独立任务，与 /guanli 后台开发并行或先于多租户 C 端接入。

---

## 9. 技术风险与对策

| 风险 | 影响 | 对策 | 状态 |
|---|---|---|---|
| admin-api 的店铺隔离机制是否可用 | 隔离失效 | 已实测：`vendure-token` 头切换 activeChannel 有效，products 按店铺隔离 | ✅ 已验证 |
| 装修需要的自定义字段/实体是否齐备 | 装修功能受阻 | 核对 `displayTemplate`/`themeId` 及装修实体，缺失则以最小字段先跑通 | 待开发时核对 |
| 移动端 H5 与微信缓存 | 白屏/旧内容 | `/guanli/` 首页 no-cache，禁止 `/uploads` 直读 | 部署落实 |
| 独立子工程与商城工程构建混淆 | 部署错产物 | `web-admin` 独立 package.json/pages.json，明确构建产物目录 | 待落实 |
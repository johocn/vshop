# 外卖模板（waimai）设计文档

> 2026-10-05 · 基于 vshop 代码底座的独立 uniapp 外卖 C 端模板，对接 vendure 校园外卖模块（campus-delivery-plugin），构建物部署至 www.yourbao.cn/waimai/。

## 1. 背景与目标

校园外卖模块 Plan 1（后端地基）已上线：4 表（campus_zone/campus_building/rider_earning/campus_fulfillment_config）+ Order/Customer customFields + 幂等迁移，`slotsForShop`/`setDeliveryTarget`/`listZones` 等 service 就绪。本设计在 vshop 交易底座之上新建**独立外卖模板应用**：

- 美团外卖式多店铺 C 端（channel = 餐饮店铺）
- 含骑手端分包（接单/接力/收入）
- 模板化可推广：API/渠道/主题全配置化，不硬编码
- 部署为 www.yourbao.cn 站点的 `/waimai/` 子应用

## 2. 范围决策（已确认）

| 决策点 | 结论 |
|---|---|
| 应用范围 | 完整外卖商城（店铺列表→菜单→点单→结算→跟踪），非增量页 |
| 代码复用 | 独立项目 `e:\zhao\waimai`，从 vshop 选择性复制交易底座 |
| 目标端 | 先 H5（manifest 预留 mp-weixin，二期） |
| 模板化 | 轻模板：env 配置化 + 主题 token；i18n/多城市/五级风格体系后置 |
| 后端边界 | 前端 + 在 campus-delivery-plugin 补齐缺口查询 |
| 店铺形态 | 多店铺（美团式），channel = 店铺 |
| 骑手端 | 纳入本期（pkg-rider 分包） |
| 配送链路 | 混合：R1 商户自送+接力 / R3 档口直送；R2/R4/R5 路由预留不实现 |

## 3. 总体架构

```
e:\zhao\waimai · 独立 uniapp（vite，照搬 vshop 构建配置）· H5 base=/waimai/
├── 交易底座（复制自 vshop）：api/client + auth/cart/checkout/order queries+mutations、
│   stores（auth/tenant/cart）、登录页、支付 webview、通用组件
│   （VImage/EmptyState/LoadingSkeleton/SkuSheet/SearchBar/PriceTag）
├── 学生端 C 侧（全新写）：店铺列表、店铺菜单、校园配送选择、订单跟踪
└── 骑手端分包 pkg-rider（全新写）：骑手入驻、接单大厅、配送中、收入明细

后端：vendure shop-api（同源）+ campus-delivery-plugin 补齐缺口 resolver
部署：本地 build:h5 → tar+scp → .../sites/e.joho.cn/yourbao/waimai/
```

轻模板配置项（走 env + 运行时 config，禁止硬编码）：
`VITE_API_URL`、渠道 token、主题色 token（`--brand` 一处换肤）、站点标题。

## 4. 页面信息架构（tabBar：首页 / 订单 / 我的）

| 包 | 页面 | 说明 |
|---|---|---|
| 主包 | `pages/home` | 首页·店铺列表（tab）：店铺卡（logo/评分/月售/预计时长/配送费/起送价/满减 tag）+ 分类 pills |
| | `pages/shop/menu` | 店铺菜单（高频入主包）：左分类栏 + 右商品列表 + 底部购物车常驻条；公告条展示满减/高峰提示 |
| | `pages/orders` | 我的订单（tab）：履约状态徽标 |
| | `pages/profile` | 我的（tab）：含骑手端入口（认证后显示） |
| | `pages/login`、`pages/webview` | 复制 vshop：登录 + 支付 webview |
| pkg-order | `checkout` | 结算：配送方式 Tab（校园配送/自提/邮寄）；校园配送 Tab 含宿舍楼选择（zone/building）、送达时段（slotsForShop 带余量）、分区配送费、备注；经 `setDeliveryTarget` 写入订单 customFields |
| | `order-detail` | 订单跟踪：履约时间线 + 骑手卡 + 再来一单 |
| | `pay-result` | 复制改造 |
| pkg-rider | `rider-join` | 骑手入驻：认证 + 绑定骑手段字段 |
| | `rider-home` | 接单大厅（见 §6） |
| | `rider-delivering` | 配送中（见 §6） |
| | `rider-earning` | 收入明细：今日/本周 KPI + rider_earning 流水（含信用分扣减记录）+ 提现 |

## 5. 核心页面设计要点

### 5.1 店铺列表（首页）
- 数据源：channels 清单 × campus_fulfillment_config 聚合（缺口 #1）
- 分类 pills 一期通用类目（米饭快餐/奶茶甜品/面食/夜宵），匹配店铺渠道 `customFields.waimaiTags`（逗号分隔，后台可维护；未配置则归入「全部」）
- 月售一期取渠道 `customFields.waimaiMonthlySales`（手工维护），二期改订单统计

### 5.2 店铺菜单
- 加购在本页完成（底部常驻条：合计+去结算），核心路径最短
- 规格（辣度等）用复制来的 SkuSheet 弹出

### 5.3 结算 · 校园配送 Tab
- 复用 vshop checkout 的配送 Tab 架构，新增「校园配送」选项（`fulfillmentRoute=CAMPUS`）
- 校外商家提示「商家送至校门口，校内骑手接力送达」；校内档口显示直送

### 5.4 订单跟踪（按路线区分时间线）
- **R3 档口直送**（单段）：商家接单 → 骑手取餐 → 配送中 → 已送达
- **R1 接力**（五节点）：商家接单 → 商家自送·已到校门口交接点 → 接力取货完成（拍照确认）→ 第二程·配送上楼 → 已送达
- 骑手卡：姓名 + 信用分 + 电话（脱敏）+ 接力段标注（「接力骑手 · 第一程：商家自送（已完成）」）
- 无人接单：骑手卡替换为「平台调度中」提示（T0-T4 降级的 C 端表现，一期只读状态）
- 状态由 `hallStatus` 驱动，轮询刷新

## 6. 骑手端交互细节

### 6.1 抢单流程（接单大厅）
1. 列表刷新：一期轮询（10s）+ 下拉刷新，新单顶部红点；二期 WebSocket
2. 一键接单：点击后按钮立即置灰「锁定中…」（乐观锁 UI）→ `acceptTask` → Dispatch 服务原子判定防双抢
   - 成功：跳「配送中」
   - `TASK_TAKEN`：toast「手慢了，已被抢」+ 卡片置灰滑出
   - `CREDIT_TOO_LOW`：toast + 引导查看信用分
   - 同一用户下单/接单互斥（刷单风控）直接拒绝
3. 任务卡倒计时（剩余接单时限），超时未抢自动下架回调度池
4. 取货超时（15min）自动改派 + 信用分扣减；本端收「任务已改派」通知并移出任务
5. 新单提醒：复用 wechat-subscribe-message-plugin；H5 降级页面内轮询提示

### 6.2 交接流程
1. 交接点取货（R1 第二程起点）：「拍照交接」→ `uni.chooseImage` → upload mutation 上传 → handover 确认（对接 `confirmPickupHandover`）→ 状态「已取货」；照片前后端双重强制校验
2. 送达：「我已送达」→ 拍照存证（必填）+ 可选定位 → `hallStatus=DELIVERED`，rider_earning 分成实时入账
3. 联系不上学生：上报 `no_recipient` → 短信/电话催取 → 15min 无响应 → 拍照放置 + 通知自取，或带回交接点待取
4. 转单：未取货一键转单回大厅（扣分规则租户可配）；已取货（受伤/故障）必须先拍照交接货物现状 → 新骑手接单后再次拍照确认才能继续
5. SLA：接近 45min 任务卡警示态；超 SLA 后端告警客服介入，骑手端显示「平台介入中」

> 边界规则全部后端二次校验，前端仅做体验层拦截。

## 7. 后端缺口清单（campus-delivery-plugin 内补齐，2026-10-05 实测修正）

> 实测：骑手任务流（campusHall/campusGrabOrder/campusMyTasks/campusStartTask/campusDeliverTask/campusReportException/applyRider/campusRiderOnline/campusRiderHeartbeat/campusCapacityCheck/myRiderEarnings）后端已全部就绪。真实缺口：

| # | 缺口 | 说明 |
|---|---|---|
| 1 | 店铺列表聚合查询 | `waimaiStoreList`：channels × campus_fulfillment_config 聚合店铺卡数据（token/tags/月售/暂停态/routes），新增 shop resolver |
| 2 | Channel 元数据字段 | `waimaiTags`/`waimaiMonthlySales`/`waimaiLogo` 三个 Channel customFields |
| 3 | 订单骑手卡查询 | `campusOrderRider(orderId)`：骑手姓名+信用分（不含联系方式），C 端轮询用 |
| 4 | 转单 mutation | `campusTransferTask`：assigned 直接回大厅；in_progress 已取货强制拍照交接（transferPhotos 存证） |
| 5 | 未接单降级态 | C 端「平台调度中」只读展示；自动派单属 Plan 3，不阻塞 |

履约时间线：C 端轮询 `order { customFields { hallStatus deliveryStatus ... } }` + `campusOrderRider` 组合，无新后端。支付/购物车/结算/上传复用现有能力，无后端改动。

## 8. 部署方案

- `manifest.json`：`h5.router.base = /waimai/` + vite base 同步；本地 `npm run build:h5` → tar → scp → 解压至 `/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/yourbao/waimai/`（新写 waimai 版 deploy 脚本，参照 `.secrets/wechatpay/deploy-yourbao.sh`，解压前备份）
- nginx `www.yourbao.cn.conf` 增补：`location /waimai/ { try_files $uri $uri/ /waimai/index.html; }`；index.html no-cache（chunk immutable）
- **支付风险项**：JSAPI 支付授权目录现为根路径，`/waimai/` 子路径支付需在微信商户平台追加授权目录——上线前必须确认
- API 同源 `/shop-api` 反代已有，零新增

## 9. 测试与交付

- vitest：购物车计价、时段选择、履约状态→时间线映射等核心逻辑
- shop-api 全链路冒烟（点单→支付→抢单→接力交接→送达→分成入账），可复跑脚本
- Playwright 手机视口 390×844 dpr=2 截图目检：学生端 4 页 + 骑手端 3 页
- 交付：操作手册 + 测试用例 + 验收手册（docs/verify/）

## 10. 不做范围（Out of Scope）

- R2 快递到校 / R4 自提自取 / R5 跑腿代取（路由预留）
- 微信小程序端（manifest 预留，二期）
- i18n / 多城市 / 五级风格体系（后置模板化阶段）
- WebSocket 实时推送（一期轮询）
- ~~自动派单与 T0-T4 降级的服务端完整实现（Plan 3）~~ → 已由 campus-delivery Plan 3 完成并上线（2026-10-05 部署验证）；本模板一期 C 端仅做「平台调度中」只读展示与既有状态消费，调度看板属 web-admin，不在本模板范围

## 11. 与现有工作流的边界

- Plan 2（vshop C 端校园 Tab + pkg-rider）与本模板的页面能力重叠：本模板是独立应用，不回写 vshop 页面；后端缺口 resolver 属插件公共能力，Plan 2 可直接受益
- 后端改动仅限 campus-delivery-plugin，遵守「插件 lib 入库、服务器零构建」惯例

## 12. 设计增补（2026-10-05 brainstorm 定案）

### 12.1 视觉与主题系统

- 品牌 token：`--brand: #ff6600`、`--brand-soft: #fff3e6`（与 vshop `uni.scss` 同款值），全部组件只引用 token，一处换肤（三方案 mockup 对比后定案 A·沃堡橙）
- 运行时可覆盖：预留 `VITE_BRAND_COLOR` 环境变量注入（复用 vshop `App.vue` 的 CSS variable 注入模式），租户换色不改代码
- H5 一期不做暗色模式；tabBar 用 uni-app 原生 tabBar（首页/订单/我的）

### 12.2 首页搜索与满减 tag

- 搜索：真搜索——输入即对 `waimaiStoreList` 结果做前端过滤（店名包含匹配、不分大小写），清空恢复全量；搜索激活时隐藏分类 pills，清空恢复；零后端成本
- 满减 tag 数据源：Channel customFields 新增 `waimaiPromoText`（字符串，手工维护，如「满20减4」），与 `waimaiTags/waimaiMonthlySales/waimaiLogo` 同模式——**waimai Plan 1 Task 1 需补充此字段**

### 12.3 执行编排（三段式，子代理驱动）

| 段 | 内容 | 验收点 |
|---|---|---|
| 段 1 | 后端缺口 4 项 + `waimaiPromoText`：TDD → lib 入库 → dev-server dist 重编 → 部署 → 冒烟 | 单测绿 + 冒烟脚本过 |
| 段 2 | `e:\zhao\waimai` 项目初始化（照搬 vshop 构建配置）→ 交易底座复制 → 主题 token → 新写 4 页（首页/店铺菜单/结算·校园配送 Tab/订单跟踪），orders/profile/login/webview 照搬 vshop 改造 | vitest 核心逻辑绿 + 手机截图目检 |
| 段 3 | pkg-rider 骑手端 4 页 → 全链路冒烟 → 手机截图 → 部署 yourbao/waimai/ | 390×844 dpr=2 截图逐张目检 + 操作手册 |

- 每段产出经主窗口复核后 commit；waimai 独立仓库本地 master、无 remote（参照 qijinqichu 模式）
- 用户人工操作项（不阻塞开发，上线前完成）：微信商户平台为 JSAPI 支付追加 `/waimai/` 授权目录

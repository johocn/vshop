# 校园配送店铺配置底座（一期）设计 — 2026-10-06

## 背景与目标

waimai 学生端已上线（R1/R3 全链路闭环），但存在三类缺口：

1. **店铺级 routesEnabled 无后台配置入口**：数据存 plugin 自有表（channelId 唯一），只能靠种子/改库
2. **店铺信息静态文案**：配送时长/起送费/配送费/地址/电话/公告全硬编码在 waimai 页面
3. **R2 语义不完整**：后端 r2-mark 已落地，文案需定为「快递到校 · 接力代取」

本期为**配置底座**：plugin 店铺配置扩展 + web-admin 管理页 + waimai 字段化消费。二期 R2/R4/R5 学生端入口、三期评价系统另行 spec。

**管理页归属决策**：复用 `d:\zhao\vshop\web-admin`（youshop 多租户手机管理后台，e.joho.cn/guanli，uni-app H5），复用其 admin-api 登录 / graphql-request 客户端 / 部署链。**不新建项目**（对比后用户确认）。

**路线定版**（本次唯一文案变更）：

| 路线 | 文案 | 流程 |
|---|---|---|
| R1 | 商家自送 · 骑手接力 | 商家送至校门口 → 骑手接送上楼 |
| R2 | **快递到校 · 接力代取** | 快递到校标记 → 骑手代取并接力送达（一体） |
| R3 | 档口直送 · 骑手上楼 | 骑手全程一趟到底 |
| R4 | 到店自取 | 学生自提 + 核销 |
| R5 | 跑腿代取 | 通用跑腿单 |

R6（档口直送+接力上楼）经讨论**不引入**：与 R3 重叠、场景少；映射表对未知编号有兜底，未来需要时加一行 label 即可。

## 一、后端（d:\zhao\vendure\packages\campus-delivery-plugin）

### 1.1 CampusStoreConfig 实体扩展

现有字段：`channelId`（唯一列）、`routesEnabled`（string[]，默认 ["R1","R3","R4","R5"]）。新增（全部可空，null=未配置）：

| 字段 | 类型 | 说明 |
|---|---|---|
| deliveryMinutes | int (nullable) | 配送时长（分钟） |
| minOrderAmount | int (nullable) | 起送价，**分**存储（vendure Money 惯例） |
| deliveryFee | int (nullable) | 配送费，分 |
| storeAddress | string (nullable) | 自提地址 |
| storePhone | string (nullable) | 联系电话 |
| storeNotice | string (nullable) | 店铺公告 |

### 1.2 Admin API 新增

文件：写入逻辑**并入现有 `waimai-store.service.ts`**（同表同连接，不新建 service），admin resolver 扩展 `campus-config-admin.resolver.ts`。权限沿用 `CampusPermissions.CampusConfig`。

```graphql
# 查询：全店铺配置（join Channel 取店铺名/token，供管理页列表）
campusStoreConfigs: [CampusStoreConfigWithChannel!]!
type CampusStoreConfigWithChannel {
  channelId: ID!
  channelName: String!
  channelToken: String!
  routesEnabled: [String!]!
  deliveryMinutes: Int
  minOrderAmount: Int
  deliveryFee: Int
  storeAddress: String
  storePhone: String
  storeNotice: String
}

# mutation：按 channelId upsert（幂等），不存在则创建行
campusUpdateStoreConfig(channelId: ID!, input: CampusStoreConfigInput!): CampusStoreConfigWithChannel!
input CampusStoreConfigInput {
  routesEnabled: [String!]!          # 必填：完整开关集合（前端全量提交）
  deliveryMinutes: Int
  minOrderAmount: Int
  deliveryFee: Int
  storeAddress: String
  storePhone: String
  storeNotice: String
}
```

**route 白名单校验**：input.routesEnabled 仅接受 R1-R5，传入其它值抛 `InvalidRouteError`（防脏数据；R6 未来加白名单一行即可）。

### 1.3 Shop API 透出

`waimai-store.service.ts` / `waimai-shop.resolver.ts`：`WaimaiStore` 类型新增上述 6 个可空字段（从 cfg 读取，无行/null 直出 null）。**不改现有查询形态**，纯扩展。

### 1.4 测试（plugin vitest）

- `campusUpdateStoreConfig` upsert 幂等（同 channelId 二次调用更新不新增行）
- 白名单校验：`["R1","R9"]` 抛错
- 无权限角色调用被拒
- `waimaiStoreList` 输出新字段（有配置/无配置两态）

## 二、web-admin「校园配送」页（d:\zhao\vshop\web-admin）

### 2.1 API 层

新增 `src/api/campus.ts`：`campusStoreConfigs()` / `campusUpdateStoreConfig()`，走现有 client（admin-api，同 auth.ts 形态）。

### 2.2 页面

新增 `src/pages/campus/config.vue`（页面交互形态已按 mockup 定稿）：

- 店铺卡片列表：店铺名 + channelToken 尾号 + 「已开通 N 条路线」
- 路线 chips：R1-R5 五个开关（含短标签：商家自送/快递代取/档口直送/到店自取/跑腿代取）
- 配送信息表单：时长（分钟）/ 起送价（元）/ 配送费（元）/ 自提地址 / 电话 / 公告；**页面层分↔元转换**（展示元、提交分，允许小数一位）
- 保存：调 `campusUpdateStoreConfig`，成功 toast；金额非法（负数/非数字）前端拦截
- `pages.json` 注册 + 后台首页宫格入口「校园配送」

### 2.3 登录与多租户

复用现有 admin-api 登录态；页面**跨租户视角**（一次列全部渠道店铺，同 waimaiStoreList 形态），不做租户切换限制——该页为平台运营页。

## 三、waimai 消费侧（d:\zhao\waimai）

### 3.1 数据层

- `src/api/queries/waimai.ts`：WaimaiStore 类型扩展 6 字段（nullable）
- `src/utils/store-display.ts`：R2 文案更新为「快递到校 · 接力代取」；新增 `routeText` 无变化、优先级链不变（R1>R3>R2>R4>R5）

### 3.2 页面消费（全部「有值才显示/替换，null 回退现状」）

| 页面 | 改动 |
|---|---|
| 首页店铺卡 | 配送 tag 前缀加时长：`35分钟 · 商家自送…`（deliveryMinutes 有值时） |
| 店铺页信息卡/商家 Tab | 地址/电话/公告读真数据；null 回退现有静态文案（L4 兜底链） |
| checkout | 费用区显示配送费/起送价；**起送价软校验**：未达标 toast 提示不阻断（硬校验二期后端化） |
| menu.vue | 公告条（promoText 旁）显示 storeNotice（有值时） |

### 3.3 waimai 测试

- vitest：store-display R2 文案用例更新；新增「时长 tag 拼接」纯函数用例（若提取为纯函数）
- Playwright 截图（390×844 dpr=2）：首页/店铺页明暗两态目检
- **不改动**：R2/R4/R5 下单入口（二期）、timeline 结构

## 四、错误处理与兼容

- 旧店铺无配置行：Shop API 全字段 null，waimai 全兜底，**现网零破坏**
- routesEnabled 空数组：waimaiStoreList 直出 `[]`，前端显示「暂未开通配送」（现状一致）
- admin 页保存失败（网络/权限）：toast 错误信息，表单不清空
- 金额输入非数字/负数：前端拦截；后端 input 校验负数拒绝

## 五、范围外（明确不做）

- R2/R4/R5 学生端下单入口、R2「已到校」按钮（二期）
- 评价系统（三期）
- 起送价后端硬校验、配送费参与订单金额计算（运费仍是 campus-errand calculator 出价；deliveryFee 仅展示）——**deliveryFee/minOrderAmount 本期纯展示字段**
- 配送时段配置（已有全局时段，本期不动）

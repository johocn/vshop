# 校园配送二期设计：R2/R4/R5 下单闭环 + 起送价硬校验

> 状态：定稿（2026-10-06，brainstorming 收敛）。执行计划见 `docs/superpowers/plans/`（writing-plans 产出）。

## 一、背景与范围

- **已上线**：Plan1-3（2026-10-05）R1/R3 商品单+时段容量+T0-T4 降级调度+骑手端；一期（2026-10-06）拾光达配置底座（店铺配置 6 字段 + admin/shop API + web-admin 配置页 + waimai 字段化消费 + 品牌文案）。
- **后端能力现状**：`r2-mark.service`（markArrived）、`errand.service`（setErrandInfo：orderKind=errand + R5 + A/B 点 + 小费 surcharge）、`hall.service`（orderKind=errand 或 R1/R3 支付后自动入厅）、Order customFields（fulfillmentRoute/orderKind/leg1Status/hallStatus/errandKind/errandFrom/errandTo/handoverAt）**全部已实现**。
- **二期定位**：waimai 前端消费层为主 + 少量后端补强。补齐 R2/R4/R5 学生端入口、R2 已到校交互、起送价硬校验。
- **品牌术语**：校内配送服务=拾光达，骑手=拾光传信者；路线标准语句见 §二（与 web-admin/waimai 一期文案逐字一致）。

## 二、路线标准语句（定版，全端统一）

| 码 | 标准名称 | 辅助说明 |
|---|---|---|
| R1 | 商家自送+拾光达接力 | 商家送至校门口，拾光传信者接力送到手 |
| R2 | 快递到校+拾光达接力 | 快递到校后，拾光传信者代取并送达 |
| R3 | 档口+拾光达接力 | 档口现做，拾光传信者送至楼层 |
| R4 | 到店自取 | 凭取件码到店自取 |
| R5 | 校内拾光达 | 拾光传信者按下单需求跑腿代办 |

## 三、后端补强（vendure campus-delivery-plugin）

### 3.1 errandBaseFee 配置
- `CampusFulfillmentConfig` 加列 `errandBaseFee`（int，分，nullable；null=默认 200 即 2 元）。
- 幂等迁移（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，沿用一期 create-campus-tables 模式）。
- `waimaiStoreList` 透出该字段；admin `campusUpdateStoreConfig` input 支持写入（负数拒绝）。

### 3.2 起送价硬校验
- OrderProcess 拦截 `ArrangingPayment` 过渡。
- 条件：当前渠道 campus 配置 `minOrderAmount` 非空 **且** 订单 `orderKind !== 'errand'`（跑腿单不校验商品起送价；R1/R2/R3/R4 商品单均校验）。
- 不满足：抛 `UserInputError`，文案「未满起送价 ¥X」（X=minOrderAmount 元）。

### 3.3 shopMarkArrived（R2 已到校）
- 若 shop-api 未暴露（writing-plans 核实，已有则跳过）：新增 shop mutation `shopMarkArrived(orderId)`。
- 校验链：订单归属当前 session 用户 → `fulfillmentRoute === 'R2'` → `leg1Status === 'preparing'`。
- 写入：`leg1Status='arrived_gate'` + `handoverAt`。幂等：已 arrived_gate 再调返回原状态，不重复写 handoverAt。
- 不可撤销：无回退入口，误触走客服人工。

### 3.4 R4 自提点绑定
- web-admin 拾光达配置页保存 `storeAddress` 时，幂等 upsert 该渠道的自提点记录（复用 pickup-plugin 自提点体系；名称=店铺名，地址=storeAddress）。
- `storeAddress` 为空/清空时跳过 upsert（不删除既有自提点记录）。
- 核销复用现有 `pickup_redemption` 体系，零新表。

### 3.5 R2 联动反查
- shop API 透出：R2 原单按 `errandFrom` 关联的 R5 接力单实时状态（接力中/已接单/已退款）。原单**动态反查、不写回标记**。

## 四、统一运力池统筹（R1/R2/R3/R5）

### 4.1 入厅规则（已上线，零改动）

| 路线 | 入厅时机 | 说明 |
|---|---|---|
| R1 商品单 | 支付后自动 | 现状 |
| R3 商品单 | 支付后自动 | 现状 |
| R5 跑腿单 | 支付后自动 | 现状 |
| R2 接力单 | 发单支付后自动 | 本质就是 R5 单（errandFrom 关联 R2 原单），复用全部降级保护 |
| R4 | 不经骑手 | 现状 |

### 4.2 T0-T4 防无人接力（现成，二期仅 C 端透出）
- **T0**：入厅即订阅消息提醒在线骑手；R5 发单页下单前调运力预检，紧张时提示「当前运力紧张，接单可能延迟」但不阻断发单。
- **T1**：滞留 >5min 加急置顶（加急 > 小费降序 > 入厅时间），小费加权对 R1/R3/R5 统一生效。
- **T2**：滞留超阈值自动强派在线骑手（事务+悲观锁防双抢）；拒单回大厅扣分。
- **T3**：web-admin 调度看板告警 + 手动派单/改派；R5/R2 接力单自动入列，零改造。
- **T4**：滞留超阈值自动退款 + 补偿券（compensationCouponTemplateId 可配）。

### 4.3 R2 联动单特殊降级语义（本二期实现）
1. **退款只退接力单**：T4 自动退款仅退 R5 接力单的跑腿费+小费，R2 原单不退款（快递已到校），接力失败自动降级为自取。
2. **原单状态动态渲染**：R2 原单卡片实时反查关联 R5 单状态；R5 单退款后原单自动回到「快递已到校 · 请选择取件方式」，可再次发接力或自取。
3. **C 端透出**：R5 单（含接力单）入厅后订单卡显示「平台调度中」降级态文案（沿用一期骑手卡表现）；R2 原单显示「接力单状态」子卡。

## 五、waimai 学生端

### 5.1 checkout
- 校园配送 tab 路线组按店铺 `routesEnabled` 动态显示 R1/R2/R3。
- R2 选时运费语义：快递段运费内含（沿用现有 calculator 出价），校内接力段 0 元（接力费用由 R5 发单单独承担）。

### 5.2 R2 订单卡（订单详情）
- `leg1Status=preparing`：显示快递轨迹（myOrderTracks）+「快递已到校」按钮 → 二次确认弹层「确认快递已到达校内代收点？」→ `shopMarkArrived`。
- `leg1Status=arrived_gate`：卡片变「快递已到校 · 请选择取件方式」，两个动作：
  - **我去自取**：展示代收点提示文案，学生自行取件，走既有确认收货完成订单。
  - **发 R5 接力**：跳转发单页并预填——A 点=校内代收点、`errandFrom`=R2 原单号、B 点=默认宿舍楼。
- 接力单状态子卡：动态反查（见 §3.5/§4.3）。

### 5.3 R5 校内拾光达
- **发单页** `pkg-campus/errand/create`：服务类型（代取快递/带饭/帮买/其他）+ A 点 + B 点 + 物品描述 + 跑腿费（起步价读 errandBaseFee）+ 小费滑杆 → 创建订单（虚拟商品载体）→ setErrandInfo → 支付 → 自动入厅。
- **我的跑腿单** `pkg-campus/errand/list`。
- **首页入口**：「校内拾光达」发单入口卡。
- T0 预检提示、入厅后「平台调度中」状态。

### 5.4 R4 到店自取
- checkout 自提 tab：自提点即店铺（storeAddress，§3.4 绑定产出）。
- 订单详情：显示自提核销码（复用现有渲染组件）。

## 六、web-admin

- 拾光达配置页表单加「跑腿起步价（元）」（errandBaseFee，分存储，复用 money.ts 转换）。
- 调度看板零改动；跑腿单走现有订单列表（不建专门页面）。

## 七、测试与交付

- plugin vitest：errandBaseFee 迁移/透出/负数拒绝、硬校验命中与豁免（errand 不校验）、shopMarkArrived 幂等/权限/非 R2 拒绝、R2 反查。
- waimai vitest：routeChoice R2 动态组、发单表单校验（必填/金额）、R2 预填逻辑。
- 三端本地构建 → 部署（plugin lib + waimai dist + web-admin dist，服务器仅 pull + pm2 restart）。
- 手机截图（390×844，dpr=2）目检 + 操作手册补二期章节。

## 八、范围外（三期+）

- 评价系统（menu 评论 tab 仍空态占位）。
- WebSocket 实时推送（维持一期轮询）、微信小程序端。
- 分区跑腿计价 calculator（本期固定起步价+小费）、R2 快递段运费计价改造。
- 自动派单策略调整（T2 现状沿用）。

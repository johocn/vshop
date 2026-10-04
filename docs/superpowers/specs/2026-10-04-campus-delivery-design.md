# 校园配送（美团外卖式）设计文档

日期：2026-10-04
状态：已定稿（待实施计划）
范围：vshop（C 端 + web-admin）+ vendure（新插件 campus-delivery-plugin）

## 1. 背景与目标

在 vshop 券商城现有能力上增加校园配送：学生网上点单 → 商家备餐/发货 → 勤工俭学学生（校园骑手）配送到宿舍楼下。复用现有支付、租户、配送、物流、余额体系，快速落地。

## 2. 需求决策记录

| 决策点 | 结论 |
|---|---|
| 配送链路 | 混合模式：校外商家接力 + 校内档口直送 |
| 商家订单来源 | 都在 vshop 点单（美团外卖式闭环），一商家一租户 channel |
| 骑手接单 | 抢单大厅 + 超时自动派单 |
| 骑手端形态 | vshop 内嵌分包（H5 + 小程序同一套） |
| 骑手报酬 | 按单分成入 vshop 余额（可提现），分成比例租户级可配，默认 100% 归骑手 |
| 配送费定价 | 分区计价（复用现有区域运费） |
| 骑手入驻 | 线上申请 + web-admin 审核 |
| 送达交接 | 宿舍楼下当面交付，拍照存证；联系不上走异常上报 |
| MVP 范围 | 一步到位：立即单 + 预约时段 + 独立跑腿单 |

## 3. 履约方式矩阵（核心模型）

订单履约 = 「第一程（货到校园）」+「第二程（到学生手里）」的组合，租户按商品配置可用路线：

| 路线 | 第一程 | 第二程 | 场景 |
|---|---|---|---|
| R1 商户自送+接力 | 商户自送到校门口交接点（复用 delivery-plugin `confirmPickupHandover`） | 骑手接力送宿舍楼下 | 校外餐饮/生鲜 |
| R2 快递到校 | 快递公司配送（复用 logistics-plugin 轨迹/回调/承运商字典） | 学生自取，或到校后发 R5 跑腿代取 | 电商发货/大件 |
| R3 档口直送 | —（档口在校内） | 骑手取货直送 | 校内档口 |
| R4 自提自取 | 商户自送/快递到校 | 学生到自提点核销自取（复用 pickup-plugin） | 免配送费 |
| R5 独立跑腿 | 骑手到 A 地取件 | 送到 B 地 | 代取快递/带饭/帮买 |

- **骑手抢单大厅 = 校园段统一运力池**：仅 R1/R3（商品单，支付后自动入厅）与 R5（跑腿单，学生主动下单）入厅；R4 不经过骑手。
- 校外段如需三方运力（达达/顺丰同城），通过 delivery-gateway-plugin 注册 provider 预留，本期不实现。

## 4. 总体架构（方案 A：薄插件 + 虚拟商品跑腿 + 内嵌骑手分包）

| 层 | 复用（不改） | 新增 |
|---|---|---|
| 后端插件 | delivery-plugin（delivery-staff 角色/权限、状态机 assigned→in_progress→delivered/exception、拍照送达、异常上报、改派）；logistics-plugin（轨迹/回调/发货）；pickup-plugin（自提点/核销）；wechatpay/vcash 余额；多租户 channel；order-timeout job 模式 | `campus-delivery-plugin`：抢单大厅、超时自动派、送达时段、分区/宿舍楼、骑手入驻审核、分成入余额、履约路线配置 |
| C 端 vshop | checkout 四类配送 Tab 架构（ShippingMethod.code 映射）、PickupLocationSheet、usePayment、余额 | `pkg-campus` 分包（跑腿下单/宿舍楼选择）；checkout 加「校园配送」方式 |
| 骑手端 | vshop 登录/上传/余额组件 | `pkg-rider` 分包：招募申请、抢单大厅、任务详情、收入 |
| 管理端 web-admin | 租户/人员管理、区域运费、订单管理、order/ship 发货 | 骑手审核、配送调度、履约配置 3 个页面 |

跑腿单建模：`orderKind=errand` 的 Order + 虚拟服务商品（如「代取快递-小件」，0 元载体），支付/退款/售后全复用，零新表。跑腿单费用 = 分区跑腿费（复用分区计价 calculator）+ 小费，不依赖商品价格。

## 5. 数据模型（campus-delivery-plugin）

**Order 新增 customFields**：
`fulfillmentRoute`（R1–R5 语义码）、`orderKind`（normal/errand）、`leg1Status`（preparing/arrived_gate）、`handoverAt`、`errandFrom/errandTo/errandKind`（跑腿 A/B 点与类型）、`deliverySlotId/deliverySlotText`、`buildingId/campusZone`、`hallEnteredAt/hallStatus`（open/grabbed/assigned）、`riderEarning`。骑手段状态沿用 delivery-plugin 的 `deliveryStatus`，不新增。

**Customer 新增 customFields**（骑手身份挂 C 端用户，不用 admin 账号）：
`riderStatus`（none/pending/approved/suspended）、`realName`、`studentNo`、`campus`。

**新实体**：
- `CampusZone`：分区 + 配送费
- `CampusBuilding`：宿舍楼，属分区
- `DeliverySlot`：可送达时段 + 容量
- `RiderEarning`：分成流水（markDelivered 时写入 vcash 余额）

**租户履约配置（channel 级，商品级可覆盖）**：R1–R5 开关、分区运费、可达时段、骑手分成比例。

**API 归属**：骑手侧走 shop-api（C 端登录态）；审核/调度/改派走 admin-api（web-admin）。

## 6. 关键机制

- **抢单防并发**：`UPDATE order SET hallStatus='grabbed' WHERE id=? AND hallStatus='open'` 乐观锁，失败返回「手慢了」。
- **超时自动派**：job 每 1 分钟扫描入厅超 N 分钟（默认 10，可配）的 open 单，按分区匹配在线骑手（最近活跃优先）指派；30 分钟仍无人 → 管理端告警，人工派单或自动退款（复用 after-sales）。
- **时段容量**：DeliverySlot.capacity 下单即锁位，乐观锁防超卖。
- **分成**：markDelivered 时按 `配送费/跑腿费（含小费）× 分成比例` 计算写 RiderEarning 并入 vcash 余额。
- **小费**：跑腿单加价，计入 riderEarning，用于提升抢单优先级排序。

## 7. C 端设计（vshop）

- `checkout.vue`：配送方式数据源改为租户履约配置接口（动态 Tab）；「校园配送」方式含宿舍楼选择（CampusBuilding，泛化自 PickupLocationSheet）、分区运费实时计算、送达时段（立即/预约 chips）。
- `pkg-campus/errand/create`：跑腿下单——服务类型（代取快递/带饭/帮买/其他）、A 点、B 点、物品描述、跑腿费 + 小费。
- `pkg-campus/errand/list`：我的跑腿单。
- `order-detail.vue`：按 fulfillmentRoute 渲染履约卡（R2 快递轨迹用 `myOrderTracks`；骑手进度；R4 自提核销码）。
- `profile`：riderStatus=none 显示「成为校园骑手」入口。

## 8. 骑手端设计（pkg-rider）

- `rider/apply`：招募申请（姓名/学号/学生证照上传 → 审核中态）。
- `rider/hall`：抢单大厅——在线开关、订单卡（路线/取送点/分成金额/倒计时）、15s 轮询（MVP 不上 WebSocket）、一键抢单。
- `rider/task`：任务详情——进度条（已接单→已取货→已送达）、取件信息、学生脱敏电话/短信、送达拍照（复用 delivery-plugin markDelivered）。
- `rider/income`：收入——分成流水、余额提现。

## 9. 管理端设计（web-admin）

- `rider/audit`：申请列表 → 通过（riderStatus=approved）/拒绝。
- `delivery/dispatch`：大厅实时单、超时告警、手动改派（复用 reassignDelivery）、异常单跟进（exceptionType）。
- `fulfillment/config`：路线开关、分区/宿舍楼/运费（复用区域运费组件）、时段容量、分成比例。
- 商家发货走现有 `order/ship`：R2 填快递单号自动建 logistics 轨迹。

## 10. 全链路状态机

```
商品单 R1/R3：支付 → 入厅(open) → 骑手抢到(grabbed) → assigned → in_progress → delivered(拍照) → 分成入余额
                     └→ N分钟无人抢 → 自动派单 → assigned → ...
                     └→ 30分钟仍无人 → 告警 → 人工派单或自动退款
跑腿单 R5：   发布支付 → 入厅 → 同上（小费计入 riderEarning）
R4 自取：     支付 → 自提码 → 核销
R2 快递：     支付 → 商户发货 → 轨迹回写 → 到校 → 自取 or 发 R5
异常：        reportException → 调度页跟进 → 改派或退款
```

## 11. 错误处理

- 抢单并发失败：乐观锁冲突提示重试。
- 自动派无人接：告警 + 超时上限退款。
- 快递轨迹回调失败：管理端手动 refreshTrack（已有）。
- 支付后入厅失败：job 兜底重扫已支付未入厅订单。

## 12. 测试与交付

- plugin 单测：抢单并发、自动派单、分成计算、时段锁容。
- e2e 回归：学生下单→骑手抢单→送达→分成入账全链路。
- 手机视口截图（390×844, dpr=2）：学生下单两屏、骑手大厅两屏、管理端调度页。
- 操作手册：骑手招募流程、商家履约配置、管理员调度。
- 部署：本地构建；vendure lib 入库 git pull + pm2 restart；vshop 走 deploy.mjs。

## 13. 非目标（本期不做）

- 实时骑手轨迹地图、WebSocket 推送
- 达达/顺丰同城真实接入（仅预留 provider）
- 多校区复杂模型（单校区多分区起步）
- 骑手评价/打赏体系

## 14. 实施顺序建议

1. 主闭环：campus 插件骨架（分区/宿舍楼/入厅/抢单/送达/分成）+ C 端校园配送 Tab + 骑手端大厅/任务 —— 先跑通 R1/R3
2. 骑手招募审核 + 收入提现闭环
3. 预约时段 + 自动派单 + 调度页
4. 跑腿单 R5（虚拟商品 + A/B 点）+ R2 快递联动 + R4 复用验证

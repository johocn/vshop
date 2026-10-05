# waimai 全链路 E2E 冒烟（2026-10-05/06）

范围：外卖 C 端下单 → 校园配送 → 骑手抢单/送达/分成 → 转单回大厅，跨双店铺渠道闭环。
环境：**生产 e.joho.cn**（campus-delivery-plugin 已部署），脚本幂等可重复执行。

## 脚本

| 脚本 | 作用 |
| --- | --- |
| `waimai-e2e-prepare.cjs` | 造数（幂等）：店铺渠道 canteen-a/b + 履约配置 + 校区 zone/楼栋/明日两时段 + waimai 渠道元数据 + ShippingMethod/PaymentMethod 渠道分配 + 共享冒烟商品（关库存跟踪）+ 两个冒烟顾客（下单者/已批准骑手） |
| `waimai-e2e-smoke.cjs` | 8 步全链路断言（详见下），开头自动清理上轮残留 activeOrder |

用法（本地 node 直连生产 API）：

```bash
node docs/verify/waimai-e2e-prepare.cjs   # 造数，可重复跑
node docs/verify/waimai-e2e-smoke.cjs     # 冒烟，期望输出 E2E SMOKE PASS
```

冒烟账号：`smoke-order@yourbao.cn` / `smoke-rider@yourbao.cn`（密码 Wm@Smoke123）。
渠道：canteen-a-token / canteen-b-token（channel 113/114）。

## 断言明细（2026-10-06 实测输出）

| 步骤 | 断言 | 结果 |
| --- | --- | --- |
| S1 | waimaiStoreList 店铺数≥3 且含 promoText≥2 | PASS（3 店 / 2 promo） |
| S2 | 下单者 native 登录 | PASS |
| S3 | 店铺 A 按 slug 加购冒烟商品，total>0 | PASS（total=181 起，随促销波动） |
| S4 | campusSetDeliveryTarget 写 zone/楼栋/R3/时段 | PASS |
| S4b | eligibleShippingMethods 含 campus-errand-*，运费=分区费 200 | PASS |
| S5 | admin 推 ArrangingPayment → shop addPaymentToOrder（COD 授权）→ admin settlePayment → PaymentSettled | PASS |
| S5 | 支付后 hallStatus=open + 时段 lockedCount 递增 | PASS |
| S6a | campusHall 含新单 | PASS |
| S6b | campusGrabOrder → hallStatus=grabbed / deliveryStatus=assigned | PASS |
| S6c | campusStartTask → in_progress | PASS |
| S6d | campusDeliverTask → delivered，riderEarning=140（=运费 200×70%） | PASS |
| S7a | myRiderEarnings 流水 status=credited | PASS |
| S7b | campusOrderRider 学生侧骑手卡（realName/credit 递增） | PASS |
| S8 | 店铺 B 下单→骑手接→未取货 campusTransferTask→任务列表移除+单回大厅 | PASS |

连续运行 3 轮均 `E2E SMOKE PASS`（订单号/流水/信用分正确累积，无残留干扰）。

## 排障沉淀（冒烟过程发现的真实约束）

1. **多渠道库存策略（Vendure 3.1+）**：默认 `MultiChannelStockLocationStrategy` 按渠道分仓，库存挂在默认渠道 StockLocation。店铺渠道 ctx 下加购共享商品会报 `INSUFFICIENT_STOCK_ERROR`。冒烟商品统一 `trackInventory: 'FALSE'`。
2. **ShippingMethod / PaymentMethod 均 ChannelAware**：新建渠道不分配则 C 端 `eligibleShippingMethods` / `eligiblePaymentMethods` 为空（下单流程卡死在 ArrangingPayment）。prepare 里已固化分配（campus-errand-smoke / cod-payment-template）。
3. **PaymentAuthorized→PaymentSettled 不能直接 transition**：`checkPaymentsCoverTotal` 要求存在 Settled 状态 Payment。COD 授权后须走 admin `settlePayment`，core 自动推单到 PaymentSettled。
4. **骑手 token 查不到他人订单**：shop-api `order(id)` 只返回自己（session customer）的订单。骑手侧状态一律走 `campusMyTasks`（前端 rider-delivering 即此实现）。
5. **campus* 自定义 mutation 返回类型**：`campusSetDeliveryTarget/campusGrabOrder/campusStartTask/campusDeliverTask/campusTransferTask` 均为纯 `Order!`（非 union），不要写 `... on ErrorResult`；失败经 GraphQL errors 抛出（如抢单「手慢了，该订单已被抢」）。
6. **campusSetDeliveryTarget 的 slotId 是 Int**：查询返回的 id 是字符串，传参需 `Number(slot.id)`。

## 已知限制

- 0 分成单（shipping=0 且 tip=0）送达时 `addBalance(0)` 抛 Invalid amount（库已写 delivered，非事务）。真实跑腿单不会踩，冒烟商品+东区运费不触发。
- 冒烟商品价格随全局促销波动（S3 只断言 total>0，不受影响）。
- ShippingMethod `campus-errand-smoke`、PaymentMethod `cod-payment-template` 为生产预建资源，prepare 幂等复用；若被删除需在 admin 重建后再跑 prepare。

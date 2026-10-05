# waimai 全链路 E2E 冒烟（2026-10-05/06）

范围：外卖 C 端下单 → 校园配送 → 骑手抢单/送达/分成 → 转单回大厅，跨双店铺渠道闭环。
环境：**生产 e.joho.cn**（campus-delivery-plugin 已部署），脚本幂等可重复执行。
H5 站点：**https://www.yourbao.cn/waimai/**（deploy 脚本本地构建 → scp → 静态目录解压）。

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
| S1 | waimaiStoreList 店铺数≥2 且含 promoText≥2（默认渠道脏配置已在后端过滤） | PASS（2 店 / 2 promo） |
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
2026-10-06 生产验收轮：S1-S8 全 PASS（订单 246/247），同轮补拍 8 页手机截图全合格（见 `docs/screenshots/waimai/`）。

## 排障沉淀（冒烟过程发现的真实约束）

1. **多渠道库存策略（Vendure 3.1+）**：默认 `MultiChannelStockLocationStrategy` 按渠道分仓，库存挂在默认渠道 StockLocation。店铺渠道 ctx 下加购共享商品会报 `INSUFFICIENT_STOCK_ERROR`。冒烟商品统一 `trackInventory: 'FALSE'`。
2. **ShippingMethod / PaymentMethod 均 ChannelAware**：新建渠道不分配则 C 端 `eligibleShippingMethods` / `eligiblePaymentMethods` 为空（下单流程卡死在 ArrangingPayment）。prepare 里已固化分配（campus-errand-smoke / cod-payment-template）。
3. **PaymentAuthorized→PaymentSettled 不能直接 transition**：`checkPaymentsCoverTotal` 要求存在 Settled 状态 Payment。COD 授权后须走 admin `settlePayment`，core 自动推单到 PaymentSettled。
4. **骑手 token 查不到他人订单**：shop-api `order(id)` 只返回自己（session customer）的订单。骑手侧状态一律走 `campusMyTasks`（前端 rider-delivering 即此实现）。
5. **campus* 自定义 mutation 返回类型**：`campusSetDeliveryTarget/campusGrabOrder/campusStartTask/campusDeliverTask/campusTransferTask` 均为纯 `Order!`（非 union），不要写 `... on ErrorResult`；失败经 GraphQL errors 抛出（如抢单「手慢了，该订单已被抢」）。
6. **campusSetDeliveryTarget 的 slotId 是 Int**：查询返回的 id 是字符串，传参需 `Number(slot.id)`。
7. **graphql-request v7 要求绝对 URL（生产 P0，dev 从未暴露）**：v7 内部 `new URL(url)` 对相对路径 `/shop-api` 直接抛 `Invalid URL`，页面 catch 静默吞掉 → 生产所有 API 请求零发出、页面全空态。dev 环境 `.env.development` 给了完整 origin 所以正常。修复：`client.ts` H5 下动态 origin 兜底（`window.location.origin + API_URL`，勿硬编码域名），`auth.ts` 复用 `getShopApiUrl()`，`usePayment.ts` 同款 fallback；`.env.development` 的 `VITE_API_URL` 已置空让 dev 与生产同形态。
8. **nginx yourbao conf 三坑（均已修复，备份 .bak_waimai_20261006）**：① 443 server 丢 `root /www/sites/e.joho.cn/yourbao;` → 主站一直显示 openresty 欢迎页、/waimai/ 内部重定向 500；② `location /shop-api/`（带尾斜杠）不匹配 `/shop-api`，POST 301 后降级 GET 丢 body →「must contain a non-empty query」，location 必须写 `/shop-api`；③ /waimai/ 静态两段 location（`@router` 回退 index.html）。
9. **waimaiStoreList 默认渠道污染**：默认渠道脏配置（channelId:1 + code `__default_channel__`）会混进店铺列表（骑手大厅曾见 16 单全默认渠道测试单）。后端 `waimai-store.service.ts` listStores 已加默认渠道过滤（vendure e6e51865a）。
10. **骑手信用分 CREDIT_LIMIT=60 静默拒单**：`assertApprovedRider` 要求 riderCredit≥60，多轮冒烟拒单扣分后 smoke-rider 掉到 18 → campusGrabOrder 报 FORBIDDEN（"You are not currently authorized"），与「未登录」文案相同极易误判。恢复：admin-api `updateCustomer(input:{id:"150",customFields:{riderCredit:100}})`。
11. **campusMyTasks selection 缺字段=前端拿 undefined**：MY_TASKS 查询 customFields 未选 `riderEarning` → 送达完成卡显示「分成 ¥0.00 已入账」（实际入账 ¥1.40）。GraphQL 未选择的字段不报错，靠截图目检才发现。
12. **uni-h5 刷新丢登录态**：`restoreSession()` 从未被调用（App.onLaunch 缺失）→ H5 刷新后 auth store 清空。已补 `App.vue onLaunch` 调用；`getStorageSync` 对 localStorage 直注的裸字符串 token 容错（JSON.parse 失败原样返回）。

## 已知限制

- 0 分成单（shipping=0 且 tip=0）送达时 `addBalance(0)` 抛 Invalid amount（库已写 delivered，非事务）。真实跑腿单不会踩，冒烟商品+东区运费不触发。
- 冒烟商品价格随全局促销波动（S3 只断言 total>0，不受影响）。
- ShippingMethod `campus-errand-smoke`、PaymentMethod `cod-payment-template` 为生产预建资源，prepare 幂等复用；若被删除需在 admin 重建后再跑 prepare。

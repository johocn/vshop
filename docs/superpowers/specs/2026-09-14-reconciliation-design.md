# 对账方案 设计文档（方案 2-C）

> **方案标识：方案 2 子项目 C（对账）**。方案2 拆 4 子项目按序设计：A 库存模型 → B 物流配送 → C 对账 → D 详情页展示。
> **存续：设计定稿，随方案2 各子项目一并存档，待多方案比选后统一执行（暂缓实施）。**

## 1. 目标与范围

为开启物理库存的租户建立**业务-资金-库存-配送四流总对账**：

- 日批 + 手动触发生成对账批次，逐单把订单的四流数据对齐到统一视图。
- 产出 4 类主差异，管理端提供**报告 + 人工修正闭环**（补记录/更正扣仓/调整库存/关联回款 → 重跑闭环）。

**未开启物理仓的租户**保留既有 settlement 资金核对，不引入 D1/D2/D4（已确认）。

## 2. 已确认决策

1. 对账维度：**业务-资金-库存三流总对账**（含配送闭环校验）。
2. 触发时机：**每日定时批 + 手动触发**（如每日 2:00 扫前一日，批次表留存可重跑）。
3. 差异处置：**报告 + 人工修正闭环**（不自动改数据）。

## 3. 数据模型

- `ReconciliationBatch`：`{tenantId, date, status(running/done), d1Count..d4Count, orderTotal, trigger(manual|cron), startedAt, finishedAt}`
- `ReconciliationOrderLine`：`{batchId, orderId, diffTypes[], status(closed|pending), remark, fixedAt, fixerId}`

**四流数据源**（全部复用既有）：
| 流 | 来源 |
|---|---|
| 业务 | `Order`（金额/状态/订单行） |
| 库存 | A 账本 `stock-ledger` `order:out`（orderId+sourceLocationId）+ `mirror` 镜像流水 |
| 配送 | B 的 `DeliveryRecord`（mode/sourceLocationId/状态） |
| 资金 | 既有 `MerchantSettlement`（线上支付成功 / COD `PENDING_SIGN→PAID` 回款） |

## 4. 对账规则与差异类型

| # | 差异 | 判定 | 处置 |
|---|---|---|---|
| D1 | 缺配送记录 | 已发货单无 `mode∈{self,express,pickup}` 记录 | 补配送记录 |
| D2 | 扣仓不一致 | 账本 `order:out` 仓 ≠ 配送记录仓（或缺失） | 更正扣仓（触发 A 重算） |
| D3 | 金额不平 | 订单应付 ≠ (线上成功 + COD 已签收) | 关联回款/退款冲抵 |
| D4 | 镜像不平 | 虚拟 onHand ≠ Σ 绑定物理仓 onHand | 调整库存（盘点/校准，镜像自动重算） |

**COD 专项**：`PENDING_SIGN` 不算回款（资金流未闭环），签收转 `PAID` 后纳入；退款/拒收单标记 `refunded` 组，不参与 D3。

**批次重跑幂等**：同批日期重扫，不重复记账；修正后单条重跑 → `closed`。

## 5. 展示（web-admin 对账页）

- 批次列表：日期/状态/4 类差异计数/订单数/触发方式/重跑
- 批次详情：差异 Tab（D1-D4）+ 逐单操作（补记录/更正扣仓/调整库存/关联回款/备注）→ 重跑变绿 closed
- 顶部全闭环率 `closed/total`

## 6. 边界

- 仅开启物理仓租户启用四流全量；未开启走既有 settlement。
- 修正动作走既有业务入口（B 录入、A 库存调整、settlement 回款），对账不直接写业务数据。
- 差异单重跑仅重算该单，不影响批次整体。

## 7. 测试与交付

- 纯函数单测：`diffOrder`（D1-D4 判定，含 COD 未签收不算差、退款单跳过）、`recomputeMirrorDiff`、批次重跑幂等。
- 集成：日批调度 + 手动触发；修正→重跑→closed；COD PENDING_SIGN→PAID 纳入。
- 两端构建 + 部署 + GraphQL 冒烟 + 手机视口回归截图（对账页差异列表 + 逐单修正）+ 操作手册 op-19。

## 8. 非目标（YAGNI）

- 自动修正差异（人工闭环已确认）。
- 物流费用/运费对账（留待后续）。
- 多币种/跨境结算对账。
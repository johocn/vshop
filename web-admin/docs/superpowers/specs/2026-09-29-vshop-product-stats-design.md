# 商品销量 / 积分数据源 设计（v1）

- 日期：2026-09-29
- 涉及仓库：`d:\zhao\vendure`（后端为主）、`d:\zhao\vshop`（前端接线）
- 待办来源：`BACKLOG.md` §1.3「销量 / 积分补数据源」、§4「无法判断项」
- 参照物口径：`manual/vshop-usemall-alignment/README.md` §5.3（「详情页用户评价区、销量/积分元信息｜无数据源，采用『有则显示』降级，本轮不新增后端字段」）

---

## 1. 背景与现状

商品详情页元信息行的 UI 与降级逻辑**早已交付**，缺的只是后端数据源。

| 位置 | 现状 |
|---|---|
| `vshop/src/pkg-product/pages/detail.vue` L20-36 | 元信息行已渲染「分享 / 海报」，并按 `v-if="salesCountText"` / `v-if="pointsText"` 渲染「已售 N」「可得 X 积分」 |
| 同上 L167-175 | `salesCountText` 读 `product.customFields.salesCount`，`pointsText` 读 `product.customFields.pointsReward`，`> 0` 才显示 |
| `vshop/src/api/fragments.ts` L22 | `PRODUCT_DETAIL_FRAGMENT` 的 `customFields` **只取 `videoAssetId sellingPoint`**，没取这两个字段 |
| `vendure/packages/marketplace-plugin/src/custom-fields.ts` L5-101 | Product 自定义字段清单（`listedInMarketplace` / `sellingPoint` / `videoAssetId` / `promos` / `services` …），**无销量与积分字段** |
| `vendure/packages/dev-server/dev-config.ts` L308 | `Product: []`（dev-config 侧未额外声明 Product 字段） |

结论：**前端契约已固定为 `Product.customFields.{salesCount, pointsReward}`**，后端只需补齐这两个字段并给出可信数据源，前端改动收敛到 1 行 fragment。

---

## 2. 目标与非目标

### 目标

1. Product 具备可展示、可核对、可人工干预的「销量」与「可得积分」数据。
2. 销量以**真实订单聚合**为基准，同时允许后台补一个展示基数，避免新商品长期显示「已售 1」。
3. 可得积分与**会员积分实际发放规则**口径一致，同时允许单品覆盖。
4. 后台可在商品编辑页直接维护，无需额外开发 dashboard 组件。
5. 前端 `detail.vue` **零展示逻辑改动**，只补 fragment 字段。

### 非目标

- 不做实时（准实时）销量：销量变化由每日任务收敛，最多 T+1。
- 不做按渠道（店铺）拆分的销量统计（见 §7 取舍 1）。
- 不做「已售」在列表页 / 首页楼层的批量展示。
- 不做积分的发放逻辑改造（`member-level-plugin` 现有规则不动）。

---

## 3. 数据模型

在 `vendure/packages/marketplace-plugin/src/custom-fields.ts` 的 `Product` 数组追加 5 个字段。

| 字段 | 类型 | public | 默认值 | 可空 | 用途 |
|---|---|---|---|---|---|
| `salesCount` | int | 是 | 0 | 否 | **展示销量** = `realSalesCount + bonusSales`，由重算写回；前端直读 |
| `realSalesCount` | int | 否 | 0 | 否 | 真实聚合销量（已支付及之后状态的订单明细数量），后台可核对 |
| `bonusSales` | int | 否 | 0 | 否 | 后台展示基数（运营手填） |
| `pointsReward` | int | 是 | 无 | 是 | **展示积分** = `pointsRewardOverride ?? 派生值`，由重算写回；前端直读 |
| `pointsRewardOverride` | int | 否 | 无 | 是 | 后台单品覆盖值 |

约定：

- `public: true` 只给两个**展示值**，内部字段不进 shop API。
- 后台（admin API）始终能看到全部 5 个字段；Vendure 会自动在商品编辑页渲染这些自定义字段的表单控件，**不需要写 dashboard 组件**。
- 生产 `dbConnectionOptions.synchronize = true`，且新增字段均为「int + 有默认值」或「int + nullable」，重启即自动建列，无需手写 migration。

---

## 4. 计算口径

### 4.1 销量聚合

```
realSalesCount(product) = Σ orderLine.quantity
    WHERE orderLine.productVariant.productId = product.id
      AND order.state IN ('PaymentSettled','PartiallyShipped','Shipped','PartiallyDelivered','Delivered')
```

- 状态白名单即「已支付及之后」。`AddingItems` / `ArrangingPayment` / `PaymentAuthorized` / `Modifying` / `ArrangingAdditionalPayment` / `Draft` / `Cancelled` 天然排除（草稿单处于 `Draft` 状态，无需额外过滤条件）。
- **全渠道合计**：Product 是全局实体（渠道通过 `product_channels_channel` 关联共享），销量不做渠道维度拆分。
- 退货/退款**不回退**销量（`Cancelled` 单不计入，已交付后退款不影响历史销量口径）。

### 4.2 可得积分派生

```
basePriceCents(product) = MIN(productVariant.price)          // 不含税，单位「分」
pointsReward = pointsRewardOverride ?? floor(basePriceCents × 1)
```

口径对齐依据（`member-level-plugin/src/plugin.ts` L297-310）：

| 维度 | 会员实发规则 | 本设计的详情页展示 |
|---|---|---|
| 触发点 | 订单进入 `Delivered` | 不涉及（纯展示） |
| 基数 | `order.subTotal`（不含税、不含运费；`pointsEarnOnShipping=true` 时用 `order.total`） | 商品最低变体的**不含税**价 `productVariant.price` |
| 倍率 | 会员档位 `tier.pointsMultiplier`（千分比，1000 = ×1），已取代 `channel.pointsEarnRatio` | 固定按基础倍率 ×1 |
| 取整 | `Math.floor` | `Math.floor` |

- 因为倍率来自**会员档位**，未登录访客无法得知，详情页统一按 ×1 展示；实际发放可能更高（高等级会员），不会更低。
- 积分折算关系：`Channel.pointsPerYuan` 默认 100（100 积分抵 1 元），配合 1 分 = 1 积分 ⇒ ¥99 商品「可得 9900 积分」，即积分价值 ≈ 消费额 1:1。

### 4.3 写回规则

```
salesCount  = realSalesCount + bonusSales
pointsReward = pointsRewardOverride ?? floor(basePriceCents × 1)
```

前端 `> 0 才渲染` 的降级逻辑保持不变：无销量、无积分时整行不占位。

---

## 5. 重算机制

全部落在 `operations-plugin`（已有 `ScheduledTask` 先例 `content-lifecycle.task.ts`、已有 admin/shop resolver、已有 vitest + sqlite e2e 基建、生产已注册 ⇒ **不新增插件包、不改构建脚本、不动生产软链**）。

### 5.1 服务

`ProductStatsService`：

- `recomputeForProducts(ctx, productIds)`：按商品重算 §4.3 两个展示值。
- `recomputeAll(ctx)`：全量重算（分页遍历商品）。
- 幂等：只由订单/变体/基线三个输入决定，重复执行结果一致。
- **写前比对**：读取当前 `salesCount` / `pointsReward`，与算出的新值逐字段比较，**完全相同则不调用 `ProductService.update`**（避免无谓写入与事件自激）。

### 5.2 定时任务

`productStatsTask`（`ScheduledTask`）：

- `id: 'operations-product-stats'`
- `schedule: '5 3 * * *'`（每日 03:05）
- `preventOverlap: true`
- 由 `DefaultSchedulerPlugin` 在 **worker 进程**执行（生产必须常驻 `vendure-worker`，与既有约定一致）
- 负责订单驱动的销量收敛（新增订单带来的销量变化最多 T+1 生效）

### 5.3 后台编辑即时生效

订阅两个事件，命中后对该商品执行 `recomputeForProducts`：

- `ProductEvent`：`type` 为 `created` 或 `updated`
- `ProductVariantEvent`：`type` 为 `created`、`updated` 或 `deleted`

作用：运营在后台改完 `bonusSales` / `pointsRewardOverride`，或改完变体价格后，展示值立即刷新，不必等次日任务；新建商品的变体会在其价格落库后立刻把 `pointsReward` 补上。

自激防护：依赖 §5.1 的写前比对——重算若无变化则不写，不写则不产生新事件，循环最多一轮即终止。

### 5.4 手动重算接口

admin mutation：

```graphql
extend type Mutation {
    recomputeProductStats(productIds: [ID!]): Int!
}
```

- 返回本次实际被更新的商品数。
- `productIds` 省略或传空数组 = 全量重算。
- 权限：`@Allow(Permission.UpdateProduct)`。
- 用途：部署后**一次性回填**（生产现有 133 订单 / 83 商品的量级，一次调用即可），以及运营手动纠偏。

> 一次性回填不单独写脚本文件：部署后用 admin API 调用一次 `recomputeProductStats`（不带参数）即完成，避免在生产环境跑临时 node 脚本。

---

## 6. 前端接线（vshop）

**前置条件：并行会话已停止占用 vshop C 端文件。** 当前 `detail.vue` / `fragments.ts` / `SkuSheet.vue` 被另一会话（评价体系前端）占用，禁止并行修改。

改动清单：

1. `src/api/fragments.ts` L22（1 行）：
   `customFields { videoAssetId sellingPoint }` → `customFields { videoAssetId sellingPoint salesCount pointsReward }`
2. `src/pkg-product/pages/detail.vue`：**展示逻辑零改动**（`salesCountText` / `pointsText` 与 `v-if` 降级均已就绪）。
3. `src/pkg-product/pages/detail.vue` 元信息行**仅本次要碰的两处**改走 i18n 字典（2026-09-29 用户确认的最小范围）：
   - `已售 {{ salesCountText }}`（第 31 行）→ `{{ t('product.sold') }} {{ salesCountText }}`。**复用已存在的 key**：`product.sold` 在 5 个语言包中均已定义且代码中从未被引用，**零新增 key**。
   - 「可得 X 积分」：目前由 `pointsText` computed（第 172-175 行）拼出中文字符串 → 改为新增 key `product.pointsReward`（值 `可得 {n} 积分`），在 computed 内用 `t('product.pointsReward', { n })` 生成。
   - 新增 key 需同步补齐全部 5 个语言包：`zh-CN.json`、`en.json`、`zh-TW.json`、`ja.json`、`ko.json`。
   - `detail.vue` 已具备 `const { t } = useI18n()`（第 121 行），无需新增引入。
   - 该改动只动模板文案、computed 的字符串来源与语言包，不改计算逻辑与 `v-if` 降级。

   明确不在本次范围：该文件其余硬编码文案（分享 / 海报 / 价格说明 / 秒杀价 / 已选 / 已加入购物车 / 客服功能敬请期待 / 请点击右上角分享 等）仍留在 `BACKLOG.md` §1.3「全站 i18n 化」那一轮统一处理；其中「收藏功能敬请期待」「客服功能敬请期待」属其它待办，避免跨任务互相覆盖。

---

## 7. 验证与验收

### 7.1 e2e（`operations-plugin`，vitest + sqlite）

用例：

1. **只计已支付及之后**：造一笔 `PaymentSettled` 单（数量 2）与一笔 `Cancelled` 单（数量 5）→ 重算 → `realSalesCount === 2`。
2. **展示值 = 真实 + 基数**：设 `bonusSales = 100` → 重算 → `salesCount === realSalesCount + 100`。
3. **积分派生与覆盖**：变体不含税价 9900 分 → 无覆盖时 `pointsReward === 9900`；设 `pointsRewardOverride = 500` → 重算 → `pointsReward === 500`。
4. **幂等**：连续重算两次，第二次返回更新数 0，值不变。
5. **全量重算**：`recomputeAll` 覆盖多商品，返回更新数正确。

### 7.2 生产验证

- `https://e.joho.cn/shop-api` 探针：查询商品 `customFields { salesCount pointsReward }`，确认可读且与后台 `realSalesCount + bonusSales` 一致。
- 生产 `synchronize=true` 建列后，`product` 表新增列存在性检查。

### 7.3 手机视口截图

- 视口 390×844、dpr = 2（780×1688）。
- 需产出至少三张：**有数据**（显示「已售 N」「可得 X 积分」）、**无数据**（整行不占位）、**切换语言后**（验证 `product.sold` / `product.pointsReward` 两个 key 即时生效）。
- 截图补进操作手册对应章节。

### 7.4 文档

- vendure 插件接口文档：**新建** `docs/plugins/operations-plugin.md`（现有 `docs/plugins/` 下无该文件），记录 `recomputeProductStats` mutation、`ProductStatsService` 两个方法、每日任务与事件订阅、以及新增的 5 个 Product 字段；同时在 `docs/plugins/README.md` 更新插件计数与索引（沿用 `favorite-plugin` 的补录方式）。
- vshop 对齐手册 `manual/vshop-usemall-alignment/README.md` §5.3：把「本轮不新增后端字段」一行改为已交付并注明提交号。
- `BACKLOG.md` §1.3 / §4：更新该项状态与卡点结论。

---

## 8. 部署

1. 本地构建（本地编译 `operations-plugin` / `marketplace-plugin` 的 lib 与 `dev-server` 生产 dist），**不在服务器构建**。
2. 服务器 `/www/apps/vendure` `git pull` → `pm2 restart vendure vendure-worker`（`synchronize=true` 自动建列）。
3. 部署后调用一次 admin mutation `recomputeProductStats`（全量）完成回填。
4. 执行 §7.2 探针。
5. vshop 前端在并行会话释放后接线，走既有部署流程（本地构建 → 产物上服务器）并补手机截图。

---

## 9. 风险与取舍

| # | 取舍 | 结论与理由 |
|---|---|---|
| 1 | 销量是否按渠道拆分 | **不拆，全渠道合计**。Product 是全局实体，按渠道存需要 struct/另建实体，成本显著上升；详情页展示本身也不区分店铺来源 |
| 2 | 实时性 | **接受 T+1**。每日全量重算换来幂等、无漂移、无回退配对逻辑；对比事件增量方案（取消/退款回退易漂移、实现与测试成本最高）收益不值 |
| 3 | 积分倍率 | **详情页固定 ×1**。倍率由登录会员档位决定，未登录不可知；按 ×1 展示是下界，不会误导为「可得更多」 |
| 4 | 字段数偏多（5 个） | 接受。`realSalesCount` 保证「真实值可查」，`bonusSales` / `pointsRewardOverride` 保证运营可干预；前端只读 2 个展示值，契约稳定 |
| 5 | `ProductEvent` 订阅可能自激 | 由 §5.1 写前比对阻断；最坏情况多算一轮，不会无限循环 |
| 6 | 退款不回退销量 | 与主流电商「已售」口径一致（历史成交口径），且避免退款回退的复杂配对 |

---

## 10. 遗留项（登记到 BACKLOG）

| 项 | 口径 |
|---|---|
| 销量按渠道拆分 | 明确不做（见 §9 取舍 1） |
| 销量/积分在列表页、首页楼层展示 | 本轮不做 |
| 商品列表页销量排序 | 本轮不做（无索引与排序需求确认） |
| 积分展示随会员档位变化 | 本轮不做（需登录态与档位查询，另议） |

# 真实未完成清单（项目唯一待办依据）

- 建立日期：2026-09-29
- 覆盖仓库：`d:\zhao\vshop`（uni-app C 端 + `web-admin` 后台前端）、`d:\zhao\vendure`（Vendure 3.6.4 后端，多插件）
- 维护约定：**本文件是待办事项的唯一依据**；`docs/superpowers/plans/*.md` 的复选框状态**不可作为依据**（见 §0）

---

## 0. 为什么需要这份文件

本项目普遍存在**「代码已交付、实施计划复选框从未回填」**的情况。2026-09-29 的一次全量核查结论：

| 现象 | 实测 |
|---|---|
| `plans/` 目录下 `- [ ]` 总数 | 两端合计 859 个「未勾选」Step |
| 其中**真实未做**的 | 仅 71 个（全部属于 vshop 第二轮 usemall 对齐计划） |
| 其余 788 个 | **代码与产物均已存在**，属「做了没勾」 |

因此：
1. **不要**用复选框判断待办，用本文件。
2. 一次误判实例：vshop 有 13 份 plan 显示「剩 1–2 项」，严格核查后真实未完成 Step 为 **0** —— 那 1–2 项分别是计划**头部模板说明行**（`> **For agentic workers:** … Steps use checkbox (`- [ ]`) syntax for tracking.`）和历史「**本次回填动作**：勾选本计划全部 N 个 `- [ ] **Step` 复选框」这类**回填记录行**，都是文档字面量，不是待办。

> 核查手法：只匹配 `^\s*- \[ \] \*\*Step` 才是真实 Step 复选框；`L3` 的说明行与「回填动作」段都是散文，会把朴素正则计数污染。

---

## 1. 真实未完成清单

### 1.1 vshop — 第二轮 usemall 对齐（唯一明确的真实待办）

| 项 | 状态 | 依据 |
|---|---|---|
| S1–S6（SKU 弹层收口 + 评价体系） | **未完成** | [2026-09-29-vshop-usemall-alignment-round2-plan.md](plans/2026-09-29-vshop-usemall-alignment-round2-plan.md)，13 个 Task / 71 个真实未勾 Step；Task 1 代码已提交（`447b103`）但未勾选 |

> ⚠️ 2026-09-29 20:40 前后观测到 `vshop` 工作区有**另一个会话正在执行该计划**（`dist/build/h5` 被重新构建为 `assets/index-C22kxUJ6.js`，且出现非本地提交 `b885820` / `7c3f9b6` / `447b103`）。**接手前必须先确认该会话已停止**，否则 `fragments.ts` / `SkuSheet.vue` / `detail.vue` 会互相覆盖。
>
> ⚠️ 2026-09-29 21:38 补充：该会话**同时在改 `vendure` 仓库**（`packages/review-plugin/e2e/review.e2e-spec.ts` 被写入 `ratingMin/ratingMax` 分档筛选用例，且 21:38:43 时 e2e 端口 3250 被其占用导致本侧 e2e 无法并行）。**vendure 侧也不要与其争抢 `review-plugin` 相关文件与 e2e 端口。**

### 1.2 vshop — 拼团页遗留限制（非缺陷，已知取舍）

来源：[2026-09-29-vshop-group-buy-my-tabs-design.md](specs/2026-09-29-vshop-group-buy-my-tabs-design.md) §8

| 项 | 口径 |
|---|---|
| 我的团无分页 | 暂不做（单客户记录量小） |
| 团进度不实时 | 仅本地 tick 走倒计时，`currentCount` 需重进页面才刷新 |
| 无拼团详情页 | 主按钮直接落订单详情 |
| 拼团页无首页入口 | 与第一轮一致（`flash` 楼层的 `source=groupBuy` 枚举已预留，后台不暴露） |

### 1.3 vshop — 对齐相关未交付项

来源：[usemall 对齐手册](manual/vshop-usemall-alignment/README.md) §5.3、第二轮 spec §1.2 / §8

| 项 | 口径 | 卡点 |
|---|---|---|
| 收藏按钮前端接线 | **待做** | 后端已启用（2026-09-29，vendure `74178691d`：注册 `FavoritePlugin` + 重建生产 dist + 补服务器 workspace 软链 + 生产 shop-api 实测全绿）。前端 `detail.vue` 仍是 `ui.showToast('收藏功能敬请期待')` 占位；该文件当时被并行会话占用，接线待其结束后进行 |
| 销量 / 积分补数据源 | **已交付**（2026-09-29，v1.8） | 后端 `Product.salesCount`/`pointsReward` 等 5 字段 + 每日重算任务 + 事件即时生效 + `recomputeProductStats` 回填（vendure `004194882`）；前端 fragment 接线 + 两处文案走 i18n（vshop `4095dda`）。副本见手册 §5.11，遗留项见 §4 |
| 全站 i18n 化 | 延后 | 商品/订单页仍有中文硬编码；新增页面已走 i18n |
| 评价「有图 / 标签」筛选 | 延后 | 需扩 shop SDL（`hasImages` / `tag`） |
| 评价追评、有用计数、修改/删除 | 明确不做 | 参照物 usemall 评价页无这些元素 |
| 订单备注落库 | 明确不做 | 前端暂存即可 |
| 评价视频 | 明确不做 | usemall 评价上传只有图片 |

### 1.4 vshop — web-admin 后台遗留 backlog

来源：[2026-09-20-web-admin-gap3-inventory.md](specs/2026-09-20-web-admin-gap3-inventory.md) §L133-155 / L175-177

| 项 | 口径 |
|---|---|
| 分销域后台（只读） | 后续（该 spec 将其列为 G8） |
| 五级回退合并算法的后台编辑 | 明确不做 |
| mp 手册同步 | 明确不做 |
| 订单多版式渲染器改造 | 明确不做 |

### 1.5 vendure — 规划功能复核（2026-09-29 结论：六项均已覆盖，不构成待办）

来源：[2026-06-02-cjk-localization-design.md](file:///d:/zhao/vendure/docs/superpowers/specs/2026-06-02-cjk-localization-design.md) L432-453

| 项 | 口径 |
|---|---|
| 发票 / 物流追踪 / 订单超时取消 | **已覆盖**（2026-09-29 复核）：`InvoicePlugin` / `LogisticsPlugin` / `OrderTimeoutPlugin` 均在 [dev-config.ts](/d:/zhao/vendure/packages/dev-server/dev-config.ts) 注册，`startup.log` 显示 `*Plugin initialized` 成功；spec L432-437 的「❌ 后续」已过时 |
| 拼团 / 秒杀 / 分销佣金 | **已覆盖**（2026-09-29 复核）：`GroupBuyPlugin` / `FlashSalePlugin` / `DistributionPlugin` 同样已注册运行（启动时各自生成 `*DynamicShopModule` / `*DynamicAdminModule`），拼团侧已在本项目多轮迭代中实测 |

> 另：2026-06/07 批次的历史计划经产物级核查**全部已交付**（见 §2），不构成待办。

---

## 2. 已核实「已交付但未勾选」的历史计划（2026-09-29 回填）

判定依据为**产物级证据**（关键文件存在 + git 历史可对应），非逐 Step 复走。

### 2.1 vendure（17 份，回填时已勾选）

| 计划 | 判定 | 产物证据 |
|---|---|---|
| 2026-06-02-admin-ui-extension-plan.md | 已交付 | `packages/cjk-plugin/dashboard/pickup-location-list.tsx`、`pickup-location-detail.tsx` |
| 2026-06-02-advanced-features-plan.md | 已交付 | `packages/redis-stock-plugin/src/stock-reserve.service.ts`、`stock-prewarm.service.ts` |
| 2026-06-02-cjk-extended-features-plan.md | 已交付 | `packages/cjk-plugin/src/` 下 map / tenant / payment / pickup / admin 各域齐备 |
| 2026-06-02-cjk-localization-plan.md | 已交付 | `packages/cjk-plugin/src/i18n/{zh_CN,zh_TW,ja,ko}.json`、`src/auth/i18n-messages.ts`、`src/pickup/i18n-messages.ts` |
| 2026-06-02-schema-integration-plan.md | 已交付 | `packages/cjk-plugin/src/plugin.ts` 的 `adminApiExtensions` / `shopApiExtensions` |
| 2026-07-14-china-test-data.md | 已交付 | `packages/dev-server/china-data/*.ts`（16 个分片）+ `populate-china-dev.ts` |
| 2026-07-15-c-shop-experience.md | 已交付 | `packages/distribution-plugin/src/commission.service.ts`、`packages/cjk-plugin/src/auth/sso-authentication-strategy.ts`（`referralCode`） |
| 2026-07-15-tenant-payment-config.md | 已交付 | `packages/cjk-plugin/src/payment/payment-config.ts`、`payment-config.types.ts` |
| 2026-07-16-pickup-location-backend.md | 已交付 | `packages/cjk-plugin/src/pickup/pickup-location.{entity,service}.ts`、`pickup-location-{admin,shop}.resolver.ts`、`src/map/**` |
| 2026-07-16-pickup-location-frontend.md | 已交付 | `packages/cjk-plugin/dashboard/pickup-location-{list,detail}.tsx` |
| 2026-07-16-pickup-location-map-quick-locate.md | 已交付 | `packages/cjk-plugin/dashboard/components/map-picker.tsx`、`region-cascade-selector.tsx`、`map-sdk-loader.ts` |
| 2026-07-16-pickup-location-ui-buttons.md | 已交付 | 同上（列表页按钮在 `pickup-location-list.tsx`） |
| 2026-07-16-tenant-custom-domain.md | 已交付 | `packages/cjk-plugin/src/tenant/domain-resolver.service.ts` |
| 2026-07-17-tenant-config-center.md | 已交付 | `packages/cjk-plugin/dashboard/tenant-config-center.tsx`、`tenant-config-tabs.tsx`、`src/admin/tenant-config-admin.resolver.ts`、`src/tenant/tenant-config.types.ts`；git 08-15 一串提交 |
| 2026-09-01-product-coupon-tenant.md | 已交付 | `packages/coupon-plugin/src/coupon-binding.service.ts`、`coupon-settlement.ts` |
| 2026-09-19-coupon-gaps-supplement.md | 已交付 | `packages/coupon-plugin/e2e/coupon.e2e-spec.ts`（含 `boundProducts` / `productIds` 断言） |
| 2026-09-19-product-coupon-binding.md | 已交付 | `packages/coupon-plugin/src/coupon-binding.service.ts` + `coupon-binding.service.spec.ts` |

- `2026-09-01-pickup-redeem-payment-closure.md`：**无真实待办**（唯一未勾行是 `L3` 模板说明行）

### 2.2 vshop（无需回填）

13 份「显示剩 1–2 项」的 plan（order-list-\*、shop-order-address、delivery-capability-derivation、shop-style-theme-unify、web-admin-i18n、inventory-stock-upgrade、order-list-filter-state-layout、stocktake-collab、stocktake-ops-enhancement、web-admin-gap4、gap4-remaining-closure、home-skeleton-fallback）**真实未完成 Step 均为 0**，且均已由历史提交完成「勾选 + 追加执行结论」，本次无需改动。

---

## 3. 文档失真项（文档说没做、实际已有）

| 来源 | 事项 | 实况 |
|---|---|---|
| usemall 对齐手册 §5.3 | 购物车「已下架」标签曾被记为未交付 | 已由 `289fa4f`（后端 `718c4f11d` 暴露 `ProductVariant.enabled`）交付 |
| usemall 对齐手册 §5.3 / 第二轮 spec §1.2 | 拼团页「我的开团 / 我的参团」曾被记为「不做 / 开放项」 | 已由 `0c51499` + `c98715e` 独立交付（v1.5） |
| 第二轮 spec §1.2 | 上表两处已在 2026-09-29 回填口径 | — |

---

## 4. 无法判断项（需人工确认）

| 项 | 卡点 |
|---|---|
| 收藏按钮前端接线 | **已消解后端卡点**（2026-09-29 启用 `FavoritePlugin`）；剩余纯前端改造，登记于 §1.3 |
| 销量 / 积分数据源 | **已消解**（2026-09-29）：数据源已交付并回填。明确不做：按渠道拆分销量 / 列表页与首页楼层展示 / 列表销量排序 / 积分随会员档位变化（见 spec §10 遗留项、手册 §5.11.5） |
| 评价「有图 / 标签」筛选 | 需确认是否值得扩 shop SDL（当前 4 档星级筛选已够用） |
| vendure 规划中的发票/物流/订单超时/秒杀/分销 | **已复核消解**（2026-09-29）：六项均已在 `dev-config.ts` 注册并成功初始化，见 §1.5 |

---

## 5. 维护约定（请后续遵守）

1. **每个 Task 完成即勾选**对应的 `- [ ] **Step`，不要攒到最后批量回填。
2. **计划收尾必须追加一节「执行结论」**：写清轮次、提交号、验证手段（编译门禁 / e2e / 手机截图 / 探针）、以及遗留项。
3. 计划头部 `L3` 的模板说明行与「本次回填动作」段是**散文**，不要把它们当成待办或勾选对象。
4. 新产生的遗留项**同步登记到本文件**（§1），避免再次散落。

# 积分商城 + 商品收藏 完善优化设计（points-mall polish）

> 日期：2026-10-10 ｜ 范围：vendure points-mall-plugin + vshop C端 + web-admin
> 交付节奏：单批全量（方案一），一次提交推送部署收口。

## 目标

对已上线的积分商城/商品收藏做四方向完善：A 性能、B 一致性加固、C 功能增强（后台搜索 + 超时关单）、D 体验细节。

## 后端 vendure（packages/points-mall-plugin）

1. **价格计算并行化**：`applyVariantPrices` 由 `for...of await` 改 `Promise.all` 并行（列表 20 条从 20 次串行变 1 轮并行）。
2. **admin 状态流转原子化**：`applyTransition` 改 `UPDATE ... WHERE id AND status=from AND channelId` 原子抢占；affected=0 重查区分「不存在/状态不符」抛错。三个 markXxx 签名不变。
3. **限兑检查串行化**：下单路径 `loadPointsProductForOrder` 加 `lock: { mode: 'pessimistic_write' }`（resolver @Transaction 内），同商品并发下单经行锁串行，perUserLimit count 无窗口。
4. **admin keyword 搜索**：`PointsProductAdminListOptions` / `PointsOrderAdminListOptions` 加 `keyword: String`。商品：join ProductVariant/ProductTranslation 名称 ILIKE，纯数字精确匹配 productId；订单：code ILIKE，纯数字精确匹配 code/customerId。
5. **超时关单**：新增 `points-order-expiry.task.ts`（Vendure ScheduledTask，every 1 分钟，preventOverlap）。跨渠道分组扫 `pending_payment 且 createdAt < now - N 分钟` → 按渠道建 ctx（渠道缺失回退 scheduledContext）→ 逐单原子取消。取消逻辑抽共享私有方法（退分 addPoints + 回补库存 + 支付单置 cancelled），客户版 cancelPointsOrder 与定时版复用。阈值 options `pointsOrderTimeoutMinutes` 默认 30。
6. **myRedeemedCount**：shop schema PointsProduct 加 `myRedeemedCount: Int!`；登录用户一次 GROUP BY 批量查（customerId + pointsProductIds + status != cancelled），游客恒 0。

## C端 vshop（src）

7. **confirm 页剩余额度**：`maxQty = min(stock, perUserLimit>0 ? max(0, perUserLimit - myRedeemedCount) : stock)`；额度 0 禁用提交并提示「已达限兑上限」（i18n 五语言同步）。
8. **游客 401 修复**：points-goods-list.vue 仅 `auth.isLoggedIn` 时调 getMyMemberInfo。

## web-admin（web-admin/src）

9. **搜索框**：积分商品/积分订单两页列表顶部加 keyword 搜索（回车/按钮触发，重置 skip），`apis/points-mall.ts` 透传 keyword。

## 测试与交付

- e2e 补用例：超时关单（过期单 → task 执行 → 断言 cancelled/退分/回补/支付单 cancelled）、keyword 搜索、myRedeemedCount 两态。
- 手机截图（390×844@2x）：confirm 限兑余量 + 商品列表页，补入手册。
- 手册：边界「无自动超时关单」→「30 分钟自动关单退分」，补后台搜索说明。
- 收尾：vendure push → 服务器 pull + pm2 restart；vshop push → H5 本地构建部署；web-admin deploy.mjs。

## 已排除（YAGNI）

- 订单导出、更多筛选维度、收藏页搜索、库存预警。

# vshop 拼团页「我的开团 / 我的参团」实施计划

- 日期：2026-09-29
- 设计：`docs/superpowers/specs/2026-09-29-vshop-group-buy-my-tabs-design.md`
- 状态：**已全部执行并上线**（提交 `cd454ab26` / `6ee4a3add` + vshop H5 部署）

---

## 执行结构

| 阶段 | 内容 | 依赖 |
|---|---|---|
| T1 | 后端：`MyGroupBuyOrder` 类型 + `findMyOrders` + shop Query | — |
| T2 | 后端：编译 `lib/` + 提交 + 推送 | T1 |
| T3 | 前端：`getMyGroupBuyOrders` API + 拼团页三 tab + i18n 5 包 | — |
| T4 | 部署：后端 `git pull` + `pm2 restart`（**必须先于 H5**） | T2 |
| T5 | 部署：H5 本地构建 → tar → scp → 解压 | T3, T4 |
| T6 | 生产造数（1 条开团 + 1 条参团） | T4 |
| T7 | 手机视口截图 4 张 + API 回归 | T5, T6 |
| T8 | 文档（spec/plan + 手册 v1.5）+ 提交推送 | T7 |

T1–T2 与 T3 之间无代码依赖，但 **T4 必须先于 T5**：H5 的 `myGroupBuyOrders` 查询若在后端 SDL 上线前发布，会被 GraphQL 校验拒绝。

---

## T1 · 后端服务与 SDL

**文件**：`packages/group-buy-plugin/src/group-buy.service.ts`、`group-buy-shop.resolver.ts`、`plugin.ts`

1. `group-buy.service.ts`
   - 导入补 `CustomerService`（Vendure 核心导出）、`import { In } from 'typeorm';`
   - 构造函数注入 `private customerService: CustomerService`
   - 导出 `interface MyGroupBuyOrder { id; orderId; orderCode?; groupBuyActivityId; isLeader; status; activity? }`
   - 新增 `findMyOrders(ctx, isLeader)`：两步查询（见设计 §4.2）
2. `group-buy-shop.resolver.ts`：`@Query() myGroupBuyOrders(@Ctx() ctx, @Args('isLeader') isLeader: boolean)`
3. `plugin.ts`：shop SDL 加 `type MyGroupBuyOrder` + `extend type Query { myGroupBuyOrders(isLeader: Boolean!): [MyGroupBuyOrder!]! }`

**验证**：`npx tsc --noEmit -p packages/group-buy-plugin/tsconfig.build.json` 无错。

### 实施记录（踩坑）

| # | 现象 | 处理 |
|---|---|---|
| 1 | 首版用 `.innerJoin(Order, 'ord', 'ord.id = gbo.orderId')` → 生产 `operator does not exist: integer = character varying` | 改两步查询，`In(...)` 传字符串数组 |
| 2 | `.where('ord.channelId = :c')` → 列不存在 | `Order` 无 `channelId` 列（`channels` 为 M2M），改 `innerJoin('ord.channels', 'channel', 'channel.id = :channelId')` |
| 3 | `GroupBuyOrder.channels` 过滤恒空 | 该列从未写入，放弃在拼团记录侧过滤 |
| 4 | `ctx.activeUser.id` 当 customer id 用会拿错主键 | `CustomerService.findOneByUserId(ctx, ctx.activeUserId)` 桥接 |

---

## T2 · 编译 `lib/` 并提交

```bash
npx tsc -p packages/group-buy-plugin/tsconfig.build.json    # 不 rimraf，避免整体重编译漂移
git status --short packages/group-buy-plugin                # 期望 11 个文件（3 类 × js/d.ts/map + plugin.js/map）
git add packages/group-buy-plugin && git commit && git push
```

**验证**：`lib/src/plugin.js` 内含 `myGroupBuyOrders` 字段；`lib/src/group-buy.service.js` 内含 `findMyOrders`。

> 服务器 `git pull` 时 `product-survey-plugin` 有本地未提交改动（仅 `.d.ts` 格式化与 `.ts` 尾换行差异，`.js` 一致）阻塞：先 `cp -r` 备份到 `/tmp/vendure_bak/`，再 `git checkout -- packages/product-survey-plugin`，`git pull --ff-only` 成功。

---

## T3 · 前端

**文件**：`src/api/queries/promotion.ts`、`src/pkg-promotion/pages/group-buy.vue`、`src/i18n/locales/{zh-CN,zh-TW,en,ja,ko}.json`

1. `promotion.ts` 新增 `getMyGroupBuyOrders(isLeader)`（查询串见设计 §5.2）
2. `group-buy.vue`
   - 顶部 `.gb-tabs` 三 tab（下划线激活态）
   - `activeTab: 'activities' | 'leader' | 'join'`
   - `switchTab`：清空 `productMap` → 按 tab 取数 → `loadProducts()`
   - 我的卡片（版式 A）：头行状态 + 左图右文 + 整宽主按钮
   - 未登录 `.gb-gate` 引导 + 「去登录」
   - 全部文案走 `useI18n()` 的 `t()`
3. i18n：`promotion.*` 新增 20 键，**5 个语言包同步**

**验证**：`npm run build:h5` 成功；构建产物含 `pkg-promotion-pages-group-buy.*.js`。

### 实施记录

- 首张截图发现「我的团」主按钮**非整宽** → `.gb-card__action` 补 `width: 100%;`，重建重部署后确认整宽。
- **追加修正（2026-09-29）：列表卡的「去拼团」按钮改为整宽** —— 用户复核时指出该「主按钮」仍非整宽。根因是它嵌套在右文列 `gb-card__main` 内，`width: 100%` 也只能撑满文字列。修正：列表卡片改为与「我的团」同款堆叠结构（`.gb-card--mine` 重命名为共用的 `.gb-card--stack`），主按钮提升为卡片直接子节点并复用 `gb-card__action`；`.gb-card__foot` 由「横向两端对齐」改为「纵向左对齐」，仅承载规格/倒计时标签；删除不再使用的 `gb-card__btn`。
- 文案值（zh-CN）：`tabActivities=拼团列表`、`tabMyLeader=我的开团`、`tabMyJoin=我的参团`、`lackPeople={n}人待成团`、`groupUnit={n}人团`、`formed=已成团`、`notFormed=未成团`、`statusPending=拼团中`、`viewOrder=查看订单`、`retryGroup=再拼一单`。

---

## T4 · 后端部署

```bash
ssh joho 'cd /path/to/vendure && git pull --ff-only && pm2 restart vendure vendure-worker'
```

**验证**（PowerShell 注意：给 `ssh` 的远程脚本用**外层单引号**，否则 `$` 会被 PS 插值）：

- `pm2 list` 两进程 `restarts` 非崩溃循环
- 冷启动 30–60s，期间 `/shop-api` 会 502，`Start-Sleep` 后重试
- 未登录 `myGroupBuyOrders(isLeader:true)` → `[]`

---

## T5 · H5 部署

```bash
npm run build:h5
tar -czf vshop-h5.tgz -C dist/build/h5 .
scp vshop-h5.tgz joho:/tmp/vshop-h5.tgz
# 服务器：备份 → 清空 → 解压（sudo，站点父目录不归 admin）
```

**验证**：

- 本地与线上文件数一致（实测 121/121）
- 线上 `index.html` 引用的入口哈希与本地构建一致（含「列表卡按钮整宽」修正的最终版本为 `assets/index-vgvT9n4-.js`）
- 站点目录替换即时生效，无需 nginx reload

---

## T6 · 生产造数（一次性运维，不入库）

用 QA 客户 `qa-vshop-manual@local.dev` 走完整 shop-api 流程下两单：

```
createCustomer → login（从响应头 vendure-auth-token 取 token，CurrentUser 无 token 字段）
addItemToOrder(variantId, 1)
setOrderShippingAddress → setOrderShippingMethod(1)
transitionOrderToState('ArrangingPayment') → addPaymentToOrder(cod-payment-template)
joinGroupBuy(activityId: "1", orderId, isLeader: true)   → 订单 157 QLKGJTNMDTQH19Q9
joinGroupBuy(activityId: "1", orderId, isLeader: false)  → 订单 159 22LP6JDATC6TWFPS
```

活动 1「拼团演示-温泉门票」：target 3 / currentCount 2 / active / endAt 2026-10-05。

---

## T7 · 回归与截图

```bash
# 游客态 4 张中的 group-buy-page.png / group-buy-mine-guest.png
node web-admin/scripts/_vshop_usemall_shots.mjs
# 登录态 group-buy-mine-leader.png / group-buy-mine-join.png
node web-admin/scripts/_vshop_usemall_shots.mjs --user qa-vshop-manual@local.dev --pwd 'Qa123456'
```

脚本第 6 节已扩展为三 tab 循环点击（`.gb-tab:has-text("我的开团")`），游客态只采引导图。

**API 回归**：

| 用例 | 期望 |
|---|---|
| 未登录 `myGroupBuyOrders(isLeader:true)` | `[]` |
| 登录 `isLeader:true` | 1 条，`orderCode=QLKGJTNMDTQH19Q9`，`activity.productId` 可补拉 |
| 登录 `isLeader:false` | 1 条，`orderCode=22LP6JDATC6TWFPS` |
| 非法/缺 `isLeader` | GraphQL 校验报错（`isLeader: Boolean!` 必填） |

---

## T8 · 文档与收尾

1. 新建本 spec + plan
2. 手册 `README.md` 升 **v1.5**：新增 §5.9 小节、4 张截图行、§5.4 产物核对表更新（H5 入口 `index--umdIy5c.js`、后端提交 `6ee4a3add`）、§2 拼团页入口说明改三 tab
3. 提交 vshop 前端改动（`src/**` + `web-admin/scripts/_vshop_usemall_shots.mjs` + 文档 + `dist/build/h5`）→ 推送

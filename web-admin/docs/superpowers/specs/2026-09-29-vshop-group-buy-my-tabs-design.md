# vshop 拼团页「我的开团 / 我的参团」设计稿

- 日期：2026-09-29
- 状态：已实施并上线（提交见 §7）
- 承接：`docs/superpowers/specs/2026-09-29-vshop-usemall-alignment-round2-design.md` §1.2 非目标表「拼团页『我的开团 / 我的参团』两 tab」与 §8 开放项
- 载体：`vshop/src`（uni-app C 端）+ `vendure/packages/group-buy-plugin`（后端 shop SDL）

---

## 1. 背景与范围

第一轮对齐 spec §1.2 把拼团页两个 tab 记为「参照物亦未实现」（usemall 的 `sub-marketing/pages/group.vue` 里 `navList` / `tabClick` 被 `v-if="false"` 整块隐藏，属废弃死代码），因此**不作为对齐项**。第二轮 spec 沿用了该判断，但把它的技术前提记进了 §8 开放项：

> 「若后续要做需新增按当前用户筛团的后端查询（`GroupBuyOrder` 无 `customerId`，需经 `orderId` 关联 `Order.customer`）」

本轮即该开放项的落地：拼团页从「仅拼团列表」变为 **三 tab**（拼团列表 / 我的开团 / 我的参团）。

### 1.1 交付项

| 编号 | 交付项 | 层 |
|---|---|---|
| G1 | 后端 shop SDL 新增 `myGroupBuyOrders(isLeader: Boolean!)` + `MyGroupBuyOrder` 类型 | vendure group-buy-plugin |
| G2 | 前端拼团页三 tab 改造（列表 / 我的开团 / 我的参团） | vshop C 端 |
| G3 | i18n 文案 20 键，5 个语言包同步 | vshop C 端 |
| G4 | 部署 + 手机视口截图 + 手册 | 运维/文档 |

### 1.2 非目标（本轮不做）

| 不做项 | 依据 |
|---|---|
| 拼团详情页 / 拼团进度详情 | 本轮只做「我的团列表」，点击落到订单详情 |
| 我的团的取消 / 退团 / 催团 | 后端无对应 mutation |
| 拼团记录分页 | 单客户拼团记录量小，`findMyOrders` 一次性返回（与第二轮 `getMyReviews` 全量返回的既有口径一致） |
| 数据库迁移 | 无需新列：归属经 `orderId → Order.customerId` 反查 |

---

## 2. 一手核查结论（源码直读）

| 位置 | 事实 |
|---|---|
| `group-buy-plugin/src/group-buy-order.entity.ts` | 列有 `groupBuyActivityId` / `orderId`(varchar) / `isLeader` / `status` / `channels`；**无 `customerId`** |
| `group-buy-plugin/src/group-buy-activity.entity.ts` | `productId` / `variantId` / `groupPrice` / `targetCount` / `currentCount` / `status` / `startAt` / `endAt` |
| `core/src/entity/order/order.entity.ts` | `@EntityId({ nullable: true }) customerId?: ID`；`channels: Channel[]` 为 M2M，**无 `channelId` 列** |
| `group-buy.service.ts` 的 `joinGroupBuy` | 只写 `GroupBuyOrder`（含 `channels` 字段但**从未赋值**）与 `Order.customerId`（由 Vendure 结账流程写入） |

推论：要按「当前登录客户」筛团，唯一可行路径是 `Order.customerId = 当前 customer`，再拿 `Order.id` 反查 `GroupBuyOrder.orderId`；`GroupBuyOrder.channels` 不能当渠道过滤条件。

---

## 3. 决策记录

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 团归属怎么判定 | 经 `orderId → Order.customerId` 反查；`ctx.activeUserId` → `CustomerService.findOneByUserId` 拿 customer 主键（**不能直接用 `ctx.activeUser` 的 id**，那是 User 主键） |
| 2 | 未登录表现 | 后端返回 `[]`（不报错）；前端两 tab 显示登录引导「登录后查看我的拼团」+「去登录」 |
| 3 | 版式 | **版式 A · 卡片信息流**：头行状态 + 左图右文 + 整宽主按钮（与拼团列表卡片同族，仅纵向扩展） |
| 4 | 主操作分流 | `status=failed` → 「再拼一单」跳商品详情；其余 → 「查看订单」跳 `pkg-order/pages/order-detail?code=<orderCode>`，无 `orderCode` 退化到订单列表 |
| 5 | 渠道过滤 | 在**订单**侧过滤：`innerJoin('ord.channels', 'channel', 'channel.id = :channelId')` |

---

## 4. 后端设计

### 4.1 shop SDL（`plugin.ts`）

```graphql
type MyGroupBuyOrder {
    id: ID!
    orderId: ID!
    orderCode: String
    groupBuyActivityId: ID!
    isLeader: Boolean!
    status: String!
    activity: GroupBuyActivity
}

extend type Query {
    activeGroupBuyActivities: [GroupBuyActivity!]!
    groupBuyActivity(id: ID!): GroupBuyActivity
    myGroupBuyOrders(isLeader: Boolean!): [MyGroupBuyOrder!]!
}
```

`orderCode` 与 `activity` 是**服务端补的展示字段**（不落库），让 C 端一次查询就拿齐卡片所需数据，不额外发 `getOrderByCode` 与 `groupBuyActivity` 两次请求。

### 4.2 服务层 `findMyOrders`（`group-buy.service.ts`）

两步查询，规避三个坑：

```ts
async findMyOrders(ctx: RequestContext, isLeader: boolean): Promise<MyGroupBuyOrder[]> {
    if (!ctx.activeUserId) return [];
    const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
    if (!customer) return [];

    // 1) 先查该客户的订单（渠道过滤只在此处，Order 无 channelId 列，必须走 channels 关联）
    const orders = await this.connection
        .getRepository(ctx, Order)
        .createQueryBuilder('ord')
        .innerJoin('ord.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
        .where('ord.customerId = :customerId', { customerId: Number(customer.id) })
        .select(['ord.id', 'ord.code'])
        .getMany();
    if (orders.length === 0) return [];
    const orderCodeMap = new Map(orders.map(o => [String(o.id), o.code]));

    // 2) 再按 orderId 反查拼团记录（varchar IN (...) 参数化，不做原生 join）
    const rows = await this.connection.getRepository(ctx, GroupBuyOrder).find({
        where: { orderId: In(orders.map(o => String(o.id))), isLeader },
        order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    // 3) 批量补活动
    const activityRows = await this.connection
        .getRepository(ctx, GroupBuyActivity)
        .find({ where: { id: In(Array.from(new Set(rows.map(r => Number(r.groupBuyActivityId))))) as any } });
    const activityMap = new Map(activityRows.map(a => [String(a.id), a]));

    return rows.map(r => ({
        id: String(r.id),
        orderId: String(r.orderId),
        orderCode: orderCodeMap.get(String(r.orderId)),
        groupBuyActivityId: String(r.groupBuyActivityId),
        isLeader: r.isLeader,
        status: r.status,
        activity: activityMap.get(String(r.groupBuyActivityId)),
    }));
}
```

| 坑 | 现象 | 规避方式 |
|---|---|---|
| Postgres 类型不匹配 | 首版用 `.innerJoin(Order, 'ord', 'ord.id = gbo.orderId')` 原生条件 → `operator does not exist: integer = character varying` | 改为两步查询：订单查完在 JS 侧取 `id`，作为字符串数组喂给 `In(...)` |
| `Order` 无 `channelId` 列 | `.where('ord.channelId = :c')` 报列不存在 | `innerJoin('ord.channels', ...)` 走 M2M 关联表 |
| `GroupBuyOrder.channels` 未写入 | 用它过滤恒为空 | 渠道过滤只放在订单侧 |

### 4.3 `lib/` 产物同步

生产跑 `lib/`。本项目 `lib/` 与 `src/` 存在既有漂移，**整体重编译会引入缺失模块导致启动崩溃**，因此只对本包做外科式重编译：

```bash
npx tsc -p packages/group-buy-plugin/tsconfig.build.json   # 不 rimraf
```

`cd454ab26` 的 diff 恰好 11 个预期文件（`plugin.js` / `group-buy.service.js` / `group-buy-shop.resolver.js` 及对应 `.d.ts` / `.map`），无多余漂移。

---

## 5. 前端设计

### 5.1 版式 A · 卡片信息流（我的团）

```
┌────────────────────────────────────────┐
│ 拼团中                     3 人团 · 剩 165:53:03   ← 头行：状态 + 规格/倒计时
│ ┌──────┐  国信南山温泉工作日门票                    │
│ │ 商品图│  ¥128.00                              │
│ └──────┘  ● ● ○   还差 1 人成团                    │
│ ┌────────────────────────────────────┐ │
│ │            查看订单                 │ │  ← 整宽主按钮
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

- 状态色：`success` → 品牌色「已成团」；`failed` → 灰「未成团」；其余 → 价格色「拼团中」
- 进度点复用列表卡片的 `currentCount` 圆点（最多 5 个），文案「还差 N 人成团」
- 未登录：整块替换为 `.gb-gate` 引导（文案 + 「去登录」）

**两个 tab 的卡片统一为同一套堆叠结构**（`.gb-card--stack`，纵向）：`左图右文` → `独立一行标签` → `整宽主按钮`。

| tab | 标签行内容 | 主按钮 |
|---|---|---|
| 拼团列表 | 「N 人团 · 剩 xx:xx:xx」 | 「去拼团」→ `joinGroup(item, false)` |
| 我的开团 / 我的参团 | 头行「状态 + N 人团 · 剩 xx:xx:xx」 | 「查看订单」/「再拼一单」 |

> **列表卡片为何也要改**（2026-09-29 修正）：原列表卡片是「图 + 右文列（末尾一行放标签 + 右对齐小按钮）」的横排结构，主按钮视觉与我的团卡片不一致；且按钮嵌套在右文列 `gb-card__main` 内，**即使设 `width: 100%` 也只能撑满文字列而非整卡**。修正的关键是把主按钮提升为卡片直接子节点，并让卡片纵向堆叠——即复用版式 A 的结构。原来的 `gb-card__btn` 随之删除。

### 5.2 数据流

| 触发 | 行为 |
|---|---|
| `onMounted` | 拉 `getActiveGroupBuyActivities()` → 补拉商品 → 渲染列表 tab |
| `switchTab('leader'/'join')` | 清空 `productMap` → `getMyGroupBuyOrders(isLeader)` → 按 `activity.productId` 补拉商品 |
| 返回列表 tab | 已有 `activities` 则不重拉，仅重算 `productMap` |

`getMyGroupBuyOrders`（`src/api/queries/promotion.ts`）：

```ts
/** 我的开团（isLeader=true）/ 我的参团（isLeader=false）；未登录时后端返回空数组 */
export async function getMyGroupBuyOrders(isLeader: boolean) {
    const client = getGraphQLClient();
    return client.request(
        `query($isLeader: Boolean!) { myGroupBuyOrders(isLeader: $isLeader) { id orderId orderCode groupBuyActivityId isLeader status activity { id name targetCount currentCount maxCount groupPrice status startAt endAt productId variantId } } }`,
        { isLeader },
    );
}
```

商品名与主图 shop-api 不在活动上暴露，沿用既有做法由 `getProductsByIds` 补拉（`FloorSection` / 秒杀楼层同一套路）。

### 5.3 i18n

`promotion` 命名空间新增 20 键，5 个语言包（`zh-CN` / `zh-TW` / `en` / `ja` / `ko`）同步补齐：

`tabActivities` / `tabMyLeader` / `tabMyJoin` / `emptyActivities` / `emptyMine` / `loginTips` / `goLogin` / `lackPeople` / `formed` / `notFormed` / `statusPending` / `groupUnit` / `remainPrefix` / `goGroupBuy` / `viewOrder` / `retryGroup` / `activityEnded` / `cartUnavailable` / `joinSuccess` / `joinFailed`

`lackPeople` 与 `groupUnit` 带 `{n}` 插值。

---

## 6. 验收证据（生产）

### 6.1 shop-api

| 场景 | 结果 |
|---|---|
| 未登录 `myGroupBuyOrders(isLeader:true)` | `[]`（不报错） |
| 登录后 `isLeader:true` | 1 条：订单 `QLKGJTNMDTQH19Q9`，活动 1「拼团演示-温泉门票」 |
| 登录后 `isLeader:false` | 1 条：订单 `22LP6JDATC6TWFPS`，同一活动 |

生产造数为一次性运维动作（不在库）：用 QA 客户 `qa-vshop-manual@local.dev` 走完整 shop-api 流程下两单（`setOrderShippingAddress → setOrderShippingMethod(1) → transitionOrderToState(ArrangingPayment) → addPaymentToOrder(cod-payment-template)`），分别以 `isLeader=true/false` 调 `joinGroupBuy`。活动 1：target 3 / currentCount 2 / active / endAt 2026-10-05。

### 6.2 手机视口截图（390×844 / dpr=2）

| 文件 | 覆盖点 |
|---|---|
| `group-buy-page.png` | 拼团列表 tab（三 tab 头 + 卡片） |
| `group-buy-mine-leader.png` | 我的开团（登录态，1 条「拼团中」+ 整宽「查看订单」） |
| `group-buy-mine-join.png` | 我的参团（登录态） |
| `group-buy-mine-guest.png` | 未登录态引导（「去登录」） |

采集命令：

```bash
# 游客态（含 group-buy-mine-guest.png）
node web-admin/scripts/_vshop_usemall_shots.mjs
# 登录态（含 group-buy-mine-leader.png / group-buy-mine-join.png）
node web-admin/scripts/_vshop_usemall_shots.mjs --user qa-vshop-manual@local.dev --pwd 'Qa123456'
```

---

## 7. 交付与部署

| 层 | 提交 | 部署方式 |
|---|---|---|
| vendure 后端 | `cd454ab26`（新增查询）+ `6ee4a3add`（规避 Postgres 类型报错） | 服务器 `git pull --ff-only` + `pm2 restart vendure vendure-worker` |
| vshop H5 | 见操作手册 §5.9 | 本地 `npm run build:h5` → tar → scp → 服务器解压 |

**部署顺序：后端必须先上线**，否则前端 `myGroupBuyOrders` 会被 GraphQL 校验拒绝。

> 服务器 `git pull` 时遇到 `product-survey-plugin` 三个文件的本地未提交改动（`.d.ts` 格式化差异 + `.ts` 缺尾换行，`.js` 完全一致 → 运行时无差异），已先 `cp` 备份到 `/tmp/vendure_bak/` 再 `git checkout --` 后 `git pull --ff-only`。

---

## 8. 遗留与开放项

| 项 | 说明 |
|---|---|
| 我的团无分页 | 单客户记录量小，暂不做；后续若需要，给 `myGroupBuyOrders` 加 `skip` / `take` |
| 团进度不实时 | 前端仅靠 1s 本地 tick 走倒计时；`currentCount` 需切换 tab 或重进页面才刷新 |
| 无拼团详情页 | 主按钮直接落订单详情，团进度细节在订单详情里看 |
| 拼团页无首页入口 | 首页 sections 暂无 `groupBuy` 楼层入口（`flash` 楼层的 `source=groupBuy` 枚举已预留但后台不暴露），与第一轮一致 |

# 租户切换体验 + 商户提交商品上架默认站点 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 web-admin 切租户页显示店铺名/店铺编号并暴露停用租户，修复 t1 切换，并让商户（t1 等第三方租户）能够在后台将其商品提交上架到默认站点销售（含平台审核闭环）。

**Architecture:** 两仓库联动。
- **后端（vendure, marketplace-plugin）**：在 admin API 新增 `submitForMarketplaceAdmin(productId)` mutation（复用 shop 侧已实现的 `MarketplaceService.submitForMarketplace` 置 pending 逻辑），并加「商品归属当前渠道」越权校验，使商户 admin 账号可在后台提审。
- **前端（vshop, web-admin）**：改切租户页渲染店铺名/编号/停用态；商品列表读取 `marketplaceStatus` 并呈现「提交上架到默认站点 / 待审核 / 已上架」状态与操作；封装提审 API。
- **默认站点分类**：沿用全局 Collection，无新增体系。
- **t1 切换**：先诊断真实根因（enabled 已开），再对症修复。

**Tech Stack:** Vendure (NestJS + GraphQL admin/shop API, TypeORM)、uni-app Vue3 (`web-admin`)、`tsc`（插件构建到 `dist/`）、`npm run build:h5` + `scripts/deploy.mjs`（前端本地构建部署）。

**注意（铁律）：**
- 绝不在服务器构建；本地构建 → 提交产物(dist/h5) → 服务器 git pull + pm2 restart / nginx reload。
- web-admin 属 vshop 仓库，允许 agent 本地构建部署；后端插件改动在 vendure 仓库，本地 `tsc` 编译提交 `dist/`。
- 两个仓库分开提交：`d:\zhao\vendure`、`d:\zhao\vshop`。

---

## Task 1: 切租户页显示店铺名 + 店铺编号 + 停用标注

**Files:**
- Modify: `web-admin/src/pages/channel-select/index.vue`（相对 vshop 仓库根 `d:\zhao\vshop`）

现状：`auth.channels` 已含 `id/code/token/name`；`authStore` 里 `ChannelInfo` 无 `tenantNo/isOfficial/enabled`。先扩展 `ChannelInfo` 类型，再改造模板。

- [ ] **Step 1: 扩展 `ChannelInfo` 类型**

Modify `web-admin/src/stores/authStore.ts`（`ChannelInfo` 接口）：
```typescript
export interface ChannelInfo {
  id: string;
  code: string;
  token: string;
  name?: string;
  tenantNo?: number | null;
  isOfficial?: boolean;
  enabled?: boolean;
}
```
`loadAccess` 的 map 中补字段（原 map 在 authStore.ts 约 L46）：
```typescript
.map((c) => ({
  id: c.id, code: c.code, token: c.token, name: c.name,
  tenantNo: c.tenantNo ?? null, isOfficial: c.isOfficial === true, enabled: c.enabled,
}));
```

- [ ] **Step 2: 改造 channel-select 模板与脚本**

Modify `web-admin/src/pages/channel-select/index.vue` 全量替换为：
```vue
<template>
  <view class="pick">
    <view class="title">选择要经营的店铺</view>
    <view
      class="item"
      :class="{ off: c.enabled === false }"
      v-for="c in auth.channels"
      :key="c.id"
      @tap="c.enabled === false ? void 0 : pick(c)"
    >
      <view class="row">
        <view class="lt">
          <text class="name">{{ c.name || c.code }}</text>
          <text class="off-tag" v-if="c.enabled === false">已停用</text>
        </view>
        <text class="go">›</text>
      </view>
      <view class="sub">
        <text class="code">{{ c.code }}</text>
        <text class="no" v-if="c.tenantNo != null">#{{ c.tenantNo }}</text>
        <text class="tag official" v-if="c.isOfficial">官方自营</text>
        <text class="tag third" v-else>第三方</text>
      </view>
    </view>
    <view v-if="!auth.channels.length" class="empty">暂无可用店铺</view>
  </view>
</template>

<script lang="ts" setup>
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();

async function pick(c: { id: string; code: string; token: string }) {
  tenant.selectCh(c, c.code);
  await auth.loadAccess(c.id);
  uni.redirectTo({ url: '/pages/dashboard/index' });
}
</script>

<style lang="scss" scoped>
.pick { min-height: 100vh; background: $wa-bg; padding: 60rpx 48rpx;
  .title { font-size: 40rpx; font-weight: 700; margin-bottom: 32rpx; }
  .item { background: $wa-card; border-radius: 20rpx; padding: 32rpx; margin-bottom: 20rpx; opacity: 1;
    &.off { opacity: .55; }
    .row { display: flex; justify-content: space-between; align-items: center;
      .lt { display: flex; align-items: center; gap: 16rpx;
        .name { font-size: 34rpx; font-weight: 600; }
        .off-tag { font-size: 20rpx; color: #fff; background: #e64340; border-radius: 999rpx; padding: 2rpx 14rpx; }
      }
      .go { color: $wa-muted; font-size: 40rpx; }
    }
    .sub { display: flex; align-items: center; margin-top: 10rpx; gap: 12rpx;
      .code { font-size: 22rpx; color: $wa-muted; }
      .no { font-size: 22rpx; color: $wa-muted; }
      .tag { font-size: 20rpx; padding: 0 12rpx; border-radius: 999rpx; }
      .official { background: #f0f5ff; color: #2f6bff; }
      .third { background: #f6ffed; color: #52c41a; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
```

- [ ] **Step 3: 编译校验（web-admin 本地构建）**

Run（vshop 仓库根，构建前端 h5 产物）：
```
npm run build:h5
```
Expected: 构建成功、无 TS 报错（产物在 `web-admin/dist/build/h5`）。

> 说明：uni-app 前端无单测框架，以「build:h5 编译通过 + 后续线上验证」作为验收。
> 注意：`tenants/index.vue` 已通过 myTenantAccess 的 channels 拿到 `isOfficial`，与 channel-select 一致。

- [ ] **Step 4: 提交（vshop 仓库）**

```bash
git add web-admin/src/pages/channel-select/index.vue web-admin/src/stores/authStore.ts
git commit -m "feat(web-admin): 切租户页显示店铺名/店铺编号，停用租户灰态展示"
```

---

## Task 2: 后端 admin API 新增提审 mutation（含渠道归属校验）

**Files:**
- Modify: `packages/marketplace-plugin/src/api/admin.api-extensions.ts`（vendure 仓库 `d:\zhao\vendure`）
- Modify: `packages/marketplace-plugin/src/api/admin.resolver.ts`
- Modify: `packages/marketplace-plugin/src/marketplace.service.ts`

设计：admin API 暴露 `submitForMarketplaceAdmin(productId: ID!): Boolean!`；handler 先校验商品归属当前渠道，再复用 `submitForMarketplace` 置 pending。

- [ ] **Step 1: admin schema 加 mutation**

Modify `src/api/admin.api-extensions.ts` 中 `extend type Mutation` 块（现只有 approve/reject）：
```graphql
extend type Mutation {
    approveMarketplaceProduct(productId: ID!): Boolean!
    rejectMarketplaceProduct(productId: ID!, reason: String!): Boolean!
    submitForMarketplaceAdmin(productId: ID!): Boolean!
}
```

- [ ] **Step 2: marketplace.service.ts 加归属校验方法**

在 `MarketplaceService` 类内、`getProductOrThrow`（L61）之后新增（`ForbiddenError` 与 `idsAreEqual` 从 `@vendure/core` 导入）：
```typescript
/** 校验商品归属指定渠道后可提交上架（供 admin API，防止商户提审他人商品） */
async submitForMarketplaceOwnedByChannel(
    ctx: RequestContext,
    productId: ID,
    channelId: ID,
): Promise<void> {
    const product = await this.getProductOrThrow(ctx, productId);
    await this.entityHydrator.hydrate(ctx, product, { relations: ['channels'] } as any);
    const owned = (product.channels || []).some(c => idsAreEqual(c.id, channelId));
    if (!owned && channelId != null) {
        throw new ForbiddenError('只能对当前店铺的商品提交上架');
    }
    await this.submitForMarketplace(ctx, productId);
}
```
并在文件顶部 import 补充（现有 import 块 L1-L11）：
```typescript
import { ForbiddenError } from '@vendure/core';
```
（`idsAreEqual` 已在 import 中，见 marketplace.service.ts L6。）

- [ ] **Step 3: admin.resolver.ts 加 handler**

Modify `src/api/admin.resolver.ts`：
- 注入迁移：现有 handler 用 `this.connection`，无需改。
- 在 `rejectMarketplaceProduct` 之后、`marketplacePendingProducts` 之前新增：
```typescript
@Mutation('submitForMarketplaceAdmin')
@Transaction()
@Allow(Permission.UpdateProduct, Permission.SuperAdmin)
async submitForMarketplaceAdmin(
    @Ctx() ctx: RequestContext,
    @Args() args: { productId: string },
): Promise<boolean> {
    await this.marketplaceService.submitForMarketplaceOwnedByChannel(ctx, args.productId, ctx.channelId as any);
    return true;
}
```
`ctx.channelId` 类型为 `ID`（内含 id），函数签名传 `ID`，无需 cast；若 TS 报类型，改为 `ctx.channelId`。`Permission` 已在 import。

- [ ] **Step 4: 本地编译 marketplace-plugin**

Run（vendure 仓库根）：
```
node_modules\.bin\tsc.cmd -p packages/marketplace-plugin/tsconfig.json
```
Expected: 编译通过；`dist/api/admin.resolver.js`、`dist/api/admin.api-extensions.js`、`dist/marketplace.service.js` 更新。

- [ ] **Step 5: 校验 dist 已包含改动**

Run：
```
Select-String packages\marketplace-plugin\dist\api\admin.api-extensions.js -Pattern "submitForMarketplaceAdmin"
Select-String packages\marketplace-plugin\dist\marketplace.service.js -Pattern "submitForMarketplaceOwnedByChannel"
```
Expected: 两处均有命中。

- [ ] **Step 6: 提交（vendure 仓库）+ 部署**

```bash
git add packages/marketplace-plugin/src packages/marketplace-plugin/dist
git commit -m "feat(marketplace-plugin): admin API 提审 mutation submitForMarketplaceAdmin，含渠道归属校验"
git push
```
服务器部署（本地 terminal 可执行的 SSH 操作，部署铁律：服务器仅 pull + restart）：
```
ssh <host> "cd <vendure-deploy-dir> && git pull && pm2 restart vendure"
```
> 若部署需交互凭据，征询用户后由用户执行；本步骤以「commit + push」为代码交付边界。

---

## Task 3: 前端提审 API + 商品列表提审入口

**Files:**
- Modify: `web-admin/src/apis/marketplace.ts`
- Modify: `web-admin/src/apis/product.ts`（`fetchProductList` 增加 `marketplaceStatus` 字段）
- Modify: `web-admin/src/pages/product/list/index.vue`

- [ ] **Step 1: 封装提审 API**

Modify `web-admin/src/apis/marketplace.ts`（文件末尾追加）：
```typescript
/** 商户对自身商品提交上架到默认站点（置审核中） */
export async function submitProductToMarketplace(id: string): Promise<void> {
  await getAdminClient().request(
    `mutation SubmitProductToMarketplace($productId: ID!) {
      submitForMarketplaceAdmin(productId: $productId)
    }`,
    { productId: id },
  );
}
```

- [ ] **Step 2: fetchProductList 增加 marketplaceStatus**

Modify `web-admin/src/apis/product.ts`：
- `ProductListRow` 接口新增字段（`marketplaceStatus?: string | null;`）。
- 查询（L402-405）的 `items {...}` 增加 `customFields { marketplaceStatus }`：
```graphql
items { id name slug enabled featuredAsset { preview } variants { price stockOnHand } customFields { marketplaceStatus } }
```
- map 里补 `marketplaceStatus: p.customFields?.marketplaceStatus ?? null`。

- [ ] **Step 3: 商品列表呈现状态与「提交上架」操作**

Modify `web-admin/src/pages/product/list/index.vue`：
- `import { submitProductToMarketplace } from '../../../apis/marketplace';`
- 新增状态文案方法：
```typescript
function mktStatus(p: { marketplaceStatus?: string | null }): string | null {
  if (p.marketplaceStatus === 'approved') return '已上架';
  if (p.marketplaceStatus === 'pending') return '审核中';
  if (p.marketplaceStatus === 'rejected') return '已驳回';
  return null; // 未提审
}
```
- 新增提审方法：
```typescript
function onSubmitMarketplace(p: ProductListRow) {
  uni.showModal({
    title: '提交上架',
    content: `确定将「${p.name}」提交到默认站点销售？（需平台审核）`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await submitProductToMarketplace(p.id);
        uni.showToast({ title: '已提交，待审核', icon: 'success' });
        load(0);
      } catch (e: any) {
        uni.showToast({ title: (e as any)?.message || '提交失败', icon: 'none' });
      }
    },
  });
}
```
- 模板 `st` 行下方追加操作行（每卡片内，`v-if` 控制）：
```vue
<view class="mkt-ops">
  <text v-if="mktStatus(p) === '审核中'" class="mkt-txt pending">已提交，待审核</text>
  <text v-else-if="mktStatus(p) === '已上架'" class="mkt-txt ok">已在默认站点上架</text>
  <text v-else-if="mktStatus(p) === '已驳回'" class="mkt-txt rej">已驳回</text>
  <text v-else class="mkt-btn" @tap.stop="onSubmitMarketplace(p)">提交上架到默认站点</text>
</view>
```
> 注意：卡片本身 @tap=edit，提审按钮必须 `@tap.stop` 阻止跳编辑页。
- SCSS 增加 `.mkt-ops/.mkt-btn/.mkt-txt` 样式（副文字 22rpx、accent 按钮字）。
- `import type { ProductListRow } from '../../../apis/product';` 已在用（L54 有 ProductListRow 引入），确认类型写法一致。

- [ ] **Step 4: 编译校验**

Run（vshop 仓库根）：
```
npm run build:h5
```
Expected: 构建成功、无 TS 报错。

- [ ] **Step 5: 提交（vshop 仓库）**

```bash
git add web-admin/src/apis/marketplace.ts web-admin/src/apis/product.ts web-admin/src/pages/product/list/index.vue
git commit -m "feat(web-admin): 商品列表新增'提交上架到默认站点'提审入口"
```

---

## Task 4: t1 无法切换的根因排查与修复

**Files:** 视根因而定（诊断脚本只读，不改动）。

背景：t1 `enabled` 开关已开启，故 `authStore` 的 `enabled && memberEnabled` 过滤不构成阻断。需在线实证。

- [ ] **Step 1: 写只读诊断脚本（探针）**

Create `web-admin/scripts/probe-tenant-access.mjs`（参考仓库既有 `probe-live-schema.mjs` 风格），以 superadmin 登录 admin-api（若超管口令有变，用环境变量 `WA_LOGIN`/`WA_PASS` 覆盖），查询：
```graphql
query { myTenantAccess { isSuperAdmin channels { id code name token enabled tenantNo isOfficial memberEnabled } } }
```
输出每个 channel 的上述字段（特别是 t1 的 `enabled/memberEnabled/name/token` 是否非空）。

- [ ] **Step 2: 运行探针并记录结果**

Run：
```
node web-admin/scripts/probe-tenant-access.mjs
```
Expected 一份 JSON；重点看 t1：`enabled` 是否为 true、`memberEnabled` 是否 true、`token` 是否非空。

- [ ] **Step 3: 依据结果定位根因并修复（三个可能分支）**

| 现象 | 根因 | 修复 |
|---|---|---|
| t1 不在 channels | 超管 channelPermissions 未含 t1 / t1 未启用 | 平台侧启用 t1 或补超管绑定 |
| t1 在 channels 但 `enabled:false` | channel customFields.enabled=false | 平台租户管理页启用 t1 |
| t1 在 channels 且字段正常，但前端 pick 后进不去/dashboard 白屏 | `tenant.selectCh` 或 `auth.loadAccess(t1.id)` 抛错；或 dashboard 依赖的数据在 t1 上下文缺失 | 在浏览器复现 pick 路径，读 dashboard/loadAccess 报错，改对应前端逻辑 |

按命中分支改相应代码（若为纯数据问题，仅线上修复并复用 Task 1 的「已停用」标注即可）。若为前端分支，补改后重新 `npm run build:h5`。

- [ ] **Step 4: 清理诊断脚本并提交**

诊断脚本为临时探针，修复确认后删除，避免污染 git 工作区（与既有约定一致）。若产生修复，提交（vshop 或 vendure 仓库视改动归属）。

---

## Task 5: 前端整体构建 + 部署（vshop）

- [ ] **Step 1: 重新构建 h5 产物**

Run（vshop 仓库根）：
```
npm run build:h5
```
确认 `web-admin/dist/build/h5/index.html` 存在。

- [ ] **Step 2: 产物校验 + 部署**

Run：
```
node web-admin/scripts/deploy.mjs
```
Expected: 产物校验通过（index.html + assets 非空 + ≥MIN_SIZE），scp 上传，服务器解压到站点目录，nginx reload。

- [ ] **Step 3: 提交 dist 产物（vshop 仓库）**

```bash
git add web-admin/dist/build/h5
git commit -m "chore(web-admin): 部署 h5 产物（租户切换/提审入口）"
git push
```

---

## Task 6: 线上验证（agent-browser）

复用 memory 中的 `agent-browser` 工作流（session 复用登录、snapshot/fill/click、screenshot 留证、用后清理 _png/_shots）。

- [ ] **Step 1: 超管登录 + 验证租户切换页**

打开 web-admin，进入店铺选择页，截图：确认显示店铺名（大字）+ 店铺编号（小字 `t1`/`#编号`）+ 官方自营/第三方徽标；已停用租户为灰态。

- [ ] **Step 2: 切换到 t1**

点击 t1 → 进入其 dashboard；确认进入成功（不再报错/白屏）。若失败，对照 Task 4 结论处理。

- [ ] **Step 3: 在 t1 创建商品**

t1 上下文进 `product/create` 新建一个测试商品，确认成功。

- [ ] **Step 4: 提审**

商品列表对测试商品点「提交上架到默认站点」→ 确认状态变为「审核中」；后端 `Select-String`/GraphQL introspection 确认 `marketplaceStatus=pending`。

- [ ] **Step 5: 平台审核闭环**

超管在 `platform/product-approval` 对待审商品点「通过」→ 回到商品列表确认「已在默认站点上架」。

- [ ] **Step 6: 清理**

删除本次截图/_shots、诊断脚本，恢复 git 工作区干净。

---

## Self-Review

- **Spec 覆盖**：Task1↔1️⃣切租户页；Task4↔2️⃣t1排查；Task6-Step3↔3️⃣在t1发商品；Task2/Task3↔4️⃣提审入口；Task6-Step5↔5️⃣默认站点分类(沿用全局Collection，商品审核通过即在默认站点)。覆盖完整。
- **占位符**：无 TBD；后端归属校验、前端提审 API/按钮均给出完整代码。t1 根因属运行时数据/行为依赖，Task4 明确给出三分支定位表，不属占位。
- **类型一致**：前端统一用法 `marketplaceStatus: string | null`；mutation 名后端 `submitForMarketplaceAdmin` 与前端 `submitForMarketplaceAdmin` 一致；API 方法名 `submitProductToMarketplace` 前后统一。
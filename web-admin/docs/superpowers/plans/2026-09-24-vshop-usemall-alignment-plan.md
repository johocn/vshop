# vshop 小程序端对齐 usemall 版式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 vshop（uni-app，含 H5 与微信小程序）的商品与交易主链页面版式对齐 usemall，并补齐 A 档能力与秒杀/拼团。

**Architecture:** 前端为主（`vshop/src` 主包 + `pkg-product`/`pkg-order`/`pkg-promotion` 分包，**分包结构一律不动**）；秒杀楼层走既有「装修 sections 体系」扩展一个新的 `flash` 类型；购物车「勾选真生效」用「移出未勾选行 → 本地暂存 → 回填」模拟 Vendure `activeOrder` 的全量结算；唯一后端改动是 `group-buy-plugin` 的 shop-api SDL 暴露两个已存在的字段。

**Tech Stack:** uni-app 3（Vue 3 + TypeScript + SCSS）+ Pinia + graphql-request（原生 GraphQL 字符串，**本仓库无 codegen**）+ Vendure 3.6.4（后端消费编译产物 `lib/`）。

设计依据：[2026-09-24-vshop-usemall-alignment-design.md](file:///d:/zhao/vshop/web-admin/docs/superpowers/specs/2026-09-24-vshop-usemall-alignment-design.md)

---

## 0. 前置事实与验证口径（每个 Task 都适用）

**必须知道的现状（已一手核实，不要再猜）**

1. **C 端没有单元测试框架**：`vshop/package.json` 只有 `dev:*` / `build:*` 脚本，无 vitest/jest。因此本计划不写单测，改用仓库既有验证三件套（见下）。
2. **i18n 运行时只装了 zh-CN**：`src/main.ts` 里 `createI18n({ messages: { 'zh-CN': zhCN } })`，且**未开 `globalInjection`**。所以：
   - 新组件用 `useI18n()` 组合式 API 取词（不要用模板里的 `$t`，它没有全局注入）；
   - 新增词条仍要同步 5 个语言包文件（`zh-CN`/`zh-TW`/`en`/`ja`/`ko`），这是留给后续接线用的；
   - 关键词条必须在 `zh-CN.json` 里存在，否则运行时显示 key。
3. **vshop 没有 graphql codegen**（无 `codegen.ts`、无 `graphql.schema.json`），前端全部是手写 query 字符串 → 后端加字段**不需要**改前端 schema 快照。
4. **后端改 `src` 必须 build**：`vendure/packages/group-buy-plugin` 被后端消费的是 `lib/`。必须 `npm run build`，且提交 `src` + `lib` 两份。
5. **分包结构不动**；新增公共组件一律放主包 `vshop/src/components/`。
6. **已知锚点**：结算页优惠券入口块在 `checkout.vue` 模板第 249-258 行（`class="section coupon-entry"`），本计划在它后面插入新行。

**验证三件套（每个 Task 收尾按需取用）**

| 手段 | 命令 / 方式 | 说明 |
|---|---|---|
| 编译门禁 | `npm run build:h5`（在 `d:\zhao\vshop`） | 必须 0 error；warn 可接受 |
| 只读探针 | `python web-admin/scripts/_smoke_usemall_align.py`（在 `d:\zhao\vshop`） | Task 18 创建；打生产 shop-api |
| 手机截图 | 390×844 视口、dpr=2（Playwright 移动视口） | 截图存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/` |

**提交规范**：每个 Task 结束提交一次，中文 commit message，只 `git add` 本 Task 涉及的文件（不要 `git add -A`）。

**禁止**：不在服务器构建（服务器内存不足）；不改分包结构；不动分箱/支付合并/COD 核销/台账等既有业务逻辑。

---

## Task 1: 后端 group-buy shop-api 暴露 `productId` / `variantId`

**为什么先做**：Task 16（拼团页）与后续拼团楼层都依赖这两个字段；且按部署序「先后端 → 再前端」，避免前端先上线取不到数据。

**Files:**
- Modify: `d:\zhao\vendure\packages\group-buy-plugin\src\plugin.ts`（`shopApiExtensions` 的 `type GroupBuyActivity`，第 107-124 行）
- 产物（改完必须重建）：`d:\zhao\vendure\packages\group-buy-plugin\lib\plugin.js`

- [ ] **Step 1: 在 shop SDL 的 `GroupBuyActivity` 补两个字段**

打开 `d:\zhao\vendure\packages\group-buy-plugin\src\plugin.ts`，定位 **`shopApiExtensions`** 里的 `type GroupBuyActivity implements Node`（**不是** `adminApiExtensions` 里那一个），在 `updatedAt: DateTime!` 之后插入两行：

```graphql
            type GroupBuyActivity implements Node {
                id: ID!
                name: String!
                description: String!
                targetCount: Int!
                currentCount: Int!
                maxCount: Int!
                status: GroupBuyStatus!
                startAt: DateTime!
                endAt: DateTime!
                groupPrice: Int!
                leaderDiscount: Int!
                leaderRewardType: String!
                autoConfirm: Boolean!
                allowJoinAfterComplete: Boolean!
                createdAt: DateTime!
                updatedAt: DateTime!
                productId: ID!
                variantId: ID!
            }
```

实体 `GroupBuyActivity` 早已有 `productId`/`variantId` 两列（`group-buy-activity.entity.ts`），所以这是**纯 SDL 暴露**，无数据库迁移。

- [ ] **Step 2: 重新构建后端插件**

```powershell
npm run build
```

运行位置：`d:\zhao\vendure\packages\group-buy-plugin`

Expected：`rimraf lib && tsc -p tsconfig.build.json` 成功结束，无 error，`lib\plugin.js` 被重新生成。

- [ ] **Step 3: 验证编译产物里确实带上了新字段**

用 Grep 搜 `d:\zhao\vendure\packages\group-buy-plugin\lib\plugin.js`，pattern：`productId: ID!`

Expected：命中 1 处（shop SDL 那段；admin SDL 里没有 `productId: ID!` 这种字段行，只有 input 里的 `productId: ID!` 会在 create input 中出现 → 若命中 2 处属正常，确认其中至少一处在 `type GroupBuyActivity` 内）。

- [ ] **Step 4: 提交（src + lib 一起）**

```powershell
git -C d:\zhao\vendure add packages/group-buy-plugin/src/plugin.ts packages/group-buy-plugin/lib/plugin.js
git -C d:\zhao\vendure commit -m "feat(group-buy): shop-api 暴露 GroupBuyActivity 的 productId/variantId"
```

- [ ] **Step 5: 部署后端（本地构建产物已在 lib，服务器只 pull + restart）**

```powershell
# 服务器侧（示例，按既有 vendure 部署流程执行）
git pull
pm2 restart <vendure 进程名>
```

Expected：`/shop-api` 可查询到 `activeGroupBuyActivities { productId variantId }` 不再报 `Cannot query field`（Task 18 的探针会断言这条）。

---

## Task 2（V1）: 装修 sections 体系扩展 `flash` 类型（C 端 + 后台同步）

**Files:**
- Modify: `d:\zhao\vshop\src\templates\shared\schema.ts`
- Modify: `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`（独立工程的本地副本，必须手动同步同样内容）

- [ ] **Step 1: 在 C 端 `schema.ts` 增加 `FlashSection` 类型定义**

在 `GoodsSection` 定义之后、`RichTextSection` 之前插入：

```ts
export type FlashSource = 'flashSale';
export type FlashLayout = 'row' | 'grid2';

export interface FlashSection {
    type: 'flash';
    /** 后台可配标题；字符串或 locale 字典（LocalizedText） */
    title?: string | Record<string, string>;
    source: FlashSource;
    layout?: FlashLayout;
    /** 楼层最多取几条活动，默认 4，范围 1..20 */
    limit?: number;
}
```

- [ ] **Step 2: 把 `flash` 纳入联合类型与白名单**

```ts
export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection | FlashSection;
```

```ts
const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText', 'flash'];
```

- [ ] **Step 3: 在 `isValidShopContent` 里加 `flash` 分支**

在 `if (sec.type === 'richText' && typeof sec.html !== 'string') return false;` 之后加：

```ts
        if (sec.type === 'flash') {
            if (sec.source !== 'flashSale') return false;
            if (sec.layout != null && sec.layout !== 'row' && sec.layout !== 'grid2') return false;
            if (sec.limit != null && typeof sec.limit !== 'number') return false;
            if (sec.title != null && typeof sec.title !== 'string' && typeof sec.title !== 'object') return false;
        }
```

- [ ] **Step 4: 把完全相同的三处改动同步到 web-admin 副本**

打开 `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`（该文件是 C 端的压缩版本，注释已说明「web-admin 独立工程，无法 import 主 shop 的 schema.ts」），把 Step 1~3 的代码**逐字**加进去，保持两个文件语义一致。

- [ ] **Step 5: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功，无 TS error。

- [ ] **Step 6: 提交**

```powershell
git -C d:\zhao\vshop add src/templates/shared/schema.ts web-admin/src/templates/shared/schema.ts
git -C d:\zhao\vshop commit -m "feat(decorate): sections 体系新增 flash 类型（C 端与 web-admin 同步）"
```

---

## Task 3（V1）: 后台装修页 flash 编辑块 + 装修页词条

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\locale\zh-Hans.json`
- Modify: `d:\zhao\vshop\web-admin\src\locale\en.json`

- [ ] **Step 1: 扩展编辑态视图模型 `SectionVM`**

在 `interface SectionVM` 里加两个可选字段（`source` 与 `limit` 已有 `layout?: string` 可复用）：

```ts
  source?: string;
  limit?: number;
```

- [ ] **Step 2: 加模板编辑块**

在 goods 块（`<!-- goods：商品推荐 -->` 的 `<template>`）与 richText 块之间插入：

```html
      <!-- flash：限时精选（秒杀） -->
      <template v-else-if="sec.type === 'flash'">
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.title') }}</text>
          <input v-model="sec.title" :placeholder="$t('decorateHome.flashTitlePlaceholder')" />
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.flashSource') }}</text>
          <view class="btns">
            <text class="btn active">{{ $t('decorateHome.flashSourceFlashSale') }}</text>
          </view>
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.flashLayout') }}</text>
          <view class="btns">
            <text class="btn" :class="{ active: !sec.layout || sec.layout === 'row' }" @tap="sec.layout = 'row'">{{ $t('decorateHome.flashLayoutRow') }}</text>
            <text class="btn" :class="{ active: sec.layout === 'grid2' }" @tap="sec.layout = 'grid2'">{{ $t('decorateHome.flashLayoutGrid2') }}</text>
          </view>
        </view>
        <view class="field">
          <text class="lbl">{{ $t('decorateHome.flashLimit') }}</text>
          <input v-model.number="sec.limit" type="number" :placeholder="$t('decorateHome.flashLimitPlaceholder')" />
        </view>
        <view class="muted hint">{{ $t('decorateHome.flashHint') }}</view>
      </template>
```

- [ ] **Step 3: 加新增按钮与 `typeLabel` 分支**

`addbar` 里 `addGoods` 按钮之后加：

```html
      <button class="mini" @tap="addFlash">{{ $t('decorateHome.addFlash') }}</button>
```

`typeLabel()` 的 switch 里 `case 'goods'` 之后加：

```ts
    case 'flash': return locale.t('decorateHome.typeFlash');
```

`addGoods()` 函数之后加：

```ts
function addFlash() { sections.value.push({ type: 'flash', source: 'flashSale', layout: 'row', limit: 4 }); }
```

- [ ] **Step 4: 补后台词条（zh-Hans 与 en 两份都要）**

`web-admin/src/locale/zh-Hans.json` 的 `decorateHome` 对象内加：

```json
    "typeFlash": "限时精选（秒杀）",
    "addFlash": "+ 限时精选（秒杀）",
    "flashSource": "数据来源",
    "flashSourceFlashSale": "秒杀活动",
    "flashLayout": "楼层版式",
    "flashLayoutRow": "横滑单行",
    "flashLayoutGrid2": "双列网格",
    "flashLimit": "最多展示条数",
    "flashLimitPlaceholder": "默认 4，范围 1-20",
    "flashTitlePlaceholder": "默认：限时精选",
    "flashHint": "商品数据实时拉取，此处只保存取数配置；无进行中活动时该楼层自动隐藏。"
```

`web-admin/src/locale/en.json` 的 `decorateHome` 对象内加对应英文：

```json
    "typeFlash": "Flash picks (flash sale)",
    "addFlash": "+ Flash picks (flash sale)",
    "flashSource": "Data source",
    "flashSourceFlashSale": "Flash sale activities",
    "flashLayout": "Layout",
    "flashLayoutRow": "Horizontal row",
    "flashLayoutGrid2": "Two-column grid",
    "flashLimit": "Max items",
    "flashLimitPlaceholder": "Default 4, range 1-20",
    "flashTitlePlaceholder": "Default: Flash picks",
    "flashHint": "Products are fetched live; only the data config is saved. The section hides itself when no activity is running."
```

- [ ] **Step 5: 后台本地构建与自测**

```powershell
npm run build
```

运行位置：`d:\zhao\vshop\web-admin`

Expected：构建成功。随后在装修页点「+ 限时精选（秒杀）」→ 选横滑/双列 → 保存 → 重新进入页面，块仍在（说明 `isValidShopContent` 放行了 `flash`）。

- [ ] **Step 6: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/src/pages/decorate/home/index.vue web-admin/src/locale/zh-Hans.json web-admin/src/locale/en.json
git -C d:\zhao\vshop commit -m "feat(web-admin): 装修页新增限时精选 flash 楼层编辑块与词条"
```

---

## Task 4（V1）: 主包 `BackTop` 返回顶部组件 + 首页接入

**Files:**
- Create: `d:\zhao\vshop\src\components\BackTop.vue`
- Modify: `d:\zhao\vshop\src\pages\home\index.vue`

- [ ] **Step 1: 新建 `src/components/BackTop.vue`**

```vue
<template>
  <view v-if="visible" class="back-top" :style="{ bottom }" @tap="toTop">
    <text class="back-top__icon">↑</text>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(defineProps<{ threshold?: number; bottom?: string }>(), {
    threshold: 300,
    bottom: '120rpx',
});

const visible = ref(false);

function onScroll() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    // H5 / 小程序统一：优先用页面滚动事件回调写入的 scrollTop
    const top = Number(page?.__scrollTop ?? 0);
    visible.value = top > props.threshold;
}

function handlePageScroll(e: any) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    if (page) page.__scrollTop = e?.detail?.scrollTop ?? 0;
    onScroll();
}

function toTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 300 });
}

onMounted(() => {
    uni.$on('page-scroll', handlePageScroll);
    onScroll();
});

onUnmounted(() => {
    uni.$off('page-scroll', handlePageScroll);
});
</script>

<style lang="scss" scoped>
.back-top {
    position: fixed; right: 24rpx; z-index: 90;
    width: 80rpx; height: 80rpx; border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    &__icon { color: #fff; font-size: 36rpx; line-height: 1; }
}
</style>
```

- [ ] **Step 2: 让页面把滚动位置广播给组件**

在 `d:\zhao\vshop\src\pages\home\index.vue` 的模板根节点加滚动监听，并在脚本里广播：

```vue
<template>
  <view class="home-page" @scroll="broadcastScroll">
    <TenantBar />
    <DynamicHome v-if="hasShopContent" />
    <component v-else :is="currentHome" />
    <BackTop />
  </view>
</template>
```

脚本部分：

```ts
import { onPageScroll } from '@dcloudio/uni-app';
import BackTop from '../../components/BackTop.vue';

function broadcastScroll(e: any) {
    uni.$emit('page-scroll', e);
}
onPageScroll((e: any) => broadcastScroll(e));
```

- [ ] **Step 3: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；H5 下滚动首页超过 300px 后右下角出现 `↑` 按钮，点击回到顶部。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add src/components/BackTop.vue src/pages/home/index.vue
git -C d:\zhao\vshop commit -m "feat(components): 新增主包 BackTop 返回顶部组件并接入首页"
```

---

## Task 5（V2）: 秒杀数据归一化纯函数 + 商品批量补拉查询

**Files:**
- Create: `d:\zhao\vshop\src\utils\flash-normalize.ts`
- Modify: `d:\zhao\vshop\src\api\queries\product.ts`

- [ ] **Step 1: 新建 `src/utils/flash-normalize.ts`**

```ts
/** 秒杀活动归一化：只保留可展示的项，过滤已结束 / 无库存 / 缺 productId 的脏数据 */

export interface FlashActivityRaw {
    id: string;
    name?: string;
    startAt?: string;
    endAt?: string;
    flashPrice?: number;
    totalStock?: number;
    soldCount?: number;
    productId?: string;
    variantId?: string;
    status?: string;
}

export interface FlashItem {
    activityId: string;
    productId: string;
    variantId: string;
    name: string;
    flashPrice: number;
    soldCount: number;
    totalStock: number;
    endAt: string;
}

/**
 * @param raw     shop-api `activeFlashSaleActivities` 原始返回
 * @param nowMs   当前时间戳（注入便于测试/复用）
 */
export function normalizeFlashActivities(raw: FlashActivityRaw[] | null | undefined, nowMs: number): FlashItem[] {
    if (!Array.isArray(raw)) return [];
    const out: FlashItem[] = [];
    for (const a of raw) {
        if (!a || !a.id || !a.productId || !a.variantId) continue;
        if (a.status && a.status !== 'active') continue;
        const end = a.endAt ? Date.parse(a.endAt) : NaN;
        if (!Number.isFinite(end) || end <= nowMs) continue;
        const total = Number(a.totalStock ?? 0);
        const sold = Number(a.soldCount ?? 0);
        if (total > 0 && sold >= total) continue;
        out.push({
            activityId: String(a.id),
            productId: String(a.productId),
            variantId: String(a.variantId),
            name: a.name || '',
            flashPrice: Number(a.flashPrice ?? 0),
            soldCount: sold,
            totalStock: total,
            endAt: a.endAt as string,
        });
    }
    return out;
}

/** 楼层/整页只挂一个计时器：取所有项里最先结束的 endAt（毫秒）；无项返回 null */
export function earliestEndAt(items: FlashItem[]): number | null {
    let min: number | null = null;
    for (const it of items) {
        const t = Date.parse(it.endAt);
        if (!Number.isFinite(t)) continue;
        if (min === null || t < min) min = t;
    }
    return min;
}

/** 剩余毫秒 → `hh:mm:ss`；不足 0 返回 `00:00:00` */
export function formatCountdown(remainMs: number): string {
    const ms = Math.max(0, remainMs);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** 已售百分比（0..100 整数）；totalStock<=0 时返回 0 */
export function soldPercent(item: FlashItem): number {
    if (!item.totalStock || item.totalStock <= 0) return 0;
    const p = Math.round((item.soldCount / item.totalStock) * 100);
    return Math.min(100, Math.max(0, p));
}
```

- [ ] **Step 2: 在 `product.ts` 增加按 id 批量补拉**

在文件末尾（`getCollections` 之后）加：

```ts
/**
 * 秒杀/拼团只拿到 productId，需补拉商品名与图（shop-api 的活动类型不暴露商品详情）
 * @returns Product[]，查不到的 id 不会出现在结果里（调用方按 id 映射，缺失即跳过该条）
 */
export async function getProductsByIds(ids: string[]) {
    const list = (ids || []).filter(Boolean);
    if (list.length === 0) return [];
    const client = getGraphQLClient();
    const query = `
        query GetProductsByIds($ids: [ID!]!) {
            products(options: { filter: { id: { in: $ids } }, take: 50 }) {
                items {
                    id name slug
                    featuredAsset { preview }
                    variants { id priceWithTax }
                }
            }
        }
    `;
    const res: any = await client.request(query, { ids: list });
    return res.products?.items || [];
}
```

- [ ] **Step 3: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功。手动在浏览器控制台调用一次 `getProductsByIds` 不必须，编译通过即可。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add src/utils/flash-normalize.ts src/api/queries/product.ts
git -C d:\zhao\vshop commit -m "feat(flash): 秒杀活动归一化纯函数与按 id 批量补拉商品查询"
```

---

## Task 6（V2）: `FlashSection.vue` 限时精选楼层

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections\FlashSection.vue`

**依赖**：Task 5 的 `flash-normalize.ts` 与 `getProductsByIds`。

- [ ] **Step 1: 新建 `src/templates/shared/sections/FlashSection.vue`**

```vue
<template>
  <view class="flash-sec" v-if="items.length">
    <view class="flash-sec__head">
      <view class="flash-sec__left">
        <text class="flash-sec__title">{{ titleText }}</text>
        <view class="flash-sec__clock" v-if="countdown">
          <text class="flash-sec__clock-lbl">{{ t('flash.endsIn') }}</text>
          <text class="flash-sec__clock-val">{{ countdown }}</text>
        </view>
      </view>
      <text class="flash-sec__more" @tap="goMore">{{ t('flash.more') }} ›</text>
    </view>

    <scroll-view v-if="layout === 'row'" scroll-x class="flash-sec__row" :show-scrollbar="false">
      <view class="flash-card flash-card--row" v-for="it in items" :key="it.activityId" @tap="goDetail(it)">
        <view class="flash-card__media">
          <VImage :src="assetOf(it.productId)" width="100%" height="220rpx" />
          <text class="flash-card__badge">{{ t('flash.badge') }}</text>
        </view>
        <text class="flash-card__name">{{ nameOf(it) }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="it.flashPrice" />
          <text class="flash-card__origin" v-if="originOf(it)">¥{{ fmt(originOf(it)) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(it)" stroke-width="6" :activeColor="progressColor" />
          <text class="flash-card__pct">{{ soldPercent(it) }}%</text>
        </view>
      </view>
    </scroll-view>

    <view v-else class="flash-sec__grid">
      <view class="flash-card" v-for="it in items" :key="it.activityId" @tap="goDetail(it)">
        <view class="flash-card__media">
          <VImage :src="assetOf(it.productId)" width="100%" height="300rpx" />
          <text class="flash-card__badge">{{ t('flash.badge') }}</text>
        </view>
        <text class="flash-card__name">{{ nameOf(it) }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="it.flashPrice" />
          <text class="flash-card__origin" v-if="originOf(it)">¥{{ fmt(originOf(it)) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(it)" stroke-width="6" :activeColor="progressColor" />
          <text class="flash-card__pct">{{ soldPercent(it) }}%</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FlashSection } from '../schema';
import { getActiveFlashSaleActivities } from '../../../api/queries/promotion';
import { getProductsByIds } from '../../../api/queries/product';
import { earliestEndAt, formatCountdown, normalizeFlashActivities, soldPercent, type FlashItem } from '../../../utils/flash-normalize';
import { useTenantStore } from '../../../stores/tenant';
import { getTemplateConfig } from '../../registry';
import VImage from '../../../components/VImage.vue';
import PriceTag from '../../../components/PriceTag.vue';

const props = defineProps<{ section: FlashSection }>();
const { t } = useI18n();
const tenantStore = useTenantStore();

const items = ref<FlashItem[]>([]);
const productMap = ref<Record<string, any>>({});
const countdown = ref('');
const progressColor = '#e0433f';

let timer: ReturnType<typeof setInterval> | null = null;

const layout = computed(() => (props.section.layout === 'grid2' ? 'grid2' : 'row'));

const titleText = computed(() => {
    const raw: any = props.section.title;
    if (!raw) return t('flash.title');
    if (typeof raw === 'string') return raw;
    const locale = 'zh-CN';
    return raw[locale] || raw['zh-CN'] || Object.values(raw)[0] || t('flash.title');
});

function assetOf(productId: string): string {
    return productMap.value[productId]?.featuredAsset?.preview || '';
}

function nameOf(it: FlashItem): string {
    const p = productMap.value[it.productId];
    return p?.name || it.name || t('flash.fallbackName');
}

/** 划线原价：优先取该活动的 variant 价格，取不到则不显示（降级） */
function originOf(it: FlashItem): number | null {
    const p = productMap.value[it.productId];
    const v = (p?.variants || []).find((x: any) => String(x.id) === String(it.variantId));
    const price = v?.priceWithTax;
    if (!Number.isFinite(price) || price <= it.flashPrice) return null;
    return price;
}

function fmt(cents: number): string {
    return (cents / 100).toFixed(2);
}

function tick() {
    const end = earliestEndAt(items.value);
    if (end === null) {
        countdown.value = '';
        return;
    }
    const remain = end - Date.now();
    if (remain <= 0) {
        countdown.value = '00:00:00';
        stopTimer();
        void load(); // 到点重新取数；取不到有效项时整块不渲染
        return;
    }
    countdown.value = formatCountdown(remain);
}

function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

async function load() {
    try {
        const res: any = await getActiveFlashSaleActivities();
        const normalized = normalizeFlashActivities(res?.activeFlashSaleActivities || [], Date.now());
        const limit = clampLimit(props.section.limit);
        items.value = normalized.slice(0, limit);

        if (items.value.length === 0) return;

        // 按 productId 批量补拉商品名/图/原价；补拉失败的那条单独跳过
        const ids = Array.from(new Set(items.value.map((i) => i.productId)));
        const products = await getProductsByIds(ids);
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
        items.value = items.value.filter((i) => !!map[i.productId]);

        tick();
        stopTimer();
        timer = setInterval(tick, 1000);
    } catch (e) {
        // 取数失败 → 整块不渲染（items 保持为空）
        items.value = [];
        console.warn('[FlashSection] load failed', e);
    }
}

function clampLimit(n?: number): number {
    if (!Number.isFinite(Number(n))) return 4;
    const v = Math.floor(Number(n));
    if (v < 1) return 4;
    return Math.min(20, v);
}

function goDetail(it: FlashItem) {
    const slug = productMap.value[it.productId]?.slug || '';
    if (!slug) return;
    uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}&flashSaleActivityId=${it.activityId}` });
}

function goMore() {
    uni.navigateTo({ url: '/pkg-promotion/pages/flash-sale' });
}

onMounted(() => {
    // 模板特性门控：marketplace 模板关闭秒杀
    const features = getTemplateConfig(tenantStore.templateCode)?.features as any;
    if (features && features.flashSale === false) return;
    void load();
});

onUnmounted(() => stopTimer());
</script>

<style lang="scss" scoped>
.flash-sec { margin: 20rpx; background: #fff; border-radius: $radius-md; padding: 20rpx;
    &__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__title { font-size: 32rpx; font-weight: bold; color: $text-color; }
    &__clock { display: flex; align-items: center; gap: 8rpx; background: #111; border-radius: 20rpx; padding: 4rpx 16rpx; }
    &__clock-lbl { font-size: 20rpx; color: #fff; }
    &__clock-val { font-size: 22rpx; color: #fff; font-weight: bold; }
    &__more { font-size: 24rpx; color: #999; }
    &__row { white-space: nowrap; }
    &__grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
}
.flash-card { background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &--row { display: inline-block; width: 240rpx; margin-right: 16rpx; white-space: normal; vertical-align: top; }
    &__media { position: relative; }
    &__badge { position: absolute; left: 0; top: 12rpx; background: $price-color; color: #fff; font-size: 20rpx; padding: 4rpx 12rpx; border-top-right-radius: 12rpx; border-bottom-right-radius: 12rpx; }
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; color: $text-color; padding: 10rpx 12rpx 0; height: 66rpx; }
    &__prices { display: flex; align-items: baseline; gap: 10rpx; padding: 6rpx 12rpx 0; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { padding: 8rpx 12rpx 12rpx; }
    &__pct { font-size: 20rpx; color: #999; }
}
.flash-sec__grid .flash-card { width: calc(50% - 8rpx); }
</style>
```

- [ ] **Step 2: 补 C 端秒杀词条（5 个语言包都要）**

`src/i18n/locales/zh-CN.json` 顶层加：

```json
    "flash": {
        "title": "限时精选",
        "endsIn": "距结束",
        "more": "更多",
        "badge": "秒杀价",
        "fallbackName": "限时好物"
    },
```

`zh-TW.json` 加：

```json
    "flash": {
        "title": "限時精選",
        "endsIn": "距結束",
        "more": "更多",
        "badge": "秒殺價",
        "fallbackName": "限時好物"
    },
```

`en.json` 加：

```json
    "flash": {
        "title": "Flash Picks",
        "endsIn": "Ends in",
        "more": "More",
        "badge": "Flash price",
        "fallbackName": "Flash deal"
    },
```

`ja.json` 加：

```json
    "flash": {
        "title": "タイムセール",
        "endsIn": "終了まで",
        "more": "もっと見る",
        "badge": "セール価格",
        "fallbackName": "限定商品"
    },
```

`ko.json` 加：

```json
    "flash": {
        "title": "한정 특가",
        "endsIn": "종료까지",
        "more": "더보기",
        "badge": "특가",
        "fallbackName": "한정 상품"
    },
```

- [ ] **Step 3: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功。此时楼层还没挂进首页（Task 7 做），先确保组件本身可编译。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add src/templates/shared/sections/FlashSection.vue src/i18n/locales
git -C d:\zhao\vshop commit -m "feat(flash): 新增限时精选楼层组件与秒杀 i18n 词条"
```

---

## Task 7（V2）: `DynamicHome` 接入 `flash` 分支

**Files:**
- Modify: `d:\zhao\vshop\src\templates\shared\DynamicHome.vue`

- [ ] **Step 1: 引入组件并注册进 componentMap**

```ts
import FlashSection from './sections/FlashSection.vue';
```

```ts
const componentMap: Record<string, any> = {
  banner: BannerSection,
  notice: NoticeSection,
  nav: NavSection,
  goods: GoodsSection,
  richText: RichTextSection,
  flash: FlashSection,
};
```

- [ ] **Step 2: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功。

- [ ] **Step 3: 真机/H5 验证楼层渲染与回退**

在后台（装修页）给当前渠道加一个「限时精选（秒杀）」楼层并保存 → 打开首页（H5：`npm run dev:h5`）：

- 有进行中秒杀活动 → 楼层显示、倒计时每秒递减、两种版式切换生效；
- 无进行中活动 / 接口失败 → **整块不渲染**（页面不出现空白占位）；
- 把渠道模板切到 `marketplace`（或临时把 `registry.ts` 里 marketplace 的 `flashSale` 保持 `false`）→ 楼层不渲染。

- [ ] **Step 4: 手机视口截图存证**

390×844、dpr=2 截图首页（含楼层），存到 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/home-flash-floor.png`。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/templates/shared/DynamicHome.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/home-flash-floor.png
git -C d:\zhao\vshop commit -m "feat(flash): DynamicHome 接入 flash 楼层渲染分支（含空数据整块回退）"
```

---

## Task 8（V3）: `searchProducts` 增 `facetValueFilters` 并迁移两个调用方（修 D2/D3）

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\product.ts`
- Modify: `d:\zhao\vshop\src\pages\category\index.vue`
- Modify: `d:\zhao\vshop\src\pkg-product\pages\list.vue`

- [ ] **Step 1: 给 `searchProducts` 加入参**

把 `searchProducts` 的入参类型改成：

```ts
export async function searchProducts(input: {
    term?: string; facetValueFilters?: Array<{ or: string[] }>; collectionSlug?: string;
    take?: number; skip?: number; sort?: string; groupByProduct?: boolean;
}) {
```

函数体不动（`facetValueIds` 已在 schema 标记 `@deprecated`，新代码不再使用）。

- [ ] **Step 2: 迁移 `pkg-product/pages/list.vue` 的调用**

把第 51 行：

```ts
        const res: any = await searchProducts({ term: searchTerm.value || undefined, facetValueIds: facetValueId ? [facetValueId] : undefined, take, skip });
```

改为：

```ts
        const res: any = await searchProducts({
            term: searchTerm.value || undefined,
            facetValueFilters: facetValueId ? [{ or: [facetValueId] }] : undefined,
            take,
            skip,
        });
```

- [ ] **Step 3: 迁移 `pages/category/index.vue` 的分类查询（含 D2 修复）**

分类页原来用 `cat.facetValueIds`，但该字段根本没被查询出来（恒为 undefined，过滤等于没有）。先把分类列表查询补上 `facetValues`：

```ts
        const res: any = await client.request(`query { collections(options: { topLevelOnly: true }) { items { id name slug facetValues { id name } children { id name slug facetValues { id name } } } } }`);
```

再把 `selectCategory` 里的查询改成（同时把写死的 `take: 10` 交给分页逻辑，Task 9 会接管；此处先改为 20 并保留结构）：

```ts
async function selectCategory(cat: any) {
    activeCat.value = cat;
    subCategories.value = cat.children || [];
    products.value = [];
    skip.value = 0;
    hasMore.value = true;
    await loadProducts(true);
}

const skip = ref(0);
const take = 20;
const hasMore = ref(true);

async function loadProducts(reset = false) {
    if (!activeCat.value) return;
    if (loadingMore.value) return;
    if (!reset && !hasMore.value) return;
    loadingMore.value = true;
    try {
        const ids = ((activeCat.value.facetValues || []) as any[]).map((f) => f.id);
        const res: any = await searchProducts({
            facetValueFilters: ids.length ? [{ or: ids }] : undefined,
            collectionSlug: activeCat.value.slug,
            take,
            skip: reset ? 0 : skip.value,
        });
        const items = res.search?.items || [];
        products.value = reset ? items : [...products.value, ...items];
        const total = res.search?.totalItems || 0;
        skip.value = products.value.length;
        hasMore.value = products.value.length < total;
    } catch (e) {
        console.error(e);
    }
    loadingMore.value = false;
}
```

需要在 `script setup` 顶部补一个 `const loadingMore = ref(false);`，并保留原有 `getMinPrice` / `goList` / `goDetail` 函数。

- [ ] **Step 4: 编译门禁 + 服务端过滤生效验证**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功。随后（Task 18 的探针会固化这条断言）用只读探针分别请求「带 `facetValueFilters`」与「不带」的同一 `collectionSlug`，两次 `totalItems` **必须不同**（证明服务端真的在过滤，而不是被忽略）。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/api/queries/product.ts src/pages/category/index.vue src/pkg-product/pages/list.vue
git -C d:\zhao\vshop commit -m "fix(search): 分类页与商品列表改用 facetValueFilters（弃用 facetValueIds，修 D2）"
```

---

## Task 9（V3）: 分类页模式切换、双悬浮按钮、上拉分页（修 D3）

**Files:**
- Modify: `d:\zhao\vshop\src\pages\category\index.vue`

**依赖**：Task 8 已把 `loadProducts(reset)` / `skip` / `hasMore` / `loadingMore` 铺好。

- [ ] **Step 1: 模板改造：右上内容区按 `mode` 切换 + 右下双悬浮按钮 + 触底加载**

把 `category-page__right` 部分改成：

```html
    <view class="category-page__right">
      <scroll-view scroll-y class="category-page__content" @scrolltolower="onReachBottom">
        <!-- mode=1：二级分类格 -->
        <view v-if="mode === 1">
          <view v-if="subCategories.length" class="sub-grid">
            <view v-for="sub in subCategories" :key="sub.id" class="sub-item" @click="goList(sub.id)">
              <text class="sub-item__name">{{ sub.name }}</text>
            </view>
          </view>
          <EmptyState v-if="!subCategories.length" text="暂无子分类" />
        </view>

        <!-- mode=2：商品列表 -->
        <view v-else class="product-grid">
          <view v-for="p in products" :key="p.productId" class="product-mini" @click="goDetail(p.slug)">
            <VImage :src="p.productAsset?.preview || ''" width="100%" height="240rpx" />
            <text class="product-mini__name">{{ p.productName }}</text>
            <PriceTag :price="getMinPrice(p.priceWithTax)" />
          </view>
          <text v-if="!hasMore && products.length > 0" class="list-footer">没有更多了</text>
          <EmptyState v-if="!loadingMore && products.length === 0" text="暂无商品" />
        </view>
      </scroll-view>

      <view class="fab-group">
        <view class="fab" @click="toggleMode">⇄</view>
        <view class="fab" @click="toTop">↑</view>
      </view>
    </view>
```

- [ ] **Step 2: 脚本补 `mode` 状态与交互**

```ts
const mode = ref(1);

function toggleMode() {
    mode.value = mode.value === 1 ? 2 : 1;
    if (mode.value === 2) {
        // 进入商品列表时按需首次加载
        if (products.value.length === 0) void loadProducts(true);
    }
}

function onReachBottom() {
    if (mode.value === 2) void loadProducts(false);
}

function toTop() {
    uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}
```

要点：`selectCategory` 里已重置 `skip/hasMore/products`，因此切类目后进入 mode 2 会重新拉第一页（`products.length === 0` 命中）。

- [ ] **Step 3: 样式补双悬浮按钮与列表页脚**

```scss
.fab-group { position: fixed; right: 24rpx; bottom: 200rpx; display: flex; flex-direction: column; gap: 20rpx; }
.fab { width: 84rpx; height: 84rpx; border-radius: 50%; background: rgba(0,0,0,0.45); color: #fff; font-size: 36rpx; display: flex; align-items: center; justify-content: center; }
.list-footer { display: block; width: 100%; text-align: center; font-size: 24rpx; color: #999; padding: 24rpx 0; }
```

- [ ] **Step 4: 编译门禁 + 手机截图**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；两种模式可切换；商品列表触底加载更多、到底显示「没有更多了」。截图（390×844 / dpr=2）存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/category-modes.png`。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/pages/category/index.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/category-modes.png
git -C d:\zhao\vshop commit -m "feat(category): 分类页模式切换、双悬浮按钮与商品列表上拉分页（修 D3）"
```

---

## Task 10（V4）: `SkuSheet.vue` 规格选择底部弹层

**Files:**
- Create: `d:\zhao\vshop\src\components\SkuSheet.vue`

- [ ] **Step 1: 新建 `src/components/SkuSheet.vue`**

```vue
<template>
  <view v-if="visible" class="sku-mask" @click.self="close">
    <view class="sku-sheet">
      <view class="sku-sheet__head">
        <VImage :src="variantAsset" width="180rpx" height="180rpx" />
        <view class="sku-sheet__head-info">
          <PriceTag :price="currentVariant?.priceWithTax || 0" :large="true" />
          <text class="sku-sheet__stock">{{ stockText }}</text>
          <text class="sku-sheet__picked">{{ t('sku.picked') }}：{{ pickedText }} · {{ quantity }} {{ t('sku.pieces') }}</text>
        </view>
        <text class="sku-sheet__close" @click="close">✕</text>
      </view>

      <scroll-view scroll-y class="sku-sheet__body">
        <view v-for="group in optionGroups" :key="group.id" class="sku-group">
          <text class="sku-group__label">{{ group.name }}</text>
          <view class="sku-group__options">
            <text
              v-for="opt in group.options"
              :key="opt.id"
              class="sku-option"
              :class="{ active: selected[group.id] === opt.id, disabled: !isOptionEnabled(group, opt) }"
              @click="pickOption(group, opt)"
            >{{ opt.name }}</text>
          </view>
        </view>

        <view class="sku-qty">
          <text class="sku-qty__label">{{ t('sku.quantity') }}</text>
          <view class="qty-control">
            <text class="qty-btn" @click="changeQty(-1)">-</text>
            <text class="qty-num">{{ quantity }}</text>
            <text class="qty-btn" @click="changeQty(1)">+</text>
          </view>
        </view>
      </scroll-view>

      <view class="sku-sheet__bar">
        <button class="sku-sheet__btn sku-sheet__btn--cart" :disabled="!currentVariant" @click="emitAction('cart')">{{ t('product.addToCart') }}</button>
        <button class="sku-sheet__btn sku-sheet__btn--buy" :disabled="!currentVariant" @click="emitAction('buy')">{{ t('product.buyNow') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import VImage from './VImage.vue';
import PriceTag from './PriceTag.vue';

const props = defineProps<{
    visible: boolean;
    product: any;
    /** 秒杀活动（用于详情页 applyFlashSale 联动） */
    activityId?: string;
}>();
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void;
    (e: 'action', payload: { action: 'cart' | 'buy'; variantId: string; quantity: number }): void;
}>();

const { t } = useI18n();
const selected = ref<Record<string, string>>({});
const quantity = ref(1);

const optionGroups = computed(() => props.product?.optionGroups || []);

const currentVariant = computed(() => {
    const variants = props.product?.variants || [];
    if (!variants.length) return null;
    const chosen = Object.values(selected.value);
    if (!chosen.length) return variants[0];
    return variants.find((v: any) => (v.options || []).every((o: any) => chosen.includes(o.id))) || null;
});

const variantAsset = computed(() => currentVariant.value?.featuredAsset?.preview || props.product?.featuredAsset?.preview || '');

const stockText = computed(() => {
    const v = currentVariant.value;
    if (!v) return t('sku.outOfStock');
    const stock = Number(v.stockLevel);
    if (Number.isFinite(stock) && stock >= 0) return `${t('product.stock')} ${stock}`;
    return '';
});

const pickedText = computed(() => {
    const names: string[] = [];
    for (const g of optionGroups.value) {
        const id = selected.value[g.id];
        const opt = (g.options || []).find((o: any) => o.id === id);
        if (opt) names.push(opt.name);
    }
    return names.length ? names.join(' / ') : t('sku.pleasePick');
});

/** 某选项是否可点：把它代入当前已选后，必须能命中一个存在的变体（库存为 0 也算命中但置灰不可选） */
function isOptionEnabled(group: any, opt: any): boolean {
    const trial = { ...selected.value, [group.id]: opt.id };
    const full = optionGroups.value.every((g: any) => !!trial[g.id]);
    if (!full) return true;
    const hit = (props.product?.variants || []).find((v: any) =>
        (v.options || []).every((o: any) => Object.values(trial).includes(o.id)),
    );
    if (!hit) return false;
    const stock = Number(hit.stockLevel);
    return !(Number.isFinite(stock) && stock <= 0);
}

function pickOption(group: any, opt: any) {
    if (!isOptionEnabled(group, opt)) return;
    selected.value = { ...selected.value, [group.id]: opt.id };
}

function changeQty(delta: number) {
    const next = quantity.value + delta;
    if (next < 1) return;
    const stock = Number(currentVariant.value?.stockLevel);
    if (Number.isFinite(stock) && stock > 0 && next > stock) return;
    quantity.value = next;
}

function close() {
    emit('update:visible', false);
}

function emitAction(action: 'cart' | 'buy') {
    if (!currentVariant.value) return;
    emit('action', { action, variantId: currentVariant.value.id, quantity: quantity.value });
}

/** 打开时自动选第一个可用的规格组合 */
watch(
    () => props.visible,
    (v) => {
        if (!v) return;
        const init: Record<string, string> = {};
        for (const g of optionGroups.value) {
            const firstOk = (g.options || []).find((o: any) => isOptionEnabled(g, o));
            if (firstOk) init[g.id] = firstOk.id;
        }
        selected.value = init;
        quantity.value = 1;
    },
);
</script>

<style lang="scss" scoped>
.sku-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: flex-end; }
.sku-sheet { width: 100%; background: #fff; border-top-left-radius: 24rpx; border-top-right-radius: 24rpx; max-height: 80vh; display: flex; flex-direction: column;
    &__head { display: flex; gap: 20rpx; padding: 24rpx; border-bottom: 1rpx solid $border-color; position: relative; }
    &__head-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__stock { font-size: 24rpx; color: #999; }
    &__picked { font-size: 24rpx; color: $text-color-secondary; }
    &__close { position: absolute; right: 24rpx; top: 16rpx; font-size: 32rpx; color: #ccc; }
    &__body { flex: 1; padding: 0 24rpx; }
    &__bar { display: flex; gap: 16rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid $border-color; }
    &__btn { flex: 1; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none;
        &--cart { background: $brand-color-light; color: $brand-color; }
        &--buy { background: $brand-color; color: #fff; }
    }
}
.sku-group { padding: 20rpx 0;
    &__label { font-size: 26rpx; color: $text-color; }
    &__options { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
}
.sku-option { padding: 10rpx 28rpx; font-size: 24rpx; border: 1rpx solid $border-color; border-radius: $radius-sm; color: $text-color;
    &.active { border-color: $brand-color; color: $brand-color; background: $brand-color-light; }
    &.disabled { color: #ccc; background: #f7f7f7; border-color: #eee; }
}
.sku-qty { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0 30rpx;
    &__label { font-size: 26rpx; color: $text-color; }
}
.qty-control { display: flex; align-items: center; border: 1rpx solid $border-color; border-radius: $radius-sm; }
.qty-btn { width: 56rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 28rpx; background: #f5f5f5; }
.qty-num { width: 64rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 26rpx; border-left: 1rpx solid $border-color; border-right: 1rpx solid $border-color; }
</style>
```

- [ ] **Step 2: 补 `sku` 词条（5 个语言包）**

`zh-CN.json`：

```json
    "sku": {
        "picked": "已选",
        "pieces": "件",
        "quantity": "数量",
        "pleasePick": "请选择规格",
        "outOfStock": "暂时缺货"
    },
```

`zh-TW.json`：

```json
    "sku": {
        "picked": "已選",
        "pieces": "件",
        "quantity": "數量",
        "pleasePick": "請選擇規格",
        "outOfStock": "暫時缺貨"
    },
```

`en.json`：

```json
    "sku": {
        "picked": "Selected",
        "pieces": "pcs",
        "quantity": "Quantity",
        "pleasePick": "Please choose options",
        "outOfStock": "Out of stock"
    },
```

`ja.json`：

```json
    "sku": {
        "picked": "選択済み",
        "pieces": "点",
        "quantity": "数量",
        "pleasePick": "オプションを選択してください",
        "outOfStock": "在庫切れ"
    },
```

`ko.json`：

```json
    "sku": {
        "picked": "선택됨",
        "pieces": "개",
        "quantity": "수량",
        "pleasePick": "옵션을 선택하세요",
        "outOfStock": "품절"
    },
```

- [ ] **Step 3: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功（`PRODUCT_DETAIL_FRAGMENT.variants` 已含 `stockLevel`，弹层的库存判定有数据可用）。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add src/components/SkuSheet.vue src/i18n/locales
git -C d:\zhao\vshop commit -m "feat(sku): 新增主包 SkuSheet 规格选择底部弹层（库存联动与置灰）"
```

---

## Task 11（V4）: 详情页改造（已选规格行 / 价格区 / 元信息行 / 底部 5 键 / `applyFlashSale`）

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-product\pages\detail.vue`

- [ ] **Step 1: 模板：删除内联规格组，改为「已选规格行」+ 价格区 + 元信息行**

删除原来的 `<view class="product-detail__specs" v-if="product.optionGroups?.length"> ... </view>` 整块，替换 `product-detail__info` 内部为：

```html
    <view class="product-detail__info">
      <view class="price-row">
        <PriceTag :price="displayPrice" :large="true" />
        <text class="price-row__origin" v-if="originPrice">¥{{ originPrice }}</text>
        <text class="price-row__badge" v-if="isFlash">秒杀价</text>
      </view>
      <view class="price-note" @click="showPriceNote = true">
        <text class="price-note__text">价格说明</text>
        <text class="price-note__arrow">›</text>
      </view>
      <text class="product-detail__name">{{ product.name }}</text>

      <!-- 元信息行：分享必做；销量/积分有数据才渲染 -->
      <view class="meta-row">
        <view class="meta-row__share" @click="shareNow">
          <text class="meta-row__icon">↗</text>
          <text class="meta-row__text">分享</text>
        </view>
        <view class="meta-row__item" v-if="salesCountText">
          <text class="meta-row__text">已售 {{ salesCountText }}</text>
        </view>
        <view class="meta-row__item" v-if="pointsText">
          <text class="meta-row__text">{{ pointsText }}</text>
        </view>
      </view>

      <!-- 已选规格入口 -->
      <view class="sku-entry" @click="openSku">
        <text class="sku-entry__label">已选</text>
        <text class="sku-entry__value">{{ pickedSummary }} · 1 件</text>
        <text class="sku-entry__arrow">›</text>
      </view>
    </view>
```

- [ ] **Step 2: 模板：底部 3 键 → 5 键，并挂载 SkuSheet 与价格说明弹层**

```html
    <view class="product-detail__bar">
      <view class="bar-ico" @click="contactService"><text class="bar-ico__g">☎</text><text class="bar-ico__t">客服</text></view>
      <view class="bar-ico" @click="onFavorite"><text class="bar-ico__g">☆</text><text class="bar-ico__t">收藏</text></view>
      <view class="bar-ico" @click="goCart"><text class="bar-ico__g">🛒</text><text class="bar-ico__t">购物车</text></view>
      <button class="product-detail__cart-btn" @click="openSku('cart')">加入购物车</button>
      <button class="product-detail__buy-btn" @click="openSku('buy')">立即购买</button>
    </view>

    <SkuSheet
      v-model:visible="showSku"
      :product="product"
      :activity-id="flashSaleActivityId"
      @action="onSkuAction"
    />

    <view v-if="showPriceNote" class="note-mask" @click.self="showPriceNote = false">
      <view class="note-sheet">
        <text class="note-sheet__title">价格说明</text>
        <text class="note-sheet__body">划线价为商品参考价，非原价；实际成交价以订单结算页为准。秒杀价仅在活动期间且订单已应用活动时生效。</text>
        <text class="note-sheet__ok" @click="showPriceNote = false">知道了</text>
      </view>
    </view>
```

- [ ] **Step 3: 脚本：新增状态与函数**

```ts
import SkuSheet from '../../components/SkuSheet.vue';
import { applyFlashSale } from '../../api/mutations/promotion';

const showSku = ref(false);
const showPriceNote = ref(false);
const skuIntent = ref<'cart' | 'buy'>('cart');
const flashSaleActivityId = ref('');

/** 页面参数：slug 必填，flashSaleActivityId 由秒杀楼层带过来 */
function readQuery(name: string): string {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    return String(page?.options?.[name] || '');
}

const isFlash = computed(() => !!flashSaleActivityId.value);

const displayPrice = computed(() => selectedVariant.value?.priceWithTax || 0);

/** 划线原价：秒杀时同 variant 的常规价；取不到或低于现价则不显示 */
const originPrice = computed(() => {
    const p = selectedVariant.value?.priceWithTax;
    if (!isFlash.value || !Number.isFinite(p)) return '';
    return (p / 100).toFixed(2);
});

/** 降级：无数据源则不渲染 */
const salesCountText = computed(() => {
    const n = (product.value as any)?.customFields?.salesCount;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? String(n) : '';
});
const pointsText = computed(() => {
    const n = (product.value as any)?.customFields?.pointsReward;
    return Number.isFinite(Number(n)) && Number(n) > 0 ? `可得 ${n} 积分` : '';
});

const pickedSummary = computed(() => {
    const names = (product.value?.optionGroups || [])
        .map((g: any) => (g.options || []).find((o: any) => o.id === selectedOptions.value[g.id])?.name)
        .filter(Boolean);
    return names.length ? names.join(' / ') : '请选择规格';
});

function openSku(intent: 'cart' | 'buy' = 'cart') {
    skuIntent.value = intent;
    showSku.value = true;
}

async function onSkuAction(payload: { action: 'cart' | 'buy'; variantId: string; quantity: number }) {
    showSku.value = false;
    if (payload.action === 'buy' && !auth.isLoggedIn) {
        pendingAction = 'buy';
        uni.navigateTo({ url: '/pages/login/index' });
        return;
    }
    await addVariant(payload.variantId, payload.quantity);
    if (payload.action === 'buy') {
        uni.navigateTo({ url: '/pkg-order/pages/checkout' });
    }
}

/** 加购 + 秒杀活动落单（活动价必须由后端应用，前端不自行算折扣） */
async function addVariant(variantId: string, quantity: number) {
    try {
        await addItemToOrder(variantId, quantity);
        if (flashSaleActivityId.value) {
            await applyFlashSale(flashSaleActivityId.value);
        }
        const res: any = await getActiveOrder();
        if (res.activeOrder) cart.setOrder(res.activeOrder);
        ui.showToast('已加入购物车', 'success');
    } catch (e: any) {
        ui.showToast(e.message);
    }
}

function contactService() {
    ui.showToast('客服功能敬请期待');
}
function onFavorite() {
    ui.showToast('收藏功能敬请期待');
}
function goCart() {
    uni.switchTab({ url: '/pages/cart/index' });
}
function shareNow() {
    ui.showToast('请点击右上角分享');
}
```

同时：
- 删除旧的 `addToCart()` / `buyNow()`（已被 `onSkuAction` 取代），但保留 `onMounted` 里的登录回调逻辑，把 `addToCart()` 调用替换为 `addVariant(selectedVariant.value.id, 1)`；
- 在既有 `onMounted` 读取 `slug` 处补 `flashSaleActivityId.value = readQuery('flashSaleActivityId');`。

- [ ] **Step 4: 样式补价格区 / 元信息行 / 5 键底部栏**

```scss
.price-row { display: flex; align-items: baseline; gap: 12rpx; }
.price-row__origin { font-size: 24rpx; color: #999; text-decoration: line-through; }
.price-row__badge { font-size: 20rpx; color: #fff; background: $price-color; border-radius: 8rpx; padding: 2rpx 10rpx; }
.price-note { display: flex; align-items: center; gap: 6rpx; margin-top: 8rpx; &__text { font-size: 22rpx; color: #999; } &__arrow { font-size: 22rpx; color: #999; } }
.meta-row { display: flex; align-items: center; gap: 32rpx; margin-top: 16rpx; &__share { display: flex; align-items: center; gap: 6rpx; } &__item { display: flex; align-items: center; } &__icon { font-size: 26rpx; color: $text-color-secondary; } &__text { font-size: 24rpx; color: $text-color-secondary; } }
.sku-entry { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx; padding: 16rpx 0; border-top: 1rpx solid $border-color;
    &__label { font-size: 26rpx; color: $text-color-secondary; }
    &__value { flex: 1; font-size: 26rpx; color: $text-color; }
    &__arrow { font-size: 26rpx; color: #ccc; }
}
.product-detail__bar { justify-content: space-between; gap: 8rpx; }
.bar-ico { display: flex; flex-direction: column; align-items: center; width: 88rpx; &__g { font-size: 32rpx; } &__t { font-size: 20rpx; color: $text-color-secondary; } }
.note-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 210; display: flex; align-items: center; justify-content: center; }
.note-sheet { width: 620rpx; background: #fff; border-radius: $radius-md; padding: 32rpx; display: flex; flex-direction: column; gap: 20rpx;
    &__title { font-size: 30rpx; font-weight: bold; }
    &__body { font-size: 26rpx; color: $text-color-secondary; line-height: 1.6; }
    &__ok { text-align: center; color: $brand-color; font-size: 28rpx; padding-top: 8rpx; }
}
```

- [ ] **Step 5: 确认 `applyFlashSale` 前端封装存在**

Grep `d:\zhao\vshop\src\api\mutations` 是否已有 `promotion.ts` 里的 `applyFlashSale`。若不存在，新建 `src/api/mutations/promotion.ts`：

```ts
import { getGraphQLClient } from '../client';

export async function applyFlashSale(activityId: string) {
    const client = getGraphQLClient();
    const mutation = `mutation ApplyFlashSale($activityId: ID!) { applyFlashSale(activityId: $activityId) { id code totalWithTax } }`;
    return client.request(mutation, { activityId });
}
```

- [ ] **Step 6: 编译门禁 + 手机截图**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；详情页出现价格区、元信息行（分享必有，销量/积分无数据则不显示）、已选规格行；点规格行弹出 SkuSheet，切换规格价格与库存联动，库存为 0 的选项置灰；底部 5 键。截图（390×844 / dpr=2）存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/detail-sku-sheet.png`。

- [ ] **Step 7: 提交**

```powershell
git -C d:\zhao\vshop add src/pkg-product/pages/detail.vue src/api/mutations/promotion.ts web-admin/docs/superpowers/manual/vshop-usemall-alignment/detail-sku-sheet.png
git -C d:\zhao\vshop commit -m "feat(detail): 详情页规格弹层化、价格区与元信息行、底部 5 键及秒杀活动落单"
```

---

## Task 12（V5）: `ORDER_FRAGMENT` 补字段 + 购物车行内状态标签

**Files:**
- Modify: `d:\zhao\vshop\src\api\fragments.ts`
- Modify: `d:\zhao\vshop\src\utils\flash-normalize.ts`（新增行状态判定纯函数）
- Modify: `d:\zhao\vshop\src\pages\cart\index.vue`

- [ ] **Step 1: 给 `ORDER_FRAGMENT` 的 `productVariant` 补 `enabled` / `stockLevel`**

```ts
            productVariant { id name enabled stockLevel options { name } customFields { shippingProfileId paymentProfileId } }
```

- [ ] **Step 2: 在 `flash-normalize.ts` 增加购物车行判定纯函数**

```ts
/** 购物车行状态判定：失效（已下架/变体缺失）优先于库存预警 */
export type CartLineState = 'invalid' | 'lowStock' | 'normal';

export function cartLineState(line: any): CartLineState {
    const v = line?.productVariant;
    if (!v || v.enabled === false) return 'invalid';
    const stock = Number(v.stockLevel);
    if (Number.isFinite(stock) && stock >= 0 && stock < Number(line?.quantity ?? 0)) return 'lowStock';
    return 'normal';
}

/** 库存预警文案：仅 lowStock 时返回，如「仅剩 2 件」 */
export function lowStockText(line: any): string {
    const stock = Number(line?.productVariant?.stockLevel);
    if (!Number.isFinite(stock) || stock < 0) return '';
    return `仅剩 ${stock} 件`;
}
```

- [ ] **Step 3: 购物车行加状态标签（失效灰显不可勾选）**

`cart/index.vue` 的商品行模板里，在 `cart-item__info` 内名称之后插入：

```html
            <view class="cart-item__tags" v-if="lineState(line) !== 'normal'">
              <text v-if="lineState(line) === 'invalid'" class="tag tag--invalid">已下架</text>
              <text v-else class="tag tag--warn">{{ lowStockText(line) }}</text>
            </view>
```

行根节点加失效态类：

```html
        <view v-for="line in group.lines" :key="line.id" class="cart-item" :class="{ 'cart-item--invalid': lineState(line) === 'invalid' }">
```

勾选框点击时拦截失效行：

```ts
function toggleSelect(id: string) {
    const line = cartLines.value.find((l: any) => l.id === id);
    if (line && lineState(line) === 'invalid') {
        ui.showToast('该商品已下架，请删除');
        return;
    }
    const s = new Set(selectedIds.value);
    if (s.has(id)) s.delete(id); else s.add(id);
    selectedIds.value = s;
}
```

`loadCart()` 里自动全选要跳过失效行：

```ts
            const ids = new Set<string>();
            (res.activeOrder.lines || []).forEach((l: any) => {
                if (cartLineState(l) !== 'invalid') ids.add(l.id);
            });
            selectedIds.value = ids;
```

脚本导入与包装：

```ts
import { cartLineState, lowStockText } from '../../utils/flash-normalize';

function lineState(line: any) {
    return cartLineState(line);
}
```

样式：

```scss
.cart-item--invalid { opacity: 0.55; }
.cart-item__tags { display: flex; gap: 8rpx; }
.tag { font-size: 20rpx; border-radius: 6rpx; padding: 2rpx 10rpx;
    &--invalid { color: #999; background: #f0f0f0; }
    &--warn { color: #fff; background: $price-color; }
}
```

- [ ] **Step 4: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；购物车中下架行灰显且点勾选被拦截、库存不足行显示「仅剩 N 件」。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/api/fragments.ts src/utils/flash-normalize.ts src/pages/cart/index.vue
git -C d:\zhao\vshop commit -m "feat(cart): 订单 fragment 补 enabled/stockLevel，购物车行内失效与库存预警标签"
```

---

## Task 13（V5）: 购物车「勾选真生效」——暂存与回填

**Files:**
- Modify: `d:\zhao\vshop\src\stores\cart.ts`
- Modify: `d:\zhao\vshop\src\pages\cart\index.vue`
- Modify: `d:\zhao\vshop\src\pkg-order\pages\pay-result.vue`

**语义（务必按此实现，不要改动方向）**：`pendingLines` 只装**未勾选（＝未购买）的行**。点「去结算」时把它们移出 `activeOrder`；回到购物车或进入支付结果页时**回填它们**（不是丢弃）。

- [ ] **Step 1: `stores/cart.ts` 增加暂存 API**

```ts
const PENDING_KEY = 'cart_pending_lines';
```

在 store 内部加：

```ts
    /** 未勾选（未购买）行的暂存：{ variantId, quantity }[] */
    const pendingLines = ref<Array<{ variantId: string; quantity: number }>>(
        (() => {
            try {
                return JSON.parse(uni.getStorageSync(PENDING_KEY) || '[]') || [];
            } catch {
                return [];
            }
        })(),
    );

    function setPendingLines(lines: Array<{ variantId: string; quantity: number }>) {
        pendingLines.value = lines || [];
        uni.setStorageSync(PENDING_KEY, JSON.stringify(pendingLines.value));
    }

    function clearPendingLines() {
        pendingLines.value = [];
        uni.removeStorageSync(PENDING_KEY);
    }
```

并把 `pendingLines`、`setPendingLines`、`clearPendingLines` 都加进 `return { ... }`。

- [ ] **Step 2: 购物车「去结算」改为移出未勾选行**

```ts
async function goCheckout() {
    if (selectedCount.value === 0) return;
    const unselected = cartLines.value.filter((l: any) => !selectedIds.value.has(l.id));
    const stash = unselected
        .filter((l: any) => cartLineState(l) !== 'invalid')
        .map((l: any) => ({ variantId: l.productVariant?.id, quantity: l.quantity }))
        .filter((x: any) => !!x.variantId);

    try {
        for (const l of unselected) {
            await removeOrderLine(l.id);
        }
    } catch (e: any) {
        ui.showToast(e.message);
        await loadCart();
        return;
    }

    cart.setPendingLines(stash);
    uni.navigateTo({ url: '/pkg-order/pages/checkout' });
}
```

注意：失效行本身不可勾选，也应从暂存中排除（上面已过滤），但仍要从订单里移出。

- [ ] **Step 3: 购物车 `onShow` 回填**

```ts
onShow(async () => {
    await loadCart();
    await restorePending();
});

/** 幂等回填：成功一行即从暂存放移除一行，失败的行留在暂存里等下次再试 */
async function restorePending() {
    const pending = [...cart.pendingLines];
    if (pending.length === 0) return;
    const failed: Array<{ variantId: string; quantity: number }> = [];
    for (const p of pending) {
        try {
            await addItemToOrder(p.variantId, p.quantity);
        } catch (e) {
            failed.push(p);
        }
    }
    cart.setPendingLines(failed);
    if (failed.length > 0) ui.showToast(`${failed.length} 件商品库存不足，未能恢复`);
    await loadCart();
}
```

脚本需补导入：`import { addItemToOrder } from '../../api/mutations/cart';`

- [ ] **Step 4: `pay-result.vue` 进入即回填再清空**

```ts
import { onShow } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { addItemToOrder } from '../../api/mutations/cart';

const cart = useCartStore();

onShow(async () => {
    const pending = [...cart.pendingLines];
    if (pending.length === 0) return;
    // 进入本页代表本次结算已结束：未勾选行（未购买）必须回填，不能丢弃
    for (const p of pending) {
        try {
            await addItemToOrder(p.variantId, p.quantity);
        } catch (e) {
            console.warn('[pay-result] restore pending line failed', p, e);
        }
    }
    cart.clearPendingLines();
});
```

- [ ] **Step 5: 编译门禁 + 真机走一遍勾选流程**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：
1. 购物车有 3 行 → 只勾 1 行 → 去结算 → 结算页只有 1 行；
2. 从结算页返回购物车 → 3 行都还在（另 2 行被回填）；
3. 走完支付进入支付结果页 → 购物车仍是 3 行（另 2 行回填成功），没有凭空多出刚买的商品。

截图（390×844 / dpr=2）存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/cart-select-real.png`。

- [ ] **Step 6: 提交**

```powershell
git -C d:\zhao\vshop add src/stores/cart.ts src/pages/cart/index.vue src/pkg-order/pages/pay-result.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/cart-select-real.png
git -C d:\zhao\vshop commit -m "feat(cart): 勾选真生效（未勾选行移出暂存，回购物车/支付结果页幂等回填）"
```

---

## Task 14（V5）: 购物车未登录态 + 为你推荐

**Files:**
- Modify: `d:\zhao\vshop\src\pages\cart\index.vue`

- [ ] **Step 1: 未登录态**

模板在 `EmptyState` 之前插入：

```html
    <view v-if="!auth.isLoggedIn" class="cart-guest">
      <text class="cart-guest__text">当前未授权，登录后查看购物车</text>
      <button class="cart-guest__btn" @click="goLogin">去登录</button>
    </view>
```

并把原列表容器与 `EmptyState` 加登录前置条件：列表 `<view v-if="auth.isLoggedIn && cartLines.length > 0" ...>`，空态 `<EmptyState v-else-if="auth.isLoggedIn && !loading" text="购物车是空的" />`。

脚本：

```ts
import { useAuthStore } from '../../stores/auth';
const auth = useAuthStore();

function goLogin() {
    uni.navigateTo({ url: '/pages/login/index' });
}
```

样式：

```scss
.cart-guest { display: flex; flex-direction: column; align-items: center; gap: 30rpx; padding: 160rpx 40rpx;
    &__text { font-size: 28rpx; color: $text-color-secondary; }
    &__btn { background: $brand-color; color: #fff; font-size: 28rpx; border-radius: 40rpx; padding: 0 60rpx; height: 72rpx; line-height: 72rpx; }
}
```

- [ ] **Step 2: 为你推荐区**

模板在 `cart-footer` 之前插入：

```html
    <view class="cart-reco" v-if="reco.length > 0">
      <text class="cart-reco__title">为你推荐</text>
      <view class="cart-reco__grid">
        <view v-for="p in reco" :key="p.productId" class="reco-card" @click="goDetail(p.slug)">
          <VImage :src="p.productAsset?.preview || ''" width="100%" height="260rpx" />
          <text class="reco-card__name">{{ p.productName }}</text>
          <PriceTag :price="getMinPrice(p.priceWithTax)" />
        </view>
      </view>
    </view>
```

脚本：

```ts
import { searchProducts } from '../../api/queries/product';
const reco = ref<any[]>([]);

async function loadReco() {
    try {
        const res: any = await searchProducts({ take: 8 });
        reco.value = (res.search?.items || []).slice(0, 4);
    } catch (e) {
        reco.value = [];
    }
}

function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }
```

在既有 `onShow` 回调里追加 `void loadReco();`。

样式：

```scss
.cart-reco { padding: 20rpx; &__title { font-size: 30rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } &__grid { display: flex; flex-wrap: wrap; justify-content: space-between; } }
.reco-card { width: 48%; background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 20rpx;
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; padding: 10rpx 12rpx 6rpx; height: 64rpx; }
}
```

- [ ] **Step 3: 编译门禁 + 手机截图**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；未登录显示登录引导；登录后有推荐区且在结算栏上方。截图（390×844 / dpr=2）存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/cart-guest-and-reco.png`。

- [ ] **Step 4: 提交**

```powershell
git -C d:\zhao\vshop add src/pages/cart/index.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/cart-guest-and-reco.png
git -C d:\zhao\vshop commit -m "feat(cart): 未登录引导态与为你推荐区"
```

---

## Task 15（V6）: 秒杀页版式改造

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-promotion\pages\flash-sale.vue`

- [ ] **Step 1: 用归一化纯函数重写取数，并加整页一个倒计时**

```ts
import { earliestEndAt, formatCountdown, normalizeFlashActivities, soldPercent, type FlashItem } from '../../utils/flash-normalize';
import { getProductsByIds } from '../../api/queries/product';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import BackTop from '../../components/BackTop.vue';
// 修改既有第 17 行 vue 导入为：import { onMounted, onUnmounted, ref } from 'vue';

const items = ref<FlashItem[]>([]);
const productMap = ref<Record<string, any>>({});
const countdown = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
    const end = earliestEndAt(items.value);
    if (end === null) { countdown.value = ''; return; }
    const remain = end - Date.now();
    if (remain <= 0) {
        countdown.value = '00:00:00';
        stopTimer();
        items.value = [];
        uni.showToast({ title: '秒杀活动已结束', icon: 'none' });
        return;
    }
    countdown.value = formatCountdown(remain);
}

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

async function load() {
    try {
        const res: any = await getActiveFlashSaleActivities();
        items.value = normalizeFlashActivities(res?.activeFlashSaleActivities || [], Date.now());
        if (items.value.length === 0) return;
        const products = await getProductsByIds(Array.from(new Set(items.value.map((i) => i.productId))));
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
        items.value = items.value.filter((i) => !!map[i.productId]);
        tick();
        timer = setInterval(tick, 1000);
    } catch (e) { items.value = []; }
}

onMounted(load);
onUnmounted(stopTimer);

function goProduct(it: FlashItem) {
    const slug = productMap.value[it.productId]?.slug;
    if (!slug) return;
    uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}&flashSaleActivityId=${it.activityId}` });
}
function origPrice(it: FlashItem): string {
    const v = (productMap.value[it.productId]?.variants || []).find((x: any) => String(x.id) === String(it.variantId));
    return Number.isFinite(v?.priceWithTax) && v.priceWithTax > it.flashPrice ? (v.priceWithTax / 100).toFixed(2) : '';
}
```

- [ ] **Step 2: 模板改为倒计时卡 + 双列网格 + 返回顶部**

```html
<template>
  <view class="flash-sale">
    <view class="flash-head" v-if="items.length">
      <text class="flash-head__title">限时秒杀</text>
      <view class="flash-head__clock" v-if="countdown">
        <text class="flash-head__lbl">距结束</text>
        <text class="flash-head__val">{{ countdown }}</text>
      </view>
    </view>

    <view class="flash-grid">
      <view v-for="item in items" :key="item.activityId" class="flash-card" @click="goProduct(item)">
        <view class="flash-card__media">
          <VImage :src="productMap[item.productId]?.featuredAsset?.preview || ''" width="100%" height="300rpx" />
          <text class="flash-card__badge">秒杀价</text>
        </view>
        <text class="flash-card__name">{{ productMap[item.productId]?.name || item.name }}</text>
        <view class="flash-card__prices">
          <PriceTag :price="item.flashPrice" />
          <text class="flash-card__origin" v-if="origPrice(item)">¥{{ origPrice(item) }}</text>
        </view>
        <view class="flash-card__progress">
          <progress :percent="soldPercent(item)" stroke-width="6" activeColor="#e0433f" />
          <text class="flash-card__pct">{{ soldPercent(item) }}%</text>
        </view>
      </view>
    </view>

    <EmptyState v-if="items.length === 0" text="暂无秒杀活动" />
    <BackTop :threshold="300" />
  </view>
</template>
```

- [ ] **Step 3: 样式**

```scss
.flash-sale { padding: 20rpx; }
.flash-head { display: flex; align-items: center; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
    &__title { font-size: 32rpx; font-weight: bold; }
    &__clock { display: flex; align-items: center; gap: 8rpx; background: #111; border-radius: 20rpx; padding: 4rpx 16rpx; }
    &__lbl { font-size: 20rpx; color: #fff; }
    &__val { font-size: 22rpx; color: #fff; font-weight: bold; }
}
.flash-grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.flash-card { width: calc(50% - 8rpx); background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &__media { position: relative; }
    &__badge { position: absolute; left: 0; top: 12rpx; background: $price-color; color: #fff; font-size: 20rpx; padding: 4rpx 12rpx; border-top-right-radius: 12rpx; border-bottom-right-radius: 12rpx; }
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; padding: 10rpx 12rpx 0; height: 66rpx; }
    &__prices { display: flex; align-items: baseline; gap: 10rpx; padding: 6rpx 12rpx 0; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { padding: 8rpx 12rpx 12rpx; }
    &__pct { font-size: 20rpx; color: #999; }
}
```

保留原有的 `useShare({ title: '限时秒杀 - 精选好物', path: '/pkg-promotion/pages/flash-sale' })` 调用。

- [ ] **Step 4: 编译门禁 + 手机截图**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；秒杀页双列网格 + 顶部倒计时 + 返回顶部。截图存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/flash-sale-page.png`。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add src/pkg-promotion/pages/flash-sale.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/flash-sale-page.png
git -C d:\zhao\vshop commit -m "feat(promotion): 秒杀页改造为倒计时头 + 双列网格 + 返回顶部"
```

---

## Task 16（V6）: 拼团页版式改造 + 修复 `joinGroupBuy` 缺参（修 D1）

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\promotion.ts`
- Modify: `d:\zhao\vshop\src\pkg-promotion\pages\group-buy.vue`

**依赖**：Task 1 的后端字段已上线。

- [ ] **Step 1: 拼团查询补 `productId` / `variantId`**

```ts
export async function getActiveGroupBuyActivities() {
    const client = getGraphQLClient();
    return client.request(`query { activeGroupBuyActivities { id name description targetCount currentCount maxCount groupPrice leaderDiscount leaderRewardType status startAt endAt productId variantId } }`);
}
```

- [ ] **Step 2: 修复 `joinGroupBuy` 调用（补必填 `orderId`）**

后端 SDL 为 `joinGroupBuy(activityId: ID!, orderId: ID!, isLeader: Boolean!)`，现有前端只传了两个参数，必然失败。

```ts
async function joinGroup(activity: any, isLeader: boolean) {
    try {
        // 1) 先确保存在 activeOrder，2) 加购该活动商品，3) 再调用 joinGroupBuy
        const order0: any = await getActiveOrder();
        let orderId = order0?.activeOrder?.id;
        if (!orderId) {
            throw new Error('购物车不可用，请稍后重试');
        }
        if (activity.variantId) {
            await addItemToOrder(String(activity.variantId), 1);
        }
        const after: any = await getActiveOrder();
        orderId = after?.activeOrder?.id || orderId;

        const client = getGraphQLClient();
        const res: any = await client.request(
            `mutation($activityId:ID!,$orderId:ID!,$isLeader:Boolean!) { joinGroupBuy(activityId:$activityId,orderId:$orderId,isLeader:$isLeader) { id status } }`,
            { activityId: activity.id, orderId, isLeader },
        );
        if (res?.joinGroupBuy?.id) {
            ui.showToast('参团成功', 'success');
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            ui.showToast('参团失败，请重试');
        }
    } catch (e: any) {
        ui.showToast(e.message);
    }
}
```

补导入：

```ts
import { getActiveOrder } from '../../api/queries/order';
import { addItemToOrder } from '../../api/mutations/cart';
import { getProductsByIds } from '../../api/queries/product';
```

- [ ] **Step 3: 卡片改为 usemall 版式（图 + 团价 + 进度 + 倒计时标签 + 去拼团）**

```html
<template>
  <view class="group-buy">
    <view v-for="item in activities" :key="item.id" class="gb-card">
      <VImage :src="productMap[item.productId]?.featuredAsset?.preview || ''" width="200rpx" height="200rpx" class="gb-card__img" />
      <view class="gb-card__main">
        <text class="gb-card__name">{{ productMap[item.productId]?.name || item.name }}</text>
        <view class="gb-card__prices">
          <text class="gb-card__group">¥{{ (item.groupPrice / 100).toFixed(2) }}</text>
          <text class="gb-card__origin" v-if="origPrice(item)">¥{{ origPrice(item) }}</text>
        </view>
        <view class="gb-card__progress">
          <view class="gb-card__dots">
            <text class="gb-card__dot" v-for="n in Math.min(item.currentCount, 5)" :key="n"></text>
          </view>
          <text class="gb-card__lack">还差 {{ Math.max(0, item.targetCount - item.currentCount) }} 人成团</text>
        </view>
        <view class="gb-card__foot">
          <text class="gb-card__tag">{{ item.targetCount }} 人团 · 剩 {{ countdownOf(item) }}</text>
          <button class="gb-card__btn" @click="joinGroup(item, false)">去拼团</button>
        </view>
      </view>
    </view>
    <EmptyState v-if="activities.length === 0" text="暂无拼团活动" />
    <BackTop :threshold="300" />
  </view>
</template>
```

脚本补：

```ts
import VImage from '../../components/VImage.vue';
import BackTop from '../../components/BackTop.vue';
// 修改既有第 14 行 vue 导入为：import { onMounted, onUnmounted, ref } from 'vue';
import { formatCountdown } from '../../utils/flash-normalize';

const productMap = ref<Record<string, any>>({});
const nowTick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function countdownOf(item: any): string {
    const end = Date.parse(item.endAt);
    if (!Number.isFinite(end)) return '--:--:--';
    return formatCountdown(Math.max(0, end - nowTick.value));
}

function origPrice(item: any): string {
    const v = (productMap.value[item.productId]?.variants || []).find((x: any) => String(x.id) === String(item.variantId));
    return Number.isFinite(v?.priceWithTax) && v.priceWithTax > item.groupPrice ? (v.priceWithTax / 100).toFixed(2) : '';
}

async function loadProducts() {
    const ids = Array.from(new Set(activities.value.map((a: any) => a.productId).filter(Boolean).map(String))) as string[];
    if (ids.length === 0) return;
    try {
        const products = await getProductsByIds(ids);
        const map: Record<string, any> = {};
        for (const p of products) map[String(p.id)] = p;
        productMap.value = map;
    } catch (e) { productMap.value = {}; }
}
```

`onMounted` 里改为：

```ts
onMounted(async () => {
    try {
        const res: any = await getActiveGroupBuyActivities();
        activities.value = res.activeGroupBuyActivities || [];
    } catch (e) { activities.value = []; }
    await loadProducts();
    timer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
```

注意：整页也**只挂一个计时器**（`nowTick`），卡片倒计时是纯函数计算，不给每张卡挂 `setInterval`。

- [ ] **Step 4: 样式**

```scss
.group-buy { padding: 20rpx; }
.gb-card { display: flex; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 16rpx;
    &__img { border-radius: $radius-sm; flex-shrink: 0; }
    &__main { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__name { font-size: 28rpx; font-weight: bold; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__prices { display: flex; align-items: baseline; gap: 12rpx; }
    &__group { font-size: 34rpx; color: $price-color; font-weight: bold; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
    &__progress { display: flex; align-items: center; gap: 12rpx; }
    &__dots { display: flex; gap: 6rpx; }
    &__dot { width: 28rpx; height: 28rpx; border-radius: 50%; background: $brand-color-light; }
    &__lack { font-size: 22rpx; color: $text-color-secondary; }
    &__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6rpx; }
    &__tag { font-size: 22rpx; color: #fff; background: $price-color; border-radius: 8rpx; padding: 2rpx 10rpx; }
    &__btn { background: $brand-color; color: #fff; border-radius: $radius-md; border: none; height: 64rpx; line-height: 64rpx; font-size: 26rpx; padding: 0 32rpx; }
}
```

保留页面顶部 tab 区只呈现「拼团列表」一项（另两个 tab 本轮不出现）。

- [ ] **Step 5: 编译门禁 + 真机验证参团**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；登录状态下点「去拼团」→ 不再报缺参错误 → 提示参团成功并跳到结算页；活动卡显示商品图、团价、划线价、进度、倒计时。截图存 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/group-buy-page.png`。

- [ ] **Step 6: 提交**

```powershell
git -C d:\zhao\vshop add src/api/queries/promotion.ts src/pkg-promotion/pages/group-buy.vue web-admin/docs/superpowers/manual/vshop-usemall-alignment/group-buy-page.png
git -C d:\zhao\vshop commit -m "feat(promotion): 拼团页版式改造并修复 joinGroupBuy 缺 orderId（修 D1）"
```

---

## Task 17（V6）: 结算页发票入口行 + 订单备注行

**Files:**
- Modify: `d:\zhao\vshop\src\pkg-order\pages\checkout.vue`

**锚点**：模板第 249-258 行的「优惠券」块（`<view class="section coupon-entry" ...>`）。新行插在它**后面**。

- [ ] **Step 1: 插入发票入口行与备注行**

紧跟优惠券块之后插入：

```html
    <!-- 发票 -->
    <view class="section coupon-entry" @click="goInvoice">
      <text class="coupon-entry__label">发票</text>
      <view class="coupon-entry__right">
        <text class="coupon-entry__none">{{ invoiceHint }}</text>
        <text class="coupon-entry__arrow">▸</text>
      </view>
    </view>

    <!-- 订单备注 -->
    <view class="section remark-block">
      <text class="remark-block__label">订单备注</text>
      <textarea
        v-model="orderRemark"
        class="remark-block__input"
        placeholder="选填，如对配送时间的要求"
        maxlength="200"
        auto-height
      />
    </view>
```

- [ ] **Step 2: 脚本补状态与函数**

```ts
const orderRemark = ref('');
const invoiceHint = ref('如需发票请点击申请');

function goInvoice() {
    uni.navigateTo({ url: '/pkg-order/pages/invoice-apply' });
}
```

发票提示（可选增强，不改后端）：进入页面时若本地已申请过，显示已申请。保持简单即可：

```ts
onMounted(() => {
    const applied = uni.getStorageSync('invoice_applied_hint');
    if (applied) invoiceHint.value = String(applied);
});
```

- [ ] **Step 3: 备注随支付请求透传**

在 `payCurrentOrder(method)` 内构建 metadata 处（原 `const paymentMetadata: Record<string, any> = {};` 之后）加：

```ts
    // 订单备注：随 PaymentInput.metadata 透传（Vendure 原生字段，无需后端改动）
    if (orderRemark.value) {
        paymentMetadata.remark = orderRemark.value;
    }
```

- [ ] **Step 4: 样式**

```scss
.remark-block { display: flex; flex-direction: column; gap: 12rpx;
    &__label { font-size: 26rpx; color: $text-color; }
    &__input { width: 100%; box-sizing: border-box; background: #fff; border-radius: $radius-md; padding: 16rpx 20rpx; font-size: 26rpx; min-height: 96rpx; }
}
```

若结算页已有 `.section` 容器样式，则无需重复定义，只需要 `.remark-block` 内部即可。

- [ ] **Step 5: 编译门禁**

```powershell
npm run build:h5
```

运行位置：`d:\zhao\vshop`

Expected：构建成功；结算页出现「发票」行（点击进入发票申请页）与「订单备注」输入框。

- [ ] **Step 6: 验证备注是否真的落到支付记录（必须实测，不许跳过）**

下单并在结算页填备注 → 走一次真实支付链路 → 查订单详情页/接口的 `payments[].metadata`：

```powershell
curl -s -X POST "https://<域名>/shop-api" -H "Content-Type: application/json" -H "vendure-token: <渠道 token>" -H "Authorization: Bearer <token>" -d "{\"query\":\"{ activeOrder { payments { method metadata } } }\"}"
```

Expected 与分支处理：
- **通过**（`metadata` 里出现 `remark`）→ 结论记为「备注透传可用」，写进 Task 18 的手册；
- **不通过** → 按设计 §5.5 的兜底：**退回不做备注行**（移除 Step 1 的备注块与 Step 3 的透传），并在手册中记录「备注链路不通，已回退」。**不允许为了凑需求硬留一个无效输入框。**

- [ ] **Step 7: 提交**

```powershell
git -C d:\zhao\vshop add src/pkg-order/pages/checkout.vue
git -C d:\zhao\vshop commit -m "feat(checkout): 新增发票入口行与订单备注行（备注随支付 metadata 透传）"
```

---

## Task 18: 只读探针脚本 + 操作手册 + 全量手机截图

**Files:**
- Create: `d:\zhao\vshop\web-admin\scripts\_smoke_usemall_align.py`
- Create: `d:\zhao\vshop\web-admin\docs\superpowers\manual\vshop-usemall-alignment\README.md`

- [ ] **Step 1: 新建探针脚本**

```python
# -*- coding: utf-8 -*-
"""vshop 对齐 usemall 版式 —— 生产 shop-api 只读探针（不写任何数据）

用法（PowerShell）：
    $env:SHOP_API_URL="https://<域名>/shop-api"
    $env:VENDURE_TOKEN="<渠道 token>"
    $env:AUTH_TOKEN="<C 端用户 token>"
    python web-admin/scripts/_smoke_usemall_align.py
"""
import json
import os
import urllib.request

SHOP_API_URL = os.environ.get("SHOP_API_URL", "https://v.joho.cn/shop-api")
VENDURE_TOKEN = os.environ.get("VENDURE_TOKEN", "")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")


def shop_api(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if VENDURE_TOKEN:
        headers["vendure-token"] = VENDURE_TOKEN
    if AUTH_TOKEN:
        headers["Authorization"] = "Bearer " + AUTH_TOKEN
    req = urllib.request.Request(SHOP_API_URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("errors"):
        raise RuntimeError(payload["errors"])
    return payload["data"]


def check_flash() -> None:
    data = shop_api("{ activeFlashSaleActivities { id productId variantId endAt totalStock soldCount status } }")
    acts = data["activeFlashSaleActivities"]
    assert isinstance(acts, list), "activeFlashSaleActivities 应为列表"
    print(f"[flash] 活动数={len(acts)}")
    if not acts:
        print("[flash] 当前无进行中活动，跳过补拉断言（不算失败）")
        return
    ids = [a["productId"] for a in acts if a.get("productId")]
    q = "query($ids:[ID!]!){ products(options:{filter:{id:{in:$ids}},take:50}){ items { id name } } }"
    products = shop_api(q, {"ids": ids})["products"]["items"]
    got = {str(p["id"]) for p in products}
    missing = [i for i in ids if str(i) not in got]
    assert not missing, f"以下 productId 补拉不到商品：{missing}"
    print(f"[flash] productId 断言通过（{len(ids)} 个全部可补拉）")
    # 归一化断言：所有活动 endAt 可解析
    for a in acts:
        assert a.get("endAt"), f"活动 {a['id']} 缺 endAt"


def check_group_buy() -> None:
    data = shop_api("{ activeGroupBuyActivities { id productId variantId groupPrice endAt } }")
    acts = data["activeGroupBuyActivities"]
    print(f"[group-buy] 活动数={len(acts)}")
    for a in acts:
        assert a.get("productId"), f"活动 {a['id']} 未返回 productId（Task 1 后端字段未上线？）"
        assert a.get("variantId"), f"活动 {a['id']} 未返回 variantId"
    print("[group-buy] productId/variantId 断言通过")


def check_facet_filter() -> None:
    collections = shop_api("{ collections(options:{topLevelOnly:true}){ items { id slug } } }")["collections"]["items"]
    if not collections:
        print("[facet] 无顶级分类，跳过")
        return
    slug = collections[0]["slug"]
    plain = shop_api("query($slug:String!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1}){ totalItems } }", {"slug": slug})["search"]["totalItems"]
    facets = shop_api("query($slug:String!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1}){ facetValues { facetValue { id } } } }", {"slug": slug})["search"]["facetValues"]
    ids = [f["facetValue"]["id"] for f in facets if f.get("facetValue")]
    if not ids:
        print("[facet] 该分类无 facet，跳过过滤断言")
        return
    filtered = shop_api(
        "query($slug:String!,$ids:[ID!]!){ search(input:{groupByProduct:true,collectionSlug:$slug,take:1,facetValueFilters:[{or:$ids}]}){ totalItems } }",
        {"slug": slug, "ids": ids},
    )["search"]["totalItems"]
    print(f"[facet] 不带过滤={plain} 带过滤={filtered}")
    assert filtered != plain, "带 facetValueFilters 后 totalItems 未变化，服务端过滤可能未生效"
    print("[facet] 服务端过滤生效断言通过")


def check_cart_selection() -> None:
    data = shop_api("{ activeOrder { id lines { id quantity } } }")
    order = data.get("activeOrder")
    if not order:
        print("[cart] 无 activeOrder，跳过（需登录且有购物车）")
        return
    print(f"[cart] activeOrder 行数={len(order['lines'])}（人工核对：勾选 N 行结算时应为 N）")


if __name__ == "__main__":
    print(f"== 探针目标：{SHOP_API_URL} ==")
    check_flash()
    check_group_buy()
    check_facet_filter()
    check_cart_selection()
    print("== 全部断言通过 ==")
```

- [ ] **Step 2: 运行探针并记录结果**

```powershell
cd d:\zhao\vshop
$env:VENDURE_TOKEN="<渠道 token>"
$env:AUTH_TOKEN="<C 端用户 token>"
python web-admin/scripts/_smoke_usemall_align.py
```

Expected：输出以 `== 全部断言通过 ==` 结束。若 `[group-buy]` 断言失败，说明 Task 1 的后端还没部署 → 先按 Task 1 Step 5 部署后端再重跑。

- [ ] **Step 3: 写操作手册**

新建 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/README.md`，内容包含（中文）：

```markdown
# vshop 对齐 usemall 版式 操作手册

## 1. 范围与版本
- 版本/日期、对应 spec 与 plan 路径。

## 2. 涉及页面与入口
- 首页（限时精选楼层）、分类页（双模式 + 双悬浮按钮）、商品详情（SKU 弹层 + 5 键）、
  购物车（勾选真生效 + 未登录态 + 推荐）、结算页（发票 + 备注）、秒杀页、拼团页。
- 每页给出路由路径与进入方式。

## 3. 后台配置说明
- 装修页如何配置「限时精选（秒杀）」楼层（数据来源固定秒杀活动、版式、条数、标题）。
- 渠道模板 `marketplace` 关闭秒杀的表现（楼层不渲染）。

## 4. 手机截图（390×844 / dpr=2）
- 逐页附图，图名与文件一一对应。

## 5. 验收结论
- 探针输出粘贴（含 `== 全部断言通过 ==`）。
- 结算页备注链路实测结论（可用 / 已回退）。
- 已知偏差（引用 spec §9 R1-R8）。

## 6. 部署与回滚
- 本地构建 → 上传 → 服务器解压 + `pm2 restart`（不在服务器构建）。
```

- [ ] **Step 4: 汇总全部截图到手册目录**

确认以下文件都在 `web-admin/docs/superpowers/manual/vshop-usemall-alignment/`：

```
home-flash-floor.png
category-modes.png
detail-sku-sheet.png
cart-select-real.png
cart-guest-and-reco.png
flash-sale-page.png
group-buy-page.png
```

缺哪张补哪张（仍用 390×844 / dpr=2）。

- [ ] **Step 5: 提交**

```powershell
git -C d:\zhao\vshop add web-admin/scripts/_smoke_usemall_align.py web-admin/docs/superpowers/manual/vshop-usemall-alignment
git -C d:\zhao\vshop commit -m "test(vshop): 对齐 usemall 只读探针脚本与逐页手机截图操作手册"
```

---

## Task 19: 本地构建与部署

**Files:**
- 无代码改动。

- [ ] **Step 1: 本地构建全部产物**

```powershell
cd d:\zhao\vshop
npm run build:h5
npm run build:mp-weixin
```

```powershell
cd d:\zhao\vshop\web-admin
npm run build
```

Expected：三者均成功。**绝不在服务器上构建。**

- [ ] **Step 2: 上传并让服务器生效**

按既有 `scripts/deploy.mjs` 流程（scp 产物 → 服务器解压/拷入静态目录 → `pm2 restart` 对应进程）。注意 nshop/web-admin 走 `deploy.mjs`，vendure 后端走 `git pull + pm2 restart`，**不要混用机制**。

- [ ] **Step 3: 线上回归（手机视口）**

清缓存后重开（H5 需带 `?cb=<时间戳>` 冷加载，避免首帧缓存滞后）：

- 首页楼层、分类页两模式、详情页弹层、购物车勾选与推荐、结算页发票与备注、秒杀页、拼团页；
- 逐页 390×844 / dpr=2 重新截图，若与手册中的本地截图不一致，**以线上截图为准**并更新手册。

- [ ] **Step 4: 提交手册更新**

```powershell
git -C d:\zhao\vshop add web-admin/docs/superpowers/manual/vshop-usemall-alignment
git -C d:\zhao\vshop commit -m "docs(manual): 回填线上回归手机截图与验收结论"
```

---

## 附：本计划对 spec 的覆盖核对

| spec 章节 | 落地 Task |
|---|---|
| §4.1 文件清单 | Task 1~17 全覆盖 |
| §4.2 `flash` section 契约 | Task 2（类型/校验）、Task 3（后台） |
| §4.3 渲染与回退 | Task 6（空数据整块不渲染）、Task 7（门控与验证） |
| §5.1 首页（楼层 + BackTop） | Task 4、Task 6、Task 7 |
| §5.2 分类页（模式/分页/facet 迁移/双悬浮） | Task 8、Task 9 |
| §5.3 详情页（SKU 弹层/价格区/元信息行/5 键/`applyFlashSale`） | Task 10、Task 11 |
| §5.4 购物车（勾选真生效/状态标签/未登录/推荐） | Task 12、Task 13、Task 14 |
| §5.5 结算页（发票行/备注行 + 兜底） | Task 17（Step 6 的通过/回退分支） |
| §5.6 秒杀页 / 拼团页（含 D1 修复） | Task 15、Task 16 |
| §6.1 fragment / 查询改动 | Task 5、Task 8、Task 12、Task 16 |
| §6.2 唯一后端改动 | Task 1 |
| §6.3 缺陷 D1/D2/D3 | D1 → Task 16；D2 → Task 8；D3 → Task 9 |
| §7 i18n / 多城市 / 回退 | Task 6、Task 10（词条 5 包）、Task 2（多城市不涉及，图片走 VImage） |
| §8 测试与验收 | Task 18、Task 19 |
| §9 风险 R1-R8 | R1/R2 → Task 13；R3 → Task 17 Step 6；R4 → Task 6；R5 → Task 3（后台只暴露 flashSale）；R6 → Task 11（收藏占位）；R7 → Task 11；R8 → Task 1 |
| §10 纵切 V1-V6 | V1 → Task 2~4；V2 → Task 5~7；V3 → Task 8~9；V4 → Task 10~11；V5 → Task 12~14；V6 → Task 15~17 |
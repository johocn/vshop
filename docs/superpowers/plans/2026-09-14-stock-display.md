# 详情页库存展示（方案 2 子项目 D）实施计划

> **方案标识：方案 2 子项目 D**。**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **前置**：先执行「方案 2-A」计划（本计划消费 `variantStockInfo` 接口与 `physicalStockEnabled`）。
> Spec：`d:\zhao\vshop\docs\superpowers\specs\2026-09-14-product-detail-stock-display-design.md`

**Goal:** 商品详情页库存展示调整：默认只展示虚拟库存数量；仅开启物理库存的租户显示「附近库存」折叠明细（各物理仓 + 距离）。

**Architecture:** nshop 详情页消费方案2-A 新增的 `variantStockInfo` 查询（saleableStock/physicalStockEnabled/stockDetail），新建 `useProductStockInfo` composable 统一数据流；既有 `NearbyStores.vue` 折叠样式复用，数据源切换到 stockDetail，并按 `physicalStockEnabled` 控制显隐；i18n 12 语言包同步新增词条。

**Tech Stack:** Nuxt3（nshop layers/base）、GraphQL、uni-app 无关（nshop 为 Web/Nuxt 前端）。

**关键事实（已探明）**
- 就近库存组件：`d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue` + `app\composables\useNearbyStock.ts` + `app\utils\nearby-stock.ts`；GQL `VariantNearbyStock` 在 `layers/base/gql/queries/product.gql:62-93`；i18n 键 `messages.detail.nearbyTitle/nearbySummary/nearbyStoresCount/nearbyUnknownDistance` 等。
- 库存徽章：`components/product-detail/DetailClassic.vue` 的 `stockLevel`（IN_STOCK/LOW_STOCK），来自 `useProductStore().stockLevel`。
- 12 个语言包目录：`layers/base/i18n/locales/`（zh-CN.ts、en-US.ts 等）。

---

## Task D1: variantStockInfo 前端数据层（GQL + composable）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\product.gql`（追加 VariantStockInfo）
- Create: `d:\zhao\nshop\layers\base\app\composables\useProductStockInfo.ts`

- [ ] **Step 1: GQL 追加**

`product.gql` 末尾追加：

```graphql
query VariantStockInfo($variantId: ID!, $lat: Float, $lng: Float) {
    variantStockInfo(variantId: $variantId, lat: $lat, lng: $lng) {
        variantId
        saleableStock
        physicalStockEnabled
        stockDetail {
            locationId
            name
            lat
            lng
            onHand
            distanceKm
        }
    }
}
```

- [ ] **Step 2: composable**

```ts
import { useNuxtApp } from '#app';
import { useProductStore } from '../stores/useProductStore';
import type { VariantStockInfoQuery, VariantStockInfoQueryVariables } from '#gql';

export interface StockInfo {
    saleableStock: number;
    physicalStockEnabled: boolean;
    stockDetail: Array<{
        locationId: string;
        name: string;
        lat: number | null;
        lng: number | null;
        onHand: number;
        distanceKm: number | null;
    }>;
}

export function useProductStockInfo() {
    const { $graphql } = useNuxtApp();
    const productStore = useProductStore();
    const loading = ref(false);
    const info = ref<StockInfo | null>(null);

    async function refresh(variantId: string, lat?: number | null, lng?: number | null) {
        loading.value = true;
        try {
            const data = await $graphql<VariantStockInfoQuery, VariantStockInfoQueryVariables>({
                query: 'VariantStockInfo',
                variables: { variantId, lat: lat ?? null, lng: lng ?? null },
            });
            info.value = (data as any).variantStockInfo ?? null;
        } finally {
            loading.value = false;
        }
    }

    return {
        loading: readonly(loading),
        info: readonly(info),
        refresh,
    };
}
```

> 注：nshop 的 GraphQL 调用方式（`$graphql` 或 `useAsyncQuery`）以 `useNearbyStock.ts` 既有写法为准；类型 `VariantStockInfoQuery` 由 codegen 生成，若未生成则用 `any` 过渡并在生成后收紧。

- [ ] **Step 3: 提交**

```bash
git add layers/base/gql/queries/product.gql layers/base/app/composables/useProductStockInfo.ts
git commit -m "feat(nshop): variantStockInfo 数据层（GQL+composable）"
```

## Task D2: 详情页库存块改造（默认虚拟数 + 附近库存开关）

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue`
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailClassic.vue`（库存徽章区）

- [ ] **Step 1: NearbyStores 数据源切换 + 开关**

`NearbyStores.vue` 改造（props 由「原始 nearby 数据」改为「stockInfo 数据」；折叠交互保留）：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNearbyDistance } from '../utils/nearby-stock';

const props = defineProps<{
    stockDetail: Array<{
        locationId: string;
        name: string;
        lat: number | null;
        lng: number | null;
        onHand: number;
        distanceKm: number | null;
    }>;
}>();

const { t } = useI18n();
const expanded = ref(false);
const stores = computed(() => props.stockDetail ?? []);
const summary = computed(() => {
    const count = stores.value.length;
    return t('messages.detail.nearbySummary', { count });
});
</script>

<template>
  <view v-if="stores.length" class="nearby">
    <view class="summary" @tap="expanded = !expanded">
      <text>{{ summary }}</text>
      <text class="arrow">{{ expanded ? '▾' : '▸' }}</text>
    </view>
    <view v-show="expanded" class="list">
      <view v-for="s in stores" :key="s.locationId" class="store">
        <view class="info">
          <text class="name">{{ s.name }}</text>
          <text class="qty">库存 {{ s.onHand }} 件</text>
        </view>
        <text class="dist">
          {{ s.distanceKm == null ? t('messages.detail.nearbyUnknownDistance') : formatNearbyDistance(s.distanceKm) }}
        </text>
      </view>
    </view>
  </view>
</template>
```

（`nearbySummary` 词条如带占位符 `{count}` 则按原词条格式调整；保留原样式类名 `nearby/summary/list/store`）

- [ ] **Step 2: DetailClassic 库存区**

在 `DetailClassic.vue` 使用 `useProductStockInfo`：挂载时以当前 variantId 与客户定位（或租户默认坐标）刷新；库存徽章区改造：

```vue
<script setup lang="ts">
import { useProductStockInfo } from '../../composables/useProductStockInfo';
// ... 既有 setup
const stockInfo = useProductStockInfo();
onMounted(async () => {
    const variantId = productStore.selectedVariant?.id;
    if (variantId) {
        await stockInfo.refresh(variantId);
    }
});
</script>

<template>
  <!-- 库存区：默认虚拟数；物理租户+物理驱动变体才显示附近库存 -->
  <view class="stock-line">
    <text class="label">{{ t('messages.detail.stockCount') }}</text>
    <text class="val" :class="{ out: !inStock }">
      {{ inStock ? `${stockInfo.info?.saleableStock ?? 0} 件` : t('messages.detail.outOfStock') }}
    </text>
  </view>
  <NearbyStores
    v-if="stockInfo.info?.physicalStockEnabled && stockInfo.info.stockDetail?.length"
    :stock-detail="stockInfo.info.stockDetail"
  />
</template>
```

> 说明：`inStock`（stockLevel 徽章）与 `saleableStock` 并存——徽章保留（IN_STOCK/LOW_STOCK），新增数量行；`messages.detail.stockCount` 为新词条（D3 补）。变体切换（swatch）时重新 `refresh`。

- [ ] **Step 3: 提交**

```bash
git add layers/base/app/components/product/NearbyStores.vue layers/base/app/components/product-detail/DetailClassic.vue
git commit -m "feat(nshop): 详情页库存展示（虚拟数默认+附近库存开关）"
```

## Task D3: i18n 12 语言包同步

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\*.ts`（12 个语言包）

- [ ] **Step 1: 逐语言包追加词条**

在 `messages.detail` 下新增（所有语言包统一键名）：

```ts
        stockCount: '库存',       // 各语言对应翻译
```

各语言翻译：
- zh-CN：`库存`；en-US：`Stock`；其余语言包（ja-JP/ko-KR/ru-RU/vi-VN/th-TH/id-ID/ms-MY/zh-TW/ar-SA/fr-FR/es-ES 等以仓库实际存在的 12 个为准）按各自翻译补充（ja：`在庫`、ko：`재고`、ru：`Наличие`、vi：`Tồn kho`、th：`สต็อก`、id：`Stok`、ms：`Stok`、zh-TW：`庫存`、ar：`المخزون`、fr：`Stock`、es：`Stock`）。

> 若 `messages.detail` 已有 `nearbySummary` 等词条保留不动；仅新增 `stockCount`。

- [ ] **Step 2: 构建 + 提交**

Run: `npm run build`（工作目录 `d:\zhao\nshop`）
Expected: 构建成功

```bash
git add layers/base/i18n/locales
git commit -m "feat(nshop): i18n 库存数量词条 ×12 语言包"
```

## Task D4: 构建部署 + 手机视口回归

**Files:**
- 无新文件

- [x] **Step 1: nshop 构建 + 部署**

Run: `npm run build`（工作目录 `d:\zhao\nshop`）→ 按仓库既有部署脚本上线（`scripts/deploy.*` 或人工 scp，遵循部署铁律：本地构建）

- [x] **Step 2: 手机视口回归**

用 webapp-testing/Playwright（390×844）对开启物理库存的租户商品详情页截图：库存数量行 + 附近库存折叠（展开态），及未开启租户详情页（无附近库存行）。截图存 nshop 手册目录（按既有手册约定路径）。

- [x] **Step 3: 手册补充**

操作手册新增 op-20「详情页库存展示」：默认虚拟库存、物理租户附近库存折叠说明 + 截图。

- [x] **Step 4: 提交**

```bash
git add docs layers/base/i18n/locales
git commit -m "docs: op-20 详情页库存展示 + 回归截图"
```

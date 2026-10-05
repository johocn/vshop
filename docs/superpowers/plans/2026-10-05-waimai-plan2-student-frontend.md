# Waimai Plan 2/3 — 学生端前端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建独立 uniapp 项目 `e:\zhao\waimai`（H5），复制 vshop 交易底座，新写美团式店铺列表/菜单/校园配送结算/订单跟踪四页，打通「店铺列表→菜单→点单→结算→支付」学生端全链路。

**Architecture:** 独立项目照搬 vshop 构建配置（uni-app + vue3 + vite5 + pinia + graphql-request）。渠道即店铺：首页经 `waimaiStoreList` 跨渠道聚合店铺卡；进店铺用 `switchTenant(channelToken)` 切渠道（vendure session 的 activeOrder 随渠道隔离，天然实现「每店独立购物车」）；结算校园配送 Tab 经 `campusSetDeliveryTarget(zoneId, buildingId, route, slotId)` 一次写入路线+楼层+时段（Plan 1 Task 6）；订单跟踪轮询 `order.customFields.hallStatus` + `campusOrderRider`。主题走 `--brand` token（默认 #ff6600）+ `VITE_BRAND_COLOR` 运行时覆盖。

**Tech Stack:** uni-app 3（H5 先行，manifest 预留 mp-weixin）/ Vue3 / pinia / graphql-request / sass / vitest（纯逻辑层）/ Playwright 390×844 dpr=2 截图。

**规范（执行前必读）：**
- 前端新页面**写死中文**（checkout.vue/live-room.vue 同例）；禁硬编码 API 域名/渠道/主题色，走 env + token
- 复制源文件保持原样、目标文件名与 vshop 一致，便于日后 diff 同步；复制清单见 Task 2
- waimai 仓库：`git init`，本地 master，无 remote（qijinqichu 模式）；`.gitignore` 照抄 vshop（node_modules/dist/unpackage/.env.local）
- 部署形态：H5 `base=/waimai/`（Task 1 配置）；本计划不部署（Plan 3 收口统一部署）
- 支付链路风险：店铺渠道的 wechatpay 配置走租户级优先/全站级回落（wechatpay-handler L74-81），联调时验证；JSAPI 授权目录 `/waimai/` 待用户在商户平台追加（不阻塞开发，验收用模拟支付路径）
- 前置：Plan 1（含 Task 6）已部署——`waimaiStoreList`/`campusSetDeliveryTarget(route,slotId)`/`campusOrderRider` 可用

---

### Task 1: 项目初始化 + 构建配置

**Files:**
- Create: `e:\zhao\waimai\package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`.gitignore`、`.env.development`、`.env.production`
- Create: `src/manifest.json`、`src/pages.json`、`src/uni.scss`、`src/App.vue`、`src/main.ts`、`src/shime-uni.d.ts`、`src/shims-vue.d.ts`

- [ ] **Step 1: 建目录与 git init**

```bash
mkdir e:\zhao\waimai && cd e:\zhao\waimai && git init
```

- [ ] **Step 2: package.json**（从 vshop 复制后改造：name=waimai，去 vue-i18n/hls.js/socket.io-client/html-to-image/mp-html/qrcode 等本模板不用的依赖，保留下列最小集）

```json
{
    "name": "waimai",
    "version": "1.0.0",
    "description": "Campus Waimai Storefront (uniapp template)",
    "private": true,
    "type": "module",
    "scripts": {
        "dev:h5": "uni",
        "build:h5": "uni build"
    },
    "dependencies": {
        "@dcloudio/uni-app": "3.0.0-4060620250520001",
        "@dcloudio/uni-app-harmony": "3.0.0-4060620250520001",
        "@dcloudio/uni-components": "3.0.0-4060620250520001",
        "@dcloudio/uni-h5": "3.0.0-4060620250520001",
        "@dcloudio/uni-mp-weixin": "3.0.0-4060620250520001",
        "graphql": "^16.11.0",
        "graphql-request": "^7.2.0",
        "graphql-tag": "^2.12.6",
        "pinia": "^3.0.2",
        "vue": "^3.5.13"
    },
    "devDependencies": {
        "@dcloudio/types": "^3.4.14",
        "@dcloudio/uni-automator": "3.0.0-4060620250520001",
        "@dcloudio/uni-cli-shared": "3.0.0-4060620250520001",
        "@dcloudio/uni-stacktracey": "3.0.0-4060620250520001",
        "@dcloudio/vite-plugin-uni": "3.0.0-4060620250520001",
        "sass": "^1.89.0",
        "typescript": "~5.8.3",
        "vite": "^5.4.21",
        "vitest": "^3.1.4"
    }
}
```

- [ ] **Step 3: vite.config.ts**（复制 vshop 版，改端口 5181，dev 代理同款）

```ts
import { defineConfig, loadEnv } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

const uni = typeof uniPlugin === 'function' ? uniPlugin : (uniPlugin as any)?.default;

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [uni()],
        server: {
            port: 5181,
            strictPort: true,
            host: '0.0.0.0',
            proxy: {
                '/shop-api': {
                    target: env.VITE_API_PROXY || env.VITE_API_URL || 'http://localhost:3020',
                    changeOrigin: true,
                },
            },
        },
    };
});
```

- [ ] **Step 4: manifest.json**（复制 vshop 版后：name/description 改 waimai，`h5` 段新增——vshop 无 h5 段）

在 `uniStatistics` 前插入：

```json
    "h5": {
        "title": "校园外卖",
        "router": {
            "mode": "hash",
            "base": "/waimai/"
        }
    },
```

- [ ] **Step 5: pages.json**（tabBar 三页 + 分包声明；一期纯文字 tabBar 不配图标，H5 渲染正常）

```json
{
    "pages": [
        { "path": "pages/home/index", "style": { "navigationBarTitleText": "校园外卖", "navigationStyle": "custom" } },
        { "path": "pages/orders/index", "style": { "navigationBarTitleText": "订单" } },
        { "path": "pages/profile/index", "style": { "navigationBarTitleText": "我的" } },
        { "path": "pages/shop/menu", "style": { "navigationBarTitleText": "店铺" } },
        { "path": "pages/login/index", "style": { "navigationBarTitleText": "登录" } },
        { "path": "pages/webview/index", "style": { "navigationBarTitleText": "支付", "navigationStyle": "custom" } }
    ],
    "subPackages": [
        {
            "root": "pkg-order",
            "pages": [
                { "path": "pages/checkout", "style": { "navigationBarTitleText": "确认订单" } },
                { "path": "pages/order-detail", "style": { "navigationBarTitleText": "订单跟踪" } },
                { "path": "pages/pay-result", "style": { "navigationBarTitleText": "支付结果" } }
            ]
        },
        {
            "root": "pkg-rider",
            "pages": [
                { "path": "pages/rider-join", "style": { "navigationBarTitleText": "骑手入驻" } },
                { "path": "pages/rider-home", "style": { "navigationBarTitleText": "接单大厅" } },
                { "path": "pages/rider-delivering", "style": { "navigationBarTitleText": "配送中" } },
                { "path": "pages/rider-earning", "style": { "navigationBarTitleText": "我的收入" } }
            ]
        }
    ],
    "tabBar": {
        "color": "#999999",
        "selectedColor": "#ff6600",
        "backgroundColor": "#ffffff",
        "borderStyle": "black",
        "list": [
            { "pagePath": "pages/home/index", "text": "首页" },
            { "pagePath": "pages/orders/index", "text": "订单" },
            { "pagePath": "pages/profile/index", "text": "我的" }
        ]
    },
    "globalStyle": {
        "navigationBarTextStyle": "black",
        "navigationBarTitleText": "校园外卖",
        "navigationBarBackgroundColor": "#ffffff",
        "backgroundColor": "#f5f5f5"
    }
}
```

- [ ] **Step 6: env 文件**

```bash
# .env.development
VITE_API_URL=http://localhost:5181
VITE_API_PROXY=http://e.joho.cn
VITE_BRAND_COLOR=#ff6600
VITE_CHANNEL_TOKEN=default-channel
VITE_SITE_TITLE=校园外卖

# .env.production
VITE_API_URL=
VITE_BRAND_COLOR=#ff6600
VITE_CHANNEL_TOKEN=default-channel
VITE_SITE_TITLE=校园外卖
```

> 生产 `VITE_API_URL` 留空 = 同源（client.ts 拼出 `/shop-api`）；本地走 5181 代理。

- [ ] **Step 7: tsconfig.json / index.html / shims / .gitignore / uni.scss**——从 vshop 根目录逐个复制，仅改 tsconfig 的 include 无需变化、`.gitignore` 追加一行 `/.env.local`。`src/uni.scss` 替换为 waimai 版（见 Task 3）。

- [ ] **Step 8: main.ts + App.vue（最小骨架，Task 3 完善）**

```ts
// src/main.ts
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

export function createApp() {
    const app = createSSRApp(App);
    app.use(createPinia());
    return { app };
}
```

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useTenantStore } from './stores/tenant';
import { openTenantGate } from './api/client';

onLaunch(async () => {
    // 品牌色运行时注入（一处换肤）
    const brand = (import.meta.env.VITE_BRAND_COLOR as string) || '#ff6600';
    document.documentElement.style.setProperty('--brand', brand);
    const tenant = useTenantStore();
    try {
        await tenant.initTenant();
    } finally {
        openTenantGate();
    }
});
</script>
<style>
:root {
    --brand: #ff6600;
    --brand-soft: #fff3e6;
}
page { background: #f5f5f5; }
</style>
```

> 注意：App.vue 引用了 stores/tenant 与 api/client——先从 Task 2 复制后本文件才可编译；两 Task 同分支连续执行即可。

- [ ] **Step 9: pnpm install 确认依赖可解析**

Run: `cd e:\zhao\waimai && pnpm install`
Expected: 安装成功无 404

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: waimai 项目初始化（uniapp+vite 构建配置/tabBar/env/主题骨架）"
```

---

### Task 2: 交易底座复制（vshop → waimai）

**Files:** 复制 `e:\zhao\vshop\src\` 下文件到 `e:\zhao\waimai\src\` 同路径；Create: `src/api/queries/waimai.ts`、`src/api/mutations/campus.ts`

- [ ] **Step 1: 按清单复制（保持相对路径不变）**

```bash
# api 层
cp src/api/client.ts            → waimai/src/api/client.ts
cp src/api/fragments.ts         → waimai/src/api/fragments.ts
cp src/api/mutations/auth.ts    → waimai/src/api/mutations/auth.ts
cp src/api/mutations/cart.ts    → waimai/src/api/mutations/cart.ts
cp src/api/mutations/checkout.ts → waimai/src/api/mutations/checkout.ts
cp src/api/mutations/upload.ts  → waimai/src/api/mutations/upload.ts
cp src/api/queries/product.ts   → waimai/src/api/queries/product.ts
cp src/api/queries/order.ts     → waimai/src/api/queries/order.ts
cp src/api/queries/user.ts      → waimai/src/api/queries/user.ts
# stores
cp src/stores/auth.ts   → waimai/src/stores/auth.ts
cp src/stores/tenant.ts → waimai/src/stores/tenant.ts
cp src/stores/cart.ts   → waimai/src/stores/cart.ts
# 通用组件
cp src/components/VImage.vue EmptyState.vue LoadingSkeleton.vue SkuSheet.vue SearchBar.vue PriceTag.vue ImageUpload.vue → waimai/src/components/
# 页面
cp src/pages/login/index.vue  → waimai/src/pages/login/index.vue
cp src/pages/webview/index.vue → waimai/src/pages/webview/index.vue
cp src/pkg-order/pages/checkout.vue → waimai/src/pkg-order/pages/checkout.vue   # Task 6 改造
cp src/pkg-order/pages/order-detail.vue → waimai/src/pkg-order/pages/order-detail.vue  # Task 7 改造
cp src/pkg-order/pages/pay-result.vue → waimai/src/pkg-order/pages/pay-result.vue
cp src/pkg-order/pages/orders.vue → waimai/src/pages/orders/index.vue           # 移入 tab 页（Task 8 改造）
cp src/pages/profile/index.vue → waimai/src/pages/profile/index.vue             # Task 8 改造
```

- [ ] **Step 2: 复制后清理改造（每文件过一遍）**

1. 所有复制文件中删除 i18n 引用（`useI18n`/`$t(...)`→写字面中文）；grep `i18n\|useI18n\|\$t\(` 逐个清理
2. `stores/tenant.ts`：`resolveTenantFromUrl`/`resolveTenantByDomain` 保留但增加 env 兜底——`initTenant()` 内域名解析失败时回落 `VITE_CHANNEL_TOKEN`（改动点：`initTenant` 函数尾部 resolve 失败分支追加 `code = (import.meta.env.VITE_CHANNEL_TOKEN as string) || code`）
3. `api/queries/order.ts`、`checkout.vue` 等引用了不存在模块的 import 逐个移除（以 tsc/vite 报错为准迭代到编译通过）
4. 复制 `src/pages.json` 里被引用但未复制的页面条目（如购物车跳转）从目标 pages.json 中**不加入**；页面间跳转 `uni.navigateTo` 目标不存在的，改为 toast「暂未开放」——以运行时冒烟为准逐个清

- [ ] **Step 3: 新增 waimai 专属 API**

```ts
// src/api/queries/waimai.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

export const WAIMAI_STORE_LIST = gql`
    query waimaiStoreList {
        waimaiStoreList {
            channelId channelToken name logo tags monthlySales promoText paused routesEnabled
        }
    }
`;

export async function fetchStoreList(): Promise<any[]> {
    const res = await getGraphQLClient().request(WAIMAI_STORE_LIST);
    return res.waimaiStoreList ?? [];
}
```

```ts
// src/api/mutations/campus.ts
import gql from 'graphql-tag';
import { getGraphQLClient } from '../client';

export const CAMPUS_SET_DELIVERY_TARGET = gql`
    mutation campusSetDeliveryTarget($zoneId: ID!, $buildingId: ID!, $route: String, $slotId: Int) {
        campusSetDeliveryTarget(zoneId: $zoneId, buildingId: $buildingId, route: $route, slotId: $slotId) {
            id
            customFields { buildingId campusZone fulfillmentRoute deliverySlotId deliverySlotText }
        }
    }
`;

export const CAMPUS_ZONES = gql`
    query campusZones { campusZones { id name } }
`;

export const CAMPUS_BUILDINGS = gql`
    query campusBuildings($zoneId: ID) { campusBuildings(zoneId: $zoneId) { id name zoneId } }
`;

export const CAMPUS_SHOP_SLOTS = gql`
    query campusShopSlots { campusShopSlots { id slotDate startTime endTime remaining } }
`;

export const CAMPUS_ORDER_RIDER = gql`
    query campusOrderRider($orderId: ID!) { campusOrderRider(orderId: $orderId) { realName credit } }
`;

export function setDeliveryTarget(v: { zoneId: string; buildingId: string; route?: string; slotId?: number }) {
    return getGraphQLClient().request(CAMPUS_SET_DELIVERY_TARGET, v);
}
export function fetchZones() { return getGraphQLClient().request(CAMPUS_ZONES).then(r => r.campusZones ?? []); }
export function fetchBuildings(zoneId?: string) { return getGraphQLClient().request(CAMPUS_BUILDINGS, { zoneId }).then(r => r.campusBuildings ?? []); }
export function fetchSlots() { return getGraphQLClient().request(CAMPUS_SHOP_SLOTS).then(r => r.campusShopSlots ?? []); }
export function fetchOrderRider(orderId: string) { return getGraphQLClient().request(CAMPUS_ORDER_RIDER, { orderId }).then(r => r.campusOrderRider); }
```

> 字段名对照（以插件 schema 为准，执行时 grep `campus-delivery.plugin.ts` 校验）：CampusZone/CampusBuilding 的展示字段名、DeliverySlot 的 shop schema 类型名（`campusShopSlots` 返回元素字段 id/slotDate/startTime/endTime/remaining）若与上面 gql 不符，**以 schema 实际为准改 gql**，函数签名不变。

- [ ] **Step 4: 编译通过**

Run: `cd e:\zhao\waimai && pnpm dev:h5`（起 dev 后 Ctrl+C）
Expected: 无模块解析错误（样式/运行时问题后续 Task 处理）

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 复制 vshop 交易底座 + waimai 专属 API 层（清理 i18n/未用依赖）"
```

---

### Task 3: 主题 token 落地

**Files:**
- Modify: `src/uni.scss`（覆盖为 waimai 版）
- Modify: `src/App.vue`（Task 1 已含注入，确认即可）

- [ ] **Step 1: uni.scss**

```scss
// waimai 主题 token：全部组件只引用变量，一处换肤（spec §12.1）
$brand: var(--brand, #ff6600);
$brand-soft: var(--brand-soft, #fff3e6);
$text: #1a1a1a;
$text-muted: #999999;
$bg: #f5f5f5;
$surface: #ffffff;
$radius: 12rpx;
$radius-card: 16rpx;
```

- [ ] **Step 2: 冒烟验证换肤**

Run: `cd e:\zhao\waimai && pnpm dev:h5`，浏览器开 `http://localhost:5181/waimai/`，改 `.env.development` 的 `VITE_BRAND_COLOR=#00b578` 重启，tabBar 选中色与页面主色变绿，改回 `#ff6600`
Expected: 两轮颜色切换生效（tabBar selectedColor 是静态配置不跟随 env——H5 tabBar 颜色一期固定橙可接受，页面内主色必须跟随）

- [ ] **Step 3: Commit**

```bash
git add src/uni.scss && git commit -m "feat: 主题 token（--brand #ff6600 + VITE_BRAND_COLOR 运行时覆盖）"
```

---

### Task 4: 首页·店铺列表（搜索 + 分类 pills + 店铺卡）

**Files:**
- Create: `src/pages/home/index.vue`
- Test: `src/utils/store-filter.ts` + `tests/store-filter.spec.ts`

- [ ] **Step 1: 写失败测试（过滤纯逻辑先行）**

```ts
// tests/store-filter.spec.ts
import { describe, expect, it } from 'vitest';
import { filterStores } from '../src/utils/store-filter';

const stores = [
    { name: '张记麻辣香锅', tags: ['米饭快餐', '夜宵'] },
    { name: '茶百道·校园店', tags: ['奶茶甜品'] },
    { name: '兰州拉面', tags: [] },
];

describe('filterStores', () => {
    it('关键词不区分大小写过滤店名', () => {
        expect(filterStores(stores, '茶百')).toHaveLength(1);
        expect(filterStores(stores, 'CBS')).toHaveLength(1);   // 拼音不要求，大小写即可
        expect(filterStores(stores, 'ZJ')).toHaveLength(1);
    });
    it('tag 匹配：点「奶茶甜品」只出茶百道', () => {
        expect(filterStores(stores, '', '奶茶甜品')).toHaveLength(1);
    });
    it('「全部」或未配置 tag 的店铺归入全部', () => {
        expect(filterStores(stores, '', '')).toHaveLength(3);
        expect(filterStores(stores, '', '米饭快餐')).toHaveLength(1);
    });
    it('搜索优先于分类（同时给按时搜索生效）', () => {
        expect(filterStores(stores, '茶百', '米饭快餐')).toHaveLength(1);
    });
});
```

Run: `cd e:\zhao\waimai && npx vitest run tests/store-filter.spec.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 2: 实现 store-filter.ts**

```ts
// src/utils/store-filter.ts
export interface StoreLike { name: string; tags: string[] }

/** spec §12.2：搜索（店名包含、不分大小写）优先于分类 pills；未配置 tag 的店铺归入「全部」 */
export function filterStores(list: StoreLike[], keyword: string, tag: string): StoreLike[] {
    let out = list;
    const kw = keyword.trim().toLowerCase();
    if (kw) {
        out = out.filter(s => s.name.toLowerCase().includes(kw));
        return out;
    }
    if (tag && tag !== '全部') {
        out = out.filter(s => s.tags.includes(tag));
    }
    return out;
}
```

Run: `npx vitest run tests/store-filter.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: 首页页面**

```vue
<!-- src/pages/home/index.vue -->
<template>
    <view class="page">
        <view class="head">
            <text class="loc">📍 东门校内站</text>
            <input class="search" v-model="keyword" placeholder="搜索店铺：麻辣香锅 / 奶茶" confirm-type="search" />
        </view>
        <scroll-view scroll-x class="pills" v-if="!keyword">
            <view
                v-for="t in tagList" :key="t"
                class="pill" :class="{ on: t === activeTag }"
                @tap="activeTag = t"
            >{{ t }}</view>
        </scroll-view>
        <LoadingSkeleton v-if="loading" />
        <EmptyState v-else-if="!shown.length" text="没有找到相关店铺" />
        <view v-else class="cards">
            <view v-for="s in shown" :key="s.channelId" class="card" @tap="enterStore(s)">
                <image v-if="s.logo" class="logo" :src="s.logo" mode="aspectFill" />
                <view v-else class="logo logo-text">{{ s.name.slice(0, 1) }}</view>
                <view class="info">
                    <view class="name-row">
                        <text class="name">{{ s.name }}</text>
                        <text v-if="s.paused" class="paused">休息中</text>
                    </view>
                    <text class="meta">月售 {{ s.monthlySales }}</text>
                    <text class="meta">{{ routeText(s.routesEnabled) }}</text>
                    <text v-if="s.promoText" class="promo">{{ s.promoText }}</text>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchStoreList } from '../../api/queries/waimai';
import { filterStores } from '../../utils/store-filter';

const TAGS = ['全部', '米饭快餐', '奶茶甜品', '面食', '夜宵'];
const keyword = ref('');
const activeTag = ref('全部');
const loading = ref(true);
const stores = ref<any[]>([]);

const tagList = computed(() => {
    // 店铺未配置 tag 时不出现空类目：固定类目里只保留有店铺的
    const used = new Set(stores.value.flatMap(s => s.tags ?? []));
    return TAGS.filter(t => t === '全部' || used.has(t));
});
const shown = computed(() => filterStores(stores.value, keyword.value, activeTag.value));

function routeText(routes: string[]): string {
    if (!routes?.length) return '暂未开通配送';
    return routes.includes('R1') ? '商家自送 + 校内骑手接力' : '档口直送 · 校内骑手上楼';
}

async function load() {
    loading.value = true;
    try { stores.value = await fetchStoreList(); } finally { loading.value = false; }
}

function enterStore(s: any) {
    if (s.paused) return uni.showToast({ title: '店铺休息中', icon: 'none' });
    uni.navigateTo({ url: `/pages/shop/menu?token=${s.channelToken}&name=${encodeURIComponent(s.name)}` });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
</script>

<style scoped lang="scss">
.page { padding-bottom: 24rpx; }
.head { padding: 24rpx; background: $brand; }
.loc { color: #fff; font-size: 26rpx; font-weight: 600; display: block; margin-bottom: 16rpx; }
.search { background: #fff; border-radius: 999rpx; padding: 12rpx 24rpx; font-size: 26rpx; }
.pills { white-space: nowrap; padding: 16rpx 24rpx; background: $surface; }
.pill { display: inline-block; padding: 6rpx 24rpx; margin-right: 16rpx; border-radius: 999rpx; font-size: 24rpx; color: $text-muted; background: $bg; }
.pill.on { background: $brand; color: #fff; }
.cards { padding: 16rpx 24rpx; display: flex; flex-direction: column; gap: 16rpx; }
.card { display: flex; gap: 20rpx; background: $surface; border-radius: $radius-card; padding: 24rpx; }
.logo { width: 120rpx; height: 120rpx; border-radius: $radius; flex-shrink: 0; }
.logo-text { background: $brand-soft; color: $brand; font-size: 48rpx; text-align: center; line-height: 120rpx; }
.info { flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 12rpx; }
.name { font-size: 30rpx; font-weight: 600; color: $text; }
.paused { font-size: 20rpx; color: #999; border: 1rpx solid #ddd; border-radius: 6rpx; padding: 0 8rpx; }
.meta { display: block; font-size: 24rpx; color: $text-muted; margin-top: 6rpx; }
.promo { display: inline-block; margin-top: 10rpx; font-size: 20rpx; color: $brand; background: $brand-soft; border-radius: 6rpx; padding: 2rpx 12rpx; }
</style>
```

> `pages.json` 首页条目加 `"enablePullDownRefresh": true`。

- [ ] **Step 4: 手机视口目检**

Run: `cd e:\zhao\waimai && pnpm dev:h5`
用 Playwright 打开 `http://localhost:5181/waimai/`，视口 390×844 dpr=2，截图 `docs/screenshots/plan2/2-4-home.png`（后端 waimaiStoreList 有数据时为真实店铺；无数据时允许空态截图，数据准备在 Plan 3 Task 5 冒烟前完成）
Expected: 头部橙底 + 搜索框 + pills + 店铺卡渲染无错位；搜索「茶」过滤生效

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(home): 店铺列表（搜索过滤+分类 pills+店铺卡+暂停态）"
```

---

### Task 5: 店铺菜单页（切渠道 + 分类栏 + 购物车常驻条）

**Files:**
- Create: `src/pages/shop/menu.vue`

- [ ] **Step 1: 页面实现**

```vue
<!-- src/pages/shop/menu.vue -->
<template>
    <view class="menu-page">
        <view class="notice" v-if="promoText">{{ promoText }}</view>
        <view class="body">
            <scroll-view scroll-y class="cats">
                <view v-for="c in cats" :key="c.id" class="cat" :class="{ on: c.id === activeCat }" @tap="activeCat = c.id">
                    {{ c.name }}
                </view>
            </scroll-view>
            <scroll-view scroll-y class="goods">
                <view v-for="g in goodsOf(activeCat)" :key="g.id" class="good" @tap="pickSku(g)">
                    <VImage :src="g.featuredAsset?.preview" class="good-img" />
                    <view class="good-info">
                        <text class="good-name">{{ g.name }}</text>
                        <text class="good-desc">{{ g.description }}</text>
                        <PriceTag :price="g.variants[0]?.price / 100" />
                    </view>
                    <view class="add-btn" @tap.stop="addToCart(g)">+</view>
                </view>
                <EmptyState v-if="!goodsOf(activeCat).length" text="该分类暂无商品" />
            </scroll-view>
        </view>
        <view class="cart-bar" @tap="goCheckout">
            <view class="cart-count" v-if="cartCount">{{ cartCount }}</view>
            <text class="cart-total">合计 ¥{{ (cartTotal / 100).toFixed(2) }}</text>
            <view class="checkout-btn" :class="{ disabled: !cartCount }">去结算</view>
        </view>
        <SkuSheet v-if="skuOpen" :product="skuProduct" @close="skuOpen = false" @confirm="addToCartVariant" />
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useTenantStore } from '../../stores/tenant';
import { useCartStore } from '../../stores/cart';
import { fetchProductList } from '../../api/queries/product';

const tenant = useTenantStore();
const cart = useCartStore();
const shopToken = ref('');
const promoText = ref('');
const cats = ref([{ id: 'all', name: '全部' }]);
const activeCat = ref('all');
const products = ref<any[]>([]);
const skuOpen = ref(false);
const skuProduct = ref<any>(null);

const cartCount = computed(() => cart.count);
const cartTotal = computed(() => cart.total);

onLoad(async (q: any) => {
    shopToken.value = q?.token ?? '';
    promoText.value = decodeURIComponent(q?.promo ?? '');
    // 关键：切到店铺渠道（activeOrder 随 session+渠道隔离 = 每店独立购物车）
    await tenant.switchTenant(shopToken.value);
    products.value = await fetchProductList();
    cats.value = buildCats(products.value);
});

function buildCats(list: any[]) {
    const map = new Map<string, string>();
    list.forEach(p => {
        const name = p.collections?.find((c: any) => c.parent?.name === '__root_collection__')?.name
            || p.collections?.[0]?.name || '全部';
        if (!map.has(name)) map.set(String(map.size), name);
    });
    // 简化：以 collection 名分组，id 用名字本身
    return [{ id: 'all', name: '全部' }, ...[...new Set([...map.values()])].map(n => ({ id: n, name: n }))];
}

function goodsOf(catId: string) {
    if (catId === 'all') return products.value;
    return products.value.filter(p => p.collections?.some((c: any) => c.name === catId));
}

function pickSku(g: any) {
    if ((g.variants?.length ?? 0) > 1) { skuProduct.value = g; skuOpen.value = true; }
    else addToCart(g);
}

async function addToCart(g: any) {
    await cart.addItem(g.variants[0].id, 1);
    uni.showToast({ title: '已加购', icon: 'none' });
}
async function addToCartVariant(v: { variantId: string; qty: number }) {
    await cart.addItem(v.variantId, v.qty);
    skuOpen.value = false;
}
function goCheckout() {
    if (!cartCount.value) return;
    uni.navigateTo({ url: '/pkg-order/pages/checkout' });
}

onMounted(() => { /* 心跳/在线等骑手逻辑不在此页 */ });
</script>

<style scoped lang="scss">
.menu-page { display: flex; flex-direction: column; height: 100vh; }
.notice { background: $brand-soft; color: $brand; font-size: 24rpx; padding: 12rpx 24rpx; }
.body { flex: 1; display: flex; overflow: hidden; }
.cats { width: 176rpx; background: $bg; }
.cat { padding: 28rpx 16rpx; font-size: 26rpx; color: $text-muted; }
.cat.on { background: $surface; color: $text; font-weight: 600; border-left: 6rpx solid $brand; }
.goods { flex: 1; background: $surface; padding: 16rpx; box-sizing: border-box; }
.good { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f0f0f0; position: relative; }
.good-img { width: 140rpx; height: 140rpx; border-radius: $radius; flex-shrink: 0; background: $bg; }
.good-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.good-name { font-size: 28rpx; font-weight: 600; color: $text; }
.good-desc { font-size: 22rpx; color: $text-muted; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add-btn { position: absolute; right: 8rpx; bottom: 16rpx; width: 56rpx; height: 56rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 36rpx; text-align: center; line-height: 52rpx; }
.cart-bar { display: flex; align-items: center; background: $surface; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); box-shadow: 0 -4rpx 16rpx rgba(0,0,0,.06); position: relative; }
.cart-count { position: absolute; left: 12rpx; top: -10rpx; min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: $brand; color: #fff; font-size: 22rpx; text-align: center; line-height: 36rpx; }
.cart-total { flex: 1; font-size: 32rpx; font-weight: 600; color: $text; }
.checkout-btn { background: $brand; color: #fff; border-radius: 999rpx; padding: 16rpx 48rpx; font-size: 28rpx; }
.checkout-btn.disabled { opacity: .5; }
</style>
```

> 执行要点：
> - `cart.addItem` / `cart.count` / `cart.total` 以复制来的 `stores/cart.ts` 实际 API 为准（先读该文件，方法名不同则适配调用侧，不改 store）
> - 商品分组读 `collections` 是临时口径；若 vshop `fetchProductList` 已带分组结构照搬之
> - 切渠道失败（token 无效）→ toast「店铺不存在」并返回首页

- [ ] **Step 2: 目检**

Playwright 390×844 dpr=2：首页 → 点店铺卡 → 菜单页截图 `docs/screenshots/plan2/2-5-menu.png`（无商品数据时允许渲染骨架/空态，重点验证切渠道请求发出：network 面板 `vendure-token` 为店铺 token）
Expected: 左分类栏 + 右商品列表 + 底部购物车条布局正确

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(menu): 店铺菜单（切店铺渠道+分类栏+购物车常驻条+SkuSheet）"
```

---

### Task 6: 结算·校园配送 Tab

**Files:**
- Modify: `src/pkg-order/pages/checkout.vue`（复制的 vshop 版基础上改造）

- [ ] **Step 1: 改造要点（vshop checkout.vue 为底）**

1. 配送方式 Tab 数据源改为常量数组：`const shipTabs = ['校园配送', '自提', '邮寄']`（中文写死）；`activeShipTab` ref
2. 「校园配送」Tab 选中时渲染 `campus-panel`：
   - 分区列表（`fetchZones()`）→ 点选后拉宿舍楼（`fetchBuildings(zoneId)`）→ 点选宿舍楼
   - 送达时段（`fetchSlots()`，仅展示 `remaining > 0`；显示 `slotDate startTime-endTime 剩N位`；不选=立即送）
   - 路线判定：店铺 `routesEnabled` 含 R1 → 文案「商家送至校门口，校内骑手接力送达（route=R1）」；仅 R3 → 「档口直送，校内骑手上楼（route=R3）」；两者都支持时**默认 R3**，提供一行切换
   - 店铺 routesEnabled 从 URL 参数透传（menu→checkout 带 `routes=R1,R3`）
3. 「去支付」前的保存动作替换：

```ts
// 替换 vshop checkout 里 setDeliveryTarget/setShipping 相关调用
import { setDeliveryTarget } from '../../api/mutations/campus';

async function saveCampusTarget() {
    if (!zoneId.value || !buildingId.value) {
        uni.showToast({ title: '请选择宿舍楼', icon: 'none' });
        return false;
    }
    await setDeliveryTarget({
        zoneId: zoneId.value,
        buildingId: buildingId.value,
        route: route.value,                      // 'R1' | 'R3'
        slotId: slotId.value ? Number(slotId.value) : undefined,
    });
    return true;
}
// checkout 提交函数首行：if (activeShipTab.value === '校园配送') { const ok = await saveCampusTarget(); if (!ok) return; }
```

4. 其余 Tab（自提/邮寄）保留 vshop 既有逻辑不动；运费展示沿用现有 ShippingLine 渲染（campus-zone-fee-calculator 出的分区运费在 shippingLines 里）
5. 删除 vshop checkout 里本模板没有的模块引用（发票/分销等入口），跳转目标不存在时按 Task 2 Step 2.4 惯例处理

- [ ] **Step 2: 目检**

Playwright 390×844 dpr=2：加购 → 结算页切「校园配送」Tab → 选分区/楼/时段 → 截图 `docs/screenshots/plan2/2-6-checkout.png`（后端无 zone 数据时先在管理后台造 1 区 2 楼 + 1 个时段，造数脚本见 Plan 3 Task 5）
Expected: 校园配送面板三段（分区/楼、时段、路线说明）渲染正确；提交时 network 里 `campusSetDeliveryTarget` 带 route+slotId

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(checkout): 校园配送 Tab（分区/宿舍楼/送达时段/路线判定+setDeliveryTarget 写入）"
```

---

### Task 7: 订单跟踪页（时间线 + 骑手卡）

**Files:**
- Modify: `src/pkg-order/pages/order-detail.vue`（复制的 vshop 版基础上改造）
- Test: `tests/timeline.spec.ts` + `src/utils/timeline.ts`

- [ ] **Step 1: 时间线映射纯逻辑 + 测试先行**

```ts
// src/utils/timeline.ts
export interface TimelineNode { key: string; label: string; done: boolean }

const HALL_STATUS_ORDER = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'] as const;

/** spec §5.4：R3 单段四节点；R1 接力五节点（交接点插入） */
export function buildTimeline(route: string | null, hallStatus: string | null, deliveryStatus: string | null): TimelineNode[] {
    const st = (hallStatus ?? '').toUpperCase();
    const idx = HALL_STATUS_ORDER.indexOf(st as any);
    if (route === 'R1') {
        const nodes: TimelineNode[] = [
            { key: 'merchant_accept', label: '商家接单', done: true },
            { key: 'to_gate', label: '商家自送·已到校门口交接点', done: idx >= 1 },
            { key: 'handover', label: '接力取货完成（拍照确认）', done: idx >= 2 },
            { key: 'upstairs', label: '第二程·配送上楼', done: idx >= 2 && st === 'DELIVERED' ? false : idx >= 2 },
            { key: 'delivered', label: '已送达', done: idx >= 3 },
        ];
        return nodes;
    }
    // R3 / 未知路线 → 单段
    const nodes: TimelineNode[] = [
        { key: 'merchant_accept', label: '商家接单', done: true },
        { key: 'pickup', label: '骑手取餐', done: idx >= 2 },
        { key: 'delivering', label: '配送中', done: idx >= 2 && st !== 'DELIVERED' && idx >= 1 },
        { key: 'delivered', label: '已送达', done: idx >= 3 },
    ];
    return nodes;
}
```

> 实现以 `hallStatus` 语义为准；执行时先 grep `campus-delivery.plugin.ts` 的 hallStatus 枚举值（如 PENDING/ASSIGNED/PICKED/DELIVERED 具体拼写）与 `hall.service.ts` 状态推进逻辑，**按真实值修正映射**，测试随之对齐——本步骤的断言值在执行时以实际枚举改写。

```ts
// tests/timeline.spec.ts
import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/utils/timeline';

describe('buildTimeline', () => {
    it('R3 单段：ASSIGNED 时取餐未完成', () => {
        const tl = buildTimeline('R3', 'ASSIGNED', null);
        expect(tl.map(n => n.done)).toEqual([true, false, false, false]);
    });
    it('R1 接力：五节点，交接点未到时后两程未开始', () => {
        const tl = buildTimeline('R1', 'PENDING', null);
        expect(tl).toHaveLength(5);
        expect(tl[1].done).toBe(false);
    });
    it('空状态兜底（下单未支付）', () => {
        const tl = buildTimeline(null, null, null);
        expect(tl[0].done).toBe(true);   // 商家接单节点以订单状态为准，执行时校正
    });
});
```

Run: `npx vitest run tests/timeline.spec.ts` → 实现 → PASS

- [ ] **Step 2: order-detail 改造**

1. 顶部订单状态区下方插入时间线组件（渲染 `buildTimeline` 结果，当前节点高亮 `$brand`，完成节点打勾）
2. 骑手卡：轮询 `fetchOrderRider(orderId)` 每 10s（`setInterval`，onUnmounted 清理）：
   - 有骑手：姓名 + 信用分 + 「接力骑手 · 第二程」标注（route=R1 时）
   - 无骑手且 hallStatus 停留 PENDING 超过 2 分钟：显示「平台调度中，正在为您加急派单」（T0-T4 只读态，spec §5.4）
3. 状态字段来源：轮询 `order(id) { customFields { hallStatus fulfillmentRoute deliveryStatus } }`（vshop `api/queries/order.ts` 已有 order query，补 customFields 字段即可）
4. 「再来一单」：回店铺菜单页（保存订单里的 channelToken → `uni.navigateTo menu?token=...`）

- [ ] **Step 3: 目检 + Commit**

Playwright 390×844 dpr=2 截图 `docs/screenshots/plan2/2-7-order-detail.png`（骑手卡用真实后端单据或造数：Plan 3 Task 5 联调后补拍带骑手态截图）

```bash
git add -A && git commit -m "feat(order-detail): 履约时间线（R1/R3 分路线）+ 骑手卡轮询 + 平台调度中降级态"
```

---

### Task 8: 订单列表 / 我的（tab 页改造 + 骑手入口）

**Files:**
- Modify: `src/pages/orders/index.vue`（复制的 vshop orders.vue）
- Modify: `src/pages/profile/index.vue`

- [ ] **Step 1: orders 改造**

1. 复制的 vshop orders 列表保留分页逻辑，订单卡状态徽标增加履约态：从列表 query 带 `customFields { hallStatus fulfillmentRoute }`，有值时显示徽标「配送中/已送达」（映射同 Task 7 时间线语义）
2. 点击卡片进 `/pkg-order/pages/order-detail?id=...`

- [ ] **Step 2: profile 改造**

1. 保留 vshop profile 的登录态/资料区，删除本模板没有的入口（地址管理/发票/分销等）
2. 新增「骑手中心」入口：点击调 `myRiderProfile`——
   - 未登录 → 跳登录
   - `riderStatus === 'APPROVED'` → `/pkg-rider/pages/rider-home`
   - 其他状态（PENDING/REJECTED/null）→ `/pkg-rider/pages/rider-join`（PENDING 时页内显示「审核中」）
3. 入口常显（未认证也显示，文案「成为骑手」）

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(tabs): 订单列表履约徽标 + 我的页骑手中心入口"
```

---

### Task 9: 收口——构建 + 截图归档

- [ ] **Step 1: 全量测试**

Run: `cd e:\zhao\waimai && npx vitest run`
Expected: 全绿（store-filter + timeline 等纯逻辑）

- [ ] **Step 2: 生产构建**

Run: `cd e:\zhao\waimai && pnpm build:h5`
Expected: `dist/build/h5/` 产物生成，index.html 资源路径带 `/waimai/` 前缀；主包体积记录到验收手册

- [ ] **Step 3: 截图归档**

确认 `docs/screenshots/plan2/` 下已有：2-4-home / 2-5-menu / 2-6-checkout / 2-7-order-detail（390×844 dpr=2），逐张目检无布局崩坏

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(plan2): 学生端收口（构建产物验证+截图归档）"
```

---

## Self-Review 结论

- Spec 覆盖：§4 主包五页+pkg-order 三页 → Task 1/2/4/5/6/7/8；§5.1 店铺列表+分类+月售 → Task 4；§5.2 菜单+购物车条+SkuSheet → Task 5；§5.3 校园配送 Tab → Task 6；§5.4 时间线+骑手卡+调度中 → Task 7；§12.1 主题 → Task 1/3；§12.2 搜索+promoText → Task 4 + Plan1 Task1/2
- 依赖事实：`campusSetDeliveryTarget(route,slotId)` 依赖 Plan 1 Task 6 先行；`waimaiStoreList` 含 promoText 依赖 Plan 1 Task 1/2
- 类型一致：`setDeliveryTarget({zoneId,buildingId,route?,slotId?})` 在 Task 2 API 层与 Task 6 调用侧签名一致；`buildTimeline(route, hallStatus, deliveryStatus)` 定义与测试一致
- 已知执行时校准点（已在任务内标注）：hallStatus 枚举拼写、cart store 实际 API、campusZones/Buildings/Slots 的 shop schema 字段名——均要求执行者以 vendure 实际代码为准修正 gql 与映射，不改函数签名
- 无占位符

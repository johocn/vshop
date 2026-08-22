# C 端租户共享接入 + 装修 JSON 驱动 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 C 端租户配置从硬编码改为后端动态拉取（新增租户无需改代码），并让 web-admin 装修 JSON 在 C 端首页真正生效。

**Architecture:** 后端 cjk-plugin 新增 `resolveChannelByCode(code)` 查询（复用 `resolveByDomain` 的跨渠道模式），返回 token + 装修 customFields；C 端 `tenant.ts` 移除硬编码 `TENANT_CONFIGS`，`initTenant()` 改为「URL 参数 → 域名解析 → localStorage → 默认」四步解析后调后端拉取；首页新增 `DynamicHome.vue` 按 sections JSON 渲染，无装修数据回退现有模板。

**Tech Stack:** Vendure (cjk-plugin, NestJS/GraphQL), uni-app (Vue3/Pinia), graphql-request, web-admin (uni-app H5)。

**前置约束（部署铁律）**：后端/C 端一律本地构建 → 提交 dist → 服务器 git pull → pm2 restart。**绝不在服务器构建**。web-admin 走已有 deploy.mjs。

---

## File Structure

### 后端（d:\zhao\vendure\packages\cjk-plugin）
- `src/tenant/domain-resolver.service.ts`（修改）：新增 `resolveByCode()` 方法，返回 token+code+全部装修 customFields。
- `src/tenant/domain-shop.resolver.ts`（修改）：新增 `resolveChannelByCode` 查询。
- `src/plugin.ts`（修改）：shop 端 schema 新增 `ChannelResolveResult` 类型 + `resolveChannelByCode` 查询。

### C 端前端（d:\zhao\vshop）
- `src/api/queries/channel.ts`（修改）：新增 `resolveChannelByCode(code)`。
- `src/stores/tenant.ts`（修改）：移除 `TENANT_CONFIGS` 硬编码，`initTenant()` 动态拉取，新增装修状态。
- `src/templates/shared/schema.ts`（新增）：sections JSON 类型 + 校验函数。
- `src/templates/shared/DynamicHome.vue`（新增）：按 sections 渲染首页。
- `src/templates/shared/sections/BannerSection.vue`（新增）
- `src/templates/shared/sections/NoticeSection.vue`（新增）
- `src/templates/shared/sections/NavSection.vue`（新增）
- `src/templates/shared/sections/GoodsSection.vue`（新增）
- `src/templates/shared/sections/RichTextSection.vue`（新增）
- `src/pages/home/index.vue`（修改）：有装修数据优先渲染 DynamicHome。

### web-admin（d:\zhao\vshop\web-admin）
- `src/pages/decorate/home/index.vue`（修改）：占位 → 产出 sections JSON。
- `src/apis/channel.ts`（修改）：新增 `updateChannelCustomFields`（若已有则复用）。
- `src/pages/decorate/theme/index.vue`（修改）：主题色编辑。

---

### Task 1: 后端 `resolveChannelByCode` 查询

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\domain-resolver.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\tenant\domain-shop.resolver.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`

- [ ] **Step 1: 在 domain-resolver.service.ts 新增 `resolveByCode` 方法**

在 `DomainResolverService` 类中，`resolveByDomain` 方法之后新增：

```typescript
export interface ChannelResolveResult {
    token: string;
    code: string;
    customFields: {
        shopName: string | null;
        shopLogo: string | null;
        shopIntro: string | null;
        servicePhone: string | null;
        shopContent: string | null;
        displayTemplate: string | null;
        themeId: string | null;
    };
}

async resolveByCode(ctx: RequestContext, code: string): Promise<ChannelResolveResult | null> {
    const emptyCtx = RequestContext.empty();
    const channels = await this.channelService.findAll(emptyCtx);
    for (const channel of channels.items) {
        if (channel.code === code) {
            const cf = (channel.customFields as any) || {};
            return {
                token: channel.token,
                code: channel.code,
                customFields: {
                    shopName: cf.shopName ?? null,
                    shopLogo: cf.shopLogo ?? null,
                    shopIntro: cf.shopIntro ?? null,
                    servicePhone: cf.servicePhone ?? null,
                    shopContent: cf.shopContent ?? null,
                    displayTemplate: cf.displayTemplate ?? null,
                    themeId: cf.themeId ?? null,
                },
            };
        }
    }
    return null;
}
```

- [ ] **Step 2: 在 domain-shop.resolver.ts 新增 `resolveChannelByCode` 查询**

```typescript
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { Query, Resolver, Args } from '@nestjs/graphql';
import { DomainResolverService, DomainResolveResult, ChannelResolveResult } from './domain-resolver.service';

@Resolver()
export class DomainShopResolver {
    constructor(private domainResolverService: DomainResolverService) {}

    @Query()
    @Allow(Permission.Public)
    async resolveChannelByDomain(
        @Ctx() ctx: RequestContext,
        @Args('host') host: string,
    ): Promise<DomainResolveResult | null> {
        return this.domainResolverService.resolveByDomain(ctx, host);
    }

    @Query()
    @Allow(Permission.Public)
    async resolveChannelByCode(
        @Ctx() ctx: RequestContext,
        @Args('code') code: string,
    ): Promise<ChannelResolveResult | null> {
        return this.domainResolverService.resolveByCode(ctx, code);
    }
}
```

- [ ] **Step 3: 在 plugin.ts shop 端 schema 新增类型与查询**

在 `shopApiExtensions.schema` 的 `DomainResolveResult` 类型之后（第 556 行附近）追加：

```typescript
type ChannelResolveResult {
    token: String!
    code: String!
    customFields: ChannelResolveCustomFields
}
type ChannelResolveCustomFields {
    shopName: String
    shopLogo: String
    shopIntro: String
    servicePhone: String
    shopContent: String
    displayTemplate: String
    themeId: String
}
extend type Query {
    resolveChannelByCode(code: String!): ChannelResolveResult
}
```

- [ ] **Step 4: 构建并验证**

在 `d:\zhao\vendure\packages\cjk-plugin` 目录执行：

```bash
pnpm build
```

预期：构建成功，无 TS 报错。

- [ ] **Step 5: 验证 dist 已包含新查询**

```bash
Select-String -Path "d:\zhao\vendure\packages\cjk-plugin\dist\index.js" -Pattern "resolveChannelByCode" | Select-Object -First 3
```

预期：至少 1 行匹配。

- [ ] **Step 6: 提交**

```bash
git add packages/cjk-plugin/src/tenant/domain-resolver.service.ts packages/cjk-plugin/src/tenant/domain-shop.resolver.ts packages/cjk-plugin/src/plugin.ts packages/cjk-plugin/dist
git commit -m "feat(cjk-plugin): add resolveChannelByCode shop query"
```

---

### Task 2: C 端 `resolveChannelByCode` 查询 + schema.ts

**Files:**
- Modify: `d:\zhao\vshop\src\api\queries\channel.ts`
- Create: `d:\zhao\vshop\src\templates\shared\schema.ts`

- [ ] **Step 1: 在 channel.ts 新增 `resolveChannelByCode`**

在 `resolveChannelByDomain` 之后追加：

```typescript
export async function resolveChannelByCode(code: string) {
    const client = getGraphQLClient();
    return client.request(`query ResolveChannelByCode($code: String!) {
        resolveChannelByCode(code: $code) {
            token
            code
            customFields {
                shopName
                shopLogo
                shopIntro
                servicePhone
                shopContent
                displayTemplate
                themeId
            }
        }
    }`, { code });
}
```

- [ ] **Step 2: 创建 schema.ts（类型 + 校验）**

创建 `d:\zhao\vshop\src\templates\shared\schema.ts`：

```typescript
export interface ShopTheme {
    primaryColor?: string;
    accentColor?: string;
}

export interface BannerImage {
    image: string;
    link?: string;
}

export interface BannerSection {
    type: 'banner';
    images: BannerImage[];
}

export interface NoticeSection {
    type: 'notice';
    text: string;
}

export interface NavItem {
    label: string;
    icon?: string;
    link?: string;
}

export interface NavSection {
    type: 'nav';
    items: NavItem[];
}

export interface GoodsSection {
    type: 'goods';
    title?: string;
    collectionId: string;
}

export interface RichTextSection {
    type: 'richText';
    html: string;
}

export type ShopSection = BannerSection | NoticeSection | NavSection | GoodsSection | RichTextSection;

export interface ShopContent {
    version: number;
    theme?: ShopTheme;
    sections: ShopSection[];
}

const VALID_TYPES = ['banner', 'notice', 'nav', 'goods', 'richText'];

export function parseShopContent(raw: string | null | undefined): ShopContent | null {
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!isValidShopContent(data)) return null;
        return data as ShopContent;
    } catch {
        return null;
    }
}

export function isValidShopContent(data: any): data is ShopContent {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== 1) return false;
    if (!Array.isArray(data.sections)) return false;
    if (data.theme !== undefined && data.theme !== null) {
        if (typeof data.theme !== 'object') return false;
    }
    for (const sec of data.sections) {
        if (!sec || typeof sec !== 'object') return false;
        if (!VALID_TYPES.includes(sec.type)) return false;
        if (sec.type === 'banner' && (!Array.isArray(sec.images) || sec.images.length === 0)) return false;
        if (sec.type === 'notice' && typeof sec.text !== 'string') return false;
        if (sec.type === 'nav' && (!Array.isArray(sec.items) || sec.items.length === 0)) return false;
        if (sec.type === 'goods' && typeof sec.collectionId !== 'string') return false;
        if (sec.type === 'richText' && typeof sec.html !== 'string') return false;
    }
    return true;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/api/queries/channel.ts src/templates/shared/schema.ts
git commit -m "feat(vshop): add resolveChannelByCode query and shop content schema"
```

---

### Task 3: C 端 `tenant.ts` 动态拉取改造

**Files:**
- Modify: `d:\zhao\vshop\src\stores\tenant.ts`

- [ ] **Step 1: 移除硬编码 `TENANT_CONFIGS`，新增装修状态**

删除 `TENANT_CONFIGS` 常量（第 27-46 行）和 `TenantConfig` 接口（第 7-13 行）。在 store 内新增：

```typescript
import { resolveChannelByDomain, resolveChannelByCode } from '../api/queries/channel';
import { parseShopContent, ShopContent } from '../templates/shared/schema';

const DEFAULT_TOKEN = 'default-token';

const shopContent = ref<ShopContent | null>(null);
const shopName = ref('');
const shopLogo = ref('');
const shopIntro = ref('');
const servicePhone = ref('');
```

- [ ] **Step 2: 重写 `initTenant()`**

将 `initTenant` 函数整体替换为：

```typescript
async function initTenant() {
    // 1. 尝试域名解析（仅 H5）
    // #ifdef H5
    try {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
            const cacheKey = `domain_resolve_${host}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const result = JSON.parse(cached);
                    tenantCode.value = result.code;
                    token.value = result.token;
                    uni.setStorageSync('tenant_code', result.code);
                    await loadTenantDetails(result.code);
                    return;
                } catch {}
            }
            const res: any = await resolveChannelByDomain(host);
            if (res?.resolveChannelByDomain) {
                const result = res.resolveChannelByDomain;
                sessionStorage.setItem(cacheKey, JSON.stringify(result));
                tenantCode.value = result.code;
                token.value = result.token;
                uni.setStorageSync('tenant_code', result.code);
                await loadTenantDetails(result.code);
                return;
            }
        }
    } catch {}
    // #endif

    // 2. ?tenant= URL 参数
    const fromUrl = resolveTenantFromUrl();
    if (fromUrl) {
        tenantCode.value = fromUrl;
        await loadTenantDetails(fromUrl);
        return;
    }

    // 3. localStorage 兜底
    const stored = uni.getStorageSync('tenant_code');
    if (stored) {
        tenantCode.value = stored;
        await loadTenantDetails(stored);
        return;
    }

    // 4. 默认
    tenantCode.value = 'default';
    await loadTenantDetails('default');
}

async function loadTenantDetails(code: string) {
    try {
        const res: any = await resolveChannelByCode(code);
        const data = res?.resolveChannelByCode;
        if (data) {
            token.value = data.token;
            tenantCode.value = data.code;
            const cf = data.customFields || {};
            shopName.value = cf.shopName || '';
            shopLogo.value = cf.shopLogo || '';
            shopIntro.value = cf.shopIntro || '';
            servicePhone.value = cf.servicePhone || '';
            templateCode.value = cf.displayTemplate || 'default';
            shopContent.value = parseShopContent(cf.shopContent);
            uni.setStorageSync('tenant_code', data.code);
            return;
        }
    } catch (e) {
        console.warn('[tenant] resolveChannelByCode failed', code, e);
    }
    // 回退默认
    token.value = DEFAULT_TOKEN;
    templateCode.value = 'default';
    shopContent.value = null;
    shopName.value = '';
    shopLogo.value = '';
    shopIntro.value = '';
    servicePhone.value = '';
}
```

- [ ] **Step 3: 重写 `switchTenant` / `listTenants`**

```typescript
async function switchTenant(code: string) {
    tenantCode.value = code;
    await loadTenantDetails(code);
    return true;
}

function listTenants(): Array<{ code: string; name: string; template: string }> {
    return [{ code: tenantCode.value, name: tenantName.value, template: templateCode.value }];
}
```

- [ ] **Step 4: 更新 `tenantName` 计算与导出**

将 `tenantName` 改为 computed（有 shopName 用 shopName，否则用 code）：

```typescript
const tenantName = computed(() => shopName.value || tenantCode.value);
```

在 store 的 return 中新增导出：`shopContent, shopName, shopLogo, shopIntro, servicePhone`。

- [ ] **Step 5: 提交**

```bash
git add src/stores/tenant.ts
git commit -m "feat(vshop): dynamic tenant config via resolveChannelByCode"
```

---

### Task 4: sections 子组件

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\sections\BannerSection.vue`
- Create: `d:\zhao\vshop\src\templates\shared\sections\NoticeSection.vue`
- Create: `d:\zhao\vshop\src\templates\shared\sections\NavSection.vue`
- Create: `d:\zhao\vshop\src\templates\shared\sections\GoodsSection.vue`
- Create: `d:\zhao\vshop\src\templates\shared\sections\RichTextSection.vue`

- [ ] **Step 1: BannerSection.vue**

```vue
<template>
  <view class="banner-sec">
    <swiper v-if="images.length > 1" class="swiper" circular autoplay indicator-dots>
      <swiper-item v-for="(img, i) in images" :key="i" @tap="go(img.link)">
        <image class="img" :src="img.image" mode="aspectFill" />
      </swiper-item>
    </swiper>
    <image v-else class="img single" :src="images[0]?.image" mode="aspectFill" @tap="go(images[0]?.link)" />
  </view>
</template>

<script setup lang="ts">
import type { BannerSection } from '../schema';

const props = defineProps<{ section: BannerSection }>();
const images = props.section.images;

function go(link?: string) {
  if (link) uni.navigateTo({ url: link });
}
</script>

<style lang="scss" scoped>
.banner-sec { margin: 20rpx; border-radius: 16rpx; overflow: hidden; }
.swiper { height: 320rpx; }
.img { width: 100%; height: 320rpx; }
.img.single { display: block; }
</style>
```

- [ ] **Step 2: NoticeSection.vue**

```vue
<template>
  <view class="notice-sec">
    <text class="icon">📢</text>
    <text class="text">{{ section.text }}</text>
  </view>
</template>

<script setup lang="ts">
import type { NoticeSection } from '../schema';
defineProps<{ section: NoticeSection }>();
</script>

<style lang="scss" scoped>
.notice-sec { display: flex; align-items: center; margin: 20rpx; padding: 20rpx; background: #fff8e6; border-radius: 12rpx; }
.icon { margin-right: 12rpx; }
.text { font-size: 26rpx; color: #b8860b; flex: 1; }
</style>
```

- [ ] **Step 3: NavSection.vue**

```vue
<template>
  <view class="nav-sec">
    <view class="nav-item" v-for="(it, i) in section.items" :key="i" @tap="go(it.link)">
      <text class="icon">{{ it.icon || '•' }}</text>
      <text class="label">{{ it.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { NavSection } from '../schema';
const props = defineProps<{ section: NavSection }>();
function go(link?: string) {
  if (link) uni.navigateTo({ url: link });
}
</script>

<style lang="scss" scoped>
.nav-sec { display: flex; flex-wrap: wrap; margin: 20rpx; padding: 20rpx 0; background: #fff; border-radius: 16rpx; }
.nav-item { width: 25%; display: flex; flex-direction: column; align-items: center; padding: 16rpx 0; }
.icon { font-size: 48rpx; }
.label { font-size: 24rpx; color: #333; margin-top: 8rpx; }
</style>
```

- [ ] **Step 4: GoodsSection.vue**

复用现有 `getEnabledFloors` 的 collection 查询能力，按 `collectionId` 拉取商品：

```vue
<template>
  <view class="goods-sec" v-if="products.length">
    <text class="title" v-if="section.title">{{ section.title }}</text>
    <view class="grid">
      <view class="card" v-for="p in products" :key="p.id" @tap="go(p.slug)">
        <image class="thumb" :src="p.featuredAsset?.preview" mode="aspectFill" />
        <text class="name">{{ p.name }}</text>
        <text class="price">¥{{ p.price }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { GoodsSection } from '../schema';
import { getEnabledFloors } from '../../../api/queries/collection';

const props = defineProps<{ section: GoodsSection }>();
const products = ref<Array<{ id: string; name: string; slug: string; price: number; featuredAsset: { preview: string } | null }>>([]);

onMounted(async () => {
  try {
    const res: any = await getEnabledFloors();
    const floors = res?.collections?.items || [];
    const target = floors.find((f: any) => f.id === props.section.collectionId);
    if (target?.productVariants?.items) {
      products.value = target.productVariants.items.map((v: any) => ({
        id: v.product.id,
        name: v.product.name,
        slug: v.product.slug,
        price: v.product.variants?.[0]?.priceWithTax ?? v.product.variants?.[0]?.price ?? 0,
        featuredAsset: v.product.featuredAsset,
      }));
    }
  } catch (e) {
    console.warn('[GoodsSection] load failed', e);
  }
});

function go(slug: string) {
  uni.navigateTo({ url: `/pkg-product/pages/detail?slug=${slug}` });
}
</script>

<style lang="scss" scoped>
.goods-sec { margin: 20rpx; }
.title { font-size: 32rpx; font-weight: bold; padding: 10rpx 0 20rpx; }
.grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.card { width: 48%; background: #fff; border-radius: 16rpx; margin-bottom: 20rpx; overflow: hidden; }
.thumb { width: 100%; height: 300rpx; }
.name { font-size: 26rpx; color: #333; padding: 12rpx 16rpx 4rpx; display: block; }
.price { font-size: 30rpx; color: #e64340; font-weight: bold; padding: 0 16rpx 16rpx; display: block; }
</style>
```

- [ ] **Step 5: RichTextSection.vue**

```vue
<template>
  <view class="rich-sec">
    <rich-text :nodes="section.html" />
  </view>
</template>

<script setup lang="ts">
import type { RichTextSection } from '../schema';
defineProps<{ section: RichTextSection }>();
</script>

<style lang="scss" scoped>
.rich-sec { margin: 20rpx; padding: 20rpx; background: #fff; border-radius: 16rpx; }
</style>
```

- [ ] **Step 6: 提交**

```bash
git add src/templates/shared/sections/
git commit -m "feat(vshop): shop content section components"
```

---

### Task 5: DynamicHome.vue + 首页路由改造

**Files:**
- Create: `d:\zhao\vshop\src\templates\shared\DynamicHome.vue`
- Modify: `d:\zhao\vshop\src\pages\home\index.vue`

- [ ] **Step 1: 创建 DynamicHome.vue**

```vue
<template>
  <view class="dynamic-home">
    <component
      v-for="(sec, i) in sections"
      :key="i"
      :is="componentFor(sec.type)"
      :section="sec"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTenantStore } from '../../stores/tenant';
import BannerSection from './sections/BannerSection.vue';
import NoticeSection from './sections/NoticeSection.vue';
import NavSection from './sections/NavSection.vue';
import GoodsSection from './sections/GoodsSection.vue';
import RichTextSection from './sections/RichTextSection.vue';
import type { ShopSection } from './schema';

const tenantStore = useTenantStore();
const sections = computed(() => tenantStore.shopContent?.sections || []);

const componentMap: Record<string, any> = {
  banner: BannerSection,
  notice: NoticeSection,
  nav: NavSection,
  goods: GoodsSection,
  richText: RichTextSection,
};

function componentFor(type: string): any {
  return componentMap[type] || null;
}
</script>

<style lang="scss" scoped>
.dynamic-home { min-height: 100vh; background: $bg-color; }
</style>
```

- [ ] **Step 2: 改造 home/index.vue**

```vue
<template>
  <view class="home-page">
    <TenantBar />
    <DynamicHome v-if="hasShopContent" />
    <component v-else :is="currentHome" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTenantStore } from '../../stores/tenant';
import { useAuthStore } from '../../stores/auth';
import { useShare } from '../../composables/useShare';
import DefaultHome from '../../templates/default/pages/HomeContent.vue';
import FreshHome from '../../templates/fresh/pages/HomeContent.vue';
import MarketplaceHome from '../../templates/marketplace/pages/HomeContent.vue';
import DynamicHome from '../../templates/shared/DynamicHome.vue';
import TenantBar from '../../components/TenantBar.vue';

const tenantStore = useTenantStore();
const authStore = useAuthStore();
const { templateCode } = tenantStore;
const channelName = computed(() => tenantStore.tenantName);
const inviteCode = computed(() => authStore.inviteCode);
const hasShopContent = computed(() => !!tenantStore.shopContent?.sections?.length);
const templateMap: Record<string, any> = { default: DefaultHome, fresh: FreshHome, marketplace: MarketplaceHome };
const currentHome = computed(() => templateMap[templateCode.value] || DefaultHome);

useShare({
    title: `${channelName.value} - 精选好物`,
    path: inviteCode.value ? `/?ref=${inviteCode.value}` : '/',
});
</script>

<style lang="scss" scoped>
.home-page { min-height: 100vh; background: $bg-color; }
</style>
```

- [ ] **Step 3: 提交**

```bash
git add src/templates/shared/DynamicHome.vue src/pages/home/index.vue
git commit -m "feat(vshop): JSON-driven dynamic home with fallback"
```

---

### Task 6: web-admin 装修页产出 sections JSON

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\home\index.vue`
- Modify: `d:\zhao\vshop\web-admin\src\apis\channel.ts`
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\theme\index.vue`

- [ ] **Step 1: 确认/新增 `updateChannelCustomFields`**

检查 `d:\zhao\vshop\web-admin\src\apis\channel.ts` 是否已有更新 customFields 的 mutation。若无，追加：

```typescript
export async function updateChannelCustomFields(channelId: string, customFields: Record<string, any>) {
    const client = getAdminClient();
    return client.request(`mutation UpdateChannelCustomFields($id: ID!, $customFields: JSON) {
        updateChannel(input: { id: $id, customFields: $customFields }) {
            id
            customFields
        }
    }`, { id: channelId, customFields });
}
```

- [ ] **Step 2: 重写 decorate/home/index.vue 为表单式装修编辑器**

替换占位内容为可编辑 sections JSON 的表单。核心逻辑：

```vue
<template>
  <view class="decorate">
    <view class="block" v-for="(sec, i) in sections" :key="i">
      <view class="block-head">
        <text>{{ typeLabel(sec.type) }}</text>
        <text class="del" @tap="removeSection(i)">删除</text>
      </view>
      <!-- banner -->
      <view v-if="sec.type === 'banner'">
        <view class="row" v-for="(img, j) in sec.images" :key="j">
          <input v-model="img.image" placeholder="图片 URL" />
          <input v-model="img.link" placeholder="跳转链接" />
          <text class="del" @tap="sec.images.splice(j, 1)">×</text>
        </view>
        <button @tap="sec.images.push({ image: '', link: '' })">+ 轮播图</button>
      </view>
      <!-- notice -->
      <view v-else-if="sec.type === 'notice'">
        <input v-model="sec.text" placeholder="公告文字" />
      </view>
      <!-- nav -->
      <view v-else-if="sec.type === 'nav'">
        <view class="row" v-for="(it, j) in sec.items" :key="j">
          <input v-model="it.label" placeholder="名称" />
          <input v-model="it.icon" placeholder="图标" />
          <input v-model="it.link" placeholder="链接" />
          <text class="del" @tap="sec.items.splice(j, 1)">×</text>
        </view>
        <button @tap="sec.items.push({ label: '', icon: '', link: '' })">+ 宫格</button>
      </view>
      <!-- goods -->
      <view v-else-if="sec.type === 'goods'">
        <input v-model="sec.title" placeholder="区块标题" />
        <input v-model="sec.collectionId" placeholder="Collection ID" />
      </view>
      <!-- richText -->
      <view v-else-if="sec.type === 'richText'">
        <textarea v-model="sec.html" placeholder="HTML 内容" />
      </view>
    </view>

    <view class="add-bar">
      <button v-for="t in ['banner', 'notice', 'nav', 'goods', 'richText']" :key="t" @tap="addSection(t)">+ {{ typeLabel(t) }}</button>
    </view>

    <view class="save-bar">
      <button class="save" @tap="save">保存装修</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTenantStore } from '../../../stores/tenantStore';
import { updateChannelCustomFields } from '../../../apis/channel';
import { isValidShopContent, ShopSection } from '../../../templates/shared/schema';

const tenant = useTenantStore();
const sections = ref<ShopSection[]>([]);

const TYPE_LABELS: Record<string, string> = {
  banner: '轮播图', notice: '公告栏', nav: '宫格导航', goods: '商品推荐', richText: '富文本',
};
function typeLabel(t: string) { return TYPE_LABELS[t] || t; }

function addSection(type: string) {
  switch (type) {
    case 'banner': sections.value.push({ type: 'banner', images: [{ image: '', link: '' }] }); break;
    case 'notice': sections.value.push({ type: 'notice', text: '' }); break;
    case 'nav': sections.value.push({ type: 'nav', items: [{ label: '', icon: '', link: '' }] }); break;
    case 'goods': sections.value.push({ type: 'goods', title: '', collectionId: '' }); break;
    case 'richText': sections.value.push({ type: 'richText', html: '' }); break;
  }
}
function removeSection(i: number) { sections.value.splice(i, 1); }

async function save() {
  const content = { version: 1, sections: sections.value };
  if (!isValidShopContent(content)) {
    uni.showToast({ title: '装修内容不合法', icon: 'none' });
    return;
  }
  try {
    await updateChannelCustomFields(tenant.channelId, { shopContent: JSON.stringify(content) });
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: '保存失败', icon: 'none' });
  }
}
</script>
```

注意：`tenant.channelId` 需在 tenantStore 中确认存在（当前 store 有 `channelId` 则直接用；若无则需在选店时记录）。

- [ ] **Step 3: 复制 schema.ts 到 web-admin**

将 `d:\zhao\vshop\src\templates\shared\schema.ts` 复制到 `d:\zhao\vshop\web-admin\src\templates\shared\schema.ts`（web-admin 是独立 uni-app 工程，无法直接 import 主工程文件）。

- [ ] **Step 4: 提交**

```bash
git add web-admin/src/pages/decorate/home/index.vue web-admin/src/apis/channel.ts web-admin/src/templates/shared/schema.ts
git commit -m "feat(web-admin): decorate home produces sections JSON"
```

---

### Task 7: 本地验证 + 部署

**Files:**
- Test: `d:\zhao\vshop\web-admin\_e2e\e2e_decorate.py`（新增）

- [ ] **Step 1: 本地启动后端（若未运行）**

在 `d:\zhao\vendure` 目录：

```bash
pnpm dev
```

预期：dev server 启动，shop-api 可访问。

- [ ] **Step 2: 本地验证 `resolveChannelByCode`**

用浏览器/curl 访问（本地 dev 的 shop-api）：

```
POST http://localhost:3000/shop-api
query resolveChannelByCode(code: "default") { token code customFields { shopName shopContent } }
```

预期：返回 default channel 的 token 与 customFields。

- [ ] **Step 3: 本地 C 端验证**

在 `d:\zhao\vshop` 启动 H5 dev，访问 `http://localhost:5173/?tenant=default`，确认：
- 首页正常渲染（无装修数据时走现有模板）
- 控制台无 `resolveChannelByCode` 报错

- [ ] **Step 4: web-admin 装修页 e2e（Playwright）**

创建 `d:\zhao\vshop\web-admin\_e2e\e2e_decorate.py`：

```python
from playwright.sync_api import sync_playwright
import time

BASE = 'http://localhost:5280/guanli/'
SHOT = 'd:/zhao/vshop/web-admin/_e2e/'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text[:200]}'))
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {str(e)[:300]}'))

    page.goto(BASE, wait_until='networkidle', timeout=30000)
    time.sleep(1)
    inputs = page.locator('input')
    if inputs.count() >= 2:
        inputs.nth(0).fill('superadmin')
        inputs.nth(1).fill('superadmin')
        page.locator('button').first.click()
        time.sleep(3)

    # 选店
    shop = page.locator('text=__default_channel__').first
    if shop.count() > 0:
        shop.click()
        time.sleep(2)

    # 进入装修页
    page.goto(BASE + 'pages/decorate/home/index', wait_until='networkidle', timeout=30000)
    time.sleep(1)
    page.screenshot(path=SHOT + 'decorate_01.png', full_page=True)

    # 添加公告栏
    add_btn = page.locator('button', has_text='公告栏').first
    if add_btn.count() > 0:
        add_btn.click()
        time.sleep(0.5)
        page.screenshot(path=SHOT + 'decorate_02.png', full_page=True)

    print('--- CONSOLE LOGS ---')
    for l in logs[:40]:
        print(l)
    browser.close()
```

运行：

```bash
python d:/zhao/vshop/web-admin/_e2e/e2e_decorate.py
```

预期：截图显示装修页可添加区块，控制台无报错。

- [ ] **Step 5: 后端部署**

在 `d:\zhao\vendure` 本地构建 cjk-plugin（Task 1 已构建 dist），提交后服务器：

```bash
# 服务器（不在服务器构建！）
cd /www/apps/vendure && git pull && pm2 restart vendure
```

- [ ] **Step 6: C 端部署**

在 `d:\zhao\vshop` 本地构建 H5（HBuilder X 手动构建或 `npm run build:h5`），提交 dist 后服务器 git pull。

- [ ] **Step 7: web-admin 部署**

在 `d:\zhao\vshop\web-admin` 本地构建，走已有 deploy.mjs：

```bash
node scripts/deploy.mjs
```

- [ ] **Step 8: 线上验证**

- 访问 `https://e.joho.cn/?tenant=default` → 首页正常
- 线上 web-admin 装修页保存一份公告 → 访问 `https://e.joho.cn/?tenant=default` → 首页显示公告栏
- 清空装修 → 首页回退现有模板

- [ ] **Step 9: 提交部署产物**

```bash
git add -A
git commit -m "chore: deploy tenant sharing C-end"
```

---

## Self-Review

### 1. Spec coverage
- ✅ 后端 `resolveChannelByCode`（Task 1）
- ✅ C 端 store 动态拉取 + 移除硬编码（Task 3）
- ✅ sections JSON schema + 校验（Task 2）
- ✅ DynamicHome + 首页路由（Task 5）
- ✅ sections 子组件（Task 4）
- ✅ web-admin 装修页产出 JSON（Task 6）
- ✅ 测试 + 部署（Task 7）
- ✅ 无新表、无迁移（部署步骤未涉及 DB）

### 2. Placeholder scan
- 无 TBD/TODO/占位。所有代码步骤含完整实现。
- Task 6 Step 2 的 `tenant.channelId` 标注了"若 store 无则需选店时记录"，这是明确的实现前置检查，非占位。

### 3. Type consistency
- `ChannelResolveResult`（后端）与 `resolveChannelByCode` 查询返回一致。
- `ShopContent`/`ShopSection` 类型在 Task 2 定义，Task 4/5/6 复用同一命名。
- `parseShopContent`/`isValidShopContent` 在 Task 2 定义，Task 3/6 调用。
- `resolveChannelByCode` 在 Task 2（C 端查询）与 Task 3（store 调用）签名一致。
- `getEnabledFloors` 在 Task 4 GoodsSection 复用，与现有 `src/api/queries/collection.ts` 一致。

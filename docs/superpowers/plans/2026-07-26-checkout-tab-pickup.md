# Checkout Tab 配送方式选择 + 自提点变更弹窗 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 checkout 页面配送方式从 radio 列表重构为 Tab 分段控件，新增自提点选择弹窗组件支持搜索、分页和变更。

**Architecture:** 纯前端重构。新增 `PickupLocationSheet.vue` 弹窗组件（底部抽屉，搜索 + 分页 15 条/页），重构 `checkout.vue` 配送方式为 Tab 分段控件。后端零改动，复用现有 `getPickupLocations` / `setOrderPickupLocation` API。

**Tech Stack:** Vue 3 + uni-app + TypeScript + Pinia + SCSS

**Spec:** `docs/superpowers/specs/2026-07-26-checkout-tab-pickup-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/components/PickupLocationSheet.vue` | 新增 | 自提点选择弹窗：底部抽屉、搜索、分页、距离显示 |
| `src/pkg-order/pages/checkout.vue` | 修改 | 配送方式 Tab 化，接入弹窗组件 |
| `src/types/pickup.ts` | 新增 | `PickupLocation` 类型定义，消除 `any` |

---

## Task 1: 新增 PickupLocation 类型定义

**Files:**
- Create: `src/types/pickup.ts`

- [ ] **Step 1: 创建类型定义文件**

创建 `src/types/pickup.ts`：

```typescript
/** 自提点实体（对应后端 PickupLocation） */
export interface PickupLocation {
    id: string;
    name: string;
    type: string;
    address: string;
    phoneNumber?: string;
    businessHours?: string;
    coordinates?: { lat: number; lng: number } | null;
    isPublic?: boolean;
}

/** 用户定位坐标 */
export interface UserLocation {
    lat: number;
    lng: number;
}
```

- [ ] **Step 2: 提交**

```bash
cd e:\code\vshop
git add src/types/pickup.ts
git commit --no-verify -m "feat: add PickupLocation type definitions"
```

---

## Task 2: 新增 PickupLocationSheet 弹窗组件

**Files:**
- Create: `src/components/PickupLocationSheet.vue`

- [ ] **Step 1: 创建弹窗组件**

创建 `src/components/PickupLocationSheet.vue`：

```vue
<template>
  <view v-if="visible" class="sheet-mask" @click.self="close">
    <view class="sheet">
      <view class="sheet__head">
        <text class="sheet__title">{{ title }}</text>
        <text class="sheet__close" @click="close">✕</text>
      </view>
      <input
        class="sheet__search"
        v-model="keyword"
        placeholder="搜索自提点 / 地址"
        @input="onKeywordChange"
      />
      <scroll-view
        class="sheet__list"
        scroll-y
        @scrolltolower="loadMore"
      >
        <view
          v-for="loc in pagedLocations"
          :key="loc.id"
          class="sheet__item"
          :class="{ active: loc.id === tempSelectedId }"
          @click="selectItem(loc)"
        >
          <text class="sheet__item-name">{{ loc.name }}</text>
          <text class="sheet__item-addr">{{ loc.address }}</text>
          <view class="sheet__item-meta">
            <text v-if="loc.businessHours" class="sheet__item-hours">营业: {{ loc.businessHours }}</text>
            <text v-if="getDistance(loc) !== null" class="sheet__item-dist">{{ getDistance(loc) }}</text>
          </view>
        </view>
        <view v-if="pagedLocations.length === 0" class="sheet__empty">
          <text>未找到匹配的自提点</text>
        </view>
        <view v-if="pagedLocations.length < filteredLocations.length" class="sheet__loading-more">
          <text>上拉加载更多</text>
        </view>
      </scroll-view>
      <button
        class="sheet__confirm"
        :disabled="!tempSelectedId"
        @click="confirm"
      >确认</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PickupLocation, UserLocation } from '../types/pickup';

const props = withDefaults(defineProps<{
  visible: boolean;
  locations: PickupLocation[];
  selectedId?: string;
  userLocation?: UserLocation | null;
  title?: string;
}>(), {
  selectedId: '',
  userLocation: null,
  title: '选择自提点',
});

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'select', location: PickupLocation): void;
}>();

const keyword = ref('');
const currentPage = ref(1);
const pageSize = 15;
const tempSelectedId = ref(props.selectedId);

// 搜索过滤
const filteredLocations = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return props.locations;
  return props.locations.filter(l =>
    l.name.includes(kw) || l.address.includes(kw)
  );
});

// 分页
const pagedLocations = computed(() =>
  filteredLocations.value.slice(0, currentPage.value * pageSize)
);

function loadMore() {
  if (pagedLocations.value.length < filteredLocations.value.length) {
    currentPage.value++;
  }
}

function onKeywordChange() {
  currentPage.value = 1;
}

function selectItem(loc: PickupLocation) {
  tempSelectedId.value = loc.id;
}

function getDistance(loc: PickupLocation): string | null {
  if (!props.userLocation || !loc.coordinates) return null;
  const dist = haversineDistance(
    props.userLocation.lat,
    props.userLocation.lng,
    loc.coordinates.lat,
    loc.coordinates.lng
  );
  return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function close() {
  emit('update:visible', false);
}

function confirm() {
  const selected = props.locations.find(l => l.id === tempSelectedId.value);
  if (selected) {
    emit('select', selected);
  }
  emit('update:visible', false);
}
</script>

<style lang="scss" scoped>
.sheet-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); z-index: 999;
  display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0;
  padding: 30rpx; max-height: 70vh; display: flex; flex-direction: column;
  &__head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20rpx;
  }
  &__title { font-size: 32rpx; font-weight: bold; }
  &__close { font-size: 36rpx; color: #999; padding: 0 10rpx; }
  &__search {
    height: 72rpx; border: 1rpx solid #e8e8ea; border-radius: 8rpx;
    padding: 0 20rpx; font-size: 28rpx; margin-bottom: 20rpx;
  }
  &__list { flex: 1; max-height: 50vh; }
  &__item {
    padding: 24rpx 0; border-bottom: 1rpx solid #e8e8ea;
    &.active { background: #f0ecff; }
    &-name { font-size: 28rpx; font-weight: bold; display: block; }
    &-addr { font-size: 24rpx; color: #999; display: block; margin-top: 6rpx; }
    &-meta { display: flex; gap: 20rpx; margin-top: 8rpx; }
    &-hours { font-size: 24rpx; color: #999; }
    &-dist { font-size: 24rpx; color: #ff8a3d; }
  }
  &__empty {
    padding: 60rpx 0; text-align: center;
    text { font-size: 28rpx; color: #999; }
  }
  &__loading-more {
    padding: 20rpx 0; text-align: center;
    text { font-size: 24rpx; color: #999; }
  }
  &__confirm {
    margin-top: 20rpx; height: 90rpx; background: #6b4fff;
    color: #fff; font-size: 32rpx; border-radius: 8rpx; border: none;
    &[disabled] { opacity: 0.5; }
  }
}
</style>
```

- [ ] **Step 2: 提交**

```bash
cd e:\code\vshop
git add src/components/PickupLocationSheet.vue
git commit --no-verify -m "feat: add PickupLocationSheet component with search and pagination"
```

---

## Task 3: 重构 checkout.vue — Tab 分段控件

**Files:**
- Modify: `src/pkg-order/pages/checkout.vue`

- [ ] **Step 1: 替换 template 的配送方式 section**

将 `checkout.vue` 第 54-62 行的配送方式 radio section：

```vue
    <view class="section">
      <text class="section__title">配送方式</text>
      <view v-for="sm in shippingMethods" :key="sm.id"
        class="radio-item" :class="{ active: selectedShipping === sm.id }"
        @click="selectedShipping = sm.id">
        <text>{{ sm.name }}</text>
        <text class="radio-item__price">¥{{ (sm.priceWithTax / 100).toFixed(2) }}</text>
      </view>
    </view>
```

替换为：

```vue
    <view class="section">
      <text class="section__title">配送方式</text>
      <view class="seg-control">
        <view
          v-for="tab in shippingTabs"
          :key="tab.category"
          class="seg-control__item"
          :class="{ active: activeTab === tab.category }"
          @click="switchTab(tab.category)"
        >
          <text>{{ tab.label }}</text>
        </view>
      </view>
    </view>
```

- [ ] **Step 2: 替换自提点 section，接入弹窗组件**

将 `checkout.vue` 第 20-52 行的自提点 section：

```vue
    <!-- 自提点选择（非邮寄方式显示） -->
    <view class="section" v-if="shippingCategory !== 'shipping'">
      <text class="section__title">
        {{ shippingCategory === 'employee-pickup' ? '企业职工自提点' : '自提点选择' }}
      </text>
      <!-- 门店自提 / 菜鸟驿站自提 -->
      <template v-if="shippingCategory === 'store-pickup' || shippingCategory === 'point-pickup'">
        <view v-for="loc in pickupLocations" :key="loc.id"
          class="pickup-item" :class="{ active: selectedPickupLocation?.id === loc.id }"
          @click="selectedPickupLocation = loc">
          <text class="pickup-item__name">{{ loc.name }}</text>
          <text class="pickup-item__addr">{{ loc.address }}</text>
          <text class="pickup-item__hours" v-if="loc.businessHours">营业: {{ loc.businessHours }}</text>
        </view>
        <view v-if="pickupLocations.length === 0" class="pickup-empty">
          <text>暂无可用自提点</text>
        </view>
      </template>
      <!-- 企业职工自提 -->
      <template v-if="shippingCategory === 'employee-pickup'">
        <view v-for="loc in employeePickupLocations" :key="loc.id"
          class="pickup-item" :class="{ active: selectedPickupLocation?.id === loc.id }"
          @click="selectedPickupLocation = loc">
          <text class="pickup-item__name">{{ loc.name }}</text>
          <text class="pickup-item__addr">{{ loc.address }}</text>
          <text class="pickup-item__hours" v-if="loc.businessHours">营业: {{ loc.businessHours }}</text>
        </view>
        <view v-if="employeePickupLocations.length === 0" class="pickup-empty">
          <text>您尚未绑定企业职工身份</text>
          <text class="pickup-empty__hint">请联系客服绑定企业自提点</text>
        </view>
      </template>
    </view>
```

替换为：

```vue
    <!-- 自提点选择（非邮寄方式显示） -->
    <view class="section" v-if="shippingCategory !== 'shipping'">
      <text class="section__title">
        {{ shippingCategory === 'employee-pickup' ? '企业职工自提点' : '自提点选择' }}
      </text>
      <!-- 已选自提点卡片 -->
      <view v-if="selectedPickupLocation" class="pickup-card" @click="showPickupSheet = true">
        <text class="pickup-card__name">{{ selectedPickupLocation.name }}</text>
        <text class="pickup-card__addr">{{ selectedPickupLocation.address }}</text>
        <view class="pickup-card__meta">
          <text v-if="selectedPickupLocation.businessHours" class="pickup-card__hours">营业: {{ selectedPickupLocation.businessHours }}</text>
          <text v-if="pickupDistance" class="pickup-card__dist">{{ pickupDistance }}</text>
        </view>
        <text class="pickup-card__change">更换自提点 ▾</text>
      </view>
      <!-- 空状态 -->
      <view v-else class="pickup-empty">
        <template v-if="shippingCategory === 'employee-pickup' && employeePickupLocations.length === 0">
          <text>您尚未绑定企业职工身份</text>
          <text class="pickup-empty__hint">请联系客服绑定企业自提点</text>
        </template>
        <text v-else>暂无可用自提点</text>
      </view>
    </view>

    <!-- 自提点选择弹窗 -->
    <PickupLocationSheet
      v-model:visible="showPickupSheet"
      :locations="currentPickupLocations"
      :selected-id="selectedPickupLocation?.id"
      :user-location="userLocation"
      :title="shippingCategory === 'employee-pickup' ? '选择企业职工自提点' : '选择自提点'"
      @select="onPickupSelect"
    />
```

- [ ] **Step 3: 在 script 顶部添加 import**

在 `checkout.vue` 的 `<script setup lang="ts">` 块，第 90 行 `import { ref, computed, onMounted, watch } from 'vue';` 之后添加：

```typescript
import PickupLocationSheet from '../../components/PickupLocationSheet.vue';
import type { PickupLocation } from '../../types/pickup';
```

- [ ] **Step 4: 替换 script 中的状态与逻辑**

将 `checkout.vue` 第 101-185 行（从 `type ShippingCategory` 到 `watch(selectedShipping, ...)` 结束）替换为：

```typescript
type ShippingCategory = 'shipping' | 'store-pickup' | 'point-pickup' | 'employee-pickup';

const cart = useCartStore();
const tenant = useTenantStore();
const ui = useUIStore();
const shippingMethods = ref<any[]>([]);
const paymentMethods = ref<any[]>([]);
const selectedShipping = ref('');
const selectedPayment = ref('');
const submitting = ref(false);
const showAddressPicker = ref(false);
const customerAddresses = ref<any[]>([]);
const savedAddresses = ref<any[]>([]);
const selectedAddress = ref<any>(null);
const balance = ref(0);
const address = ref({ fullName: '', phoneNumber: '', streetLine1: '', city: '', province: '', countryCode: 'CN' });

// 自提点相关 state
const shippingCategory = ref<ShippingCategory>('shipping');
const activeTab = ref<ShippingCategory>('shipping');
const selectedPickupLocation = ref<PickupLocation | null>(null);
const pickupLocations = ref<PickupLocation[]>([]);
const employeePickupLocations = ref<PickupLocation[]>([]);
const userLocation = ref<{ lat: number; lng: number } | null>(null);
const showPickupSheet = ref(false);

const balanceYuan = computed(() => (balance.value / 100).toFixed(2));
const shippingFee = computed(() => {
    const sm = shippingMethods.value.find(s => s.id === selectedShipping.value);
    return sm ? (sm.priceWithTax / 100).toFixed(2) : '0.00';
});

// 当前 tab 对应的自提点列表
const currentPickupLocations = computed(() =>
    shippingCategory.value === 'employee-pickup' ? employeePickupLocations.value : pickupLocations.value
);

// 已选自提点距离显示
const pickupDistance = computed(() => {
    if (!userLocation.value || !selectedPickupLocation.value?.coordinates) return null;
    const dist = haversineDistance(
        userLocation.value.lat,
        userLocation.value.lng,
        selectedPickupLocation.value.coordinates.lat,
        selectedPickupLocation.value.coordinates.lng
    );
    return dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`;
});

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPaymentIcon(code: string): string {
    const icons: Record<string, string> = { 'wechatpay': '💳', 'alipay': '💰', 'cod': '📦', 'balance-pay': '💵' };
    return icons[code] || '💳';
}

function categorizeShipping(sm: any): ShippingCategory {
    if (sm.code === 'store-pickup') return 'store-pickup';
    if (sm.code === 'pickup-point') return 'point-pickup';
    if (sm.code === 'employee-pickup') return 'employee-pickup';
    return 'shipping';
}

function tabLabel(cat: ShippingCategory): string {
    const labels: Record<ShippingCategory, string> = {
        shipping: '快递配送',
        'store-pickup': '门店自提',
        'point-pickup': '菜鸟驿站',
        'employee-pickup': '职工自提',
    };
    return labels[cat] || '配送方式';
}

// 按租户启用的配送方式分组为 Tab
const shippingTabs = computed(() => {
    const tabs: { category: ShippingCategory; label: string; method: any }[] = [];
    for (const sm of shippingMethods.value) {
        const cat = categorizeShipping(sm);
        if (!tabs.find(t => t.category === cat)) {
            tabs.push({ category: cat, label: tabLabel(cat), method: sm });
        }
    }
    return tabs;
});

function getLocationWithTimeout(ms: number): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ms);
        uni.getLocation({
            type: 'gcj02',
            success: (res: any) => { clearTimeout(timer); resolve({ lat: res.latitude, lng: res.longitude }); },
            fail: () => { clearTimeout(timer); resolve(null); },
        });
    });
}

async function resolveLocation(): Promise<{ lat: number; lng: number } | null> {
    const pos = await getLocationWithTimeout(3000);
    if (pos) { userLocation.value = pos; return pos; }
    const tenantStore = useTenantStore();
    if (tenantStore.defaultLocation) return tenantStore.defaultLocation;
    return null;
}

// 切换 Tab
async function switchTab(category: ShippingCategory) {
    activeTab.value = category;
    shippingCategory.value = category;
    selectedPickupLocation.value = null;

    const tab = shippingTabs.value.find(t => t.category === category);
    if (!tab) return;
    selectedShipping.value = tab.method.id;

    if (category === 'shipping') {
        // 快递方式：同步 shipping method 到后端
        try { await setOrderShippingMethod([tab.method.id]); } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
        return;
    }

    const location = await resolveLocation();
    if (category === 'employee-pickup') {
        try {
            const res: any = await getEmployeePickupLocations(location);
            employeePickupLocations.value = res.employeePickupLocations || [];
            if (employeePickupLocations.value.length > 0) {
                selectedPickupLocation.value = employeePickupLocations.value[0];
            }
        } catch (e) { console.warn('[checkout] load employeePickupLocations failed', e); }
    } else {
        const type = category === 'store-pickup' ? 'store' : 'point';
        try {
            const res: any = await getPickupLocations(type, location);
            pickupLocations.value = res.pickupLocations || [];
            if (pickupLocations.value.length > 0) {
                selectedPickupLocation.value = pickupLocations.value[0];
            }
        } catch (e) { console.warn('[checkout] load pickupLocations failed', e); }
    }
    // 同步 shipping method 到后端
    try { await setOrderShippingMethod([tab.method.id]); } catch (e) { console.warn('[checkout] setOrderShippingMethod failed', e); }
}

// 弹窗选中回调
function onPickupSelect(loc: PickupLocation) {
    selectedPickupLocation.value = loc;
}
```

- [ ] **Step 5: 修改 onMounted 初始化逻辑**

将 `checkout.vue` 的 `onMounted` 块（原第 187-201 行）替换为：

```typescript
onMounted(async () => {
    // 加载租户 channel 配置（employeePickupMode、defaultLocation）
    await tenant.loadChannelConfig();
    // Load saved addresses
    try { const custRes: any = await getActiveCustomer(); customerAddresses.value = custRes.activeCustomer?.addresses || []; if (customerAddresses.value.length > 0) { selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0]; } } catch (e) {}
    try {
        const [shipRes, payRes]: any = await Promise.all([getEligibleShippingMethods(), getEligiblePaymentMethods()]);
        shippingMethods.value = shipRes.eligibleShippingMethods || [];
        paymentMethods.value = (payRes.eligiblePaymentMethods || []).filter((p: any) => p.isEligible);
        if (paymentMethods.value.length > 0) selectedPayment.value = paymentMethods.value[0].code;
        // Load balance
        try { const balRes: any = await getMyBalance(); balance.value = balRes.myRechargeBalance || 0; } catch (e) {}
        // 默认选中第一个 Tab
        if (shippingTabs.value.length > 0) {
            await switchTab(shippingTabs.value[0].category);
        }
    } catch (e) { console.error(e); }
});
```

- [ ] **Step 6: 添加 Tab 分段控件样式**

在 `checkout.vue` 的 `<style lang="scss" scoped>` 块末尾（`}` 闭合 `.pickup-empty` 之后）添加：

```scss
.seg-control {
    display: flex; gap: 8rpx; background: #f7f7f8; padding: 8rpx; border-radius: 8rpx; margin-bottom: 16rpx;
    &__item {
        flex: 1; text-align: center; padding: 16rpx 8rpx; border-radius: 8rpx;
        font-size: 24rpx; color: #8a8a90; transition: all 0.15s;
        &.active { background: #fff; color: #6b4fff; font-weight: 500; box-shadow: 0 1rpx 4rpx rgba(0,0,0,0.06); }
    }
}
.pickup-card {
    padding: 24rpx 0; border-bottom: 1rpx solid $border-color; position: relative;
    &__name { font-size: 28rpx; font-weight: bold; display: block; }
    &__addr { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; }
    &__meta { display: flex; gap: 20rpx; margin-top: 8rpx; }
    &__hours { font-size: 24rpx; color: $text-color-secondary; }
    &__dist { font-size: 24rpx; color: #ff8a3d; }
    &__change { position: absolute; right: 0; top: 24rpx; font-size: 24rpx; color: $brand-color; }
}
```

- [ ] **Step 7: 提交**

```bash
cd e:\code\vshop
git add src/pkg-order/pages/checkout.vue
git commit --no-verify -m "refactor: checkout shipping methods to tab control with pickup sheet"
```

---

## Task 4: 手动验证

**Files:** 无（运行时验证）

- [ ] **Step 1: 确认 vendure 和 vshop 服务运行中**

确认 `http://localhost:3000/shop-api`（Vendure）和 `http://localhost:5180`（VShop）可访问。若未运行，在对应目录执行 `npm run dev` 和 `npm run dev:h5`。

- [ ] **Step 2: 访问 checkout 页面**

浏览器打开 `http://localhost:5180/#/pages/cart/index`，添加商品到购物车，进入 checkout 页面。

- [ ] **Step 3: 验证 Tab 分段控件**

确认页面顶部显示 Tab 分段控件（快递配送 / 门店自提 / 菜鸟驿站 / 职工自提），Tab 数量与租户启用的配送方式一致。

- [ ] **Step 4: 验证 Tab 切换加载自提点**

点击"门店自提"Tab，确认下方显示自提点卡片（名称、地址、距离、营业时间），默认选中第一个。

- [ ] **Step 5: 验证自提点弹窗**

点击"更换自提点"按钮，确认底部抽屉弹出，显示搜索框和自提点列表。输入关键词搜索，确认列表过滤。滚动到底，确认加载更多（每页 15 条）。选中一个自提点，点击"确认"，确认弹窗关闭且卡片更新。

- [ ] **Step 6: 验证提交订单**

选择自提点后点击"提交订单"，确认订单提交成功，跳转到支付结果页。

- [ ] **Step 7: 验证职工自提空状态**

切换到"职工自提"Tab（若未绑定企业身份），确认显示"您尚未绑定企业职工身份"提示。

<template>
  <view class="checkout-page">
    <!-- 收货地址（仅邮寄方式显示） -->
    <view class="section" v-if="shippingCategory === 'shipping'">
      <text class="section__title">收货地址</text>
      <view class="address-block" v-if="selectedAddress" @click="showAddressPicker = true">
        <text class="address-block__name">{{ selectedAddress.fullName }} {{ selectedAddress.phoneNumber }}</text>
        <text class="address-block__detail">{{ selectedAddress?.streetLine1 }} {{ selectedAddress?.city }} {{ selectedAddress?.province }}</text>
        <text class="address-block__change">更换</text>
      </view>
      <view v-else>
        <input v-model="address.fullName" placeholder="收货人姓名" class="input" />
        <input v-model="address.phoneNumber" placeholder="手机号" type="number" class="input" />
        <input v-model="address.streetLine1" placeholder="详细地址" class="input" />
        <input v-model="address.city" placeholder="城市" class="input" />
        <input v-model="address.province" placeholder="省份" class="input" />
      </view>
    </view>

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

    <view class="section">
      <text class="section__title">支付方式</text>
      <view v-for="pm in paymentMethods" :key="pm.id"
        class="radio-item" :class="{ active: selectedPayment === pm.code }"
        @click="selectedPayment = pm.code">
        <view class="radio-item__left">
          <text class="radio-item__icon">{{ getPaymentIcon(pm.code) }}</text>
          <text>{{ pm.name }}</text>
        </view>
        <text v-if="pm.code === 'balance-pay'" class="radio-item__balance">余额: ¥{{ balanceYuan }}</text>
      </view>
    </view>

    <view class="checkout-page__summary" v-if="cart.order">
      <view class="summary-row"><text>商品总额</text><text>¥{{ cart.formatPrice(cart.order.subTotalWithTax) }}</text></view>
      <view class="summary-row"><text>运费</text><text>¥{{ shippingFee }}</text></view>
      <view class="summary-row summary-row--total"><text>应付</text><text class="checkout-page__total">¥{{ cart.formatPrice(cart.order.totalWithTax) }}</text></view>
    </view>

    <button class="checkout-page__submit" :disabled="submitting" @click="submitOrder">
      {{ submitting ? '处理中...' : '提交订单' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import PickupLocationSheet from '../../components/PickupLocationSheet.vue';
import type { PickupLocation } from '../../types/pickup';
import { useCartStore } from '../../stores/cart';
import { useTenantStore } from '../../stores/tenant';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder, getEligibleShippingMethods } from '../../api/queries/order';
import { getEligiblePaymentMethods, getActiveCustomer } from '../../api/queries/user';
import { getPickupLocations, getEmployeePickupLocations } from '../../api/queries/pickup';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder, setOrderPickupLocation } from '../../api/mutations/checkout';
import { getMyBalance } from '../../api/mutations/recharge';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';

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

async function submitOrder() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        ui.showLoading();
        if (shippingCategory.value === 'shipping') {
            // 邮寄方式：设置收货地址
            const addr = selectedAddress.value || address.value;
            if (!addr.fullName || !addr.phoneNumber || !addr.streetLine1) {
                ui.showToast('请填写收货地址');
                ui.hideLoading();
                submitting.value = false;
                return;
            }
            await setOrderShippingAddress(addr);
        } else {
            // 自提方式：设置自提点
            if (!selectedPickupLocation.value) {
                ui.showToast('请选择自提点');
                ui.hideLoading();
                submitting.value = false;
                return;
            }
            await setOrderPickupLocation(selectedPickupLocation.value.id, shippingCategory.value);
        }
        // Set shipping method
        if (selectedShipping.value) await setOrderShippingMethod([selectedShipping.value]);
        // Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        // Add payment
        const payRes: any = await addPaymentToOrder(selectedPayment.value);
        const order = payRes.addPaymentToOrder;
        if (order?.state === 'PaymentSettled' || order?.state === 'PaymentAuthorized') {
            uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + order.code + '&status=success' });
        } else {
            // Handle platform-specific payment flow
            const result = await handlePayment(selectedPayment.value as PaymentMethod, { ...order, orderCode: order?.code });
            if (result.success) {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=success' });
            } else {
                uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + (order?.code || '') + '&status=pending' });
            }
        }
    } catch (e: any) { ui.showToast(e.message); }
    ui.hideLoading();
    submitting.value = false;
}
</script>

<style lang="scss" scoped>
.checkout-page {
    padding: 20rpx; padding-bottom: 140rpx;
    &__summary { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-top: 20rpx; }
    &__total { font-size: 36rpx; color: $price-color; font-weight: bold; }
    &__submit { position: fixed; bottom: 20rpx; left: 20rpx; right: 20rpx; height: 90rpx; background: $brand-color; color: #fff; font-size: 32rpx; border-radius: $radius-md; border: none; }
    &__submit[disabled] { opacity: 0.6; }
}
.section {
    background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 20rpx;
    &__title { font-size: 30rpx; font-weight: bold; margin-bottom: 16rpx; display: block; }
}
.address-block {
    padding: 16rpx 0; position: relative;
    &__detail { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; }
    &__change { position: absolute; right: 0; top: 16rpx; font-size: 24rpx; color: $brand-color; }
}
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
.radio-item {
    display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $border-color;
    &.active { color: $brand-color; }
    &__left { display: flex; align-items: center; gap: 12rpx; }
    &__icon { font-size: 36rpx; }
    &__price { color: $text-color-secondary; }
    &__balance { font-size: 24rpx; color: $text-color-secondary; }
}
.addr-modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.addr-modal { background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0; padding: 30rpx; max-height: 70vh; overflow-y: auto; &__title { font-size: 32rpx; font-weight: bold; text-align: center; margin-bottom: 20rpx; display: block; } }
.addr-option { padding: 20rpx; border-bottom: 1rpx solid $border-color; &.selected { background: #fff8f0; } &__name { font-size: 28rpx; font-weight: bold; display: block; } &__detail { font-size: 24rpx; color: $text-color-secondary; margin-top: 6rpx; display: block; } &--add { text-align: center; color: $brand-color; font-size: 28rpx; padding: 30rpx; } }
.summary-row {
    display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 28rpx;
    &--total { padding-top: 16rpx; border-top: 1rpx solid $border-color; margin-top: 8rpx; }
}
.pickup-item {
    padding: 20rpx 0; border-bottom: 1rpx solid $border-color;
    &.active { color: $brand-color; }
    &__name { font-size: 28rpx; font-weight: bold; display: block; }
    &__addr { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; }
    &__hours { font-size: 24rpx; color: $text-color-secondary; display: block; margin-top: 4rpx; }
}
.pickup-empty {
    padding: 40rpx 0; text-align: center;
    text { font-size: 28rpx; color: $text-color-secondary; display: block; }
    &__hint { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; }
}
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
</style>

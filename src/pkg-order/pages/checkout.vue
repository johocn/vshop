<template>
  <view class="checkout-page">
    <view class="section">
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

    <view class="section">
      <text class="section__title">配送方式</text>
      <view v-for="sm in shippingMethods" :key="sm.id"
        class="radio-item" :class="{ active: selectedShipping === sm.id }"
        @click="selectedShipping = sm.id">
        <text>{{ sm.name }}</text>
        <text class="radio-item__price">¥{{ (sm.priceWithTax / 100).toFixed(2) }}</text>
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
import { ref, computed, onMounted } from 'vue';
import { useCartStore } from '../../stores/cart';
import { useTenantStore } from '../../stores/tenant';
import { useUIStore } from '../../stores/ui';
import { getActiveOrder, getEligibleShippingMethods } from '../../api/queries/order';
import { getEligiblePaymentMethods, getActiveCustomer } from '../../api/queries/user';
import { setOrderShippingAddress, setOrderShippingMethod, transitionOrderToState, addPaymentToOrder } from '../../api/mutations/checkout';
import { getMyBalance } from '../../api/mutations/recharge';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';

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

const balanceYuan = computed(() => (balance.value / 100).toFixed(2));
const shippingFee = computed(() => {
    const sm = shippingMethods.value.find(s => s.id === selectedShipping.value);
    return sm ? (sm.priceWithTax / 100).toFixed(2) : '0.00';
});

function getPaymentIcon(code: string): string {
    const icons: Record<string, string> = { 'wechatpay': '💳', 'alipay': '💰', 'cod': '📦', 'balance-pay': '💵' };
    return icons[code] || '💳';
}

onMounted(async () => {
    // Load saved addresses
    try { const custRes: any = await getActiveCustomer(); customerAddresses.value = custRes.activeCustomer?.addresses || []; if (customerAddresses.value.length > 0) { selectedAddress.value = customerAddresses.value.find((a: any) => a.defaultShippingAddress) || customerAddresses.value[0]; } } catch (e) {}
    try {
        const [shipRes, payRes]: any = await Promise.all([getEligibleShippingMethods(), getEligiblePaymentMethods()]);
        shippingMethods.value = shipRes.eligibleShippingMethods || [];
        paymentMethods.value = (payRes.eligiblePaymentMethods || []).filter((p: any) => p.isEligible);
        if (shippingMethods.value.length > 0) selectedShipping.value = shippingMethods.value[0].id;
        if (paymentMethods.value.length > 0) selectedPayment.value = paymentMethods.value[0].code;
        // Load balance
        try { const balRes: any = await getMyBalance(); balance.value = balRes.myRechargeBalance || 0; } catch (e) {}
    } catch (e) { console.error(e); }
});

async function submitOrder() {
    if (submitting.value) return;
    submitting.value = true;
    try {
        ui.showLoading();
        // 1. Set shipping address
        const addr = selectedAddress.value || address.value;
        await setOrderShippingAddress(addr);
        // 2. Set shipping method
        if (selectedShipping.value) await setOrderShippingMethod([selectedShipping.value]);
        // 3. Transition to ArrangingPayment
        await transitionOrderToState('ArrangingPayment');
        // 4. Add payment
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
</style>

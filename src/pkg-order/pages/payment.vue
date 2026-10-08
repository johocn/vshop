<template>
  <view class="payment-page">
    <view v-if="loading" class="pay-block">
      <text class="pay-hint">加载中…</text>
    </view>

    <view v-else-if="blockedReason" class="pay-block">
      <text class="pay-hint">{{ blockedReason }}</text>
      <button class="pay-btn" @click="backToOrder">返回订单</button>
    </view>

    <template v-else>
      <view class="pay-order">
        <view class="pay-order__row"><text>订单号</text><text>{{ order.code }}</text></view>
        <view class="pay-order__row pay-order__row--total">
          <text>应付金额</text>
          <text class="pay-order__total">¥{{ (order.totalWithTax / 100).toFixed(2) }}</text>
        </view>
      </view>

      <view class="pay-methods">
        <text class="pay-methods__title">选择支付方式</text>
        <view
          v-for="m in methods"
          :key="m.code"
          class="pay-method"
          :class="{ 'pay-method--active': selected === m.code }"
          @click="selected = m.code"
        >
          <text class="pay-method__name">{{ m.name }}</text>
          <text v-if="m.description" class="pay-method__desc">{{ m.description }}</text>
        </view>
        <EmptyState v-if="methods.length === 0" text="暂无可用支付方式" />
      </view>

      <button class="pay-btn pay-btn--primary" :disabled="!selected || submitting" @click="pay">
        {{ submitting ? '支付中…' : '立即支付' }}
      </button>
    </template>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderByCode, getActiveOrder } from '../../api/queries/order';
import { getEligiblePaymentMethods } from '../../api/queries/user';
import { addPaymentToOrder, transitionOrderToState } from '../../api/mutations/checkout';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';
import EmptyState from '../../components/EmptyState.vue';

const PAYABLE_STATES = ['Created', 'AddingItems', 'ArrangingPayment'];

const order = ref<any>(null);
const methods = ref<any[]>([]);
const selected = ref('');
const loading = ref(true);
const submitting = ref(false);
const blockedReason = ref('');
let orderCode = '';

onLoad((query: any) => {
    orderCode = query?.code || '';
    init();
});

/**
 * 待付款订单续付。
 *
 * 关键约束：shop-api 的 addPaymentToOrder 只作用于「当前 active order」，无法按订单 id 支付。
 * 因此必须先确认待付订单就是当前活动订单，否则会误付另一笔订单——不匹配时直接拦截。
 */
async function init() {
    loading.value = true;
    blockedReason.value = '';
    try {
        if (!orderCode) { blockedReason.value = '缺少订单号'; return; }
        const res: any = await getOrderByCode(orderCode);
        const o = res?.orderByCode;
        if (!o) { blockedReason.value = '订单不存在'; return; }
        order.value = o;
        if (!PAYABLE_STATES.includes(o.state)) {
            blockedReason.value = '该订单当前状态不可支付';
            return;
        }
        const activeRes: any = await getActiveOrder();
        const active = activeRes?.activeOrder;
        if (!active || String(active.code) !== String(o.code)) {
            blockedReason.value = '该订单已不在当前会话，无法继续支付，请重新下单';
            return;
        }
        if (o.state !== 'ArrangingPayment') {
            await transitionOrderToState('ArrangingPayment');
        }
        const payRes: any = await getEligiblePaymentMethods();
        methods.value = (payRes?.eligiblePaymentMethods || []).filter((m: any) => m.isEligible);
        selected.value = methods.value[0]?.code || '';
    } catch (e: any) {
        blockedReason.value = e?.message || '加载失败';
    } finally {
        loading.value = false;
    }
}

async function pay() {
    if (!selected.value || submitting.value) return;
    submitting.value = true;
    try {
        const method = selected.value as PaymentMethod;
        // openid 由服务端客户档案推导（wechatOpenid/wechatMiniOpenid），前端不再传
        const metadata: Record<string, any> = {};
        const payRes: any = await addPaymentToOrder(method, metadata);
        const o = payRes?.addPaymentToOrder;
        if (!o || o.errorCode) throw new Error(o?.message || '支付失败');
        if (o.state === 'PaymentSettled' || o.state === 'PaymentAuthorized') {
            // 即时结算类（balance-pay）必须真正 Settled 才算成功
            if (method === 'balance-pay' && o.state !== 'PaymentSettled') throw new Error('余额支付未完成，请重试');
            uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + encodeURIComponent(o.code) });
            return;
        }
        const lastPayment = o.payments?.[o.payments.length - 1];
        if (method === 'balance-pay') {
            const declined = lastPayment?.state === 'Declined';
            throw new Error(declined ? (lastPayment.errorMessage || '余额不足，支付未完成') : '余额支付未完成，请重试');
        }
        const result = await handlePayment(method, {
            ...lastPayment,
            orderCode: o.code,
            orderState: o.state,
        });
        if (result.success) {
            uni.redirectTo({ url: '/pkg-order/pages/pay-result?code=' + encodeURIComponent(o.code) });
        } else {
            uni.showToast({ title: result.message || '支付未完成', icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || '支付失败', icon: 'none' });
    } finally {
        submitting.value = false;
    }
}

function backToOrder() {
    if (!orderCode) { uni.navigateBack({ delta: 1 }); return; }
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + encodeURIComponent(orderCode) });
}
</script>
<style lang="scss" scoped>
.payment-page { padding: 20rpx; }
.pay-block { display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx; gap: 30rpx; }
.pay-hint { font-size: 28rpx; color: $text-color-secondary; text-align: center; }
.pay-order { background: #fff; border-radius: $radius-md; padding: 30rpx; margin-bottom: 20rpx;
  &__row { display: flex; justify-content: space-between; padding: 10rpx 0; font-size: 27rpx; color: $text-color-secondary;
    &--total { border-top: 1rpx solid $border-color; margin-top: 10rpx; padding-top: 20rpx; color: $text-color; } }
  &__total { font-size: 38rpx; font-weight: bold; color: $price-color; } }
.pay-methods { background: #fff; border-radius: $radius-md; padding: 30rpx; margin-bottom: 30rpx;
  &__title { display: block; font-size: 28rpx; font-weight: bold; margin-bottom: 20rpx; } }
.pay-method { display: flex; flex-direction: column; gap: 6rpx; padding: 24rpx; border: 1rpx solid $border-color; border-radius: $radius-md; margin-bottom: 16rpx;
  &--active { border-color: $brand-color; background: #fff7f2; }
  &__name { font-size: 28rpx; }
  &__desc { font-size: 22rpx; color: $text-color-secondary; } }
.pay-btn { width: 100%; height: 88rpx; font-size: 30rpx; border-radius: $radius-md; border: none; background: #fff; color: $text-color;
  &--primary { background: $brand-color; color: #fff; &[disabled] { opacity: 0.5; } } }
</style>

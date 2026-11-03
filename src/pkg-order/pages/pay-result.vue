<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text v-if="status === 'pending'" class="pay-result__hint">{{ t('payResult.confirmHint') }}</text>
    <text v-if="unpaidCount > 0" class="pay-result__unpaid">{{ t('payResult.unpaidCount', { n: unpaidCount }) }}</text>
    <text v-if="warnText" class="pay-result__warn">{{ warnText }}</text>
    <text v-if="orderCodes.length === 1" class="pay-result__code">{{ t('order.orderNo') }}: {{ orderCodes[0] }}</text>
    <view v-else class="pay-result__codes">
      <text class="pay-result__codes-title">{{ t('payResult.ordersCount', { n: orderCodes.length }) }}</text>
      <view v-for="code in orderCodes" :key="code" class="pay-result__code-item">
        <text>{{ t('order.orderNo') }}: {{ code }}</text>
        <text class="pay-result__code-state">{{ stateLabel(code) }}</text>
        <text class="pay-result__code-link" @click="viewOrder(code)">{{ t('payResult.view') }}</text>
      </view>
    </view>
    <view v-if="unpaidCount > 0" class="pay-result__actions">
      <button class="btn-primary" :disabled="retrying" @click="retryUnpaid">
        {{ retrying ? t('payResult.retrying') : t('payResult.retryPay', { n: unpaidCount }) }}
      </button>
    </view>
    <view class="pay-result__actions">
      <button class="btn-primary" @click="viewOrder(unpaidCodes[0] || orderCodes[0] || '')">{{ primaryLabel }}</button>
      <button v-if="status === 'pending'" class="btn-secondary" :disabled="refreshing" @click="refreshStatus">
        {{ refreshing ? t('common.loading') : t('payResult.refreshStatus') }}
      </button>
      <button class="btn-secondary" @click="goHome">{{ t('payResult.continueShopping') }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { addItemToOrder } from '../../api/mutations/cart';
import { getOrderByCode } from '../../api/queries/order';
import { getMyMarketplaceSellerOrders, payMarketplaceSellerOrder } from '../../api/queries/marketplace';
import { handlePayment, type PaymentMethod } from '../../composables/usePayment';

const { t } = useI18n();
const cart = useCartStore();

const SETTLED_STATES = ['PaymentSettled', 'Complete', 'Delivered', 'Shipped'];
const POLL_INTERVAL = 3000;
const MAX_ATTEMPTS = 20;

const status = ref<'success' | 'pending' | 'fail'>('pending');
const timedOut = ref(false);
const orderCodes = ref<string[]>([]);
const orderStates = ref<Record<string, string>>({});
// 支付失败/未完成、需要用户重试的订单号（聚合单的商家子单常见）
const unpaidCodes = ref<string[]>([]);
// 重试时沿用的支付方式（由结算页透传）
const retryMethod = ref('');
const warnText = ref('');
const refreshing = ref(false);
const retrying = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;
let attempts = 0;

/** 仍未结算的待支付笔数（轮询更新后自动收敛） */
const unpaidCount = computed(() =>
    unpaidCodes.value.filter((c) => !SETTLED_STATES.includes(orderStates.value[c] || '')).length,
);

const statusText = computed(() => {
    if (status.value === 'success') return t('payment.paySuccess');
    if (status.value === 'fail') return t('payment.payFailed');
    if (unpaidCount.value > 0) return t('payResult.partialPending', { n: unpaidCount.value });
    return timedOut.value ? t('payResult.confirming') : t('payment.payPending');
});

/** pending 态主按钮变「继续支付」：跳订单详情，详情页已有「去支付」按钮 */
const primaryLabel = computed(() => (status.value === 'pending' ? t('pointsGoods.continuePay') : t('payResult.viewOrder')));

function stateLabel(code: string): string {
    const st = orderStates.value[code];
    if (!st) return unpaidCodes.value.includes(code) ? t('payResult.unpaid') : t('payResult.querying');
    if (SETTLED_STATES.includes(st)) return t('payResult.paid');
    if (st === 'Cancelled') return t('order.cancelled');
    if (unpaidCodes.value.includes(code)) return t('payResult.unpaid');
    return t('order.pending');
}

/** 全部结算 → success；任一取消 → fail；否则 false（继续轮询） */
function evaluate(): boolean {
    const states = orderCodes.value.map(c => orderStates.value[c]).filter(Boolean);
    if (states.length === 0) return false;
    if (states.every(s => SETTLED_STATES.includes(s))) {
        status.value = 'success';
        return true;
    }
    if (states.some(s => s === 'Cancelled')) {
        status.value = 'fail';
        return true;
    }
    return false;
}

async function pollOnce(): Promise<boolean> {
    for (const code of orderCodes.value) {
        const known = orderStates.value[code];
        if (known && SETTLED_STATES.includes(known)) continue; // 已结算不再查
        try {
            const res: any = await getOrderByCode(code);
            const st = res?.orderByCode?.state;
            if (st) orderStates.value = { ...orderStates.value, [code]: st };
        } catch (e) {
            console.warn('[pay-result] query order failed', code, e); // 网络失败静默重试
        }
    }
    return evaluate();
}

function startPolling() {
    stopPolling();
    attempts = 0;
    timer = setInterval(async () => {
        attempts++;
        const done = await pollOnce();
        if (done || attempts >= MAX_ATTEMPTS) {
            stopPolling();
            if (!done) timedOut.value = true; // 超时：提示确认中，不误判失败
        }
    }, POLL_INTERVAL);
}

function stopPolling() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

onShow(async () => {
    const pending = [...cart.pendingLines];
    if (pending.length > 0) {
        // 进入本页代表本次结算已结束：未勾选行（未购买）必须回填，不能丢弃
        for (const p of pending) {
            try {
                await addItemToOrder(p.variantId, p.quantity);
            } catch (e) {
                console.warn('[pay-result] restore pending line failed', p, e);
            }
        }
        cart.clearPendingLines();
    }
    // 从支付渠道返回/切后台再回来：立即再查一次，避免停留在过期状态
    if (orderCodes.value.length === 0 || status.value === 'success') return;
    const done = await pollOnce();
    if (done) {
        stopPolling();
        return;
    }
    timedOut.value = false;
    startPolling();
});

onLoad((query: any) => {
    // 不再信任 URL status：真实状态以订单查询轮询为准；
    // unpaid/method 只用于展示「N 笔待支付」与重试入口，最终仍以轮询结果为准。
    const single = query?.code;
    const multi = query?.codes;
    if (single) {
        orderCodes.value = [single];
    } else if (multi) {
        orderCodes.value = String(multi).split(',').filter(Boolean);
    }
    if (query?.unpaid) {
        unpaidCodes.value = String(query.unpaid).split(',').filter(Boolean);
    }
    if (query?.method) {
        retryMethod.value = String(query.method);
    }
    if (query?.warn === 'seller-list-unavailable') {
        warnText.value = t('payResult.sellerListWarn');
    }
    if (orderCodes.value.length > 0) {
        startPolling();
    } else {
        status.value = 'fail';
    }
});

onUnload(() => stopPolling());

/** 手动刷新：重查一次并恢复轮询（超时后不再永久 pending） */
async function refreshStatus() {
    if (refreshing.value || orderCodes.value.length === 0) return;
    refreshing.value = true;
    try {
        timedOut.value = false;
        const done = await pollOnce();
        if (done) {
            stopPolling();
        } else {
            startPolling();
            uni.showToast({ title: t('payResult.stillPending'), icon: 'none' });
        }
    } finally {
        refreshing.value = false;
    }
}

/**
 * 重试未支付子单：聚合单的商家子单由 payMarketplaceSellerOrder(orderId) 支持按单重付，
 * 不依赖 active order（与 addPaymentToOrder 的会话限制不同）。
 */
async function retryUnpaid() {
    if (retrying.value || unpaidCodes.value.length === 0) return;
    if (!retryMethod.value) {
        uni.showToast({ title: t('payResult.retryNoMethod'), icon: 'none' });
        return;
    }
    retrying.value = true;
    let failed = 0;
    try {
        const listRes: any = await getMyMarketplaceSellerOrders();
        const subs = listRes?.myMarketplaceSellerOrders || [];
        for (const code of unpaidCodes.value) {
            const sub = subs.find((o: any) => o.code === code && o.state === 'ArrangingPayment');
            if (!sub) continue;
            try {
                const payRes: any = await payMarketplaceSellerOrder(sub.id, retryMethod.value, {});
                const order = payRes?.payMarketplaceSellerOrder;
                if (!order || order.errorCode) throw new Error(order?.message || '');
                if (order.state === 'PaymentSettled' || order.state === 'PaymentAuthorized') continue;
                const lastPayment = order.payments?.[order.payments.length - 1];
                const result = await handlePayment(retryMethod.value as PaymentMethod, {
                    ...lastPayment,
                    orderCode: order.code,
                    orderState: order.state,
                });
                if (!result.success) throw new Error(result.message || '');
            } catch (e) {
                failed++;
                console.warn('[pay-result] retry unpaid order failed', code, e);
            }
        }
        const done = await pollOnce();
        if (done) {
            stopPolling();
        } else if (failed === 0) {
            startPolling();
        }
        if (failed > 0) {
            uni.showToast({ title: t('payResult.retryFailed', { n: failed }), icon: 'none' });
        }
    } catch (e: any) {
        console.warn('[pay-result] retryUnpaid failed', e);
        uni.showToast({ title: t('payResult.retryNoMethod'), icon: 'none' });
    } finally {
        retrying.value = false;
    }
}

function viewOrder(code: string) {
    if (!code) return;
    uni.redirectTo({ url: '/pkg-order/pages/order-detail?code=' + code });
}
function goHome() {
    uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style lang="scss" scoped>
.pay-result {
    min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 120rpx 40rpx;
    &__icon { margin-bottom: 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; margin-bottom: 16rpx; }
    &__hint { font-size: 24rpx; color: $text-color-secondary; margin-bottom: 16rpx; }
    &__unpaid { font-size: 26rpx; color: #cf1322; font-weight: bold; margin-bottom: 16rpx; }
    &__warn { font-size: 24rpx; color: #b8860b; margin-bottom: 16rpx; text-align: center; }
    &__code { font-size: 26rpx; color: $text-color-secondary; margin-bottom: 60rpx; }
    &__codes { width: 100%; margin-bottom: 60rpx; }
    &__codes-title { display: block; font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; text-align: center; }
    &__code-item { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 20rpx; background: #f7f7f7; border-radius: $radius-md; margin-bottom: 12rpx; font-size: 26rpx; color: $text-color-secondary; }
    &__code-state { color: $brand-color; }
    &__code-link { color: $brand-color; }
    &__actions { width: 100%; display: flex; flex-direction: column; gap: 20rpx; }
}
.btn-primary { background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; border: none; }
.btn-secondary { background: #fff; color: $text-color; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
</style>

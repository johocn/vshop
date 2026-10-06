<template>
  <view class="pay-result">
    <view class="pay-result__icon">
      <text v-if="status === 'success'" style="font-size: 120rpx;">✅</text>
      <text v-else-if="status === 'pending'" style="font-size: 120rpx;">⏳</text>
      <text v-else style="font-size: 120rpx;">❌</text>
    </view>
    <text class="pay-result__title">{{ statusText }}</text>
    <text v-if="status === 'pending'" class="pay-result__hint">支付确认中，如已扣款稍后自动到账</text>
    <text v-if="orderCodes.length === 1" class="pay-result__code">订单号: {{ orderCodes[0] }}</text>
    <view v-else class="pay-result__codes">
      <text class="pay-result__codes-title">本次共生成 {{ orderCodes.length }} 笔订单</text>
      <view v-for="code in orderCodes" :key="code" class="pay-result__code-item">
        <text>订单号: {{ code }}</text>
        <text class="pay-result__code-state">{{ stateLabel(code) }}</text>
        <text class="pay-result__code-link" @click="viewOrder(code)">查看</text>
      </view>
    </view>
    <view class="pay-result__actions">
      <button class="btn-primary" @click="viewOrder(orderCodes[0] || '')">{{ primaryLabel }}</button>
      <button class="btn-secondary" @click="goHome">继续购物</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { addItemToOrder } from '../../api/mutations/cart';
import { getOrderByCode } from '../../api/queries/order';

const cart = useCartStore();

const SETTLED_STATES = ['PaymentSettled', 'Complete', 'Delivered', 'Shipped'];
const POLL_INTERVAL = 3000;
const MAX_ATTEMPTS = 20;

const status = ref<'success' | 'pending' | 'fail'>('pending');
const timedOut = ref(false);
const orderCodes = ref<string[]>([]);
const orderStates = ref<Record<string, string>>({});
let timer: ReturnType<typeof setInterval> | null = null;
let attempts = 0;

const statusText = computed(() => {
    switch (status.value) {
        case 'success': return '支付成功';
        case 'pending': return timedOut.value ? '支付确认中' : '等待支付确认';
        default: return '支付失败';
    }
});

/** pending 态主按钮变「继续支付」：跳订单详情，详情页已有「去支付」按钮 */
const primaryLabel = computed(() => (status.value === 'pending' ? '继续支付' : '查看订单'));

function stateLabel(code: string): string {
    const st = orderStates.value[code];
    if (!st) return '查询中';
    if (SETTLED_STATES.includes(st)) return '已支付';
    if (st === 'Cancelled') return '已取消';
    return '待支付';
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

onLoad((query: any) => {
    // 不再信任 URL status：真实状态以订单查询轮询为准
    const single = query?.code;
    const multi = query?.codes;
    if (single) {
        orderCodes.value = [single];
    } else if (multi) {
        orderCodes.value = String(multi).split(',').filter(Boolean);
    }
    if (orderCodes.value.length > 0) {
        startPolling();
    } else {
        status.value = 'fail';
    }
});

onUnload(() => stopPolling());

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

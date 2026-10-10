<template>
  <view class="pgo-page">
    <!-- 状态 tabs -->
    <view class="pgo-tabs">
      <view
        v-for="tab in TABS"
        :key="tab.key"
        class="pgo-tab"
        :class="{ 'pgo-tab--active': status === tab.key }"
        @click="switchTab(tab.key)"
      >{{ statusLabel(tab.key) }}</view>
    </view>

    <!-- 订单卡 -->
    <view
      v-for="o in items"
      :key="o.id"
      class="pgo-card"
      @click="toggleExpand(o.id)"
    >
      <view class="pgo-card__head">
        <text class="pgo-card__code">{{ t('pointsGoods.orderNo') }} {{ o.code }}</text>
        <text class="pgo-card__status" :style="{ color: statusColor(o.status) }">{{ statusLabel(o.status) }}</text>
      </view>
      <view class="pgo-card__body">
        <VImage :src="o.productSnapshot?.image" height="120rpx" width="120rpx" />
        <view class="pgo-card__info">
          <text class="pgo-card__name">{{ o.productSnapshot?.name }} ×{{ o.quantity }}</text>
          <view class="pgo-card__price">
            <text class="pgo-card__points">{{ o.pointsTotal }}{{ t('pointsGoods.pointsUnit') }}</text>
            <text v-if="o.cashTotal > 0" class="pgo-card__cash">+¥{{ (o.cashTotal / 100).toFixed(2) }}</text>
          </view>
          <text class="pgo-card__time">{{ t('pointsGoods.createTime') }} {{ fmtTime(o.createdAt) }}</text>
        </view>
      </view>

      <!-- 展开：地址/快递详情（同页展开，不另建详情页） -->
      <view v-if="expandedId === o.id" class="pgo-card__detail">
        <view v-if="o.addressSnapshot" class="pgo-detail__row">
          <text class="pgo-detail__label">{{ t('pointsGoods.consignee') }}</text>
          <text class="pgo-detail__value">{{ o.addressSnapshot.name }} {{ o.addressSnapshot.phone }}</text>
        </view>
        <view v-if="o.addressSnapshot" class="pgo-detail__row">
          <text class="pgo-detail__label">{{ t('pointsGoods.address') }}</text>
          <text class="pgo-detail__value">{{ o.addressSnapshot.province }} {{ o.addressSnapshot.city }} {{ o.addressSnapshot.district }} {{ o.addressSnapshot.detail }}</text>
        </view>
        <view v-if="o.trackingNo" class="pgo-detail__row">
          <text class="pgo-detail__label">{{ t('pointsGoods.trackingNo') }}</text>
          <text class="pgo-detail__value">{{ o.trackingNo }}</text>
        </view>
      </view>

      <!-- 待支付操作 -->
      <view v-if="o.status === 'pending_payment'" class="pgo-card__actions">
        <button class="pgo-btn pgo-btn--ghost" :disabled="acting" @click.stop="onCancel(o)">{{ t('pointsGoods.cancelOrder') }}</button>
        <button class="pgo-btn" :disabled="acting" @click.stop="onPay(o)">{{ t('pointsGoods.continuePay') }}</button>
      </view>
    </view>

    <EmptyState v-if="items.length === 0 && !loading" :text="t('pointsGoods.emptyOrders')" />
    <view v-if="loading" class="pgo-page__loading">{{ t('common.loading') }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onReachBottom } from '@dcloudio/uni-app';
import { getMyPointsOrders, createPointsOrderPayment, cancelPointsOrder } from '../../api/queries/points-mall';
import { usePagination } from '../../composables/usePagination';
import { handlePayment } from '../../composables/usePayment';
import { getPlatform } from '../../utils/platform';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUIStore();

/** 状态 → 文案 key / 颜色：待支付橙 / 待发货蓝 / 已发货青 / 已完成绿 / 已取消灰 */
const TABS = [
    { key: '', color: '' },
    { key: 'pending_payment', color: '#ff9900' },
    { key: 'pending_ship', color: '#3a7afe' },
    { key: 'shipped', color: '#00b8a9' },
    { key: 'completed', color: '#52c41a' },
    { key: 'cancelled', color: '#999999' },
];
const STATUS_KEY: Record<string, string> = {
    pending_payment: 'statusPendingPayment',
    pending_ship: 'statusPendingShip',
    shipped: 'statusShipped',
    completed: 'statusCompleted',
    cancelled: 'statusCancelled',
};

const status = ref('');
const expandedId = ref('');
const acting = ref(false);

const { items, loading, loadMore, refresh } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        if (!auth.isLoggedIn) return { items: [], totalItems: 0 };
        const r: any = await getMyPointsOrders({ take, skip, status: status.value || undefined });
        return r?.myPointsOrders || { items: [], totalItems: 0 };
    },
});

onMounted(() => {
    if (!auth.isLoggedIn) auth.requireLogin('/pkg-user/pages/points-orders');
});

onReachBottom(() => loadMore());

function statusLabel(key: string): string {
    if (!key) return t('pointsGoods.statusAll');
    const k = STATUS_KEY[key];
    return k ? t('pointsGoods.' + k) : key;
}
function statusColor(key: string): string {
    return TABS.find((x) => x.key === key)?.color || '#999999';
}

function switchTab(key: string) {
    if (status.value === key) return;
    status.value = key;
    expandedId.value = '';
    refresh();
}

function toggleExpand(id: string) {
    expandedId.value = expandedId.value === id ? '' : id;
}

function fmtTime(s: string): string {
    return s ? String(s).replace('T', ' ').slice(0, 16) : '';
}

/** 继续支付：与充值/确认兑换页同款（createPointsOrderPayment → handlePayment） */
async function onPay(order: any) {
    if (acting.value) return;
    acting.value = true;
    ui.showLoading();
    try {
        const tradeType = getPlatform() === 'mp-weixin' ? 'JSAPI' : 'H5';
        const payRes: any = await createPointsOrderPayment(order.id, tradeType);
        const pay = payRes?.createPointsOrderPayment?.pay;
        const result = await handlePayment('wechatpay', pay);
        ui.hideLoading();
        if (result.success) {
            ui.showToast(t('pointsGoods.paySuccess'), 'success');
        } else {
            ui.showToast(result.message || t('pointsGoods.payLaterHint'), 'error');
        }
        await refresh();
    } catch (e: any) {
        ui.hideLoading();
        ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.payLaterHint'), 'error');
    } finally {
        acting.value = false;
    }
}

function onCancel(order: any) {
    uni.showModal({
        title: t('pointsGoods.cancelOrder'),
        content: t('pointsGoods.cancelOrderConfirm'),
        confirmText: t('common.confirm'),
        cancelText: t('common.cancel'),
        success: async (res) => {
            if (!res.confirm) return;
            acting.value = true;
            ui.showLoading();
            try {
                await cancelPointsOrder(order.id);
                ui.hideLoading();
                ui.showToast(t('pointsGoods.orderCancelled'), 'success');
                await refresh();
            } catch (e: any) {
                ui.hideLoading();
                ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.operationFailed'), 'error');
            } finally {
                acting.value = false;
            }
        },
    });
}
</script>

<style lang="scss" scoped>
.pgo-page {
    min-height: 100vh;
    background: $bg-color;
    padding-bottom: 40rpx;
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
.pgo-tabs {
    display: flex;
    background: #fff;
    padding: 0 10rpx;
    position: sticky;
    top: 0;
    z-index: 10;
}
.pgo-tab {
    flex: 1;
    text-align: center;
    font-size: 26rpx;
    color: $text-color-secondary;
    padding: 24rpx 0;
    border-bottom: 4rpx solid transparent;
    &--active { color: $brand-color; font-weight: bold; border-bottom-color: $brand-color; }
}
.pgo-card {
    background: #fff;
    border-radius: $radius-md;
    margin: 20rpx;
    padding: 24rpx;
    &__head { display: flex; justify-content: space-between; align-items: center; }
    &__code { font-size: 24rpx; color: #999; }
    &__status { font-size: 26rpx; font-weight: bold; }
    &__body { display: flex; gap: 20rpx; margin-top: 20rpx; }
    &__info { flex: 1; display: flex; flex-direction: column; }
    &__name { font-size: 28rpx; color: $text-color; }
    &__price { display: flex; align-items: baseline; margin-top: 8rpx; }
    &__points { font-size: 30rpx; font-weight: bold; color: $brand-color; }
    &__cash { font-size: 24rpx; color: $brand-color; margin-left: 8rpx; }
    &__time { font-size: 22rpx; color: #999; margin-top: 8rpx; }
    &__detail { border-top: 1rpx solid $border-color; margin-top: 20rpx; padding-top: 16rpx; }
    &__actions { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
}
.pgo-detail {
    &__row { display: flex; font-size: 24rpx; padding: 6rpx 0; }
    &__label { color: #999; width: 140rpx; flex-shrink: 0; }
    &__value { color: $text-color; flex: 1; line-height: 1.5; }
}
.pgo-btn {
    background: $brand-color;
    color: #fff;
    font-size: 26rpx;
    padding: 0 30rpx;
    height: 60rpx;
    line-height: 60rpx;
    border-radius: 30rpx;
    border: none;
    &--ghost { background: #fff; color: #666; border: 1rpx solid $border-color; }
}
</style>

<template>
  <view class="history-page">
    <view v-for="tx in items" :key="tx.id" class="history-item">
      <view class="history-item__left">
        <text class="history-item__type">{{ typeLabel(tx.type) }}</text>
        <text class="history-item__remark">{{ tx.remark || '' }}</text>
        <text v-if="tx.orderId" class="history-item__order">订单 #{{ tx.orderId }}</text>
      </view>
      <view class="history-item__right">
        <text class="history-item__value" :class="signClass(tx.amount)">{{ signed(tx.amount) }}</text>
        <text class="history-item__date">{{ fmtTime(tx.createdAt) }}</text>
        <text v-if="tx.balanceAfter !== undefined && tx.balanceAfter !== null" class="history-item__balance">积分余额 {{ tx.balanceAfter }}</text>
      </view>
    </view>
    <EmptyState v-if="items.length === 0 && !loading" text="暂无积分明细" />
    <view v-if="loading" class="history-page__loading">加载中...</view>
  </view>
</template>

<script setup lang="ts">
import { getMyPointsHistory } from '../../api/queries/member';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';

// type → 文案
const TYPE_LABEL: Record<string, string> = {
    earn: '获得',
    spend: '消耗',
    adjust: '调账',
    expire: '过期',
};
function typeLabel(t: string): string { return TYPE_LABEL[t] || t; }
// 积分 amount 语义：获得存正值，消耗存负值；「+/-」以 amount 符号为准
function signed(amount: number): string {
    return (amount >= 0 ? '+' : '') + String(amount);
}
function signClass(amount: number): string {
    return amount >= 0 ? 'history-item__value--in' : '';
}
function fmtTime(s: string): string {
    return s ? String(s).replace('T', ' ').slice(0, 16) : '';
}

const { items, loading, loadMore, refresh } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        const r: any = await getMyPointsHistory({ take, skip });
        return r?.myPointsHistory || { items: [], totalItems: 0 };
    },
});

onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh(); });
</script>

<style lang="scss" scoped>
.history-page { padding: 20rpx; &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; } }
.history-item { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 12rpx; display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; &__left { display: flex; flex-direction: column; } &__type { font-weight: bold; font-size: 28rpx; } &__remark { color: #999; font-size: 22rpx; margin-top: 4rpx; max-width: 360rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } &__order { color: #999; font-size: 20rpx; margin-top: 4rpx; } &__right { display: flex; flex-direction: column; align-items: flex-end; } &__value { font-weight: bold; &--in { color: $success-color; } } &__date { color: #999; font-size: 22rpx; margin-top: 4rpx; } &__balance { color: #999; font-size: 20rpx; margin-top: 4rpx; } }
</style>
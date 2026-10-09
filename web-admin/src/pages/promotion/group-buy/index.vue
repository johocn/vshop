<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ {{ $t('groupBuyList.createNew') }}</button>
    </view>

    <view class="card" v-for="c in items" :key="c.id">
      <view class="top" @tap="onEdit(c)">
        <view class="head">
          <text class="name">{{ c.name }}</text>
          <text class="badge" :class="c.status">{{ statusLabel(c.status) }}</text>
        </view>
        <view class="value">¥{{ fmtCNY(c.groupPrice) }}</view>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.timeLabel') }}</text>
            <text class="v">{{ fmtDT(c.startAt) }} ~ {{ fmtDT(c.endAt) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.progressLabel') }}</text>
            <text class="v">{{ c.currentCount }}/{{ c.targetCount }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.maxLabel') }}</text>
            <text class="v">{{ c.maxCount > 0 ? c.maxCount : $t('groupBuyList.unlimited') }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.rewardLabel') }}</text>
            <text class="v">{{ rewardLabel(c.leaderRewardType) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.leaderDiscountLabel') }}</text>
            <text class="v">¥{{ fmtCNY(c.leaderDiscount) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('groupBuyList.productLabel') }}</text>
            <text class="v v-mono">{{ c.productId }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(c)">{{ $t('groupBuyList.edit') }}</text>
        <text class="del" @tap="onDelete(c)">{{ $t('groupBuyList.del') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('groupBuyList.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('groupBuyList.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('groupBuyList.loadingMore') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  fetchGroupBuyActivities, deleteGroupBuyActivity, GroupBuyActivity, GroupBuyStatus, GroupBuyLeaderRewardType,
} from '../../../apis/groupBuy';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const items = ref<GroupBuyActivity[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const STATUS_KEY: Record<GroupBuyStatus, string> = {
  active: 'groupBuyList.statusActive',
  completed: 'groupBuyList.statusCompleted',
  expired: 'groupBuyList.statusExpired',
};
const statusLabel = (s: GroupBuyStatus) => locale.t(STATUS_KEY[s] || s);

const REWARD_KEY: Record<GroupBuyLeaderRewardType, string> = {
  discount: 'groupBuyList.rewardDiscount',
  cashback: 'groupBuyList.rewardCashback',
  free: 'groupBuyList.rewardFree',
};
const rewardLabel = (t: string) => locale.t(REWARD_KEY[t as GroupBuyLeaderRewardType] || t);

/** 分转元展示（价格单位：分） */
const fmtCNY = (cents: number) => ((cents || 0) / 100).toFixed(2).replace(/\.?0+$/, '');

function fmtDT(t?: string | null): string {
  if (!t) return '-';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchGroupBuyActivities(PAGE, 0);
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupBuyList.opFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchGroupBuyActivities(PAGE, items.value.length);
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('groupBuyList.opFailed'), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function onCreate() { uni.navigateTo({ url: '/pages/promotion/group-buy/edit' }); }
function onEdit(c: GroupBuyActivity) { uni.navigateTo({ url: `/pages/promotion/group-buy/edit?id=${c.id}` }); }

function onDelete(c: GroupBuyActivity) {
  uni.showModal({
    title: locale.t('groupBuyList.delTitle'),
    content: locale.t('groupBuyList.delContent').replace('{name}', c.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteGroupBuyActivity(c.id);
        items.value = items.value.filter((x) => x.id !== c.id);
        uni.showToast({ title: locale.t('groupBuyList.deleted'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('groupBuyList.delFailed'), icon: 'none' });
      }
    },
  });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar .add { width: 300rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center; flex-wrap: wrap;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
        .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx;
          &.active { background: #0a9c6e; }
          &.completed { background: #2563eb; }
          &.expired { background: #bbb; } } }
      .value { font-size: 30rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; } }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink;
            &.v-mono { font-size: 22rpx; word-break: break-all; } } } } }
    .ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule; display: flex; align-items: center;
      > text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.del { color: #e64340; } } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

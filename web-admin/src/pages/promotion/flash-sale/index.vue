<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ {{ $t('flashSaleList.createNew') }}</button>
    </view>

    <view class="card" v-for="c in items" :key="c.id">
      <view class="top" @tap="onEdit(c)">
        <view class="head">
          <text class="name">{{ c.name }}</text>
          <text class="badge" :class="c.status">{{ statusLabel(c.status) }}</text>
        </view>
        <view class="value">¥{{ fmtCNY(c.flashPrice) }}</view>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('flashSaleList.timeLabel') }}</text>
            <text class="v">{{ fmtDT(c.startAt) }} ~ {{ fmtDT(c.endAt) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('flashSaleList.stockLabel') }}</text>
            <text class="v">{{ c.soldCount }}/{{ c.totalStock }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('flashSaleList.limitLabel') }}</text>
            <text class="v">{{ c.limitPerUser > 0 ? c.limitPerUser : $t('flashSaleList.unlimited') }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('flashSaleList.productLabel') }}</text>
            <text class="v v-mono">{{ c.productId }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(c)">{{ $t('flashSaleList.edit') }}</text>
        <text class="del" @tap="onDelete(c)">{{ $t('flashSaleList.del') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('flashSaleList.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('flashSaleList.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('flashSaleList.loadingMore') }}</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  fetchFlashSaleActivities, deleteFlashSaleActivity, FlashSaleActivity, FlashSaleStatus,
} from '../../../apis/flashSale';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const items = ref<FlashSaleActivity[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const STATUS_KEY: Record<FlashSaleStatus, string> = {
  upcoming: 'flashSaleList.statusUpcoming',
  active: 'flashSaleList.statusActive',
  ended: 'flashSaleList.statusEnded',
};
const statusLabel = (s: FlashSaleStatus) => locale.t(STATUS_KEY[s] || s);

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
    const res = await fetchFlashSaleActivities(PAGE, 0);
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('flashSaleList.opFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchFlashSaleActivities(PAGE, items.value.length);
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('flashSaleList.opFailed'), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function onCreate() { uni.navigateTo({ url: '/pages/promotion/flash-sale/edit' }); }
function onEdit(c: FlashSaleActivity) { uni.navigateTo({ url: `/pages/promotion/flash-sale/edit?id=${c.id}` }); }

function onDelete(c: FlashSaleActivity) {
  uni.showModal({
    title: locale.t('flashSaleList.delTitle'),
    content: locale.t('flashSaleList.delContent').replace('{name}', c.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteFlashSaleActivity(c.id);
        items.value = items.value.filter((x) => x.id !== c.id);
        uni.showToast({ title: locale.t('flashSaleList.deleted'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('flashSaleList.delFailed'), icon: 'none' });
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
          &.upcoming { background: #2563eb; }
          &.active { background: #0a9c6e; }
          &.ended { background: #bbb; } } }
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

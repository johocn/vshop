<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ {{ $t('couponBundle.createNew') }}</button>
    </view>

    <view class="kpi">
      <view class="kpi-item">
        <text class="kpi-num">{{ totalItems }}</text>
        <text class="kpi-label">{{ $t('couponBundle.kpiTotal') }}</text>
      </view>
      <view class="kpi-item">
        <text class="kpi-num">{{ enabledCount }}</text>
        <text class="kpi-label">{{ $t('couponBundle.kpiEnabled') }}</text>
      </view>
    </view>

    <view class="card" v-for="b in items" :key="b.id">
      <view class="top" @tap="onEdit(b)">
        <view class="head">
          <text class="name">{{ b.name }}</text>
          <text class="badge" :class="{ off: !b.enabled }">{{ b.enabled ? $t('couponBundle.enabled') : $t('couponBundle.disabled') }}</text>
        </view>
        <text class="value">¥{{ money(b.salePrice) }}</text>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('couponBundle.itemsLabel') }}</text>
            <text class="v">{{ $t('couponBundle.itemsCount').replace('{n}', String(b.items.length)) }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponBundle.totalQtyLabel') }}</text>
            <text class="v">{{ $t('couponBundle.totalQty').replace('{n}', String(totalQty(b))) }}</text>
          </view>
        </view>
        <view class="row" v-if="b.description">
          <text class="desc">{{ b.description }}</text>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(b)">{{ $t('couponBundle.editLabel') }}</text>
        <text class="del" @tap="onDelete(b)">{{ $t('couponBundle.del') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('couponBundle.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('couponBundle.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('couponBundle.loadingMore') }}</view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchCouponBundles, deleteCouponBundle, type CouponBundleRow } from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';
import { fenToYuanFixed } from '../../../utils/money';

const locale = useLocaleStore();

const items = ref<CouponBundleRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const money = fenToYuanFixed;
const totalQty = (b: CouponBundleRow) => b.items.reduce((s, i) => s + (i.quantity || 0), 0);
const enabledCount = computed(() => items.value.filter((b) => b.enabled).length);

async function load() {
  loading.value = true;
  try {
    const res = await fetchCouponBundles({ skip: 0, take: PAGE });
    items.value = res.items;
    totalItems.value = res.totalItems;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchCouponBundles({ skip: items.value.length, take: PAGE });
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } finally {
    loadingMore.value = false;
  }
}

function onCreate() { uni.navigateTo({ url: '/pages/coupon/bundle/edit/index' }); }
function onEdit(b: CouponBundleRow) { uni.navigateTo({ url: `/pages/coupon/bundle/edit/index?id=${b.id}` }); }

function onDelete(b: CouponBundleRow) {
  uni.showModal({
    title: locale.t('couponBundle.delTitle'),
    content: locale.t('couponBundle.delContent').replace('{name}', b.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteCouponBundle(b.id);
        items.value = items.value.filter((x) => x.id !== b.id);
        totalItems.value = Math.max(0, totalItems.value - 1);
        uni.showToast({ title: locale.t('couponBundle.deleted'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('couponBundle.delFailed'), icon: 'none' });
      }
    },
  });
}

onMounted(load);
onShow(() => { if (items.value.length) load(); });
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar .add { width: 300rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .kpi { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 0; margin-bottom: 24rpx;
    .kpi-item { flex: 1; display: flex; flex-direction: column; align-items: center;
      .kpi-num { font-size: 40rpx; color: $wa-ink; font-weight: 700; }
      .kpi-label { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; } } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
        .badge { font-size: 20rpx; color: #fff; background: $wa-accent; border-radius: 16rpx; padding: 2rpx 14rpx;
          &.off { background: #bbb; } } }
      .value { font-size: 30rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; } }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; } }
        .desc { font-size: 22rpx; color: $wa-muted; } } }
    .ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule; display: flex; align-items: center;
      > text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.del { color: #e64340; } } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
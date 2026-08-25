<template>
  <view class="page">
    <view class="filters">
      <text v-for="f in filters" :key="f.key" class="f-tab" :class="{ on: active === f.key }" @tap="switchFilter(f.key)">
        {{ f.label }}
      </text>
    </view>

    <view class="card" v-for="p in products" :key="p.id">
      <view class="row head">
        <view class="lt">
          <text class="title">{{ p.name }}</text>
          <text class="sub">商家：{{ p.merchantRef || '自营' }}</text>
        </view>
        <text class="badge" :style="badgeStyle(p.marketplaceStatus)">{{ badgeText(p.marketplaceStatus) }}</text>
      </view>
      <view class="reject" v-if="p.marketplaceStatus === 'rejected' && p.rejectReason">
        驳回原因：{{ p.rejectReason }}
      </view>
      <view class="row foot" v-if="!p.marketplaceStatus || p.marketplaceStatus === 'pending'">
        <template v-if="!p.marketplaceStatus">
          <text class="btn primary" @tap="onSubmit(p)">提审</text>
        </template>
        <template v-else>
          <text class="btn danger" @tap="onReject(p)">驳回</text>
          <text class="btn success" @tap="onApprove(p)">通过</text>
        </template>
      </view>
    </view>
    <view v-if="!products.length" class="empty">暂无商品</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchMarketplaceProducts, submitProductToMarketplace, reviewMarketplaceProduct,
  type MarketplaceProductView,
} from '@/apis/marketplace';

const filters = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待审' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
];
const active = ref('');
const products = ref<MarketplaceProductView[]>([]);

onShow(load);

function switchFilter(key: string) {
  active.value = key;
  load();
}

async function load() {
  try {
    products.value = await fetchMarketplaceProducts(active.value);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}

function badgeText(status: string | null) {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已驳回';
  if (status === 'pending') return '待审';
  return '未提审';
}
function badgeStyle(status: string | null) {
  if (status === 'approved') return { background: '#e8f7ea', color: '#16a34a' };
  if (status === 'rejected') return { background: '#fdecea', color: '#e53935' };
  if (status === 'pending') return { background: '#fdf3e3', color: '#f59e0b' };
  return { background: '#f2f2f2', color: '#8a8a8a' };
}

function onSubmit(p: MarketplaceProductView) {
  uni.showModal({
    title: '提审',
    content: `确定将「${p.name}」提交到商品上架审批？`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await submitProductToMarketplace(p.id);
        uni.showToast({ title: '已提审', icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
      }
    },
  });
}

function onApprove(p: MarketplaceProductView) {
  uni.showModal({
    title: '通过',
    content: `确定通过「${p.name}」的上架审批？`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await reviewMarketplaceProduct(p.id, true);
        uni.showToast({ title: '已通过', icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
      }
    },
  });
}

function onReject(p: MarketplaceProductView) {
  uni.showModal({
    title: '驳回',
    editable: true,
    placeholderText: '请输入驳回原因（必填）',
    success: async (r: any) => {
      if (!r.confirm) return;
      const reason = (r.content || '').trim();
      if (!reason) {
        uni.showToast({ title: '请输入驳回原因', icon: 'none' });
        return;
      }
      try {
        await reviewMarketplaceProduct(p.id, false, reason);
        uni.showToast({ title: '已驳回', icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.filters { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.f-tab { flex: 1; text-align: center; padding: 16rpx 0; border-radius: 999rpx; background: #f2f2f2; color: $wa-muted; font-size: 26rpx; }
.f-tab.on { background: $pm-info; color: #fff; font-weight: 600; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display: flex; align-items: center; justify-content: space-between; }
.head { margin-bottom: 16rpx; }
.lt { flex: 1; }
.title { display: block; font-size: 30rpx; font-weight: 700; color: $wa-ink; }
.sub { display: block; font-size: 24rpx; color: $wa-muted; margin-top: 8rpx; }
.badge { flex: 0 0 auto; padding: 6rpx 18rpx; border-radius: 999rpx; font-size: 22rpx; }
.reject { background: #fdecea; color: $wa-danger; font-size: 24rpx; border-radius: 12rpx; padding: 16rpx 20rpx; margin-bottom: 16rpx; }
.foot { gap: 16rpx; justify-content: flex-end; }
.btn { padding: 12rpx 34rpx; border-radius: 999rpx; font-size: 26rpx; }
.btn.primary { background: $pm-info; color: #fff; }
.btn.success { background: $pm-success; color: #fff; }
.btn.danger { border: 1.5rpx solid $wa-danger; color: $wa-danger; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; font-size: 26rpx; }
</style>
<template>
  <view class="page">
    <view class="head-row">
      <text class="head-title">待审商品</text>
    </view>

    <view class="card" v-for="p in products" :key="p.id">
      <view class="row head">
        <view class="lt">
          <text class="title">{{ p.name }}</text>
        </view>
        <text class="badge">{{ badgeText(p.marketplaceStatus) }}</text>
      </view>
      <view class="reject" v-if="p.marketplaceStatus === 'rejected' && p.rejectReason">
        驳回原因：{{ p.rejectReason }}
      </view>
      <view class="row foot">
        <text class="btn danger" @tap="onReject(p)">驳回</text>
        <text class="btn success" @tap="onApprove(p)">通过</text>
      </view>
    </view>
    <view v-if="!products.length" class="empty">暂无待审商品</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchPendingProducts, approveProduct, rejectProduct, type MarketplaceApprovalItem } from '@/apis/marketplace';

const products = ref<MarketplaceApprovalItem[]>([]);

onShow(load);

async function load() {
  try {
    products.value = await fetchPendingProducts();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}

function badgeText(status: string | null) {
  if (status === 'pending') return '待审';
  if (status === 'rejected') return '已驳回';
  if (status === 'approved') return '已通过';
  return '待审';
}
function onApprove(p: MarketplaceApprovalItem) {
  uni.showModal({
    title: '通过',
    content: `确定通过「${p.name}」的上架审批？`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await approveProduct(p.id);
        uni.showToast({ title: '已通过', icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
      }
    },
  });
}

function onReject(p: MarketplaceApprovalItem) {
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
        await rejectProduct(p.id, reason);
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
.head-row { margin-bottom: 20rpx; }
.head-title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display: flex; align-items: center; justify-content: space-between; }
.head { margin-bottom: 16rpx; }
.lt { flex: 1; }
.title { display: block; font-size: 30rpx; font-weight: 700; color: $wa-ink; }
.badge { flex: 0 0 auto; padding: 6rpx 18rpx; border-radius: 999rpx; font-size: 22rpx; }
.reject { background: #fdecea; color: $wa-danger; font-size: 24rpx; border-radius: 12rpx; padding: 16rpx 20rpx; margin-bottom: 16rpx; }
.foot { gap: 16rpx; justify-content: flex-end; }
.btn { padding: 12rpx 34rpx; border-radius: 999rpx; font-size: 26rpx; }
.btn.success { background: $pm-success; color: #fff; }
.btn.danger { border: 1.5rpx solid $wa-danger; color: $wa-danger; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; font-size: 26rpx; }
</style>
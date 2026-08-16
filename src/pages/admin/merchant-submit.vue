<template>
  <view class="ms-page">
    <view class="ms-page__header">
      <text class="ms-page__title">商家上架</text>
      <text class="ms-page__subtitle">提交商品至平台审批，审批通过后在 marketplace 展示</text>
    </view>
    <scroll-view class="ms-page__scroll" scroll-y>
      <view v-for="p in products" :key="p.id" class="ms-card">
        <view class="ms-card__info">
          <text class="ms-card__name">{{ p.name }}</text>
          <text class="ms-card__meta">条码：{{ p.barcode || '无' }} · 编码：{{ p.internalCode || '无' }}</text>
          <text class="ms-card__status" :class="statusClass(p.marketplaceStatus)">{{ statusText(p.marketplaceStatus) }}</text>
          <text v-if="p.marketplaceStatus === 'rejected' && p.rejectReason" class="ms-card__reason">驳回原因：{{ p.rejectReason }}</text>
        </view>
        <button
          v-if="canSubmit(p.marketplaceStatus)"
          class="ms-card__btn"
          @click="doSubmit(p.id)"
        >提交上架</button>
      </view>
      <view v-if="!loading && products.length === 0">
        <text class="ms-empty">暂无商品</text>
      </view>
      <LoadingSkeleton v-if="loading" type="list" :count="3" />
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMyMerchantProducts, submitForMarketplace } from '../../api/queries/marketplace-admin';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const products = ref<any[]>([]);
const loading = ref(false);

const statusMap: Record<string, string> = {
    pending: '审批中',
    approved: '已上架',
    rejected: '已驳回',
};

onShow(() => { loadData(); });

async function loadData() {
    loading.value = true;
    try {
        const res: any = await getMyMerchantProducts();
        products.value = res.myMerchantProducts || [];
    } catch (e) {
        console.error(e);
        uni.showToast({ title: '加载失败', icon: 'none' });
    }
    loading.value = false;
}

function statusText(s: string) { return statusMap[s] || s || '未知'; }
function statusClass(s: string) { return 'ms-card__status--' + s; }
function canSubmit(s: string) { return s !== 'pending' && s !== 'approved'; }

async function doSubmit(productId: string) {
    try {
        await submitForMarketplace(productId);
        uni.showToast({ title: '已提交审批', icon: 'none' });
        loadData();
    } catch (e) {
        console.error(e);
        uni.showToast({ title: '提交失败', icon: 'none' });
    }
}
</script>
<style lang="scss" scoped>
.ms-page {
    min-height: 100vh; background: $bg-color;
    &__header { background: $brand-color; color: #fff; padding: 40rpx 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; display: block; }
    &__subtitle { font-size: 24rpx; opacity: 0.85; margin-top: 8rpx; display: block; }
    &__scroll { padding: 20rpx; }
}
.ms-card {
    background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
    display: flex; justify-content: space-between; align-items: center; gap: 20rpx;
    &__info { flex: 1; }
    &__name { font-size: 30rpx; font-weight: bold; display: block; }
    &__meta { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; display: block; }
    &__status { display: inline-block; margin-top: 12rpx; font-size: 24rpx; padding: 4rpx 16rpx; border-radius: 999rpx; }
    &__status--pending { color: #e6a23c; background: #fcf3e0; }
    &__status--approved { color: #67c23a; background: #e9f7e3; }
    &__status--rejected { color: #f56c6c; background: #fdecec; }
    &__reason { display: block; font-size: 24rpx; color: #f56c6c; margin-top: 8rpx; }
    &__btn { flex-shrink: 0; background: $brand-color; color: #fff; font-size: 26rpx; border-radius: 999rpx; padding: 0 30rpx; height: 64rpx; line-height: 64rpx; }
}
.ms-empty { display: block; text-align: center; color: #999; font-size: 26rpx; padding: 60rpx 0; }
</style>
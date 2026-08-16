<template>
  <view class="pa-page">
    <view class="pa-page__header">
      <text class="pa-page__title">平台上架审批</text>
      <text class="pa-page__subtitle">审核商家提交的上架商品，通过后对外展示</text>
    </view>
    <scroll-view class="pa-page__scroll" scroll-y>
      <view v-for="p in products" :key="p.id" class="pa-card">
        <view class="pa-card__info">
          <text class="pa-card__name">{{ p.name }}</text>
          <text class="pa-card__meta">条码：{{ p.barcode || '无' }} · 编码：{{ p.internalCode || '无' }}</text>
        </view>
        <view class="pa-card__actions">
          <button class="pa-card__btn pa-card__btn--approve" @click="doApprove(p.id)">通过</button>
          <button class="pa-card__btn pa-card__btn--reject" @click="doReject(p.id, p.name)">驳回</button>
        </view>
      </view>
      <view v-if="!loading && products.length === 0">
        <text class="pa-empty">暂无待审批商品</text>
      </view>
      <LoadingSkeleton v-if="loading" type="list" :count="3" />
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
    getMarketplacePendingProducts,
    approveMarketplaceProduct,
    rejectMarketplaceProduct,
} from '../../api/queries/marketplace-admin';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const products = ref<any[]>([]);
const loading = ref(false);

onShow(() => { loadData(); });

async function loadData() {
    loading.value = true;
    try {
        const res: any = await getMarketplacePendingProducts();
        products.value = res.marketplacePendingProducts || [];
    } catch (e) {
        console.error(e);
        uni.showToast({ title: '加载失败', icon: 'none' });
    }
    loading.value = false;
}

async function doApprove(productId: string) {
    try {
        await approveMarketplaceProduct(productId);
        uni.showToast({ title: '已通过', icon: 'none' });
        loadData();
    } catch (e) {
        console.error(e);
        uni.showToast({ title: '操作失败', icon: 'none' });
    }
}

function doReject(productId: string, name: string) {
    uni.showModal({
        title: '驳回「' + name + '」',
        editable: true,
        placeholderText: '请输入驳回原因',
        success: async (res) => {
            if (!res.confirm) return;
            const reason = (res.content || '').trim();
            if (!reason) {
                uni.showToast({ title: '请填写驳回原因', icon: 'none' });
                return;
            }
            try {
                await rejectMarketplaceProduct(productId, reason);
                uni.showToast({ title: '已驳回', icon: 'none' });
                loadData();
            } catch (e) {
                console.error(e);
                uni.showToast({ title: '操作失败', icon: 'none' });
            }
        },
    });
}
</script>
<style lang="scss" scoped>
.pa-page {
    min-height: 100vh; background: $bg-color;
    &__header { background: $brand-color; color: #fff; padding: 40rpx 30rpx; }
    &__title { font-size: 36rpx; font-weight: bold; display: block; }
    &__subtitle { font-size: 24rpx; opacity: 0.85; margin-top: 8rpx; display: block; }
    &__scroll { padding: 20rpx; }
}
.pa-card {
    background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx;
    &__info { }
    &__name { font-size: 30rpx; font-weight: bold; display: block; }
    &__meta { font-size: 24rpx; color: $text-color-secondary; margin-top: 8rpx; display: block; }
    &__actions { display: flex; gap: 20rpx; margin-top: 20rpx; }
    &__btn { flex: 1; height: 68rpx; line-height: 68rpx; font-size: 28rpx; border-radius: $radius-md; }
    &__btn--approve { background: $brand-color; color: #fff; }
    &__btn--reject { background: #f56c6c; color: #fff; }
}
.pa-empty { display: block; text-align: center; color: #999; font-size: 26rpx; padding: 60rpx 0; }
</style>
<template>
  <view class="apply-page">
    <view class="section">
      <text class="section__title">售后类型</text>
      <view class="type-row">
        <view v-for="t in types" :key="t.value" class="type-btn" :class="{ active: form.type === t.value }" @click="form.type = t.value">{{ t.label }}</view>
      </view>
    </view>
    <view class="section">
      <text class="section__title">问题描述</text>
      <input v-model="form.reason" placeholder="请简要描述问题(必填)" class="input" />
      <textarea v-model="form.description" placeholder="补充说明(可选)" class="textarea" />
    </view>
    <view class="section">
      <text class="section__title">退款金额(分)</text>
      <input v-model.number="form.refundAmount" type="number" class="input" placeholder="请输入退款金额" />
    </view>
    <view class="section">
      <text class="section__title">凭证图片</text>
      <ImageUpload v-model="form.evidenceImages" :max-count="6" />
    </view>
    <button class="apply-page__submit" :disabled="submitting" @click="submitApply">
      {{ submitting ? '提交中...' : '提交申请' }}
    </button>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { createAfterSalesRequest } from '../../api/mutations/after-sale';
import { useUIStore } from '../../stores/ui';
import ImageUpload from '../../components/ImageUpload.vue';
const ui = useUIStore();
const orderId = ref('');
const submitting = ref(false);
const pages = getCurrentPages();
const page = pages[pages.length - 1] as any;
orderId.value = page?.options?.orderId || '';
const types = [
    { value: 'return_refund', label: '退货退款' },
    { value: 'refund_only', label: '仅退款' },
    { value: 'exchange', label: '换货' },
];
const form = ref({ type: 'return_refund', reason: '', description: '', refundAmount: 0, evidenceImages: [] as string[] });
async function submitApply() {
    if (!form.value.reason) { ui.showToast('请填写问题描述'); return; }
    if (!form.value.refundAmount || form.value.refundAmount <= 0) { ui.showToast('请填写退款金额'); return; }
    submitting.value = true;
    try {
        await createAfterSalesRequest({
            orderId: orderId.value, type: form.value.type, reason: form.value.reason,
            description: form.value.description, refundAmount: form.value.refundAmount,
            evidenceImages: form.value.evidenceImages,
        });
        ui.showToast('申请成功', 'success');
        setTimeout(() => uni.navigateBack(), 1500);
    } catch (e: any) { ui.showToast(e.message); }
    submitting.value = false;
}
</script>
<style lang="scss" scoped>
.apply-page { padding: 20rpx; padding-bottom: 140rpx; &__submit { margin-top: 40rpx; background: $brand-color; color: #fff; height: 90rpx; border-radius: $radius-md; border: none; font-size: 32rpx; &[disabled] { opacity: 0.6; } } }
.section { background: #fff; padding: 24rpx; border-radius: $radius-md; margin-bottom: 20rpx; &__title { font-weight: bold; font-size: 28rpx; margin-bottom: 16rpx; display: block; } }
.type-row { display: flex; gap: 16rpx; }
.type-btn { flex: 1; text-align: center; padding: 20rpx; border: 1rpx solid $border-color; border-radius: $radius-sm; font-size: 26rpx; &.active { border-color: $brand-color; color: $brand-color; background: $brand-color-light; } }
.textarea { width: 100%; height: 200rpx; font-size: 28rpx; border: 1rpx solid $border-color; border-radius: $radius-sm; padding: 16rpx; margin-top: 16rpx; }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
</style>

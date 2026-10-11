<template>
  <view class="apply-page">
    <view class="section">
      <text class="section__title">{{ t('afterSaleApply.typeTitle') }}</text>
      <view class="type-row">
        <view v-for="ty in types" :key="ty.value" class="type-btn" :class="{ active: form.type === ty.value }" @click="form.type = ty.value">{{ typeLabel(ty.key) }}</view>
      </view>
    </view>
    <view class="section">
      <text class="section__title">{{ t('afterSale.description') }}</text>
      <input v-model="form.reason" :placeholder="t('afterSaleApply.reasonPh')" class="input" />
      <textarea v-model="form.description" :placeholder="t('afterSaleApply.descriptionPh')" class="textarea" />
    </view>
    <view class="section">
      <text class="section__title">{{ t('afterSaleApply.refundAmountFen') }}</text>
      <input v-model.number="form.refundAmount" type="number" class="input" :placeholder="t('afterSaleApply.refundAmountPh')" />
    </view>
    <view class="section">
      <text class="section__title">{{ t('afterSale.evidence') }}</text>
      <ImageUpload v-model="form.evidenceImages" :max-count="6" />
    </view>
    <button class="apply-page__submit" :disabled="submitting" @click="submitApply">
      {{ submitting ? t('afterSaleApply.submitting') : t('afterSaleApply.submitBtn') }}
    </button>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { createAfterSalesRequest } from '../../api/mutations/after-sale';
import { useUIStore } from '../../stores/ui';
import ImageUpload from '../../components/ImageUpload.vue';
const { t } = useI18n();
const ui = useUIStore();
const orderId = ref('');
const submitting = ref(false);
const pages = getCurrentPages();
const page = pages[pages.length - 1] as any;
orderId.value = page?.options?.orderId || '';
// 售后类型 → i18n key
const types = [
    { value: 'return_refund', key: 'afterSaleApply.typeReturn' },
    { value: 'refund_only', key: 'afterSaleApply.typeRefundOnly' },
    { value: 'exchange', key: 'afterSaleApply.typeExchange' },
];
function typeLabel(key: string): string {
    return t(key);
}
const form = ref({ type: 'return_refund', reason: '', description: '', refundAmount: 0, evidenceImages: [] as string[] });
async function submitApply() {
    if (!form.value.reason) { ui.showToast(t('afterSaleApply.reasonRequired')); return; }
    if (!form.value.refundAmount || form.value.refundAmount <= 0) { ui.showToast(t('afterSaleApply.refundRequired')); return; }
    submitting.value = true;
    try {
        await createAfterSalesRequest({
            orderId: orderId.value, type: form.value.type, reason: form.value.reason,
            description: form.value.description, refundAmount: form.value.refundAmount,
            evidenceImages: form.value.evidenceImages,
        });
        ui.showToast(t('afterSaleApply.success'), 'success');
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

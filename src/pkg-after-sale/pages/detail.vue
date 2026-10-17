<template>
  <view class="as-detail" v-if="detail">
    <view class="section"><text class="section__title">{{ t('afterSaleDetail.statusLabel') }}: {{ detail.state }}</text></view>
    <view class="section">
      <text>{{ t('afterSaleDetail.typeLabel') }}: {{ detail.type }}</text>
      <text>{{ t('afterSaleDetail.reasonLabel') }}: {{ detail.reason }}</text>
      <text>{{ t('afterSale.refundAmount') }}: ¥{{ (detail.refundAmount / 100).toFixed(2) }}</text>
    </view>
    <view v-if="detail.state === 'Approved'" class="section">
      <text class="section__title">{{ t('afterSaleDetail.fillReturnShipping') }}</text>
      <input v-model="trackingNo" :placeholder="t('afterSaleDetail.trackingPh')" class="input" />
      <picker mode="selector" :range="carriers" @change="onCarrierChange">
        <view class="picker" :class="{ 'picker--ph': carrierIndex < 0 }">
          <text>{{ carrierIndex < 0 ? t('afterSale.carrierPlaceholder') : carriers[carrierIndex] }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
      <input v-if="isOtherCarrier" v-model="customCarrier" :placeholder="t('afterSaleDetail.carrierPh')" class="input" />
      <button @click="submitTracking" style="margin-top:20rpx;background:$brand-color;color:#fff;border:none;border-radius:$radius-md;">{{ t('common.submit') }}</button>
    </view>
    <view v-if="detail.state === 'Pending'" style="padding:20rpx;">
      <button @click="cancelReq" style="background:#fff;color:#999;border:1rpx solid #ddd;border-radius:$radius-md;">{{ t('afterSaleDetail.cancelApply') }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getGraphQLClient } from '../../api/client';
import { updateReturnTracking, cancelAfterSalesRequest } from '../../api/mutations/after-sale';
import { CARRIERS, OTHER_CARRIER } from '../carriers';
import { useUIStore } from '../../stores/ui';
const { t } = useI18n();
const ui = useUIStore();
const detail = ref<any>(null);
const trackingNo = ref('');
const carriers = CARRIERS;
const carrierIndex = ref(-1);
const customCarrier = ref('');
const isOtherCarrier = computed(() => carrierIndex.value >= 0 && carriers[carrierIndex.value] === OTHER_CARRIER);
let reqId = '';
function onCarrierChange(e: any) {
    const idx = Number(e?.detail?.value);
    carrierIndex.value = Number.isNaN(idx) ? -1 : idx;
}
/** 提交用的快递公司：选「其他」取自定义值，否则取所选项 */
const carrierValue = computed(() => {
    if (carrierIndex.value < 0) return '';
    return isOtherCarrier.value ? customCarrier.value.trim() : carriers[carrierIndex.value];
});
onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    reqId = page?.options?.id || '';
    const client = getGraphQLClient();
    const res: any = await client.request(`query($id:ID!) { afterSalesRequest(id:$id) { id orderId state type reason description refundAmount returnTrackingNo returnCarrier createdAt } }`, { id: reqId });
    detail.value = res.afterSalesRequest;
});
async function submitTracking() {
    await updateReturnTracking(reqId, trackingNo.value, carrierValue.value);
    ui.showToast(t('afterSaleDetail.submitted'), 'success');
}
async function cancelReq() {
    await cancelAfterSalesRequest(reqId);
    ui.showToast(t('afterSaleDetail.cancelled'), 'success');
    setTimeout(() => uni.navigateBack(), 1000);
}
</script>
<style lang="scss" scoped>
.as-detail { padding: 20rpx; }
.section { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; display: flex; flex-direction: column; gap: 8rpx; &__title { font-weight: bold; color: $brand-color; } }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
.picker { display: flex; justify-content: space-between; align-items: center; height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
  &--ph { color: #999; }
  &__arrow { color: #ccc; } }
</style>
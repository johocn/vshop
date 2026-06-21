<template>
  <view class="as-detail" v-if="detail">
    <view class="section"><text class="section__title">状态: {{ detail.state }}</text></view>
    <view class="section">
      <text>类型: {{ detail.type }}</text>
      <text>原因: {{ detail.reason }}</text>
      <text>退款金额: ¥{{ (detail.refundAmount / 100).toFixed(2) }}</text>
    </view>
    <view v-if="detail.state === 'Approved'" class="section">
      <text class="section__title">填写退货物流</text>
      <input v-model="trackingNo" placeholder="物流单号" class="input" />
      <input v-model="carrier" placeholder="物流公司" class="input" />
      <button @click="submitTracking" style="margin-top:20rpx;background:$brand-color;color:#fff;border:none;border-radius:$radius-md;">提交</button>
    </view>
    <view v-if="detail.state === 'Pending'" style="padding:20rpx;">
      <button @click="cancelReq" style="background:#fff;color:#999;border:1rpx solid #ddd;border-radius:$radius-md;">取消申请</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getGraphQLClient } from '../../api/client';
import { updateReturnTracking, cancelAfterSalesRequest } from '../../api/mutations/after-sale';
import { useUIStore } from '../../stores/ui';
const ui = useUIStore();
const detail = ref<any>(null);
const trackingNo = ref('');
const carrier = ref('');
let reqId = '';
onMounted(async () => {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    reqId = page?.options?.id || '';
    const client = getGraphQLClient();
    const res: any = await client.request(`query($id:ID!) { afterSalesRequest(id:$id) { id orderId state type reason description refundAmount returnTrackingNo returnCarrier createdAt } }`, { id: reqId });
    detail.value = res.afterSalesRequest;
});
async function submitTracking() {
    await updateReturnTracking(reqId, trackingNo.value, carrier.value);
    ui.showToast('已提交', 'success');
}
async function cancelReq() {
    await cancelAfterSalesRequest(reqId);
    ui.showToast('已取消', 'success');
    setTimeout(() => uni.navigateBack(), 1000);
}
</script>
<style lang="scss" scoped>
.as-detail { padding: 20rpx; }
.section { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; display: flex; flex-direction: column; gap: 8rpx; &__title { font-weight: bold; color: $brand-color; } }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
</style>
<template>
  <view class="recharge-page">
    <view class="recharge-page__balance">
      <text>当前余额</text>
      <text class="recharge-page__amount">¥{{ (balance / 100).toFixed(2) }}</text>
    </view>
    <view class="section">
      <text class="section__title">充值卡充值</text>
      <input v-model="cardCode" placeholder="请输入卡密" class="input" />
      <input v-model="cardPin" placeholder="PIN码(可选)" class="input" />
      <button @click="doRecharge" class="recharge-page__btn">充值</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { redeemRechargeCard, getMyBalance } from '../../api/mutations/recharge';
import { useUIStore } from '../../stores/ui';
const ui = useUIStore();
const balance = ref(0);
const cardCode = ref('');
const cardPin = ref('');
onMounted(async () => { try { const r: any = await getMyBalance(); balance.value = r.myRechargeBalance || 0; } catch (e) {} });
async function doRecharge() {
    try {
        const res: any = await redeemRechargeCard(cardCode.value, cardPin.value || undefined);
        balance.value = res.redeemRechargeCard?.newBalance || 0;
        ui.showToast('充值成功 +¥' + (res.redeemRechargeCard?.faceValue / 100).toFixed(2), 'success');
        cardCode.value = ''; cardPin.value = '';
    } catch (e: any) { ui.showToast(e.message); }
}
</script>
<style lang="scss" scoped>
.recharge-page { padding: 20rpx; &__balance { background: $brand-color; color: #fff; padding: 40rpx; border-radius: $radius-md; text-align: center; margin-bottom: 20rpx; & .recharge-page__amount { font-size: 60rpx; font-weight: bold; display: block; margin-top: 12rpx; } } &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; } }
.section { background: #fff; padding: 20rpx; border-radius: $radius-md; &__title { font-weight: bold; font-size: 28rpx; display: block; margin-bottom: 16rpx; } }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-bottom: 16rpx; }
</style>
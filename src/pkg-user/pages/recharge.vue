<template>
  <view class="recharge-page">
    <view class="recharge-page__balance">
      <text>当前余额</text>
      <text class="recharge-page__amount">¥{{ (balance / 100).toFixed(2) }}</text>
    </view>

    <view class="section">
      <text class="section__title">在线充值</text>
      <view class="amount-row">
        <view
          v-for="amt in presetAmounts"
          :key="amt"
          class="amount-tag"
          :class="{ 'amount-tag--active': selectedAmount === amt }"
          @click="selectedAmount = amt"
        >¥{{ amt }}</view>
        <input
          v-model.trim="customAmount"
          type="digit"
          placeholder="自定义"
          class="amount-tag amount-tag--custom"
          @focus="selectedAmount = 0"
        />
      </view>
      <button
        class="recharge-page__btn"
        :disabled="!parsedAmount || paying"
        @click="doWechatRecharge"
      >{{ paying ? '支付中...' : '微信充值' }}</button>
    </view>

    <view class="section">
      <text class="section__title">卡密充值</text>
      <input v-model="cardCode" placeholder="请输入卡密" class="input" />
      <input v-model="cardPin" placeholder="PIN码(可选)" class="input" />
      <button @click="doRecharge" class="recharge-page__btn recharge-page__btn--ghost">充值</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { redeemRechargeCard, getMyBalance, createRechargeOrder, createWechatRechargePayment } from '../../api/mutations/recharge';
import { useUIStore } from '../../stores/ui';
import { handlePayment } from '../../composables/usePayment';
import { getPlatform } from '../../utils/platform';
const ui = useUIStore();

const balance = ref(0);
const cardCode = ref('');
const cardPin = ref('');
const presetAmounts = [50, 100, 200, 500];
const selectedAmount = ref(100);
const customAmount = ref('');
const paying = ref(false);

// 取当前生效金额（元）：选中档位或自定义
const parsedAmount = computed(() => {
    const v = selectedAmount.value > 0 ? selectedAmount.value : Number(customAmount.value);
    return v > 0 ? v : 0;
});

onMounted(async () => {
    try { const r: any = await getMyBalance(); balance.value = r.myRechargeBalance || 0; } catch (e) {}
});

async function refreshBalance() {
    try { const r: any = await getMyBalance(); balance.value = r.myRechargeBalance || 0; } catch (e) {}
}

async function doWechatRecharge() {
    if (!parsedAmount.value || paying.value) return;
    paying.value = true;
    const amount = parsedAmount.value * 100; // 元 → 分
    try {
        // 1. 建单
        const orderRes: any = await createRechargeOrder(amount, 'online');
        const id = orderRes.createRechargeOrder.id;
        // 2. 发起支付
        const tradeType = getPlatform() === 'mp-weixin' ? 'JSAPI' : 'H5';
        const openid = uni.getStorageSync('auth_openid') || undefined;
        const payRes: any = await createWechatRechargePayment(id, tradeType, openid);
        const pay = payRes.createWechatRechargePayment.pay;
        // 3. 调起支付：结构与订单支付 metadata 一致，走 usePayment 现成分支
        const result = await handlePayment('wechatpay', pay);
        if (!result.success) {
            ui.showToast(result.message || '支付未完成', 'error');
            return;
        }
        // 4. 返回后刷新余额
        ui.showToast('充值成功', 'success');
        await refreshBalance();
    } catch (e: any) {
        ui.showToast(e.message || '充值失败', 'error');
    } finally {
        paying.value = false;
    }
}

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
.recharge-page { padding: 20rpx; &__balance { background: $brand-color; color: #fff; padding: 40rpx; border-radius: $radius-md; text-align: center; margin-bottom: 20rpx; & .recharge-page__amount { font-size: 60rpx; font-weight: bold; display: block; margin-top: 12rpx; } } &__btn { margin-top: 20rpx; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; &--ghost { background: #fff; color: $brand-color; border: 1rpx solid $brand-color; } } }
.section { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 20rpx; &__title { font-weight: bold; font-size: 28rpx; display: block; margin-bottom: 16rpx; } }
.amount-row { display: flex; flex-wrap: wrap; gap: 16rpx; }
.amount-tag { min-width: 120rpx; text-align: center; padding: 16rpx 20rpx; border: 1rpx solid $border-color; border-radius: $radius-md; font-size: 28rpx; color: $text-color; &--active { border-color: $brand-color; color: $brand-color; } &--custom { border-style: dashed; width: auto; font-size: 26rpx; } }
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-bottom: 16rpx; }
</style>
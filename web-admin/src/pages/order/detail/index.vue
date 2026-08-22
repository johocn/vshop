<template>
  <view class="page">
    <view class="card">
      <view class="row"><text class="code">{{ d.code }}</text><text class="st">{{ d.state }}</text></view>
      <text class="total">合计 ¥ {{ (d.totalWithTax / 100).toFixed(2) }}</text>
    </view>
    <view class="card" v-if="d.customer">
      <text class="sec-title">顾客</text>
      <text class="line">{{ d.customer.firstName }} {{ d.customer.lastName }} · {{ d.customer.emailAddress }}</text>
    </view>
    <view class="card" v-if="d.shippingAddress">
      <text class="sec-title">收货信息</text>
      <text class="line">{{ d.shippingAddress.fullName }} {{ d.shippingAddress.phoneNumber }}</text>
      <text class="line">{{ d.shippingAddress.province }} {{ d.shippingAddress.city }} {{ d.shippingAddress.streetLine1 }}</text>
    </view>
    <view class="card" v-if="d.lines && d.lines.length">
      <text class="sec-title">商品</text>
      <view class="line" v-for="l in d.lines" :key="l.id">
        <text>{{ l.productVariant?.name }} × {{ l.quantity }}</text>
      </view>
    </view>
    <button class="save" v-if="d.state==='WaitingForShipping'" @tap="ship">去发货</button>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchOrderDetail } from '../../../apis/order';
const d = ref<any>({});
onMounted(async () => { const id = ((getCurrentPages().at(-1) as any)?.options?.id) || ''; d.value = await fetchOrderDetail(id); });
function ship() { uni.navigateTo({ url: `/pages/order/ship/index?id=${d.value.id}` }); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; }
      .st { font-size: 24rpx; color: $wa-accent; }
    }
    .total { display: block; margin-top: 16rpx; font-size: 32rpx; color: $wa-danger; font-weight: 600; }
    .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
    .line { display: block; font-size: 28rpx; color: $wa-ink; line-height: 1.6; }
  }
  .save { margin-top: 24rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; font-size: 30rpx; }
}
</style>

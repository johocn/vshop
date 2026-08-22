<template>
  <view class="page">
    <view class="card" v-for="a in items" :key="a.id">
      <view class="row">
        <text class="code">售后 #{{ a.id }}</text>
        <text class="st">{{ a.state }}</text>
      </view>
      <text class="line">订单 #{{ a.orderId }} · {{ a.type }}</text>
      <text class="line" v-if="a.reason">原因：{{ a.reason }}</text>
      <text class="line" v-if="a.refundAmount != null">退款 ¥ {{ (a.refundAmount / 100).toFixed(2) }}</text>
      <text class="line" v-if="a.rejectReason">驳回：{{ a.rejectReason }}</text>
    </view>
    <view v-if="!items.length" class="empty">暂无售后工单</view>
    <view style="height: 120rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchAfterSales } from '../../../apis/afterSale';

const items = ref<any[]>([]);
onMounted(async () => { items.value = (await fetchAfterSales(20)).items; });
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; }
      .st { font-size: 24rpx; color: $wa-accent; }
    }
    .line { display: block; font-size: 26rpx; color: $wa-muted; line-height: 1.6; margin-top: 8rpx; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

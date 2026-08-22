<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in states" :key="s.key" :class="{ on: s.key === cur }" @tap="cur = s.key; load()">{{ s.label }}</text>
    </view>
    <view class="card" v-for="o in items" :key="o.id" @tap="show(o)">
      <view class="row"><text class="code">{{ o.code }}</text><text class="st">{{ o.state }}</text></view>
      <text class="total">¥ {{ (o.totalWithTax / 100).toFixed(2) }}</text>
    </view>
    <view v-if="!items.length" class="empty">暂无订单</view>
    <view style="height: 120rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchOrders } from '../../../apis/order';

const states = [
  { key: '', label: '全部' },
  { key: 'WaitingForShipping', label: '待发货' },
  { key: 'Delivered', label: '已发货' },
  { key: 'Completed', label: '已完成' },
];
const cur = ref('');
const items = ref<any[]>([]);

async function load() { items.value = (await fetchOrders(20, 0, cur.value)).items; }
onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
function show(o: any) { uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` }); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; }
      .st { font-size: 24rpx; color: $wa-accent; }
    }
    .total { display: block; margin-top: 16rpx; font-size: 30rpx; color: $wa-danger; font-weight: 600; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

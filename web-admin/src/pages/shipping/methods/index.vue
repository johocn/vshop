<template>
  <view class="page">
    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <text class="name">{{ s.name }}</text>
        <text class="code">{{ s.code }}</text>
      </view>
      <text class="desc">{{ s.description || '—' }}</text>
    </view>
    <view v-if="!items.length" class="empty">暂无配送方式</view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchShippingMethods } from '../../../apis/shipping';

const items = ref<any[]>([]);
onMounted(async () => { items.value = await fetchShippingMethods(); });
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .code { font-size: 24rpx; color: $wa-muted; }
    }
    .desc { display: block; margin-top: 12rpx; font-size: 26rpx; color: $wa-muted; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

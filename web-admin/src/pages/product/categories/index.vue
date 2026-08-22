<template>
  <view class="page">
    <view class="sec-title">分类</view>
    <view class="card" v-for="c in cats" :key="c.id">
      <text>{{ c.name }}</text>
    </view>
    <view v-if="!cats.length" class="empty">暂无分类</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchCollections } from '../../../apis/product';

const cats = ref<any[]>([]);
onMounted(async () => { cats.value = await fetchCollections(); });
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .sec-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    text { font-size: 28rpx; color: $wa-ink; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

<template>
  <view class="page">
    <view class="card">
      <view class="cell">
        <text class="lbl">商品名</text>
        <input v-model="name" placeholder="必填" />
      </view>
      <view class="cell">
        <text class="lbl">Slug</text>
        <input v-model="slug" placeholder="URL 别名" />
      </view>
    </view>
    <button class="save" @tap="create">创建</button>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { createProduct } from '../../../apis/product';

const name = ref('');
const slug = ref('');

async function create() {
  if (!name.value) return uni.showToast({ title: '请填商品名', icon: 'none' });
  const id = await createProduct(name.value, slug.value || name.value);
  uni.redirectTo({ url: `/pages/product/edit/index?id=${id}&new=1` });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx;
    .cell { display: flex; align-items: center; padding: 28rpx 0; border-bottom: 1rpx solid $wa-rule;
      .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 28rpx; }
      &:last-child { border-bottom: none; }
    }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>

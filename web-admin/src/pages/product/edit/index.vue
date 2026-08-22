<template>
  <view class="page">
    <view class="card">
      <view class="cell">
        <text class="lbl">商品名</text>
        <input v-model="detail.name" />
      </view>
      <view class="cell">
        <text class="lbl">Slug</text>
        <input v-model="detail.slug" />
      </view>
      <view class="cell row-in">
        <text class="lbl">状态</text>
        <switch :checked="detail.enabled" @change="onToggle" />
      </view>
    </view>
    <button class="save" @tap="save">保存</button>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchProductDetail, updateProduct } from '../../../apis/product';

const id = ref('');
const detail = ref<any>({});

onMounted(async () => {
  id.value = (getCurrentPages().at(-1) as any)?.options?.id || '';
  detail.value = await fetchProductDetail(id.value);
});

function onToggle(e: any) { detail.value.enabled = e.detail.value; }

async function save() {
  await updateProduct(id.value, {
    enabled: detail.value.enabled,
    name: detail.value.name,
    slug: detail.value.slug,
    description: detail.value.description,
  });
  uni.showToast({ title: '已保存', icon: 'success' });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 8rpx 32rpx;
    .cell { display: flex; align-items: center; padding: 28rpx 0; border-bottom: 1rpx solid $wa-rule;
      .lbl { width: 180rpx; font-size: 28rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 28rpx; }
      &.row-in { justify-content: space-between; }
      &:last-child { border-bottom: none; }
    }
  }
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>

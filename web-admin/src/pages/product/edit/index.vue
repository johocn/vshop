<template>
  <view class="page">
    <view v-if="loaded">
      <ProductForm ref="form" :initial="initial" @submit="onSubmit" />
      <button class="save" @tap="doSave">保存</button>
    </view>
    <view v-else class="empty">加载中…</view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import ProductForm from '../../../components/ProductForm.vue';
import { fetchProductFull, updateProductFull } from '../../../apis/product';

const id = ref('');
const loaded = ref(false);
const form = ref<any>(null);
const initial = ref<any>(null);
let busy = false;

onMounted(async () => {
  id.value = (getCurrentPages().at(-1) as any)?.options?.id || '';
  const full = await fetchProductFull(id.value);
  initial.value = {
    name: full.name,
    slug: full.slug,
    description: full.description,
    priceYuan: full.variant ? full.variant.price / 100 : 0,
    stock: full.variant?.stockOnHand ?? 0,
    enabled: full.enabled,
    // ImagePicker 的 value 是资产 id 数组，故回填真实 id（full.assets 已带 id）
    assetIds: (full.assets || []).map((a) => a.id).filter(Boolean),
    shippingProfileId: full.variant?.customFields?.shippingProfileId ?? '',
    paymentProfileId: full.variant?.customFields?.paymentProfileId ?? '',
    // 归属分类：统一在分类管理页（Task 11）维护；编辑页不反解 product-id-filter，置空既不预选也不改动
    collectionId: undefined,
  };
  loaded.value = true;
});

async function doSave() {
  if (!busy) await form.value?.submit?.();
}

async function onSubmit(d: any) {
  busy = true;
  try {
    await updateProductFull(id.value, d);
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '保存失败', icon: 'none' });
  } finally {
    busy = false;
  }
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 32rpx 32rpx 160rpx;
  .save {
    margin-top: 48rpx;
    background: $wa-accent;
    color: #fff;
    font-size: 30rpx;
    border-radius: $wa-radius;
  }
  .empty {
    padding: 80rpx 0;
    text-align: center;
    color: $wa-muted;
    font-size: 28rpx;
  }
}
</style>
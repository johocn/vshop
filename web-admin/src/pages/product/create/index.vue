<template>
  <view class="page">
    <ProductForm ref="form" @submit="onSubmit" />
    <button class="save" @tap="doSave">{{ locale.t('productCreate.save') }}</button>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import ProductForm from '../../../components/ProductForm.vue';
import { createProductFull } from '../../../apis/product';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const form = ref<any>(null);
let busy = false;

async function doSave() {
  if (busy) return;
  await form.value?.submit?.();
}
async function onSubmit(d: any) {
  busy = true;
  try {
    const id = await createProductFull(d);
    uni.redirectTo({ url: `/pages/product/edit/index?id=${id}` });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('productCreate.createFailed'), icon: 'none' });
  } finally { busy = false; }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 160rpx;
  .save { margin-top: 48rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
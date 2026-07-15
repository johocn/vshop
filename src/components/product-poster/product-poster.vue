<template>
  <view>
    <!-- #ifdef H5 -->
    <ProductPosterH5 v-if="data" :data="data" @close="$emit('close')" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <ProductPosterMp v-if="data" :data="data" @close="$emit('close')" />
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePosterData, type PosterData } from './usePosterData';

// #ifdef H5
import ProductPosterH5 from './product-poster-h5.vue';
// #endif
// #ifdef MP-WEIXIN
import ProductPosterMp from './product-poster-mp.vue';
// #endif

const props = defineProps<{ product: any }>();
defineEmits<{ close: [] }>();

const { preparePosterData } = usePosterData();
const data = ref<PosterData | null>(null);

onMounted(async () => {
    try {
        data.value = await preparePosterData(props.product);
    } catch (e) {
        uni.showToast({ title: '海报生成失败', icon: 'none' });
    }
});
</script>

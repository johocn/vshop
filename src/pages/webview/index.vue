<template>
  <web-view :src="url"></web-view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const url = ref('');

onLoad((query: any) => {
    url.value = decodeURIComponent(query?.url || '');
});
</script>

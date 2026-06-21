<template>
  <image
    :src="optimizedUrl"
    :mode="mode"
    :lazy-load="true"
    :style="{ width: width, height: height }"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
    src: string;
    width?: string;
    height?: string;
    mode?: string;
    quality?: number;
}>(), {
    width: '100%',
    height: 'auto',
    mode: 'aspectFill',
    quality: 80,
});

const fallback = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23f5f5f5%22 width=%22100%22 height=%22100%22/></svg>';
const hasError = ref(false);

const optimizedUrl = computed(() => {
    if (hasError.value || !props.src) return fallback;
    // OSS image processing for thumbnails
    if (props.src.includes(`aliyuncs.com`) || props.src.includes(`oss`)) {
        return props.src + `?x-oss-process=image/resize,w_400/quality,q_` + props.quality + `/format,webp`;
    }
    return props.src;
});

function onError() { hasError.value = true; }
</script>
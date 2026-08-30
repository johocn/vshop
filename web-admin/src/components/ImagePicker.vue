<template>
  <MediaPicker :max="max" :value="value" mediaType="image" @change="(ids) => $emit('change', ids)" />
</template>
<script lang="ts" setup>
import MediaPicker from './MediaPicker.vue';
defineProps<{ max?: number; value?: string[] }>();
defineEmits<{ (e: 'change', ids: string[]): void }>();
</script>
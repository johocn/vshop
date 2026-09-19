<template>
  <view class="pgbar">
    <text class="pg-btn" :class="{ dis: page <= 1 }" @tap="emit('page', -1)">上一页</text>
    <text class="pg-info">第 {{ page }} / {{ pages }} 页 · 共 {{ totalItems }} 单</text>
    <text class="pg-btn" :class="{ dis: page >= pages }" @tap="emit('page', 1)">下一页</text>
    <text class="pg-size" v-for="n in [20, 50, 100]" :key="n" :class="{ on: perPage === n }" @tap="emit('perpage', n)">{{ n }}</text>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

// 桌面分页条，自原页面 pgbar 块原样迁移（默认隐藏、≥768 显示；是否渲染由 Renderer 按 scope 决定）
const props = withDefaults(
  defineProps<{ page: number; totalItems: number; perPage: number }>(),
  { page: 1, totalItems: 0, perPage: 20 }
);
const emit = defineEmits<{
  (e: 'page', delta: number): void;
  (e: 'perpage', n: number): void;
}>();

const pages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.perPage)));
</script>

<style lang="scss" scoped>
.pgbar {
  display: none;
  align-items: center;
  gap: 12rpx;
  margin-top: 20rpx;
  font-size: 13px;
  color: $wa-muted;

  .pg-btn {
    padding: 6px 14px;
    border: 1rpx solid #d8dee9;
    border-radius: 6px;
    cursor: pointer;
    background: $wa-card;

    &.dis { opacity: 0.4; cursor: default; }
  }

  .pg-info { margin: 0 8px; }

  .pg-size {
    padding: 4px 10px;
    border: 1rpx solid #d8dee9;
    border-radius: 6px;
    cursor: pointer;

    &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; }
  }
}

@media (min-width: 768px) {
  .pgbar { display: flex; }
}
</style>

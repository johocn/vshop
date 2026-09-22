<template>
  <!-- 批次卡片：code / 仓 / 状态徽标 / 单数 / 件数 / 点击进详情 -->
  <view class="bcard" @tap="emit('open')">
    <view class="top">
      <text class="code">{{ batch.code }}</text>
      <text class="st" :class="stateClass">{{ $t('orderAdmin.picking.state.' + batch.state) }}</text>
    </view>
    <view class="mid">
      <text class="wh">{{ warehouseName || '—' }}</text>
      <text class="cnt">{{ $t('orderAdmin.picking.batchCounts').replace('{orders}', String(batch.memberCount)).replace('{items}', String(batch.itemCount)) }}</text>
    </view>
    <view class="foot">
      <text class="tm">{{ createdLabel }}</text>
      <text class="by" v-if="batch.createdBy">{{ batch.createdBy }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { PickBatch } from '../../apis/picking';

const props = defineProps<{ batch: PickBatch; warehouseName?: string }>();
const emit = defineEmits<{ (e: 'open'): void }>();

// 状态 → 徽标配色（状态机五值固定，见设计 §5）
const stateClass = computed(() => {
  switch (props.batch.state) {
    case 'SHIPPED': return 'ok';
    case 'CANCELLED': return 'dead';
    case 'PRINTED': return 'ready';
    default: return 'doing';
  }
});

// 时间只取到分钟，避免卡片上出现秒级噪音
const createdLabel = computed(() => String(props.batch.createdAt || '').replace('T', ' ').slice(0, 16));
</script>

<style lang="scss" scoped>
.bcard {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;

  .top { display: flex; align-items: center;
    .code { flex: 1; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-accent;
      &.doing { background: $wa-accent; }
      &.ready { background: $wa-ink; }
      &.ok { background: $wa-success; }
      &.dead { background: $wa-muted; }
    }
  }
  .mid { display: flex; align-items: center; margin-top: 14rpx;
    .wh { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .cnt { font-size: 24rpx; color: $wa-muted; }
  }
  .foot { display: flex; align-items: center; margin-top: 12rpx;
    .tm { flex: 1; font-size: 22rpx; color: $wa-muted; }
    .by { font-size: 22rpx; color: $wa-muted; }
  }
}
</style>
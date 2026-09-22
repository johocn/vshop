<template>
  <!-- 目标仓选择（底部抽屉）：默认就近推荐，可手动改；推荐为 null 时不伪造距离 -->
  <view v-if="visible" class="mask" @tap="emit('close')">
    <view class="sheet" @tap.stop>
      <text class="stitle">{{ $t('orderAdmin.picking.targetWarehouse') }}</text>

      <view class="hint" :class="{ none: !recommendedId }">
        <text v-if="recommendedId" class="hl">
          {{ $t('orderAdmin.picking.recommendHint').replace('{name}', recommendedName) }}<text v-if="distanceKm != null" class="hk"> · {{ distanceKm }}km</text>
        </text>
        <text v-else class="hl">{{ $t('orderAdmin.picking.recommendNone') }}</text>
      </view>

      <view class="list">
        <view
          v-for="l in locations"
          :key="l.id"
          class="item"
          :class="{ on: String(l.id) === String(pickedId) }"
          @tap="pickedId = String(l.id)"
        >
          <text class="nm">{{ l.name }}</text>
          <text v-if="String(l.id) === String(recommendedId)" class="rk">{{ $t('orderAdmin.picking.recommended') }}</text>
          <text class="rd" :class="{ on: String(l.id) === String(pickedId) }"><text v-if="String(l.id) === String(pickedId)">✓</text></text>
        </view>
      </view>
      <view v-if="!locations.length" class="empty">{{ $t('orderAdmin.picking.noWarehouse') }}</view>

      <view class="btns">
        <text class="btn ghost" @tap="emit('close')">{{ $t('orderAdmin.picking.cancel') }}</text>
        <text class="btn" :class="{ dis: submitting || !pickedId }" @tap="onConfirm">
          {{ $t('orderAdmin.picking.createBatch') }}
        </text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  locations: Array<{ id: string; name: string }>;
  /** 就近推荐仓 id；为 null 时显示「请手动选择目标仓」且不展示距离（设计 §9） */
  recommendedId: string | null;
  distanceKm: number | null;
  submitting?: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', id: string): void }>();

const pickedId = ref<string>('');

// 每次打开都以推荐仓为默认值（推荐为空则强制手选）
watch(
  () => props.visible,
  (v) => {
    if (v) pickedId.value = props.recommendedId ? String(props.recommendedId) : '';
  },
);

const recommendedName = computed(() => {
  const hit = props.locations.find((l) => String(l.id) === String(props.recommendedId));
  return hit?.name ?? String(props.recommendedId ?? '');
});

function onConfirm(): void {
  if (props.submitting || !pickedId.value) return;
  emit('confirm', pickedId.value);
}
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 20;
}
.sheet {
  width: 100%;
  background: $wa-card;
  border-radius: $wa-radius $wa-radius 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));

  .stitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; }

  .hint { margin-top: 16rpx; padding: 16rpx 20rpx; border-radius: 8rpx; background: #fff4ea;
    &.none { background: #fee; }
    .hl { font-size: 24rpx; color: $wa-accent;
      .hk { color: $wa-accent; }
    }
    &.none .hl { color: $wa-danger; }
  }

  .list { margin-top: 20rpx; max-height: 640rpx; overflow-y: auto;
    .item { display: flex; align-items: center; gap: 16rpx; padding: 24rpx 20rpx; border-bottom: 1rpx solid $wa-rule;
      &.on { background: #fff8f2; }
      .nm { flex: 1; font-size: 28rpx; color: $wa-ink; }
      .rk { font-size: 20rpx; color: $wa-accent; background: #fff4ea; border-radius: 6rpx; padding: 2rpx 12rpx; }
      .rd { width: 40rpx; height: 40rpx; border-radius: 50%; border: 2rpx solid $wa-rule; display: flex; align-items: center; justify-content: center;
        &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }

  .btns { display: flex; gap: 20rpx; margin-top: 32rpx;
    .btn { flex: 1; text-align: center; font-size: 28rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 20rpx 0;
      &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
      &.dis { opacity: 0.5; }
    }
  }
}
</style>
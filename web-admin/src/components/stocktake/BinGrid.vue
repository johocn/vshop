<template>
  <!-- 版式 B 主视图：库区 → 格子宫格（空格子保留、有货带 SKU 角标、选中高亮） -->
  <view class="bgrid">
    <view class="ztabs">
      <text
        v-for="g in groups"
        :key="g.zoneId"
        class="zt"
        :class="{ on: String(activeZoneId) === String(g.zoneId) }"
        @tap="emit('pickZone', g.zoneId)"
      >{{ g.zoneCode }}</text>
    </view>

    <view v-if="active && showCells" class="cells">
      <view
        v-for="b in active.bins"
        :key="b.binId"
        class="cell"
        :class="{ empty: !b.skuCount, on: String(selectedBinId) === String(b.binId) }"
        @tap="emit('pickBin', b.binId)"
      >
        <text class="cc">{{ b.binCode }}</text>
        <text class="cn">{{ b.skuCount }}</text>
      </view>
    </view>
    <view v-else-if="!active" class="none">{{ emptyText }}</view>

    <view v-if="active" class="sum">{{ summaryText(active) }}</view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ZoneGroup } from '../../utils/stocktake-grid';

const props = defineProps<{
  groups: ZoneGroup[];
  activeZoneId?: string | null;
  selectedBinId?: string | null;
  emptyText: string;
  /** 是否渲染具体库位格子：仅 bin 档为真（zone 档只到库区，不暴露库位码；规格 §8.2） */
  showCells: boolean;
  /** 「本库区 SKU x 项 · 空格 y 个」文案由父组件用 i18n 备好 */
  summaryText: (g: ZoneGroup) => string;
}>();
const emit = defineEmits<{ (e: 'pickZone', id: string): void; (e: 'pickBin', id: string): void }>();

const active = computed(() =>
  props.groups.find((g) => String(g.zoneId) === String(props.activeZoneId)) ?? null,
);
</script>

<style lang="scss" scoped>
.bgrid {
  .ztabs { display: flex; overflow-x: auto; white-space: nowrap; padding-bottom: 12rpx;
    .zt { display: inline-block; font-size: 26rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius;
      padding: 12rpx 28rpx; margin-right: 12rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .cells { display: flex; flex-wrap: wrap;
    .cell { width: 150rpx; height: 120rpx; margin: 0 16rpx 16rpx 0; border-radius: $wa-radius; background: $wa-card;
      display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2rpx solid transparent;
      .cc { font-size: 24rpx; color: $wa-ink; }
      .cn { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      &.empty { background: #fafafa; .cn { color: #c8c8c8; } }
      &.on { border-color: $wa-accent; }
    }
  }
  .none { font-size: 25rpx; color: $wa-muted; padding: 40rpx 0; }
  .sum { font-size: 23rpx; color: $wa-muted; margin-top: 8rpx; }
}
</style>
<template>
  <view class="card" :class="[row.bucket, { on: selected }]">
    <view class="top">
      <view class="thumb" @tap="emit('toggle')">
        <image v-if="row.thumbnail" class="img" :src="row.thumbnail" mode="aspectFill" />
        <text v-else class="ph">{{ locale.t('inventoryStock.card.noThumb') }}</text>
      </view>
      <view class="mid">
        <text class="nm">{{ row.variantName || row.sku }}</text>
        <text class="skuline">{{ row.sku }}<text v-if="row.optionText"> · {{ row.optionText }}</text></text>
        <view class="tags">
          <text class="tag" :class="row.bucket">{{ $t(bucketK) }}</text>
          <text v-if="row.locationName" class="loc">{{ row.locationName }}</text>
        </view>
      </view>
      <view class="check" :class="{ on: selected }" @tap="emit('toggle')"><text v-if="selected">✓</text></view>
    </view>

    <view class="nums">
      <view class="n"><text class="nv">{{ row.onHand }}</text><text class="nl">{{ $t('inventoryStock.num.onHand') }}</text></view>
      <view class="n"><text class="nv">{{ row.allocated }}</text><text class="nl">{{ $t('inventoryStock.num.allocated') }}</text></view>
      <view class="n"><text class="nv">{{ row.available }}</text><text class="nl">{{ $t('inventoryStock.num.available') }}</text></view>
      <view class="n"><text class="nv">{{ row.safetyStock }}</text><text class="nl">{{ $t('inventoryStock.num.safety') }}</text></view>
    </view>

    <view class="meta">
      <text class="m">{{ $t('inventoryStock.card.value') }} {{ moneyLabel(row.value) }}</text>
      <text class="m">{{ locale.t('inventoryStock.card.lastMove') }} {{ lastMove }}</text>
    </view>

    <view class="acts">
      <text class="act ghost" @tap="emit('open-movements')">{{ $t('inventoryStock.card.movements') }}</text>
      <text class="act ghost" @tap="emit('adjust')">{{ $t('inventoryStock.card.adjust') }}</text>
      <text class="act" @tap="emit('replenish')">{{ $t('inventoryStock.card.replenish') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { InventoryStockRow } from '../../apis/inventory';
import { useLocaleStore } from '../../stores/localeStore';
import { bizTypeKey, bucketKey, dirKey, formatDateTime, moneyLabel } from '../../utils/inventoryFormat';

const props = defineProps<{ row: InventoryStockRow; selected: boolean }>();
const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'open-movements'): void;
  (e: 'replenish'): void;
  (e: 'adjust'): void;
}>();

const locale = useLocaleStore();

// 分桶文案由纯函数映射，避免页面处处 if/else（服务端已给 bucket，前端不重算）
// 注意：`bucketKey`/`dirKey`/`bizTypeKey` 返回的是**不含命名空间的裸键**（如 'bucket.out' / 'move.in'），
//       契约表 1.5 已把它们统一收在 `inventoryStock` 命名空间下，故此处必须补前缀 `inventoryStock.`。
const bucketK = computed(() => `inventoryStock.${bucketKey(props.row.bucket)}`);

const lastMove = computed(() => {
  const at = formatDateTime(props.row.lastMovementAt);
  if (!at) return locale.t('inventoryStock.card.neverMove');
  const dir = locale.t(`inventoryStock.${dirKey(props.row.lastDirection)}`);
  const biz = locale.t(`inventoryStock.${bizTypeKey(props.row.lastBizType)}`);
  return `${at} · ${dir} · ${biz}`;
});
</script>

<style lang="scss" scoped>
.card {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid transparent;

  &.out { border-color: $wa-danger; }
  &.low { border-color: $wa-accent; }
  &.on { background: #fff8f2; }

  .top { display: flex; align-items: flex-start; gap: 20rpx;

    .thumb { width: 110rpx; height: 110rpx; border-radius: 8rpx; background: $wa-bg; display: flex; align-items: center; justify-content: center; overflow: hidden;
      .img { width: 110rpx; height: 110rpx; }
      .ph { font-size: 20rpx; color: $wa-muted; }
    }

    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column;
      .nm { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .skuline { font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; }
      .tags { display: flex; align-items: center; gap: 12rpx; margin-top: 10rpx;
        .tag { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 2rpx 12rpx; background: $wa-success;
          &.out { background: $wa-danger; }
          &.low { background: $wa-accent; }
        }
        .loc { font-size: 20rpx; color: $wa-muted; }
      }
    }

    .check { width: 40rpx; height: 40rpx; border-radius: 50%; border: 2rpx solid $wa-rule; display: flex; align-items: center; justify-content: center;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
    }
  }

  .nums { display: flex; margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
    .n { flex: 1; display: flex; flex-direction: column; align-items: center;
      .nv { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
      .nl { font-size: 20rpx; color: $wa-muted; margin-top: 4rpx; }
    }
  }

  .meta { display: flex; justify-content: space-between; margin-top: 16rpx;
    .m { font-size: 22rpx; color: $wa-muted; }
  }

  .acts { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 18rpx;
    .act { font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 10rpx 24rpx;
      &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
    }
  }
}
</style>
<template>
  <!-- 应盘行：SKU + 名称 + 账面提示 + 数量输入 + 已盘/盘盈标记 -->
  <view class="lrow" :class="{ done: counted, extra: line.isExtra }">
    <view class="left">
      <text class="sku">{{ line.variantSku }}</text>
      <text class="nm">{{ line.variantName }}</text>
      <text class="bk">{{ $t('stocktake.count.bookQty').replace('{n}', String(line.bookQty)) }}</text>
    </view>
    <view class="right">
      <input
        class="qty"
        type="number"
        :disabled="!editable"
        :value="modelValue"
        :placeholder="counted ? '' : '—'"
        @input="emit('update:modelValue', ($event as any).detail.value)"
      />
      <text v-if="counted" class="tag ok">{{ $t('stocktake.count.countedMark') }}</text>
      <text v-else-if="line.isExtra" class="tag ex">{{ $t('stocktake.count.extraMark') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { isCounted, type StocktakeLineRow } from '../../utils/stocktake-grid';

const props = defineProps<{
  line: StocktakeLineRow;
  modelValue: string;
  editable: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const counted = computed(() => isCounted(props.line));
</script>

<style lang="scss" scoped>
.lrow {
  display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 12rpx;
  .left { flex: 1;
    .sku { display: block; font-size: 27rpx; color: $wa-ink; }
    .nm { display: block; font-size: 23rpx; color: $wa-muted; margin-top: 4rpx; }
    .bk { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
  }
  .right { display: flex; align-items: center;
    .qty { width: 140rpx; text-align: center; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 0; font-size: 28rpx; color: $wa-ink; }
    .tag { font-size: 20rpx; border-radius: 6rpx; padding: 4rpx 12rpx; margin-left: 12rpx; color: #fff;
      &.ok { background: $wa-success; }
      &.ex { background: $wa-accent; }
    }
  }
  &.done { .sku { color: $wa-success; } }
}
</style>
<template>
  <!-- 批次成员行：勾选 + 单号 + 收件人 + 商品摘要 + 「改地址」 -->
  <view class="row" :class="{ on: selected }">
    <view v-if="!readonly" class="check" :class="{ on: selected }" @tap="emit('toggle')"><text v-if="selected">✓</text></view>
    <view class="mid">
      <view class="l1">
        <text class="code">{{ member.code }}</text>
        <text class="cnt">{{ $t('orderAdmin.picking.itemCount').replace('{n}', String(member.itemCount)) }}</text>
      </view>
      <text class="who">{{ member.customerName || '—' }}<text v-if="member.phoneNumber" class="ph"> · {{ member.phoneNumber }}</text></text>
      <text class="addr">{{ member.address }}</text>
      <text v-if="summary" class="sum">{{ summary }}</text>
    </view>
    <text class="edit" :class="{ dis: readonly }" @tap="onEdit">{{ $t('orderAdmin.picking.address.edit') }}</text>
  </view>
</template>

<script lang="ts" setup>
import type { PickOrderSnapshot } from '../../apis/picking';

const props = defineProps<{
  member: PickOrderSnapshot;
  selected: boolean;
  /** SHIPPED / CANCELLED 批次整页只读：隐藏勾选并禁用改地址 */
  readonly?: boolean;
  /** 商品摘要（由页面按拣货汇总行拼好，组件不自己聚合） */
  summary?: string;
}>();
const emit = defineEmits<{ (e: 'toggle'): void; (e: 'edit-address'): void }>();

function onEdit(): void {
  if (props.readonly) return;
  emit('edit-address');
}
</script>

<style lang="scss" scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;
  border: 2rpx solid transparent;

  &.on { background: #fff8f2; border-color: $wa-accent; }

  .check {
    flex: none;
    width: 40rpx;
    height: 40rpx;
    margin-top: 4rpx;
    border-radius: 50%;
    border: 2rpx solid $wa-rule;
    display: flex;
    align-items: center;
    justify-content: center;

    &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
  }

  .mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;

    .l1 { display: flex; align-items: center; gap: 12rpx;
      .code { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .cnt { font-size: 20rpx; color: $wa-muted; background: $wa-bg; border-radius: 6rpx; padding: 2rpx 12rpx; }
    }
    .who { font-size: 26rpx; color: $wa-ink; margin-top: 8rpx;
      .ph { color: $wa-muted; font-size: 24rpx; }
    }
    .addr { font-size: 24rpx; color: $wa-muted; margin-top: 6rpx; line-height: 1.5; }
    .sum { font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
  }

  .edit {
    flex: none;
    font-size: 24rpx;
    color: $wa-accent;
    border: 1rpx solid $wa-accent;
    border-radius: 8rpx;
    padding: 8rpx 18rpx;

    &.dis { opacity: 0.4; color: $wa-muted; border-color: $wa-rule; }
  }
}
</style>
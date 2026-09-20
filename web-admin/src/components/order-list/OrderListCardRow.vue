<template>
  <view class="card" :class="{ 'in-group': blocks.groupByState }">
    <view class="row head">
      <!-- status-first：状态前置（手机卡片） -->
      <template v-if="blocks.stateColumnFirst">
        <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
        <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
      </template>
      <template v-else>
        <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
        <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
      </template>
    </view>
    <view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ blocks.showDeliveryName && o.delivery ? ' · ' + o.delivery : '' }}</view>
    <view class="addr" v-if="blocks.showAddress && o.address"><text class="addr-ic">📍</text><text class="addr-tx">{{ o.address }}</text></view>
    <view class="goods" v-for="(g, gi) in o.goods" :key="gi">
      <image v-if="g.image" class="g-thumb" :src="g.image" mode="aspectFill" />
      <view v-else class="g-thumb"></view>
      <text class="g-name">{{ g.name }}</text>
      <text class="g-price">×{{ g.qty }} ¥{{ fmtMoney(g.price) }}</text>
    </view>
    <view class="row foot">
      <text class="time">{{ o.payment ? o.payment + ' · ' : '' }}{{ fmtTime(o.time) }}</text>
      <text class="total">¥{{ fmtMoney(o.total) }}</text>
    </view>
    <view class="actions">
      <text v-if="isShippable(o.state)" class="act ship" @tap="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
      <text v-if="redeemable" class="act redeem" @tap="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
      <text v-if="isUnpaid(o.state)" class="act remind" @tap="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
      <text class="act ghost" @tap="emit('detail', o)">{{ $t('orderListComp.actions.detail') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, fmtMoney, shipColor, isShippable, isUnpaid } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { useLocaleStore } from '../../stores/localeStore';

// 手机卡片行，自原页面 card-list 块原样迁移；blocks 控制：showAddress/showDeliveryName/stateColors/groupByState/stateColumnFirst
// 分组容器由 Renderer 包裹，本组件只渲染单行（groupByState 时仅行样式适配容器）
const locale = useLocaleStore();
const props = withDefaults(
  defineProps<{
    o: OrderView;
    blocks: Record<string, any>;
    isRedeemable?: boolean;
    redeemableIds?: Set<string>;
  }>(),
  { isRedeemable: false, redeemableIds: () => new Set<string>() }
);
const emit = defineEmits<{
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
}>();

const redeemable = computed(() => props.isRedeemable || props.redeemableIds?.has(props.o.id) || false);

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return props.blocks.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}
function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function copyCode(code: string) {
  if (!code) return;
  uni.setClipboardData({ data: code, success: () => uni.showToast({ title: locale.t('orderListComp.copied'), icon: 'none' }) });
}
</script>

<style lang="scss" scoped>
.card {
  background: $wa-card;
  border-radius: $wa-radius;
  padding: 24rpx 32rpx;
  margin-bottom: 20rpx;

  // 按状态分组时由分组容器统一间距，行自身去底部外边距
  &.in-group { margin-bottom: 0; }

  .row { display: flex; align-items: center; justify-content: space-between; }

  .head {
    margin-bottom: 14rpx;

    .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; cursor: pointer; }
    .st { font-size: 24rpx; }
  }

  .sub { font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }

  .addr {
    display: flex;
    gap: 8rpx;
    align-items: flex-start;
    background: #f0f2f7;
    border-radius: 8rpx;
    padding: 12rpx 20rpx;
    font-size: 24rpx;
    color: $wa-muted;
    line-height: 1.5;
    margin-bottom: 10rpx;

    .addr-ic { flex-shrink: 0; color: $wa-accent; }
    .addr-tx { flex: 1; }
  }

  .goods {
    display: flex;
    justify-content: space-between;
    padding-top: 8rpx;
    border-top: 1rpx dashed #e8edf5;

    .g-thumb { width: 56rpx; height: 56rpx; border-radius: 8rpx; background: #f0f2f7; flex-shrink: 0; margin-right: 16rpx; }
    .g-name { font-size: 26rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
    .g-price { font-size: 26rpx; color: $wa-ink; }
  }

  .foot {
    margin-top: 14rpx;

    .time { font-size: 24rpx; color: $wa-muted; }
    .total { font-size: 30rpx; color: $wa-danger; font-weight: 600; }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 20rpx;

    .act { font-size: 26rpx; padding: 10rpx 30rpx; border-radius: 8rpx; }
    .ship { color: #fff; background: $wa-accent; }
    .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
    .ghost { color: $wa-ink; background: #eef1f6; }
    .remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
  }
}
</style>

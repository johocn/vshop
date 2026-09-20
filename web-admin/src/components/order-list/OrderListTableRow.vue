<template>
  <view class="dt-row" :class="{ head, 'state-first': blocks.stateColumnFirst }">
    <template v-if="head">
      <text class="c-code">{{ $t('orderListComp.table.thOrder') }}</text>
      <text class="c-goods">{{ $t('orderListComp.table.thGoods') }}</text>
      <text class="c-cust">{{ $t('orderListComp.table.thRecipient') }}</text>
      <text class="c-addr">{{ $t('orderListComp.table.thAddress') }}</text>
      <text class="c-deliv">{{ $t('orderListComp.table.thDelivery') }}</text>
      <text class="c-pay">{{ $t('orderListComp.table.thPaid') }}</text>
      <text class="c-time">{{ $t('orderListComp.table.thTime') }}</text>
      <text class="c-st">{{ $t('orderListComp.table.thState') }}</text>
      <text class="c-ops">{{ $t('orderListComp.table.thOps') }}</text>
    </template>
    <template v-else>
      <text class="c-code" @tap="copyCode(row.code)">{{ row.code }}</text>
      <view class="c-goods">
        <view class="dg" v-for="(g, gi) in row.goods" :key="gi">
          <image v-if="g.image" class="dg-thumb" :src="g.image" mode="aspectFill" />
          <view v-else class="dg-thumb"></view>
          <text class="dg-name">{{ g.name }}</text>
          <text class="dg-qty">×{{ g.qty }}</text>
        </view>
      </view>
      <text class="c-cust">{{ row.customerName }}{{ row.phoneMask }}</text>
      <text class="c-addr">{{ row.address || '—' }}</text>
      <text class="c-deliv">{{ row.delivery }}</text>
      <text class="c-pay">¥{{ fmtMoney(row.total) }}</text>
      <text class="c-time">{{ fmtTime(row.time) }}</text>
      <text class="c-st" :style="{ color: stColor(row.state) }">{{ stLabel(row.state).label }}</text>
      <view class="c-ops">
        <text v-if="isShippable(row.state)" class="act ship" @tap="emit('ship', row)">{{ $t('orderListComp.actions.ship') }}</text>
        <text v-if="redeemable" class="act redeem" @tap="emit('redeem', row)">{{ $t('orderListComp.actions.goRedeem') }}</text>
        <text v-if="isUnpaid(row.state)" class="act remind" @tap="emit('remind', row)">{{ $t('orderListComp.actions.remind') }}</text>
        <text class="act ghost" @tap="emit('detail', row)">{{ $t('orderListComp.actions.detail') }}</text>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, fmtMoney, shipColor, isShippable, isUnpaid } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { useLocaleStore } from '../../stores/localeStore';

// 桌面表格行（head=true 渲染表头），自原页面 dt 块原样迁移；
// blocks.stateColumnFirst 时状态列前置：DOM 顺序不变，用 CSS grid order 把 .c-st 移到第一轨
const locale = useLocaleStore();
const props = withDefaults(
  defineProps<{
    o?: OrderView;
    blocks: Record<string, any>;
    head?: boolean;
    isRedeemable?: boolean;
    redeemableIds?: Set<string>;
  }>(),
  { head: false, isRedeemable: false, redeemableIds: () => new Set<string>() }
);
const emit = defineEmits<{
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
}>();

const row = computed(() => props.o || ({} as OrderView));
const redeemable = computed(() => props.isRedeemable || props.redeemableIds?.has(row.value.id) || false);

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
.dt-row {
  display: grid;
  grid-template-columns: 2fr 3fr 1.8fr 1.4fr 1fr 1fr 1.6fr 1fr 1.4fr;
  gap: 16rpx;
  align-items: center;
  padding: 18rpx 24rpx;
  background: $wa-card;
  border-bottom: 1rpx solid #eef1f6;

  &.head {
    background: $wa-ink;
    color: #fff;
    border-radius: 8rpx 8rpx 0 0;
    position: sticky;
    top: 0;
  }

  // status-first：状态列前置（状态轨收窄，其余列宽顺延）
  &.state-first {
    grid-template-columns: 1fr 2fr 3fr 1.8fr 1.4fr 1fr 1fr 1.6fr 1.4fr;
    .c-st { order: -1; }
  }

  .c-code { font-size: 14px; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }

  .c-goods {
    font-size: 13px;
    color: $wa-ink;

    .dg {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      line-height: 1.5;

      .dg-thumb { width: 20px; height: 20px; border-radius: 4px; background: #f0f2f7; flex-shrink: 0; }
      .dg-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dg-qty { color: $wa-muted; }
    }
  }

  .c-cust { font-size: 13px; color: $wa-ink; }
  .c-addr { font-size: 13px; color: $wa-muted; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c-deliv { font-size: 13px; color: $wa-muted; }
  .c-pay { font-size: 14px; color: $wa-danger; font-weight: 600; }
  .c-time { font-size: 13px; color: $wa-muted; }
  .c-st { font-size: 13px; font-weight: 600; }

  .c-ops {
    display: flex;
    gap: 10rpx;

    .act { font-size: 12px; padding: 4px 12px; border-radius: 6px; cursor: pointer; }
    .ship { color: #fff; background: $wa-accent; }
    .redeem { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
    .ghost { color: $wa-ink; background: #eef1f6; }
    .remind { color: $wa-accent; background: transparent; border: 1rpx solid $wa-accent; }
  }
}
</style>

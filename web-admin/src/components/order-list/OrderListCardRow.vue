<template>
  <!-- 变体 C：高密度清单（status-first）——无圆角两行清单，点击整行进详情 -->
  <view v-if="variant === 'compact'" class="cp" @tap="emit('detail', o)">
    <view class="cp-l1">
      <text class="cp-code">{{ o.code }}</text>
      <text class="cp-st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="cp-l2">
      <text class="cp-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
      <text class="cp-goods">{{ goodsBrief(o) }}</text>
      <text class="cp-total">¥{{ fmtMoney(o.total) }}</text>
      <text class="cp-time">{{ fmtTime(o.time) }}</text>
    </view>
    <view class="cp-acts">
      <text v-if="isShippable(o.state)" class="act ship" @tap.stop="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
      <text v-if="redeemable" class="act redeem" @tap.stop="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
      <text v-if="isUnpaid(o.state)" class="act remind" @tap.stop="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
    </view>
  </view>

  <!-- 变体 B：状态看板泳道内极简卡（status-group）——无缩略图、无地址 -->
  <view v-else-if="variant === 'kanban'" class="card slim">
    <view class="row head">
      <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
      <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="sub">
      {{ o.customerName }}{{ o.phoneMask }}<template v-if="blocks.showDeliveryName && o.delivery"> · {{ o.delivery }}</template>
    </view>
    <view class="row foot">
      <text class="goods-brief">{{ goodsBrief(o) }}</text>
      <text class="total">¥{{ fmtMoney(o.total) }}</text>
    </view>
    <view class="row foot">
      <text class="time">{{ o.payment ? o.payment + ' · ' : '' }}{{ fmtTime(o.time) }}</text>
      <view class="actions">
        <text v-if="isShippable(o.state)" class="act ship" @tap="emit('ship', o)">{{ $t('orderListComp.actions.ship') }}</text>
        <text v-if="redeemable" class="act redeem" @tap="emit('redeem', o)">{{ $t('orderListComp.actions.goRedeem') }}</text>
        <text v-if="isUnpaid(o.state)" class="act remind" @tap="emit('remind', o)">{{ $t('orderListComp.actions.remind') }}</text>
        <text class="act ghost" @tap="emit('detail', o)">{{ $t('orderListComp.actions.detail') }}</text>
      </view>
    </view>
  </view>

  <!-- 变体 A：卡片信息流（classic，默认）——缩略图 + 商品明细 + 顾客 + 地址 + 金额 + 时间 + 操作组 -->
  <view v-else class="card">
    <view class="row head">
      <text class="code" @tap="copyCode(o.code)">{{ o.code }}</text>
      <text class="st" :style="{ color: stColor(o.state) }">{{ stLabel(o.state).label }}</text>
    </view>
    <view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ blocks.showDeliveryName && o.delivery ? ' · ' + o.delivery : '' }}</view>
    <view class="addr" v-if="blocks.showAddress && o.address"><text class="addr-ic">📍</text><text class="addr-tx">{{ o.address }}</text></view>
    <view class="goods" v-for="(g, gi) in o.goods" :key="gi">
      <image v-if="blocks.showThumb && g.image" class="g-thumb" :src="g.image" mode="aspectFill" />
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

// 手机端单行渲染，按 variant 出三种结构（A 卡片信息流 / B 看板极简卡 / C 高密度两行清单）。
// blocks 只负责列内细节显隐（showThumb/showAddress/showDeliveryName/stateColors），结构差异由 variant 决定。
const locale = useLocaleStore();
const props = withDefaults(
  defineProps<{
    o: OrderView;
    blocks: Record<string, any>;
    variant?: 'card' | 'kanban' | 'compact';
    isRedeemable?: boolean;
    redeemableIds?: Set<string>;
  }>(),
  { variant: 'card', isRedeemable: false, redeemableIds: () => new Set<string>() }
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
// 单行商品摘要：单件 → “名称 ×qty”；多件 → “首件名 ×总件数 等N件”
function goodsBrief(o: OrderView): string {
  const first = o.goods[0];
  if (!first) return '';
  const qty = o.goods.reduce((a, g) => a + g.qty, 0);
  return o.goods.length > 1 ? `${first.name} ×${qty} 等${o.goods.length}件` : `${first.name} ×${first.qty}`;
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

  // 看板极简卡：信息更少、密度更高
  &.slim {
    padding: 20rpx 24rpx;
    margin-bottom: 12rpx;
    border-radius: 12rpx;
  }

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
    .goods-brief { font-size: 24rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
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

  &.slim .actions { margin-top: 10rpx; }
  &.slim .head { margin-bottom: 8rpx; }
}

// 变体 C：高密度清单（无圆角、无背景卡、两行 + 细分割线）
.cp {
  padding: 18rpx 8rpx;
  border-bottom: 1rpx solid #eef1f6;

  .cp-l1 { display: flex; align-items: center; justify-content: space-between; }
  .cp-code { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
  .cp-st { font-size: 22rpx; }

  .cp-l2 {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $wa-muted;

    .cp-cust { flex-shrink: 0; }
    .cp-goods { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp-total { color: $wa-danger; font-weight: 600; }
    .cp-time { flex-shrink: 0; }
  }

  .cp-acts { display: flex; gap: 16rpx; margin-top: 10rpx; justify-content: flex-end; }
  .act { font-size: 22rpx; padding: 4rpx 18rpx; border-radius: 6rpx; }
  .ship { color: #fff; background: $wa-accent; }
  .redeem { color: $wa-accent; border: 1rpx solid $wa-accent; }
  .remind { color: $wa-accent; border: 1rpx solid $wa-accent; }
}
</style>

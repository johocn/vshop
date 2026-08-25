<template>
  <view class="page" v-if="order">
    <view class="hero">
      <text class="code">{{ order.code }}</text>
      <text class="st" :style="{ color: stateLabel(ORDER_STATES, order.state).color }">{{ stateLabel(ORDER_STATES, order.state).label }}</text>
      <view class="ops">
        <button v-if="canShip" class="op main" @tap="goShip">去发货</button>
        <button v-if="canCancel" class="op" @tap="onCancel">取消订单</button>
        <button v-if="canRedeem" class="op main" @tap="goRedeem">去核销</button>
      </view>
    </view>

    <!-- 收货 / 自提信息 -->
    <view class="card" v-if="isPickup">
      <text class="sec-title">自提信息</text>
      <text class="line">{{ isPickupClaimed ? '已提货' : '未核销' }}</text>
      <text class="line" v-if="order.customer">
        提货人：{{ order.customer.firstName }} {{ order.customer.lastName }} {{ order.customer.phoneNumber || '' }}
      </text>
    </view>
    <view class="card" v-else-if="order.shippingAddress">
      <text class="sec-title">收货信息</text>
      <text class="line">{{ order.shippingAddress.province }} {{ order.shippingAddress.city }} {{ order.shippingAddress.streetLine1 }}</text>
      <text class="line">{{ order.shippingAddress.fullName }} {{ order.shippingAddress.phoneNumber }}</text>
    </view>

    <!-- 金额明细 -->
    <view class="card">
      <text class="sec-title">金额明细</text>
      <view class="cell"><text>商品小计</text><text class="val">¥ {{ money(order.subTotalWithTax) }}</text></view>
      <view class="cell"><text>运费</text><text class="val">¥ {{ money(order.shippingWithTax) }}</text></view>
      <view class="cell total"><text>实付</text><text class="val danger">¥ {{ money(order.totalWithTax) }}</text></view>
    </view>

    <!-- 商品明细 -->
    <view class="card" v-if="order.lines && order.lines.length">
      <text class="sec-title">商品明细</text>
      <view class="item" v-for="l in order.lines" :key="l.id">
        <view class="left">
          <text class="name">{{ l.productVariant?.name }}</text>
          <text class="sku">{{ l.productVariant?.sku }} × {{ l.quantity }}</text>
        </view>
        <text class="price">¥ {{ money(l.linePriceWithTax) }}</text>
      </view>
    </view>

    <!-- 支付 -->
    <view class="card">
      <text class="sec-title">支付信息</text>
      <template v-if="order.payments && order.payments.length">
        <view class="cell" v-for="p in order.payments" :key="p.id">
          <text>{{ p.method }} · {{ p.state }}</text>
          <text class="val">¥ {{ money(p.amount) }}</text>
        </view>
      </template>
      <text class="line muted" v-else>未支付</text>
    </view>

    <!-- 物流 -->
    <view class="card">
      <text class="sec-title">物流信息</text>
      <template v-if="order.fulfillments && order.fulfillments.length">
        <view class="cell" v-for="f in order.fulfillments" :key="f.id">
          <text>{{ f.method }} · {{ f.state }}</text>
          <text class="val">{{ f.trackingCode || '—' }}</text>
        </view>
      </template>
      <text class="line muted" v-else>
        {{ (order.shippingLines && order.shippingLines[0] && order.shippingLines[0].shippingMethod && order.shippingLines[0].shippingMethod.name) || '暂无配送' }}
      </text>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchOrderDetail, cancelOrder, OrderDetail } from '../../../apis/order';
import { ORDER_STATES, AFTER_SALE_TYPES, stateLabel } from '../../../constants/orderState';

const order = ref<OrderDetail | null>(null);

const money = (n?: number | null): string => ((n ?? 0) / 100).toFixed(2);

const canShip = computed(() => ['PaymentAuthorized', 'WaitingForShipping'].includes(order.value?.state || ''));
const canCancel = computed(() => ['PaymentAuthorized', 'WaitingForShipping'].includes(order.value?.state || ''));
const isPickup = computed(() => order.value?.customFields?.deliveryType === 'pickup');
const isPickupClaimed = computed(() => !!order.value?.customFields?.pickupClaimed);
const canRedeem = computed(() => isPickup.value && !isPickupClaimed.value);

onLoad(async (q) => {
  const id: string = (q && (q.id as string)) || '';
  if (id) order.value = await fetchOrderDetail(id);
});

function goShip() {
  // ship 页已存在：src/pages/order/ship/index.vue
  uni.navigateTo({ url: `/pages/order/ship/index?id=${order.value?.id}` });
}

function goRedeem() {
  // TODO: 核销页尚未创建（/pages/pickup/redeem/index），待后续任务建页后启用
  uni.navigateTo({ url: `/pages/pickup/redeem/index?code=&orderId=${order.value?.id}` });
}

async function onCancel() {
  uni.showModal({
    title: '取消订单',
    content: `确认取消订单 ${order.value?.code} 吗？`,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await cancelOrder(order.value?.id || '');
        uni.showToast({ title: '已取消', icon: 'success' });
        if (order.value?.id) order.value = await fetchOrderDetail(order.value.id);
      } catch (e: any) {
        uni.showToast({ title: e?.message || '取消失败', icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .hero {
    background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
    margin-bottom: 20rpx;
    .code { display: block; font-size: 34rpx; font-weight: 600; color: $wa-ink; }
    .st { display: inline-block; margin-top: 12rpx; font-size: 24rpx; }
    .ops { margin-top: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap;
      .op {
        min-width: 168rpx; margin: 0; padding: 0 24rpx; height: 64rpx; line-height: 64rpx;
        font-size: 28rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; }
      }
    }
  }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
    .line { display: block; font-size: 28rpx; color: $wa-ink; line-height: 1.6; word-break: break-all;
      &.muted { color: $wa-muted; }
    }
    .cell {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 28rpx; color: $wa-ink; padding: 10rpx 0;
      .val { color: $wa-ink;
        &.danger { color: $wa-danger; font-weight: 600; font-size: 30rpx; }
      }
      &.total .val { color: $wa-danger; font-weight: 600; font-size: 30rpx; }
    }
    .item {
      display: flex; align-items: center; justify-content: space-between; padding: 14rpx 0;
      border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .left { display: flex; flex-direction: column; flex: 1; margin-right: 16rpx;
        .name { font-size: 28rpx; color: $wa-ink; }
        .sku { font-size: 24rpx; color: $wa-muted; margin-top: 4rpx; }
      }
      .price { font-size: 28rpx; color: $wa-ink; }
    }
  }
}
</style>
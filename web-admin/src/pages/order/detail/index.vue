<template>
  <view class="page" v-if="order">
    <view class="hero">
      <text class="code">{{ order.code }}</text>
      <text class="st" :style="{ color: stateLabel(ORDER_STATES, order.state).color }">{{ stateLabel(ORDER_STATES, order.state).label }}</text>
      <view class="ops">
        <button v-if="canShip" class="op main" @tap="goShip">去发货</button>
        <button v-if="canCancel" class="op" @tap="onCancel">取消订单</button>
        <button v-if="canRedeem" class="op main" @tap="goRedeem">去核销</button>
        <button class="op" @tap="noteVisible = true">备注</button>
        <button v-if="canAdjustPrice" class="op" @tap="openAdjust">改价</button>
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

    <!-- 备注弹层 -->
    <view v-if="noteVisible" class="mask" @tap.self="noteVisible = false">
      <view class="sheet">
        <view class="st">订单备注</view>
        <textarea v-model="noteText" class="ta" placeholder="输入备注（仅后台可见，写入订单内部备注）" />
        <view class="btns">
          <button class="bn" @tap="noteVisible = false">取消</button>
          <button class="bn main" @tap="onSubmitNote">保存</button>
        </view>
      </view>
    </view>

    <!-- 改价弹层 -->
    <view v-if="adjustVisible" class="mask" @tap.self="adjustVisible = false">
      <view class="sheet">
        <view class="st">后台改价 <text class="cur">当前实付 ¥{{ money(order.totalWithTax) }}</text></view>
        <view class="amt-row">
          <text class="pre">¥</text>
          <input v-model="adjustInput" class="amt" type="digit" placeholder="0.00" />
        </view>
        <text class="tip">差额将以「后台改价」费用项计入订单；仅限未支付/待处理状态订单。</text>
        <view class="btns">
          <button class="bn" @tap="adjustVisible = false">取消</button>
          <button class="bn main" :disabled="adjusting" @tap="onSubmitAdjust">{{ adjusting ? '提交中…' : '确认改价' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchOrderDetail, cancelOrder, addOrderNote, modifyOrderPrice, OrderDetail } from '../../../apis/order';
import { ORDER_STATES, AFTER_SALE_TYPES, stateLabel } from '../../../constants/orderState';

const order = ref<OrderDetail | null>(null);

const noteVisible = ref(false);
const noteText = ref('');
const adjustVisible = ref(false);
const adjustInput = ref('');
const adjusting = ref(false);

const canAdjustPrice = computed(() => ['AddingItems', 'ArrangingPayment'].includes(order.value?.state || ''));

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
  // 核销码不在 Order 上（存于 pickup 核销凭据），故只传 orderId，核销页 onLoad 从核销记录匹配预填
  uni.navigateTo({ url: `/pages/pickup/redeem/index?orderId=${order.value?.id}` });
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

async function onSubmitNote() {
  const t = noteText.value.trim();
  if (!t) { uni.showToast({ title: '请输入备注内容', icon: 'none' }); return; }
  try {
    await addOrderNote(order.value?.id || '', t);
    noteVisible.value = false;
    noteText.value = '';
    uni.showToast({ title: '备注已写入', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '备注失败', icon: 'none' });
  }
}

function openAdjust() {
  adjustInput.value = order.value ? (order.value.totalWithTax / 100).toFixed(2) : '';
  adjustVisible.value = true;
}

async function onSubmitAdjust() {
  if (!order.value || adjusting.value) return;
  const v = Number(adjustInput.value);
  if (Number.isNaN(v) || v < 0) { uni.showToast({ title: '请输入有效金额', icon: 'none' }); return; }
  const delta = Math.round(v * 100) - order.value.totalWithTax;
  if (delta === 0) { uni.showToast({ title: '金额未变化', icon: 'none' }); return; }
  adjusting.value = true;
  try {
    await modifyOrderPrice(order.value.id, delta);
    adjustVisible.value = false;
    uni.showToast({ title: '改价成功', icon: 'success' });
    order.value = await fetchOrderDetail(order.value.id);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '改价失败', icon: 'none' });
  } finally {
    adjusting.value = false;
  }
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
  .mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
  .sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx;
    .st { font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx;
      .cur { font-size: 24rpx; color: $wa-muted; font-weight: 400; margin-left: 12rpx; } }
    .ta { width: 100%; height: 160rpx; background: $wa-bg; border-radius: 12rpx; padding: 16rpx; font-size: 28rpx; box-sizing: border-box; }
    .amt-row { display: flex; align-items: center; background: $wa-bg; border-radius: 12rpx; padding: 16rpx 20rpx;
      .pre { font-size: 36rpx; color: $wa-ink; margin-right: 12rpx; }
      .amt { flex: 1; font-size: 40rpx; font-weight: 700; color: $wa-danger; } }
    .tip { display: block; font-size: 22rpx; color: $wa-muted; margin: 16rpx 0; line-height: 1.6; }
    .btns { display: flex; gap: 20rpx; margin-top: 24rpx;
      .bn { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; font-size: 30rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
        &.main { background: $wa-accent; color: #fff; } } } }
}
</style>
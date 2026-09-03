<template>
  <view class="page">
    <view class="scope">
      <text v-for="s in scopes" :key="s.key" :class="{ on: s.key === scope }" @tap="onScope(s.key)">{{ s.label }}</text>
    </view>
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ s.label }}</text>
    </view>
    <view class="search">
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客" confirm-type="search" @confirm="onSearch" />
      <text class="btn" @tap="onSearch">搜索</text>
    </view>
    <view class="card" v-for="o in items" :key="o.id" @tap="goDetail(o)">
      <view class="row">
        <text class="code">{{ o.code }}</text>
        <text class="st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
      </view>
      <view class="sub">{{ customerName(o) }} · {{ ispickup(o) ? '自提' : (o.shippingLines?.[0]?.shippingMethod?.name || '快递') }}</view>
      <view class="row">
        <text class="time">{{ fmtTime(o.orderPlacedAt || o.createdAt) }}</text>
        <text class="total">¥ {{ (o.totalWithTax / 100).toFixed(2) }}</text>
      </view>
    </view>
    <view v-if="!items.length && !loading" class="empty">暂无订单</view>
    <view v-if="loading" class="empty">加载中…</view>
    <view v-if="loadingMore" class="empty">加载更多…</view>
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchOrders, fetchShopOrders, ShopOrderRow, OrderRow } from '../../../apis/order';
import { ORDER_STATES, stateLabel } from '../../../constants/orderState';

const tabs = [
  { key: '', label: '全部' },
  { key: 'PaymentAuthorized', label: '待付款' },
  { key: 'WaitingForShipping', label: '待发货' },
  { key: 'Delivered', label: '已发货' },
  { key: 'Completed', label: '已完成' },
  { key: 'Cancelled', label: '已取消' },
];
// 本店渠道单：走 orderService（ctx 渠道内）；本店商品单：跨渠道按商品 shopId 归集
const scopes = [
  { key: 'channel', label: '本店渠道单' },
  { key: 'shop', label: '本店商品单' },
];
const scope = ref('channel');
const cur = ref('');
const kw = ref('');
const items = ref<OrderRow[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);

function customerName(o: OrderRow): string {
  const c = o.customer;
  if (c) {
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    if (name) return name;
    if (c.emailAddress) return c.emailAddress;
  }
  return '顾客';
}

function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ispickup(o: OrderRow): boolean {
  return o.customFields?.deliveryType === 'pickup';
}

function toRow(s: ShopOrderRow): OrderRow {
  return {
    id: s.orderId,
    code: s.code,
    state: s.state,
    active: false,
    totalWithTax: s.totalWithTax,
    createdAt: s.placedAt || '',
    currencyCode: s.currencyCode,
    orderPlacedAt: s.placedAt,
    customer: { id: '', firstName: s.customerName || '', lastName: '', emailAddress: '' },
  };
}

async function load() {
  loading.value = true;
  try {
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      totalItems.value = list.length;
      // 本店商品单也按状态 tab + 关键词本地过滤（全量归集后前端筛）
      let rows = list;
      if (cur.value) rows = rows.filter((o) => o.state === cur.value);
      if (kw.value) {
        const k = kw.value.trim().toLowerCase();
        rows = rows.filter((o) =>
          (o.code || '').toLowerCase().includes(k) ||
          (o.customerName || '').toLowerCase().includes(k),
        );
      }
      items.value = rows.map(toRow);
    } else {
      const { items: list, totalItems: total } = await fetchOrders({ take: 20, skip: 0, state: cur.value || undefined, keyword: kw.value });
      items.value = list;
      totalItems.value = total;
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    if (scope.value === 'shop') {
      // myShopOrders 全量一次返回，首屏 load() 已全部过滤取回，无需二次加载
      return;
    } else {
      const { items: more, totalItems: total } = await fetchOrders({ take: 20, skip: items.value.length, state: cur.value || undefined, keyword: kw.value });
      totalItems.value = total;
      items.value = items.value.concat(more);
    }
  } finally {
    loadingMore.value = false;
  }
}

function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  load();
}

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  load();
}

function onSearch() {
  load();
}

function goDetail(o: OrderRow) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .scope { display: flex; margin-bottom: 16rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-ink; font-weight: 600; }
    }
  }
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .search { display: flex; align-items: center; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx 16rpx 8rpx 24rpx;
    .kw { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .btn { flex-shrink: 0; padding: 12rpx 32rpx; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .st { font-size: 24rpx; }
      .time { font-size: 24rpx; color: $wa-muted; }
      .total { font-size: 30rpx; color: $wa-danger; font-weight: 600; }
    }
    .sub { margin-top: 16rpx; font-size: 26rpx; color: $wa-muted; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
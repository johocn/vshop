<template>
  <view class="order-page">
    <!-- 版式切换入口（顶部） -->
    <view class="layout-bar">
      <text class="layout-btn" @tap="layoutOpen = true">版式 · {{ ORDER_LIST_LAYOUTS[layoutKey].label }} ▾</text>
    </view>

    <!-- 积木式渲染器：数据/筛选/分页由本页透传，操作事件全部映射到本页 handler -->
    <OrderListRenderer
      :views="views"
      :stats="stats"
      :config="config"
      :loading="loading"
      :loading-more="loadingMore"
      :scopes="scopes"
      :scope="scope"
      :tabs="tabs"
      :cur="cur"
      v-model:kw="kw"
      :delivery-label="deliveryLabel"
      :date-label="dateLabel"
      :delivery-idx="deliveryIdx"
      :date-idx="dateIdx"
      :delivery-opts="deliveryOpts"
      :date-opts="dateOpts"
      :redeemable-ids="redeemableIds"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @stat-tap="onStatTap"
      @redeem="onRedeem"
      @scope-change="onScope"
      @tab-change="onTab"
      @search="onSearch"
      @delivery="onDelivery"
      @date="onDateRange"
      @clear="onClearFilter"
      @ship="goShip"
      @remind="goRemind"
      @detail="goDetail"
      @page="onPage"
      @perpage="onPerPage"
    />

    <!-- 版式选择弹层 -->
    <view v-if="layoutOpen" class="mask" @tap="layoutOpen = false">
      <view class="pop" @tap.stop>
        <view class="pop-title">订单列表版式</view>
        <view
          v-for="k in LAYOUT_KEYS"
          :key="k"
          class="pop-item"
          :class="{ on: k === layoutKey }"
          @tap="onPickLayout(k)"
        >
          <view class="p-head">
            <text class="p-label">{{ ORDER_LIST_LAYOUTS[k].label }}</text>
            <text v-if="k === layoutKey" class="p-check">✓</text>
          </view>
          <text class="p-desc">{{ ORDER_LIST_LAYOUTS[k].desc }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import OrderListRenderer from '../../../components/order-list/OrderListRenderer.vue';
import { fetchOrders, fetchShopOrders, fetchProductThumbs, ShopOrderRow, OrderRow } from '../../../apis/order';
import { fetchPickupOrders } from '../../../apis/pickup';
import {
  channelToView,
  shopToView,
  filterChannelRows,
  filterShopRows,
  isGhostView,
  buildReminderText,
  computeStats,
  OrderView,
} from '../../../utils/orderFormat';
import { ORDER_LIST_LAYOUTS, LAYOUT_KEYS, DEFAULT_LAYOUT, OrderListLayoutKey } from '../../../constants/orderListLayouts';
import { parseLayout, parseOrderListConfig } from '../../../utils/orderListConfig';

// 状态码对齐 Vendure 真实状态机（线上 myShopOrders state 实测）：
//   待付款=ArrangingPayment；待发货=PaymentAuthorized/PaymentSettled；
//   已发货=Shipped/PartiallyShipped；Completed=已完成；Cancelled=已取消。
const tabs = [
  { key: '', label: '全部', keys: [] },
  { key: 'ArrangingPayment', label: '待付款', keys: ['ArrangingPayment'] },
  { key: 'PaymentAuthorized', label: '待发货', keys: ['PaymentAuthorized', 'PaymentSettled'] },
  { key: 'Shipped', label: '已发货', keys: ['Shipped', 'PartiallyShipped'] },
  { key: 'Completed', label: '已完成', keys: ['Completed'] },
  { key: 'Cancelled', label: '已取消', keys: ['Cancelled'] },
];
const scopes = [
  { key: 'channel', label: '本店渠道单' },
  { key: 'shop', label: '本店商品单' },
];

const scope = ref('channel');
const cur = ref('');
const kw = ref('');
const views = ref<OrderView[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const perPage = ref(20);
const page = ref(1);
const channelRaw = ref<OrderRow[]>([]);
const delivery = ref<'' | 'pickup' | 'express'>('');
const dateRange = ref<'' | 'today' | '7d' | '30d'>('');
const deliveryArr = ['', 'pickup', 'express'] as const;
const dateArr = ['', 'today', '7d', '30d'] as const;
const deliveryOpts = ['自提', '快递'];
const dateOpts = ['今日', '近7天', '近30天'];
const deliveryIdx = computed(() => Math.max(0, deliveryArr.indexOf(delivery.value)));
const dateIdx = computed(() => Math.max(0, dateArr.indexOf(dateRange.value)));
const deliveryLabel = computed(() => (delivery.value ? deliveryOpts[deliveryArr.indexOf(delivery.value)] : ''));
const dateLabel = computed(() => (dateRange.value ? dateOpts[dateArr.indexOf(dateRange.value)] : ''));
const stats = ref<{ today: string; unpaid: string; toShip: string; refund: string }>({ today: '—', unpaid: '—', toShip: '—', refund: '—' });
const redeemableIds = ref<Set<string>>(new Set());

// 版式：读取持久化布局 key，切换后立即写入；config 由 key 解析出块级配置传给渲染器
const layoutKey = ref<OrderListLayoutKey>(parseLayout(uni.getStorageSync('orderListLayout') || DEFAULT_LAYOUT));
const layoutOpen = ref(false);
const config = computed(() => parseOrderListConfig(JSON.stringify({ layout: layoutKey.value })));
function onPickLayout(k: OrderListLayoutKey) {
  layoutKey.value = k;
  uni.setStorageSync('orderListLayout', k);
  layoutOpen.value = false;
}

async function loadStats() {
  try {
    const list = await fetchShopOrders();
    stats.value = computeStats(list);
  } catch (e) {
    // 统计失败不阻塞列表，保留 '—' 占位
  }
}

async function loadRedeem() {
  try {
    const recs = await fetchPickupOrders(true);
    redeemableIds.value = new Set(recs.map((r) => r.orderId).filter(Boolean));
  } catch (e) {
    redeemableIds.value = new Set();
  }
}

async function load() {
  loading.value = true;
  try {
    const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      let rows = filterShopRows(list, ok);
      const st = tabs.find((t) => t.key === cur.value);
      if (cur.value && st?.keys?.length) rows = rows.filter((o) => st.keys.includes(o.state));
      totalItems.value = rows.length;
      let thumbMap: Record<string, string> = {};
      try {
        const ids = rows.flatMap((o) => (o.items || []).map((it) => it.productId));
        thumbMap = await fetchProductThumbs(ids);
      } catch { thumbMap = {}; }
      views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
    } else {
      const { items: list, totalItems: total } = await fetchOrders({
        take: perPage.value,
        skip: (page.value - 1) * perPage.value,
        state: cur.value || undefined,
      });
      channelRaw.value = list;
      totalItems.value = total;
      views.value = filterChannelRows(list, ok).map(channelToView).filter((v) => !isGhostView(v));
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (scope.value === 'shop') return;
  if (loading.value || loadingMore.value) return;
  if (channelRaw.value.length >= totalItems.value && totalItems.value > 0) return;
  const isMobile = typeof window === 'undefined' ? false : window.innerWidth < 768;
  if (!isMobile) return; // 桌面用分页条，不做无限滚动
  loadingMore.value = true;
  try {
    page.value += 1;
    const { items: more, totalItems: total } = await fetchOrders({
      take: perPage.value,
      skip: (page.value - 1) * perPage.value,
      state: cur.value || undefined,
    });
    totalItems.value = total;
    channelRaw.value = channelRaw.value.concat(more);
    const ok = { kw: kw.value, delivery: delivery.value, dateRange: dateRange.value };
    views.value = filterChannelRows(channelRaw.value, ok).map(channelToView).filter((v) => !isGhostView(v));
  } finally {
    loadingMore.value = false;
  }
}

function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  resetPage();
  load();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage();
  load();
}
function onStatTap(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage();
  load();
}
function onSearch() {
  resetPage();
  load();
}
function goShip(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: '商品单为跨渠道归集视图，请到「本店渠道单」发货', icon: 'none' });
    return;
  }
  uni.showModal({
    title: '确认发货',
    content: `订单 ${o.code} 将进入发货流程`,
    confirmText: '进入发货',
    success: (r) => { if (r.confirm) uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` }); },
  });
}
function goDetail(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: '商品单为跨渠道归集视图，详情请到「本店渠道单」查看', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
function goRedeem(o: OrderView) {
  uni.navigateTo({ url: `/pages/pickup/redeem/index?orderId=${o.id}` });
}
function goRedeemPage() {
  uni.navigateTo({ url: '/pages/pickup/redeem/index' });
}
function goRemind(o: OrderView) {
  const text = buildReminderText(o);
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: '催付文案已复制，请粘贴发给顾客', icon: 'none' }),
    fail: () => uni.showToast({ title: '复制失败，请重试', icon: 'none' }),
  });
}

function resetPage() { page.value = 1; }
function onPage(delta: number) {
  const pages = Math.max(1, Math.ceil(totalItems.value / perPage.value));
  const next = Math.min(pages, Math.max(1, page.value + delta));
  if (next === page.value) return;
  page.value = next; load();
}
function onPerPage(n: number) { perPage.value = n; resetPage(); load(); }
function onClearFilter() { delivery.value = ''; dateRange.value = ''; resetPage(); load(); }
function onDelivery(v: '' | 'pickup' | 'express') {
  if (delivery.value === v) v = '';
  delivery.value = v; resetPage(); load();
}
function onDateRange(v: '' | 'today' | '7d' | '30d') {
  if (dateRange.value === v) v = '';
  dateRange.value = v; resetPage(); load();
}

// Renderer 的 redeem 事件双义：HeadBar「核销码」无参 → 核销码页；行内「去核销」带订单 → 单笔核销
function onRedeem(o?: OrderView) {
  if (o) goRedeem(o);
  else goRedeemPage();
}

onMounted(() => {
  load();
  loadStats();
  loadRedeem();
});
onPullDownRefresh(async () => {
  await Promise.all([load(), loadStats(), loadRedeem()]);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.order-page {
  min-height: 100vh;
  background: $wa-bg;
}

.layout-bar {
  display: flex;
  justify-content: flex-end;
  padding: 20rpx 32rpx 0;
}

.layout-btn {
  font-size: 24rpx;
  color: $wa-muted;
  background: $wa-card;
  border: 1rpx solid #e8edf5;
  border-radius: 999rpx;
  padding: 8rpx 24rpx;
  cursor: pointer;
}

.mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pop {
  width: 600rpx;
  max-width: 88vw;
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx 32rpx 16rpx;

  .pop-title { font-size: 30rpx; font-weight: 700; color: $wa-ink; margin-bottom: 24rpx; }

  .pop-item {
    padding: 20rpx 24rpx;
    border-radius: 16rpx;
    margin-bottom: 16rpx;
    border: 1rpx solid #e8edf5;
    cursor: pointer;

    &.on { border-color: $wa-accent; }

    .p-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6rpx; }
    .p-label { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
    .p-check { color: $wa-accent; font-size: 28rpx; font-weight: 700; }
    .p-desc { font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
  }
}

@media (min-width: 768px) {
  .layout-bar { padding: 24px 32px 0; }
}
</style>

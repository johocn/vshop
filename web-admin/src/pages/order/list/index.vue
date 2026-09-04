<template>
  <view class="page">
    <view class="headbar">
      <text class="title">订单</text>
      <view class="stats">
        <view class="stat">
          <text class="num">{{ stats.today }}</text>
          <text class="lbl">今日订单</text>
        </view>
        <view class="stat">
          <text class="num">{{ stats.toShip }}</text>
          <text class="lbl">待发货</text>
        </view>
        <view class="stat">
          <text class="num">{{ stats.refund }}</text>
          <text class="lbl">待退款</text>
        </view>
      </view>
      <view class="redeem-btn" @tap="goRedeemPage">核销码</view>
    </view>

    <view class="scope">
      <text v-for="s in scopes" :key="s.key" :class="{ on: s.key === scope }" @tap="onScope(s.key)">{{ s.label }}</text>
    </view>
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ s.label }}</text>
    </view>
    <view class="search">
      <input v-model="kw" class="kw" placeholder="订单号 / 顾客 / 手机号" confirm-type="search" @confirm="onSearch" />
      <text class="btn" @tap="onSearch">搜索</text>
    </view>

    <!-- 手机：卡片列表（<768 显示） -->
    <view class="card-list">
      <view class="card" v-for="o in views" :key="o.id">
        <view class="row head">
          <text class="code">{{ o.code }}</text>
          <text class="st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
        </view>
        <view class="sub">{{ o.customerName }}{{ o.phoneMask }}{{ o.delivery ? ' · ' + o.delivery : '' }}</view>
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
          <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
        </view>
      </view>
    </view>

    <!-- 桌面：表格（≥768 显示） -->
    <view class="dt">
      <view class="dt-row head">
        <text class="c-code">订单号</text>
        <text class="c-goods">商品</text>
        <text class="c-cust">收货人 / 电话</text>
        <text class="c-deliv">配送</text>
        <text class="c-pay">实付</text>
        <text class="c-time">下单时间</text>
        <text class="c-st">状态</text>
        <text class="c-ops">操作</text>
      </view>
      <view class="dt-row" v-for="o in views" :key="o.id">
        <text class="c-code">{{ o.code }}</text>
        <view class="c-goods">
          <view v-for="(g, gi) in o.goods" :key="gi">{{ g.name }}×{{ g.qty }}</view>
        </view>
        <text class="c-cust">{{ o.customerName }}{{ o.phoneMask }}</text>
        <text class="c-deliv">{{ o.delivery }}</text>
        <text class="c-pay">¥{{ fmtMoney(o.total) }}</text>
        <text class="c-time">{{ fmtTime(o.time) }}</text>
        <text class="c-st" :style="{ color: stateLabel(ORDER_STATES, o.state).color }">{{ stateLabel(ORDER_STATES, o.state).label }}</text>
        <view class="c-ops">
          <text v-if="isShippable(o.state)" class="act ship" @tap="goShip(o)">发货</text>
          <text v-if="isRedeemable(o)" class="act redeem" @tap="goRedeem(o)">去核销</text>
          <text class="act ghost" @tap="goDetail(o)">详情</text>
        </view>
      </view>
    </view>

    <view v-if="!views.length && !loading" class="empty">暂无订单</view>
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
import { fetchPickupOrders } from '../../../apis/pickup';
import {
  channelToView,
  shopToView,
  isGhostView,
  isShippable,
  fmtMoney,
  computeStats,
  OrderView,
} from '../../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../../constants/orderState';

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
const stats = ref<{ today: string; toShip: string; refund: string }>({ today: '—', toShip: '—', refund: '—' });
const redeemableIds = ref<Set<string>>(new Set());

function fmtTime(t: string): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isRedeemable(o: OrderView): boolean {
  return redeemableIds.value.has(o.id);
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
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      totalItems.value = list.length;
      let rows = list as (ShopOrderRow)[];
      const st = tabs.find((t) => t.key === cur.value);
      if (cur.value && st?.keys?.length) rows = rows.filter((o) => st.keys.includes(o.state));
      if (kw.value) {
        const k = kw.value.trim().toLowerCase();
        rows = rows.filter((o) =>
          (o.code || '').toLowerCase().includes(k) || (o.customerName || '').toLowerCase().includes(k),
        );
      }
      views.value = rows.map(shopToView).filter((v) => !isGhostView(v));
    } else {
      const { items: list, totalItems: total } = await fetchOrders({
        take: 20,
        skip: 0,
        state: cur.value || undefined,
        keyword: kw.value,
      });
      views.value = list.map(channelToView).filter((v) => !isGhostView(v));
      totalItems.value = total;
    }
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (views.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    if (scope.value === 'shop') {
      // myShopOrders 全量一次返回，首屏 load() 已全部过滤取回，无需二次加载
      return;
    } else {
      const { items: more, totalItems: total } = await fetchOrders({
        take: 20,
        skip: views.value.length,
        state: cur.value || undefined,
        keyword: kw.value,
      });
      totalItems.value = total;
      views.value = views.value.concat(more.map(channelToView).filter((v) => !isGhostView(v)));
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
function goShip(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` });
}
function goDetail(o: OrderView) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${o.id}` });
}
function goRedeem(o: OrderView) {
  uni.navigateTo({ url: `/pages/pickup/redeem/index?orderId=${o.id}` });
}
function goRedeemPage() {
  uni.navigateTo({ url: '/pages/pickup/redeem/index' });
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
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 160rpx;

  .headbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 20rpx;
    .title { font-size: 34rpx; color: $wa-ink; font-weight: 700; margin-right: auto; }
    .redeem-btn {
      background: $wa-accent;
      color: #fff;
      font-size: 26rpx;
      padding: 10rpx 28rpx;
      border-radius: 999rpx;
    }
  }

  .stats {
    display: flex;
    flex: 1 0 100%;
    order: 3;
    gap: 16rpx;
    margin-top: 16rpx;
    margin-bottom: 0;
    .stat { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 0; text-align: center; display: flex; flex-direction: column;
      .num { font-size: 36rpx; color: $wa-ink; font-weight: 700; }
      .lbl { margin-top: 6rpx; font-size: 22rpx; color: $wa-muted; }
    }
  }

  .scope {
    display: flex;
    margin-bottom: 16rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    text {
      flex: 1;
      text-align: center;
      padding: 16rpx 0;
      font-size: 26rpx;
      color: $wa-muted;
      border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-ink; font-weight: 600; }
    }
  }
  .tabs {
    display: flex;
    margin-bottom: 24rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    text {
      flex: 1;
      text-align: center;
      padding: 16rpx 0;
      font-size: 26rpx;
      color: $wa-muted;
      border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .search {
    display: flex;
    align-items: center;
    margin-bottom: 24rpx;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx 16rpx 8rpx 24rpx;
    .kw { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .btn {
      flex-shrink: 0;
      padding: 12rpx 32rpx;
      font-size: 26rpx;
      color: #fff;
      background: $wa-accent;
      border-radius: $wa-radius;
    }
  }

  .card-list {
    .card {
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 24rpx 32rpx;
      margin-bottom: 20rpx;
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .head { margin-bottom: 14rpx;
        .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
        .st { font-size: 24rpx; }
      }
      .sub { font-size: 26rpx; color: $wa-muted; margin-bottom: 10rpx; }
      .goods {
        display: flex;
        justify-content: space-between;
        padding-top: 8rpx;
        border-top: 1rpx dashed #e8edf5;
        .g-thumb { width: 56rpx; height: 56rpx; border-radius: 8rpx; background: #f0f2f7; flex-shrink: 0; margin-right: 16rpx; }
        .g-name { font-size: 26rpx; color: $wa-ink; flex: 1; margin-right: 16rpx; }
        .g-price { font-size: 26rpx; color: $wa-ink; }
      }
      .foot { margin-top: 14rpx;
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
      }
    }
  }

  // 桌面表格：默认隐藏，≥768 显示（顺带修复桌面宽屏稀松）
  .dt {
    display: none;
    .dt-row {
      display: grid;
      grid-template-columns: 2fr 3fr 1.8fr 1fr 1fr 1.6fr 1fr 1.4fr;
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
      .c-code { font-size: 14px; color: $wa-ink; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .c-goods { font-size: 13px; color: $wa-ink;
        view { line-height: 1.5; }
      }
      .c-cust { font-size: 13px; color: $wa-ink; }
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
      }
    }
  }

  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}

@media (min-width: 768px) {
  .page { padding: 24px 32px 120px; }
  .page .card-list { display: none; }
  .page .dt { display: block; }
  .page .headbar { flex-wrap: nowrap; }
  .page .headbar .stats { flex: 1; order: 1; margin: 0 24px; }
  .page .headbar .title { order: 0; }
  .page .headbar .redeem-btn { order: 2; }
}
</style>
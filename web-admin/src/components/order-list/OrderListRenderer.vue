<template>
  <view class="page">
    <OrderListHeadBar :stats="stats" :redeemable-count="redeemableIds.size" @stat-tap="emit('stat-tap', $event)" @redeem="emit('redeem')" />
    <OrderListScope :scopes="scopes" :scope="scope" @change="emit('scope-change', $event)" />
    <OrderListTabs :tabs="tabs" :cur="cur" :layout="config.layout" @change="emit('tab-change', $event)" />
    <OrderListFilters
      :kw="kw"
      :delivery-label="deliveryLabel"
      :date-label="dateLabel"
      :delivery-idx="deliveryIdx"
      :date-idx="dateIdx"
      :delivery-opts="deliveryOpts"
      :date-opts="dateOpts"
      @update:kw="emit('update:kw', $event)"
      @search="emit('search')"
      @delivery="emit('delivery', $event)"
      @date="emit('date', $event)"
      @clear="emit('clear')"
    />

    <!-- 手机卡片：status-group 按状态分组（组头=状态标签+组内小计），其余版式原卡片流 -->
    <template v-if="config.layout === 'status-group'">
      <view class="card-groups">
        <view v-for="g in grouped" :key="g.state" class="card-group">
          <view class="group-head">
            <text class="g-label" :style="{ color: stColor(g.state) }">{{ g.label }}</text>
            <text class="g-sub">{{ g.orders.length }} 单 · ¥{{ fmtMoney(g.total) }}</text>
          </view>
          <OrderListCardRow
            v-for="o in g.orders"
            :key="o.id"
            :o="o"
            :blocks="blocks"
            :is-redeemable="redeemableIds.has(o.id)"
            :redeemable-ids="redeemableIds"
            @ship="emit('ship', $event)"
            @redeem="emit('redeem', $event)"
            @remind="emit('remind', $event)"
            @detail="emit('detail', $event)"
          />
        </view>
      </view>
    </template>
    <template v-else>
      <view class="card-list">
        <OrderListCardRow
          v-for="o in views"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          :is-redeemable="redeemableIds.has(o.id)"
          :redeemable-ids="redeemableIds"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </template>

    <!-- 桌面表格：status-group 左侧状态导航（计数）+ 右侧明细，其余版式原表格 -->
    <template v-if="config.layout === 'status-group'">
      <view class="sg-wrap">
        <view class="sg-nav">
          <view
            v-for="g in grouped"
            :key="g.state"
            class="sg-nav-item"
            :class="{ on: g.state === cur }"
            @tap="emit('tab-change', g.state)"
          >
            <text class="n-label" :style="{ color: stColor(g.state) }">{{ g.label }}</text>
            <text class="n-cnt">{{ g.orders.length }}</text>
          </view>
        </view>
        <view class="sg-main">
          <OrderListTableRow head :blocks="blocks" />
          <OrderListTableRow
            v-for="o in views"
            :key="o.id"
            :o="o"
            :blocks="blocks"
            :is-redeemable="redeemableIds.has(o.id)"
            @ship="emit('ship', $event)"
            @redeem="emit('redeem', $event)"
            @remind="emit('remind', $event)"
            @detail="emit('detail', $event)"
          />
        </view>
      </view>
    </template>
    <template v-else>
      <view class="dt">
        <OrderListTableRow head :blocks="blocks" />
        <OrderListTableRow
          v-for="o in views"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          :is-redeemable="redeemableIds.has(o.id)"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </template>

    <OrderListPager
      v-if="scope === 'channel'"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @page="emit('page', $event)"
      @perpage="emit('perpage', $event)"
    />

    <view v-if="!views.length && !loading" class="empty">暂无订单</view>
    <view v-if="loading" class="empty">加载中…</view>
    <view v-if="loadingMore" class="empty">加载更多…</view>
    <BottomBar current="order" />
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, StatsValue, fmtMoney, shipColor } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { OrderListConfig } from '../../utils/orderListConfig';
import BottomBar from '../BottomBar.vue';
import OrderListHeadBar from './OrderListHeadBar.vue';
import OrderListScope from './OrderListScope.vue';
import OrderListTabs from './OrderListTabs.vue';
import OrderListFilters from './OrderListFilters.vue';
import OrderListCardRow from './OrderListCardRow.vue';
import OrderListTableRow from './OrderListTableRow.vue';
import OrderListPager from './OrderListPager.vue';

// 版式渲染器：按 config.layout 与 config.blocks 组装全部功能块；数据层（views/stats/筛选/分页）由页面传入，操作事件全部透传
const props = withDefaults(
  defineProps<{
    views: OrderView[];
    stats: StatsValue;
    config: OrderListConfig;
    loading?: boolean;
    loadingMore?: boolean;
    scopes: { key: string; label: string }[];
    scope: string;
    tabs: { key: string; label: string; keys?: string[] }[];
    cur: string;
    kw: string;
    deliveryLabel: string;
    dateLabel: string;
    deliveryIdx: number;
    dateIdx: number;
    deliveryOpts: string[];
    dateOpts: string[];
    redeemableIds: Set<string>;
    page: number;
    totalItems: number;
    perPage: number;
  }>(),
  {
    loading: false,
    loadingMore: false,
    views: () => [],
    stats: () => ({ today: '—', unpaid: '—', toShip: '—', refund: '—' }),
    scopes: () => [],
    tabs: () => [],
    kw: '',
    deliveryLabel: '',
    dateLabel: '',
    deliveryIdx: 0,
    dateIdx: 0,
    deliveryOpts: () => ['自提', '快递'],
    dateOpts: () => ['今日', '近7天', '近30天'],
    redeemableIds: () => new Set<string>(),
    page: 1,
    totalItems: 0,
    perPage: 20,
  }
);
const emit = defineEmits<{
  (e: 'stat-tap', key: string): void;
  (e: 'redeem'): void;
  (e: 'scope-change', key: string): void;
  (e: 'tab-change', key: string): void;
  (e: 'update:kw', v: string): void;
  (e: 'search'): void;
  (e: 'delivery', v: '' | 'pickup' | 'express'): void;
  (e: 'date', v: '' | 'today' | '7d' | '30d'): void;
  (e: 'clear'): void;
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
  (e: 'page', delta: number): void;
  (e: 'perpage', n: number): void;
}>();

const blocks = computed(() => props.config.blocks || {});

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return blocks.value.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}

// 按状态分组：组序跟随 tabs 状态顺序（未知状态殿后），组内小计 = 单数 + 金额合计
const grouped = computed(() => {
  const order = props.tabs.map((t) => t.key);
  const map = new Map<string, OrderView[]>();
  for (const o of props.views) {
    const k = o.state || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return Array.from(map.entries())
    .map(([state, orders]) => ({
      state,
      label: stLabel(state).label,
      orders,
      total: orders.reduce((a, o) => a + o.total, 0),
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.state);
      const ib = order.indexOf(b.state);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 160rpx;
}

.card-list {
  .card { margin-bottom: 20rpx; }
}

// 手机：按状态分组（默认显示，≥768 隐藏）
.card-groups {
  .card-group {
    margin-bottom: 24rpx;

    .group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0 4rpx 12rpx;

      .g-label { font-size: 28rpx; font-weight: 700; }
      .g-sub { font-size: 22rpx; color: $wa-muted; }
    }
  }
}

// 桌面：左状态导航 + 右明细（默认隐藏，≥768 显示）
.sg-wrap {
  display: none;
  gap: 16px;
  align-items: flex-start;

  .sg-nav {
    width: 168px;
    flex-shrink: 0;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8px;

    .sg-nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;

      &.on {
        background: $wa-ink;

        .n-label { color: #fff; }
        .n-cnt { background: rgba(255, 255, 255, 0.2); color: #fff; }
      }

      .n-label { font-size: 14px; font-weight: 600; }
      .n-cnt { font-size: 12px; color: $wa-muted; background: #f0f2f7; border-radius: 999px; padding: 1px 8px; }
    }
  }

  .sg-main { flex: 1; min-width: 0; }
}

// 桌面表格：默认隐藏，≥768 显示（顺带修复桌面宽屏稀松）
.dt {
  display: none;
}

.empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }

@media (min-width: 768px) {
  .page { padding: 24px 32px 120px; }
  .page .card-list,
  .page .card-groups { display: none; }
  .page .dt { display: block; }
  .page .sg-wrap { display: flex; }
}
</style>

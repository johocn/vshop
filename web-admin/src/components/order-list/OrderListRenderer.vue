<template>
  <view class="page">
    <OrderListHeadBar :stats="stats" :redeemable-count="redeemableIds.size" @stat-tap="emit('stat-tap', $event)" @redeem="emit('redeem')" />
    <OrderListScope :scopes="scopes" :scope="scope" @change="emit('scope-change', $event)" />
    <OrderListTabs :groups="tabGroups" :cur="cur" @change="emit('tab-change', $event)" />
    <OrderListFilters
      :kw="kw"
      :time-key="timeKey"
      :custom-from="customFrom"
      :custom-to="customTo"
      :delivery="delivery"
      @update:kw="emit('update:kw', $event)"
      @search="emit('search')"
      @time="emit('time', $event)"
      @range="emit('range', $event)"
      @delivery="emit('delivery', $event)"
      @clear="emit('clear')"
    />

    <!-- ===== 手机端（<768px）：按 mobileVariant 出三种结构 ===== -->
    <!-- B 状态看板：按具体状态泳道分区，分区头 = 状态名 + 单数 + 金额小计 -->
    <view v-if="ctx.mobileVariant === 'kanban'" class="lanes">
      <view v-for="g in grouped" :key="g.state" class="lane">
        <view class="lane-head">
          <text class="l-name" :style="{ color: stColor(g.state) }">{{ g.label }}</text>
          <text class="l-cnt">{{ g.rows.length }} {{ $t('dataDashboard.orderUnit') }}</text>
          <text class="l-sum">¥{{ fmtMoney(g.total) }}</text>
        </view>
        <OrderListCardRow
          v-for="o in g.rows"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          variant="kanban"
          :is-redeemable="redeemableIds.has(o.id)"
          :redeemable-ids="redeemableIds"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </view>
    <!-- A 卡片信息流 / C 高密度清单：平铺（结构差异全部落在行组件 variant 上） -->
    <view v-else class="card-list">
      <OrderListCardRow
        v-for="o in views"
        :key="o.id"
        :o="o"
        :blocks="blocks"
        :variant="ctx.mobileVariant"
        :is-redeemable="redeemableIds.has(o.id)"
        :redeemable-ids="redeemableIds"
        @ship="emit('ship', $event)"
        @redeem="emit('redeem', $event)"
        @remind="emit('remind', $event)"
        @detail="emit('detail', $event)"
      />
    </view>

    <!-- ===== 桌面端（≥768px）===== -->
    <!-- B：左侧分组导航（计数取服务端 tabGroups.count）+ 右侧紧凑表 -->
    <view v-if="ctx.desktopGroupNav" class="sg-wrap">
      <view class="sg-nav">
        <view class="sg-nav-item" :class="{ on: cur === '' }" @tap="emit('tab-change', '')">
          <text class="n-label">{{ $t('orderListComp.tabs.all') }}</text>
          <text class="n-cnt">{{ totalItems }}</text>
        </view>
        <view
          v-for="g in tabGroups"
          :key="g.key"
          class="sg-nav-item"
          :class="{ on: cur === 'g:' + g.key }"
          @tap="emit('tab-change', 'g:' + g.key)"
        >
          <text class="n-label">{{ g.label }}</text>
          <text class="n-cnt">{{ g.count ?? 0 }}</text>
        </view>
      </view>
      <view class="sg-main">
        <OrderListTableRow head variant="compact" :blocks="blocks" />
        <OrderListTableRow
          v-for="o in views"
          :key="o.id"
          :o="o"
          :blocks="blocks"
          variant="compact"
          :is-redeemable="redeemableIds.has(o.id)"
          :redeemable-ids="redeemableIds"
          @ship="emit('ship', $event)"
          @redeem="emit('redeem', $event)"
          @remind="emit('remind', $event)"
          @detail="emit('detail', $event)"
        />
      </view>
    </view>
    <!-- A：9 列宽表；C：紧凑表（36px 行高 + 斑马纹 + 粘性表头） -->
    <view v-else class="dt">
      <OrderListTableRow head :variant="ctx.desktopVariant" :blocks="blocks" />
      <OrderListTableRow
        v-for="o in views"
        :key="o.id"
        :o="o"
        :blocks="blocks"
        :variant="ctx.desktopVariant"
        :is-redeemable="redeemableIds.has(o.id)"
        :redeemable-ids="redeemableIds"
        @ship="emit('ship', $event)"
        @redeem="emit('redeem', $event)"
        @remind="emit('remind', $event)"
        @detail="emit('detail', $event)"
      />
    </view>

    <OrderListPager
      v-if="scope === 'channel'"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @page="emit('page', $event)"
      @perpage="emit('perpage', $event)"
    />

    <view v-if="!views.length && !loading" class="empty">{{ $t('orderListComp.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('orderListComp.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('orderListComp.loadingMore') }}</view>
    <BottomBar current="order" />
  </view>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { OrderView, StatsValue, fmtMoney, shipColor } from '../../utils/orderFormat';
import { ORDER_STATES, stateLabel } from '../../constants/orderState';
import { STATE_GROUPS, TimeRangeKey } from '../../utils/orderFilter';
import { OrderListConfig } from '../../utils/orderListConfig';
import { ORDER_LIST_LAYOUTS, DEFAULT_LAYOUT } from '../../constants/orderListLayouts';
import BottomBar from '../BottomBar.vue';
import OrderListHeadBar from './OrderListHeadBar.vue';
import OrderListScope from './OrderListScope.vue';
import OrderListTabs from './OrderListTabs.vue';
import OrderListFilters from './OrderListFilters.vue';
import OrderListCardRow from './OrderListCardRow.vue';
import OrderListTableRow from './OrderListTableRow.vue';
import OrderListPager from './OrderListPager.vue';

// 版式渲染器：数据层（views/stats/筛选状态/分页）由页面传入，本组件只按 config.layout 的结构变体组装功能块，
// 事件全部透传（含 tabGroups 分组计数、时间胶囊、异常组）。tab 语义（states/exceptionOnly/exceptionType/afterSales）由页面定义。
const props = withDefaults(
  defineProps<{
    views: OrderView[];
    stats: StatsValue;
    config: OrderListConfig;
    loading?: boolean;
    loadingMore?: boolean;
    scopes: { key: string; label: string }[];
    scope: string;
    tabGroups: { key: string; label: string; count?: number; tabs: { key: string; label: string }[] }[];
    cur: string;
    kw: string;
    timeKey: TimeRangeKey;
    customFrom: string;
    customTo: string;
    delivery: '' | 'pickup' | 'delivery';
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
    tabGroups: () => [],
    cur: '',
    kw: '',
    timeKey: '',
    customFrom: '',
    customTo: '',
    delivery: '',
    redeemableIds: () => new Set<string>(),
    page: 1,
    totalItems: 0,
    perPage: 20,
  }
);
const emit = defineEmits<{
  (e: 'stat-tap', kind: 'today' | 'unpaid' | 'toShip' | 'refund'): void;
  (e: 'redeem'): void;
  (e: 'scope-change', key: string): void;
  (e: 'tab-change', key: string): void;
  (e: 'update:kw', v: string): void;
  (e: 'search'): void;
  (e: 'time', v: Exclude<TimeRangeKey, ''>): void;
  (e: 'range', r: { from: string; to: string }): void;
  (e: 'delivery', v: 'pickup' | 'delivery'): void;
  (e: 'clear'): void;
  (e: 'ship', o: OrderView): void;
  (e: 'redeem', o: OrderView): void;
  (e: 'remind', o: OrderView): void;
  (e: 'detail', o: OrderView): void;
  (e: 'page', delta: number): void;
  (e: 'perpage', n: number): void;
}>();

const blocks = computed(() => props.config.blocks || {});
// 结构变体来自版式注册表（L4 内建默认）；非法 key 时回退默认版式
const ctx = computed(() => ORDER_LIST_LAYOUTS[props.config.layout] || ORDER_LIST_LAYOUTS[DEFAULT_LAYOUT]);

function stLabel(s: string) {
  return stateLabel(ORDER_STATES, s);
}
function stColor(s: string): string {
  return blocks.value.stateColors ? shipColor(s, stLabel(s).color) : stLabel(s).color;
}

// 按具体状态分区（B 版式泳道）：顺序跟随 STATE_GROUPS 展开后的状态序，未知状态殿后；组内小计 = 单数 + 金额
const stateOrder = STATE_GROUPS.flatMap((g) => g.states);
const grouped = computed(() => {
  const map = new Map<string, OrderView[]>();
  for (const o of props.views) {
    const k = o.state || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return Array.from(map.entries())
    .map(([state, rows]) => ({
      state,
      label: stLabel(state).label,
      rows,
      total: rows.reduce((a, o) => a + o.total, 0),
    }))
    .sort((a, b) => {
      const ia = stateOrder.indexOf(a.state);
      const ib = stateOrder.indexOf(b.state);
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

// 手机·B 状态看板：泳道分区（分区头 + 区内极简卡）
.lanes {
  .lane {
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 12rpx 16rpx 8rpx;
    margin-bottom: 20rpx;

    .lane-head {
      display: flex;
      align-items: baseline;
      gap: 12rpx;
      padding: 8rpx 4rpx 12rpx;
      border-bottom: 1rpx solid #eef1f6;

      .l-name { font-size: 28rpx; font-weight: 700; }
      .l-cnt { font-size: 22rpx; color: $wa-muted; }
      .l-sum { margin-left: auto; font-size: 24rpx; color: $wa-danger; font-weight: 600; }
    }
  }
}

// 桌面·B：左分组导航 + 右明细（默认隐藏，≥768 显示）
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

// 桌面表格：默认隐藏，≥768 显示
.dt {
  display: none;
}

.empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }

@media (min-width: 768px) {
  .page { padding: 24px 32px 120px; }
  .page .card-list,
  .page .lanes { display: none; }
  .page .dt { display: block; }
  .page .sg-wrap { display: flex; }
}
</style>

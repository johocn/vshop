<template>
  <view class="order-page">
    <!-- 版式切换入口（顶部） -->
    <view class="layout-bar">
      <text class="layout-btn" @tap="layoutOpen = true">{{ $t('orderAdmin.orderList.layout') }} · {{ ORDER_LIST_LAYOUTS[layoutKey].label }} ▾</text>
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
      :tab-groups="tabGroups"
      :cur="cur"
      v-model:kw="kw"
      :time-key="timeKey"
      :custom-from="customFrom"
      :custom-to="customTo"
      :delivery="delivery"
      :redeemable-ids="redeemableIds"
      :page="page"
      :total-items="totalItems"
      :per-page="perPage"
      @stat-tap="onStatTap"
      @redeem="onRedeem"
      @scope-change="onScope"
      @tab-change="onTab"
      @search="onSearch"
      @time="onTime"
      @range="onRange"
      @delivery="onDelivery"
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
        <view class="pop-title">{{ $t('orderAdmin.orderList.layoutTitle') }}</view>
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
import { fetchOrders, fetchOrderCounts, fetchShopOrders, fetchProductThumbs } from '../../../apis/order';
import { fetchPickupOrders } from '../../../apis/pickup';
import {
  channelToView,
  shopToView,
  filterShopRows,
  isGhostView,
  buildReminderText,
  OrderView,
  StatsValue,
} from '../../../utils/orderFormat';
import {
  buildOrderFilter,
  STATE_GROUPS,
  EXCEPTION_TYPES,
  AFTER_SALES_OPEN,
  UNPAID_STATES,
  TO_SHIP_STATES,
  OrderFilterInput,
  TimeRangeInput,
  TimeRangeKey,
} from '../../../utils/orderFilter';
import { ORDER_STATES, stateLabel } from '../../../constants/orderState';
import { ORDER_LIST_LAYOUTS, LAYOUT_KEYS, DEFAULT_LAYOUT, OrderListLayoutKey } from '../../../constants/orderListLayouts';
import { parseLayout, parseOrderListConfig } from '../../../utils/orderListConfig';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

// —— tab 定义：分组折叠 + 16 状态全枚举 + 异常组（exceptionType）+ 售后组 ——
// 键位契约：分组「全部」chip 的 key 固定为 `g:<groupKey>`，桌面 B 版式左侧导航直接复用该键。
interface OrderTab { key: string; label: string; states?: string[]; exceptionOnly?: boolean; exceptionType?: string; afterSales?: string[] }
interface TabGroup { key: string; label: string; count?: number; tabs: OrderTab[] }

const GROUP_LABEL_KEYS: Record<string, string> = {
  pending: 'groupPending',
  active: 'groupActive',
  done: 'groupDone',
  cancelled: 'groupCancelled',
};
// 状态 chip 文案复用 constants/orderState.ts 的既有标签（与列表行渲染同源，避免同一状态两处文案漂移）
const STATE_GROUP_TABS: TabGroup[] = STATE_GROUPS.map((g) => ({
  key: g.key,
  label: locale.t(`orderListComp.tabs.${GROUP_LABEL_KEYS[g.key]}`),
  tabs: [
    { key: `g:${g.key}`, label: locale.t('orderListComp.tabs.chipAll'), states: g.states },
    ...g.states.map((s) => ({ key: `s:${s}`, label: stateLabel(ORDER_STATES, s).label, states: [s] })),
  ],
}));
const EXCEPTION_TABS: TabGroup = {
  key: 'exception',
  label: locale.t('orderListComp.tabs.groupException'),
  tabs: [
    { key: 'g:exception', label: locale.t('orderListComp.tabs.chipAll'), exceptionOnly: true },
    ...EXCEPTION_TYPES.map((t) => ({
      key: `e:${t}`,
      label: locale.t(`orderListComp.exception.${t}`),
      exceptionOnly: true,
      exceptionType: t,
    })),
  ],
};
const AFTER_SALES_TABS: TabGroup = {
  key: 'afterSales',
  label: locale.t('orderListComp.tabs.groupAfterSales'),
  tabs: [{ key: 'g:afterSales', label: locale.t('orderListComp.tabs.refundPending'), afterSales: AFTER_SALES_OPEN }],
};
// 统计卡快捷口径（不出现在 tab UI 中）：口径与卡上计数完全一致，避免「点进去数量对不上」
const STAT_TABS: OrderTab[] = [
  { key: 'stat:unpaid', label: locale.t('orderAdmin.orderList.tabPendingPay'), states: UNPAID_STATES },
  { key: 'stat:toShip', label: locale.t('orderAdmin.orderList.tabPendingShip'), states: TO_SHIP_STATES },
  { key: 'stat:refund', label: locale.t('orderListComp.tabs.refundPending'), afterSales: AFTER_SALES_OPEN },
];
const TAB_MAP = new Map<string, OrderTab>(
  [...STATE_GROUP_TABS, EXCEPTION_TABS, AFTER_SALES_TABS]
    .flatMap((g) => g.tabs)
    .concat(STAT_TABS)
    .map((t) => [t.key, t])
);

const scopes = [
  { key: 'channel', label: locale.t('orderAdmin.orderList.scopeChannel') },
  { key: 'shop', label: locale.t('orderAdmin.orderList.scopeShop') },
];

const scope = ref('channel');
const cur = ref('');
const kw = ref('');
const timeKey = ref<TimeRangeKey>('');
const customFrom = ref('');
const customTo = ref('');
const delivery = ref<'' | 'pickup' | 'delivery'>('');
const tabGroups = ref<TabGroup[]>([...STATE_GROUP_TABS, EXCEPTION_TABS, AFTER_SALES_TABS]);
const views = ref<OrderView[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const perPage = ref(20);
const page = ref(1);
const stats = ref<StatsValue>({ today: '—', unpaid: '—', toShip: '—', refund: '—' });
const redeemableIds = ref<Set<string>>(new Set());

// 版式：读取持久化布局 key，切换后立即写入；config 由 key 解析出结构变体与块级配置传给渲染器
const layoutKey = ref<OrderListLayoutKey>(parseLayout(uni.getStorageSync('orderListLayout') || DEFAULT_LAYOUT));
const layoutOpen = ref(false);
const config = computed(() => parseOrderListConfig(JSON.stringify({ layout: layoutKey.value })));
function onPickLayout(k: OrderListLayoutKey) {
  layoutKey.value = k;
  uni.setStorageSync('orderListLayout', k);
  layoutOpen.value = false;
}

function timeInput(): TimeRangeInput {
  return { key: timeKey.value, from: customFrom.value, to: customTo.value };
}
/** 列表基础条件（不含状态）：切 tab 会替换状态条件，故分组计数也按此拆分 */
function baseInput(): OrderFilterInput {
  return { keyword: kw.value, time: timeInput(), delivery: delivery.value };
}
/** 当前 tab 的状态 / 异常 / 售后条件 */
function currentTabInput(): OrderFilterInput {
  const t = TAB_MAP.get(cur.value);
  if (!t) return {};
  const out: OrderFilterInput = {};
  if (t.states?.length) out.states = t.states;
  if (t.exceptionOnly) out.exceptionOnly = true;
  if (t.exceptionType) out.exceptionType = t.exceptionType;
  if (t.afterSales?.length) out.afterSales = t.afterSales;
  return out;
}
/** 分组计数条件：状态组 → state.in；异常组 → exceptionType 非空；售后组 → 售后未了结 */
function groupCondition(key: string): OrderFilterInput {
  const g = STATE_GROUPS.find((x) => x.key === key);
  if (g) return { states: g.states };
  if (key === 'exception') return { exceptionOnly: true };
  if (key === 'afterSales') return { afterSales: AFTER_SALES_OPEN };
  return {};
}
function currentFilter(): Record<string, any> | null {
  return buildOrderFilter({ ...baseInput(), ...currentTabInput() });
}
function toastFail(e: unknown) {
  const msg = graphQlErrorMsg(e, '');
  uni.showToast({
    title: msg ? `${locale.t('orderListComp.loadFailed')}：${msg}` : locale.t('orderListComp.loadFailed'),
    icon: 'none',
  });
}

// 竞态防护：自增请求序号，只有最新一次请求的结果才允许写入（R4）
let seq = 0;

async function load() {
  const my = ++seq;
  loading.value = true;
  loadingMore.value = false; // 新一次列表加载作废在途的「加载更多」
  try {
    if (scope.value === 'shop') {
      const list = await fetchShopOrders();
      if (my !== seq) return;
      const t = TAB_MAP.get(cur.value);
      const rows = filterShopRows(list, {
        keyword: kw.value,
        time: timeInput(),
        delivery: delivery.value,
        states: t?.states,
        unsupported: !!(t?.exceptionOnly || t?.afterSales),
      });
      totalItems.value = rows.length;
      let thumbMap: Record<string, string> = {};
      try {
        const ids = rows.flatMap((o) => (o.items || []).map((it) => it.productId));
        thumbMap = await fetchProductThumbs(ids);
      } catch { thumbMap = {}; }
      if (my !== seq) return;
      views.value = rows.map((o) => shopToView(o, thumbMap)).filter((v) => !isGhostView(v));
    } else {
      const { items, totalItems: total } = await fetchOrders({
        take: perPage.value,
        skip: (page.value - 1) * perPage.value,
        filter: currentFilter(),
      });
      if (my !== seq) return;
      totalItems.value = total;
      views.value = items.map(channelToView).filter((v) => !isGhostView(v));
    }
  } catch (e) {
    if (my === seq) toastFail(e); // 失败保留上一次结果，不清空
  } finally {
    if (my === seq) loading.value = false;
  }
}

async function loadMore() {
  if (scope.value === 'shop') return;
  if (loading.value || loadingMore.value) return;
  if (totalItems.value > 0 && views.value.length >= totalItems.value) return;
  const isMobile = typeof window === 'undefined' ? false : window.innerWidth < 768;
  if (!isMobile) return; // 桌面用分页条，不做无限滚动
  const my = ++seq;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const { items, totalItems: total } = await fetchOrders({
      take: perPage.value,
      skip: (next - 1) * perPage.value,
      filter: currentFilter(),
    });
    if (my !== seq) return;
    page.value = next;
    totalItems.value = total;
    views.value = views.value.concat(items.map(channelToView).filter((v) => !isGhostView(v)));
  } catch (e) {
    if (my === seq) toastFail(e);
  } finally {
    if (my === seq) loadingMore.value = false;
  }
}

/**
 * 计数：统计卡（4）+ 分组 tab（6）合并为**一次**多别名请求，避免 10 次 HTTP。
 * 口径：统计卡 = 全量口径（不受列表筛选影响）；分组 tab = 跟随当前「时间/配送/关键词」条件。
 * 计数不参与竞态锁（只读幂等，失败保留上次值）。
 */
async function loadCounts() {
  const b = baseInput();
  const filters = [
    // 今日卡 = 固定「当日」口径（不带状态/关键词，也不随当前时间胶囊漂移）；
    // 用 timeInput() 会让默认态（未选时间）退化成全量计数，卡片数字与「今日订单」标题不符。
    buildOrderFilter({ time: { key: 'today' } }),
    buildOrderFilter({ states: UNPAID_STATES }),
    buildOrderFilter({ states: TO_SHIP_STATES }),
    buildOrderFilter({ afterSales: AFTER_SALES_OPEN }),
    ...tabGroups.value.map((g) => buildOrderFilter({ ...b, ...groupCondition(g.key) })),
  ];
  try {
    const nums = await fetchOrderCounts(filters);
    stats.value = {
      today: String(nums[0] ?? 0),
      unpaid: String(nums[1] ?? 0),
      toShip: String(nums[2] ?? 0),
      refund: String(nums[3] ?? 0),
    };
    tabGroups.value = tabGroups.value.map((g, i) => ({ ...g, count: nums[4 + i] ?? 0 }));
  } catch (e) {
    console.warn('[order-list] 计数失败：', graphQlErrorMsg(e, ''));
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

function resetPage() { page.value = 1; }

function onScope(key: string) {
  if (scope.value === key) return;
  scope.value = key;
  cur.value = ''; // 商品单无异常/售后口径 → 切 scope 回到「全部」
  resetPage(); load(); loadCounts();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  resetPage(); load();
}
function onStatTap(kind: 'today' | 'unpaid' | 'toShip' | 'refund') {
  if (kind === 'today') {
    timeKey.value = 'today'; // 今日卡 = 时间维度置「今日」，不动 cur（修 R7）
    customFrom.value = '';
    customTo.value = '';
  } else {
    cur.value = `stat:${kind}`; // 与卡上计数同口径（修 R8）
  }
  resetPage(); load(); loadCounts();
}
function onSearch() {
  resetPage(); load(); loadCounts();
}
function onTime(v: Exclude<TimeRangeKey, ''>) {
  timeKey.value = timeKey.value === v ? '' : v; // 再点一次取消
  if (timeKey.value !== 'custom') { customFrom.value = ''; customTo.value = ''; }
  resetPage(); load(); loadCounts();
}
function onRange(r: { from: string; to: string }) {
  customFrom.value = r.from;
  customTo.value = r.to;
  timeKey.value = 'custom';
  resetPage(); load(); loadCounts();
}
function onDelivery(v: 'pickup' | 'delivery') {
  delivery.value = delivery.value === v ? '' : v;
  resetPage(); load(); loadCounts();
}
function onClearFilter() {
  kw.value = '';
  timeKey.value = '';
  customFrom.value = '';
  customTo.value = '';
  delivery.value = '';
  cur.value = '';
  resetPage(); load(); loadCounts();
}

function goShip(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: locale.t('orderAdmin.orderList.shipViewToast'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('orderAdmin.orderList.confirmShipTitle'),
    content: locale.t('orderAdmin.orderList.confirmShipContent').replace('{code}', o.code),
    confirmText: locale.t('orderAdmin.orderList.confirmShipConfirm'),
    success: (r) => { if (r.confirm) uni.navigateTo({ url: `/pages/order/ship/index?id=${o.id}` }); },
  });
}
function goDetail(o: OrderView) {
  if (scope.value === 'shop') {
    uni.showToast({ title: locale.t('orderAdmin.orderList.detailViewToast'), icon: 'none' });
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
    success: () => uni.showToast({ title: locale.t('orderAdmin.orderList.remindCopied'), icon: 'none' }),
    fail: () => uni.showToast({ title: locale.t('orderAdmin.orderList.copyFailed'), icon: 'none' }),
  });
}

function onPage(delta: number) {
  const pages = Math.max(1, Math.ceil(totalItems.value / perPage.value));
  const next = Math.min(pages, Math.max(1, page.value + delta));
  if (next === page.value) return;
  page.value = next; load();
}
function onPerPage(n: number) { perPage.value = n; resetPage(); load(); }

// Renderer 的 redeem 事件双义：HeadBar「核销码」无参 → 核销码页；行内「去核销」带订单 → 单笔核销
function onRedeem(o?: OrderView) {
  if (o) goRedeem(o);
  else goRedeemPage();
}

onMounted(() => {
  load();
  loadCounts();
  loadRedeem();
});
onPullDownRefresh(async () => {
  await Promise.all([load(), loadCounts(), loadRedeem()]);
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

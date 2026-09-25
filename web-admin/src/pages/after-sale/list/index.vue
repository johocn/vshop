<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ $t('afterSale.list.' + s.label) }}</text>
    </view>

    <!-- 筛选区：关键词（失焦提交）+ 类型胶囊 + 日期区间 + 退款区间 + 排序 -->
    <view class="filters">
      <input
        class="kw"
        :value="kw"
        :placeholder="$t('afterSale.list.filterKeyword')"
        confirm-type="search"
        @input="(e:any) => (kw = e.detail.value)"
        @confirm="onApply"
      />
      <view class="chips">
        <text class="chip" :class="{ on: !typeFilter }" @tap="onType('')">{{ $t('afterSale.list.filterTypeAll') }}</text>
        <text
          class="chip"
          v-for="k in typeKeys"
          :key="k"
          :class="{ on: typeFilter === k }"
          @tap="onType(k)"
        >{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[k] || k) }}</text>
      </view>
      <view class="ranges">
        <picker mode="date" :value="from" @change="(e:any) => onDate('from', e.detail.value)">
          <text class="range">{{ $t('afterSale.list.filterDateFrom') }}：{{ from || '—' }}</text>
        </picker>
        <picker mode="date" :value="to" @change="(e:any) => onDate('to', e.detail.value)">
          <text class="range">{{ $t('afterSale.list.filterDateTo') }}：{{ to || '—' }}</text>
        </picker>
      </view>
      <view class="ranges">
        <input class="num" type="digit" :value="minRefund" :placeholder="$t('afterSale.list.filterRefundMin')"
          @input="(e:any) => (minRefund = e.detail.value)" @blur="onApply" />
        <input class="num" type="digit" :value="maxRefund" :placeholder="$t('afterSale.list.filterRefundMax')"
          @input="(e:any) => (maxRefund = e.detail.value)" @blur="onApply" />
      </view>
      <view class="chips">
        <text class="chip" :class="{ on: sortBy === 'createdAt' }" @tap="onSort('createdAt')">{{ $t('afterSale.list.sortCreated') }}</text>
        <text class="chip" :class="{ on: sortBy === 'refundAmount' }" @tap="onSort('refundAmount')">{{ $t('afterSale.list.sortRefund') }}</text>
        <text class="chip" @tap="onClear">{{ $t('afterSale.list.filterClear') }}</text>
      </view>
    </view>

    <view class="card" v-for="a in page.items.value" :key="a.id" @tap="goDetail(a)">
      <view class="row">
        <text class="code">{{ $t('afterSale.list.orderPrefix') }}{{ a.orderId }}</text>
        <text class="st" :style="{ color: st(a).color }">{{ st(a).label }}</text>
      </view>
      <text class="line">{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[a.type] || a.type) }}</text>
      <text class="line" v-if="a.refundAmount != null">{{ $t('afterSale.list.refundAmountLabel').replace('{amount}', (a.refundAmount / 100).toFixed(2)) }}</text>
      <text class="line" v-if="a.reason">{{ $t('afterSale.list.reasonLabel').replace('{reason}', a.reason) }}</text>
      <text class="line" v-if="a.rejectReason">{{ $t('afterSale.list.rejectLabel').replace('{reason}', a.rejectReason) }}</text>
    </view>

    <view v-if="page.loading.value" class="empty">{{ $t('afterSale.list.loading') }}</view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('afterSale.list.empty') }}</view>

    <view class="empty" v-if="page.loadingMore.value">{{ $t('afterSale.list.loadMore') }}</view>
    <view class="empty" v-else-if="page.error.value">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ $t('afterSale.list.retry') }}</text>
    </view>
    <view class="empty" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('afterSale.list.noMore') }}</view>
    <view class="progress" v-if="page.total.value">
      {{ $t('afterSale.list.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onShow, onLoad } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchAfterSalePage, buildAfterSaleFilter, AfterSaleRow, type AfterSaleSortBy } from '../../../apis/afterSale';
import { useListPage } from '../../../composables/useListPage';
import { AFTER_SALE_STATES, AFTER_SALE_TYPES, stateLabel, StateLabel } from '../../../constants/orderState';

const locale = useLocaleStore();
const typeKeys = Object.keys(AFTER_SALE_TYPES);

// 顶部状态页签（沿用既有 tabAll/tabPending/tabRefunded/tabRejected 词条）
const tabs = [
  { key: '', label: 'tabAll' },
  { key: 'Pending', label: 'tabPending' },
  { key: 'Refunded', label: 'tabRefunded' },
  { key: 'Rejected', label: 'tabRejected' },
];
const cur = ref('');

// 筛选态
const kw = ref('');
const typeFilter = ref('');
const from = ref('');
const to = ref('');
const minRefund = ref('');
const maxRefund = ref('');
const sortBy = ref<AfterSaleSortBy>('createdAt');

const page = useListPage<AfterSaleRow>({
  take: 20,
  fetcher: ({ skip, take, filter, sort }) => fetchAfterSalePage({ skip, take, filter, sort }),
});

function currentFilter(): Record<string, unknown> {
  return buildAfterSaleFilter({
    keyword: kw.value,
    type: typeFilter.value,
    from: from.value,
    to: to.value,
    minRefund: minRefund.value ? Math.round(Number(minRefund.value) * 100) : undefined,
    maxRefund: maxRefund.value ? Math.round(Number(maxRefund.value) * 100) : undefined,
  });
}

/** 状态页签 + 筛选合并成一次请求条件 */
function combinedFilter(): Record<string, unknown> {
  const base = currentFilter();
  if (!cur.value) return base;
  const stateClause = { state: { eq: cur.value } };
  return base._and
    ? { _and: [...(base._and as unknown[]), stateClause] }
    : { _and: [stateClause] };
}

async function reload() {
  await page.applyFilter(combinedFilter());
  await page.setSort({ [sortBy.value]: 'DESC' });
}

function onApply() { void reload(); }
function onType(k: string) {
  typeFilter.value = typeFilter.value === k ? '' : k;
  void reload();
}
function onDate(which: 'from' | 'to', v: string) {
  if (which === 'from') from.value = v; else to.value = v;
  void reload();
}
function onSort(k: AfterSaleSortBy) {
  if (sortBy.value === k) return;
  sortBy.value = k;
  void reload();
}
function onClear() {
  kw.value = ''; typeFilter.value = ''; from.value = ''; to.value = ''; minRefund.value = ''; maxRefund.value = '';
  void reload();
}
function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void reload();
}
const st = (a: AfterSaleRow): StateLabel => stateLabel(AFTER_SALE_STATES, a.state);
function goDetail(a: AfterSaleRow) {
  uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${a.id}` });
}

onLoad((query) => {
  page.syncFromQuery((query ?? {}) as Record<string, string>);
  void reload();
});
onMounted(() => { /* onLoad 已触发首屏；此处仅占位避免重复请求 */ });
onShow(() => { if (page.items.value.length) void reload(); });
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tabs { display: flex; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx;
    text { flex: 1; text-align: center; padding: 16rpx 0; font-size: 26rpx; color: $wa-muted; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .st { font-size: 24rpx; }
    }
    .line { display: block; font-size: 26rpx; color: $wa-muted; line-height: 1.6; margin-top: 8rpx; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .filters { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 20rpx;
    .kw { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; }
    .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
      .chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 10rpx 24rpx;
        &.on { background: $wa-accent; color: #fff; } } }
    .ranges { display: flex; gap: 16rpx; margin-top: 16rpx;
      .range, .num { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; } } }
  .progress { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>
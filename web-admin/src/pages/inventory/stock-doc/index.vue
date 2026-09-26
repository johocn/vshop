<template>
  <view class="page">
    <!-- 类型 tabs（type 传空 = 不过滤，后端白名单校验） -->
    <view class="tabs">
      <text
        v-for="t in TABS"
        :key="t.label"
        class="tab"
        :class="{ on: type === t.key }"
        @tap="onTab(t.key)"
      >{{ $t('stockDocCenter.' + t.label) }}</text>
    </view>

    <!-- 筛选区：仓库 + 日期区间 + 操作人 + 清空 -->
    <view class="filters">
      <view class="locrow">
        <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
          <view class="locpill">{{ $t('stockDocCenter.filterLocation') }}{{ curLocName ? ' · ' + curLocName : '' }} ▾</view>
        </picker>
      </view>
      <view class="ranges">
        <picker mode="date" :value="dateFrom" @change="(e: any) => onPickDate('from', e.detail.value)">
          <text class="range">{{ $t('stockDocCenter.filterDateFrom') }}：{{ dateFrom || '—' }}</text>
        </picker>
        <picker mode="date" :value="dateTo" @change="(e: any) => onPickDate('to', e.detail.value)">
          <text class="range">{{ $t('stockDocCenter.filterDateTo') }}：{{ dateTo || '—' }}</text>
        </picker>
      </view>
      <input
        class="kw"
        :value="operator"
        :placeholder="$t('stockDocCenter.filterOperator')"
        confirm-type="search"
        @input="(e: any) => (operator = e.detail.value)"
        @confirm="applyAll"
        @blur="applyAll"
      />
      <view class="chips">
        <text class="chip" @tap="onClear">{{ $t('stockDocCenter.filterClear') }}</text>
      </view>
    </view>

    <view class="sec">
      <text class="sh">{{ $t('stockDocCenter.title') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ page.total.value }}</text>
    </view>

    <view class="card" v-for="d in page.items.value" :key="d.id">
      <view class="row">
        <text class="code">{{ d.code }}</text>
        <text class="tag">{{ typeLabel(d.type) }}</text>
      </view>
      <view class="sub">
        <text>{{ $t('stockDocCenter.itemCount').replace('{n}', String(d.itemCount)) }}</text>
        <text class="dot">·</text>
        <text>{{ $t('stockDocCenter.totalQty').replace('{n}', String(d.totalQty)) }}</text>
      </view>
      <!-- 盘库单来源（D44）：taskCode 有值 = 盘点任务过账单；为空 = 库存明细页「调整」的手工调数单 -->
      <view class="sub" v-if="d.type === 'STOCKTAKE'">
        <text class="src" :class="{ manual: !d.taskCode }">{{ d.taskCode ? $t('stockDocCenter.fromTask') : $t('stockDocCenter.fromManual') }}</text>
        <text v-if="d.taskCode" class="dim2">{{ $t('stockDocCenter.taskCodeLabel') }}：{{ d.taskCode }}</text>
      </view>
      <view class="sub dim" v-if="d.remark">
        <text>{{ $t('stockDocCenter.remarkLabel') }}：{{ d.remark }}</text>
      </view>
      <view class="sub dim">
        <text v-if="d.operator">{{ $t('stockDocCenter.operatorLabel') }}：{{ d.operator }} · </text>
        <text>{{ formatDateTime(d.createdAt) }}</text>
      </view>
    </view>

    <view v-if="page.loading.value" class="more">{{ $t('stockDocCenter.loadingMore') }}</view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('stockDocCenter.empty') }}</view>

    <view class="more" v-if="page.loadingMore.value">{{ $t('stockDocCenter.loadingMore') }}</view>
    <view class="more" v-else-if="page.error.value" @tap="page.refresh()">
      <text class="err">{{ page.error.value }}</text>
      <text class="retry">{{ $t('stockDocCenter.retry') }}</text>
    </view>
    <view class="more" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('stockDocCenter.noMore') }}</view>

    <view class="progress" v-if="page.total.value">
      {{ $t('stockDocCenter.shown').replace('{n}', String(page.shown.value)).replace('{m}', String(page.total.value)) }}
    </view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchStockDocList, type StockDocSummaryRow } from '../../../apis/stock-doc';
import { fetchTenantInventoryOverview, type TenantStockLocation } from '../../../apis/inventory';
import { useListPage } from '../../../composables/useListPage';
import { formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();

// 与 stockDoc 类型枚举一一对应（PURCHASE/TRANSFER/STOCKTAKE/ISSUE）
const TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'tabAll' },
  { key: 'PURCHASE', label: 'tabPurchase' },
  { key: 'TRANSFER', label: 'tabTransfer' },
  { key: 'STOCKTAKE', label: 'tabStocktake' },
  { key: 'ISSUE', label: 'tabIssue' },
];

const type = ref('');
const locationId = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const operator = ref('');

const locations = ref<TenantStockLocation[]>([]);
// 下拉第 0 项固定为「全部仓」，故列表项索引 = 仓库数组索引 + 1
const locNames = computed(() => [locale.t('stockDocCenter.filterLocation'), ...locations.value.map((l) => l.name)]);
const locIndex = computed(() => {
  const i = locations.value.findIndex((l) => l.id === locationId.value);
  return i < 0 ? 0 : i + 1;
});
const curLocName = computed(() => locations.value.find((l) => l.id === locationId.value)?.name ?? '');

// 首屏由 onLoad 触发一次刷新（避免 setup 立即加载 + onLoad 各发一次请求）
const page = useListPage<StockDocSummaryRow>({
  take: 20,
  immediate: false,
  fetcher: async ({ skip, take, filter }) => {
    const res = await fetchStockDocList({
      ...(filter as Record<string, string | undefined>),
      page: Math.floor(skip / take) + 1,
      pageSize: take,
    });
    return { items: res.items, total: res.totalItems };
  },
});

function typeLabel(t: string): string {
  const hit = TABS.find((x) => x.key === t);
  return hit ? locale.t(`stockDocCenter.${hit.label}`) : t;
}

/** 'YYYY-MM-DD' → 该日当地时间 00:00 的 ISO 串 */
function isoFrom(day: string): string | undefined {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).toISOString();
}

/** 'YYYY-MM-DD' → 该日当地时间 23:59:59.999 的 ISO 串 */
function isoTo(day: string): string | undefined {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** 所有筛选变更都走这里：条件一次性写入，只刷一次（不要用 applyFilter + setSort 各发一次） */
async function applyAll(): Promise<void> {
  page.filter.value = {
    type: type.value || undefined,
    locationId: locationId.value || undefined,
    from: isoFrom(dateFrom.value),
    to: isoTo(dateTo.value),
    operator: operator.value || undefined,
  };
  await page.refresh();
}

function onTab(key: string): void {
  if (type.value === key) return;
  type.value = key;
  void applyAll();
}
function onLocChange(e: any): void {
  const n = Number(e.detail.value);
  locationId.value = n === 0 ? '' : locations.value[n - 1]?.id ?? '';
  void applyAll();
}
function onPickDate(which: 'from' | 'to', v: string): void {
  if (which === 'from') dateFrom.value = v;
  else dateTo.value = v;
  void applyAll();
}
function onClear(): void {
  type.value = '';
  locationId.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  operator.value = '';
  void applyAll();
}

onLoad(async () => {
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
  } catch (_e) {
    // 仓库筛选项加载失败不阻断单据列表
  }
  await applyAll();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 0;
      &.on { color: #fff; background: $wa-ink; }
    }
  }

  .filters { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 20rpx;
    .locrow { display: flex; align-items: center; gap: 16rpx;
      .locpill { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 24rpx; }
    }
    .ranges { display: flex; gap: 16rpx; margin-top: 16rpx;
      .range { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; }
    }
    .kw { margin-top: 16rpx; font-size: 26rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; }
    .chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
      .chip { font-size: 24rpx; color: $wa-muted; background: $wa-bg; border-radius: 999rpx; padding: 10rpx 24rpx;
        &.on { background: $wa-accent; color: #fff; } }
    }
  }

  .sec { display: flex; align-items: center; margin-bottom: 16rpx;
    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center;
      .code { flex: 1; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
      .tag { font-size: 22rpx; color: #fff; background: $wa-accent; border-radius: 6rpx; padding: 2rpx 12rpx; }
    }
    .sub { margin-top: 10rpx; font-size: 24rpx; color: $wa-ink;
      .dot { margin: 0 8rpx; color: $wa-muted; }
      &.dim { color: $wa-muted; }
      .src { font-size: 22rpx; color: $wa-ink; background: $wa-bg; border-radius: 6rpx; padding: 2rpx 12rpx; margin-right: 12rpx;
        &.manual { color: $wa-muted; } }
      .dim2 { color: $wa-muted; }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0;
    .err { display: block; }
    .retry { display: block; margin-top: 8rpx; color: $wa-accent; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .progress { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
}
</style>
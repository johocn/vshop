<template>
  <view class="page">
    <!-- 汇总条（与筛选条件同口径，服务端汇总） -->
    <view class="sum">
      <text class="sin">{{ $t('inventoryMovements.inTotal').replace('{n}', String(summary.inQty)) }}</text>
      <text class="sout">{{ $t('inventoryMovements.outTotal').replace('{n}', String(summary.outQty)) }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ page.total.value }}</text>
      <text v-if="hasFilter" class="clr" @tap="onClear">{{ $t('inventoryMovements.clearFilter') }}</text>
    </view>

    <!-- 方向 -->
    <view class="chips">
      <text class="chip" :class="{ on: direction === '' }" @tap="onDirection('')">{{ $t('inventoryMovements.dirAll') }}</text>
      <text class="chip" :class="{ on: direction === 'in' }" @tap="onDirection('in')">{{ $t('inventoryMovements.dirIn') }}</text>
      <text class="chip" :class="{ on: direction === 'out' }" @tap="onDirection('out')">{{ $t('inventoryMovements.dirOut') }}</text>
    </view>

    <!-- 业务类型（枚举标签复用 inventoryStock.move.*） -->
    <scroll-view class="chips scroll" scroll-x>
      <text class="chip" :class="{ on: bizType === '' }" @tap="onBiz('')">{{ $t('inventoryMovements.bizAll') }}</text>
      <text
        v-for="b in BIZ"
        :key="b"
        class="chip"
        :class="{ on: bizType === b }"
        @tap="onBiz(b)"
      >{{ $t('inventoryStock.' + bizTypeKey(b)) }}</text>
    </scroll-view>

    <!-- 日期预设（写入 dateFrom/dateTo 后提交） -->
    <view class="chips">
      <text class="chip" :class="{ on: datePreset === '' }" @tap="onDate('')">{{ $t('inventoryMovements.dateAll') }}</text>
      <text class="chip" :class="{ on: datePreset === 'today' }" @tap="onDate('today')">{{ $t('inventoryMovements.dateToday') }}</text>
      <text class="chip" :class="{ on: datePreset === '7d' }" @tap="onDate('7d')">{{ $t('inventoryMovements.date7d') }}</text>
      <text class="chip" :class="{ on: datePreset === 'month' }" @tap="onDate('month')">{{ $t('inventoryMovements.dateMonth') }}</text>
    </view>

    <!-- 仓库 + 商品关键词 -->
    <view class="locrow">
      <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
        <view class="locpill">{{ $t('inventoryMovements.locAll') }}{{ curLocName ? ' · ' + curLocName : '' }} ▾</view>
      </picker>
      <input
        class="kw"
        :value="variantId"
        :placeholder="$t('inventoryMovements.filterVariant')"
        confirm-type="search"
        @input="(e: any) => (variantId = e.detail.value)"
        @confirm="applyAll"
        @blur="applyAll"
      />
    </view>

    <!-- 日期区间 -->
    <view class="ranges">
      <picker mode="date" :value="dateFrom" @change="(e: any) => onPickDate('from', e.detail.value)">
        <text class="range">{{ $t('inventoryMovements.filterDateFrom') }}：{{ dateFrom || '—' }}</text>
      </picker>
      <picker mode="date" :value="dateTo" @change="(e: any) => onPickDate('to', e.detail.value)">
        <text class="range">{{ $t('inventoryMovements.filterDateTo') }}：{{ dateTo || '—' }}</text>
      </picker>
    </view>

    <!-- 按日分组的流水列表 -->
    <view v-for="g in groups" :key="g.day" class="grp">
      <text class="gday">{{ g.day }}</text>
      <view class="card" v-for="m in g.rows" :key="m.id">
        <view class="row">
          <text class="name" :class="m.direction">{{ m.direction === 'out' ? '－' : '＋' }}{{ m.quantity }}</text>
          <text class="biz">{{ $t('inventoryStock.' + dirKey(m.direction)) }} · {{ $t('inventoryStock.' + bizTypeKey(m.bizType)) }}</text>
        </view>
        <view class="sub">
          <text class="delta" v-if="m.beforeOnHand != null && m.afterOnHand != null">{{ $t('inventoryMovements.delta') }} {{ m.beforeOnHand }} → {{ m.afterOnHand }}</text>
          <text class="delta muted" v-else>{{ $t('inventoryMovements.delta') }} —</text>
        </view>
        <view class="sub"><text>#{{ m.productVariantId }} · {{ locName(m.stockLocationId) }}</text></view>
        <view class="sub">
          <text>{{ m.code }}</text>
          <text v-if="m.bizCode">｜{{ m.bizCode }}</text>
        </view>
        <view class="sub dim">{{ formatDateTime(m.createdAt) }}<text v-if="m.reason"> · {{ m.reason }}</text></view>
      </view>
    </view>

    <view v-if="page.loading.value" class="more">{{ $t('inventoryMovements.loadingMore') }}</view>
    <view v-else-if="!page.items.value.length" class="empty">{{ $t('inventoryMovements.empty') }}</view>

    <view class="more" v-if="page.loadingMore.value">{{ $t('inventoryMovements.loadingMore') }}</view>
    <view class="more" v-else-if="page.error.value" @tap="page.refresh()">
      <text class="err">{{ page.error.value }}</text>
      <text class="retry">{{ $t('inventoryMovements.retry') }}</text>
    </view>
    <view class="more" v-else-if="page.items.value.length && !page.hasMore.value">{{ $t('inventoryMovements.noMore') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchMovements, type MovementQueryParams, type MovementRow } from '../../../apis/stock-doc';
import { fetchTenantInventoryOverview, type TenantStockLocation } from '../../../apis/inventory';
import { useListPage } from '../../../composables/useListPage';
import { bizTypeKey, dayKey, dirKey, formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();

// 与后端流水 bizType 取值一一对应（order/afterSales/stockIn/stockOut/stockMove/stocktake/purchase/manual/mirror）
const BIZ = ['order', 'afterSales', 'stockIn', 'stockOut', 'stockMove', 'stocktake', 'purchase', 'manual', 'mirror'];

const summary = ref<{ inQty: number; outQty: number }>({ inQty: 0, outQty: 0 });

// 首屏由 onLoad 触发一次刷新（避免 setup 立即加载 + onLoad 各发一次请求）
const page = useListPage<MovementRow>({
  take: 20,
  immediate: false,
  fetcher: async ({ skip, take, filter }) => {
    const res = await fetchMovements({
      ...(filter as MovementQueryParams),
      page: Math.floor(skip / take) + 1,
      pageSize: take,
    });
    summary.value = res.summary; // 汇总条数据来自响应，走旁路 ref
    return { items: res.items, total: res.totalItems };
  },
});

const direction = ref<'' | 'in' | 'out'>('');
const bizType = ref('');
const datePreset = ref<'' | 'today' | '7d' | 'month'>('');
const dateFrom = ref('');
const dateTo = ref('');
const locationId = ref('');
const variantId = ref('');

const locations = ref<TenantStockLocation[]>([]);

// 下拉第 0 项固定为「全部仓」，故列表项索引 = 仓库数组索引 + 1
const locNames = computed(() => [locale.t('inventoryMovements.locAll'), ...locations.value.map((l) => l.name)]);
const locIndex = computed(() => {
  const i = locations.value.findIndex((l) => l.id === locationId.value);
  return i < 0 ? 0 : i + 1;
});
const curLocName = computed(() => locations.value.find((l) => l.id === locationId.value)?.name ?? '');

const hasFilter = computed(
  () => !!direction.value || !!bizType.value || !!datePreset.value || !!dateFrom.value || !!dateTo.value
    || !!locationId.value || !!variantId.value,
);

// 按天分组（同一天的多条流水归到一组，日期用本地时区）
const groups = computed(() => {
  const map = new Map<string, MovementRow[]>();
  for (const m of page.items.value) {
    const k = dayKey(m.createdAt) || '-';
    const arr = map.get(k);
    if (arr) arr.push(m);
    else map.set(k, [m]);
  }
  return Array.from(map.entries()).map(([day, rows]) => ({ day, rows }));
});

function locName(id: string): string {
  return locations.value.find((l) => l.id === id)?.name ?? `#${id}`;
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

/** Date → 本地 'YYYY-MM-DD' */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 所有筛选变更都走这里：条件一次性写入，只刷一次 */
async function applyAll(): Promise<void> {
  page.filter.value = {
    productVariantId: variantId.value || undefined,
    locationId: locationId.value || undefined,
    bizType: bizType.value || undefined,
    direction: direction.value || undefined,
    from: isoFrom(dateFrom.value),
    to: isoTo(dateTo.value),
  };
  await page.refresh();
}

function onDirection(d: '' | 'in' | 'out'): void {
  direction.value = d;
  void applyAll();
}
function onBiz(b: string): void {
  bizType.value = b;
  void applyAll();
}
/** 日期预设：唯一数据源是 dateFrom/dateTo */
function onDate(p: '' | 'today' | '7d' | 'month'): void {
  datePreset.value = p;
  const now = new Date();
  if (p === 'today') {
    dateFrom.value = localDay(now);
    dateTo.value = localDay(now);
  } else if (p === '7d') {
    dateFrom.value = localDay(new Date(now.getTime() - 6 * 24 * 3600 * 1000));
    dateTo.value = localDay(now);
  } else if (p === 'month') {
    dateFrom.value = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
    dateTo.value = localDay(now);
  } else {
    dateFrom.value = '';
    dateTo.value = '';
  }
  void applyAll();
}
/** 手动选日期 → 清空预设高亮 */
function onPickDate(which: 'from' | 'to', v: string): void {
  if (which === 'from') dateFrom.value = v;
  else dateTo.value = v;
  datePreset.value = '';
  void applyAll();
}
function onLocChange(e: any): void {
  const n = Number(e.detail.value);
  locationId.value = n === 0 ? '' : locations.value[n - 1]?.id ?? '';
  void applyAll();
}
function onClear(): void {
  direction.value = '';
  bizType.value = '';
  datePreset.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  locationId.value = '';
  variantId.value = '';
  void applyAll();
}

onLoad(async (q: any) => {
  if (q?.productVariantId) variantId.value = String(q.productVariantId);
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
  } catch (_e) {
    // 仓库筛选项加载失败不阻断流水列表
  }
  await applyAll();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .sum { display: flex; align-items: center; gap: 16rpx; background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
    .sin { font-size: 26rpx; color: $wa-success; font-weight: 600; }
    .sout { font-size: 26rpx; color: $wa-danger; font-weight: 600; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
    .clr { font-size: 22rpx; color: $wa-accent; margin-left: 16rpx; }
  }

  .chips { white-space: nowrap; margin-bottom: 12rpx;
    &.scroll { width: 100%; }
    .chip { display: inline-block; font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: 999rpx; padding: 10rpx 22rpx; margin-right: 12rpx;
      &.on { color: #fff; background: $wa-accent; }
    }
  }

  .locrow { display: flex; align-items: center; gap: 16rpx; margin: 4rpx 0 12rpx;
    .locpill { font-size: 24rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 24rpx; }
    .kw { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; }
  }

  .ranges { display: flex; gap: 16rpx; margin-bottom: 20rpx;
    .range { flex: 1; font-size: 24rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 20rpx; }
  }

  .grp {
    .gday { display: block; font-size: 22rpx; color: $wa-muted; margin: 8rpx 0 12rpx; }
  }

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 30rpx; font-weight: 600;
        &.in { color: $wa-accent; }
        &.out { color: $wa-danger; }
      }
      .biz { font-size: 24rpx; color: $wa-muted; }
    }
    .sub { margin-top: 10rpx; font-size: 24rpx; color: $wa-ink;
      &.dim { color: $wa-muted; }
    }
    .delta { font-size: 24rpx; font-weight: 600; color: $wa-ink;
      &.muted { color: $wa-muted; font-weight: 400; }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0;
    .err { display: block; }
    .retry { display: block; margin-top: 8rpx; color: $wa-accent; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
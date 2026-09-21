<template>
  <view class="page">
    <!-- 汇总条（与筛选条件同口径，服务端汇总） -->
    <view class="sum">
      <text class="sin">{{ $t('inventoryMovements.inTotal').replace('{n}', String(summary.inQty)) }}</text>
      <text class="sout">{{ $t('inventoryMovements.outTotal').replace('{n}', String(summary.outQty)) }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }}</text>
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

    <!-- 日期预设 -->
    <view class="chips">
      <text class="chip" :class="{ on: datePreset === '' }" @tap="onDate('')">{{ $t('inventoryMovements.dateAll') }}</text>
      <text class="chip" :class="{ on: datePreset === 'today' }" @tap="onDate('today')">{{ $t('inventoryMovements.dateToday') }}</text>
      <text class="chip" :class="{ on: datePreset === '7d' }" @tap="onDate('7d')">{{ $t('inventoryMovements.date7d') }}</text>
      <text class="chip" :class="{ on: datePreset === 'month' }" @tap="onDate('month')">{{ $t('inventoryMovements.dateMonth') }}</text>
    </view>

    <!-- 仓库 + 指定商品 -->
    <view class="locrow">
      <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
        <view class="locpill">{{ $t('inventoryMovements.locAll') }} · {{ curLocName }} ▾</view>
      </picker>
      <text v-if="variantId" class="vchip">{{ $t('inventoryStock.sku').replace('{id}', variantId) }}</text>
    </view>

    <!-- 按日分组的流水列表 -->
    <view v-for="g in groups" :key="g.day" class="grp">
      <text class="gday">{{ g.day }}</text>
      <view class="card" v-for="m in g.rows" :key="m.id">
        <view class="row">
          <text class="name" :class="m.direction">{{ m.direction === 'out' ? '－' : '＋' }}{{ m.quantity }}</text>
          <text class="biz">{{ $t('inventoryStock.' + dirKey(m.direction)) }} · {{ $t('inventoryStock.' + bizTypeKey(m.bizType)) }}</text>
        </view>
        <view class="sub"><text>#{{ m.productVariantId }} · {{ locName(m.stockLocationId) }}</text></view>
        <view class="sub">
          <text>{{ m.code }}</text>
          <text v-if="m.bizCode">｜{{ m.bizCode }}</text>
        </view>
        <view class="sub dim">{{ formatDateTime(m.createdAt) }}<text v-if="m.reason"> · {{ m.reason }}</text></view>
      </view>
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('inventoryMovements.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('inventoryMovements.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">{{ $t('inventoryMovements.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchMovements, type MovementRow } from '../../../apis/stock-doc';
import { fetchTenantInventoryOverview, type TenantStockLocation } from '../../../apis/inventory';
import { bizTypeKey, dayKey, dirKey, formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

// 与后端流水 bizType 取值一一对应（order/afterSales/stockIn/stockOut/stockMove/stocktake/purchase/manual/mirror）
const BIZ = ['order', 'afterSales', 'stockIn', 'stockOut', 'stockMove', 'stocktake', 'purchase', 'manual', 'mirror'];

const items = ref<MovementRow[]>([]);
const summary = ref<{ inQty: number; outQty: number }>({ inQty: 0, outQty: 0 });
const totalItems = ref(0);

const direction = ref<'' | 'in' | 'out'>('');
const bizType = ref('');
const datePreset = ref<'' | 'today' | '7d' | 'month'>('');
const locationId = ref('');
const variantId = ref('');

const locations = ref<TenantStockLocation[]>([]);

const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0;

const locNames = computed(() => locations.value.map((l) => l.name));
const locIndex = computed(() => {
  const i = locations.value.findIndex((l) => l.id === locationId.value);
  return i < 0 ? 0 : i;
});
const curLocName = computed(() => locations.value[locIndex.value]?.name ?? '');

const hasFilter = computed(
  () => !!direction.value || !!bizType.value || !!datePreset.value || !!locationId.value || !!variantId.value,
);

// 按天分组（同一天的多条流水归到一组，日期用本地时区）
const groups = computed(() => {
  const map = new Map<string, MovementRow[]>();
  for (const m of items.value) {
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

/** 日期预设 → from（ISO，含当日 00:00，本地时区） */
function dateFrom(preset: string): string | undefined {
  const now = new Date();
  if (preset === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (preset === '7d') {
    const d = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (preset === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return undefined;
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchMovements({
      productVariantId: variantId.value || undefined,
      locationId: locationId.value || undefined,
      bizType: bizType.value || undefined,
      direction: direction.value || undefined,
      from: dateFrom(datePreset.value),
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return; // 竞态守卫
    page.value = target;
    summary.value = res.summary;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('inventoryMovements.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

function reload(): void {
  void load(true);
}
function onDirection(d: '' | 'in' | 'out'): void {
  direction.value = d;
  reload();
}
function onBiz(b: string): void {
  bizType.value = b;
  reload();
}
function onDate(p: '' | 'today' | '7d' | 'month'): void {
  datePreset.value = p;
  reload();
}
function onLocChange(e: any): void {
  const l = locations.value[Number(e.detail.value)];
  locationId.value = l?.id ?? '';
  reload();
}
function onClear(): void {
  direction.value = '';
  bizType.value = '';
  datePreset.value = '';
  locationId.value = '';
  variantId.value = '';
  reload();
}

onLoad(async (q: any) => {
  if (q?.productVariantId) variantId.value = String(q.productVariantId);
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
  } catch (_e) {
    // 仓库筛选项加载失败不阻断流水列表
  }
  await load(true);
});

onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
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

  .locrow { display: flex; align-items: center; gap: 16rpx; margin: 4rpx 0 20rpx;
    .locpill { font-size: 24rpx; color: $wa-ink; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 24rpx; }
    .vchip { font-size: 22rpx; color: $wa-accent; background: $wa-card; border-radius: 999rpx; padding: 10rpx 20rpx; }
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
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
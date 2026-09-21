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

    <view class="sec">
      <text class="sh">{{ $t('stockDocCenter.title') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }}</text>
    </view>

    <view class="card" v-for="d in items" :key="d.id">
      <view class="row">
        <text class="code">{{ d.code }}</text>
        <text class="tag">{{ typeLabel(d.type) }}</text>
      </view>
      <view class="sub">
        <text>{{ $t('stockDocCenter.itemCount').replace('{n}', String(d.itemCount)) }}</text>
        <text class="dot">·</text>
        <text>{{ $t('stockDocCenter.totalQty').replace('{n}', String(d.totalQty)) }}</text>
      </view>
      <view class="sub dim" v-if="d.remark">
        <text>{{ $t('stockDocCenter.remarkLabel') }}：{{ d.remark }}</text>
      </view>
      <view class="sub dim">
        <text v-if="d.operator">{{ $t('stockDocCenter.operatorLabel') }}：{{ d.operator }} · </text>
        <text>{{ formatDateTime(d.createdAt) }}</text>
      </view>
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('stockDocCenter.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('stockDocCenter.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">{{ $t('stockDocCenter.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchStockDocList, type StockDocSummaryRow } from '../../../apis/stock-doc';
import { formatDateTime } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();
const PAGE = 20;

// 与 stockDoc 类型枚举一一对应（PURCHASE/TRANSFER/STOCKTAKE/ISSUE）
const TABS: Array<{ key: string; label: string }> = [
  { key: '', label: 'tabAll' },
  { key: 'PURCHASE', label: 'tabPurchase' },
  { key: 'TRANSFER', label: 'tabTransfer' },
  { key: 'STOCKTAKE', label: 'tabStocktake' },
  { key: 'ISSUE', label: 'tabIssue' },
];

const type = ref('');
const items = ref<StockDocSummaryRow[]>([]);
const totalItems = ref(0);
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0;

function typeLabel(t: string): string {
  const hit = TABS.find((x) => x.key === t);
  return hit ? locale.t(`stockDocCenter.${hit.label}`) : t;
}

async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchStockDocList({ type: type.value || undefined, page: target, pageSize: PAGE });
    if (my !== seq) return;
    page.value = target;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('stockDocCenter.loadFailed'), icon: 'none' });
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

function onTab(key: string): void {
  if (type.value === key) return;
  type.value = key;
  void load(true);
}

void load(true);
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

  .tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 22rpx; color: $wa-muted; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 0;
      &.on { color: #fff; background: $wa-ink; }
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
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
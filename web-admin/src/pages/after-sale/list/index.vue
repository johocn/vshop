<template>
  <view class="page">
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">{{ $t('afterSale.list.' + s.label) }}</text>
    </view>

    <view class="card" v-for="a in items" :key="a.id" @tap="goDetail(a)">
      <view class="row">
        <text class="code">{{ $t('afterSale.list.orderPrefix') }}{{ a.orderId }}</text>
        <text class="st" :style="{ color: st(a).color }">{{ st(a).label }}</text>
      </view>
      <text class="line">{{ $t('afterSale.list.typeLabel').replace('{type}', AFTER_SALE_TYPES[a.type] || a.type) }}</text>
      <text class="line" v-if="a.refundAmount != null">{{ $t('afterSale.list.refundAmountLabel').replace('{amount}', (a.refundAmount / 100).toFixed(2)) }}</text>
      <text class="line" v-if="a.reason">{{ $t('afterSale.list.reasonLabel').replace('{reason}', a.reason) }}</text>
      <text class="line" v-if="a.rejectReason">{{ $t('afterSale.list.rejectLabel').replace('{reason}', a.rejectReason) }}</text>
    </view>

    <view v-if="loading" class="empty">{{ $t('afterSale.list.loading') }}</view>
    <view v-else-if="!items.length" class="empty">{{ $t('afterSale.list.empty') }}</view>
    <view style="height: 160rpx" />
    <BottomBar current="order" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchAfterSales, AfterSaleRow } from '../../../apis/afterSale';
import { AFTER_SALE_STATES, AFTER_SALE_TYPES, stateLabel, StateLabel } from '../../../constants/orderState';

const locale = useLocaleStore();

const tabs = [
  { key: '', label: 'tabAll' },
  { key: 'Pending', label: 'tabPending' },
  { key: 'Refunded', label: 'tabRefunded' },
  { key: 'Rejected', label: 'tabRejected' },
];
const cur = ref('');
const items = ref<AfterSaleRow[]>([]);
const loading = ref(false);

const st = (a: AfterSaleRow): StateLabel => stateLabel(AFTER_SALE_STATES, a.state);

async function load() {
  loading.value = true;
  try {
    items.value = await fetchAfterSales(cur.value || undefined);
  } finally {
    loading.value = false;
  }
}

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  load();
}

function goDetail(a: AfterSaleRow) {
  uni.navigateTo({ url: `/pages/after-sale/detail/index?id=${a.id}` });
}

onMounted(load);
onShow(() => { load(); });
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
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
}
</style>
<template>
  <view class="page">
    <picker mode="selector" :range="locNames" @change="onLocChange">
      <view class="loc-bar">
        <text class="loc-label">{{ $t('inventoryStock.warehouse') }}</text>
        <text class="loc-name">{{ curLocName }}</text>
        <text class="loc-arrow">▾</text>
      </view>
    </picker>
    <view class="card" v-for="s in items" :key="s.id" :class="{ low: s.stockOnHand <= 5 }">
      <view class="row">
        <text class="name">#{{ s.productVariantId }}</text>
        <text class="num" :class="{ warn: s.stockOnHand <= 5 }">{{ $t('inventoryStock.stockQty').replace('{n}', s.stockOnHand) }}</text>
      </view>
      <view class="sub">
        <text>{{ $t('inventoryStock.allocated').replace('{n}', s.stockAllocated) }}</text>
        <text v-if="s.stockOnHand <= 5" class="tag">{{ $t('inventoryStock.lowStock') }}</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('inventoryStock.empty') }}</view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchStock, fetchStockLocations } from '../../../apis/inventory';

const locations = ref<Array<{ id: string; name: string }>>([]);
const locIdx = ref(0);
const items = ref<any[]>([]);
const locNames = ref<string[]>([]);
const curLocName = ref('');

async function load() {
  const loc = locations.value[locIdx.value];
  if (!loc) return;
  curLocName.value = loc.name;
  items.value = (await fetchStock(loc.id, 1, 50)).items;
}

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  load();
}

onMounted(async () => {
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  await load();
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .loc-bar { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 24rpx;
    .loc-label { font-size: 26rpx; color: $wa-muted; margin-right: 16rpx; }
    .loc-name { flex: 1; font-size: 28rpx; color: $wa-ink; }
    .loc-arrow { color: $wa-muted; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    &.low { border: 2rpx solid $wa-danger; }
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; }
      .num { font-size: 30rpx; color: $wa-ink; font-weight: 600;
        &.warn { color: $wa-danger; }
      }
    }
    .sub { display: flex; align-items: center; margin-top: 16rpx; font-size: 24rpx; color: $wa-muted;
      .tag { margin-left: 16rpx; color: #fff; background: $wa-danger; border-radius: 6rpx; padding: 2rpx 12rpx; font-size: 22rpx; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

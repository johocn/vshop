<template>
  <view class="page">
    <view class="filters">
      <picker mode="selector" :range="locNames" @change="onLocChange">
        <view class="filter-bar">
          <text class="filter-label">{{ $t('inventoryStock.warehouse') }}</text>
          <text class="filter-value">{{ curLocName }}</text>
          <text class="filter-arrow">▾</text>
        </view>
      </picker>
      <picker mode="selector" :range="thrLabels" @change="onThrChange">
        <view class="filter-bar">
          <text class="filter-label">{{ $t('inventoryStock.threshold') }}</text>
          <text class="filter-value">{{ thrLabels[thrIdx] }}</text>
          <text class="filter-arrow">▾</text>
        </view>
      </picker>
    </view>

    <view class="card" v-for="s in items" :key="s.id" :class="{ alert: isAlert(s), checked: checked[s.id] }" @tap="toggleCheck(s)">
      <view class="check" :class="{ on: isAlert(s) && checked[s.id] }">
        <text v-if="isAlert(s) && checked[s.id]">✓</text>
      </view>
      <view class="body">
        <view class="row">
          <text class="name">{{ $t('inventoryStock.sku').replace('{id}', s.productVariantId) }}</text>
          <view class="badges">
            <text v-if="isOut(s)" class="tag out">{{ $t('inventoryStock.outOfStock') }}</text>
            <text v-else-if="isLow(s)" class="tag low">{{ $t('inventoryStock.lowStock') }}</text>
          </view>
        </view>
        <view class="nums">
          <text class="num" :class="{ warn: isAlert(s) }">{{ $t('inventoryStock.stockQty').replace('{n}', s.stockOnHand) }}</text>
          <text class="num-muted">{{ $t('inventoryStock.thresholdCol').replace('{n}', threshold) }}</text>
          <text v-if="isAlert(s)" class="num-muted">{{ $t('inventoryStock.shortBy').replace('{n}', shortage(s)) }}</text>
        </view>
      </view>
    </view>

    <view v-if="!items.length" class="empty">{{ $t('inventoryStock.empty') }}</view>

    <view class="savebar">
      <button class="save" :disabled="saving || !checkedCount" @tap="onGenPurchase">
        {{ saving ? $t('inventoryStock.genPurchasing') : $t('inventoryStock.genPurchase').replace('{n}', checkedCount) }}
      </button>
    </view>
    <view style="height: 160rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, reactive, computed, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchStock, fetchStockLocations } from '../../../apis/inventory';
import { createStockDoc } from '../../../apis/stock-doc';

const locale = useLocaleStore();

const locations = ref<Array<{ id: string; name: string }>>([]);
const locIdx = ref(0);
const items = ref<any[]>([]);
const locNames = ref<string[]>([]);
const curLocName = ref('');

const thresholds = [5, 10, 20, 50];
const thrIdx = ref(0);
const thrLabels = computed(() => thresholds.map((t) => locale.t('inventoryStock.thresholdOpt').replace('{n}', String(t))));

const checked = reactive<Record<string, boolean>>({});
const saving = ref(false);

const threshold = computed(() => thresholds[thrIdx.value]);
const checkedCount = computed(() => items.value.filter((s) => isAlert(s) && checked[s.id]).length);

function isAlert(s: any) {
  return s.stockOnHand < threshold.value;
}
function isLow(s: any) {
  const t = threshold.value;
  return s.stockOnHand > 0 && s.stockOnHand < t;
}
function isOut(s: any) {
  return s.stockOnHand <= 0;
}
function shortage(s: any) {
  return Math.max(0, threshold.value - s.stockOnHand);
}

function toggleCheck(s: any) {
  if (!isAlert(s)) return;
  checked[s.id] = !checked[s.id];
}

async function load() {
  const loc = locations.value[locIdx.value];
  if (!loc) return;
  curLocName.value = loc.name;
  items.value = (await fetchStock(loc.id, 1, 200)).items;
  for (const k of Object.keys(checked)) delete checked[k];
}

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  load();
}

function onThrChange(e: any) {
  thrIdx.value = Number(e.detail.value);
}

async function onGenPurchase() {
  const loc = locations.value[locIdx.value];
  if (!loc) return;
  const selected = items.value.filter((s) => isAlert(s) && checked[s.id]);
  if (!selected.length) {
    return uni.showToast({ title: locale.t('inventoryStock.noSelect'), icon: 'none' });
  }
  saving.value = true;
  try {
    const doc = await createStockDoc({
      type: 'PURCHASE',
      items: selected.map((s) => ({
        variantId: s.productVariantId,
        toStockLocationId: loc.id,
        qty: shortage(s),
      })),
    });
    uni.showToast({ title: locale.t('inventoryStock.genDone').replace('{code}', doc.code), icon: 'success' });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.genFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  locations.value = await fetchStockLocations();
  locNames.value = locations.value.map((l) => l.name);
  await load();
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .filters { display: flex; gap: 16rpx; margin-bottom: 24rpx;
    &:first-child picker, &:last-child picker { flex: 1; }
    .filter-bar { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 22rpx 24rpx;
      .filter-label { font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
      .filter-value { flex: 1; font-size: 28rpx; color: $wa-ink; }
      .filter-arrow { color: $wa-muted; }
    }
  }
  .card { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    &.alert { border: 2rpx solid $wa-danger; }
    &.checked { background: #fff3f3; }
    .check { width: 40rpx; height: 40rpx; border-radius: 50%; border: 2rpx solid $wa-rule; margin-right: 20rpx; display: flex; align-items: center; justify-content: center;
      &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; font-size: 26rpx; }
    }
    .body { flex: 1;
      .row { display: flex; align-items: center; justify-content: space-between;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
        .badges { display: flex; gap: 12rpx; }
        .tag { color: #fff; border-radius: 6rpx; padding: 2rpx 12rpx; font-size: 22rpx;
          &.low { background: $wa-accent; }
          &.out { background: $wa-danger; }
        }
      }
      .nums { display: flex; align-items: center; gap: 24rpx; margin-top: 12rpx; font-size: 24rpx;
        .num { font-size: 30rpx; color: $wa-ink; font-weight: 600;
          &.warn { color: $wa-danger; }
        }
        .num-muted { color: $wa-muted; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .savebar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 32rpx calc(120rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
    .save { background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius;
      &[disabled] { opacity: 0.5; }
    }
  }
}
</style>
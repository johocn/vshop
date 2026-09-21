<template>
  <view class="fbar">
    <view class="row1">
      <picker mode="selector" :range="locNames" :value="locIndex" @change="onLocChange">
        <view class="pill">
          <text class="pill-t">{{ curLocName }}</text>
          <text class="pill-a">▾</text>
        </view>
      </picker>
      <view class="search">
        <input
          class="ipt"
          :value="localKw"
          :placeholder="$t('inventoryStock.searchPlaceholder')"
          confirm-type="search"
          @input="onInput"
          @confirm="onConfirm"
        />
        <text v-if="localKw" class="clr" @tap="onClear">✕</text>
      </view>
    </view>

    <scroll-view class="sorts" scroll-x>
      <text
        v-for="s in sortKeys"
        :key="s"
        class="chip"
        :class="{ on: sort === s }"
        @tap="emit('sort', s)"
      >{{ $t(sortLabel[s]) }}</text>
    </scroll-view>

    <view class="tabs">
      <text class="tab" :class="{ on: bucket === '' }" @tap="emit('bucket-change', '')">
        {{ $t('inventoryStock.bucket.all') }} {{ buckets.all }}
      </text>
      <text class="tab out" :class="{ on: bucket === 'out' }" @tap="emit('bucket-change', 'out')">
        {{ $t('inventoryStock.bucket.out') }} {{ buckets.out }}
      </text>
      <text class="tab low" :class="{ on: bucket === 'low' }" @tap="emit('bucket-change', 'low')">
        {{ $t('inventoryStock.bucket.low') }} {{ buckets.low }}
      </text>
      <text class="tab ok" :class="{ on: bucket === 'ok' }" @tap="emit('bucket-change', 'ok')">
        {{ $t('inventoryStock.bucket.ok') }} {{ buckets.ok }}
      </text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  locations: Array<{ id: string; name: string }>;
  locationId: string;
  keyword: string;
  sort: string;
  bucket: string;
  buckets: { all: number; out: number; low: number; ok: number };
}>();
const emit = defineEmits<{
  (e: 'location', id: string): void;
  (e: 'search', kw: string): void;
  (e: 'sort', key: string): void;
  (e: 'bucket-change', key: string): void;
}>();

const SORT_KEYS = ['stockAsc', 'stockDesc', 'gapDesc', 'valueDesc'];
const sortLabel: Record<string, string> = {
  stockAsc: 'inventoryStock.sort.stockAsc',
  stockDesc: 'inventoryStock.sort.stockDesc',
  gapDesc: 'inventoryStock.sort.gapDesc',
  valueDesc: 'inventoryStock.sort.valueDesc',
};
const sortKeys = computed(() => SORT_KEYS);

const locNames = computed(() => props.locations.map((l) => l.name));
const locIndex = computed(() => {
  const i = props.locations.findIndex((l) => l.id === props.locationId);
  return i < 0 ? 0 : i;
});
const curLocName = computed(() => props.locations[locIndex.value]?.name ?? '');
// 父级清空关键词（如点 KPI 卡重置）时同步输入框
const localKw = ref(props.keyword);
watch(
  () => props.keyword,
  (v) => {
    if (v !== localKw.value) localKw.value = v;
  },
);

function onLocChange(e: any) {
  const l = props.locations[Number(e.detail.value)];
  if (l) emit('location', l.id);
}

let timer: any = null;
function onInput(e: any) {
  localKw.value = e.detail.value ?? '';
  if (timer) clearTimeout(timer);
  // 400ms 防抖（spec §3.2.1）
  timer = setTimeout(() => emit('search', localKw.value.trim()), 400);
}
function onConfirm() {
  if (timer) clearTimeout(timer);
  emit('search', localKw.value.trim());
}
function onClear() {
  if (timer) clearTimeout(timer);
  localKw.value = '';
  emit('search', '');
}
</script>

<style lang="scss" scoped>
.fbar { margin-bottom: 20rpx;

  .row1 { display: flex; align-items: center; gap: 16rpx;

    .pill { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 18rpx 24rpx;
      .pill-t { font-size: 26rpx; color: $wa-ink; }
      .pill-a { font-size: 22rpx; color: $wa-muted; margin-left: 8rpx; }
    }

    .search { flex: 1; display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 0 20rpx;
      .ipt { flex: 1; height: 76rpx; font-size: 26rpx; color: $wa-ink; }
      .clr { font-size: 24rpx; color: $wa-muted; padding-left: 12rpx; }
    }
  }

  .sorts { white-space: nowrap; margin-top: 16rpx;
    .chip { display: inline-block; font-size: 24rpx; color: $wa-muted; background: $wa-card; border-radius: 999rpx; padding: 10rpx 24rpx; margin-right: 12rpx;
      &.on { color: #fff; background: $wa-accent; }
    }
  }

  .tabs { display: flex; gap: 12rpx; margin-top: 16rpx;
    .tab { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted; background: $wa-card; border-radius: $wa-radius; padding: 14rpx 0;
      &.on { color: #fff; background: $wa-ink; }
      &.out.on { background: $wa-danger; }
      &.low.on { background: $wa-accent; }
      &.ok.on { background: $wa-success; }
    }
  }
}
</style>
<template>
  <!--
    入库库位选择器（三档自适应）：
    - bin 档：库区 → 库位 两级级联
    - 仅 zone 档：只到库区（一级）
    - off 档：调用方不应渲染本组件（由调用方用 v-if="showZone" 门控）
  -->
  <view class="bin-picker">
    <view class="field">
      <text class="label">{{ $t('orderAdmin.picking.bin.zone') }}</text>
      <picker mode="selector" :range="zoneNames" :disabled="!stockLocationId" @change="onZoneChange">
        <view class="picker" :class="{ ph: zoneIdx < 0 }">
          {{ zoneIdx >= 0 ? zoneNames[zoneIdx] : (stockLocationId ? $t('orderAdmin.picking.bin.selectZone') : $t('orderAdmin.picking.bin.needWarehouseFirst')) }} ▾
        </view>
      </picker>
    </view>

    <view v-if="showBin" class="field">
      <text class="label">{{ $t('orderAdmin.picking.bin.bin') }}</text>
      <picker mode="selector" :range="binNames" :disabled="!zoneId" @change="onBinChange">
        <view class="picker" :class="{ ph: binIdx < 0 }">
          {{ binIdx >= 0 ? binNames[binIdx] : (zoneId ? $t('orderAdmin.picking.bin.selectBin') : $t('orderAdmin.picking.bin.needZoneFirst')) }} ▾
        </view>
      </picker>
    </view>

    <view v-if="stockLocationId && !zones.length" class="hint">
      <text class="ht">{{ $t('orderAdmin.picking.bin.noZone') }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { fetchStorageBins, fetchStorageZones, type StorageBin, type StorageZone } from '../../apis/storage-bin';
import { useBinMode } from '../../composables/useBinMode';

const props = defineProps<{
  /** 目标仓库 id（为空时不可选，提示先选仓库） */
  stockLocationId: string;
  zoneId: string;
  binId: string;
}>();
const emit = defineEmits<{
  (e: 'update:zoneId', v: string): void;
  (e: 'update:binId', v: string): void;
}>();

const { showBin, ensureBinMode } = useBinMode();

const zones = ref<StorageZone[]>([]);
const bins = ref<StorageBin[]>([]);
const zoneIdx = ref(-1);
const binIdx = ref(-1);

const zoneNames = computed(() => zones.value.map((z) => `${z.code} ${z.name}`));
const binNames = computed(() => bins.value.map((b) => b.code));

/** 库位列表只在 bin 档加载；zone 档下 bins 恒为空、不渲染对应 picker */
async function loadBinsFor(zone: string, wantBinId: string): Promise<void> {
  if (!showBin.value || !zone || !props.stockLocationId) {
    bins.value = [];
    binIdx.value = -1;
    return;
  }
  try {
    bins.value = await fetchStorageBins(props.stockLocationId, zone);
  } catch (_e) {
    bins.value = [];
  }
  binIdx.value = bins.value.findIndex((b) => String(b.id) === String(wantBinId));
}

function syncZoneIdx(): void {
  zoneIdx.value = zones.value.findIndex((z) => String(z.id) === String(props.zoneId));
}

async function loadZones(): Promise<void> {
  if (!props.stockLocationId) {
    zones.value = [];
    bins.value = [];
    zoneIdx.value = -1;
    binIdx.value = -1;
    return;
  }
  try {
    zones.value = await fetchStorageZones(props.stockLocationId);
  } catch (_e) {
    zones.value = [];
  }
  syncZoneIdx();
  await loadBinsFor(props.zoneId, props.binId);
}

function onZoneChange(e: any): void {
  const i = Number(e.detail.value);
  zoneIdx.value = i;
  const zid = String(zones.value[i]?.id ?? '');
  emit('update:zoneId', zid);
  emit('update:binId', '');
  loadBinsFor(zid, '');
}

function onBinChange(e: any): void {
  const i = Number(e.detail.value);
  binIdx.value = i;
  emit('update:binId', String(bins.value[i]?.id ?? ''));
}

onMounted(() => {
  ensureBinMode();
});

// 换仓 → 重新拉库区；外部改动 zoneId（如回填现库位）→ 重新拉库位
watch(() => props.stockLocationId, () => { loadZones(); }, { immediate: true });
watch(() => props.zoneId, (z) => {
  syncZoneIdx();
  loadBinsFor(z, props.binId);
});
</script>

<style lang="scss" scoped>
.field {
  margin-bottom: 32rpx;
  .label { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 12rpx; }
  .picker { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 28rpx; color: $wa-ink;
    &.ph { color: #999; }
  }
}
.hint { margin: -12rpx 0 24rpx; padding: 16rpx 20rpx; border-radius: 8rpx; background: #fff4ea;
  .ht { font-size: 24rpx; color: $wa-accent; }
}
</style>
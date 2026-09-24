<template>
  <view class="page">
    <!-- ① 顶部：盘次 + 进度 + 筛选 + 扫码入口 -->
    <view class="head">
      <view class="hrow">
        <text class="wt">{{ $t('stocktake.count.waveOf').replace('{zone}', waveLabel) }}</text>
        <text class="pg">{{ $t('stocktake.count.progress').replace('{done}', String(progress.counted)).replace('{total}', String(progress.expected)) }}</text>
      </view>
      <view class="bar"><view class="fill" :style="{ width: progress.percent + '%' }" /></view>
      <view class="frow">
        <text
          v-for="f in filters"
          :key="f.key"
          class="fb"
          :class="{ on: activeFilter === f.key }"
          @tap="setFilter(f.key)"
        >{{ $t(f.label) }}</text>
        <text class="scan" @tap="goScan">{{ $t('stocktake.count.scanEntry') }}</text>
      </view>
    </view>

    <view v-if="!canEdit" class="warn">{{ $t('stocktake.count.requireClaim') }}</view>
    <view v-if="!showZone" class="hint">{{ $t('stocktake.count.noZone') }}</view>

    <!-- ② 版式 B：库区 → 格子宫格（zone/bin 档都出库区 Tab；格子宫格仅 bin 档，zone 档只到库区） -->
    <template v-if="showZone">
      <BinGrid
        :groups="zoneGroups"
        :active-zone-id="activeZoneId"
        :selected-bin-id="selectedBinId"
        :show-cells="showBin"
        :empty-text="$t('stocktake.count.emptyZone')"
        :summary-text="zoneSummary"
        @pick-zone="pickZone"
        @pick-bin="pickBin"
      />
    </template>

    <!-- ③ 行清单：选中格子 / off 档全量；未盘优先（sortLines 已排好） -->
    <view class="list">
      <text v-if="showZone && selectedBinId" class="sub">
        {{ $t('stocktake.count.binSummary').replace('{n}', String(binLines.length)) }}
      </text>
      <CountLineRow
        v-for="l in binLines"
        :key="l.id"
        :line="l"
        :editable="canEdit"
        :model-value="draftOf(l)"
        @update:model-value="(v: string) => setDraft(l.id, v)"
      />
      <view v-if="!binLines.length" class="empty">{{ selectedBinId ? $t('stocktake.count.emptyBin') : $t('stocktake.count.emptyZone') }}</view>
    </view>

    <!-- ④ 未归位桶（账上有货但未绑库位；规格 §3.4） -->
    <template v-if="showZone && unassignedLines.length">
      <text class="sec">{{ $t('stocktake.count.unassignedBlock') }}</text>
      <CountLineRow
        v-for="l in unassignedLines"
        :key="l.id"
        :line="l"
        :editable="canEdit"
        :model-value="draftOf(l)"
        @update:model-value="(v: string) => setDraft(l.id, v)"
      />
    </template>

    <!-- ⑤ 底部固定条 -->
    <view class="savebar">
      <button class="ghost" :disabled="saving || !canEdit" @tap="onSave">{{ saving ? $t('stocktake.count.saving') : $t('stocktake.count.save') }}</button>
      <button class="main" :disabled="saving || !canEdit" @tap="onSubmit">{{ $t('stocktake.count.submit') }}</button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import BinGrid from '../../../components/stocktake/BinGrid.vue';
import CountLineRow from '../../../components/stocktake/CountLineRow.vue';
import { fetchBinOccupancy, fetchStorageZones } from '../../../apis/storage-bin';
import { submitStocktakeWave } from '../../../apis/stocktake';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';
import { useStocktakeScope } from '../../../composables/useStocktakeScope';
import { groupBinsByZone, type BinOccupancyRow, type ZoneGroup, type ZoneLike } from '../../../utils/stocktake-grid';

const locale = useLocaleStore();
const { showZone, showBin, ensureBinMode } = useBinMode();
const scope = useStocktakeScope();

const filters = [
  { key: 'all', label: 'stocktake.count.filterAll' },
  { key: 'uncounted', label: 'stocktake.count.filterUncounted' },
  { key: 'counted', label: 'stocktake.count.filterCounted' },
] as const;
const activeFilter = ref<string>('all');

const occupancy = ref<BinOccupancyRow[]>([]);
const zones = ref<ZoneLike[]>([]);
const activeZoneId = ref<string>('');
const selectedBinId = ref<string>('');

const { progress, canEdit, visibleLines, unassignedLines, setDraft, draftOf, save, saving, wave, taskId, waveId } = scope;

/** 库区真实列表参与归组：排序按 zone.sortOrder，名称/编码取库区主档（拿不到时退回行内快照） */
const zoneGroups = computed(() => groupBinsByZone(occupancy.value, zones.value));

const waveLabel = computed(() => {
  const w = wave.value;
  if (!w) return '—';
  if (w.scopeType === 'unassigned') return locale.t('stocktake.task.waveUnassigned');
  if (w.scopeType === 'whole') return locale.t('stocktake.task.waveWhole');
  return `${w.zoneCode || ''} ${w.zoneName || ''}`.trim() || locale.t('stocktake.task.waveWhole');
});

const zoneSummary = (g: ZoneGroup) =>
  locale.t('stocktake.count.zoneSummary').replace('{sku}', String(g.skuTotal)).replace('{empty}', String(g.emptyBins));

/** 已归位行：zone 档下主清单只看这些；未归位行由 ④ 未归位桶单独渲染（否则两处重复出现同一行） */
const assignedLines = computed(() => visibleLines.value.filter((l) => !!l.zoneId));

/** 当前要显示的行：off 档 → 全部；bin 档选中格子 → 该格子行；未选 → 该库区全部已归位行 */
const binLines = computed(() => {
  if (!showZone.value) return visibleLines.value;
  if (!selectedBinId.value) return assignedLines.value;
  return assignedLines.value.filter((l) => String(l.binId || '') === String(selectedBinId.value));
});

function setFilter(key: string) {
  activeFilter.value = key;
  scope.filter.value =
    key === 'uncounted' ? { onlyUncounted: true }
    : key === 'counted' ? { onlyCounted: true }
    : {};
}

function pickZone(id: string) {
  activeZoneId.value = id;
  selectedBinId.value = '';
}

function pickBin(id: string) {
  // 同格子二次点击 = 取消选中（回到全量）
  selectedBinId.value = String(selectedBinId.value) === String(id) ? '' : id;
}

async function loadOccupancy() {
  const locId = scope.task.value?.stockLocationId;
  if (!showZone.value || !locId) { occupancy.value = []; zones.value = []; return; }
  try {
    const [rows, zoneList] = await Promise.all([
      fetchBinOccupancy(String(locId)),
      fetchStorageZones(String(locId)),
    ]);
    occupancy.value = rows;
    zones.value = zoneList;
    if (!activeZoneId.value && rows.length) activeZoneId.value = String(rows[0].zoneId);
  } catch {
    occupancy.value = [];
    zones.value = [];
  }
}

async function onSave() {
  try {
    const n = await save();
    uni.showToast({
      title: n ? locale.t('stocktake.count.savedCount').replace('{n}', String(n)) : locale.t('stocktake.count.noChange'),
      icon: 'none',
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.count.operationFailed'), icon: 'none' });
  }
}

function onSubmit() {
  uni.showModal({
    title: locale.t('stocktake.count.submit'),
    content: locale.t('stocktake.count.submitConfirm'),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await save();                                  // 先落草稿，避免漏保存
        await submitStocktakeWave(String(waveId.value));
        uni.showToast({ title: locale.t('stocktake.count.submitDone'), icon: 'success' });
        setTimeout(() => uni.navigateBack(), 700);
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('stocktake.count.operationFailed'), icon: 'none' });
      }
    },
  });
}

function goScan() {
  uni.navigateTo({
    url: `/pages/inventory/stocktake/scan?taskId=${taskId.value}&waveId=${waveId.value}`,
    fail: () => uni.showToast({ title: locale.t('stocktake.count.operationFailed'), icon: 'none' }),
  });
}

onLoad(async (q: any) => {
  await ensureBinMode();
  try {
    await scope.load(String(q?.taskId || ''), String(q?.waveId || ''));
    await loadOccupancy();
    // 默认筛选：未盘（对上「已盘点/未盘点」需求原文）
    setFilter('uncounted');
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.count.loadFailed'), icon: 'none' });
  }
});

// 盘次变化（如 off 档只有一个盘次）后重新取占用
watch(() => scope.wave.value?.id, loadOccupancy);

onShow(() => { setFilter(activeFilter.value); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.head { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
  .hrow { display: flex; align-items: center;
    .wt { flex: 1; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .pg { font-size: 24rpx; color: $wa-muted; }
  }
  .bar { height: 10rpx; background: $wa-rule; border-radius: 6rpx; margin-top: 14rpx; overflow: hidden;
    .fill { height: 100%; background: $wa-accent; }
  }
  .frow { display: flex; align-items: center; margin-top: 18rpx;
    .fb { font-size: 25rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 10rpx 24rpx; margin-right: 12rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
    .scan { margin-left: auto; font-size: 25rpx; color: $wa-accent; }
  }
}
.warn { font-size: 24rpx; color: $wa-danger; margin: 0 0 16rpx 8rpx; }
.hint { font-size: 24rpx; color: $wa-muted; margin: 0 0 16rpx 8rpx; }
.sec { display: block; font-size: 24rpx; color: $wa-muted; margin: 24rpx 0 12rpx 8rpx; }
.list { margin-top: 20rpx;
  .sub { display: block; font-size: 23rpx; color: $wa-muted; margin-bottom: 12rpx; }
}
.empty { text-align: center; font-size: 25rpx; color: $wa-muted; padding: 60rpx 0; }
.savebar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $wa-rule;
  .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
  .main { flex: 1; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
}
</style>
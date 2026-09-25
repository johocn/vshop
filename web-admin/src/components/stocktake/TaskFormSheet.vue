<template>
  <view v-if="visible" class="mask" @tap="close">
    <view class="sheet" @tap.stop>
      <text class="st">{{ mode === 'edit' ? $t('stocktake.board.editTask') : $t('stocktake.board.newTask') }}</text>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formWarehouse') }}</text>
        <picker mode="selector" :range="locNames" @change="onLocChange">
          <view class="pk">{{ locName || $t('stocktake.board.formSelectWarehouse') }} ▾</view>
        </picker>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formName') }}</text>
        <input class="ipt" v-model="name" :placeholder="$t('stocktake.board.formNamePlaceholder')" />
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formActivity') }}</text>
        <input class="ipt" v-model="activityCode" :placeholder="$t('stocktake.board.formActivityPlaceholder')" />
      </view>

      <view v-if="showZone" class="field">
        <text class="lb">{{ $t('stocktake.board.formZones') }}</text>
        <view v-if="!zones.length" class="hint">{{ $t('stocktake.board.scopeAll') }}</view>
        <view class="chips">
          <text v-for="z in zones" :key="z.id" class="chip" :class="{ on: pickedZones.includes(Number(z.id)) }"
            @tap="toggleZone(Number(z.id))">{{ z.code }}</text>
        </view>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formCategories') }}</text>
        <view class="chips">
          <text v-for="c in cats" :key="c.id" class="chip" :class="{ on: pickedCats.includes(Number(c.id)) }"
            @tap="toggleCat(Number(c.id))">{{ c.name }}</text>
        </view>
      </view>

      <view class="field">
        <text class="lb">{{ $t('stocktake.board.formVariants') }}</text>
        <input class="ipt" v-model="variantIds" placeholder="12,34,56" />
      </view>

      <view class="field row" @tap="includeZeroBook = !includeZeroBook">
        <text class="lb rm">{{ $t('stocktake.board.formIncludeZero') }}</text>
        <text class="sw" :class="{ on: includeZeroBook }">{{ includeZeroBook ? '✓' : '' }}</text>
      </view>

      <view v-if="showZone" class="field row" @tap="autoSplitByZone = !autoSplitByZone">
        <text class="lb rm">{{ $t('stocktake.board.formAutoSplit') }}</text>
        <text class="sw" :class="{ on: autoSplitByZone }">{{ autoSplitByZone ? '✓' : '' }}</text>
      </view>
      <view v-else class="hint">{{ $t('stocktake.board.modeOffHint') }}</view>

      <!-- 草稿态：编辑只保存；新建：双动作（存草稿 / 创建并发布） -->
      <view v-if="mode === 'edit'" class="acts">
        <button class="submit" :disabled="busy || !canCount" @tap="onSaveDraft">
          {{ busy ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSaveDraft') }}
        </button>
      </view>
      <view v-else class="acts">
        <button class="ghost" :disabled="busy || !canCount" @tap="onCreateDraft">{{ $t('stocktake.board.formSaveDraft') }}</button>
        <button class="submit" :disabled="busy || !canCount" @tap="onCreateOpen">
          {{ busy ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSubmit') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { createStocktakeTask, updateStocktakeTask, type StocktakeTask } from '../../apis/stocktake';
import { fetchStockLocations } from '../../apis/inventory';
import { fetchStorageZones, type StorageZone } from '../../apis/storage-bin';
import { fetchCollectionsOptimized, type CollectionItem } from '../../apis/collection';
import { useLocaleStore } from '../../stores/localeStore';
import { useAuthStore } from '../../stores/authStore';
import { useBinMode } from '../../composables/useBinMode';
import { parseScopeJson } from '../../utils/stocktake-grid';

const props = defineProps<{ visible: boolean; mode: 'create' | 'edit'; draft?: StocktakeTask | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', task: StocktakeTask, kind: 'draft' | 'open'): void }>();

const locale = useLocaleStore();
const auth = useAuthStore();
const { showZone } = useBinMode();
const canCount = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakeCount'));

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const locName = ref('');
const zones = ref<StorageZone[]>([]);
const cats = ref<CollectionItem[]>([]);
const pickedZones = ref<number[]>([]);
const pickedCats = ref<number[]>([]);
const name = ref('');
const activityCode = ref('');
const variantIds = ref('');
const includeZeroBook = ref(false);
const autoSplitByZone = ref(true);
const busy = ref(false);

const close = () => emit('close');
const toggleZone = (id: number) => { pickedZones.value = pickedZones.value.includes(id) ? pickedZones.value.filter((x) => x !== id) : [...pickedZones.value, id]; };
const toggleCat = (id: number) => { pickedCats.value = pickedCats.value.includes(id) ? pickedCats.value.filter((x) => x !== id) : [...pickedCats.value, id]; };

function parseVariantIds(raw: string): number[] {
  return String(raw || '').split(/[,，\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

async function loadZones(locId: string) {
  if (!showZone.value || !locId) { zones.value = []; return; }
  try { zones.value = await fetchStorageZones(locId); } catch { zones.value = []; }
}

/** 打开时装载仓库/分类；编辑模式按草稿预填（规格 §8.2） */
watch(() => props.visible, async (v) => {
  if (!v) return;
  if (!locations.value.length) {
    locations.value = await fetchStockLocations();
    locNames.value = locations.value.map((l) => l.name);
  }
  if (!cats.value.length) {
    try { cats.value = await fetchCollectionsOptimized(50); } catch { cats.value = []; }
  }
  if (props.mode === 'edit' && props.draft) {
    const d = props.draft;
    const idx = locations.value.findIndex((l) => String(l.id) === String(d.stockLocationId));
    locIdx.value = idx;
    locName.value = idx >= 0 ? locations.value[idx].name : '';
    name.value = d.name;
    activityCode.value = d.activityCode || '';
    const s = parseScopeJson(d.scopeJson) as any;
    includeZeroBook.value = !!s.includeZeroBook;
    autoSplitByZone.value = s.autoSplitByZone !== false;
    pickedZones.value = (s.zones || []).map(Number);
    pickedCats.value = (s.categoryIds || []).map(Number);
    variantIds.value = (s.variantIds || []).join(',');
    await loadZones(String(d.stockLocationId || ''));
  } else if (props.mode === 'create') {
    locIdx.value = -1;
    locName.value = '';
    name.value = '';
    activityCode.value = '';
    variantIds.value = '';
    includeZeroBook.value = false;
    autoSplitByZone.value = true;
    pickedZones.value = [];
    pickedCats.value = [];
    await loadZones(String(locations.value[0]?.id || ''));
  }
});

async function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  const hit = locations.value[locIdx.value];
  locName.value = hit?.name ?? '';
  pickedZones.value = [];
  await loadZones(String(hit?.id || ''));
}

function buildScope() {
  return {
    zones: showZone.value ? pickedZones.value : [],
    categoryIds: pickedCats.value,
    variantIds: parseVariantIds(variantIds.value),
    includeZeroBook: includeZeroBook.value,
    autoSplitByZone: showZone.value ? autoSplitByZone.value : false,
  };
}

/** mode=edit → 保存草稿；mode=create + draft=true → 存草稿 */
async function onSaveDraft() {
  const hit = locations.value[locIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!name.value.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  busy.value = true;
  try {
    const scope = buildScope();
    if (props.mode === 'edit' && props.draft) {
      const t = await updateStocktakeTask(String(props.draft.id), {
        name: name.value.trim(), activityCode: activityCode.value.trim() || null,
        stockLocationId: String(hit.id), scope,
      });
      uni.showToast({ title: locale.t('stocktake.board.formSaved'), icon: 'none' });
      emit('saved', t, 'draft');
    } else {
      const t = await createStocktakeTask({
        stockLocationId: String(hit.id), name: name.value.trim(),
        activityCode: activityCode.value.trim() || null, scope, autoSplitByZone: scope.autoSplitByZone, state: 'DRAFT',
      });
      uni.showToast({ title: locale.t('stocktake.board.createDraftDone').replace('{code}', t.code), icon: 'none' });
      emit('saved', t, 'draft');
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.saveFailed'), icon: 'none' });
  } finally { busy.value = false; }
}

async function onCreateOpen() {
  const hit = locations.value[locIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!name.value.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  busy.value = true;
  try {
    const scope = buildScope();
    const t = await createStocktakeTask({
      stockLocationId: String(hit.id), name: name.value.trim(),
      activityCode: activityCode.value.trim() || null, scope, autoSplitByZone: scope.autoSplitByZone, state: 'OPEN',
    });
    uni.showToast({
      title: locale.t('stocktake.board.createDone').replace('{code}', t.code).replace('{waves}', String(t.waveCount)),
      icon: 'none',
    });
    emit('saved', t, 'open');
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.createFailed'), icon: 'none' });
  } finally { busy.value = false; }
}
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 88vh; overflow-y: auto; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  .st { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; margin-bottom: 24rpx; }
  .field { margin-bottom: 26rpx;
    &.row { display: flex; align-items: center; }
    .lb { display: block; font-size: 25rpx; color: $wa-muted; margin-bottom: 12rpx;
      &.rm { margin-bottom: 0; flex: 1; }
    }
    .ipt, .pk { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx; font-size: 27rpx; color: $wa-ink; }
    .sw { width: 56rpx; height: 56rpx; line-height: 56rpx; text-align: center; border-radius: $wa-radius;
      background: $wa-bg; color: $wa-muted; font-size: 28rpx;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .chips { display: flex; flex-wrap: wrap;
    .chip { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius; padding: 10rpx 22rpx; margin: 0 12rpx 12rpx 0;
      &.on { background: $wa-accent; color: #fff; }
    }
  }
  .hint { font-size: 23rpx; color: $wa-muted; }
  .acts { display: flex; gap: 20rpx; margin-top: 12rpx;
    .ghost { flex: 1; background: $wa-bg; color: $wa-ink; font-size: 28rpx; border-radius: $wa-radius; }
    .submit { flex: 2; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
  }
}
</style>
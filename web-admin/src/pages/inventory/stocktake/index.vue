<template>
  <view class="page">
    <!-- ① 状态 Tab -->
    <view class="tabs">
      <view v-for="t in tabs" :key="t.key" class="tb" :class="{ on: tab === t.key }" @tap="switchTab(t.key)">
        <text class="tl">{{ $t(t.label) }}</text>
      </view>
    </view>

    <!-- ② 仓库筛选 -->
    <view class="filter">
      <picker mode="selector" :range="locNames" @change="onLocChange">
        <view class="picker">{{ curLocName || $t('stocktake.board.pickWarehouse') }} ▾</view>
      </picker>
      <text v-if="locId" class="clear" @tap="clearLoc">✕</text>
    </view>

    <!-- ③ 任务列表：按 activityCode 分组（多仓协同 = 同活动码合并展示） -->
    <view v-for="grp in groups" :key="grp.key" class="group">
      <text class="gh">{{ grp.label }}</text>
      <TaskCard v-for="t in grp.items" :key="t.id" :task="t" @open="goTask(t.id)" />
    </view>

    <view v-if="loading && !tasks.length" class="more">{{ $t('stocktake.board.loading') }}</view>
    <view v-else-if="!tasks.length" class="empty">{{ $t('stocktake.board.empty') }}</view>

    <!-- ④ 新建任务浮动按钮 -->
    <view class="fab" @tap="openForm">＋ {{ $t('stocktake.board.newTask') }}</view>

    <!-- ⑤ 新建任务表单 -->
    <view v-if="formVisible" class="mask" @tap="formVisible = false">
      <view class="sheet" @tap.stop>
        <text class="st">{{ $t('stocktake.board.newTask') }}</text>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formWarehouse') }}</text>
          <picker mode="selector" :range="locNames" @change="onFormLocChange">
            <view class="pk">{{ formLocName || $t('stocktake.board.formSelectWarehouse') }} ▾</view>
          </picker>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formName') }}</text>
          <input class="ipt" v-model="form.name" :placeholder="$t('stocktake.board.formNamePlaceholder')" />
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formActivity') }}</text>
          <input class="ipt" v-model="form.activityCode" :placeholder="$t('stocktake.board.formActivityPlaceholder')" />
        </view>

        <!-- 库区多选仅在三档开启时有意义 -->
        <view v-if="showZone" class="field">
          <text class="lb">{{ $t('stocktake.board.formZones') }}</text>
          <view v-if="!formZones.length" class="hint">{{ $t('stocktake.board.scopeAll') }}</view>
          <view class="chips">
            <text
              v-for="z in formZones"
              :key="z.id"
              class="chip"
              :class="{ on: pickedZones.includes(Number(z.id)) }"
              @tap="toggleZone(Number(z.id))"
            >{{ z.code }}</text>
          </view>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formCategories') }}</text>
          <view class="chips">
            <text
              v-for="c in formCats"
              :key="c.id"
              class="chip"
              :class="{ on: pickedCats.includes(Number(c.id)) }"
              @tap="toggleCat(Number(c.id))"
            >{{ c.name }}</text>
          </view>
        </view>

        <view class="field">
          <text class="lb">{{ $t('stocktake.board.formVariants') }}</text>
          <input class="ipt" v-model="form.variantIds" placeholder="12,34,56" />
        </view>

        <view class="field row" @tap="form.includeZeroBook = !form.includeZeroBook">
          <text class="lb rm">{{ $t('stocktake.board.formIncludeZero') }}</text>
          <text class="sw" :class="{ on: form.includeZeroBook }">{{ form.includeZeroBook ? '✓' : '' }}</text>
        </view>

        <view v-if="showZone" class="field row" @tap="form.autoSplitByZone = !form.autoSplitByZone">
          <text class="lb rm">{{ $t('stocktake.board.formAutoSplit') }}</text>
          <text class="sw" :class="{ on: form.autoSplitByZone }">{{ form.autoSplitByZone ? '✓' : '' }}</text>
        </view>
        <view v-else class="hint">{{ $t('stocktake.board.modeOffHint') }}</view>

        <button class="submit" :disabled="submitting" @tap="onCreate">
          {{ submitting ? $t('stocktake.board.formSubmitting') : $t('stocktake.board.formSubmit') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import TaskCard from '../../../components/stocktake/TaskCard.vue';
import { createStocktakeTask, fetchStocktakeTasks, type StocktakeTask } from '../../../apis/stocktake';
import { fetchStockLocations } from '../../../apis/inventory';
import { fetchStorageZones, type StorageZone } from '../../../apis/storage-bin';
import { fetchCollectionsOptimized, type CollectionItem } from '../../../apis/collection';
import { useLocaleStore } from '../../../stores/localeStore';
import { useBinMode } from '../../../composables/useBinMode';

const locale = useLocaleStore();
const { showZone, ensureBinMode } = useBinMode();

const tabs = [
  { key: 'all', label: 'stocktake.board.tabAll' },
  { key: 'COUNTING', label: 'stocktake.board.tabCounting' },
  { key: 'COUNTED', label: 'stocktake.board.tabToPost' },
  { key: 'closed', label: 'stocktake.board.tabClosed' },
] as const;

const tab = ref<string>('all');
const tasks = ref<StocktakeTask[]>([]);
const loading = ref(false);

const locations = ref<Array<{ id: string; name: string }>>([]);
const locNames = ref<string[]>([]);
const locIdx = ref(-1);
const locId = ref('');
const curLocName = ref('');

const formVisible = ref(false);
const submitting = ref(false);
const formLocIdx = ref(-1);
const formLocName = ref('');
const formZones = ref<StorageZone[]>([]);
const formCats = ref<CollectionItem[]>([]);
const pickedZones = ref<number[]>([]);
const pickedCats = ref<number[]>([]);
const form = ref({ name: '', activityCode: '', variantIds: '', includeZeroBook: false, autoSplitByZone: true });

// 分组：有活动码 → 按活动码；无 → 归「未分组」
const groups = computed(() => {
  const map = new Map<string, StocktakeTask[]>();
  for (const t of tasks.value) {
    const k = t.activityCode || '__none__';
    const arr = map.get(k);
    if (arr) arr.push(t);
    else map.set(k, [t]);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: key === '__none__'
      ? locale.t('stocktake.board.activityNone')
      : locale.t('stocktake.board.activityGroup').replace('{code}', key),
    items,
  }));
});

async function reload() {
  loading.value = true;
  try {
    // 「已结束」需同时含 POSTED 与 CANCELLED，而服务端 state 只支持单值等值过滤，
    // 故该 Tab 不下发 state，改由前端按终态收敛（见计划偏差记录）。
    const serverState = tab.value === 'all' || tab.value === 'closed' ? undefined : tab.value;
    const r = await fetchStocktakeTasks({
      page: 1,
      pageSize: 50,
      state: serverState,
      stockLocationId: locId.value || undefined,
    });
    tasks.value = tab.value === 'closed'
      ? r.items.filter((t) => t.state === 'POSTED' || t.state === 'CANCELLED')
      : r.items;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function switchTab(k: string) {
  tab.value = k;
  reload();
}

function onLocChange(e: any) {
  locIdx.value = Number(e.detail.value);
  const hit = locations.value[locIdx.value];
  locId.value = hit ? String(hit.id) : '';
  curLocName.value = hit?.name ?? '';
  reload();
}

function clearLoc() {
  locIdx.value = -1;
  locId.value = '';
  curLocName.value = '';
  reload();
}

function goTask(id: string) {
  uni.navigateTo({ url: `/pages/inventory/stocktake/task?id=${id}` });
}

async function openForm() {
  formVisible.value = true;
  if (!locations.value.length) {
    locations.value = await fetchStockLocations();
    locNames.value = locations.value.map((l) => l.name);
  }
  if (showZone.value && !formZones.value.length) {
    try {
      // 库区按仓库取；仓库未选时先不取，选仓后 onFormLocChange 再取
      const first = locations.value[0];
      if (first) formZones.value = await fetchStorageZones(String(first.id));
    } catch { formZones.value = []; }
  }
  if (!formCats.value.length) {
    try { formCats.value = await fetchCollectionsOptimized(50); } catch { formCats.value = []; }
  }
}

async function onFormLocChange(e: any) {
  formLocIdx.value = Number(e.detail.value);
  const hit = locations.value[formLocIdx.value];
  formLocName.value = hit?.name ?? '';
  pickedZones.value = [];
  if (showZone.value && hit) {
    try { formZones.value = await fetchStorageZones(String(hit.id)); } catch { formZones.value = []; }
  }
}

function toggleZone(id: number) {
  pickedZones.value = pickedZones.value.includes(id)
    ? pickedZones.value.filter((x) => x !== id)
    : [...pickedZones.value, id];
}

function toggleCat(id: number) {
  pickedCats.value = pickedCats.value.includes(id)
    ? pickedCats.value.filter((x) => x !== id)
    : [...pickedCats.value, id];
}

function parseVariantIds(raw: string): number[] {
  return String(raw || '')
    .split(/[,，\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function onCreate() {
  const hit = locations.value[formLocIdx.value];
  if (!hit) return uni.showToast({ title: locale.t('stocktake.board.formRequireWarehouse'), icon: 'none' });
  if (!form.value.name.trim()) return uni.showToast({ title: locale.t('stocktake.board.formRequireName'), icon: 'none' });
  submitting.value = true;
  try {
    const t = await createStocktakeTask({
      stockLocationId: String(hit.id),
      name: form.value.name.trim(),
      activityCode: form.value.activityCode.trim() || null,
      scope: {
        zones: showZone.value ? pickedZones.value : [],
        categoryIds: pickedCats.value,
        variantIds: parseVariantIds(form.value.variantIds),
        includeZeroBook: form.value.includeZeroBook,
      },
      autoSplitByZone: showZone.value ? form.value.autoSplitByZone : false,
    });
    uni.showToast({
      title: locale.t('stocktake.board.createDone').replace('{code}', t.code).replace('{waves}', String(t.waveCount)),
      icon: 'none',
    });
    formVisible.value = false;
    form.value = { name: '', activityCode: '', variantIds: '', includeZeroBook: false, autoSplitByZone: true };
    pickedZones.value = [];
    pickedCats.value = [];
    await reload();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.createFailed'), icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onShow(async () => {
  await ensureBinMode();
  if (!locations.value.length) {
    try {
      locations.value = await fetchStockLocations();
      locNames.value = locations.value.map((l) => l.name);
    } catch { /* 仓库列表失败不阻塞任务列表 */ }
  }
  await reload();
});

onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 200rpx; }
.tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 16rpx;
  .tb { flex: 1; text-align: center; padding: 16rpx 0; border-radius: $wa-radius;
    &.on { background: $wa-accent; .tl { color: #fff; } }
    .tl { font-size: 26rpx; color: $wa-ink; }
  }
}
.filter { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 16rpx;
  .picker { font-size: 27rpx; color: $wa-ink; }
  .clear { margin-left: auto; font-size: 28rpx; color: $wa-muted; padding: 0 8rpx; }
}
.group { margin-bottom: 24rpx;
  .gh { display: block; font-size: 24rpx; color: $wa-muted; margin: 0 0 12rpx 8rpx; }
}
.more, .empty { text-align: center; font-size: 26rpx; color: $wa-muted; padding: 80rpx 0; }
.fab { position: fixed; right: 32rpx; bottom: calc(40rpx + env(safe-area-inset-bottom)); background: $wa-accent; color: #fff;
  font-size: 27rpx; padding: 20rpx 32rpx; border-radius: 40rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15);
}
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
  .submit { margin-top: 12rpx; background: $wa-accent; color: #fff; font-size: 30rpx; border-radius: $wa-radius; }
}
</style>
<template>
  <view class="page">
    <view v-if="!canCount" class="warn">{{ $t('stocktake.board.noPermission') }}</view>

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

    <view v-if="tasks.length" class="footnote">{{ $t('stocktake.board.loadedOf').replace('{loaded}', String(tasks.length)).replace('{total}', String(totalItems)) }}</view>
    <view v-if="loadingMore" class="more">{{ $t('stocktake.board.loadingMore') }}</view>
    <view v-else-if="tasks.length && tasks.length >= totalItems" class="more">{{ $t('stocktake.board.noMore') }}</view>

    <view v-if="loading && !tasks.length" class="more">{{ $t('stocktake.board.loading') }}</view>
    <view v-else-if="!tasks.length" class="empty">{{ $t('stocktake.board.empty') }}</view>

    <!-- ④ 新建任务浮动按钮（无 StocktakeCount 置灰不可点） -->
    <view class="fab" :class="{ dis: !canCount }" @tap="openForm">＋ {{ $t('stocktake.board.newTask') }}</view>

    <!-- ⑤ 新建任务：双动作（存草稿 / 创建并发布），表单已抽成组件 -->
    <TaskFormSheet :visible="formVisible" mode="create" @close="formVisible = false" @saved="onFormSaved" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import TaskCard from '../../../components/stocktake/TaskCard.vue';
import TaskFormSheet from '../../../components/stocktake/TaskFormSheet.vue';
import { fetchStocktakeTasks, type StocktakeTask } from '../../../apis/stocktake';
import { fetchStockLocations } from '../../../apis/inventory';
import { useLocaleStore } from '../../../stores/localeStore';
import { useAuthStore } from '../../../stores/authStore';
import { useBinMode } from '../../../composables/useBinMode';

const locale = useLocaleStore();
const auth = useAuthStore();
const { ensureBinMode } = useBinMode();

/** 能盘权限（规格 §9）：无 `StocktakeCount` 只能看看板，建任务按钮置灰 */
const canCount = computed(() => auth.isSuperAdmin || auth.hasPermission('StocktakeCount'));

const tabs = [
  { key: 'all', label: 'stocktake.board.tabAll' },
  { key: 'DRAFT', label: 'stocktake.board.tabDraft' },
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
const page = ref(1);
const totalItems = ref(0);
const loadingMore = ref(false);

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

/** 页签 → 服务端状态过滤（规格 §3.1：「已结束」必须下发多值，否则分页串页） */
function serverStateFilter(): { state?: string; states?: string[] } {
  if (tab.value === 'closed') return { states: ['POSTED', 'CANCELLED'] };
  if (tab.value === 'all') return {};
  return { state: tab.value };
}

async function reload() {
  loading.value = true;
  page.value = 1;
  try {
    const r = await fetchStocktakeTasks({
      page: 1, pageSize: 50, ...serverStateFilter(), stockLocationId: locId.value || undefined,
    });
    tasks.value = r.items;
    totalItems.value = r.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

/** 触底追加下一页（规格 §8.1）：不重置已有列表；加载中上锁防重复请求 */
async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (tasks.value.length >= totalItems.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const r = await fetchStocktakeTasks({
      page: next, pageSize: 50, ...serverStateFilter(), stockLocationId: locId.value || undefined,
    });
    const seen = new Set(tasks.value.map((t) => String(t.id)));
    tasks.value = [...tasks.value, ...r.items.filter((t) => !seen.has(String(t.id)))];
    totalItems.value = r.totalItems;
    page.value = next;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('stocktake.board.loadFailed'), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function switchTab(k: string) {
  tab.value = k;
  reload();
}

/** 表单组件回调：草稿或已发布都只需刷新列表 */
async function onFormSaved() {
  formVisible.value = false;
  await reload();
}

onReachBottom(() => { void loadMore(); });

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
  if (!canCount.value) return;   // 无能盘权限：浮动按钮已置灰，双保险不打开表单
  formVisible.value = true;
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
  &.dis { opacity: .5; }
}
.warn { font-size: 24rpx; color: $wa-danger; margin: 0 0 16rpx 8rpx; }
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
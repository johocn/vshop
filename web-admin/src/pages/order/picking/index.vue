<template>
  <view class="page">
    <!-- ① 三 Tab（计数取自服务端 totalItems） -->
    <view class="tabs">
      <view class="tb" :class="{ on: tab === 'pending' }" @tap="switchTab('pending')">
        <text class="tl">{{ $t('orderAdmin.picking.tabPending') }}</text>
        <text class="tn">{{ pendingCount }}</text>
      </view>
      <view class="tb" :class="{ on: tab === 'active' }" @tap="switchTab('active')">
        <text class="tl">{{ $t('orderAdmin.picking.tabActive') }}</text>
        <text class="tn">{{ activeCount }}</text>
      </view>
      <view class="tb" :class="{ on: tab === 'done' }" @tap="switchTab('done')">
        <text class="tl">{{ $t('orderAdmin.picking.tabDone') }}</text>
        <text class="tn">{{ doneCount }}</text>
      </view>
    </view>

    <!-- ② 待发货：候选订单列表（带就近仓推荐，可勾选） -->
    <template v-if="tab === 'pending'">
      <CandidateOrderRow
        v-for="c in candidates"
        :key="c.id"
        :row="c"
        :selected="!!selected[c.id]"
        :warehouse-name="locName(c.recommendedStockLocationId)"
        @toggle="toggle(c)"
      />
      <view v-if="loading && !candidates.length" class="more">{{ $t('orderAdmin.picking.loading') }}</view>
      <view v-else-if="!candidates.length" class="empty">
        <text class="et">{{ $t('orderAdmin.picking.emptyCandidates') }}</text>
        <text class="eb" @tap="goOrderList">{{ $t('orderAdmin.picking.goOrderList') }} ›</text>
      </view>
    </template>

    <!-- ③ 进行中 / 已完成：批次卡片 -->
    <template v-else>
      <PickBatchCard
        v-for="b in visibleBatches"
        :key="b.id"
        :batch="b"
        :warehouse-name="locName(b.stockLocationId)"
        @open="goBatch(b.id)"
      />
      <view v-if="loading && !visibleBatches.length" class="more">{{ $t('orderAdmin.picking.loading') }}</view>
      <view v-else-if="!visibleBatches.length" class="empty">
        <text class="et">{{ tab === 'active' ? $t('orderAdmin.picking.emptyActive') : $t('orderAdmin.picking.emptyDone') }}</text>
      </view>
    </template>

    <!-- ④ 底部固定条（仅待发货 Tab 且有勾选时出现） -->
    <view v-if="tab === 'pending' && checkedRows.length" class="bulk">
      <text class="btxt" @tap="clearSel">
        {{ $t('orderAdmin.picking.selectedSummary').replace('{orders}', String(checkedRows.length)).replace('{items}', String(totalItems)) }}
      </text>
      <text class="b" @tap="openPicker">{{ $t('orderAdmin.picking.newBatch') }}</text>
    </view>

    <WarehousePicker
      :visible="pickerVisible"
      :locations="locations"
      :recommended-id="pickerRecommendedId"
      :distance-km="pickerDistanceKm"
      :submitting="submitting"
      @close="pickerVisible = false"
      @confirm="onConfirmBatch"
    />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import CandidateOrderRow from '../../../components/picking/CandidateOrderRow.vue';
import PickBatchCard from '../../../components/picking/PickBatchCard.vue';
import WarehousePicker from '../../../components/picking/WarehousePicker.vue';
import { createPickBatch, fetchPickBatchCandidates, fetchPickBatches, type PickBatch, type PickOrderSnapshot } from '../../../apis/picking';
import { fetchStockLocations, type StockLocationRow } from '../../../apis/inventory';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const PAGE = 12;

const tab = ref<'pending' | 'active' | 'done'>('pending');
const selected = ref<Record<string, boolean>>({});
const candidates = ref<PickOrderSnapshot[]>([]);
const activeBatches = ref<PickBatch[]>([]);
const doneBatches = ref<PickBatch[]>([]);
const pendingCount = ref(0);
const activeCount = ref(0);
const doneCount = ref(0);
const locations = ref<StockLocationRow[]>([]);
const loading = ref(false);
const submitting = ref(false);
const pickerVisible = ref(false);
let seq = 0; // 竞态守卫：过期响应直接丢弃

const checkedRows = computed(() => candidates.value.filter((c) => selected.value[c.id]));
// 件数取候选快照的 itemCount（服务端已算好，前端不重复数行）
const totalItems = computed(() => checkedRows.value.reduce((n, c) => n + (c.itemCount || 0), 0));
const visibleBatches = computed(() => (tab.value === 'active' ? activeBatches.value : doneBatches.value));

// 推荐仓只在「所有已勾选订单推荐同一仓」时才作为默认值，否则要求人工选择（避免把不同区的单塞进错仓）
const sameRecommendation = computed(() => {
  const recs = checkedRows.value.map((c) => c.recommendedStockLocationId);
  if (!recs.length || !recs[0]) return null;
  return recs.every((r) => r && String(r) === String(recs[0])) ? String(recs[0]) : null;
});
const pickerRecommendedId = computed(() => sameRecommendation.value);
const pickerDistanceKm = computed(() => (sameRecommendation.value ? checkedRows.value[0]?.distanceKm ?? null : null));

function locName(id?: string | number | null): string {
  if (id === null || id === undefined || id === '') return '';
  const hit = locations.value.find((l) => String(l.id) === String(id));
  return hit?.name ?? String(id);
}

function byCreatedDesc(a: PickBatch, b: PickBatch): number {
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

// ---- 加载 ----
async function load(): Promise<void> {
  const my = ++seq;
  loading.value = true;
  try {
    // 三 Tab 数据一次拉齐：候选 1 次 + 进行中 6 态 + 已完成 2 态（pageSize 小，后台场景可接受）
    // 分组口径随状态机扩展：SHIPPED 已非终态（待交接），与 HANDOVER / EXCEPTION 同属「进行中」；
    // 终态只有 REVIEWED / CANCELLED（否则这两种批次的卡片在列表里无处可达）
    const [cand, p, k, r, s, h, ex, v, c] = await Promise.all([
      fetchPickBatchCandidates({ page: 1, pageSize: PAGE }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'PENDING' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'PICKED' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'PRINTED' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'SHIPPED' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'HANDOVER' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'EXCEPTION' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'REVIEWED' }),
      fetchPickBatches({ page: 1, pageSize: PAGE, state: 'CANCELLED' }),
    ]);
    if (my !== seq) return;
    candidates.value = cand.items;
    pendingCount.value = cand.totalItems;
    activeBatches.value = [...p.items, ...k.items, ...r.items, ...s.items, ...h.items, ...ex.items].sort(byCreatedDesc);
    activeCount.value =
      p.totalItems + k.totalItems + r.totalItems + s.totalItems + h.totalItems + ex.totalItems;
    doneBatches.value = [...v.items, ...c.items].sort(byCreatedDesc);
    doneCount.value = v.totalItems + c.totalItems;
    // 勾选的订单若已不在候选池（被别的会话加入批次）→ 清掉，避免提交时才报冲突
    const alive = new Set(candidates.value.map((x) => x.id));
    const next: Record<string, boolean> = {};
    for (const id of Object.keys(selected.value)) if (alive.has(id)) next[id] = true;
    selected.value = next;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.loadFailed'), icon: 'none' });
  } finally {
    if (my === seq) loading.value = false;
  }
}

async function loadLocations(): Promise<void> {
  try {
    locations.value = await fetchStockLocations();
  } catch (_e) {
    // 仓名查不到只影响展示文案，不阻塞主流程
    locations.value = [];
  }
}

// ---- 交互 ----
function switchTab(t: 'pending' | 'active' | 'done'): void {
  tab.value = t;
}
function toggle(row: PickOrderSnapshot): void {
  if (row.inBatchId) return; // 已在批次内的订单不可再选（服务端同样拒绝）
  const next = { ...selected.value };
  if (next[row.id]) delete next[row.id];
  else next[row.id] = true;
  selected.value = next;
}
function clearSel(): void {
  selected.value = {};
}
function goOrderList(): void {
  uni.navigateTo({ url: '/pages/order/list/index' });
}
function goBatch(id: string): void {
  uni.navigateTo({ url: `/pages/order/picking/batch?id=${id}` });
}
function openPicker(): void {
  if (!checkedRows.value.length) {
    uni.showToast({ title: locale.t('orderAdmin.picking.noSelect'), icon: 'none' });
    return;
  }
  pickerVisible.value = true;
}

// ---- 新建批次 ----
async function onConfirmBatch(stockLocationId: string): Promise<void> {
  if (!stockLocationId || submitting.value) return;
  submitting.value = true;
  try {
    const batch = await createPickBatch({
      stockLocationId,
      orderIds: checkedRows.value.map((c) => c.id),
    });
    pickerVisible.value = false;
    selected.value = {};
    uni.showToast({
      title: locale.t('orderAdmin.picking.created').replace('{code}', batch.code),
      icon: 'success',
    });
    tab.value = 'active';
    await load();
  } catch (e: any) {
    // 冲突（订单已在别的批次）/ 无预留：展示后端原因原文，不静默；抽屉保持打开便于改仓重试
    uni.showToast({
      title: e?.message || locale.t('orderAdmin.picking.createFailed'),
      icon: 'none',
      duration: 3000,
    });
  } finally {
    submitting.value = false;
  }
}

// ---- 生命周期 ----
onLoad(() => {
  void loadLocations();
  void load();
});

// 从批次详情返回时刷新（首次由 onLoad 负责，避免重复请求）
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void load();
});

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  .tabs {
    display: flex;
    background: $wa-card;
    border-radius: $wa-radius;
    padding: 8rpx;
    margin-bottom: 20rpx;

    .tb {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8rpx;
      padding: 16rpx 0;
      border-radius: 8rpx;

      .tl { font-size: 26rpx; color: $wa-muted; }
      .tn { font-size: 22rpx; color: $wa-muted; }

      &.on { background: $wa-accent;
        .tl, .tn { color: #fff; }
      }
    }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 40rpx 0; }
  .empty { text-align: center; padding: 100rpx 0;
    .et { display: block; color: $wa-muted; font-size: 28rpx; }
    .eb { display: inline-block; margin-top: 24rpx; font-size: 26rpx; color: $wa-accent; }
  }

  /* 底部固定条：无底部导航栏，故直接贴底 + 安全区 */
  .bulk {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
    background: $wa-ink;

    .btxt { flex: 1; font-size: 24rpx; color: #fff; }
    .b { font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 14rpx 28rpx; }
  }
}
</style>
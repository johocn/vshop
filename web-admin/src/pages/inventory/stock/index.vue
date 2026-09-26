<template>
  <view class="page">
    <!-- ① 概览 6 卡（缺货/低库存可点 = 按分桶筛选） -->
    <InventoryKpiBar :summary="summary" @pick="onKpiPick" />

    <!-- ② 桌面态操作行（≥768px 显示，与 mockup 桌面态一致） -->
    <view class="dacts">
      <text class="da" @tap="goRules">{{ $t('inventoryStock.alertRulesBtn') }}</text>
      <text class="da" @tap="goDocs">{{ $t('inventoryStock.docCenterBtn') }}</text>
    </view>

    <!-- ③ 仓库胶囊 + 搜索 + 排序 + 状态 tabs -->
    <InventoryFilterBar
      :locations="locOptions"
      :location-id="locationId"
      :keyword="keyword"
      :sort="sort"
      :bucket="bucket"
      :buckets="buckets"
      @location="onLocation"
      @search="onSearch"
      @sort="onSort"
      @bucket-change="onBucket"
    />

    <!-- ④ 快捷宫格 9 项 -->
    <view class="grid">
      <view v-for="q in QUICK" :key="q.key" class="g" @tap="go(q.url)">
        <text class="gi">{{ q.icon }}</text>
        <text class="gt">{{ $t('inventoryStock.quick.' + q.key) }}</text>
      </view>
    </view>

    <!-- ⑤ 明细列表 -->
    <view class="sec">
      <text class="sh">{{ $t('inventoryStock.detailTitle') }}</text>
      <text class="sp"></text>
      <text class="cnt">{{ totalItems }} · {{ $t('inventoryStock.sortLabel') }} {{ $t('inventoryStock.' + sortKey(sort)) }}</text>
    </view>

    <view class="list">
      <InventoryStockCard
        v-for="r in items"
        :key="r.variantId"
        :row="r"
        :selected="!!selected[r.variantId]"
        @toggle="onToggle(r)"
        @open-movements="onOpenMovements(r)"
        @replenish="onReplenish(r)"
        @adjust="onAdjust(r)"
      />
    </view>

    <view v-if="loading || loadingMore" class="more">{{ $t('inventoryStock.loadingMore') }}</view>
    <view v-else-if="finished && items.length" class="more">{{ $t('inventoryStock.noMore') }}</view>
    <view v-if="!items.length && !loading" class="empty">
      {{ hasFilter ? $t('inventoryStock.empty.noMatch') : $t('inventoryStock.empty.noData') }}
    </view>

    <!-- ⑥ 批量条（有勾选时出现；点左侧数字清空勾选） -->
    <view v-if="checkedRows.length" class="bulk">
      <text class="btxt" @tap="clearSel">{{ $t('inventoryStock.bulk.selected').replace('{n}', String(checkedRows.length)) }}</text>
      <text class="b ghost" @tap="onBulkSafety">{{ $t('inventoryStock.bulk.setSafety') }}</text>
      <text class="b" :class="{ dis: generating }" @tap="onBulkPurchase">
        {{ $t('inventoryStock.bulk.genPurchase') }}
      </text>
    </view>

    <!-- 调整库存弹层（走盘库单单据 STOCKTAKE：绝对值设置 + 留痕，见 D42） -->
    <view v-if="adjustRow" class="mask" @tap="closeAdjust">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('inventoryStock.adjust.title') }}</text>
        <text class="sname">{{ adjustRow.variantName || adjustRow.sku }}</text>
        <view class="frow">
          <text class="fl">{{ $t('inventoryStock.adjust.target') }}</text>
          <input class="inp" type="number" :value="adjustQty" :placeholder="$t('inventoryStock.adjust.placeholder')" @input="onAdjustInput" />
        </view>
        <view class="sbtns">
          <text class="sbtn ghost" @tap="closeAdjust">{{ $t('inventoryStock.sheetCancel') }}</text>
          <text class="sbtn" :class="{ dis: adjusting }" @tap="onConfirmAdjust">{{ $t('inventoryStock.adjust.confirm') }}</text>
        </view>
      </view>
    </view>

    <!-- 批量设安全库存弹层 -->
    <view v-if="safetyVisible" class="mask" @tap="closeSafety">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('inventoryStock.safety.title') }}</text>
        <text class="sname">{{ $t('inventoryStock.bulk.selected').replace('{n}', String(checkedRows.length)) }}</text>
        <view class="frow">
          <text class="fl">{{ $t('inventoryStock.safety.title') }}</text>
          <input class="inp" type="number" :value="safetyValue" :placeholder="$t('inventoryStock.safety.placeholder')" @input="onSafetyInput" />
        </view>
        <view class="sbtns">
          <text class="sbtn ghost" @tap="closeSafety">{{ $t('inventoryStock.sheetCancel') }}</text>
          <text class="sbtn" :class="{ dis: savingSafety }" @tap="onConfirmSafety">{{ $t('inventoryStock.safety.confirm') }}</text>
        </view>
      </view>
    </view>

    <view style="height: 200rpx" />
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import InventoryKpiBar from '../../../components/inventory/InventoryKpiBar.vue';
import InventoryStockCard from '../../../components/inventory/InventoryStockCard.vue';
import InventoryFilterBar from '../../../components/inventory/InventoryFilterBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchInventoryStockPage,
  fetchTenantInventoryOverview,
  saveInventoryAlertRules,
  type InventoryStockRow,
  type InventoryStockSummary,
  type TenantStockLocation,
} from '../../../apis/inventory';
import { createStockDoc } from '../../../apis/stock-doc';
import { parseQtyInput, sortKey, suggestQty } from '../../../utils/inventoryFormat';

const locale = useLocaleStore();

const PAGE = 20;
const EMPTY_SUMMARY: InventoryStockSummary = {
  skuCount: 0, onHandTotal: 0, allocatedTotal: 0, availableTotal: 0, valueTotal: 0,
  outCount: 0, lowCount: 0, okCount: 0, outbound7d: 0,
};

// 快捷宫格 9 项（契约 1.5 `quick.*` / 契约 1.6 路由）
const QUICK: Array<{ key: string; icon: string; url: string }> = [
  { key: 'purchase', icon: '📥', url: '/pages/inventory/stock-doc/purchase/index' },
  { key: 'transfer', icon: '🔀', url: '/pages/inventory/stock-doc/transfer/index' },
  { key: 'stocktake', icon: '🧮', url: '/pages/inventory/stock-doc/stocktake/index' },
  { key: 'issue', icon: '📤', url: '/pages/inventory/stock-doc/issue/index' },
  { key: 'movements', icon: '🧾', url: '/pages/inventory/movements/index' },
  { key: 'locations', icon: '🏬', url: '/pages/inventory/locations/index' },
  { key: 'rules', icon: '🔔', url: '/pages/inventory/alert-rules/index' },
  { key: 'docs', icon: '📦', url: '/pages/inventory/stock-doc/index' },
  { key: 'reservation', icon: '🔒', url: '/pages/inventory/reservation/index' },
];

// ---- 页面状态 ----
const locations = ref<TenantStockLocation[]>([]);
// 补货/调整/批量采购的兜底目标仓：默认物理仓 → 虚拟仓 → 第一个仓。
// 纯虚拟库存模式的店铺（physicalStockEnabled=false，如 t2）没有物理仓，其库存就落在虚拟仓，
// 用空值会导致批量条直接弹「失败」而不发请求（线上实测）。
const defaultTargetId = ref('');
const locationId = ref('');
const keyword = ref('');
const sort = ref('stockAsc');
const bucket = ref('');
const summary = ref<InventoryStockSummary>({ ...EMPTY_SUMMARY });
const items = ref<InventoryStockRow[]>([]);
const totalItems = ref(0);
const selected = ref<Record<string, boolean>>({});
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const finished = ref(false);
let seq = 0; // 竞态守卫：过期响应直接丢弃

// 仓库选项 = 全部仓 + 本租户仓（虚拟仓也在列，与 spec §3.2.1 一致）
const locOptions = computed(() => [
  { id: '', name: locale.t('inventoryStock.allLocations') },
  ...locations.value.map((l) => ({ id: l.id, name: l.name })),
]);

// tabs 计数取服务端 summary（不带 bucket 的分桶计数），随「仓库 + 关键词」变化
const buckets = computed(() => ({
  all: summary.value.skuCount,
  out: summary.value.outCount,
  low: summary.value.lowCount,
  ok: summary.value.okCount,
}));

const hasFilter = computed(() => !!keyword.value || !!bucket.value);
const checkedRows = computed(() => items.value.filter((r) => selected.value[r.variantId]));

const generating = ref(false);
const adjusting = ref(false);
const savingSafety = ref(false);
const adjustRow = ref<InventoryStockRow | null>(null);
const adjustQty = ref('');
const safetyVisible = ref(false);
const safetyValue = ref('');

// ---- 请求编排 ----
async function load(reset = true): Promise<void> {
  const my = ++seq;
  const target = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const res = await fetchInventoryStockPage({
      locationId: locationId.value || null,
      keyword: keyword.value || undefined, // 空串不传，避免后端把空串当 LIKE 条件（spec §4）
      bucket: bucket.value || undefined,
      sort: sort.value,
      page: target,
      pageSize: PAGE,
    });
    if (my !== seq) return; // 旧响应丢弃
    page.value = target;
    summary.value = res.summary;
    totalItems.value = res.totalItems;
    items.value = reset ? res.items : items.value.concat(res.items);
    finished.value = items.value.length >= res.totalItems;
  } catch (e: any) {
    if (my !== seq) return;
    // spec §4：失败弹 Toast 且保留上次结果，不清空列表
    uni.showToast({
      title: e?.message || (keyword.value ? locale.t('inventoryStock.searchFailed') : locale.t('inventoryStock.loadFailed')),
      icon: 'none',
    });
  } finally {
    if (my === seq) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || finished.value) return;
  await load(false);
}

function applyFilter(): void {
  selected.value = {}; // 条件变了，勾选可能已不在结果集内
  void load(true);
}

function onLocation(id: string): void {
  locationId.value = id;
  applyFilter();
}
function onSearch(kw: string): void {
  keyword.value = kw;
  applyFilter();
}
function onSort(key: string): void {
  sort.value = key;
  applyFilter();
}
function onBucket(key: string): void {
  bucket.value = key;
  applyFilter();
}
// KPI 卡点击：缺货/低库存 → 对应分桶；其余卡 emit '' → 回到全部
function onKpiPick(b: string): void {
  bucket.value = b;
  applyFilter();
}

// ---- 列表交互 ----
function onToggle(row: InventoryStockRow): void {
  if (row.bucket === 'ok') return; // 仅缺货/低库存参与批量操作（spec §3.2.1）
  const next = { ...selected.value };
  if (next[row.variantId]) delete next[row.variantId];
  else next[row.variantId] = true;
  selected.value = next;
}
function clearSel(): void {
  selected.value = {};
}
function go(url: string): void {
  uni.navigateTo({ url });
}
function goRules(): void {
  uni.navigateTo({ url: '/pages/inventory/alert-rules/index' });
}
function goDocs(): void {
  uni.navigateTo({ url: '/pages/inventory/stock-doc/index' });
}
function onOpenMovements(row: InventoryStockRow): void {
  uni.navigateTo({ url: `/pages/inventory/movements/index?productVariantId=${row.variantId}` });
}
function onReplenish(row: InventoryStockRow): void {
  const locId = row.stockLocationId || defaultTargetId.value;
  const qty = Math.max(1, suggestQty(row.safetyStock, row.onHand));
  uni.navigateTo({ url: `/pages/inventory/stock-doc/purchase/index?variantId=${row.variantId}&qty=${qty}&locationId=${locId}` });
}
function onAdjust(row: InventoryStockRow): void {
  adjustRow.value = row;
  adjustQty.value = String(row.onHand);
}
function onAdjustInput(e: any): void {
  adjustQty.value = e?.detail?.value ?? '';
}
function onSafetyInput(e: any): void {
  safetyValue.value = e?.detail?.value ?? '';
}
function closeAdjust(): void {
  adjustRow.value = null;
}
function closeSafety(): void {
  safetyVisible.value = false;
}

// ---- 批量生成采购入库单 ----
async function onBulkPurchase(): Promise<void> {
  const rows = checkedRows.value;
  if (!rows.length) {
    uni.showToast({ title: locale.t('inventoryStock.bulk.noSelect'), icon: 'none' });
    return;
  }
  if (generating.value) return;
  const fallback = defaultTargetId.value;
  const lines = rows.map((r) => ({
    variantId: r.variantId,
    toStockLocationId: r.stockLocationId || fallback, // 「全部仓」聚合态行无仓号 → 回落本店兜底仓（物理仓/虚拟仓）
    // 建议量 = 安全库存 − 现存，且至少 1（safetyStock=0 的缺货行也能补货）
    qty: Math.max(1, suggestQty(r.safetyStock, r.onHand)),
  }));
  if (!lines.every((l) => !!l.toStockLocationId)) {
    uni.showToast({ title: locale.t('inventoryStock.noTargetLocation'), icon: 'none' });
    return;
  }
  generating.value = true;
  try {
    const doc = await createStockDoc({ type: 'PURCHASE', items: lines });
    uni.showToast({ title: locale.t('inventoryStock.bulk.genDone').replace('{code}', doc.code), icon: 'success' });
    selected.value = {};
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.bulk.genFailed'), icon: 'none' });
  } finally {
    generating.value = false;
  }
}

// ---- 调整库存（走盘库单单据：绝对值设置 + 留痕，见 D42）----
// 不走核心 setVariantStock（@Allow(ViewStock)，租户管理员恒 403）；
// 改走 cjk-plugin createStockDoc(type: 'STOCKTAKE')：服务端取 realQty ?? qty 作目标库存绝对值，
// 落 StockDoc 单据 + OrderStockLedger 流水，可审计、可在单据中心回查。
async function onConfirmAdjust(): Promise<void> {
  const row = adjustRow.value;
  if (!row) return;
  const target = parseQtyInput(adjustQty.value, -1);
  if (target < 0) {
    uni.showToast({ title: locale.t('inventoryStock.adjust.invalid'), icon: 'none' });
    return;
  }
  const locId = row.stockLocationId || defaultTargetId.value;
  if (!locId) {
    uni.showToast({ title: locale.t('inventoryStock.noTargetLocation'), icon: 'none' });
    return;
  }
  if (adjusting.value) return;
  adjusting.value = true;
  try {
    const doc = await createStockDoc({
      type: 'STOCKTAKE',
      remark: locale.t('inventoryStock.adjust.remark'),
      // qty 为 schema 必填，realQty 覆盖为盘点实存（服务端取 realQty ?? qty 作目标存量）
      items: [{ variantId: row.variantId, toStockLocationId: locId, qty: target, realQty: target }],
    });
    adjustRow.value = null;
    uni.showToast({
      title: locale.t('inventoryStock.adjust.done').replace('{code}', doc.code),
      icon: 'success',
    });
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.adjust.failed'), icon: 'none' });
  } finally {
    adjusting.value = false;
  }
}

// ---- 批量设安全库存 ----
function onBulkSafety(): void {
  if (!checkedRows.value.length) {
    uni.showToast({ title: locale.t('inventoryStock.bulk.noSelect'), icon: 'none' });
    return;
  }
  safetyValue.value = String(checkedRows.value[0].safetyStock);
  safetyVisible.value = true;
}
function onConfirmSafety(): void {
  const v = parseQtyInput(safetyValue.value, -1);
  if (v < 0) {
    uni.showToast({ title: locale.t('inventoryStock.safety.invalid'), icon: 'none' });
    return;
  }
  if (v === 0) {
    // spec §4：0 需明确提示「该 SKU 将不再预警」，确认后再落库
    uni.showModal({
      title: locale.t('inventoryStock.safety.title'),
      content: locale.t('inventoryStock.safety.zeroHint'),
      success: (r) => {
        if (r.confirm) void submitSafety(0);
      },
    });
    return;
  }
  void submitSafety(v);
}
async function submitSafety(safetyStock: number): Promise<void> {
  if (savingSafety.value) return;
  savingSafety.value = true;
  try {
    // locationId 为空 = 本 SKU「全仓通用」规则（服务端哨兵 0）；有仓时为该仓覆盖（契约 1.1）
    await saveInventoryAlertRules(
      locationId.value || null,
      checkedRows.value.map((r) => ({ variantId: r.variantId, safetyStock, enabled: safetyStock > 0 })),
    );
    safetyVisible.value = false;
    selected.value = {};
    uni.showToast({ title: locale.t('inventoryStock.safety.done'), icon: 'success' });
    await load(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.safety.failed'), icon: 'none' });
  } finally {
    savingSafety.value = false;
  }
}

// ---- 生命周期 ----
async function init(): Promise<void> {
  try {
    const ov = await fetchTenantInventoryOverview();
    locations.value = ov.locations;
    const firstPhysical = ov.locations.find((l) => l.kind === 'physical' && !l.isSystem)
      ?? ov.locations.find((l) => l.kind === 'physical');
    // 默认选第一个物理仓；无物理仓时退回「全部仓」（spec §3.2.1）
    locationId.value = firstPhysical?.id ?? '';
    // 兜底目标仓：默认物理仓 → 虚拟仓 → 第一个仓（纯虚拟库存模式的店铺只有虚拟仓）
    const virtual = ov.locations.find((l) => l.id === (ov.virtualLocationId ?? ''));
    defaultTargetId.value =
      ov.defaultPhysicalLocationId || firstPhysical?.id || virtual?.id || ov.locations[0]?.id || '';
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryStock.loadFailed'), icon: 'none' });
  }
  await load(true);
}

onLoad(() => {
  void init();
});

// 从采购/调整页返回时刷新（首次由 onLoad 负责，避免重复请求）
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  void load(true);
});

onPullDownRefresh(async () => {
  await load(true);
  uni.stopPullDownRefresh();
});
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx 0;

  /* 桌面态操作行：移动端隐藏（入口在快捷宫格内） */
  .dacts { display: none; }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16rpx;
    margin-bottom: 20rpx;

    .g {
      background: $wa-card;
      border-radius: $wa-radius;
      padding: 20rpx 8rpx;
      display: flex;
      flex-direction: column;
      align-items: center;

      .gi { font-size: 34rpx; line-height: 1.1; }
      .gt { font-size: 20rpx; color: $wa-muted; margin-top: 8rpx; }
    }
  }

  .sec {
    display: flex;
    align-items: center;
    margin: 8rpx 0 16rpx;

    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sp { flex: 1; }
    .cnt { font-size: 22rpx; color: $wa-muted; }
  }

  .more { text-align: center; color: $wa-muted; font-size: 24rpx; padding: 24rpx 0; }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }

  /* 批量条：吸底（无底部导航栏，故直接贴底） */
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
    .b {
      font-size: 24rpx;
      color: #fff;
      background: $wa-accent;
      border-radius: 8rpx;
      padding: 12rpx 24rpx;

      &.ghost { background: rgba(255, 255, 255, 0.16); }
      &.dis { opacity: 0.5; }
    }
  }

  /* 弹层 */
  .mask {
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-end;
    z-index: 20;
  }
  .sheet {
    width: 100%;
    background: $wa-card;
    border-radius: $wa-radius $wa-radius 0 0;
    padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));

    .stitle { display: block; font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .sname { display: block; font-size: 24rpx; color: $wa-muted; margin-top: 8rpx; }
    .frow {
      display: flex;
      align-items: center;
      margin-top: 28rpx;

      .fl { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .inp {
        width: 200rpx;
        text-align: center;
        background: $wa-bg;
        border-radius: $wa-radius;
        padding: 16rpx 20rpx;
        font-size: 28rpx;
        color: $wa-ink;
      }
    }
    .sbtns {
      display: flex;
      gap: 20rpx;
      margin-top: 32rpx;

      .sbtn {
        flex: 1;
        text-align: center;
        font-size: 28rpx;
        color: #fff;
        background: $wa-accent;
        border-radius: $wa-radius;
        padding: 20rpx 0;

        &.ghost { background: transparent; color: $wa-ink; border: 1rpx solid $wa-rule; }
        &.dis { opacity: 0.5; }
      }
    }
  }
}

@media (min-width: 768px) {
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 32px 0;

    .dacts {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 12px;

      .da {
        font-size: 13px;
        color: $wa-ink;
        background: $wa-card;
        border: 1rpx solid $wa-rule;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
      }
    }

    /* 桌面态：同一张明细卡片 2 列网格（卡片已含 mockup 表格全部 11 列信息） */
    .list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
  }
}
</style>
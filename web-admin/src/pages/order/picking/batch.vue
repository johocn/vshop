<template>
  <view class="page">
    <!-- ① 批次信息 -->
    <view v-if="batch" class="card head">
      <view class="h1">
        <text class="code">{{ batch.code }}</text>
        <text class="st" :class="stateClass">{{ $t('orderAdmin.picking.state.' + batch.state) }}</text>
      </view>
      <view class="kv"><text class="k">{{ $t('orderAdmin.picking.targetWarehouse') }}</text><text class="v">{{ warehouseName || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('orderAdmin.picking.batchCounts').replace('{orders}', String(batch.memberCount)).replace('{items}', String(batch.itemCount)) }}</text></view>
      <view class="kv"><text class="k">{{ $t('orderAdmin.picking.createdBy') }}</text><text class="v">{{ batch.createdBy || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('orderAdmin.picking.createdAt') }}</text><text class="v">{{ createdLabel }}</text></view>
      <view v-if="batch.handoverAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.handoverTo') }}</text><text class="v">{{ batch.handoverTo || '—' }}</text></view>
      <view v-if="batch.handoverAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.handoverAt') }}</text><text class="v">{{ fmtAt(batch.handoverAt) }}</text></view>
      <view v-if="batch.reviewedAt" class="kv"><text class="k">{{ $t('orderAdmin.picking.reviewedAt') }}</text><text class="v">{{ fmtAt(batch.reviewedAt) }}</text></view>
      <text v-if="batch.exceptionNote" class="ex">{{ $t('orderAdmin.picking.exceptionNote') }}：{{ batch.exceptionNote }}</text>
      <text v-if="batch.note" class="note">{{ batch.note }}</text>
    </view>

    <!-- ② 拣货汇总 / 库位路径（off / zone / bin 三档门控，唯一判定入口 useBinMode） -->
    <view class="sec">
      <text class="sh">{{ $t('orderAdmin.picking.pickSummary') }}</text>
      <text class="sc">{{ rows.length }}</text>
    </view>
    <view class="card">
      <view v-for="g in groups" :key="g.key" class="grp">
        <text v-if="g.label" class="gh">{{ g.label }}</text>
        <view v-for="r in g.rows" :key="g.key + r.sku" class="prow">
          <text v-if="showBin" class="bin">{{ r.binCode || $t('orderAdmin.picking.bin.unassigned') }}</text>
          <view class="pmid">
            <text class="pn">{{ r.name || r.sku }}</text>
            <text class="ps">{{ r.sku }}<text v-if="r.orderCodes.length"> · {{ r.orderCodes.join('/') }}</text></text>
          </view>
          <text class="pq">×{{ r.qty }}</text>
        </view>
      </view>
      <view v-if="!rows.length" class="empty">{{ $t('orderAdmin.picking.emptyPicking') }}</view>
    </view>

    <!-- ③ 发货失败清单：逐条展示（不静默），失败时批次保持原状态 -->
    <view v-if="fails.length" class="card fail">
      <text class="fh">{{ $t('orderAdmin.picking.shipFailTitle') }}</text>
      <text v-for="(f, i) in fails" :key="i" class="fi">{{ f.code || f.orderId }}：{{ f.reason }}</text>
      <text class="fg" @tap="fails = []">{{ $t('orderAdmin.picking.shipFailDismiss') }}</text>
    </view>

    <!-- ④ 成员订单 -->
    <view class="sec">
      <text class="sh">{{ $t('orderAdmin.picking.members') }}</text>
      <text class="sc">{{ members.length }}</text>
      <text v-if="memberEditable && checked.length" class="sa" @tap="removeSelected">
        {{ $t('orderAdmin.picking.removeSelected').replace('{n}', String(checked.length)) }}
      </text>
    </view>
    <BatchMemberRow
      v-for="m in members"
      :key="m.id"
      :member="m"
      :selected="!!selected[m.id]"
      :readonly="!memberEditable"
      :summary="summaryOf(m.code)"
      @toggle="toggle(m)"
      @edit-address="openAddress(m)"
    />

    <!-- ⑤ 打印单据：拣货单按档位渲染库位区域；终态也可重印（单据是记录，不受状态限制） -->
    <view class="card pr">
      <text class="pb" :class="{ dis: !canPrint }" @tap="printPickingList">{{ $t('orderAdmin.picking.print.pickingList') }}</text>
      <text class="pb" :class="{ dis: !canPrint }" @tap="printShippingNote">{{ $t('orderAdmin.picking.print.shippingNote') }}</text>
      <text class="pb" :class="{ dis: !canPrint }" @tap="printParcelLabel">{{ $t('orderAdmin.picking.print.parcelLabel') }}</text>
      <text class="pb" :class="{ dis: !canPrint }" @tap="printBatchOverview">{{ $t('orderAdmin.picking.print.batchOverview') }}</text>
    </view>

    <!-- ⑥ 状态推进 / 交接 / 异常件 / 取消（只读态整块隐藏） -->
    <view v-if="!readonly" class="card acts">
      <text v-if="batch && batch.state === 'PENDING'" class="ab" :class="{ dis: busy }" @tap="advance('PICKED')">
        {{ $t('orderAdmin.picking.markPicked') }}
      </text>
      <text v-if="batch && batch.state === 'PICKED'" class="ab" :class="{ dis: busy }" @tap="advance('PRINTED')">
        {{ $t('orderAdmin.picking.markPrinted') }}
      </text>
      <!-- SHIPPED 之后：交接 / 异常件 -->
      <text v-if="batch && batch.state === 'SHIPPED'" class="ab" :class="{ dis: busy }" @tap="openHandover">
        {{ $t('orderAdmin.picking.doHandover') }}
      </text>
      <text v-if="batch && (batch.state === 'SHIPPED' || batch.state === 'HANDOVER')" class="ab ghost" :class="{ dis: busy }" @tap="openException">
        {{ $t('orderAdmin.picking.registerException') }}
      </text>
      <!-- HANDOVER 之后：复核（异常件处理完也回到 HANDOVER 再复核） -->
      <text v-if="batch && batch.state === 'HANDOVER'" class="ab" :class="{ dis: busy }" @tap="advance('REVIEWED')">
        {{ $t('orderAdmin.picking.doReview') }}
      </text>
      <text v-if="canShip" class="ab ghost" :class="{ dis: busy }" @tap="onCancel">
        {{ $t('orderAdmin.picking.cancelBatch') }}
      </text>
    </view>

    <view v-if="canShip" style="height: 240rpx" />

    <!-- ⑦ 底部固定条：批量发货（仅 PENDING / PICKED / PRINTED 渲染） -->
    <view v-if="canShip" class="bulk">
      <picker class="pk" :range="dispatchOptions" :value="dispatchIdx" @change="dispatchIdx = $event.detail.value">
        <text class="pk-t">{{ dispatchOptions[dispatchIdx] }} ›</text>
      </picker>
      <input class="tk" v-model="tracking" :placeholder="$t('orderAdmin.ship.trackingPlaceholder')" />
      <text class="bb" :class="{ dis: busy }" @tap="onShip">{{ $t('orderAdmin.picking.shipBatch') }}</text>
    </view>

    <!-- 地址编辑抽屉 -->
    <AddressEditSheet
      :visible="addrVisible"
      :order="addrOrder"
      :submitting="busy"
      @close="addrVisible = false"
      @saved="onAddressSaved"
    />

    <!-- 交接登记 -->
    <view v-if="handoverVisible" class="mask" @tap="handoverVisible = false">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('orderAdmin.picking.doHandover') }}</text>
        <input class="inp" v-model="handoverTo" :placeholder="$t('orderAdmin.picking.handoverPlaceholder')" />
        <view class="sbtns">
          <text class="sbtn ghost" @tap="handoverVisible = false">{{ $t('orderAdmin.picking.cancel') }}</text>
          <text class="sbtn" :class="{ dis: busy || !handoverTo.trim() }" @tap="submitHandover">{{ $t('orderAdmin.picking.confirm') }}</text>
        </view>
      </view>
    </view>

    <!-- 异常件登记 -->
    <view v-if="exceptionVisible" class="mask" @tap="exceptionVisible = false">
      <view class="sheet" @tap.stop>
        <text class="stitle">{{ $t('orderAdmin.picking.registerException') }}</text>
        <input class="inp" v-model="exceptionReason" :placeholder="$t('orderAdmin.picking.exceptionPlaceholder')" />
        <view class="sbtns">
          <text class="sbtn ghost" @tap="exceptionVisible = false">{{ $t('orderAdmin.picking.cancel') }}</text>
          <text class="sbtn" :class="{ dis: busy || !exceptionReason.trim() }" @tap="submitException">{{ $t('orderAdmin.picking.confirm') }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import BatchMemberRow from '../../../components/picking/BatchMemberRow.vue';
import AddressEditSheet from '../../../components/picking/AddressEditSheet.vue';
import {
  advancePickBatchState,
  cancelPickBatch,
  fetchPickBatch,
  fetchPickBatchPickingList,
  handoverPickBatch,
  registerPickBatchException,
  removeOrdersFromPickBatch,
  shipPickBatch,
  type PickBatch,
  type PickBatchPickingRow,
  type PickOrderSnapshot,
} from '../../../apis/picking';
import { fetchStockLocations } from '../../../apis/inventory';
import { DISPATCH_OPTIONS, dispatchMethod } from '../../../composables/useShipSubmit';
import { ensureBinMode, useBinMode } from '../../../composables/useBinMode';
import { useLocaleStore } from '../../../stores/localeStore';
import { DEFAULT_LABELS, type PrintLabels } from '../../../utils/print/doc-common';
import { openPrintFallback, printHtml } from '../../../utils/print/print-window';
import { renderBatchOverview } from '../../../utils/print/templates/batch-overview';
import { renderParcelLabel } from '../../../utils/print/templates/parcel-label';
import { renderPickingList } from '../../../utils/print/templates/picking-list';
import { renderShippingNote } from '../../../utils/print/templates/shipping-note';

const locale = useLocaleStore();
// 库位三档门控：本项目唯一判定入口，禁止在此另写 if
const { mode, showBin, showZone } = useBinMode();

const batchId = ref('');
const batch = ref<PickBatch | null>(null);
const members = ref<PickOrderSnapshot[]>([]);
const rows = ref<PickBatchPickingRow[]>([]);
const warehouseName = ref('');
const selected = ref<Record<string, boolean>>({});
const fails = ref<Array<{ orderId: string; code: string; reason: string }>>([]);
const busy = ref(false);
const dispatchOptions = DISPATCH_OPTIONS;
const dispatchIdx = ref(0);
const tracking = ref('');
const addrVisible = ref(false);
const addrOrder = ref<PickOrderSnapshot | null>(null);
const handoverVisible = ref(false);
const handoverTo = ref('');
const exceptionVisible = ref(false);
const exceptionReason = ref('');
let seq = 0;

// REVIEWED / CANCELLED 为终态：整页只读（隐藏状态推进/发货/取消，设计 §9）
const readonly = computed(() => batch.value?.state === 'REVIEWED' || batch.value?.state === 'CANCELLED');
// 成员可增删/改地址：服务端只放开 PENDING / PICKED（其余状态即使未终态也不可编辑）
const memberEditable = computed(() => batch.value?.state === 'PENDING' || batch.value?.state === 'PICKED');
// 可发货：服务端放开 PENDING / PICKED / PRINTED（同时管住底部发货条与取消批次）
const canShip = computed(() => !!batch.value && ['PENDING', 'PICKED', 'PRINTED'].includes(String(batch.value.state)));
/** 无批次或批内无订单时不产生空单据 */
const canPrint = computed(() => !!batch.value && members.value.length > 0);

const checked = computed(() => members.value.filter((m) => selected.value[m.id]));

const stateClass = computed(() => {
  switch (batch.value?.state) {
    case 'SHIPPED':
    case 'HANDOVER':
    case 'REVIEWED': return 'ok';
    case 'EXCEPTION': return 'warn';
    case 'CANCELLED': return 'dead';
    case 'PRINTED': return 'ready';
    default: return 'doing';
  }
});

const createdLabel = computed(() => String(batch.value?.createdAt || '').replace('T', ' ').slice(0, 16));

function fmtAt(v?: string | null): string {
  return v ? new Date(v).toLocaleString() : '—';
}

// 拣货汇总分组：off 档不分组（无库位概念）；zone / bin 档按库区分组，排序沿用服务端 pathIndex（不重排）
const groups = computed(() => {
  if (!showZone.value) return [{ key: 'all', label: '', rows: rows.value }];
  const map = new Map<string, PickBatchPickingRow[]>();
  for (const r of rows.value) {
    const key = r.zoneName || r.zoneCode || '__none__';
    const arr = map.get(key) || [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()].map(([key, list]) => ({
    key,
    label: key === '__none__' ? locale.t('orderAdmin.picking.bin.unassigned') : key,
    rows: list,
  }));
});

// 成员行的商品摘要：从拣货汇总行反查该订单涉及的 SKU（汇总行 qty 是批次级，故此处不显示单量）
function summaryOf(orderCode: string): string {
  const names = rows.value.filter((r) => r.orderCodes.includes(orderCode)).map((r) => r.name || r.sku);
  if (!names.length) return '';
  return names.length > 2 ? `${names.slice(0, 2).join('、')} ${locale.t('orderAdmin.picking.andMoreSku').replace('{n}', String(names.length))}` : names.join('、');
}

async function load(): Promise<void> {
  if (!batchId.value) return;
  const my = ++seq;
  try {
    const [b, list] = await Promise.all([
      fetchPickBatch(batchId.value),
      fetchPickBatchPickingList(batchId.value).catch(() => [] as PickBatchPickingRow[]),
    ]);
    if (my !== seq) return;
    batch.value = b;
    members.value = (b?.members ?? []) as PickOrderSnapshot[];
    rows.value = list;
    // 勾选可能已失效（订单被移出），逐次收敛
    const alive = new Set(members.value.map((m) => m.id));
    const next: Record<string, boolean> = {};
    for (const id of Object.keys(selected.value)) if (alive.has(id)) next[id] = true;
    selected.value = next;
  } catch (e: any) {
    if (my !== seq) return;
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.loadFailed'), icon: 'none' });
  }
}

async function loadWarehouse(): Promise<void> {
  try {
    const locs = await fetchStockLocations();
    const hit = locs.find((l) => String(l.id) === String(batch.value?.stockLocationId));
    warehouseName.value = hit?.name ?? '';
  } catch (_e) {
    warehouseName.value = '';
  }
}

// ---- 交互 ----
function toggle(m: PickOrderSnapshot): void {
  if (!memberEditable.value) return;
  const next = { ...selected.value };
  if (next[m.id]) delete next[m.id];
  else next[m.id] = true;
  selected.value = next;
}
function openAddress(m: PickOrderSnapshot): void {
  addrOrder.value = m;
  addrVisible.value = true;
}
async function onAddressSaved(): Promise<void> {
  addrVisible.value = false;
  await load();
}

async function advance(to: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await advancePickBatchState(batchId.value, to);
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.advanceFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

// 交接登记：填交接对象 → SHIPPED 变 HANDOVER
function openHandover(): void {
  if (busy.value) return;
  handoverTo.value = '';
  handoverVisible.value = true;
}
async function submitHandover(): Promise<void> {
  if (busy.value || !handoverTo.value.trim()) return;
  busy.value = true;
  try {
    await handoverPickBatch(batchId.value, handoverTo.value.trim());
    handoverVisible.value = false;
    uni.showToast({ title: locale.t('orderAdmin.picking.handoverDone'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.handoverFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

// 异常件登记：填原因 → EXCEPTION（HANDOVER 下也可登记，处理完再交接回 HANDOVER）
function openException(): void {
  if (busy.value) return;
  exceptionReason.value = batch.value?.exceptionNote ?? '';
  exceptionVisible.value = true;
}
async function submitException(): Promise<void> {
  if (busy.value || !exceptionReason.value.trim()) return;
  busy.value = true;
  try {
    await registerPickBatchException(batchId.value, exceptionReason.value.trim());
    exceptionVisible.value = false;
    uni.showToast({ title: locale.t('orderAdmin.picking.exceptionDone'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.exceptionFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

function onCancel(): void {
  if (busy.value) return;
  uni.showModal({
    title: locale.t('orderAdmin.picking.cancelBatch'),
    content: locale.t('orderAdmin.picking.cancelConfirm').replace('{code}', batch.value?.code || ''),
    success: (r) => {
      if (r.confirm) void doCancel();
    },
  });
}
async function doCancel(): Promise<void> {
  busy.value = true;
  try {
    await cancelPickBatch(batchId.value);
    uni.showToast({ title: locale.t('orderAdmin.picking.cancelled'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.cancelFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

async function removeSelected(): Promise<void> {
  if (busy.value || !checked.value.length) return;
  busy.value = true;
  try {
    await removeOrdersFromPickBatch(batchId.value, checked.value.map((m) => m.id));
    selected.value = {};
    uni.showToast({ title: locale.t('orderAdmin.picking.removed'), icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.removeFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

async function onShip(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  fails.value = [];
  try {
    const res = await shipPickBatch(batchId.value, {
      method: dispatchMethod(dispatchIdx.value),
      trackingCode: tracking.value.trim() || undefined,
    });
    if (res.failed.length) {
      // 逐条展示失败原因，批次保持原状态（后端已保证不置 SHIPPED）
      fails.value = res.failed;
      uni.showToast({
        title: locale.t('orderAdmin.picking.shipPartial').replace('{n}', String(res.failed.length)),
        icon: 'none',
        duration: 3000,
      });
    } else {
      uni.showToast({ title: locale.t('orderAdmin.picking.shipDone'), icon: 'success' });
    }
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('orderAdmin.picking.shipFailed'), icon: 'none', duration: 3000 });
  } finally {
    busy.value = false;
  }
}

// ---- 打印（iframe 打印，被拦截时兜底新窗口；模板为纯函数，单测见 utils/print/templates/templates.spec.ts）----
/** 单据文案按当前语言取（键集与 DEFAULT_LABELS 一致，缺键回退中文） */
const printLabels = computed<Partial<PrintLabels>>(() => {
  const out: Partial<PrintLabels> = {};
  for (const k of Object.keys(DEFAULT_LABELS) as Array<keyof PrintLabels>) {
    out[k] = locale.t(`orderAdmin.picking.print.${k}`);
  }
  return out;
});

/** 发货单/标签/总览共用的订单字段（快照里只有这些，不伪造商品行明细） */
const docOrders = computed(() =>
  members.value.map((m) => ({
    code: m.code,
    customerName: m.customerName ?? null,
    phoneNumber: m.phoneNumber ?? null,
    address: m.address,
    itemCount: m.itemCount,
  })),
);

function doPrint(html: string): void {
  if (printHtml(html)) return;
  // 非 H5 环境或被浏览器拦截：单据已暂存在 print-window 内，可用新窗口重试
  uni.showModal({
    title: locale.t('orderAdmin.picking.print.failed'),
    confirmText: locale.t('orderAdmin.picking.print.newWindow'),
    success: (r) => {
      if (r.confirm) openPrintFallback(html);
    },
  });
}

const printMeta = () => ({
  batchCode: batch.value?.code ?? '',
  warehouseName: warehouseName.value || '—',
  printedAt: new Date(),
  labels: printLabels.value,
});

function printPickingList(): void {
  if (!canPrint.value) return;
  doPrint(renderPickingList({ ...printMeta(), binMode: mode.value, rows: rows.value }));
}
function printShippingNote(): void {
  if (!canPrint.value) return;
  doPrint(renderShippingNote({ ...printMeta(), orders: docOrders.value }));
}
function printParcelLabel(): void {
  if (!canPrint.value) return;
  doPrint(renderParcelLabel({ ...printMeta(), orders: docOrders.value }));
}
function printBatchOverview(): void {
  if (!canPrint.value) return;
  doPrint(renderBatchOverview({ ...printMeta(), batchState: batch.value?.state ?? '', orders: docOrders.value }));
}

// ---- 生命周期 ----
onLoad(async (q) => {
  batchId.value = (q && (q.id as string)) || '';
  if (!batchId.value) {
    uni.showToast({ title: locale.t('orderAdmin.picking.noBatch'), icon: 'none' });
    return;
  }
  await ensureBinMode();
  await load();
  await loadWarehouse();
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

  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 16rpx; }

  .head {
    .h1 { display: flex; align-items: center;
      .code { flex: 1; font-size: 32rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 20rpx; color: #fff; border-radius: 6rpx; padding: 4rpx 14rpx; background: $wa-accent;
        &.ready { background: $wa-ink; }
        &.ok { background: $wa-success; }
        &.warn { background: $wa-danger; }
        &.dead { background: $wa-muted; }
      }
    }
    .kv { display: flex; align-items: center; margin-top: 14rpx;
      .k { flex: none; font-size: 24rpx; color: $wa-muted; }
      .v { flex: 1; text-align: right; font-size: 24rpx; color: $wa-ink; }
    }
    .note { display: block; margin-top: 14rpx; font-size: 24rpx; color: $wa-muted; }
    .ex { display: block; margin-top: 14rpx; font-size: 24rpx; color: $wa-danger; line-height: 1.5; }
  }

  .sec { display: flex; align-items: center; margin: 20rpx 0 14rpx;
    .sh { font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    .sc { font-size: 22rpx; color: $wa-muted; margin-left: 10rpx; }
    .sa { flex: 1; text-align: right; font-size: 24rpx; color: $wa-danger; }
  }

  .grp {
    .gh { display: block; font-size: 24rpx; font-weight: 600; color: $wa-accent; margin: 12rpx 0 8rpx; }
    .prow { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid $wa-rule;
      .bin { flex: none; font-size: 22rpx; color: $wa-ink; background: $wa-bg; border-radius: 6rpx; padding: 4rpx 12rpx; }
      .pmid { flex: 1; min-width: 0; display: flex; flex-direction: column;
        .pn { font-size: 26rpx; color: $wa-ink; }
        .ps { font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
      }
      .pq { flex: none; font-size: 28rpx; font-weight: 600; color: $wa-ink; }
    }
  }

  .fail { background: #fff5f5; border: 1rpx solid $wa-danger;
    .fh { display: block; font-size: 26rpx; font-weight: 600; color: $wa-danger; }
    .fi { display: block; font-size: 24rpx; color: $wa-ink; margin-top: 10rpx; line-height: 1.5; }
    .fg { display: inline-block; margin-top: 16rpx; font-size: 24rpx; color: $wa-accent; }
  }

  .acts { display: flex; gap: 16rpx;
    .ab { flex: 1; text-align: center; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 18rpx 0;
      &.ghost { background: transparent; color: $wa-danger; border: 1rpx solid $wa-danger; }
      &.dis { opacity: 0.5; }
    }
  }

  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; }

  /* 打印单据：2×2 宫格 */
  .pr { display: flex; flex-wrap: wrap; gap: 16rpx;
    .pb { width: calc(50% - 8rpx); text-align: center; font-size: 26rpx; color: $wa-ink; background: $wa-bg;
      border: 1rpx solid $wa-rule; border-radius: 8rpx; padding: 20rpx 0;
      &.dis { opacity: 0.5; }
    }
  }

  /* 底部固定条：快递公司 + 运单号 + 批量发货 */
  .bulk {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 14rpx;
    padding: 18rpx 32rpx calc(18rpx + env(safe-area-inset-bottom));
    background: $wa-ink;

    .pk { flex: none; background: rgba(255, 255, 255, 0.16); border-radius: 8rpx; padding: 14rpx 20rpx;
      .pk-t { font-size: 24rpx; color: #fff; }
    }
    .tk { flex: 1; min-width: 0; background: rgba(255, 255, 255, 0.16); border-radius: 8rpx; padding: 14rpx 20rpx; font-size: 24rpx; color: #fff; }
    .bb { flex: none; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: 8rpx; padding: 14rpx 26rpx;
      &.dis { opacity: 0.5; }
    }
  }

  /* 交接 / 异常件登记弹层（与地址抽屉同款底部 sheet） */
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
    .inp { margin-top: 24rpx; background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }

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
</style>
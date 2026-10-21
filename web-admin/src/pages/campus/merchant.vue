<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusMerchant.loading') }}</view>
    <template v-else>
      <view class="topbar">
        <view class="stat">
          <text class="stat-num">{{ board.completedToday }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedToday') }}</text>
        </view>
        <view class="stat">
          <text class="stat-num">¥{{ fenToYuan(board.completedTodayAmount) }}</text>
          <text class="stat-lbl">{{ $t('campusMerchant.completedAmount') }}</text>
        </view>
        <view class="switch" :class="{ on: !board.paused }" @tap="toggleOpen">
          <text class="switch-lbl">{{ board.paused ? $t('campusMerchant.closed') : $t('campusMerchant.open') }}</text>
        </view>
      </view>
      <view v-if="!board.merchantConfirmEnabled" class="notice">{{ $t('campusMerchant.notConfirmMode') }}</view>
      <view v-if="board.printMode !== 'off'" class="printbar">
        <text class="p-mode">{{ $t(printModeKey) }}</text>
        <text v-if="lodopReady === 'fail'" class="p-warn">{{ $t('campusMerchant.lodopMissing') }}</text>
      </view>

      <view class="tabs">
        <view
          v-for="t in TABS" :key="t.key"
          class="tab" :class="{ on: tab === t.key }" @tap="tab = t.key"
        >
          <text>{{ $t(t.label) }}</text>
          <text v-if="listOf(t.key).length" class="badge">{{ listOf(t.key).length }}</text>
        </view>
      </view>

      <view v-if="!listOf(tab).length" class="hint">{{ $t('campusMerchant.emptyTab') }}</view>
      <view v-for="o in listOf(tab)" :key="o.id" class="card">
        <view class="row head">
          <text class="code">{{ o.code }}</text>
          <text class="time">{{ hhmm(o.createdAt) }}</text>
          <text v-if="o.route" class="route">{{ o.route }}</text>
        </view>
        <view class="row dest">
          <text class="dest-txt">{{ o.zone }} {{ o.building }}</text>
          <text v-if="o.slotText" class="slot">{{ o.slotText }}</text>
        </view>
        <view v-if="o.note" class="row note">
          <text class="note-txt">{{ $t('campusMerchant.noteLabel') }}：{{ o.note }}</text>
        </view>
        <view class="lines">
          <view v-for="(l, i) in o.lines" :key="i" class="line">
            <text class="l-name">{{ l.name }}</text>
            <text class="l-qty">×{{ l.quantity }}</text>
          </view>
        </view>
        <view class="row foot">
          <text v-if="o.riderName" class="rider">{{ $t('campusMerchant.rider') }}{{ o.riderName }}</text>
          <text class="total">¥{{ fenToYuan(o.total) }}</text>
          <button
            class="act ghost" :disabled="printingId === o.id"
            @tap="reprint(o)"
          >{{ printingId === o.id ? $t('campusMerchant.printing') : $t('campusMerchant.printBtn') }}</button>
          <button
            v-if="tab === 'pending'"
            class="act" :disabled="actingId === o.id"
            @tap="accept(o)"
          >{{ $t('campusMerchant.accept') }}</button>
          <button
            v-else-if="tab === 'cooking'"
            class="act" :disabled="actingId === o.id"
            @tap="cookingDone(o)"
          >{{ $t('campusMerchant.cookingDone') }}</button>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  campusMerchantAcceptOrder,
  campusMerchantBoard,
  campusMerchantCookingDone,
  campusMerchantMarkPrinted,
  campusMerchantSetPaused,
  type CampusMerchantBoard,
  type MerchantBoardOrder,
} from '../../apis/campus';
import { fenToYuan } from '../../utils/money';
import { loadLodop, printReceipt58 } from '../../utils/lodop';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';

const TABS = [
  { key: 'pending', label: 'campusMerchant.tabPending' },
  { key: 'cooking', label: 'campusMerchant.tabCooking' },
  { key: 'awaitingRider', label: 'campusMerchant.tabAwaiting' },
  { key: 'delivering', label: 'campusMerchant.tabDelivering' },
  { key: 'scheduled', label: 'campusMerchant.tabScheduled' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const locale = useLocaleStore();
const loading = ref(true);
const board = ref<CampusMerchantBoard>({
  paused: false,
  merchantConfirmEnabled: false,
  printMode: 'off',
  storeName: '',
  storePhone: null,
  pending: [],
  cooking: [],
  awaitingRider: [],
  delivering: [],
  scheduled: [],
  completedToday: 0,
  completedTodayAmount: 0,
});
const tab = ref<TabKey>('pending');
const actingId = ref('');
const printingId = ref(''); // 手动补打中的订单
const lastPendingCount = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

// ===== 小票打印（C-Lodop）=====
const lodopReady = ref<'' | 'ok' | 'fail'>('');
const autoPrinting = ref(false); // 自动打印互斥（10s 轮询防重入）
const autoAttempted = new Set<string>(); // 会话内已尝试自动打印的订单（防失败循环重试）
/** onPaid 自动打印仅打 30min 内的新单，防存量未打单/历史单风暴 */
const AUTO_PRINT_WINDOW_MS = 30 * 60 * 1000;

const printModeKey = computed(() =>
  board.value.printMode === 'onPaid' ? 'campusMerchant.printModeOnPaid'
  : board.value.printMode === 'onAccepted' ? 'campusMerchant.printModeOnAccepted'
  : 'campusMerchant.printModeOff',
);

const listOf = (key: TabKey): MerchantBoardOrder[] =>
  (board.value[key] as MerchantBoardOrder[]) ?? [];

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function receiptLabels() {
  return {
    orderNo: locale.t('campusMerchant.receiptOrderNo'),
    time: locale.t('campusMerchant.receiptTime'),
    route: locale.t('campusMerchant.receiptRoute'),
    slot: locale.t('campusMerchant.receiptSlot'),
    note: locale.t('campusMerchant.receiptNote'),
    subtotal: locale.t('campusMerchant.receiptSubtotal'),
    deliveryFee: locale.t('campusMerchant.receiptDeliveryFee'),
    total: locale.t('campusMerchant.receiptTotal'),
    thanks: locale.t('campusMerchant.receiptThanks'),
  };
}

/** 打印一张小票：成功后回写 waimaiPrintedAt（本地同步更新，省一次轮询） */
async function printOne(o: MerchantBoardOrder, withToast: boolean): Promise<boolean> {
  printingId.value = o.id;
  try {
    await printReceipt58(
      {
        storeName: board.value.storeName,
        storePhone: board.value.storePhone,
        code: o.code,
        createdAt: o.createdAt,
        createdAtText: fullTime(o.createdAt),
        zone: o.zone,
        building: o.building,
        slotText: o.slotText,
        route: o.route,
        note: o.note,
        lines: o.lines,
        shipping: o.shipping,
        total: o.total,
      },
      receiptLabels(),
    );
    try {
      await campusMerchantMarkPrinted(o.id);
    } catch { /* 回执失败不阻塞（下次补打以 printedAt 为准） */ }
    o.printedAt = new Date().toISOString();
    if (withToast) uni.showToast({ title: locale.t('campusMerchant.printOk'), icon: 'success' });
    return true;
  } catch (err: any) {
    if (withToast) {
      uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.printFailed')), icon: 'none' });
    }
    return false;
  } finally {
    printingId.value = '';
  }
}

/** 手动补打（任意 tab，不受 30min 限制） */
async function reprint(o: MerchantBoardOrder) {
  if (printingId.value) return;
  if (lodopReady.value === 'fail') {
    uni.showToast({ title: locale.t('campusMerchant.lodopMissing'), icon: 'none' });
    return;
  }
  await printOne(o, true);
}

/** onPaid 自动打印：轮询发现未打新单即打（静默，失败 toast 一次并标记已尝试） */
async function autoPrint(b: CampusMerchantBoard) {
  if (b.printMode !== 'onPaid' || autoPrinting.value || lodopReady.value !== 'ok') return;
  const candidates = [...b.pending, ...b.cooking, ...b.awaitingRider, ...b.delivering].filter(o => {
    if (o.printedAt || autoAttempted.has(o.id)) return false;
    return Date.now() - new Date(o.createdAt).getTime() < AUTO_PRINT_WINDOW_MS;
  });
  if (!candidates.length) return;
  autoPrinting.value = true;
  try {
    for (const o of candidates) {
      autoAttempted.add(o.id);
      await printOne(o, false);
    }
  } finally {
    autoPrinting.value = false;
  }
}

/** 新单提示音（H5 Web Audio，三短音） */
function beep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.25);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.15);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // 无 AudioContext 环境静默跳过
  }
}

async function refresh(initial = false) {
  try {
    const b = await campusMerchantBoard();
    const pendingCount = b.pending.length;
    if (!initial && pendingCount > lastPendingCount.value) beep();
    lastPendingCount.value = pendingCount;
    board.value = b;
    void autoPrint(b);
  } catch (err: any) {
    if (initial) {
      uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.loadFailed')), icon: 'none' });
    }
  } finally {
    if (initial) loading.value = false;
  }
}

async function toggleOpen() {
  const next = !board.value.paused;
  try {
    await campusMerchantSetPaused(next);
    board.value.paused = next;
    uni.showToast({ title: next ? locale.t('campusMerchant.paused') : locale.t('campusMerchant.resumed'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  }
}

async function accept(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantAcceptOrder(o.id);
    // onAccepted 模式：接单成功即打小票（打失败不阻塞接单，可手动补打）
    if (board.value.printMode === 'onAccepted' && lodopReady.value !== 'fail') {
      void printOne(o, true);
    }
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

async function cookingDone(o: MerchantBoardOrder) {
  actingId.value = o.id;
  try {
    await campusMerchantCookingDone(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusMerchant.opFailed')), icon: 'none' });
  } finally {
    actingId.value = '';
  }
}

onMounted(() => {
  refresh(true);
  timer = setInterval(() => refresh(), 10_000);
  // C-Lodop 探测：异步不阻塞看板加载
  loadLodop()
    .then(() => {
      lodopReady.value = 'ok';
    })
    .catch(() => {
      lodopReady.value = 'fail';
    });
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .topbar { display: flex; align-items: center; gap: 24rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .stat { flex: 1; display: flex; flex-direction: column; gap: 6rpx;
      .stat-num { font-size: 40rpx; color: $wa-ink; font-weight: 700; }
      .stat-lbl { font-size: 22rpx; color: $wa-muted; }
    }
    .switch { padding: 16rpx 36rpx; border-radius: 999rpx; background: $wa-rule;
      .switch-lbl { font-size: 26rpx; color: $wa-muted; font-weight: 600; }
      &.on { background: $wa-accent; .switch-lbl { color: #fff; } }
    }
  }
  .notice { font-size: 24rpx; color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; }
  .printbar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx;
    .p-mode { font-size: 24rpx; color: $wa-accent; font-weight: 600; }
    .p-warn { flex: 1; font-size: 22rpx; color: #c47b00; } }
  .tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8rpx;
      background: $wa-card; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      .badge { min-width: 36rpx; height: 36rpx; border-radius: 999rpx; background: #ff4d4f;
        color: #fff; font-size: 20rpx; display: flex; align-items: center; justify-content: center;
        padding: 0 8rpx; box-sizing: border-box; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .code { font-size: 28rpx; color: $wa-ink; font-weight: 700; flex: 1; }
      .time { font-size: 24rpx; color: $wa-muted; }
      .route { font-size: 20rpx; color: $wa-accent; border: 1px solid $wa-accent;
        border-radius: 8rpx; padding: 2rpx 10rpx; }
    }
    .dest { padding-top: 12rpx; .dest-txt { font-size: 26rpx; color: $wa-ink; flex: 1; }
      .slot { font-size: 22rpx; color: $wa-muted; }
    }
    .note { margin-top: 10rpx; background: #fff7e6; border-left: 6rpx solid #ff9800; border-radius: 8rpx; padding: 10rpx 16rpx;
      .note-txt { font-size: 24rpx; color: #b25f00; word-break: break-all; }
    }
    .lines { border-top: 1rpx solid $wa-rule; margin-top: 16rpx; padding-top: 8rpx;
      .line { display: flex; padding: 8rpx 0;
        .l-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
        .l-qty { font-size: 26rpx; color: $wa-muted; }
      }
    }
    .foot { padding-top: 16rpx;
      .rider { flex: 1; font-size: 24rpx; color: $wa-muted; }
      .total { font-size: 30rpx; color: $wa-ink; font-weight: 700; margin-right: 8rpx; }
      .act { background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius;
        padding: 0 32rpx; line-height: 64rpx; }
      .act.ghost { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent;
        padding: 0 20rpx; }
    }
  }
}
</style>

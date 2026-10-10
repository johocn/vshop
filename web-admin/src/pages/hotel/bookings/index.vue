<template>
  <view class="page">
    <view class="head">
      <text class="head-title">{{ locale.t('hotelBookings.headTitle') }}</text>
      <text class="badge">{{ page.total.value }}</text>
    </view>

    <!-- 顶部核销卡：8 位入住码 输码/扫码 → 核销 -->
    <view class="checkin-card" :class="{ pulse: pulsing }">
      <input
        ref="codeInput"
        class="code-input"
        v-model="rawCode"
        :placeholder="locale.t('hotelBookings.inputPlaceholder')"
        :maxlength="8"
        type="number"
        confirm-type="done"
        @confirm="onCheckIn"
      />
      <button class="scan-btn" @tap="onScan">{{ locale.t('hotelBookings.scan') }}</button>
      <button class="go-btn" :disabled="checking" @tap="onCheckIn">
        {{ checking ? locale.t('hotelBookings.checking') : locale.t('hotelBookings.checkin') }}
      </button>
    </view>

    <!-- 状态 tabs -->
    <view class="tabs">
      <text v-for="s in tabs" :key="s.key" :class="{ on: s.key === cur }" @tap="onTab(s.key)">
        {{ locale.t('hotelBookings.' + s.label) }}
      </text>
    </view>

    <!-- 紧凑行式列表：单卡多行，行间分隔 -->
    <view class="list-card" v-if="page.items.value.length">
      <view class="row" v-for="b in page.items.value" :key="b.id">
        <view class="l1" @tap="toggleDetail(b.id)">
          <text class="guest">{{ b.guestName || '—' }}</text>
          <text class="bcode" v-if="b.bookingCode">{{ b.bookingCode }}</text>
          <text class="badge-st" :class="'st--' + metaOf(b).cls">{{ locale.t('hotelBookings.' + metaOf(b).label) }}</text>
        </view>
        <view class="l2">
          <view class="mid">
            <text class="rname">{{ b.variantName || ('#' + b.productVariantId) }}</text>
            <text class="rdate">{{ b.checkIn.slice(5) }} → {{ b.checkOut.slice(5) }} · {{ locale.t('hotelBookings.nightsRooms').replace('{n}', String(b.nights)).replace('{r}', String(b.roomCount)) }}</text>
          </view>
          <text class="amt">¥{{ fenToYuan(b.totalCent) }}</text>
        </view>
        <view class="ops">
          <button v-if="b.status === 'confirmed'" class="op main" @tap="onRowCheckIn(b)">{{ locale.t('hotelBookings.checkinRow') }}</button>
          <button v-if="b.status === 'checkedIn'" class="op main" @tap="onComplete(b)">{{ locale.t('hotelBookings.checkout') }}</button>
          <button v-if="b.status === 'pendingDeposit' || b.status === 'confirmed'" class="op danger" @tap="openCancel(b)">{{ locale.t('hotelBookings.forceCancel') }}</button>
          <button class="op" @tap="toggleDetail(b.id)">{{ locale.t('hotelBookings.detail') }}</button>
        </view>

        <!-- 详情行内展开 -->
        <view class="detail" v-if="expandedId === b.id">
          <view class="drow"><text class="dk">{{ locale.t('hotelBookings.dOrder') }}</text><text class="dv">{{ b.orderCode || b.orderId }}</text></view>
          <view class="drow"><text class="dk">{{ locale.t('hotelBookings.dPhone') }}</text><text class="dv">{{ b.guestPhone || '—' }}</text></view>
          <view class="drow" v-if="b.ratePlanCode"><text class="dk">{{ locale.t('hotelBookings.dPlan') }}</text><text class="dv">{{ b.ratePlanCode }}</text></view>
          <view class="drow" v-if="b.cancelDeadlineAt"><text class="dk">{{ locale.t('hotelBookings.dCancelDeadline') }}</text><text class="dv">{{ fmtTime(b.cancelDeadlineAt) }}</text></view>
          <view class="drow" v-if="b.checkedInAt"><text class="dk">{{ locale.t('hotelBookings.dCheckinAt') }}</text><text class="dv">{{ fmtTime(b.checkedInAt) }}</text></view>
          <view class="drow" v-if="b.completedAt"><text class="dk">{{ locale.t('hotelBookings.dCompletedAt') }}</text><text class="dv">{{ fmtTime(b.completedAt) }}</text></view>
          <view class="drow" v-if="b.cancelledAt"><text class="dk">{{ locale.t('hotelBookings.dCancelledAt') }}</text><text class="dv">{{ fmtTime(b.cancelledAt) }}</text></view>
          <view class="drow" v-if="b.cancelReason"><text class="dk">{{ locale.t('hotelBookings.dCancelReason') }}</text><text class="dv">{{ b.cancelReason }}</text></view>
          <view class="drow"><text class="dk">{{ locale.t('hotelBookings.dCreatedAt') }}</text><text class="dv">{{ fmtTime(b.createdAt) }}</text></view>
        </view>
      </view>
    </view>

    <view v-if="page.loading.value" class="empty">{{ locale.t('pointsOrders.loading') }}</view>
    <view v-else-if="page.error.value" class="empty">
      <text>{{ page.error.value }}</text>
      <text class="retry" @tap="page.refresh()">{{ locale.t('pointsOrders.retry') }}</text>
    </view>
    <view v-else-if="!page.items.value.length" class="empty">{{ locale.t('hotelBookings.empty') }}</view>

    <!-- 强制取消弹层：输原因 -->
    <view class="mask" v-if="cancelTarget" @tap="closeCancel">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">{{ locale.t('hotelBookings.cancelTitle') }}</text>
        <text class="sheet-sub">#{{ cancelTarget.orderCode || cancelTarget.orderId }} · {{ cancelTarget.guestName || '—' }}<template v-if="cancelTarget.bookingCode"> · {{ cancelTarget.bookingCode }}</template></text>
        <textarea
          class="sheet-area"
          v-model="cancelReason"
          :placeholder="locale.t('hotelBookings.cancelPh')"
          :maxlength="200"
          auto-height
        />
        <view class="sheet-ops">
          <button class="op" @tap="closeCancel">{{ locale.t('hotelBookings.dialogCancel') }}</button>
          <button class="op main" :disabled="cancelling" @tap="confirmCancel">{{ locale.t('hotelBookings.cancelBtn') }}</button>
        </view>
      </view>
    </view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useLocaleStore } from '../../../stores/localeStore';
import { useListPage } from '../../../composables/useListPage';
import { fenToYuanFixed } from '../../../utils/money';
import { scanCode } from '../../../utils/scanner';
import {
  fetchHotelBookings,
  checkInBooking,
  completeBooking,
  forceCancelBooking,
  gqlErrMsg,
  type HotelBookingRow,
} from '../../../apis/hotel-booking';

const locale = useLocaleStore();

const rawCode = ref('');
const codeInput = ref<unknown | null>(null);
const checking = ref(false);
const pulsing = ref(false);
let pulseTimer: number | undefined;

const tabs = [
  { key: 'all', label: 'tabAll' },
  { key: 'pendingDeposit', label: 'status_pendingDeposit' },
  { key: 'confirmed', label: 'status_confirmed' },
  { key: 'checkedIn', label: 'status_checkedIn' },
  { key: 'completed', label: 'status_completed' },
  { key: 'cancelled', label: 'status_cancelled' },
  { key: 'noShow', label: 'status_noShow' },
];
const cur = ref('all');

// 后端 id DESC 上限 200 一次拉全（total=items.length 不分页）；fetcher 闭包读 cur，切 tab 后 refresh
const page = useListPage<HotelBookingRow>({
  take: 200,
  fetcher: () => fetchHotelBookings({ status: cur.value === 'all' ? null : cur.value }),
});

function onTab(key: string) {
  if (cur.value === key) return;
  cur.value = key;
  void page.refresh();
}

// 状态徽标：warn=待付订金 ok=已确认 info=已入住 muted=已完成 bad=取消/未到店
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendingDeposit: { label: 'status_pendingDeposit', cls: 'warn' },
  confirmed: { label: 'status_confirmed', cls: 'ok' },
  checkedIn: { label: 'status_checkedIn', cls: 'info' },
  completed: { label: 'status_completed', cls: 'muted' },
  cancelled: { label: 'status_cancelled', cls: 'bad' },
  noShow: { label: 'status_noShow', cls: 'bad' },
};
function metaOf(b: HotelBookingRow): { label: string; cls: string } {
  return STATUS_META[b.status] ?? { label: '', cls: 'muted' };
}

/** 分（Vendure Money）→ 元 */
function fenToYuan(v?: number): string {
  return v == null ? '—' : fenToYuanFixed(v);
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function pulseHighlight(): void {
  pulsing.value = true;
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => (pulsing.value = false), 600) as unknown as number;
}

function focusInput(): void {
  try {
    (codeInput.value as any)?.focus?.();
  } catch { /* 忽略 */ }
}

/** 从扫码文本提取 8 位入住码（兼容整码或含码长文本） */
function extractCode(text: string): string {
  const m = String(text ?? '').match(/\d{8}/);
  return m ? m[0] : '';
}

/** 顶部核销卡：输码核销 */
async function onCheckIn(): Promise<void> {
  const code = rawCode.value.trim();
  if (!/^\d{8}$/.test(code)) {
    uni.showToast({ title: locale.t('hotelBookings.invalidCode'), icon: 'none' });
    return;
  }
  checking.value = true;
  try {
    await checkInBooking(code);
    uni.showToast({ title: locale.t('hotelBookings.checkinOk'), icon: 'success' });
    rawCode.value = '';
    await page.refresh();
  } catch (e: unknown) {
    uni.showToast({ title: gqlErrMsg(e), icon: 'none' });
  } finally {
    checking.value = false;
  }
}

async function onScan(): Promise<void> {
  try {
    const code = extractCode(await scanCode());
    if (!code) {
      uni.showToast({ title: locale.t('hotelBookings.scanUnrecognized'), icon: 'none' });
      focusInput();
      return;
    }
    rawCode.value = code;
    pulseHighlight();
    await onCheckIn(); // 扫码成功自动核销
  } catch (e: any) {
    if (e?.code === 'MANUAL' || e?.code === 'FAILED') {
      uni.showToast({ title: e?.message || locale.t('pointsOrders.opFailed'), icon: 'none' });
      focusInput();
    }
    // CANCEL 静默
  }
}

// ===== 列表行操作 =====

const expandedId = ref<string | null>(null);
function toggleDetail(id: string): void {
  expandedId.value = expandedId.value === id ? null : id;
}

async function run(fn: () => Promise<unknown>, okMsg: string): Promise<void> {
  try {
    await fn();
    uni.showToast({ title: okMsg, icon: 'success' });
    await page.refresh();
  } catch (e: unknown) {
    uni.showToast({ title: gqlErrMsg(e) || locale.t('hotelBookings.opFailed'), icon: 'none' });
  }
}

/** 行内核销（后端校验 confirmed 且当日 ∈ [checkIn, checkOut)，非当日返回错误提示） */
function onRowCheckIn(b: HotelBookingRow): void {
  if (!b.bookingCode) return;
  void run(() => checkInBooking(b.bookingCode as string), locale.t('hotelBookings.checkinOk'));
}

function onComplete(b: HotelBookingRow): void {
  uni.showModal({
    title: locale.t('hotelBookings.doneTitle'),
    content: locale.t('hotelBookings.doneContent'),
    success: (res) => {
      if (res.confirm) void run(() => completeBooking(b.id), locale.t('hotelBookings.doneOk'));
    },
  });
}

// ===== 强制取消（页内弹层输原因）=====

const cancelTarget = ref<HotelBookingRow | null>(null);
const cancelReason = ref('');
const cancelling = ref(false);

function openCancel(b: HotelBookingRow): void {
  cancelTarget.value = b;
  cancelReason.value = '';
}
function closeCancel(): void {
  cancelTarget.value = null;
}
async function confirmCancel(): Promise<void> {
  if (!cancelTarget.value || cancelling.value) return;
  cancelling.value = true;
  try {
    await forceCancelBooking(cancelTarget.value.id, cancelReason.value.trim() || undefined);
    uni.showToast({ title: locale.t('hotelBookings.cancelOk'), icon: 'success' });
    cancelTarget.value = null;
    await page.refresh();
  } catch (e: unknown) {
    uni.showToast({ title: gqlErrMsg(e), icon: 'none' });
  } finally {
    cancelling.value = false;
  }
}

onShow(() => {
  void page.refresh();
});
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 60rpx;
  .head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
    .head-title { font-size: 36rpx; font-weight: 700; color: $wa-ink; }
    .badge {
      min-width: 48rpx; text-align: center; font-size: 26rpx; font-weight: 700; color: #fff;
      background: $wa-accent; border-radius: 999rpx; padding: 6rpx 18rpx;
      box-shadow: 0 6rpx 18rpx rgba(255, 102, 0, 0.28);
    }
  }
  .checkin-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: 20rpx; padding: 20rpx; margin-bottom: 24rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.06); border: 2rpx solid transparent;
    transition: border-color 0.2s, transform 0.2s;
    &.pulse { border-color: $wa-accent; transform: translateY(-2rpx); }
    .code-input {
      flex: 1; min-width: 0; height: 76rpx; padding: 0 24rpx; font-size: 34rpx; font-weight: 700;
      letter-spacing: 4rpx; font-family: ui-monospace, Menlo, Consolas, monospace;
      background: $wa-bg; border-radius: 16rpx; color: $wa-ink;
    }
    .go-btn {
      margin: 0; min-width: 176rpx; height: 76rpx; line-height: 76rpx; padding: 0 28rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: 16rpx; font-weight: 600;
      &[disabled] { opacity: 0.6; }
    }
    .scan-btn {
      margin: 0; min-width: 120rpx; height: 76rpx; line-height: 76rpx; padding: 0 20rpx;
      font-size: 28rpx; background: $wa-ink; color: #fff; border-radius: 16rpx;
    }
  }
  .tabs {
    display: flex; flex-wrap: wrap; margin-bottom: 24rpx; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; gap: 4rpx;
    text { flex: 1; text-align: center; padding: 14rpx 0; font-size: 25rpx; color: $wa-muted; border-radius: $wa-radius; white-space: nowrap;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; } }
  }
  .list-card {
    background: $wa-card; border-radius: 20rpx; padding: 0 28rpx;
    box-shadow: 0 2rpx 12rpx rgba(31, 41, 55, 0.05);
    .row {
      padding: 22rpx 0;
      & + .row { border-top: 1rpx solid $wa-rule; }
      .l1 { display: flex; align-items: center; gap: 14rpx; margin-bottom: 10rpx;
        .guest { flex: 1; font-size: 30rpx; font-weight: 700; color: $wa-ink; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bcode {
          font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 800; letter-spacing: 2rpx;
          font-size: 26rpx; color: #d04b00; background: #fff4ec; border: 1rpx solid #ffd9bc;
          border-radius: 10rpx; padding: 2rpx 14rpx; flex-shrink: 0;
        }
        .badge-st { flex-shrink: 0; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx;
          &.st--warn { color: #b45309; background: #fef3c7; }
          &.st--ok { color: #15803d; background: #dcfce7; }
          &.st--info { color: #1d4ed8; background: #dbeafe; }
          &.st--muted { color: #4b5563; background: #f3f4f6; }
          &.st--bad { color: #b91c1c; background: #fee2e2; } }
      }
      .l2 { display: flex; align-items: center; gap: 16rpx;
        .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4rpx;
          .rname { font-size: 26rpx; color: $wa-ink; }
          .rdate { font-size: 23rpx; color: $wa-muted; } }
        .amt { font-size: 28rpx; font-weight: 700; color: $wa-ink; flex-shrink: 0; }
      }
      .ops { display: flex; justify-content: flex-end; gap: 12rpx; margin-top: 14rpx;
        .op { min-width: 128rpx; margin: 0; padding: 0 20rpx; height: 56rpx; line-height: 56rpx;
          font-size: 24rpx; border-radius: $wa-radius; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; }
          &.danger { background: #fff; color: #e64340; border: 1rpx solid #f3b9b5; } } }
      .detail {
        margin-top: 14rpx; background: $wa-bg; border-radius: 14rpx; padding: 16rpx 20rpx;
        .drow { display: flex; gap: 20rpx; padding: 4rpx 0; font-size: 23rpx; line-height: 1.6;
          .dk { flex-shrink: 0; color: $wa-muted; }
          .dv { color: $wa-ink; word-break: break-all; } }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
  .mask {
    position: fixed; inset: 0; background: rgba(17, 24, 39, 0.55); z-index: 999;
    display: flex; align-items: flex-end; justify-content: center;
    .sheet {
      width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
      display: flex; flex-direction: column; gap: 16rpx;
      .sheet-title { font-size: 32rpx; font-weight: 700; color: $wa-ink; }
      .sheet-sub { font-size: 24rpx; color: $wa-muted; }
      .sheet-area {
        width: 100%; min-height: 140rpx; box-sizing: border-box; padding: 20rpx;
        background: $wa-bg; border-radius: 14rpx; font-size: 26rpx; color: $wa-ink;
      }
      .sheet-ops { display: flex; gap: 16rpx; margin-top: 8rpx;
        .op { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; font-size: 28rpx;
          border-radius: 16rpx; background: $wa-bg; color: $wa-ink;
          &.main { background: $wa-accent; color: #fff; }
          &[disabled] { opacity: 0.6; } } }
    }
  }
}
</style>

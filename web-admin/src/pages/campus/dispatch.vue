<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusDispatch.loading') }}</view>
    <template v-else>
      <view v-if="board.paused" class="banner paused">{{ $t('campusDispatch.pausedBanner') }}</view>

      <!-- 异常待处理（plan 3.4）：处置卡内联三选一 + 危险操作二次确认 -->
      <template v-if="exceptionAlerts.length">
        <view class="col-head exc-head">
          <text class="col-title">{{ $t('campusDispatch.excSectionTitle') }}</text>
          <text class="col-count danger">{{ exceptionAlerts.length }}</text>
        </view>
        <view v-for="a in exceptionAlerts" :key="a.orderId" class="exc-card">
          <view class="row">
            <text class="code">{{ a.orderCode }}</text>
            <text class="chip danger">{{ excTypeLabel(a.detail) }}</text>
          </view>
          <view class="note" v-if="a.exceptionNote">{{ a.exceptionNote }}</view>
          <view class="photos" v-if="a.exceptionPhotos && a.exceptionPhotos.length">
            <image
              v-for="(p, i) in a.exceptionPhotos" :key="i" class="ph" :src="p" mode="aspectFill"
              @tap="previewPhoto(a, i)"
            />
          </view>
          <view class="tabs">
            <button class="tab" :class="{ on: excTab(a.orderId) === 'diff' }" @tap="setExcTab(a.orderId, 'diff')">
              {{ $t('campusDispatch.excDiff') }}
            </button>
            <button class="tab" :class="{ on: excTab(a.orderId) === 'coupon' }" @tap="setExcTab(a.orderId, 'coupon')">
              {{ $t('campusDispatch.excCoupon') }}
            </button>
            <button class="tab" :class="{ on: excTab(a.orderId) === 'refund' }" @tap="setExcTab(a.orderId, 'refund')">
              {{ $t('campusDispatch.excRefund') }}
            </button>
          </view>
          <view v-if="excTab(a.orderId) === 'diff'" class="pane">
            <view class="fld-label">{{ $t('campusDispatch.excAmount') }}</view>
            <input
              class="fld" type="digit" :value="excAmount[a.orderId]"
              :placeholder="$t('campusDispatch.excAmountPh')" @input="(e: any) => (excAmount[a.orderId] = e.detail.value)"
            />
            <view class="fld-label">{{ $t('campusDispatch.excNoteLabel') }}</view>
            <input
              class="fld" :value="excNote[a.orderId]"
              :placeholder="$t('campusDispatch.excNotePh')" @input="(e: any) => (excNote[a.orderId] = e.detail.value)"
            />
            <button class="act primary block" @tap="handleDiff(a)">{{ $t('campusDispatch.excConfirmDiff') }}</button>
          </view>
          <view v-else-if="excTab(a.orderId) === 'coupon'" class="pane">
            <view class="fld-label">{{ $t('campusDispatch.excPickCoupon') }}</view>
            <picker mode="selector" :range="couponNames" @change="(e: any) => onCouponPick(a.orderId, Number(e.detail.value))">
              <view class="fld picker">
                {{ pickedCoupon(a.orderId)?.name || $t('campusDispatch.excPickCouponPh') }}
              </view>
            </picker>
            <view class="fld-label">{{ $t('campusDispatch.excNoteLabel') }}</view>
            <input
              class="fld" :value="excNote[a.orderId]"
              :placeholder="$t('campusDispatch.excNotePh')" @input="(e: any) => (excNote[a.orderId] = e.detail.value)"
            />
            <button class="act primary block" @tap="handleCoupon(a)">{{ $t('campusDispatch.excConfirmCoupon') }}</button>
          </view>
          <view v-else class="pane">
            <view class="warnline">{{ $t('campusDispatch.excRefundWarn') }}</view>
            <button class="act danger block" @tap="handleRefundAll(a)">{{ $t('campusDispatch.excConfirmRefund') }}</button>
          </view>
          <view class="sep" />
          <button class="act ghost block" @tap="handleReassign(a)">{{ $t('campusDispatch.excReassign') }}</button>
        </view>
      </template>

      <view v-if="otherAlerts.length" class="alerts">
        <view v-for="(a, i) in otherAlerts" :key="i" class="alert" @tap="jumpOrder(a)">
          <text class="alert-type">{{ typeLabel(a.type) }}</text>
          <text class="alert-detail">{{ a.orderCode }} · {{ a.detail }}</text>
        </view>
      </view>

      <view class="cols">
        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.hall') }}</text>
            <text class="col-count">{{ board.hallOrders.length }}</text>
          </view>
          <view v-if="!board.hallOrders.length" class="hint sm">{{ $t('campusDispatch.emptyCol') }}</view>
          <view v-for="o in board.hallOrders" :key="o.id" class="card">
            <view class="row">
              <text class="code">{{ o.code }}</text>
              <text class="time">{{ hhmm(o.createdAt) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view class="meta" v-if="waitMin(o.customFields.hallEnteredAt)">
              {{ $t('campusDispatch.waitMin').replace('{n}', waitMin(o.customFields.hallEnteredAt)!) }}
            </view>
            <view v-if="o.customFields.campusCause" class="cause">{{ causeLabel(o.customFields.campusCause) }}</view>
            <view class="acts">
              <button class="act" @tap="assign(o)">{{ $t('campusDispatch.assign') }}</button>
            </view>
          </view>
        </view>

        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.active') }}</text>
            <text class="col-count">{{ board.activeOrders.length }}</text>
          </view>
          <view v-if="!board.activeOrders.length" class="hint sm">{{ $t('campusDispatch.emptyCol') }}</view>
          <view v-for="o in board.activeOrders" :key="o.id" class="card">
            <view class="row">
              <text class="code">{{ o.code }}</text>
              <text class="chip" :class="o.customFields.deliveryStatus">{{ statusLabel(o.customFields) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view class="row acts">
              <button
                v-if="o.customFields.hallStatus === 'grabbed'"
                class="act ghost" @tap="backToHall(o)"
              >{{ $t('campusDispatch.backHall') }}</button>
              <button
                v-if="o.customFields.hallStatus === 'open'"
                class="act" @tap="assign(o)"
              >{{ $t('campusDispatch.assign') }}</button>
            </view>
          </view>
        </view>

        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.riders') }}</text>
            <text class="col-count">{{ board.ridersOnline.length }}</text>
          </view>
          <view v-if="!board.ridersOnline.length" class="hint sm">{{ $t('campusDispatch.noRiders') }}</view>
          <view v-for="r in board.ridersOnline" :key="r.customerId" class="rider-card">
            <text class="rider-name">{{ r.realName || ('#' + r.customerId) }}</text>
            <text class="rider-credit">{{ $t('campusDispatch.credit').replace('{n}', String(r.credit)) }}</text>
          </view>
        </view>
      </view>

      <!-- 异常处置记录（plan 3.4 留痕） -->
      <template v-if="board.handledOrders.length">
        <view class="col-head">
          <text class="col-title">{{ $t('campusDispatch.handledTitle') }}</text>
          <text class="col-count">{{ board.handledOrders.length }}</text>
        </view>
        <view v-for="h in board.handledOrders" :key="h.orderId" class="handled-card">
          <view class="row">
            <text class="code">{{ h.orderCode }}</text>
            <text class="chip done">✓ {{ actionLabel(h.action) }}</text>
          </view>
          <view class="meta">
            {{ handledDetail(h) }} · {{ hhmm(h.handledAt) }} · {{ h.handledBy }}
          </view>
          <view class="meta" v-if="h.note">{{ h.note }}</view>
        </view>
      </template>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  campusDispatchAssign,
  campusDispatchBackToHall,
  campusDispatchBoard,
  campusHandleException,
  type CampusDispatchBoardData,
  type DispatchAlert,
  type DispatchOrder,
  type HandedException,
} from '../../apis/campus';
import { fetchCouponTemplates, type CouponTemplateItem } from '../../apis/coupon';
import { graphQlErrorMsg } from '../../apis/client';
import { yuanToFen } from '../../utils/money';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();
const loading = ref(true);
const board = ref<CampusDispatchBoardData>({
  paused: false,
  alerts: [],
  hallOrders: [],
  activeOrders: [],
  ridersOnline: [],
  handledOrders: [],
});
let timer: ReturnType<typeof setInterval> | null = null;

// —— 异常处置（plan 3.4）——
const exceptionAlerts = computed(() => board.value.alerts.filter(a => a.type === 'exception'));
const otherAlerts = computed(() => board.value.alerts.filter(a => a.type !== 'exception'));
const excTabs = reactive<Record<string, string>>({});
const excAmount = reactive<Record<string, string>>({});
const excNote = reactive<Record<string, string>>({});
const excCouponPick = reactive<Record<string, string>>({}); // couponTemplateId
const couponTemplates = ref<CouponTemplateItem[]>([]);
const couponsLoaded = ref(false);
const couponNames = computed(() => couponTemplates.value.map(t => t.name || t.id));

function excTab(orderId: string): string {
  return excTabs[orderId] ?? 'diff';
}
function setExcTab(orderId: string, tab: string) {
  excTabs[orderId] = tab;
  if (tab === 'coupon' && !couponsLoaded.value) loadCoupons();
}
function onCouponPick(orderId: string, index: number) {
  const tpl = couponTemplates.value[index];
  if (tpl) excCouponPick[orderId] = tpl.id;
}
function pickedCoupon(orderId: string): CouponTemplateItem | null {
  return couponTemplates.value.find(t => t.id === excCouponPick[orderId]) ?? null;
}
async function loadCoupons() {
  try {
    const { items } = await fetchCouponTemplates({ skip: 0, take: 50 });
    couponTemplates.value = items;
    couponsLoaded.value = true;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.excCouponLoadFailed')), icon: 'none' });
  }
}
function clearExcState(orderId: string) {
  delete excAmount[orderId];
  delete excNote[orderId];
  delete excCouponPick[orderId];
}
async function runHandle(a: DispatchAlert, action: string, opts?: { amount?: number; couponTemplateId?: string }) {
  try {
    await campusHandleException(a.orderId, action, { ...opts, note: excNote[a.orderId] || undefined });
    uni.showToast({ title: locale.t('campusDispatch.excDone'), icon: 'success' });
    clearExcState(a.orderId);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
  }
}
function handleDiff(a: DispatchAlert) {
  const fen = yuanToFen(excAmount[a.orderId] ?? '');
  if (!fen || fen <= 0) {
    uni.showToast({ title: locale.t('campusDispatch.excAmountInvalid'), icon: 'none' });
    return;
  }
  void runHandle(a, 'refund_diff', { amount: fen });
}
function handleCoupon(a: DispatchAlert) {
  const tplId = excCouponPick[a.orderId];
  if (!tplId) {
    uni.showToast({ title: locale.t('campusDispatch.excPickCouponPh'), icon: 'none' });
    return;
  }
  void runHandle(a, 'coupon', { couponTemplateId: tplId });
}
function handleRefundAll(a: DispatchAlert) {
  uni.showModal({
    title: locale.t('campusDispatch.excRefundConfirmTitle'),
    content: `${a.orderCode} · ${locale.t('campusDispatch.excRefundConfirmBody')}`,
    success: (r: any) => {
      if (r.confirm) void runHandle(a, 'refund_all');
    },
  });
}
async function handleReassign(a: DispatchAlert) {
  try {
    await campusHandleException(a.orderId, 'reassign', { note: excNote[a.orderId] || undefined });
    uni.showToast({ title: locale.t('campusDispatch.excReassigned'), icon: 'success' });
    clearExcState(a.orderId);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
  }
}
function previewPhoto(a: DispatchAlert, index: number) {
  if (!a.exceptionPhotos?.length) return;
  uni.previewImage({ urls: a.exceptionPhotos, current: a.exceptionPhotos[index] });
}
function excTypeLabel(type: string): string {
  const map: Record<string, string> = {
    no_recipient: locale.t('campusDispatch.excTypeNoRecipient'),
    food_spilled: locale.t('campusDispatch.excTypeFoodSpilled'),
    merchant_issue: locale.t('campusDispatch.excTypeMerchantIssue'),
    other: locale.t('campusDispatch.excTypeOther'),
  };
  return map[type] ?? type;
}
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    reassign: locale.t('campusDispatch.actReassign'),
    refund_diff: locale.t('campusDispatch.actRefundDiff'),
    coupon: locale.t('campusDispatch.actCoupon'),
    refund_all: locale.t('campusDispatch.actRefundAll'),
  };
  return map[action] ?? action;
}
function handledDetail(h: HandedException): string {
  if (h.action === 'refund_diff' && h.compensation != null) {
    return `${locale.t('campusDispatch.actRefundDiff')} ¥${(h.compensation / 100).toFixed(2)}`;
  }
  return actionLabel(h.action);
}

function hhmm(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function waitMin(hallEnteredAt: string | null): string | null {
  if (!hallEnteredAt) return null;
  const m = Math.floor((Date.now() - new Date(hallEnteredAt).getTime()) / 60_000);
  return m > 0 ? String(m) : null;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    stale_open: locale.t('campusDispatch.alertStaleOpen'),
    sla_breach: locale.t('campusDispatch.alertSla'),
    slot_full: locale.t('campusDispatch.alertSlotFull'),
    exception: locale.t('campusDispatch.alertException'),
  };
  return map[type] ?? type;
}

function causeLabel(cause: string): string {
  const map: Record<string, string> = {
    slot_full: locale.t('campusDispatch.causeSlotFull'),
    no_rider: locale.t('campusDispatch.causeNoRider'),
    merchant_timeout: locale.t('campusDispatch.causeMerchantTimeout'),
  };
  return map[cause] ?? cause;
}

function statusLabel(cf: DispatchOrder['customFields']): string {
  const map: Record<string, string> = {
    assigned: locale.t('campusDispatch.stAssigned'),
    in_progress: locale.t('campusDispatch.stInProgress'),
    exception: locale.t('campusDispatch.stException'),
    delivered: locale.t('campusDispatch.stDelivered'),
    no_rider_final: locale.t('campusDispatch.stRefunded'),
  };
  if (!map[cf.deliveryStatus ?? ''] && cf.hallStatus === 'no_rider_final') return map.no_rider_final;
  return map[cf.deliveryStatus ?? ''] ?? cf.hallStatus ?? '';
}

function jumpOrder(a: { orderId: string }) {
  uni.navigateTo({ url: `/pages/order/detail/index?id=${a.orderId}` });
}

async function refresh(initial = false) {
  try {
    board.value = await campusDispatchBoard();
  } catch (err: any) {
    if (initial) uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.loadFailed')), icon: 'none' });
  } finally {
    if (initial) loading.value = false;
  }
}

async function assign(o: DispatchOrder) {
  if (!board.value.ridersOnline.length) {
    uni.showToast({ title: locale.t('campusDispatch.noRiders'), icon: 'none' });
    return;
  }
  const names = board.value.ridersOnline.map(r => r.realName || `#${r.customerId}`);
  uni.showActionSheet({
    itemList: names,
    success: async ({ tapIndex }) => {
      const rider = board.value.ridersOnline[tapIndex];
      try {
        await campusDispatchAssign(o.id, rider.customerId);
        await refresh();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
      }
    },
  });
}

async function backToHall(o: DispatchOrder) {
  try {
    await campusDispatchBackToHall(o.id);
    await refresh();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.opFailed')), icon: 'none' });
  }
}

onMounted(() => {
  refresh(true);
  timer = setInterval(() => refresh(), 10_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  timer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0;
    &.sm { padding: 24rpx 0; font-size: 24rpx; }
  }
  .banner { border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 24rpx; font-size: 26rpx;
    &.paused { color: #fff; background: #ff4d4f; }
  }
  .alerts { margin-bottom: 24rpx;
    .alert { display: flex; align-items: center; gap: 16rpx; background: #fff7e6;
      border: 1.5px solid #ffe1a8; border-radius: $wa-radius; padding: 16rpx 24rpx; margin-bottom: 12rpx;
      .alert-type { color: #c47b00; font-size: 24rpx; font-weight: 700; flex-shrink: 0; }
      .alert-detail { color: $wa-ink; font-size: 24rpx; }
    }
  }
  .col-head { display: flex; align-items: center; gap: 12rpx; padding: 8rpx 4rpx 16rpx;
    .col-title { font-size: 28rpx; color: $wa-ink; font-weight: 700; }
    .col-count { font-size: 24rpx; color: $wa-accent; font-weight: 700;
      &.danger { color: #ff4d4f; } }
  }
  .exc-card { background: #fff; border: 1.5px solid #ffc2c2; border-radius: $wa-radius;
    padding: 20rpx 24rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 12rpx; }
    .code { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 700; }
    .chip { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 999rpx; color: #fff;
      background: #ff4d4f; white-space: nowrap; flex-shrink: 0;
      &.done { background: #10b981; } }
    .note { font-size: 24rpx; color: $wa-ink; background: $wa-bg; border-radius: $wa-radius;
      padding: 12rpx 16rpx; margin-top: 12rpx; }
    .photos { display: flex; gap: 12rpx; margin-top: 12rpx;
      .ph { width: 96rpx; height: 96rpx; border-radius: $wa-radius; background: $wa-bg; } }
    .tabs { display: flex; gap: 8rpx; background: $wa-bg; border-radius: $wa-radius; padding: 6rpx; margin-top: 16rpx;
      .tab { flex: 1; background: transparent; color: $wa-muted; font-size: 24rpx; font-weight: 600;
        line-height: 56rpx; padding: 0; margin: 0; border-radius: $wa-radius;
        &.on { background: #fff; color: $wa-ink; font-weight: 700; } } }
    .pane { padding-top: 16rpx;
      .fld-label { font-size: 22rpx; color: $wa-muted; padding-bottom: 6rpx; }
      .fld { border: 1.5px solid #e5e7eb; border-radius: $wa-radius;
        padding: 14rpx 20rpx; font-size: 26rpx; color: $wa-ink; margin-bottom: 16rpx;
        &.picker { color: $wa-ink; } }
      .warnline { font-size: 22rpx; color: #c47b00; background: #fff7e6; border-radius: $wa-radius;
        padding: 12rpx 16rpx; margin-bottom: 16rpx; }
    }
    .sep { height: 1.5px; background: $wa-bg; margin: 16rpx 0; }
    .act { font-size: 24rpx; border-radius: $wa-radius; padding: 0 24rpx; line-height: 60rpx; margin: 0;
      &.primary { background: $wa-accent; color: #fff; }
      &.danger { background: #ff4d4f; color: #fff; }
      &.ghost { background: transparent; border: 1.5px solid #e5e7eb; color: $wa-ink; }
      &.block { display: block; width: 100%; margin-top: 8rpx; } }
  }
  .cols { display: flex; gap: 20rpx; align-items: flex-start; flex-direction: column;
    .col { width: 100%; min-width: 0; }
  }
  @media (min-width: 768px) {
    .cols { flex-direction: row;
      .col { width: auto; flex: 1; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
    .row { display: flex; align-items: center; gap: 12rpx; }
    .code { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 700; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    .time { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; }
    .chip { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 999rpx; color: #fff;
      background: $wa-muted; white-space: nowrap; flex-shrink: 0;
      &.assigned { background: #1e80ff; }
      &.in_progress { background: #10b981; }
      &.exception { background: #ff4d4f; }
    }
    .meta { font-size: 24rpx; color: $wa-muted; padding-top: 8rpx; }
    .cause { font-size: 22rpx; color: #c47b00; padding-top: 8rpx; }
    .acts { padding-top: 16rpx;
      .act { background: $wa-accent; color: #fff; font-size: 24rpx; border-radius: $wa-radius;
        padding: 0 24rpx; line-height: 56rpx; margin: 0;
        &.ghost { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; }
      }
    }
  }
  .handled-card { background: $wa-card; border-radius: $wa-radius; padding: 18rpx 24rpx; margin-bottom: 12rpx;
    .row { display: flex; align-items: center; gap: 12rpx; }
    .code { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 700; }
    .chip { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 999rpx; color: #fff; background: #10b981; }
    .meta { font-size: 22rpx; color: $wa-muted; padding-top: 6rpx; }
  }
  .rider-card { display: flex; align-items: center; background: $wa-card; border-radius: $wa-radius;
    padding: 18rpx 24rpx; margin-bottom: 12rpx;
    .rider-name { flex: 1; font-size: 26rpx; color: $wa-ink; }
    .rider-credit { font-size: 22rpx; color: $wa-muted; }
  }
}
</style>

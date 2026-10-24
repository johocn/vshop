<template>
  <view class="page">
    <view v-if="loading" class="hint">{{ $t('campusDispatch.loading') }}</view>
    <template v-else>
      <view v-if="board.paused" class="banner paused">{{ $t('campusDispatch.pausedBanner') }}</view>
      <!-- 写操作需 CampusDispatch，仅有看板权限时为只读 -->
      <view v-if="!canDispatch" class="banner readonly">{{ $t('campusDispatch.readonlyBanner') }}</view>

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
          <view v-if="canDispatch" class="tabs">
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
          <view v-if="canDispatch && excTab(a.orderId) === 'diff'" class="pane">
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
          <view v-else-if="canDispatch && excTab(a.orderId) === 'coupon'" class="pane">
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
          <view v-else-if="canDispatch" class="pane">
            <view class="warnline">{{ $t('campusDispatch.excRefundWarn') }}</view>
            <button class="act danger block" @tap="handleRefundAll(a)">{{ $t('campusDispatch.excConfirmRefund') }}</button>
          </view>
          <view class="sep" />
          <button v-if="canDispatch" class="act ghost block" @tap="handleReassign(a)">{{ $t('campusDispatch.excReassign') }}</button>
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
              <text v-if="routeCount(o, board.hallOrders) > 1" class="route-tag">{{ $t('campusDispatch.routeGroup').replace('{n}', String(routeCount(o, board.hallOrders))) }}</text>
              <text class="time">{{ hhmm(o.createdAt) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view class="meta" v-if="waitMin(o.customFields.hallEnteredAt)">
              {{ $t('campusDispatch.waitMin').replace('{n}', waitMin(o.customFields.hallEnteredAt)!) }}
            </view>
            <view v-if="o.customFields.campusCause" class="cause">{{ causeLabel(o.customFields.campusCause) }}</view>
            <view v-if="isExternalRoute(o)" class="ext-line">
              <text class="ext-tag">{{ o.customFields.fulfillmentRoute }} · {{ extStateLabel(o) }}</text>
              <text v-if="o.customFields.thirdPartyNo" class="ext-no">{{ o.customFields.thirdPartyNo }}</text>
            </view>
            <view v-if="canDispatch" class="acts">
              <button class="act" @tap="assign(o)">{{ $t('campusDispatch.assign') }}</button>
              <button v-if="canPushExternal(o)" class="act ghost" @tap="pushExternal(o)">{{ $t('campusDispatch.pushExternal') }}</button>
            </view>
          </view>
        </view>

        <view class="col">
          <view class="col-head">
            <text class="col-title">{{ $t('campusDispatch.active') }}</text>
            <text class="col-count">{{ board.activeOrders.length }}</text>
            <text v-if="canDispatch && pushableActive.length > 1" class="batch" @tap="pushExternalBatch">
              {{ $t('campusDispatch.pushBatch').replace('{n}', String(pushableActive.length)) }}
            </text>
          </view>
          <view v-if="!board.activeOrders.length" class="hint sm">{{ $t('campusDispatch.emptyCol') }}</view>
          <view v-for="o in board.activeOrders" :key="o.id" class="card">
            <view class="row">
              <text class="code">{{ o.code }}</text>
              <text v-if="routeCount(o, board.activeOrders) > 1" class="route-tag">{{ $t('campusDispatch.routeGroup').replace('{n}', String(routeCount(o, board.activeOrders))) }}</text>
              <text class="chip" :class="o.customFields.deliveryStatus">{{ statusLabel(o.customFields) }}</text>
            </view>
            <view class="meta">{{ o.customFields.campusZone || '-' }} · #{{ o.customFields.buildingId || '-' }}</view>
            <view v-if="isExternalRoute(o)" class="ext-line">
              <text class="ext-tag">{{ o.customFields.fulfillmentRoute }} · {{ extStateLabel(o) }}</text>
              <text v-if="o.customFields.thirdPartyNo" class="ext-no">{{ o.customFields.thirdPartyNo }}</text>
            </view>
            <view v-if="canDispatch" class="row acts">
              <button
                v-if="o.customFields.hallStatus === 'grabbed'"
                class="act ghost" @tap="backToHall(o)"
              >{{ $t('campusDispatch.backHall') }}</button>
              <button
                v-if="o.customFields.hallStatus === 'open'"
                class="act" @tap="assign(o)"
              >{{ $t('campusDispatch.assign') }}</button>
              <button v-if="canPushExternal(o)" class="act ghost" @tap="pushExternal(o)">{{ $t('campusDispatch.pushExternal') }}</button>
              <button v-if="inFlightExternal(o)" class="act ghost" @tap="cancelExternal(o)">{{ $t('campusDispatch.cancelExternal') }}</button>
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
  campusAdminDispatchExternal,
  campusAdminCancelExternal,
  type CampusDispatchBoardData,
  type DispatchAlert,
  type DispatchOrder,
  type HandedException,
} from '../../apis/campus';
import { fetchCouponTemplates, type CouponTemplateItem } from '../../apis/coupon';
import { graphQlErrorMsg } from '../../apis/client';
import { yuanToFen, fenToYuanFixed } from '../../utils/money';
import { useLocaleStore } from '../../stores/localeStore';
import { useAuthStore } from '../../stores/authStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusViewDispatch');

const locale = useLocaleStore();
const auth = useAuthStore();
/** 调度写操作需 CampusDispatch；仅有 CampusViewDispatch 时为只读看板 */
const canDispatch = computed(() => auth.hasPermission('CampusDispatch'));
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
// F12 残留收口：退差价/补偿券/重派均为资金或调度动作，与全额退单同款二次确认（留痕不可撤销）
function confirmHandle(title: string, a: DispatchAlert, run: () => void) {
  uni.showModal({
    title,
    content: `${a.orderCode} · ${locale.t('campusDispatch.excConfirmBody')}`,
    success: (r: any) => {
      if (r.confirm) run();
    },
  });
}
function handleDiff(a: DispatchAlert) {
  const fen = yuanToFen(excAmount[a.orderId] ?? '');
  if (!fen || fen <= 0) {
    uni.showToast({ title: locale.t('campusDispatch.excAmountInvalid'), icon: 'none' });
    return;
  }
  confirmHandle(locale.t('campusDispatch.excDiffConfirmTitle'), a, () => void runHandle(a, 'refund_diff', { amount: fen }));
}
function handleCoupon(a: DispatchAlert) {
  const tplId = excCouponPick[a.orderId];
  if (!tplId) {
    uni.showToast({ title: locale.t('campusDispatch.excPickCouponPh'), icon: 'none' });
    return;
  }
  confirmHandle(locale.t('campusDispatch.excCouponConfirmTitle'), a, () => void runHandle(a, 'coupon', { couponTemplateId: tplId }));
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
function handleReassign(a: DispatchAlert) {
  confirmHandle(locale.t('campusDispatch.excReassignConfirmTitle'), a, () => void doReassign(a));
}
async function doReassign(a: DispatchAlert) {
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
    return `${locale.t('campusDispatch.actRefundDiff')} ¥${fenToYuanFixed(h.compensation)}`;
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

/** plan 3.3 顺路组：当前列内同 routeGroupId 的单数（>1 显示徽标） */
function routeCount(o: any, list: any[]): number {
  const gid = o.customFields?.routeGroupId;
  if (!gid) return 1;
  return list.filter((x: any) => x.customFields?.routeGroupId === gid).length;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    stale_open: locale.t('campusDispatch.alertStaleOpen'),
    sla_breach: locale.t('campusDispatch.alertSla'),
    slot_full: locale.t('campusDispatch.alertSlotFull'),
    exception: locale.t('campusDispatch.alertException'),
    urged: locale.t('campusDispatch.alertUrged'),
  };
  return map[type] ?? type;
}

function causeLabel(cause: string): string {
  const map: Record<string, string> = {
    slot_full: locale.t('campusDispatch.causeSlotFull'),
    no_rider: locale.t('campusDispatch.causeNoRider'),
    merchant_timeout: locale.t('campusDispatch.causeMerchantTimeout'),
    external_cancel_failed: locale.t('campusDispatch.causeExternalCancelFailed'),
    address_change_cancel_failed: locale.t('campusDispatch.causeAddressChangeCancelFailed'),
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

// —— 外部快递（R2/R3）：运营侧手动推送/重推与取消 ——
/** R2/R3 才可能走外部快递；具体 provider 是否可用由后端按店铺路线配置校验 */
function isExternalRoute(o: DispatchOrder): boolean {
  return ['R2', 'R3'].includes(String(o.customFields.fulfillmentRoute ?? ''));
}

/** 已推送且在途（平台未取消/未异常），此时不重复下单 */
function inFlightExternal(o: DispatchOrder): boolean {
  const cf = o.customFields;
  return !!cf.thirdPartyNo && !['cancelled', 'exception'].includes(String(cf.thirdPartyState ?? ''));
}

function canPushExternal(o: DispatchOrder): boolean {
  return isExternalRoute(o) && !inFlightExternal(o);
}

const pushableActive = computed(() => board.value.activeOrders.filter(canPushExternal));

function providerLabel(code: string | null): string {
  if (code === 'dada') return locale.t('campusDispatch.providerDada');
  if (code === 'meituan') return locale.t('campusDispatch.providerMeituan');
  return code ?? '';
}

function extStateLabel(o: DispatchOrder): string {
  const cf = o.customFields;
  if (!cf.thirdPartyNo) return locale.t('campusDispatch.extPending');
  const map: Record<string, string> = {
    accepted: locale.t('campusDispatch.extAccepted'),
    pickup: locale.t('campusDispatch.extPickup'),
    delivering: locale.t('campusDispatch.extDelivering'),
    delivered: locale.t('campusDispatch.extDelivered'),
    cancelled: locale.t('campusDispatch.extCancelledState'),
    exception: locale.t('campusDispatch.extExceptionState'),
  };
  const state = String(cf.thirdPartyState ?? '');
  const text = map[state] ?? (state || locale.t('campusDispatch.extPushed'));
  return cf.thirdPartyProvider ? `${providerLabel(cf.thirdPartyProvider)} · ${text}` : text;
}

function confirmDialog(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      success: (r: any) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
}

function pickProvider(): Promise<'dada' | 'meituan' | null> {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: [locale.t('campusDispatch.providerDada'), locale.t('campusDispatch.providerMeituan')],
      success: ({ tapIndex }) => resolve(tapIndex === 1 ? 'meituan' : 'dada'),
      fail: () => resolve(null),
    });
  });
}

async function doPushExternal(o: DispatchOrder, provider: 'dada' | 'meituan'): Promise<boolean> {
  try {
    const res = await campusAdminDispatchExternal(o.id, provider);
    uni.showToast({
      title: res.already ? locale.t('campusDispatch.extAlready') : locale.t('campusDispatch.extPushed'),
      icon: res.already ? 'none' : 'success',
    });
    return true;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusDispatch.pushFailed')), icon: 'none' });
    return false;
  }
}

async function pushExternal(o: DispatchOrder) {
  const provider = await pickProvider();
  if (!provider) return;
  const ok = await confirmDialog(
    locale.t('campusDispatch.pushExternal'),
    `${o.code} · ${providerLabel(provider)}`,
  );
  if (!ok) return;
  await doPushExternal(o, provider);
  await refresh();
}

/** 批量重推：对进行中列所有「路线支持且未在途」的单顺序推送，失败的逐单提示后继续 */
async function pushExternalBatch() {
  const list = pushableActive.value.slice();
  if (!list.length) return;
  const provider = await pickProvider();
  if (!provider) return;
  const ok = await confirmDialog(
    locale.t('campusDispatch.pushExternal'),
    locale.t('campusDispatch.pushBatchConfirm')
      .replace('{n}', String(list.length))
      .replace('{p}', providerLabel(provider)),
  );
  if (!ok) return;
  let done = 0;
  for (const o of list) {
    if (await doPushExternal(o, provider)) done += 1;
  }
  uni.showToast({
    title: locale.t('campusDispatch.pushBatchDone').replace('{n}', String(done)),
    icon: 'none',
  });
  await refresh();
}

async function cancelExternal(o: DispatchOrder) {
  const ok = await confirmDialog(
    locale.t('campusDispatch.cancelExternal'),
    `${o.code} · ${locale.t('campusDispatch.cancelExternalHint')}`,
  );
  if (!ok) return;
  try {
    await campusAdminCancelExternal(o.id);
    uni.showToast({ title: locale.t('campusDispatch.extCancelled'), icon: 'success' });
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
    &.readonly { color: #c47b00; background: #fff7e6; border: 1.5px solid #ffe1a8; }
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
    .batch { margin-left: auto; font-size: 22rpx; color: $wa-accent; } }
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
    .ext-line { display: flex; align-items: center; gap: 12rpx; padding-top: 8rpx;
      .ext-tag { font-size: 20rpx; color: #0a8f4d; background: rgba(29, 201, 129, .12);
        padding: 2rpx 12rpx; border-radius: 999rpx; }
      .ext-no { font-size: 22rpx; color: $wa-muted; font-family: monospace; } }
    .route-tag { font-size: 20rpx; color: #0a8f4d; background: rgba(29, 201, 129, .12); padding: 2rpx 12rpx; border-radius: 999rpx; }
    .acts { padding-top: 16rpx; display: flex; flex-wrap: wrap; gap: 12rpx;
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

<template>
  <view class="page">
    <view class="tabs">
      <view
        v-for="t in TABS" :key="t.key"
        class="tab" :class="{ on: tab === t.key }" @tap="switchTab(t.key)"
      >{{ $t(t.label) }}<text v-if="badges[t.key]" class="badge">{{ badges[t.key] }}</text></view>
    </view>

    <!-- ===== 客服工单 ===== -->
    <block v-if="tab === 'tickets'">
      <view class="filters">
        <view
          v-for="f in TICKET_FILTERS" :key="f.key"
          class="chip" :class="{ on: ticketStatus === f.key }" @tap="setTicketStatus(f.key)"
        >{{ $t(f.label) }}</view>
      </view>
      <view v-if="ticketsLoading && !tickets.length" class="hint">{{ $t('campusOps.loading') }}</view>
      <view v-else-if="!tickets.length" class="hint">{{ $t('campusOps.empty') }}</view>
      <view v-for="t in tickets" :key="t.id" class="card">
        <view class="row head">
          <text class="name">{{ t.customerName || $t('campusOps.anonymous') }}</text>
          <text class="pill" :class="t.status">{{ ticketStatusLabel(t.status) }}</text>
        </view>
        <view class="meta">
          <text v-if="t.customerPhone" class="m">{{ t.customerPhone }}</text>
          <text v-if="t.orderCode" class="m">#{{ t.orderCode }}</text>
          <text class="m tag">{{ categoryLabel(t.category) }}</text>
        </view>
        <text class="content">{{ t.content }}</text>
        <view v-if="t.images && t.images.length" class="imgs">
          <image
            v-for="(img, i) in t.images" :key="i"
            class="img" :src="img" mode="aspectFill"
            @tap="preview(t.images!, i)"
          />
        </view>
        <view v-if="t.reply" class="reply">
          <text class="reply-lbl">{{ $t('campusOps.replyLabel') }}</text>
          <text class="reply-txt">{{ t.reply }}</text>
          <text v-if="t.repliedAt" class="time">{{ fullTime(t.repliedAt) }}</text>
        </view>
        <view class="row foot">
          <text class="time">{{ fullTime(t.createdAt) }}</text>
          <button v-if="t.status !== 'closed'" class="act ghost" @tap="openReply(t)">
            {{ $t('campusOps.replyBtn') }}
          </button>
          <button v-if="t.status !== 'closed'" class="act ghost danger" @tap="closeTicket(t)">
            {{ $t('campusOps.closeBtn') }}
          </button>
        </view>
      </view>
      <button
        v-if="tickets.length < ticketsTotal" class="more" :disabled="ticketsLoading"
        @tap="loadTickets(false)"
      >{{ ticketsLoading ? $t('campusOps.loading') : $t('campusOps.loadMore') }}</button>
    </block>

    <!-- ===== 骑手申诉 ===== -->
    <block v-if="tab === 'appeals'">
      <view class="filters">
        <view
          v-for="f in APPEAL_FILTERS" :key="f.key"
          class="chip" :class="{ on: appealStatus === f.key }" @tap="setAppealStatus(f.key)"
        >{{ $t(f.label) }}</view>
      </view>
      <view v-if="appealsLoading && !appeals.length" class="hint">{{ $t('campusOps.loading') }}</view>
      <view v-else-if="!appeals.length" class="hint">{{ $t('campusOps.empty') }}</view>
      <view v-for="a in appeals" :key="a.id" class="card">
        <view class="row head">
          <text class="name">{{ a.riderName || $t('campusOps.anonymous') }}</text>
          <text class="pill" :class="a.status">{{ appealStatusLabel(a.status) }}</text>
        </view>
        <view class="meta">
          <text v-if="a.riderPhone" class="m">{{ a.riderPhone }}</text>
          <text v-if="a.orderCode" class="m">#{{ a.orderCode }}</text>
        </view>
        <text class="content">{{ a.reason }}</text>
        <view v-if="a.images && a.images.length" class="imgs">
          <image
            v-for="(img, i) in a.images" :key="i"
            class="img" :src="img" mode="aspectFill"
            @tap="preview(a.images!, i)"
          />
        </view>
        <view v-if="a.status !== 'pending'" class="reply">
          <text class="reply-lbl">{{ $t('campusOps.reviewNote') }}{{ a.reviewNote ? '：' + a.reviewNote : '' }}</text>
          <text class="reply-txt">
            {{ $t('campusOps.creditDelta') }} {{ a.creditDelta > 0 ? '+' : '' }}{{ a.creditDelta }}
          </text>
          <text v-if="a.reviewedAt" class="time">{{ fullTime(a.reviewedAt) }}</text>
        </view>
        <view class="row foot">
          <text class="time">{{ fullTime(a.createdAt) }}</text>
          <template v-if="a.status === 'pending'">
            <button class="act" @tap="openAppeal(a, true)">{{ $t('campusOps.approveBtn') }}</button>
            <button class="act ghost danger" @tap="openAppeal(a, false)">{{ $t('campusOps.rejectBtn') }}</button>
          </template>
        </view>
      </view>
      <button
        v-if="appeals.length < appealsTotal" class="more" :disabled="appealsLoading"
        @tap="loadAppeals(false)"
      >{{ appealsLoading ? $t('campusOps.loading') : $t('campusOps.loadMore') }}</button>
    </block>

    <!-- ===== 黑名单 ===== -->
    <block v-if="tab === 'blacklist'">
      <view class="card form">
        <text class="form-title">{{ $t('campusOps.blAddTitle') }}</text>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.blType') }}</text>
          <view class="seg">
            <view class="seg-item" :class="{ on: blType === 'phone' }" @tap="blType = 'phone'">
              {{ $t('campusOps.blTypePhone') }}
            </view>
            <view class="seg-item" :class="{ on: blType === 'user' }" @tap="blType = 'user'">
              {{ $t('campusOps.blTypeUser') }}
            </view>
          </view>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.blValue') }}</text>
          <input
            v-model="blValue"
            :placeholder="blType === 'phone' ? $t('campusOps.blValuePhPhone') : $t('campusOps.blValuePhUser')"
          />
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.blReason') }}</text>
          <input v-model="blReason" :placeholder="$t('campusOps.blReasonPh')" />
        </view>
        <button class="primary" :disabled="blSaving" @tap="submitBlacklist">
          {{ blSaving ? $t('campusOps.submitting') : $t('campusOps.blAdd') }}
        </button>
      </view>

      <view class="card form">
        <text class="form-title">{{ $t('campusOps.blImportTitle') }}</text>
        <view class="cell col">
          <textarea
            v-model="blBatch"
            class="batch"
            :placeholder="blType === 'phone' ? $t('campusOps.blImportPhPhone') : $t('campusOps.blImportPhUser')"
            auto-height
          />
        </view>
        <text class="batch-hint">{{ $t('campusOps.blImportHint') }}</text>
        <button class="primary" :disabled="blImporting" @tap="submitImportBlacklist">
          {{ blImporting ? $t('campusOps.submitting') : $t('campusOps.blImport') }}
        </button>
      </view>

      <view v-if="blLoading && !blacklist.length" class="hint">{{ $t('campusOps.loading') }}</view>
      <view v-else-if="!blacklist.length" class="hint">{{ $t('campusOps.empty') }}</view>
      <view v-for="b in blacklist" :key="b.id" class="card">
        <view class="row head">
          <text class="name">{{ b.type === 'user' ? $t('campusOps.blTypeUser') : $t('campusOps.blTypePhone') }}</text>
          <text class="pill" :class="b.active ? 'closed' : 'open'">
            {{ b.active ? $t('campusOps.blActive') : $t('campusOps.blInactive') }}
          </text>
        </view>
        <view class="meta">
          <text class="m">{{ b.customerId || b.phone || '—' }}</text>
        </view>
        <text v-if="b.reason" class="content">{{ b.reason }}</text>
        <view class="row foot">
          <text class="time">{{ b.createdBy || '' }} · {{ fullTime(b.createdAt) }}</text>
          <button v-if="b.active" class="act ghost danger" @tap="removeEntry(b)">
            {{ $t('campusOps.blRemove') }}
          </button>
        </view>
      </view>
      <button
        v-if="blacklist.length < blTotal" class="more" :disabled="blLoading"
        @tap="loadBlacklist(false)"
      >{{ blLoading ? $t('campusOps.loading') : $t('campusOps.loadMore') }}</button>
    </block>

    <!-- ===== 班次与在线时长 ===== -->
    <block v-if="tab === 'shifts'">
      <view class="datebar">
        <text class="dlbl">{{ $t('campusOps.date') }}</text>
        <picker mode="date" :value="shiftDate" @change="onDateChange">
          <text class="dval">{{ shiftDate }}</text>
        </picker>
        <text class="add" @tap="startCreateShift">{{ $t('campusOps.shiftAdd') }}</text>
      </view>

      <view v-if="shiftsLoading && !shifts.length" class="hint">{{ $t('campusOps.loading') }}</view>
      <view v-else-if="!shifts.length" class="hint">{{ $t('campusOps.shiftEmpty') }}</view>
      <view v-for="s in shifts" :key="s.id" class="card">
        <view class="row head">
          <text class="name">{{ s.realName || riderName(s.riderCustomerId) }}</text>
          <text class="time">{{ s.startTime }} - {{ s.endTime }}</text>
        </view>
        <view class="meta">
          <text class="m">{{ $t('campusOps.shiftTime') }} {{ fmtMinutes(s.shiftMinutes) }}</text>
          <text class="m">{{ $t('campusOps.shiftOnline') }} {{ fmtMinutes(s.onlineMinutes) }}</text>
        </view>
        <text v-if="s.note" class="content">{{ s.note }}</text>
        <view class="row foot">
          <button class="act ghost" @tap="startEditShift(s)">{{ $t('campusOps.shiftEditTitle') }}</button>
          <button class="act ghost danger" @tap="removeShift(s)">{{ $t('campusOps.shiftDelete') }}</button>
        </view>
      </view>

      <view v-if="shiftEditing" class="card form">
        <view class="row head">
          <text class="form-title">{{ shiftEditing.id ? $t('campusOps.shiftEditTitle') : $t('campusOps.shiftAdd') }}</text>
          <text class="close" @tap="shiftEditing = null">×</text>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.shiftRider') }}</text>
          <picker
            :range="riderLabels" :value="riderIndex"
            @change="onShiftRiderChange"
          ><text class="picker">{{ currentRiderName }}</text></picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.shiftStart') }}</text>
          <picker mode="time" :value="shiftEditing.startTime" @change="e => onShiftTime(e, 'startTime')">
            <text class="picker">{{ shiftEditing.startTime }}</text>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.shiftEnd') }}</text>
          <picker mode="time" :value="shiftEditing.endTime" @change="e => onShiftTime(e, 'endTime')">
            <text class="picker">{{ shiftEditing.endTime }}</text>
          </picker>
        </view>
        <view class="cell">
          <text class="lbl">{{ $t('campusOps.shiftNote') }}</text>
          <input v-model="shiftEditing.note" :placeholder="$t('campusOps.shiftNotePh')" />
        </view>
        <button class="primary" :disabled="shiftSaving" @tap="saveShift">
          {{ shiftSaving ? $t('campusOps.submitting') : $t('campusOps.shiftSave') }}
        </button>
      </view>

      <view class="card">
        <text class="form-title">{{ $t('campusOps.onlineRank') }}</text>
        <view v-if="!onlineStats.length" class="hint small">{{ $t('campusOps.empty') }}</view>
        <view v-for="(o, i) in onlineStats" :key="o.riderCustomerId" class="rank">
          <text class="rk">{{ i + 1 }}</text>
          <text class="rname">{{ o.realName }}</text>
          <text class="rval">{{ fmtMinutes(o.onlineMinutes) }}</text>
        </view>
      </view>
    </block>

    <!-- ===== 骑手评分 ===== -->
    <block v-if="tab === 'reviews'">
      <view class="datebar">
        <text class="dlbl">{{ $t('campusOps.reviewRider') }}</text>
        <picker
          :range="riderLabels" :value="reviewRiderIndex"
          @change="onReviewRiderChange"
        ><text class="dval">{{ reviewRiderName }}</text></picker>
      </view>

      <view v-if="rating" class="card rating">
        <text class="avg">{{ rating.avgRating.toFixed(1) }}</text>
        <view class="rating-r">
          <text class="stars">{{ stars(rating.avgRating) }}</text>
          <text class="cnt">{{ $t('campusOps.reviewCount') }} {{ rating.ratingCount }}</text>
        </view>
      </view>

      <view v-if="reviewsLoading && !reviews.length" class="hint">{{ $t('campusOps.loading') }}</view>
      <view v-else-if="!reviews.length" class="hint">{{ $t('campusOps.reviewEmpty') }}</view>
      <view v-for="r in reviews" :key="r.id" class="card">
        <view class="row head">
          <text class="stars">{{ stars(r.rating) }}</text>
          <text class="time">{{ fullTime(r.createdAt) }}</text>
        </view>
        <view v-if="r.tags && r.tags.length" class="tags">
          <text v-for="(tg, i) in r.tags" :key="i" class="tag">{{ tg }}</text>
        </view>
        <text v-if="r.comment" class="content">{{ r.comment }}</text>
        <view class="row foot">
          <text class="m">{{ $t('campusOps.orderLabel') }} {{ r.orderId }}</text>
        </view>
      </view>
      <button v-if="reviewsHasMore" class="more" :disabled="reviewsLoading" @tap="loadReviews(false)">
        {{ reviewsLoading ? $t('campusOps.loading') : $t('campusOps.loadMore') }}
      </button>
    </block>

    <!-- 回复工单弹框 -->
    <view v-if="replyTarget" class="mask" @tap="replyTarget = null">
      <view class="modal" @tap.stop>
        <text class="modal-title">{{ $t('campusOps.replyTitle') }}</text>
        <textarea v-model="replyText" class="ta" :placeholder="$t('campusOps.replyPh')" />
        <view class="row modal-actions">
          <button class="act ghost" @tap="replyTarget = null">{{ $t('campusOps.cancel') }}</button>
          <button class="act" :disabled="!!acting" @tap="submitReply">
            {{ acting ? $t('campusOps.submitting') : $t('campusOps.submit') }}
          </button>
        </view>
      </view>
    </view>

    <!-- 申诉审核弹框 -->
    <view v-if="appealTarget" class="mask" @tap="appealTarget = null">
      <view class="modal" @tap.stop>
        <text class="modal-title">
          {{ appealApprove ? $t('campusOps.approveTitle') : $t('campusOps.rejectTitle') }}
        </text>
        <view v-if="appealApprove" class="cell">
          <text class="lbl">{{ $t('campusOps.creditDelta') }}</text>
          <input v-model="appealCredit" type="number" :placeholder="$t('campusOps.creditPh')" />
        </view>
        <textarea v-model="appealNote" class="ta" :placeholder="$t('campusOps.notePh')" />
        <view class="row modal-actions">
          <button class="act ghost" @tap="appealTarget = null">{{ $t('campusOps.cancel') }}</button>
          <button class="act" :disabled="!!acting" @tap="submitAppeal">
            {{ acting ? $t('campusOps.submitting') : $t('campusOps.submit') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 运营中心：客服工单 / 骑手申诉 / 黑名单 / 班次与在线时长 / 骑手评分 五个 tab，统一分页「加载更多」。
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  addBlacklist,
  deleteRiderShift,
  fetchBlacklist,
  fetchRiderAppeals,
  fetchRiderOnlineStats,
  fetchRiderRating,
  fetchRiderReviews,
  fetchRiderShifts,
  fetchSupportTickets,
  importBlacklist,
  removeBlacklist,
  replySupportTicket,
  reviewRiderAppeal,
  saveRiderShift,
  type BlacklistEntry,
  type RiderAppeal,
  type RiderOnlineStat,
  type RiderRating,
  type RiderReview,
  type RiderShift,
  type SupportTicket,
} from '../../apis/campus-ops';
import { fetchRiderApplications } from '../../apis/rider-audit';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusDispatch');

const TABS = [
  { key: 'tickets', label: 'campusOps.tabTickets' },
  { key: 'appeals', label: 'campusOps.tabAppeals' },
  { key: 'blacklist', label: 'campusOps.tabBlacklist' },
  { key: 'shifts', label: 'campusOps.tabShifts' },
  { key: 'reviews', label: 'campusOps.tabReviews' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const TICKET_FILTERS = [
  { key: '', label: 'campusOps.filterAll' },
  { key: 'open', label: 'campusOps.ticketOpen' },
  { key: 'replied', label: 'campusOps.ticketReplied' },
  { key: 'closed', label: 'campusOps.ticketClosed' },
] as const;

const APPEAL_FILTERS = [
  { key: '', label: 'campusOps.filterAll' },
  { key: 'pending', label: 'campusOps.appealPending' },
  { key: 'approved', label: 'campusOps.appealApproved' },
  { key: 'rejected', label: 'campusOps.appealRejected' },
] as const;

const TAKE = 20;

const locale = useLocaleStore();
const tab = ref<TabKey>('tickets');
const loaded = ref<Record<TabKey, boolean>>({
  tickets: false, appeals: false, blacklist: false, shifts: false, reviews: false,
});

function toast(title: string, ok = false): void {
  uni.showToast({ title, icon: ok ? 'success' : 'none' });
}

function fullTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function preview(urls: string[], index: number): void {
  uni.previewImage({ urls, current: urls[index] });
}

function stars(n: number): string {
  const full = Math.round(n);
  return '★★★★★'.slice(0, Math.max(0, Math.min(5, full))).padEnd(5, '☆');
}

/** 服务端枚举按状态展示，未知值原样回退 */
function ticketStatusLabel(s: string): string {
  const key = `campusOps.ticket${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  const txt = locale.t(key);
  return txt === key ? s : txt;
}
function appealStatusLabel(s: string): string {
  const key = `campusOps.appeal${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  const txt = locale.t(key);
  return txt === key ? s : txt;
}
function categoryLabel(c: string): string {
  const key = `campusOps.category.${c}`;
  const txt = locale.t(key);
  return txt === key ? c : txt;
}
function fmtMinutes(n?: number | null): string {
  if (n == null) return '—';
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m}${locale.t('campusOps.minUnit')}`;
  return `${h}${locale.t('campusOps.hourUnit')}${m ? `${m}${locale.t('campusOps.minUnit')}` : ''}`;
}

// ===== 客服工单 =====
const tickets = ref<SupportTicket[]>([]);
const ticketsTotal = ref(0);
const ticketStatus = ref('');
const ticketsLoading = ref(false);
/** 请求序号：切换筛选时旧请求回包作废，避免旧列表覆盖新筛选 */
let ticketsSeq = 0;

async function loadTickets(reset: boolean): Promise<void> {
  const seq = ++ticketsSeq;
  ticketsLoading.value = true;
  try {
    const skip = reset ? 0 : tickets.value.length;
    const res = await fetchSupportTickets(ticketStatus.value, skip, TAKE);
    if (seq !== ticketsSeq) return;
    tickets.value = reset ? res.items : [...tickets.value, ...res.items];
    ticketsTotal.value = res.total;
    loaded.value.tickets = true;
  } catch (err: any) {
    if (seq !== ticketsSeq) return;
    toast(graphQlErrorMsg(err, locale.t('campusOps.loadFailed')));
  } finally {
    if (seq === ticketsSeq) ticketsLoading.value = false;
  }
}

function setTicketStatus(s: string): void {
  if (ticketStatus.value === s) return;
  ticketStatus.value = s;
  tickets.value = [];
  ticketsTotal.value = 0;
  void loadTickets(true);
}

const replyTarget = ref<SupportTicket | null>(null);
const replyText = ref('');
const acting = ref('');

function openReply(t: SupportTicket): void {
  replyTarget.value = t;
  replyText.value = t.reply ?? '';
}

function replaceTicket(updated: SupportTicket): void {
  const i = tickets.value.findIndex((x) => x.id === updated.id);
  if (i >= 0) tickets.value[i] = updated;
}

async function submitReply(): Promise<void> {
  const t = replyTarget.value;
  if (!t || acting.value) return;
  const text = replyText.value.trim();
  if (!text) {
    toast(locale.t('campusOps.needReply'));
    return;
  }
  acting.value = t.id;
  try {
    const updated = await replySupportTicket(t.id, text, 'replied');
    replaceTicket(updated);
    replyTarget.value = null;
    toast(locale.t('campusOps.replyDone'), true);
    void refreshBadges();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    acting.value = '';
  }
}

async function closeTicket(t: SupportTicket): Promise<void> {
  if (acting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusOps.closeTitle'),
      content: locale.t('campusOps.closeConfirm'),
      confirmText: locale.t('campusOps.closeBtn'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  acting.value = t.id;
  try {
    const updated = await replySupportTicket(t.id, t.reply ?? '', 'closed');
    replaceTicket(updated);
    toast(locale.t('campusOps.closeDone'), true);
    void refreshBadges();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 骑手申诉 =====
const appeals = ref<RiderAppeal[]>([]);
const appealsTotal = ref(0);
const appealStatus = ref('');
const appealsLoading = ref(false);
let appealsSeq = 0;

async function loadAppeals(reset: boolean): Promise<void> {
  const seq = ++appealsSeq;
  appealsLoading.value = true;
  try {
    const skip = reset ? 0 : appeals.value.length;
    const res = await fetchRiderAppeals(appealStatus.value, skip, TAKE);
    if (seq !== appealsSeq) return;
    appeals.value = reset ? res.items : [...appeals.value, ...res.items];
    appealsTotal.value = res.total;
    loaded.value.appeals = true;
  } catch (err: any) {
    if (seq !== appealsSeq) return;
    toast(graphQlErrorMsg(err, locale.t('campusOps.loadFailed')));
  } finally {
    if (seq === appealsSeq) appealsLoading.value = false;
  }
}

function setAppealStatus(s: string): void {
  if (appealStatus.value === s) return;
  appealStatus.value = s;
  appeals.value = [];
  appealsTotal.value = 0;
  void loadAppeals(true);
}

const appealTarget = ref<RiderAppeal | null>(null);
const appealApprove = ref(true);
const appealCredit = ref('10');
const appealNote = ref('');

function openAppeal(a: RiderAppeal, approve: boolean): void {
  appealTarget.value = a;
  appealApprove.value = approve;
  appealCredit.value = '10';
  appealNote.value = '';
}

async function submitAppeal(): Promise<void> {
  const a = appealTarget.value;
  if (!a || acting.value) return;
  const note = appealNote.value.trim();
  if (!appealApprove.value && !note) {
    toast(locale.t('campusOps.needNote'));
    return;
  }
  const credit = appealApprove.value ? Number(appealCredit.value) : 0;
  if (appealApprove.value && (!Number.isFinite(credit) || credit < 0)) {
    toast(locale.t('campusOps.badCredit'));
    return;
  }
  acting.value = a.id;
  try {
    const updated = await reviewRiderAppeal(a.id, appealApprove.value, appealApprove.value ? credit : null, note || null);
    const i = appeals.value.findIndex((x) => x.id === updated.id);
    if (i >= 0) appeals.value[i] = updated;
    appealTarget.value = null;
    toast(locale.t('campusOps.reviewDone'), true);
    void refreshBadges();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 黑名单 =====
const blacklist = ref<BlacklistEntry[]>([]);
const blTotal = ref(0);
const blLoading = ref(false);
const blSaving = ref(false);
const blType = ref<'user' | 'phone'>('phone');
const blValue = ref('');
const blReason = ref('');
const blBatch = ref('');
const blImporting = ref(false);

async function loadBlacklist(reset: boolean): Promise<void> {
  if (blLoading.value) return;
  blLoading.value = true;
  try {
    const skip = reset ? 0 : blacklist.value.length;
    const res = await fetchBlacklist(skip, TAKE);
    blacklist.value = reset ? res.items : [...blacklist.value, ...res.items];
    blTotal.value = res.total;
    loaded.value.blacklist = true;
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.loadFailed')));
  } finally {
    blLoading.value = false;
  }
}

async function submitBlacklist(): Promise<void> {
  if (blSaving.value) return;
  const value = blValue.value.trim();
  if (!value) {
    toast(locale.t('campusOps.blNeedValue'));
    return;
  }
  blSaving.value = true;
  try {
    const entry = await addBlacklist(blType.value, value, blReason.value.trim() || null);
    blacklist.value = [entry, ...blacklist.value];
    blTotal.value += 1;
    blValue.value = '';
    blReason.value = '';
    toast(locale.t('campusOps.blAdded'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    blSaving.value = false;
  }
}

/** 批量导入：每行一条，按当前类型解析（手机号 / customerId） */
async function submitImportBlacklist(): Promise<void> {
  if (blImporting.value) return;
  const values = blBatch.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!values.length) {
    toast(locale.t('campusOps.blImportNeed'));
    return;
  }
  blImporting.value = true;
  try {
    const r = await importBlacklist(blType.value, values, blReason.value.trim() || null);
    toast(
      locale
        .t('campusOps.blImportDone')
        .replace('{added}', String(r.added))
        .replace('{skipped}', String(r.skipped))
        .replace('{invalid}', String(r.invalid)),
      true,
    );
    blBatch.value = '';
    await loadBlacklist(true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    blImporting.value = false;
  }
}

async function removeEntry(b: BlacklistEntry): Promise<void> {
  if (acting.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusOps.blRemoveTitle'),
      content: locale.t('campusOps.blRemoveConfirm'),
      confirmText: locale.t('campusOps.blRemove'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  acting.value = b.id;
  try {
    await removeBlacklist(b.id);
    blacklist.value = blacklist.value.filter((x) => x.id !== b.id);
    blTotal.value = Math.max(0, blTotal.value - 1);
    toast(locale.t('campusOps.blRemoved'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    acting.value = '';
  }
}

// ===== 骑手名单（班次/评分共用） =====
const riders = ref<{ id: string; name: string }[]>([]);
const riderLabels = computed(() => riders.value.map((r) => r.name));

function riderName(id: string): string {
  return riders.value.find((r) => r.id === id)?.name ?? id;
}

async function loadRiders(): Promise<void> {
  if (riders.value.length) return;
  try {
    const res = await fetchRiderApplications('approved', 0, 200);
    riders.value = res.items.map((r) => ({
      id: r.id,
      name: r.customFields?.riderRealName
        || [r.firstName, r.lastName].filter(Boolean).join(' ')
        || r.emailAddress,
    }));
  } catch {
    // 名单加载失败不阻塞 tab，选择器回退为空
  }
}

// ===== 班次与在线时长 =====
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const shiftDate = ref(todayStr());
const shifts = ref<RiderShift[]>([]);
const shiftsLoading = ref(false);
const onlineStats = ref<RiderOnlineStat[]>([]);
const shiftEditing = ref<{
  id: string | null;
  riderCustomerId: string;
  startTime: string;
  endTime: string;
  note: string;
} | null>(null);
const shiftSaving = ref(false);

const riderIndex = computed(() => {
  const i = riders.value.findIndex((r) => r.id === shiftEditing.value?.riderCustomerId);
  return i >= 0 ? i : 0;
});
const currentRiderName = computed(() => {
  const id = shiftEditing.value?.riderCustomerId;
  return id ? riderName(id) : locale.t('campusOps.riderPick');
});

async function loadShifts(): Promise<void> {
  shiftsLoading.value = true;
  try {
    const [res, stats] = await Promise.all([
      fetchRiderShifts(shiftDate.value),
      fetchRiderOnlineStats(shiftDate.value),
    ]);
    shifts.value = res.items;
    onlineStats.value = stats.items;
    loaded.value.shifts = true;
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.loadFailed')));
  } finally {
    shiftsLoading.value = false;
  }
}

function onDateChange(e: any): void {
  const d = String(e?.detail?.value ?? '');
  if (!d || d === shiftDate.value) return;
  shiftDate.value = d;
  shiftEditing.value = null;
  void loadShifts();
}

function startCreateShift(): void {
  if (!riders.value.length) {
    toast(locale.t('campusOps.needRider'));
    return;
  }
  shiftEditing.value = {
    id: null,
    riderCustomerId: riders.value[0].id,
    startTime: '10:00',
    endTime: '14:00',
    note: '',
  };
}

function startEditShift(s: RiderShift): void {
  shiftEditing.value = {
    id: s.id,
    riderCustomerId: s.riderCustomerId,
    startTime: s.startTime,
    endTime: s.endTime,
    note: s.note ?? '',
  };
}

function onShiftRiderChange(e: any): void {
  const i = Number(e?.detail?.value ?? 0);
  if (shiftEditing.value && riders.value[i]) shiftEditing.value.riderCustomerId = riders.value[i].id;
}

function onShiftTime(e: any, field: 'startTime' | 'endTime'): void {
  const v = String(e?.detail?.value ?? '');
  if (shiftEditing.value && v) shiftEditing.value[field] = v;
}

async function saveShift(): Promise<void> {
  const f = shiftEditing.value;
  if (!f || shiftSaving.value) return;
  if (!f.riderCustomerId) {
    toast(locale.t('campusOps.needRider'));
    return;
  }
  if (!f.startTime || !f.endTime || f.startTime >= f.endTime) {
    toast(locale.t('campusOps.badTime'));
    return;
  }
  shiftSaving.value = true;
  try {
    await saveRiderShift({
      id: f.id,
      riderCustomerId: f.riderCustomerId,
      shiftDate: shiftDate.value,
      startTime: f.startTime,
      endTime: f.endTime,
      note: f.note.trim() || null,
    });
    shiftEditing.value = null;
    toast(locale.t('campusOps.shiftSaved'), true);
    await loadShifts();
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  } finally {
    shiftSaving.value = false;
  }
}

async function removeShift(s: RiderShift): Promise<void> {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('campusOps.shiftDeleteTitle'),
      content: locale.t('campusOps.shiftDeleteConfirm'),
      confirmText: locale.t('campusOps.shiftDelete'),
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  try {
    await deleteRiderShift(s.id);
    shifts.value = shifts.value.filter((x) => x.id !== s.id);
    toast(locale.t('campusOps.shiftDeleted'), true);
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.opFailed')));
  }
}

// ===== 骑手评分 =====
const reviewRiderId = ref('');
const rating = ref<RiderRating | null>(null);
const reviews = ref<RiderReview[]>([]);
const reviewsLoading = ref(false);
const reviewsHasMore = ref(false);

const reviewRiderIndex = computed(() => {
  const i = riders.value.findIndex((r) => r.id === reviewRiderId.value);
  return i >= 0 ? i : 0;
});
const reviewRiderName = computed(() => {
  return reviewRiderId.value ? riderName(reviewRiderId.value) : locale.t('campusOps.riderPick');
});

async function loadReviews(reset: boolean): Promise<void> {
  const id = reviewRiderId.value;
  if (!id || reviewsLoading.value) return;
  reviewsLoading.value = true;
  try {
    const skip = reset ? 0 : reviews.value.length;
    const items = await fetchRiderReviews(id, skip, TAKE);
    reviews.value = reset ? items : [...reviews.value, ...items];
    reviewsHasMore.value = items.length >= TAKE;
    loaded.value.reviews = true;
  } catch (err: any) {
    toast(graphQlErrorMsg(err, locale.t('campusOps.loadFailed')));
  } finally {
    reviewsLoading.value = false;
  }
}

async function loadRating(): Promise<void> {
  const id = reviewRiderId.value;
  if (!id) return;
  try {
    rating.value = await fetchRiderRating(id);
  } catch {
    rating.value = null;
  }
}

async function selectRider(id: string): Promise<void> {
  if (reviewRiderId.value === id) return;
  reviewRiderId.value = id;
  reviews.value = [];
  reviewsHasMore.value = false;
  rating.value = null;
  await Promise.all([loadRating(), loadReviews(true)]);
}

function onReviewRiderChange(e: any): void {
  const i = Number(e?.detail?.value ?? 0);
  const r = riders.value[i];
  if (r) void selectRider(r.id);
}

// ===== tab 切换 =====
function switchTab(k: TabKey): void {
  tab.value = k;
  ensureLoaded(k);
}

// ===== 待办红点（每 60s 轮询：待处理工单 / 待审核申诉） =====
const badges = ref<Partial<Record<TabKey, number>>>({});
let badgeTimer: ReturnType<typeof setInterval> | null = null;

async function refreshBadges(): Promise<void> {
  try {
    const [t, a] = await Promise.all([
      fetchSupportTickets('open', 0, 1),
      fetchRiderAppeals('pending', 0, 1),
    ]);
    const next: Partial<Record<TabKey, number>> = { tickets: t.total, appeals: a.total };
    const changedTickets = next.tickets !== badges.value.tickets;
    const changedAppeals = next.appeals !== badges.value.appeals;
    badges.value = next;
    // 当前正在看的列表有新待办时静默重载，运营无需手动刷新
    if (changedTickets && tab.value === 'tickets' && ticketStatus.value === 'open' && !ticketsLoading.value) {
      void loadTickets(true);
    }
    if (changedAppeals && tab.value === 'appeals' && appealStatus.value === 'pending' && !appealsLoading.value) {
      void loadAppeals(true);
    }
  } catch {
    // 红点失败静默：不打扰运营主流程
  }
}

async function ensureLoaded(k: TabKey): Promise<void> {
  if (loaded.value[k]) return;
  if (k === 'tickets') {
    await loadTickets(true);
  } else if (k === 'appeals') {
    await loadAppeals(true);
  } else if (k === 'blacklist') {
    await loadBlacklist(true);
  } else if (k === 'shifts') {
    await loadRiders();
    await loadShifts();
  } else if (k === 'reviews') {
    await loadRiders();
    if (!reviewRiderId.value && riders.value.length) {
      await selectRider(riders.value[0].id);
    } else {
      await Promise.all([loadRating(), loadReviews(true)]);
    }
  }
}

onMounted(() => {
  void ensureLoaded('tickets');
  void refreshBadges();
  badgeTimer = setInterval(() => void refreshBadges(), 60_000);
});

onUnmounted(() => {
  if (badgeTimer) clearInterval(badgeTimer);
  badgeTimer = null;
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx; padding-bottom: 80rpx;
  .tabs { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1 1 30%; min-width: 190rpx; display: flex; align-items: center; justify-content: center;
      background: $wa-card; border-radius: $wa-radius; padding: 18rpx 0; font-size: 26rpx;
      color: $wa-muted; border: 1.5px solid transparent;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; }
      .badge { margin-left: 8rpx; min-width: 32rpx; height: 32rpx; line-height: 32rpx; padding: 0 8rpx;
        border-radius: 999rpx; background: $wa-danger; color: #fff; font-size: 18rpx;
        text-align: center; font-weight: 600; } } }
  .filters { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 20rpx;
    .chip { padding: 10rpx 26rpx; border-radius: 999rpx; background: $wa-card;
      border: 1.5px solid $wa-rule; font-size: 24rpx; color: $wa-muted;
      &.on { color: $wa-accent; border-color: $wa-accent; font-weight: 600; } } }
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0;
    &.small { padding: 20rpx 0; font-size: 24rpx; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; gap: 16rpx; }
    .head { .name { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
      .close { font-size: 40rpx; color: $wa-muted; padding: 0 8rpx; } }
    .pill { font-size: 20rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      color: $wa-muted; border: 1px solid $wa-rule;
      &.open { color: #c47b00; border-color: #ffd08a; background: #fff7e6; }
      &.replied, &.approved, &.closed { color: $wa-success; border-color: $wa-success; }
      &.pending { color: $wa-accent; border-color: $wa-accent; }
      &.rejected { color: $wa-danger; border-color: $wa-danger; } }
    .meta { display: flex; flex-wrap: wrap; gap: 16rpx; padding-top: 12rpx;
      .m { font-size: 22rpx; color: $wa-muted; }
      .tag { color: $wa-accent; border: 1px solid $wa-accent; border-radius: 6rpx; padding: 0 8rpx; } }
    .content { display: block; font-size: 26rpx; color: $wa-ink; padding-top: 12rpx; word-break: break-all; }
    .imgs { display: flex; flex-wrap: wrap; gap: 10rpx; padding-top: 14rpx;
      .img { width: 200rpx; height: 200rpx; border-radius: 8rpx; background: $wa-bg; } }
    .reply { margin-top: 14rpx; background: $wa-bg; border-left: 6rpx solid $wa-accent;
      border-radius: 8rpx; padding: 12rpx 16rpx;
      .reply-lbl { display: block; font-size: 22rpx; color: $wa-muted; }
      .reply-txt { display: block; font-size: 24rpx; color: $wa-ink; padding-top: 4rpx; word-break: break-all; }
      .time { display: block; font-size: 20rpx; color: $wa-muted; padding-top: 6rpx; } }
    .foot { padding-top: 16rpx; .time { flex: 1; font-size: 20rpx; color: $wa-muted; }
      .act { background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius;
        padding: 0 28rpx; line-height: 60rpx; }
      .act.ghost { background: transparent; border: 1.5px solid $wa-accent; color: $wa-accent; }
      .act.ghost.danger { border-color: $wa-danger; color: $wa-danger; } }
    .tags { display: flex; flex-wrap: wrap; gap: 10rpx; padding-top: 12rpx;
      .tag { font-size: 20rpx; color: $wa-accent; background: $wa-bg; border-radius: 6rpx; padding: 4rpx 12rpx; } }
    .stars { font-size: 26rpx; color: #ff9800; letter-spacing: 2rpx; }
    &.form { border: 1.5px solid $wa-accent; }
    .form-title { display: block; font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-bottom: 8rpx; }
    .cell { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $wa-rule;
      .lbl { width: 170rpx; font-size: 26rpx; color: $wa-ink; flex-shrink: 0; }
      input { flex: 1; font-size: 26rpx; }
      .picker { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .seg { flex: 1; display: flex; gap: 12rpx;
        .seg-item { flex: 1; text-align: center; padding: 12rpx 0; border-radius: $wa-radius;
          background: $wa-bg; font-size: 24rpx; color: $wa-muted;
          &.on { background: $wa-accent; color: #fff; font-weight: 600; } } } }
    .cell.col { flex-direction: column; align-items: stretch; }
    .batch { width: 100%; min-height: 160rpx; font-size: 26rpx; line-height: 1.5; }
    .batch-hint { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; }
    .primary { margin-top: 24rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; }
    &.rating { display: flex; align-items: center; gap: 32rpx;
      .avg { font-size: 64rpx; color: $wa-accent; font-weight: 700; }
      .rating-r { display: flex; flex-direction: column; gap: 8rpx;
        .cnt { font-size: 24rpx; color: $wa-muted; } } }
    .rank { display: flex; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid $wa-rule;
      &:last-child { border-bottom: none; }
      .rk { width: 50rpx; font-size: 24rpx; color: $wa-muted; }
      .rname { flex: 1; font-size: 26rpx; color: $wa-ink; }
      .rval { font-size: 24rpx; color: $wa-accent; font-weight: 600; } } }
  .datebar { display: flex; align-items: center; gap: 16rpx; background: $wa-card;
    border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 20rpx;
    .dlbl { font-size: 24rpx; color: $wa-muted; }
    .dval { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
    .add { margin-left: auto; font-size: 24rpx; color: $wa-accent; font-weight: 600; } }
  .more { margin: 12rpx 0 0; background: transparent; border: 1.5px solid $wa-accent;
    color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius; }
  .mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, .45);
    display: flex; align-items: center; justify-content: center; padding: 48rpx; z-index: 99;
    .modal { width: 100%; background: $wa-card; border-radius: $wa-radius; padding: 32rpx;
      .modal-title { display: block; font-size: 30rpx; color: $wa-ink; font-weight: 600; margin-bottom: 20rpx; }
      .ta { width: 100%; height: 200rpx; background: $wa-bg; border-radius: 8rpx; padding: 16rpx;
        font-size: 26rpx; box-sizing: border-box; }
      .cell { display: flex; align-items: center; padding: 16rpx 0;
        .lbl { width: 170rpx; font-size: 26rpx; color: $wa-ink; }
        input { flex: 1; font-size: 26rpx; } }
      .modal-actions { margin-top: 24rpx; justify-content: flex-end;
        .act { background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius;
          padding: 0 32rpx; line-height: 64rpx; margin: 0 0 0 16rpx; }
        .act.ghost { background: transparent; border: 1.5px solid $wa-rule; color: $wa-muted; } } } }
}
</style>

<template>
  <view class="page">
    <view class="tabs">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: tab === t.key }"
        @tap="setTab(t.key)"
      >{{ $t(t.label) }}</text>
    </view>

    <!-- 一、售后操作审计日志（§100）：时间/动作/处理人筛选 + 分页 + 导出 CSV -->
    <template v-if="tab === 'audit'">
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesOps.auditTitle') }}</text>
          <text class="act" :class="{ busy: exporting }" @tap="exportAudit">
            {{ exporting ? $t('campusAfterSalesOps.exporting') : $t('campusAfterSalesOps.export') }}
          </text>
        </view>
        <view class="seg">
          <text class="seg-i" :class="{ on: range === 'today' }" @tap="setRange('today')">
            {{ $t('campusAfterSalesOps.rangeToday') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'last7' }" @tap="setRange('last7')">
            {{ $t('campusAfterSalesOps.range7d') }}
          </text>
          <text class="seg-i" :class="{ on: range === 'custom' }" @tap="setRange('custom')">
            {{ $t('campusAfterSalesOps.rangeCustom') }}
          </text>
        </view>
        <view v-if="range === 'custom'" class="range-row">
          <picker mode="date" :value="fromDate || todayKey" :end="toDate || todayKey" @change="onPickFrom">
            <view class="ipt picker" :class="{ picked: !!fromDate }">
              {{ fromDate || $t('campusAfterSalesOps.fromPh') }}
            </view>
          </picker>
          <text class="range-sep">~</text>
          <picker mode="date" :value="toDate || fromDate || todayKey" :start="fromDate" :end="todayKey" @change="onPickTo">
            <view class="ipt picker" :class="{ picked: !!toDate }">
              {{ toDate || $t('campusAfterSalesOps.toPh') }}
            </view>
          </picker>
        </view>
        <view class="filters">
          <picker mode="selector" :range="actions" range-key="label" :value="actionIdx" @change="onPickAction">
            <view class="ipt picker">{{ $t(actions[actionIdx].label) }}</view>
          </picker>
          <picker mode="selector" :range="actorOptions" range-key="label" :value="actorIdx" @change="onPickActor">
            <view class="ipt picker">{{ actorOptions[actorIdx].label }}</view>
          </picker>
        </view>
        <text class="tip">{{ $t('campusAfterSalesOps.auditTip') }}</text>
      </view>

      <view v-if="auditLoading" class="hint">{{ $t('campusAfterSalesOps.loading') }}</view>
      <view v-else-if="!logs.length" class="hint empty">{{ $t('campusAfterSalesOps.auditEmpty') }}</view>
      <view v-else class="list">
        <view v-for="r in logs" :key="r.id" class="log">
          <view class="l-head">
            <text class="l-code">{{ r.orderCode || '—' }}</text>
            <text class="l-act">{{ actionText(r.action) }}</text>
            <text class="l-time">{{ timeText(r.createdAt) }}</text>
          </view>
          <view class="l-who">
            <text class="l-name">{{ r.actorName || $t('campusAfterSalesOps.systemActor') }}</text>
            <text v-if="r.actorUserId" class="l-uid">ID {{ r.actorUserId }}</text>
          </view>
          <text v-if="r.detail" class="l-detail">{{ r.detail }}</text>
        </view>
      </view>
      <button v-if="hasMore" class="more" :disabled="loadingMore" @tap="loadMoreAudit">
        {{ loadingMore ? $t('campusAfterSalesOps.loadingMore') : $t('campusAfterSalesOps.loadMore') }}
      </button>
    </template>

    <!-- 二、售后值班排班（§100）：周日到周六，支持跨零点（次日） -->
    <template v-else-if="tab === 'duty'">
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesOps.dutyTitle') }}</text>
          <view class="pill"><text>{{ dutyPill }}</text></view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesOps.dutyTip') }}</text>
        <text v-if="!assignees.length" class="tip warn">{{ $t('campusAfterSalesOps.dutyNoStaff') }}</text>
        <view v-for="w in weekRows" :key="w.weekday" class="duty-row">
          <text class="d-wd" :class="{ today: w.weekday === todayWeekday }">{{ w.label }}</text>
          <view class="d-items">
            <text v-if="!w.items.length" class="d-empty">{{ $t('campusAfterSalesOps.dutyNone') }}</text>
            <view v-for="it in w.items" :key="it.key" class="d-chip">
              <text class="d-time">{{ it.text }}</text>
              <text class="d-name">{{ it.userName || ('ID ' + it.userId) }}</text>
              <text class="d-del" @tap="removeDuty(w.weekday, it.key)">✕</text>
            </view>
          </view>
          <text class="d-add" @tap="openDutySheet(w.weekday)">+</text>
        </view>
      </view>
      <button class="save" :disabled="savingDuty || !dutyDirty" @tap="saveDuty">
        {{ savingDuty ? $t('campusAfterSalesOps.saving') : $t('campusAfterSalesOps.saveDuty') }}
      </button>

      <view v-if="dutySheet" class="mask" @tap.self="closeDutySheet">
        <view class="sheet">
          <view class="sheet__hd">
            <text class="sheet__t">{{ $t('campusAfterSalesOps.dutyAddTitle') }}</text>
            <text class="sheet__x" @tap="closeDutySheet">✕</text>
          </view>
          <text class="sheet__hint">{{ $t('campusAfterSalesOps.dutyAddHint') }}</text>
          <picker mode="selector" :range="weekdayOptions" range-key="label" :value="dutyForm.weekdayIdx" @change="onPickDutyWeekday">
            <view class="ipt picker wide">{{ weekdayOptions[dutyForm.weekdayIdx].label }}</view>
          </picker>
          <view class="sheet__row">
            <picker mode="time" :value="dutyForm.start" @change="onPickDutyStart">
              <view class="ipt picker">{{ dutyForm.start }}</view>
            </picker>
            <text class="sheet__sep">~</text>
            <picker mode="time" :value="dutyForm.end" @change="onPickDutyEnd">
              <view class="ipt picker">{{ dutyForm.end }}</view>
            </picker>
          </view>
          <text v-if="dutyOvernight" class="sheet__ok">{{ $t('campusAfterSalesOps.dutyOvernight') }}</text>
          <picker mode="selector" :range="actorOptions" range-key="label" :value="dutyForm.actorIdx" @change="onPickDutyActor">
            <view class="ipt picker wide">{{ actorOptions[dutyForm.actorIdx].label }}</view>
          </picker>
          <view class="sheet__ops">
            <text class="sheet__clear" @tap="closeDutySheet">{{ $t('campusAfterSalesOps.cancel') }}</text>
            <button class="sheet__save" @tap="submitDuty">+ {{ $t('campusAfterSalesOps.dutyAddBtn') }}</button>
          </view>
        </view>
      </view>
    </template>

    <!-- 三、补偿挽留方案（§100）：部分退款 + 优惠券，可增删改与启停 -->
    <template v-else>
      <view class="card">
        <view class="head">
          <text class="title">{{ $t('campusAfterSalesOps.planTitle') }}</text>
          <text class="act" @tap="openPlanSheet(null)">+ {{ $t('campusAfterSalesOps.planAdd') }}</text>
        </view>
        <text class="tip">{{ $t('campusAfterSalesOps.planTip') }}</text>
      </view>

      <view v-if="planLoading" class="hint">{{ $t('campusAfterSalesOps.loading') }}</view>
      <view v-else-if="!plans.length" class="hint empty">{{ $t('campusAfterSalesOps.planEmpty') }}</view>
      <view v-else class="list">
        <view v-for="p in plans" :key="p.id" class="plan">
          <view class="pl-head">
            <text class="pl-name">{{ p.name }}</text>
            <text class="pl-state" :class="p.enabled ? 'on' : 'off'">
              {{ p.enabled ? $t('campusAfterSalesOps.planEnabled') : $t('campusAfterSalesOps.planDisabled') }}
            </text>
          </view>
          <view class="pl-meta">
            <text class="pl-amt">
              {{ p.refundAmount > 0
                ? $t('campusAfterSalesOps.planRefund').replace('{amount}', fenToYuanFixed(p.refundAmount))
                : $t('campusAfterSalesOps.planCouponOnly') }}
            </text>
            <text class="pl-cp">{{ couponText(p.couponTemplateId) }}</text>
          </view>
          <text v-if="p.note" class="pl-note">{{ p.note }}</text>
          <view class="pl-ops">
            <text class="pl-edit" @tap="openPlanSheet(p)">{{ $t('campusAfterSalesOps.planEdit') }}</text>
            <text class="pl-toggle" @tap="togglePlan(p)">
              {{ p.enabled ? $t('campusAfterSalesOps.planDisable') : $t('campusAfterSalesOps.planEnable') }}
            </text>
            <text class="pl-del" @tap="removePlan(p)">{{ $t('campusAfterSalesOps.planDelete') }}</text>
          </view>
        </view>
      </view>

      <view v-if="planSheet" class="mask" @tap.self="closePlanSheet">
        <view class="sheet">
          <view class="sheet__hd">
            <text class="sheet__t">
              {{ planForm.id ? $t('campusAfterSalesOps.planEditTitle') : $t('campusAfterSalesOps.planAddTitle') }}
            </text>
            <text class="sheet__x" @tap="closePlanSheet">✕</text>
          </view>
          <text class="sheet__hint">{{ $t('campusAfterSalesOps.planFormHint') }}</text>
          <text class="sheet__lbl">{{ $t('campusAfterSalesOps.planName') }}</text>
          <input v-model="planForm.name" class="ipt" maxlength="40" :placeholder="$t('campusAfterSalesOps.planNamePh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesOps.planRefundLbl') }}</text>
          <input v-model="planForm.amount" class="ipt" type="digit" :placeholder="$t('campusAfterSalesOps.planRefundPh')" />
          <text class="sheet__lbl">{{ $t('campusAfterSalesOps.planCouponLbl') }}</text>
          <picker mode="selector" :range="couponOptions" range-key="label" :value="planForm.couponIdx" @change="onPickCoupon">
            <view class="ipt picker wide">{{ couponOptions[planForm.couponIdx].label }}</view>
          </picker>
          <text class="sheet__lbl">{{ $t('campusAfterSalesOps.planNoteLbl') }}</text>
          <input v-model="planForm.note" class="ipt" maxlength="80" :placeholder="$t('campusAfterSalesOps.planNotePh')" />
          <view class="sheet__switch" @tap="planForm.enabled = !planForm.enabled">
            <text class="sheet__switch-lbl">{{ $t('campusAfterSalesOps.planEnabledLbl') }}</text>
            <view class="sw" :class="{ on: planForm.enabled }"><text class="sw-i"></text></view>
          </view>
          <view class="sheet__ops">
            <text class="sheet__clear" @tap="closePlanSheet">{{ $t('campusAfterSalesOps.cancel') }}</text>
            <button class="sheet__save" :disabled="planSaving" @tap="submitPlan">
              {{ planSaving ? $t('campusAfterSalesOps.saving') : $t('campusAfterSalesOps.planSave') }}
            </button>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSalesAssignees,
  campusMerchantAfterSalesAuditExport,
  campusMerchantAfterSalesAuditLogs,
  campusMerchantAfterSalesCompensationPlans,
  campusMerchantAfterSalesDutyRoster,
  campusMerchantDeleteAfterSalesCompensationPlan,
  campusMerchantSaveAfterSalesCompensationPlan,
  campusMerchantSetAfterSalesDutyRoster,
  type MerchantAfterSalesAssignee,
  type MerchantAfterSalesAuditRow,
  type MerchantAfterSalesCompensationPlan,
  type MerchantAfterSalesDutyEntry,
} from '../../apis/campus';
import { fetchCouponTemplates } from '../../apis/coupon';
import { fenToYuan, fenToYuanFixed, yuanToFen } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
type TabKey = 'audit' | 'duty' | 'plan';
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'audit', label: 'campusAfterSalesOps.tabAudit' },
  { key: 'duty', label: 'campusAfterSalesOps.tabDuty' },
  { key: 'plan', label: 'campusAfterSalesOps.tabPlan' },
];
const tab = ref<TabKey>('audit');

/* ---------- 通用：校园日（UTC+8）与时间格式 ---------- */
const todayKey = campusDateKey(0);
const todayWeekday = new Date(Date.now() + 8 * 3600_000).getUTCDay();
const weekdayNames = [
  'campusAfterSalesOps.wdSun',
  'campusAfterSalesOps.wdMon',
  'campusAfterSalesOps.wdTue',
  'campusAfterSalesOps.wdWed',
  'campusAfterSalesOps.wdThu',
  'campusAfterSalesOps.wdFri',
  'campusAfterSalesOps.wdSat',
];

function campusDateKey(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(6) : '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 分钟数 → HH:MM（>=1440 显示为次日） */
function minText(min: number): string {
  const next = min >= 1440;
  const v = next ? min - 1440 : min;
  return `${next ? locale.t('campusAfterSalesOps.nextDay') : ''}${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

function hhmmToMin(v: string): number {
  const [h, m] = String(v || '0:0').split(':').map(n => Number(n));
  return (h || 0) * 60 + (m || 0);
}

/* ---------- 处理人候选（审计筛选 / 值班共用） ---------- */
const assignees = ref<MerchantAfterSalesAssignee[]>([]);
const actorIdx = ref(0);
const actorOptions = computed(() => [
  { id: '', label: locale.t('campusAfterSalesOps.actorAll') },
  ...assignees.value.map(a => ({ id: a.id, label: a.identifier ? `${a.name}（${a.identifier}）` : a.name })),
]);

async function loadAssignees(): Promise<void> {
  try {
    assignees.value = await campusMerchantAfterSalesAssignees();
  } catch {
    assignees.value = [];
  }
}

/* ---------- 一、审计日志 ---------- */
const auditLoading = ref(false);
const loadingMore = ref(false);
const exporting = ref(false);
const range = ref<'today' | 'last7' | 'custom'>('today');
const fromDate = ref('');
const toDate = ref('');
const logs = ref<MerchantAfterSalesAuditRow[]>([]);
const auditTotal = ref(0);
const actions: Array<{ value: string; label: string }> = [
  { value: '', label: 'campusAfterSalesOps.actAll' },
  { value: 'approve', label: 'campusAfterSalesOps.actApprove' },
  { value: 'reject', label: 'campusAfterSalesOps.actReject' },
  { value: 'close', label: 'campusAfterSalesOps.actClose' },
  { value: 'transfer', label: 'campusAfterSalesOps.actTransfer' },
  { value: 'assign', label: 'campusAfterSalesOps.actAssign' },
  { value: 'retryRefund', label: 'campusAfterSalesOps.actRetry' },
  { value: 'escalate', label: 'campusAfterSalesOps.actEscalate' },
];
const actionIdx = ref(0);

const hasMore = computed(() => auditTotal.value > logs.value.length);

/** 动作值 → 本地化文案（未收录的动作原样展示） */
function actionText(action: string): string {
  const hit = actions.find(a => a.value === action);
  return hit ? locale.t(hit.label) : action;
}

/** 审计筛选日期口径：后端按校园日（UTC+8）解析 YYYY-MM-DD，end 当日含全天 */
function rangeParams(): { from?: string; to?: string } {
  if (range.value === 'today') return { from: todayKey, to: todayKey };
  if (range.value === 'last7') return { from: campusDateKey(-6), to: todayKey };
  if (!fromDate.value || !toDate.value) return {};
  return { from: fromDate.value, to: toDate.value };
}

function auditFilter(): { from?: string; to?: string; action?: string; actorUserId?: string } {
  return {
    ...rangeParams(),
    action: actions[actionIdx.value].value || undefined,
    actorUserId: actorOptions.value[actorIdx.value].id || undefined,
  };
}

async function loadAudit(reset = true): Promise<void> {
  const skip = reset ? 0 : logs.value.length;
  const rows = await campusMerchantAfterSalesAuditLogs({
    ...auditFilter(),
    take: 50,
    skip,
  });
  if (reset) {
    logs.value = rows;
    // 后端未返回总数：返回满页视为可能还有更多
    auditTotal.value = rows.length >= 50 ? rows.length + 1 : rows.length;
  } else {
    logs.value = [...logs.value, ...rows];
    auditTotal.value = rows.length >= 50 ? logs.value.length + 1 : logs.value.length;
  }
}

async function reloadAudit(): Promise<void> {
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) return;
  auditLoading.value = true;
  try {
    await loadAudit(true);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.loadFailed')), icon: 'none' });
  } finally {
    auditLoading.value = false;
  }
}

async function loadMoreAudit(): Promise<void> {
  loadingMore.value = true;
  try {
    await loadAudit(false);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.loadFailed')), icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function setRange(next: 'today' | 'last7' | 'custom'): void {
  range.value = next;
  if (next === 'custom') {
    if (!fromDate.value) fromDate.value = todayKey;
    if (!toDate.value) toDate.value = todayKey;
  }
  void reloadAudit();
}

function onPickFrom(e: any): void {
  fromDate.value = String(e?.detail?.value ?? '');
  if (toDate.value && toDate.value < fromDate.value) toDate.value = '';
  if (toDate.value) void reloadAudit();
}

function onPickTo(e: any): void {
  toDate.value = String(e?.detail?.value ?? '');
  if (fromDate.value && toDate.value) void reloadAudit();
}

function onPickAction(e: any): void {
  actionIdx.value = Number(e?.detail?.value ?? 0);
  void reloadAudit();
}

function onPickActor(e: any): void {
  actorIdx.value = Number(e?.detail?.value ?? 0);
  void reloadAudit();
}

/** 导出 CSV（§100）：后端按同一筛选条件生成，前端只负责落盘 */
async function exportAudit(): Promise<void> {
  if (exporting.value) return;
  if (range.value === 'custom' && (!fromDate.value || !toDate.value)) {
    uni.showToast({ title: locale.t('campusAfterSalesOps.pickRangeFirst'), icon: 'none' });
    return;
  }
  exporting.value = true;
  try {
    const csv = await campusMerchantAfterSalesAuditExport(auditFilter());
    if (!csv) {
      uni.showToast({ title: locale.t('campusAfterSalesOps.exportEmpty'), icon: 'none' });
      return;
    }
    const body = csv.charCodeAt(0) === 0xfeff ? csv : `\uFEFF${csv}`;
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `after-sales-audit-${todayKey.replace(/-/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    uni.showToast({ title: locale.t('campusAfterSalesOps.exportDone'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.exportFailed')), icon: 'none' });
  } finally {
    exporting.value = false;
  }
}

/* ---------- 二、值班排班 ---------- */
interface DutyRow {
  key: string;
  weekday: number;
  startMin: number;
  endMin: number;
  userId: string;
  userName: string;
}

const dutyLoading = ref(false);
const savingDuty = ref(false);
const dutyDirty = ref(false);
const dutyRows = ref<DutyRow[]>([]);

const weekRows = computed(() =>
  weekdayNames.map((labelKey, weekday) => ({
    weekday,
    label: locale.t(labelKey),
    items: dutyRows.value
      .filter(r => r.weekday === weekday)
      .sort((a, b) => a.startMin - b.startMin)
      .map(r => ({ ...r, text: `${minText(r.startMin)}~${minText(r.endMin)}` })),
  })),
);

const dutyPill = computed(() =>
  dutyRows.value.length
    ? locale.t('campusAfterSalesOps.dutyPill').replace('{n}', String(dutyRows.value.length))
    : locale.t('campusAfterSalesOps.dutyPillNone'),
);

function toDutyRows(entries: MerchantAfterSalesDutyEntry[]): DutyRow[] {
  return entries.map((e, i) => ({
    key: `${e.weekday}-${e.startMin}-${e.endMin}-${e.userId}-${i}`,
    weekday: e.weekday,
    startMin: e.startMin,
    endMin: e.endMin,
    userId: e.userId,
    userName: e.userName ?? '',
  }));
}

async function reloadDuty(): Promise<void> {
  dutyLoading.value = true;
  try {
    dutyRows.value = toDutyRows(await campusMerchantAfterSalesDutyRoster());
    dutyDirty.value = false;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.loadFailed')), icon: 'none' });
  } finally {
    dutyLoading.value = false;
  }
}

/** 新增值班弹窗：weekday 默认取点击的那一行 */
const dutySheet = ref(false);
const dutyForm = ref({ weekdayIdx: 1, start: '09:00', end: '18:00', actorIdx: 0 });
const weekdayOptions = computed(() => weekdayNames.map(k => ({ label: locale.t(k) })));
const dutyOvernight = computed(() => hhmmToMin(dutyForm.value.end) < hhmmToMin(dutyForm.value.start));

function openDutySheet(weekday: number): void {
  dutyForm.value = { weekdayIdx: weekday, start: '09:00', end: '18:00', actorIdx: 0 };
  dutySheet.value = true;
  if (!assignees.value.length) void loadAssignees();
}

function closeDutySheet(): void {
  dutySheet.value = false;
}

function onPickDutyWeekday(e: any): void {
  dutyForm.value.weekdayIdx = Number(e?.detail?.value ?? 0);
}

function onPickDutyStart(e: any): void {
  dutyForm.value.start = String(e?.detail?.value ?? '09:00');
}

function onPickDutyEnd(e: any): void {
  dutyForm.value.end = String(e?.detail?.value ?? '18:00');
}

function onPickDutyActor(e: any): void {
  dutyForm.value.actorIdx = Number(e?.detail?.value ?? 0);
}

function submitDuty(): void {
  const actor = actorOptions.value[dutyForm.value.actorIdx];
  if (!actor?.id) {
    uni.showToast({ title: locale.t('campusAfterSalesOps.dutyNeedActor'), icon: 'none' });
    return;
  }
  const startMin = hhmmToMin(dutyForm.value.start);
  let endMin = hhmmToMin(dutyForm.value.end);
  if (startMin === endMin) {
    uni.showToast({ title: locale.t('campusAfterSalesOps.dutySameTime'), icon: 'none' });
    return;
  }
  if (endMin < startMin) endMin += 1440; // 跨零点 → 次日
  dutyRows.value.push({
    key: `${dutyForm.value.weekdayIdx}-${startMin}-${endMin}-${actor.id}-${Date.now()}`,
    weekday: dutyForm.value.weekdayIdx,
    startMin,
    endMin,
    userId: actor.id,
    userName: actor.label,
  });
  dutyDirty.value = true;
  dutySheet.value = false;
}

function removeDuty(weekday: number, key: string): void {
  dutyRows.value = dutyRows.value.filter(r => !(r.weekday === weekday && r.key === key));
  dutyDirty.value = true;
}

/** 整体替换：本地编辑后一次性提交，服务端覆盖本店值班表 */
async function saveDuty(): Promise<void> {
  if (savingDuty.value || !dutyDirty.value) return;
  savingDuty.value = true;
  try {
    const saved = await campusMerchantSetAfterSalesDutyRoster(
      dutyRows.value.map(r => ({
        weekday: r.weekday,
        startMin: r.startMin,
        endMin: r.endMin,
        userId: r.userId,
      })),
    );
    dutyRows.value = toDutyRows(saved);
    dutyDirty.value = false;
    uni.showToast({ title: locale.t('campusAfterSalesOps.dutySaved'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.saveFailed')), icon: 'none' });
  } finally {
    savingDuty.value = false;
  }
}

/* ---------- 三、补偿挽留方案 ---------- */
const planLoading = ref(false);
const planSaving = ref(false);
const plans = ref<MerchantAfterSalesCompensationPlan[]>([]);
const couponList = ref<Array<{ id: string; name: string }>>([]);

const couponOptions = computed(() => [
  { id: '', label: locale.t('campusAfterSalesOps.planNoCoupon') },
  ...couponList.value.map(c => ({ id: c.id, label: c.name })),
]);

function couponText(id?: string | null): string {
  if (!id) return locale.t('campusAfterSalesOps.planNoCoupon');
  const hit = couponList.value.find(c => c.id === id);
  return hit ? hit.name : `#${id}`;
}

async function loadPlans(): Promise<void> {
  planLoading.value = true;
  try {
    plans.value = await campusMerchantAfterSalesCompensationPlans();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.loadFailed')), icon: 'none' });
  } finally {
    planLoading.value = false;
  }
}

/** 券模板仅用于名称回显与选择，失败不阻断方案编辑 */
async function loadCoupons(): Promise<void> {
  try {
    const res = await fetchCouponTemplates({ skip: 0, take: 100 });
    couponList.value = (res.items ?? []).map(c => ({ id: c.id, name: c.name }));
  } catch {
    couponList.value = [];
  }
}

const planSheet = ref(false);
const planForm = ref({
  id: '',
  name: '',
  amount: '',
  couponIdx: 0,
  note: '',
  enabled: true,
});

function openPlanSheet(p: MerchantAfterSalesCompensationPlan | null): void {
  if (!couponList.value.length) void loadCoupons();
  if (p) {
    const idx = couponOptions.value.findIndex(c => c.id === (p.couponTemplateId ?? ''));
    planForm.value = {
      id: p.id,
      name: p.name,
      amount: p.refundAmount > 0 ? fenToYuan(p.refundAmount) : '',
      couponIdx: idx >= 0 ? idx : 0,
      note: p.note ?? '',
      enabled: p.enabled,
    };
  } else {
    planForm.value = { id: '', name: '', amount: '', couponIdx: 0, note: '', enabled: true };
  }
  planSheet.value = true;
}

function closePlanSheet(): void {
  if (planSaving.value) return;
  planSheet.value = false;
}

function onPickCoupon(e: any): void {
  planForm.value.couponIdx = Number(e?.detail?.value ?? 0);
}

async function submitPlan(): Promise<void> {
  if (planSaving.value) return;
  const name = planForm.value.name.trim();
  if (!name) {
    uni.showToast({ title: locale.t('campusAfterSalesOps.planNameRequired'), icon: 'none' });
    return;
  }
  const amountYuan = planForm.value.amount.trim();
  const refundAmount = amountYuan ? yuanToFen(amountYuan) : 0;
  if (refundAmount == null) {
    uni.showToast({ title: locale.t('campusAfterSalesOps.planAmountInvalid'), icon: 'none' });
    return;
  }
  planSaving.value = true;
  try {
    plans.value = await campusMerchantSaveAfterSalesCompensationPlan({
      id: planForm.value.id || null,
      name,
      refundAmount,
      couponTemplateId: couponOptions.value[planForm.value.couponIdx]?.id || null,
      note: planForm.value.note.trim() || null,
      enabled: planForm.value.enabled,
    });
    planSheet.value = false;
    uni.showToast({ title: locale.t('campusAfterSalesOps.planSaved'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.saveFailed')), icon: 'none' });
  } finally {
    planSaving.value = false;
  }
}

/** 启停：直接复用保存接口，只翻转 enabled */
async function togglePlan(p: MerchantAfterSalesCompensationPlan): Promise<void> {
  try {
    plans.value = await campusMerchantSaveAfterSalesCompensationPlan({
      id: p.id,
      name: p.name,
      refundAmount: p.refundAmount,
      couponTemplateId: p.couponTemplateId,
      note: p.note,
      enabled: !p.enabled,
    });
    uni.showToast({
      title: p.enabled ? locale.t('campusAfterSalesOps.planDisabledToast') : locale.t('campusAfterSalesOps.planEnabledToast'),
      icon: 'none',
    });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.saveFailed')), icon: 'none' });
  }
}

function removePlan(p: MerchantAfterSalesCompensationPlan): void {
  uni.showModal({
    title: locale.t('campusAfterSalesOps.planDeleteTitle'),
    content: locale.t('campusAfterSalesOps.planDeleteBody').replace('{name}', p.name),
    confirmText: locale.t('campusAfterSalesOps.planDelete'),
    cancelText: locale.t('campusAfterSalesOps.cancel'),
    success: async res => {
      if (!res.confirm) return;
      try {
        plans.value = await campusMerchantDeleteAfterSalesCompensationPlan(p.id);
        uni.showToast({ title: locale.t('campusAfterSalesOps.planDeleted'), icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesOps.saveFailed')), icon: 'none' });
      }
    },
  });
}

/* ---------- 生命周期 ---------- */
function setTab(next: TabKey): void {
  tab.value = next;
  if (next === 'audit' && !logs.value.length) void reloadAudit();
  if (next === 'duty' && !dutyRows.value.length) void reloadDuty();
  if (next === 'plan' && !plans.value.length) void loadPlans();
}

async function reloadAll(): Promise<void> {
  await loadAssignees();
  if (tab.value === 'audit') await reloadAudit();
  if (tab.value === 'duty') await reloadDuty();
  if (tab.value === 'plan') await loadPlans();
}

onLoad((options: any) => {
  const t = String(options?.tab || '');
  if (t === 'duty' || t === 'plan' || t === 'audit') tab.value = t;
  void reloadAll();
});

onMounted(() => {
  void loadCoupons();
});

onPullDownRefresh(async () => {
  await reloadAll();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .hint.empty { padding: 60rpx 32rpx; line-height: 1.6; }
  .tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx;
    .tab { flex: 1; text-align: center; font-size: 26rpx; color: $wa-muted;
      padding: 16rpx 0; border-radius: $wa-radius; background: $wa-card;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
      .act { font-size: 24rpx; color: $wa-accent; &.busy { opacity: .6; } }
    }
    .pill { padding: 8rpx 24rpx; border-radius: 999rpx; background: $wa-rule;
      text { font-size: 22rpx; color: $wa-muted; font-weight: 600; }
    }
    .seg { display: flex; gap: 12rpx; margin: 20rpx 0 8rpx;
      .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
        padding: 12rpx 0; border-radius: $wa-radius; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
      }
    }
    .range-row { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; }
    .range-sep { color: $wa-muted; font-size: 26rpx; }
    .filters { display: flex; gap: 12rpx; margin-top: 16rpx; }
    .tip { display: block; margin-top: 14rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5;
      &.warn { color: #fa8c16; }
    }
  }
  .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx;
    font-size: 26rpx; color: $wa-ink; box-sizing: border-box;
    &.picker { color: $wa-muted; }
    &.picker.picked { color: $wa-ink; }
    &.wide { width: 100%; margin-bottom: 16rpx; }
  }
  .filters .picker { flex: 1; }
  .list { display: flex; flex-direction: column; gap: 16rpx;
    .log { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 10rpx;
      .l-head { display: flex; align-items: center; gap: 12rpx;
        .l-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .l-act { font-size: 22rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 4rpx 16rpx; }
        .l-time { font-size: 22rpx; color: $wa-muted; }
      }
      .l-who { display: flex; align-items: center; gap: 12rpx;
        .l-name { font-size: 24rpx; color: $wa-ink; }
        .l-uid { font-size: 22rpx; color: $wa-muted; }
      }
      .l-detail { font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
    }
    .plan { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 12rpx;
      .pl-head { display: flex; align-items: center; gap: 12rpx;
        .pl-name { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .pl-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.on { color: #237804; background: #f6ffed; }
          &.off { color: #8c8c8c; background: $wa-rule; }
        }
      }
      .pl-meta { display: flex; align-items: center; gap: 12rpx;
        .pl-amt { font-size: 26rpx; color: #d4380d; font-weight: 600; }
        .pl-cp { font-size: 22rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 4rpx 16rpx; }
      }
      .pl-note { font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
      .pl-ops { display: flex; align-items: center; gap: 28rpx; margin-top: 4rpx;
        .pl-edit { font-size: 24rpx; color: $wa-accent; }
        .pl-toggle { font-size: 24rpx; color: $wa-ink; }
        .pl-del { font-size: 24rpx; color: #d4380d; margin-left: auto; }
      }
    }
  }
  .more { background: $wa-card; color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius;
    line-height: 76rpx; margin-top: 24rpx; &[disabled] { opacity: .6; }
  }
  .save { margin-top: 8rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
    border-radius: $wa-radius; line-height: 80rpx; border: none;
    &[disabled] { opacity: .5; }
  }
  .duty-row { display: flex; align-items: flex-start; gap: 16rpx; padding: 16rpx 0;
    border-top: 1px solid $wa-rule;
    .d-wd { flex: none; width: 88rpx; font-size: 24rpx; color: $wa-muted; padding-top: 8rpx;
      &.today { color: $wa-accent; font-weight: 700; }
    }
    .d-items { flex: 1; display: flex; flex-direction: column; gap: 10rpx;
      .d-empty { font-size: 22rpx; color: $wa-muted; padding-top: 8rpx; }
      .d-chip { display: flex; align-items: center; gap: 12rpx; background: $wa-bg;
        border-radius: $wa-radius; padding: 10rpx 18rpx;
        .d-time { font-size: 22rpx; color: $wa-ink; font-weight: 600; }
        .d-name { flex: 1; font-size: 22rpx; color: $wa-muted; }
        .d-del { font-size: 24rpx; color: #d4380d; padding: 0 6rpx; }
      }
    }
    .d-add { flex: none; font-size: 28rpx; color: $wa-accent; padding: 4rpx 12rpx; }
  }
}

.mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 300;
  display: flex; align-items: flex-end; }
.sheet { width: 100%; max-height: 88vh; overflow-y: auto; background: $wa-card;
  border-radius: 24rpx 24rpx 0 0; padding: 28rpx 32rpx 40rpx; box-sizing: border-box;
  &__hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
  &__t { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
  &__x { font-size: 32rpx; color: $wa-muted; padding: 4rpx 8rpx; }
  &__hint { display: block; font-size: 22rpx; color: $wa-muted; line-height: 1.5; margin-bottom: 16rpx; }
  &__lbl { display: block; font-size: 24rpx; color: $wa-ink; margin: 16rpx 0 8rpx; }
  &__row { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx;
    .picker { flex: 1; }
  }
  &__sep { color: $wa-muted; font-size: 26rpx; }
  &__ok { display: block; font-size: 22rpx; color: #fa8c16; margin: -8rpx 0 12rpx; }
  &__switch { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx;
    &-lbl { flex: 1; font-size: 24rpx; color: $wa-ink; }
  }
  &__ops { display: flex; align-items: center; gap: 20rpx; margin-top: 28rpx; }
  &__clear { flex: none; font-size: 24rpx; color: $wa-muted; padding: 12rpx 8rpx; }
  &__save { flex: 1; margin: 0; height: 76rpx; line-height: 76rpx; background: $wa-accent;
    color: #fff; font-size: 28rpx; border-radius: $wa-radius; border: none;
    &[disabled] { opacity: .6; }
  }
}
.sw { width: 84rpx; height: 44rpx; border-radius: 999rpx; background: $wa-rule;
  padding: 4rpx; box-sizing: border-box;
  &-i { display: block; width: 36rpx; height: 36rpx; border-radius: 50%; background: #fff;
    transition: transform .2s; }
  &.on { background: $wa-accent;
    .sw-i { transform: translateX(40rpx); }
  }
}
</style>

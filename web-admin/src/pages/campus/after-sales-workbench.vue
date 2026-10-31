<template>
  <view class="page">
    <!-- 概览：待办计数（点数字即筛选） -->
    <view class="card ov">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesWorkbench.title') }}</text>
        <text class="act" :class="{ busy: loading }" @tap="reloadAll">
          {{ loading ? $t('campusAfterSalesWorkbench.refreshing') : $t('campusAfterSalesWorkbench.refresh') }}
        </text>
      </view>
      <view v-if="wb" class="grid">
        <view
          v-for="c in chips"
          :key="c.key"
          class="ch"
          :class="{ on: c.active, hot: c.hot && c.n > 0, mute: !c.filter }"
          @tap="tapChip(c)"
        >
          <text class="ch-n">{{ c.n }}</text>
          <text class="ch-l">{{ $t(c.label) }}</text>
        </view>
      </view>
      <text v-if="wb && wb.oldestPendingHours > 0" class="tip warn">
        {{ $t('campusAfterSalesWorkbench.oldestWarn').replace('{h}', String(wb.oldestPendingHours)) }}
      </text>
    </view>

    <!-- 自动化任务：超时提醒 / 自动同意 / 退款重试 -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesWorkbench.taskTitle') }}</text>
        <text class="act" @tap="toggleTaskScope">
          {{ taskScopeAll ? $t('campusAfterSalesWorkbench.taskPendingOnly') : $t('campusAfterSalesWorkbench.taskShowAll') }}
        </text>
      </view>
      <view class="seg">
        <text
          v-for="s in taskStatuses"
          :key="s.key"
          class="seg-i"
          :class="{ on: taskStatus === s.key }"
          @tap="setTaskStatus(s.key)"
        >{{ $t(s.label) }}</text>
      </view>
      <view v-if="taskLoading" class="hint small">{{ $t('campusAfterSalesWorkbench.loading') }}</view>
      <view v-else-if="!tasks.length" class="hint small">{{ $t('campusAfterSalesWorkbench.taskEmpty') }}</view>
      <view v-else class="tasks">
        <view v-for="t in tasks" :key="t.id" class="task">
          <view class="t-head">
            <text class="t-type">{{ taskTypeText(t.type) }}</text>
            <text class="t-st" :class="taskClass(t.status)">{{ taskStatusText(t.status) }}</text>
            <text class="t-due">{{ $t('campusAfterSalesWorkbench.taskDue').replace('{t}', timeText(t.dueAt)) }}</text>
          </view>
          <view class="t-meta">
            <text class="t-req">#{{ t.requestId }}</text>
            <text v-if="t.maxAttempt > 0" class="t-attempt">
              {{ $t('campusAfterSalesWorkbench.taskAttempt').replace('{n}', String(t.attempt)).replace('{m}', String(t.maxAttempt)) }}
            </text>
            <text v-if="t.lastError" class="t-err">{{ $t('campusAfterSalesWorkbench.taskError').replace('{msg}', t.lastError) }}</text>
          </view>
          <text
            v-if="t.status !== 'executed' && t.status !== 'cancelled'"
            class="t-run"
            @tap="runTask(t)"
          >{{ runningTaskId === t.id ? $t('campusAfterSalesWorkbench.taskRunning') : $t('campusAfterSalesWorkbench.taskRun') }}</text>
        </view>
      </view>
    </view>

    <!-- 售后单：筛选 + 多选 + 批量处置 -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesWorkbench.listTitle') }}</text>
        <text class="act">{{ $t('campusAfterSalesWorkbench.listTotal').replace('{n}', String(total)) }}</text>
      </view>
      <view class="search">
        <input
          v-model="keyword"
          class="s-ipt"
          type="text"
          :placeholder="$t('campusAfterSalesWorkbench.searchPh')"
          confirm-type="search"
          @confirm="reloadList(true)"
        />
        <text class="s-act" @tap="reloadList(true)">{{ $t('campusAfterSalesWorkbench.search') }}</text>
      </view>
      <view class="seg">
        <text
          v-for="s in states"
          :key="s.key"
          class="seg-i"
          :class="{ on: stateFilter === s.key }"
          @tap="setState(s.key)"
        >{{ $t(s.label) }}<text v-if="stateCount(s.key)" class="seg-n">{{ stateCount(s.key) }}</text></text>
      </view>
      <view v-if="attention" class="attn">
        <text class="attn-t">
          {{ $t('campusAfterSalesWorkbench.attentionTag').replace('{name}', attentionText()) }}
        </text>
        <text class="attn-x" @tap="clearAttention">{{ $t('campusAfterSalesWorkbench.attentionClear') }}</text>
      </view>
      <view v-if="items.length" class="selall">
        <text class="sa-t" @tap="toggleAll">
          {{ allSelected ? $t('campusAfterSalesWorkbench.unselectAll') : $t('campusAfterSalesWorkbench.selectAll') }}
        </text>
        <text class="sa-n">{{ $t('campusAfterSalesWorkbench.selected').replace('{n}', String(selectedIds.length)) }}</text>
      </view>
    </view>

    <view v-if="listLoading" class="hint">{{ $t('campusAfterSalesWorkbench.loading') }}</view>
    <view v-else-if="!items.length" class="hint empty">{{ $t('campusAfterSalesWorkbench.empty') }}</view>
    <view v-else class="list">
      <view
        v-for="r in items"
        :key="r.id"
        class="row"
        :class="{ picked: selectedIds.includes(r.id) }"
        @tap="togglePick(r.id)"
      >
        <view class="r-top">
          <text class="r-check" :class="{ on: selectedIds.includes(r.id) }" />
          <text class="r-code">{{ r.orderCode }}</text>
          <text class="r-amt">{{ money(r.refundAmount) }}</text>
        </view>
        <view class="r-mid">
          <text class="r-state" :class="stateClass(r.state)">{{ stateText(r.state) }}</text>
          <text v-if="r.overdue" class="r-tag bad">{{ $t('campusAfterSalesWorkbench.overdueTag') }}</text>
          <text v-else-if="r.dueSoon" class="r-tag warn">{{ $t('campusAfterSalesWorkbench.dueSoonTag') }}</text>
          <text v-if="r.unread" class="r-tag info">{{ $t('campusAfterSalesWorkbench.unreadTag') }}</text>
          <text v-if="r.refundReviewPending" class="r-tag info">{{ $t('campusAfterSalesWorkbench.reviewTag') }}</text>
          <text v-if="r.riskReason" class="r-tag bad">{{ $t('campusAfterSalesWorkbench.riskTag') }}</text>
          <text v-if="r.slaPaused" class="r-tag mute">{{ $t('campusAfterSalesWorkbench.slaTag') }}</text>
          <text v-if="r.escalated" class="r-tag warn">{{ $t('campusAfterSalesWorkbench.escalatedTag') }}</text>
        </view>
        <view class="r-sub">
          <text class="r-cus">{{ r.customerName || '—' }}</text>
          <text class="r-type">{{ typeText(r.type) }}</text>
          <text class="r-t">{{ timeText(r.createdAt) }}</text>
        </view>
        <view class="r-meta">
          <text class="r-assignee">{{ r.assigneeName || $t('campusAfterSalesWorkbench.unassigned') }}</text>
          <text v-for="tg in r.tags.slice(0, 3)" :key="tg" class="r-tagv">{{ tg }}</text>
        </view>
        <text v-if="r.reason" class="r-reason">{{ r.reason }}</text>
      </view>
    </view>
    <button v-if="hasMore" class="more" :disabled="listLoadingMore" @tap="loadMore">
      {{ listLoadingMore ? $t('campusAfterSalesWorkbench.loadingMore') : $t('campusAfterSalesWorkbench.loadMore') }}
    </button>

    <!-- 批量操作条 -->
    <view v-if="selectedIds.length" class="bar">
      <text class="bar-n">{{ $t('campusAfterSalesWorkbench.selected').replace('{n}', String(selectedIds.length)) }}</text>
      <text class="bar-b main" @tap="batchApprove">{{ $t('campusAfterSalesWorkbench.batchApprove') }}</text>
      <text class="bar-b" @tap="openReason('reject')">{{ $t('campusAfterSalesWorkbench.batchReject') }}</text>
      <text class="bar-b" @tap="openReason('close')">{{ $t('campusAfterSalesWorkbench.batchClose') }}</text>
      <text class="bar-b" @tap="openAssign">{{ $t('campusAfterSalesWorkbench.batchAssign') }}</text>
      <text class="bar-b" @tap="openComp">{{ $t('campusAfterSalesWorkbench.compensate') }}</text>
    </view>

    <!-- 驳回 / 关闭原因 -->
    <view v-if="reasonMode" class="mask" @tap="closeReason">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="sheet-t">
            {{ reasonMode === 'reject' ? $t('campusAfterSalesWorkbench.rejectTitle') : $t('campusAfterSalesWorkbench.closeTitle') }}
          </text>
          <text class="sheet-x" @tap="closeReason">✕</text>
        </view>
        <textarea
          v-model="reasonText"
          class="area"
          :placeholder="reasonMode === 'reject' ? $t('campusAfterSalesWorkbench.rejectPh') : $t('campusAfterSalesWorkbench.closePh')"
          maxlength="200"
        />
        <button class="save" :disabled="reasonBusy" @tap="submitReason">
          {{ reasonBusy ? $t('campusAfterSalesWorkbench.submitting') : $t('campusAfterSalesWorkbench.confirm') }}
        </button>
      </view>
    </view>

    <!-- 批量指派 -->
    <view v-if="assignOpen" class="mask" @tap="assignOpen = false">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="sheet-t">{{ $t('campusAfterSalesWorkbench.assignTitle') }}</text>
          <text class="sheet-x" @tap="assignOpen = false">✕</text>
        </view>
        <text v-if="!assignees.length" class="tip warn">{{ $t('campusAfterSalesWorkbench.assignNoStaff') }}</text>
        <view v-else class="opts">
          <view class="opt" :class="{ on: assignUserId === '' }" @tap="assignUserId = ''">
            <text class="opt-t">{{ $t('campusAfterSalesWorkbench.assignNone') }}</text>
          </view>
          <view
            v-for="a in assignees"
            :key="a.id"
            class="opt"
            :class="{ on: assignUserId === a.id }"
            @tap="assignUserId = a.id"
          >
            <text class="opt-t">{{ a.name }}</text>
            <text class="opt-s">{{ a.identifier }}</text>
          </view>
        </view>
        <button class="save" :disabled="assignBusy || !assignees.length" @tap="submitAssign">
          {{ assignBusy ? $t('campusAfterSalesWorkbench.submitting') : $t('campusAfterSalesWorkbench.confirm') }}
        </button>
      </view>
    </view>

    <!-- 一键发放补偿挽留 -->
    <view v-if="compOpen" class="mask" @tap="compOpen = false">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <text class="sheet-t">{{ $t('campusAfterSalesWorkbench.compTitle') }}</text>
          <text class="sheet-x" @tap="compOpen = false">✕</text>
        </view>
        <text v-if="!plans.length" class="tip warn">{{ $t('campusAfterSalesWorkbench.compEmpty') }}</text>
        <view v-else class="opts">
          <view
            v-for="p in plans"
            :key="p.id"
            class="opt col"
            :class="{ on: planId === p.id, off: !p.enabled }"
            @tap="pickPlan(p)"
          >
            <view class="opt-line">
              <text class="opt-t">{{ p.name }}</text>
              <text class="opt-amt">{{ p.refundAmount > 0 ? $t('campusAfterSalesWorkbench.compRefund').replace('{amt}', money(p.refundAmount)) : '' }}</text>
            </view>
            <text class="opt-s">
              {{ p.couponTemplateId ? $t('campusAfterSalesWorkbench.compCoupon').replace('{id}', p.couponTemplateId) : $t('campusAfterSalesWorkbench.compRefundOnly') }}
              <text v-if="!p.enabled"> · {{ $t('campusAfterSalesWorkbench.planDisabled') }}</text>
            </text>
            <text v-if="p.note" class="opt-note">{{ p.note }}</text>
          </view>
        </view>
        <text class="tip">{{ $t('campusAfterSalesWorkbench.compTip') }}</text>
        <button class="save" :disabled="compBusy || !planId" @tap="submitComp">
          {{ compBusy ? $t('campusAfterSalesWorkbench.submitting') : $t('campusAfterSalesWorkbench.confirm') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSalesWorkbench,
  campusMerchantAfterSalesTasks,
  campusMerchantAfterSalesRunTask,
  campusMerchantAfterSalesWorkItems,
  campusMerchantAfterSalesBatchApprove,
  campusMerchantAfterSalesBatchReject,
  campusMerchantAfterSalesBatchClose,
  campusMerchantAfterSalesBatchAssign,
  campusMerchantAfterSalesApplyCompensation,
  campusMerchantAfterSalesAssignees,
  campusMerchantAfterSalesCompensationPlans,
  type MerchantAfterSalesWorkbench,
  type MerchantAfterSalesTask,
  type MerchantAfterSalesWorkItem,
  type MerchantAfterSalesBatchResult,
  type MerchantAfterSalesAssignee,
  type MerchantAfterSalesCompensationPlan,
} from '../../apis/campus';
import { fenToYuanFixed } from '../../utils/money';
import { formatDateTime } from '../../utils/inventoryFormat';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();
const loading = ref(true);
const wb = ref<MerchantAfterSalesWorkbench | null>(null);

/** 待办计数 → 一键筛选 */
type ChipKey = 'toApprove' | 'toReceive' | 'refundFailed' | 'pendingReply' | 'overdue' | 'dueSoon' | 'followUpDue' | 'slaPaused' | 'escalated';
const chips = computed(() => {
  const d = wb.value;
  if (!d) return [] as Array<{ key: ChipKey; label: string; n: number; hot?: boolean; filter?: { state?: string; attention?: string }; active: boolean }>;
  const rows: Array<{ key: ChipKey; label: string; n: number; hot?: boolean; filter?: { state?: string; attention?: string } }> = [
    { key: 'toApprove', label: 'campusAfterSalesWorkbench.chipToApprove', n: d.toApprove, hot: true, filter: { state: 'Pending' } },
    { key: 'toReceive', label: 'campusAfterSalesWorkbench.chipToReceive', n: d.toReceive, filter: { state: 'Received' } },
    { key: 'refundFailed', label: 'campusAfterSalesWorkbench.chipRefundFailed', n: d.refundFailed, hot: true, filter: { state: 'RefundFailed' } },
    { key: 'pendingReply', label: 'campusAfterSalesWorkbench.chipPendingReply', n: d.pendingReply, filter: { attention: 'unread' } },
    { key: 'overdue', label: 'campusAfterSalesWorkbench.chipOverdue', n: d.overdue, hot: true, filter: { attention: 'overdue' } },
    { key: 'dueSoon', label: 'campusAfterSalesWorkbench.chipDueSoon', n: d.dueSoon, hot: true, filter: { attention: 'dueSoon' } },
    { key: 'followUpDue', label: 'campusAfterSalesWorkbench.chipFollowUp', n: d.followUpDue, filter: { attention: 'followUp' } },
    { key: 'slaPaused', label: 'campusAfterSalesWorkbench.chipSlaPaused', n: d.slaPaused },
    { key: 'escalated', label: 'campusAfterSalesWorkbench.chipEscalated', n: d.escalated },
  ];
  return rows.map(r => ({
    ...r,
    active: !!r.filter && stateFilter.value === (r.filter.state ?? '') && attention.value === (r.filter.attention ?? ''),
  }));
});

/* ---------- 自动化任务 ---------- */
const tasks = ref<MerchantAfterSalesTask[]>([]);
const taskTotal = ref(0);
const taskStatus = ref('pending');
const taskScopeAll = ref(false);
const taskLoading = ref(false);
const runningTaskId = ref('');
const taskStatuses = [
  { key: 'pending', label: 'campusAfterSalesWorkbench.taskStatusPending' },
  { key: 'failed', label: 'campusAfterSalesWorkbench.taskStatusFailed' },
  { key: 'all', label: 'campusAfterSalesWorkbench.taskStatusAll' },
];

/* ---------- 售后单列表 ---------- */
const items = ref<MerchantAfterSalesWorkItem[]>([]);
const total = ref(0);
const counts = ref<Array<{ state: string; count: number }>>([]);
const stateFilter = ref('');
const attention = ref('');
const keyword = ref('');
const listLoading = ref(true);
const listLoadingMore = ref(false);
const selectedIds = ref<string[]>([]);
const states = [
  { key: '', label: 'campusAfterSalesWorkbench.stateAll' },
  { key: 'Pending', label: 'campusAfterSalesWorkbench.statePending' },
  { key: 'Received', label: 'campusAfterSalesWorkbench.stateReceiving' },
  { key: 'RefundFailed', label: 'campusAfterSalesWorkbench.stateFailed' },
];
const PAGE = 20;

/* ---------- 批量操作 ---------- */
const reasonMode = ref<'' | 'reject' | 'close'>('');
const reasonText = ref('');
const reasonBusy = ref(false);
const assignOpen = ref(false);
const assignees = ref<MerchantAfterSalesAssignee[]>([]);
const assignUserId = ref('');
const assignBusy = ref(false);
const compOpen = ref(false);
const plans = ref<MerchantAfterSalesCompensationPlan[]>([]);
const planId = ref('');
const compBusy = ref(false);

const allSelected = computed(() => items.value.length > 0 && selectedIds.value.length === items.value.length);
const hasMore = computed(() => items.value.length < total.value);

function money(fen: number): string {
  return '¥' + fenToYuanFixed(fen);
}

function timeText(raw?: string | null): string {
  const s = formatDateTime(raw);
  return s ? s.slice(5) : '';
}

function stateCount(key: string): number {
  if (!key) return counts.value.reduce((s, r) => s + r.count, 0);
  return counts.value.find(r => r.state === key)?.count ?? 0;
}

function stateText(state: string): string {
  const map: Record<string, string> = {
    Pending: locale.t('campusAfterSalesWorkbench.statePending'),
    Received: locale.t('campusAfterSalesWorkbench.stateReceiving'),
    Refunded: locale.t('campusAfterSalesWorkbench.stateRefunded'),
    Rejected: locale.t('campusAfterSalesWorkbench.stateRejected'),
    RefundFailed: locale.t('campusAfterSalesWorkbench.stateFailed'),
    Approved: locale.t('campusAfterSalesWorkbench.stateApproved'),
    Appealed: locale.t('campusAfterSalesWorkbench.stateAppealed'),
    Closed: locale.t('campusAfterSalesWorkbench.stateClosed'),
  };
  return map[state] ?? state;
}

function stateClass(state: string): string {
  if (state === 'RefundFailed') return 'bad';
  if (state === 'Pending') return 'wait';
  if (state === 'Refunded') return 'ok';
  return 'mute';
}

function typeText(type: string): string {
  const map: Record<string, string> = {
    refund_only: locale.t('campusAfterSalesWorkbench.typeRefundOnly'),
    return_refund: locale.t('campusAfterSalesWorkbench.typeReturnRefund'),
    exchange: locale.t('campusAfterSalesWorkbench.typeExchange'),
  };
  return map[type] ?? type;
}

function taskTypeText(type: string): string {
  const map: Record<string, string> = {
    pending_remind: locale.t('campusAfterSalesWorkbench.taskTypePendingRemind'),
    pending_auto_approve: locale.t('campusAfterSalesWorkbench.taskTypeAutoApprove'),
    refund_retry: locale.t('campusAfterSalesWorkbench.taskTypeRefundRetry'),
  };
  return map[type] ?? type;
}

function taskStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: locale.t('campusAfterSalesWorkbench.taskStatusPending'),
    executed: locale.t('campusAfterSalesWorkbench.taskStatusExecuted'),
    cancelled: locale.t('campusAfterSalesWorkbench.taskStatusCancelled'),
    failed: locale.t('campusAfterSalesWorkbench.taskStatusFailed'),
  };
  return map[status] ?? status;
}

function taskClass(status: string): string {
  if (status === 'failed') return 'bad';
  if (status === 'executed') return 'ok';
  if (status === 'cancelled') return 'mute';
  return 'wait';
}

function attentionText(): string {
  const map: Record<string, string> = {
    unread: locale.t('campusAfterSalesWorkbench.chipPendingReply'),
    overdue: locale.t('campusAfterSalesWorkbench.chipOverdue'),
    dueSoon: locale.t('campusAfterSalesWorkbench.chipDueSoon'),
    followUp: locale.t('campusAfterSalesWorkbench.chipFollowUp'),
  };
  return map[attention.value] ?? attention.value;
}

/* ---------- 加载 ---------- */
async function loadWorkbench(): Promise<void> {
  try {
    wb.value = await campusMerchantAfterSalesWorkbench();
  } catch {
    wb.value = null;
  }
}

async function loadTasks(): Promise<void> {
  taskLoading.value = true;
  try {
    const res = await campusMerchantAfterSalesTasks({
      status: taskStatus.value === 'all' ? '' : taskStatus.value,
      take: taskScopeAll.value ? 50 : 10,
    });
    tasks.value = res.items;
    taskTotal.value = res.total;
  } catch (err: any) {
    tasks.value = [];
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.loadFailed')), icon: 'none' });
  } finally {
    taskLoading.value = false;
  }
}

async function loadList(reset: boolean): Promise<void> {
  if (reset) {
    listLoading.value = true;
    selectedIds.value = [];
  } else {
    listLoadingMore.value = true;
  }
  try {
    const res = await campusMerchantAfterSalesWorkItems({
      state: stateFilter.value || null,
      attention: attention.value || null,
      keyword: keyword.value.trim() || null,
      skip: reset ? 0 : items.value.length,
      take: PAGE,
    });
    counts.value = res.stateCounts;
    total.value = res.total;
    items.value = reset ? res.items : [...items.value, ...res.items];
  } catch (err: any) {
    if (reset) items.value = [];
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.loadFailed')), icon: 'none' });
  } finally {
    listLoading.value = false;
    listLoadingMore.value = false;
  }
}

async function reloadAll(): Promise<void> {
  loading.value = true;
  await Promise.all([loadWorkbench(), loadTasks(), loadList(true)]);
  loading.value = false;
}

/* ---------- 筛选 ---------- */
function setState(key: string): void {
  stateFilter.value = key;
  void loadList(true);
}

function setTaskStatus(key: string): void {
  taskStatus.value = key;
  void loadTasks();
}

function toggleTaskScope(): void {
  taskScopeAll.value = !taskScopeAll.value;
  void loadTasks();
}

function tapChip(c: { filter?: { state?: string; attention?: string } }): void {
  if (!c.filter) return;
  stateFilter.value = c.filter.state ?? '';
  attention.value = c.filter.attention ?? '';
  void loadList(true);
}

function clearAttention(): void {
  attention.value = '';
  void loadList(true);
}

function loadMore(): void {
  void loadList(false);
}

/* ---------- 选择 ---------- */
function togglePick(id: string): void {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
    return;
  }
  if (selectedIds.value.length >= 50) {
    uni.showToast({ title: locale.t('campusAfterSalesWorkbench.selectLimit'), icon: 'none' });
    return;
  }
  selectedIds.value.push(id);
}

function toggleAll(): void {
  selectedIds.value = allSelected.value ? [] : items.value.slice(0, 50).map(r => r.id);
}

/* ---------- 批量处置 ---------- */
function batchDone(res: MerchantAfterSalesBatchResult[]): void {
  const ok = res.filter(r => r.success).length;
  const fail = res.length - ok;
  const firstErr = res.find(r => !r.success)?.message;
  const title = ok && fail
    ? locale.t('campusAfterSalesWorkbench.batchDone').replace('{ok}', String(ok)).replace('{fail}', String(fail))
    : ok
      ? locale.t('campusAfterSalesWorkbench.batchDone').replace('{ok}', String(ok)).replace('{fail}', '0')
      : (firstErr || locale.t('campusAfterSalesWorkbench.batchAllFail'));
  uni.showToast({ title, icon: 'none' });
}

async function batchApprove(): Promise<void> {
  if (!selectedIds.value.length) return;
  uni.showModal({
    title: locale.t('campusAfterSalesWorkbench.batchApprove'),
    content: locale.t('campusAfterSalesWorkbench.approveConfirmBody').replace('{n}', String(selectedIds.value.length)),
    confirmText: locale.t('campusAfterSalesWorkbench.confirm'),
    cancelText: locale.t('campusAfterSalesWorkbench.cancel'),
    success: async r => {
      if (!r.confirm) return;
      try {
        const res = await campusMerchantAfterSalesBatchApprove(selectedIds.value);
        batchDone(res);
        await reloadAll();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.batchAllFail')), icon: 'none' });
      }
    },
  });
}

function openReason(mode: 'reject' | 'close'): void {
  if (!selectedIds.value.length) return;
  reasonMode.value = mode;
  reasonText.value = '';
}

function closeReason(): void {
  if (reasonBusy.value) return;
  reasonMode.value = '';
  reasonText.value = '';
}

async function submitReason(): Promise<void> {
  const why = reasonText.value.trim();
  if (!why) {
    uni.showToast({ title: locale.t('campusAfterSalesWorkbench.reasonRequired'), icon: 'none' });
    return;
  }
  reasonBusy.value = true;
  try {
    const ids = [...selectedIds.value];
    const res = reasonMode.value === 'reject'
      ? await campusMerchantAfterSalesBatchReject(ids, why)
      : await campusMerchantAfterSalesBatchClose(ids, why);
    reasonMode.value = '';
    batchDone(res);
    await reloadAll();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.batchAllFail')), icon: 'none' });
  } finally {
    reasonBusy.value = false;
  }
}

async function openAssign(): Promise<void> {
  if (!selectedIds.value.length) return;
  assignOpen.value = true;
  assignUserId.value = '';
  try {
    assignees.value = await campusMerchantAfterSalesAssignees();
  } catch {
    assignees.value = [];
  }
}

async function submitAssign(): Promise<void> {
  assignBusy.value = true;
  try {
    const res = await campusMerchantAfterSalesBatchAssign(selectedIds.value, assignUserId.value || null);
    assignOpen.value = false;
    batchDone(res);
    await reloadAll();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.batchAllFail')), icon: 'none' });
  } finally {
    assignBusy.value = false;
  }
}

/* ---------- 一键发放补偿挽留 ---------- */
async function openComp(): Promise<void> {
  if (selectedIds.value.length !== 1) {
    uni.showToast({ title: locale.t('campusAfterSalesWorkbench.compOneOnly'), icon: 'none' });
    return;
  }
  compOpen.value = true;
  planId.value = '';
  try {
    plans.value = await campusMerchantAfterSalesCompensationPlans();
  } catch {
    plans.value = [];
  }
}

function pickPlan(p: MerchantAfterSalesCompensationPlan): void {
  if (!p.enabled) {
    uni.showToast({ title: locale.t('campusAfterSalesWorkbench.planDisabled'), icon: 'none' });
    return;
  }
  planId.value = p.id;
}

async function submitComp(): Promise<void> {
  const plan = plans.value.find(p => p.id === planId.value);
  const id = selectedIds.value[0];
  if (!plan || !id) return;
  const body = locale.t('campusAfterSalesWorkbench.compConfirmBody').replace('{amt}', money(plan.refundAmount));
  uni.showModal({
    title: locale.t('campusAfterSalesWorkbench.compConfirmTitle'),
    content: body,
    confirmText: locale.t('campusAfterSalesWorkbench.confirm'),
    cancelText: locale.t('campusAfterSalesWorkbench.cancel'),
    success: async r => {
      if (!r.confirm) return;
      compBusy.value = true;
      try {
        const res = await campusMerchantAfterSalesApplyCompensation(id, plan.id);
        compOpen.value = false;
        const title = res.couponGranted
          ? locale.t('campusAfterSalesWorkbench.compCouponOk').replace('{amt}', money(res.refundAmount))
          : (res.message || locale.t('campusAfterSalesWorkbench.compDone'));
        uni.showToast({ title, icon: 'none' });
        await reloadAll();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.compFail')), icon: 'none' });
      } finally {
        compBusy.value = false;
      }
    },
  });
}

/* ---------- 任务执行 ---------- */
async function runTask(t: MerchantAfterSalesTask): Promise<void> {
  if (runningTaskId.value) return;
  runningTaskId.value = t.id;
  try {
    await campusMerchantAfterSalesRunTask(t.id);
    uni.showToast({ title: locale.t('campusAfterSalesWorkbench.taskRunOk'), icon: 'none' });
    await Promise.all([loadTasks(), loadWorkbench()]);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesWorkbench.taskRunFail')), icon: 'none' });
    await loadTasks();
  } finally {
    runningTaskId.value = '';
  }
}

/* ---------- 生命周期 ---------- */
onLoad(() => {
  void reloadAll();
});

onShow(() => {
  if (!loading.value) void loadWorkbench();
});

onPullDownRefresh(async () => {
  await reloadAll();
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx 32rpx 180rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0;
    &.empty { padding: 60rpx 32rpx; line-height: 1.6; }
    &.small { padding: 28rpx 0; font-size: 24rpx; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
      .act { font-size: 24rpx; color: $wa-accent; &.busy { opacity: .6; } }
    }
    .tip { display: block; margin-top: 14rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5;
      &.warn { color: #fa8c16; }
    }
    .seg { display: flex; gap: 12rpx; margin: 20rpx 0 8rpx;
      .seg-i { flex: 1; text-align: center; font-size: 24rpx; color: $wa-muted;
        padding: 12rpx 0; border-radius: $wa-radius; background: $wa-bg;
        &.on { background: $wa-accent; color: #fff; font-weight: 600; }
        .seg-n { font-size: 20rpx; margin-left: 6rpx; opacity: .8; }
      }
    }
  }
  .ov .grid { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx;
    .ch { width: calc((100% - 24rpx) / 3); background: $wa-bg; border-radius: $wa-radius;
      padding: 18rpx 8rpx; display: flex; flex-direction: column; align-items: center; gap: 4rpx;
      border: 2rpx solid transparent;
      .ch-n { font-size: 34rpx; color: $wa-ink; font-weight: 700; }
      .ch-l { font-size: 22rpx; color: $wa-muted; }
      &.hot .ch-n { color: #d4380d; }
      &.mute { opacity: .7; }
      &.on { border-color: $wa-accent; background: #fff; }
    }
  }
  .tasks { display: flex; flex-direction: column; gap: 4rpx; margin-top: 8rpx;
    .task { padding: 18rpx 0; border-top: 1px solid $wa-rule; display: flex; flex-direction: column; gap: 8rpx;
      .t-head { display: flex; align-items: center; gap: 12rpx;
        .t-type { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
        .t-due { font-size: 22rpx; color: $wa-muted; }
      }
      .t-st { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
        &.wait { color: #ad6800; background: #fffbe6; }
        &.ok { color: #237804; background: #f6ffed; }
        &.bad { color: #a8071a; background: #fff1f0; }
        &.mute { color: #8c8c8c; background: $wa-rule; }
      }
      .t-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx;
        .t-req { font-size: 22rpx; color: $wa-muted; }
        .t-attempt { font-size: 22rpx; color: $wa-muted; }
        .t-err { font-size: 22rpx; color: #a8071a; }
      }
      .t-run { align-self: flex-start; font-size: 24rpx; color: $wa-accent; margin-top: 4rpx; }
    }
  }
  .search { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
    .s-ipt { flex: 1; height: 72rpx; background: $wa-bg; border-radius: $wa-radius; padding: 0 24rpx;
      font-size: 26rpx; color: $wa-ink; }
    .s-act { font-size: 24rpx; color: $wa-accent; padding: 0 8rpx; }
  }
  .attn { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx;
    .attn-t { flex: 1; font-size: 22rpx; color: #1677ff; background: #eaf3ff;
      border-radius: 999rpx; padding: 6rpx 20rpx; }
    .attn-x { font-size: 22rpx; color: $wa-muted; }
  }
  .selall { display: flex; align-items: center; gap: 16rpx; margin-top: 14rpx;
    .sa-t { font-size: 24rpx; color: $wa-accent; }
    .sa-n { font-size: 22rpx; color: $wa-muted; margin-left: auto; }
  }
  .list { display: flex; flex-direction: column; gap: 16rpx;
    .row { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 28rpx;
      display: flex; flex-direction: column; gap: 10rpx; border: 2rpx solid transparent;
      &.picked { border-color: $wa-accent; }
      .r-top { display: flex; align-items: center; gap: 14rpx;
        .r-check { width: 34rpx; height: 34rpx; border-radius: 50%; border: 2rpx solid #d9d9d9;
          box-sizing: border-box; &.on { background: $wa-accent; border-color: $wa-accent; } }
        .r-code { flex: 1; font-size: 28rpx; color: $wa-ink; font-weight: 700; }
        .r-amt { font-size: 28rpx; color: #d4380d; font-weight: 700; }
      }
      .r-mid { display: flex; flex-wrap: wrap; align-items: center; gap: 10rpx;
        .r-state { font-size: 22rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
          &.wait { color: #ad6800; background: #fffbe6; }
          &.ok { color: #237804; background: #f6ffed; }
          &.bad { color: #a8071a; background: #fff1f0; }
          &.mute { color: #8c8c8c; background: $wa-rule; }
        }
        .r-tag { font-size: 20rpx; border-radius: 999rpx; padding: 2rpx 12rpx;
          &.bad { color: #a8071a; background: #fff1f0; }
          &.warn { color: #ad6800; background: #fffbe6; }
          &.info { color: #1677ff; background: #eaf3ff; }
          &.mute { color: #8c8c8c; background: $wa-rule; }
        }
      }
      .r-sub { display: flex; align-items: center; gap: 16rpx;
        .r-cus { font-size: 24rpx; color: $wa-ink; }
        .r-type { font-size: 22rpx; color: $wa-muted; }
        .r-t { font-size: 22rpx; color: $wa-muted; margin-left: auto; }
      }
      .r-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10rpx;
        .r-assignee { font-size: 22rpx; color: $wa-muted; }
        .r-tagv { font-size: 20rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 2rpx 12rpx; }
      }
      .r-reason { font-size: 24rpx; color: $wa-muted; line-height: 1.5; }
    }
  }
  .more { background: $wa-card; color: $wa-accent; font-size: 26rpx; border-radius: $wa-radius;
    line-height: 76rpx; margin-top: 24rpx; &[disabled] { opacity: .6; } }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: flex; align-items: center; gap: 18rpx; padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom));
    background: $wa-card; box-shadow: 0 -4rpx 16rpx rgba(0,0,0,.06);
    .bar-n { font-size: 22rpx; color: $wa-muted; flex: none; }
    .bar-b { font-size: 24rpx; color: $wa-ink; &.main { color: $wa-accent; font-weight: 600; } }
  }
  .mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 30;
    display: flex; align-items: flex-end;
    .sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0;
      padding: 28rpx 32rpx calc(36rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16rpx;
      max-height: 80vh;
      .sheet-head { display: flex; align-items: center; gap: 16rpx;
        .sheet-t { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
        .sheet-x { font-size: 30rpx; color: $wa-muted; }
      }
      .area { width: 100%; height: 180rpx; background: $wa-bg; border-radius: $wa-radius;
        padding: 20rpx 24rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
      .opts { display: flex; flex-direction: column; gap: 12rpx; max-height: 46vh; overflow-y: auto;
        .opt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx;
          display: flex; align-items: center; gap: 12rpx; border: 2rpx solid transparent;
          &.col { flex-direction: column; align-items: flex-start; gap: 6rpx; }
          &.on { border-color: $wa-accent; background: #fff; }
          &.off { opacity: .55; }
          .opt-line { display: flex; align-items: center; gap: 12rpx; width: 100%;
            .opt-t { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
            .opt-amt { font-size: 24rpx; color: #d4380d; }
          }
          .opt-t { font-size: 26rpx; color: $wa-ink; font-weight: 600; }
          .opt-s { font-size: 22rpx; color: $wa-muted; }
          .opt-note { font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
        }
      }
      .save { margin-top: 8rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
        border-radius: $wa-radius; line-height: 80rpx; border: none; &[disabled] { opacity: .5; } }
    }
  }
}
</style>

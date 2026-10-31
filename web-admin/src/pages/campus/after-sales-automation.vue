<template>
  <view class="page">
    <!-- 一、自动分流规则（§105） -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesAutomation.rulesTitle') }}</text>
        <text class="act" @tap="openRuleSheet(null)">+ {{ $t('campusAfterSalesAutomation.rulesAdd') }}</text>
      </view>
      <text class="tip">{{ $t('campusAfterSalesAutomation.rulesTip') }}</text>
      <view v-if="rulesLoading" class="hint">{{ $t('campusAfterSalesAutomation.loading') }}</view>
      <view v-else-if="!rules.length" class="inline-empty">{{ $t('campusAfterSalesAutomation.rulesEmpty') }}</view>
      <view v-else class="rules">
        <view v-for="r in rules" :key="r.id" class="rule">
          <view class="rl-head">
            <text class="rl-pri">P{{ r.priority }}</text>
            <text class="rl-name">{{ r.name }}</text>
            <text class="rl-state" :class="r.enabled ? 'on' : 'off'">
              {{ r.enabled ? $t('campusAfterSalesAutomation.enabled') : $t('campusAfterSalesAutomation.disabled') }}
            </text>
          </view>
          <view class="rl-cond">
            <text class="rc-chip">{{ matchTypeText(r.matchType) }}</text>
            <text v-if="r.matchReason" class="rc-chip">
              {{ $t('campusAfterSalesAutomation.ruleReasonChip').replace('{v}', r.matchReason) }}
            </text>
            <text v-if="amountText(r)" class="rc-chip">{{ amountText(r) }}</text>
          </view>
          <view class="rl-act">
            <text class="ra-arrow">→</text>
            <text class="ra-txt">{{ actionText(r.action) }}</text>
            <text v-if="r.rejectReason" class="ra-note">（{{ r.rejectReason }}）</text>
          </view>
          <view class="rl-ops">
            <text class="rl-o" @tap="openRuleSheet(r)">{{ $t('campusAfterSalesAutomation.edit') }}</text>
            <text class="rl-o" @tap="toggleRule(r)">
              {{ r.enabled ? $t('campusAfterSalesAutomation.disable') : $t('campusAfterSalesAutomation.enable') }}
            </text>
            <text class="rl-o danger" @tap="removeRule(r)">{{ $t('campusAfterSalesAutomation.delete') }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 二、自动分配 -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesAutomation.assignTitle') }}</text>
      </view>
      <text class="tip">{{ $t('campusAfterSalesAutomation.assignTip') }}</text>
      <view class="sw-row" @tap="assignForm.enabled = !assignForm.enabled">
        <text class="sw-lbl">{{ $t('campusAfterSalesAutomation.assignEnabled') }}</text>
        <view class="sw" :class="{ on: assignForm.enabled }"><text class="sw-i"></text></view>
      </view>
      <text class="fld-lbl">{{ $t('campusAfterSalesAutomation.assignMaxLbl') }}</text>
      <input
        v-model="assignForm.max"
        class="ipt"
        type="number"
        :placeholder="$t('campusAfterSalesAutomation.assignMaxPh')"
      />
      <text class="fld-tip">{{ $t('campusAfterSalesAutomation.assignMaxTip') }}</text>
      <button class="save" :disabled="savingAssign" @tap="saveAssign">
        {{ savingAssign ? $t('campusAfterSalesAutomation.saving') : $t('campusAfterSalesAutomation.save') }}
      </button>
    </view>

    <!-- 三、异常预警 -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesAutomation.alertTitle') }}</text>
      </view>
      <text class="tip">{{ $t('campusAfterSalesAutomation.alertTip') }}</text>
      <view class="sw-row" @tap="alertForm.enabled = !alertForm.enabled">
        <text class="sw-lbl">{{ $t('campusAfterSalesAutomation.alertEnabled') }}</text>
        <view class="sw" :class="{ on: alertForm.enabled }"><text class="sw-i"></text></view>
      </view>
      <text class="fld-lbl">{{ $t('campusAfterSalesAutomation.alertRateLbl') }}</text>
      <input
        v-model="alertForm.refundRate"
        class="ipt"
        type="number"
        :placeholder="$t('campusAfterSalesAutomation.alertRatePh')"
      />
      <text class="fld-tip">{{ $t('campusAfterSalesAutomation.alertRateTip') }}</text>
      <text class="fld-lbl">{{ $t('campusAfterSalesAutomation.alertOverdueLbl') }}</text>
      <input
        v-model="alertForm.overdueCount"
        class="ipt"
        type="number"
        :placeholder="$t('campusAfterSalesAutomation.alertOverduePh')"
      />
      <text class="fld-tip">{{ $t('campusAfterSalesAutomation.alertOverdueTip') }}</text>
      <button class="save" :disabled="savingAlert" @tap="saveAlert">
        {{ savingAlert ? $t('campusAfterSalesAutomation.saving') : $t('campusAfterSalesAutomation.save') }}
      </button>
    </view>

    <!-- 四、售后月度摘要推送 -->
    <view class="card">
      <view class="head">
        <text class="title">{{ $t('campusAfterSalesAutomation.pushTitle') }}</text>
      </view>
      <text class="tip">{{ $t('campusAfterSalesAutomation.pushTip') }}</text>
      <view class="sw-row" @tap="pushForm.enabled = !pushForm.enabled">
        <text class="sw-lbl">{{ $t('campusAfterSalesAutomation.pushEnabled') }}</text>
        <view class="sw" :class="{ on: pushForm.enabled }"><text class="sw-i"></text></view>
      </view>
      <view class="push-row">
        <picker mode="selector" :range="pushDayOptions" range-key="label" :value="pushDayIdx" @change="onPickDay">
          <view class="ipt picker">{{ pushDayOptions[pushDayIdx].label }}</view>
        </picker>
        <picker mode="time" :value="pushForm.time" @change="onPickPushTime">
          <view class="ipt picker time">{{ pushForm.time }}</view>
        </picker>
      </view>
      <text class="fld-tip">{{ $t('campusAfterSalesAutomation.pushTimeTip') }}</text>
      <button class="save" :disabled="savingPush" @tap="savePush">
        {{ savingPush ? $t('campusAfterSalesAutomation.saving') : $t('campusAfterSalesAutomation.save') }}
      </button>
    </view>

    <!-- 规则编辑弹层 -->
    <view v-if="ruleSheet" class="mask" @tap.self="closeRuleSheet">
      <view class="sheet">
        <view class="sheet__hd">
          <text class="sheet__t">
            {{ ruleForm.id ? $t('campusAfterSalesAutomation.ruleEditTitle') : $t('campusAfterSalesAutomation.ruleAddTitle') }}
          </text>
          <text class="sheet__x" @tap="closeRuleSheet">✕</text>
        </view>
        <text class="sheet__hint">{{ $t('campusAfterSalesAutomation.ruleHint') }}</text>

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleName') }}</text>
        <input v-model="ruleForm.name" class="ipt wide" maxlength="40" :placeholder="$t('campusAfterSalesAutomation.ruleNamePh')" />

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleAction') }}</text>
        <picker mode="selector" :range="actionOptions" range-key="label" :value="ruleForm.actionIdx" @change="onPickAction">
          <view class="ipt picker wide">{{ actionOptions[ruleForm.actionIdx].label }}</view>
        </picker>

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleMatchType') }}</text>
        <picker mode="selector" :range="matchOptions" range-key="label" :value="ruleForm.matchIdx" @change="onPickMatchType">
          <view class="ipt picker wide">{{ matchOptions[ruleForm.matchIdx].label }}</view>
        </picker>

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleMatchReason') }}</text>
        <input
          v-model="ruleForm.matchReason"
          class="ipt wide"
          maxlength="40"
          :placeholder="$t('campusAfterSalesAutomation.ruleMatchReasonPh')"
        />

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleAmount') }}</text>
        <view class="sheet__row">
          <input v-model="ruleForm.min" class="ipt" type="digit" :placeholder="$t('campusAfterSalesAutomation.ruleMinPh')" />
          <text class="sheet__sep">~</text>
          <input v-model="ruleForm.max" class="ipt" type="digit" :placeholder="$t('campusAfterSalesAutomation.ruleMaxPh')" />
        </view>
        <text class="fld-tip">{{ $t('campusAfterSalesAutomation.ruleAmountTip') }}</text>

        <text class="sheet__lbl">{{ $t('campusAfterSalesAutomation.rulePriority') }}</text>
        <input v-model="ruleForm.priority" class="ipt wide" type="number" :placeholder="$t('campusAfterSalesAutomation.rulePriorityPh')" />

        <text v-if="ruleForm.actionIdx === 1" class="sheet__lbl">{{ $t('campusAfterSalesAutomation.ruleRejectReason') }}</text>
        <input
          v-if="ruleForm.actionIdx === 1"
          v-model="ruleForm.rejectReason"
          class="ipt wide"
          maxlength="60"
          :placeholder="$t('campusAfterSalesAutomation.ruleRejectReasonPh')"
        />

        <view class="sheet__switch" @tap="ruleForm.enabled = !ruleForm.enabled">
          <text class="sheet__switch-lbl">{{ $t('campusAfterSalesAutomation.ruleEnabled') }}</text>
          <view class="sw" :class="{ on: ruleForm.enabled }"><text class="sw-i"></text></view>
        </view>

        <view class="sheet__ops">
          <text class="sheet__clear" @tap="closeRuleSheet">{{ $t('campusAfterSalesAutomation.cancel') }}</text>
          <button class="sheet__save" :disabled="ruleSaving" @tap="submitRule">
            {{ ruleSaving ? $t('campusAfterSalesAutomation.saving') : $t('campusAfterSalesAutomation.ruleSave') }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import {
  campusMerchantAfterSalesAutoRules,
  campusMerchantDeleteAfterSalesAutoRule,
  campusMerchantSaveAfterSalesAutoRule,
  campusMerchantStoreProfile,
  campusMerchantUpdateAfterSalesAutomation,
  campusMerchantUpdateAfterSalesMonthlyPush,
  type MerchantAfterSalesAutoRule,
} from '../../apis/campus';
import { yuanToFen } from '../../utils/money';
import { graphQlErrorMsg } from '../../apis/client';
import { useLocaleStore } from '../../stores/localeStore';
import { usePermGuard } from '../../composables/usePermGuard';

usePermGuard('CampusMerchant');

const locale = useLocaleStore();

/* ---------- 规则列表 ---------- */
const rulesLoading = ref(false);
const rules = ref<MerchantAfterSalesAutoRule[]>([]);

const actionKeys: Record<string, string> = {
  approve: 'campusAfterSalesAutomation.actApprove',
  reject: 'campusAfterSalesAutomation.actReject',
  escalate: 'campusAfterSalesAutomation.actEscalate',
};
const matchTypeKeys: Record<string, string> = {
  '*': 'campusAfterSalesAutomation.matchAny',
  refund_only: 'campusAfterSalesAutomation.matchRefundOnly',
  return_refund: 'campusAfterSalesAutomation.matchReturnRefund',
  exchange: 'campusAfterSalesAutomation.matchExchange',
};

function actionText(a: string): string {
  const k = actionKeys[a];
  return k ? locale.t(k) : a;
}

function matchTypeText(t: string): string {
  const k = matchTypeKeys[t];
  return k ? locale.t(k) : t;
}

/** 金额区间（分 → 元）；两端都为空则不显示 */
function amountText(r: MerchantAfterSalesAutoRule): string {
  if (r.minAmount == null && r.maxAmount == null) return '';
  const lo = r.minAmount == null ? '' : (r.minAmount / 100).toFixed(2);
  const hi = r.maxAmount == null ? '' : (r.maxAmount / 100).toFixed(2);
  if (lo && hi) return locale.t('campusAfterSalesAutomation.ruleAmountBoth').replace('{lo}', lo).replace('{hi}', hi);
  if (lo) return locale.t('campusAfterSalesAutomation.ruleAmountMin').replace('{lo}', lo);
  return locale.t('campusAfterSalesAutomation.ruleAmountMax').replace('{hi}', hi);
}

async function loadRules(): Promise<void> {
  rulesLoading.value = true;
  try {
    rules.value = await campusMerchantAfterSalesAutoRules();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.loadFailed')), icon: 'none' });
  } finally {
    rulesLoading.value = false;
  }
}

/* ---------- 规则编辑 ---------- */
const ruleSheet = ref(false);
const ruleSaving = ref(false);
/** picker 选项：label 必须走 i18n（直接渲染 key 会显示原始键名） */
const actionOptions = computed(() =>
  Object.keys(actionKeys).map(v => ({ value: v, label: locale.t(actionKeys[v]) })));
const matchOptions = computed(() =>
  Object.keys(matchTypeKeys).map(v => ({ value: v, label: locale.t(matchTypeKeys[v]) })));

const ruleForm = ref({
  id: '',
  name: '',
  actionIdx: 0,
  matchIdx: 0,
  matchReason: '',
  min: '',
  max: '',
  priority: '10',
  rejectReason: '',
  enabled: true,
});

function openRuleSheet(r: MerchantAfterSalesAutoRule | null): void {
  const matchIdx = r ? Math.max(0, matchOptions.value.findIndex(m => m.value === r.matchType)) : 0;
  const actionIdx = r ? Math.max(0, actionOptions.value.findIndex(a => a.value === r.action)) : 0;
  ruleForm.value = {
    id: r?.id ?? '',
    name: r?.name ?? '',
    actionIdx,
    matchIdx,
    matchReason: r?.matchReason ?? '',
    min: r?.minAmount == null ? '' : (r.minAmount / 100).toFixed(2),
    max: r?.maxAmount == null ? '' : (r.maxAmount / 100).toFixed(2),
    priority: String(r?.priority ?? (rules.value.length ? (rules.value[rules.value.length - 1].priority + 10) : 10)),
    rejectReason: r?.rejectReason ?? '',
    enabled: r?.enabled ?? true,
  };
  ruleSheet.value = true;
}

function closeRuleSheet(): void {
  if (ruleSaving.value) return;
  ruleSheet.value = false;
}

function onPickAction(e: any): void {
  ruleForm.value.actionIdx = Number(e?.detail?.value ?? 0);
}

function onPickMatchType(e: any): void {
  ruleForm.value.matchIdx = Number(e?.detail?.value ?? 0);
}

/** 空字符串 → null（不过滤）；非法金额 → 拦截 */
function parseAmount(raw: string, label: string): { ok: boolean; fen: number | null } {
  const s = (raw ?? '').trim();
  if (!s) return { ok: true, fen: null };
  const fen = yuanToFen(s);
  if (fen === null) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.amountInvalid').replace('{v}', label), icon: 'none' });
    return { ok: false, fen: null };
  }
  return { ok: true, fen };
}

async function submitRule(): Promise<void> {
  if (ruleSaving.value) return;
  const f = ruleForm.value;
  const name = f.name.trim();
  if (!name) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.nameRequired'), icon: 'none' });
    return;
  }
  const minR = parseAmount(f.min, locale.t('campusAfterSalesAutomation.ruleMinPh'));
  if (!minR.ok) return;
  const maxR = parseAmount(f.max, locale.t('campusAfterSalesAutomation.ruleMaxPh'));
  if (!maxR.ok) return;
  if (minR.fen !== null && maxR.fen !== null && minR.fen > maxR.fen) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.amountRangeInvalid'), icon: 'none' });
    return;
  }
  const priority = Number(f.priority);
  if (!Number.isFinite(priority) || priority < 0) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.priorityInvalid'), icon: 'none' });
    return;
  }
  const action = actionOptions.value[f.actionIdx].value;
  const rejectReason = action === 'reject' ? f.rejectReason.trim() : '';
  if (action === 'reject' && !rejectReason) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.rejectReasonRequired'), icon: 'none' });
    return;
  }
  ruleSaving.value = true;
  try {
    await campusMerchantSaveAfterSalesAutoRule({
      id: f.id || null,
      name,
      action,
      priority: Math.round(priority),
      enabled: f.enabled,
      matchType: matchOptions.value[f.matchIdx].value,
      matchReason: f.matchReason.trim() || null,
      minAmount: minR.fen,
      maxAmount: maxR.fen,
      rejectReason: rejectReason || null,
    });
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.ruleSaved'), icon: 'none' });
    ruleSheet.value = false;
    await loadRules();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
  } finally {
    ruleSaving.value = false;
  }
}

async function toggleRule(r: MerchantAfterSalesAutoRule): Promise<void> {
  try {
    await campusMerchantSaveAfterSalesAutoRule({
      id: r.id,
      name: r.name,
      action: r.action,
      priority: r.priority,
      enabled: !r.enabled,
      matchType: r.matchType,
      matchReason: r.matchReason,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
      rejectReason: r.rejectReason,
    });
    await loadRules();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
  }
}

function removeRule(r: MerchantAfterSalesAutoRule): void {
  uni.showModal({
    title: locale.t('campusAfterSalesAutomation.deleteTitle'),
    content: locale.t('campusAfterSalesAutomation.deleteBody').replace('{name}', r.name),
    confirmText: locale.t('campusAfterSalesAutomation.delete'),
    cancelText: locale.t('campusAfterSalesAutomation.cancel'),
    success: async res => {
      if (!res.confirm) return;
      try {
        await campusMerchantDeleteAfterSalesAutoRule(r.id);
        uni.showToast({ title: locale.t('campusAfterSalesAutomation.deleted'), icon: 'none' });
        await loadRules();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
      }
    },
  });
}

/* ---------- 自动分配 / 异常预警 / 月度推送 ---------- */
const assignForm = ref({ enabled: false, max: '0' });
const alertForm = ref({ enabled: false, refundRate: '0', overdueCount: '0' });
const pushForm = ref({ enabled: false, day: 1, time: '21:30' });
const savingAssign = ref(false);
const savingAlert = ref(false);
const savingPush = ref(false);

const pushDayOptions = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: locale.t('campusAfterSalesAutomation.pushDayLabel').replace('{n}', String(i + 1)),
}));
const pushDayIdx = computed(() => Math.max(0, pushForm.value.day - 1));

function onPickDay(e: any): void {
  const idx = Number(e?.detail?.value ?? 0);
  pushForm.value.day = pushDayOptions[Math.max(0, Math.min(27, idx))].value;
}

function onPickPushTime(e: any): void {
  pushForm.value.time = String(e?.detail?.value ?? '21:30');
}

function nonNegInt(raw: string, fallback: string): number | null {
  const s = (raw ?? '').trim();
  if (!/^\d+$/.test(s)) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.intRequired').replace('{v}', fallback), icon: 'none' });
    return null;
  }
  return Number(s);
}

async function loadProfile(): Promise<void> {
  try {
    const p = await campusMerchantStoreProfile();
    assignForm.value = { enabled: !!p.autoAssignEnabled, max: String(p.autoAssignMax ?? 0) };
    alertForm.value = {
      enabled: !!p.alertEnabled,
      refundRate: String(p.alertRefundRate ?? 0),
      overdueCount: String(p.alertOverdueCount ?? 0),
    };
    pushForm.value = {
      enabled: !!p.monthlyPushEnabled,
      day: Number(p.monthlyPushDay || 1),
      time: p.monthlyPushTime || '21:30',
    };
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.loadFailed')), icon: 'none' });
  }
}

async function saveAssign(): Promise<void> {
  if (savingAssign.value) return;
  const max = nonNegInt(assignForm.value.max || '0', locale.t('campusAfterSalesAutomation.assignMaxLbl'));
  if (max === null) return;
  savingAssign.value = true;
  try {
    const p = await campusMerchantUpdateAfterSalesAutomation({
      autoAssignEnabled: assignForm.value.enabled,
      autoAssignMax: max,
    });
    assignForm.value = { enabled: !!p.autoAssignEnabled, max: String(p.autoAssignMax ?? 0) };
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.saved'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
  } finally {
    savingAssign.value = false;
  }
}

async function saveAlert(): Promise<void> {
  if (savingAlert.value) return;
  const rate = nonNegInt(alertForm.value.refundRate || '0', locale.t('campusAfterSalesAutomation.alertRateLbl'));
  if (rate === null) return;
  if (rate > 100) {
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.rateOutOfRange'), icon: 'none' });
    return;
  }
  const overdue = nonNegInt(alertForm.value.overdueCount || '0', locale.t('campusAfterSalesAutomation.alertOverdueLbl'));
  if (overdue === null) return;
  savingAlert.value = true;
  try {
    const p = await campusMerchantUpdateAfterSalesAutomation({
      alertEnabled: alertForm.value.enabled,
      alertRefundRate: rate,
      alertOverdueCount: overdue,
    });
    alertForm.value = {
      enabled: !!p.alertEnabled,
      refundRate: String(p.alertRefundRate ?? 0),
      overdueCount: String(p.alertOverdueCount ?? 0),
    };
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.saved'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
  } finally {
    savingAlert.value = false;
  }
}

async function savePush(): Promise<void> {
  if (savingPush.value) return;
  savingPush.value = true;
  try {
    const p = await campusMerchantUpdateAfterSalesMonthlyPush({
      enabled: pushForm.value.enabled,
      day: pushForm.value.day,
      time: pushForm.value.time,
    });
    pushForm.value = {
      enabled: !!p.monthlyPushEnabled,
      day: Number(p.monthlyPushDay || 1),
      time: p.monthlyPushTime || '21:30',
    };
    uni.showToast({ title: locale.t('campusAfterSalesAutomation.saved'), icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('campusAfterSalesAutomation.saveFailed')), icon: 'none' });
  } finally {
    savingPush.value = false;
  }
}

onLoad(() => {
  void loadRules();
  void loadProfile();
});

onMounted(() => {
  if (!rules.value.length && !rulesLoading.value) void loadRules();
});

onPullDownRefresh(async () => {
  await Promise.all([loadRules(), loadProfile()]);
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 32rpx;
  .hint { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 60rpx 0; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 24rpx;
    .head { display: flex; align-items: center; gap: 16rpx;
      .title { flex: 1; font-size: 30rpx; color: $wa-ink; font-weight: 700; }
      .act { font-size: 24rpx; color: $wa-accent; }
    }
    .tip { display: block; margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .fld-lbl { display: block; font-size: 24rpx; color: $wa-ink; margin: 20rpx 0 8rpx; }
    .fld-tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.5; }
    .inline-empty { font-size: 24rpx; color: $wa-muted; padding: 32rpx 0; text-align: center; }
  }
  .ipt { background: $wa-bg; border-radius: $wa-radius; padding: 18rpx 24rpx;
    font-size: 26rpx; color: $wa-ink; box-sizing: border-box;
    &.picker { color: $wa-ink; }
    &.wide { width: 100%; margin-bottom: 4rpx; }
    &.time { text-align: center; }
  }
  .rules { display: flex; flex-direction: column; gap: 16rpx; margin-top: 16rpx;
    .rule { background: $wa-bg; border-radius: $wa-radius; padding: 20rpx 24rpx;
      display: flex; flex-direction: column; gap: 10rpx;
      .rl-head { display: flex; align-items: center; gap: 12rpx;
        .rl-pri { flex: none; font-size: 20rpx; color: #ad6800; background: #fff7e6;
          border-radius: 999rpx; padding: 2rpx 14rpx; }
        .rl-name { flex: 1; font-size: 26rpx; color: $wa-ink; font-weight: 600; }
        .rl-state { font-size: 20rpx; border-radius: 999rpx; padding: 2rpx 14rpx;
          &.on { color: #237804; background: #f6ffed; }
          &.off { color: #8c8c8c; background: $wa-rule; }
        }
      }
      .rl-cond { display: flex; flex-wrap: wrap; gap: 10rpx;
        .rc-chip { font-size: 20rpx; color: #1677ff; background: #eaf3ff;
          border-radius: 999rpx; padding: 2rpx 14rpx; }
      }
      .rl-act { display: flex; align-items: center; gap: 8rpx;
        .ra-arrow { font-size: 22rpx; color: $wa-muted; }
        .ra-txt { font-size: 24rpx; color: $wa-ink; }
        .ra-note { font-size: 20rpx; color: $wa-muted; }
      }
      .rl-ops { display: flex; align-items: center; gap: 28rpx; margin-top: 2rpx;
        .rl-o { font-size: 22rpx; color: $wa-accent;
          &.danger { color: #d4380d; margin-left: auto; }
        }
      }
    }
  }
  .sw-row { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx;
    .sw-lbl { flex: 1; font-size: 24rpx; color: $wa-ink; }
  }
  .push-row { display: flex; align-items: center; gap: 12rpx; margin-top: 20rpx;
    picker { flex: 1; }
  }
  .save { margin-top: 24rpx; background: $wa-accent; color: #fff; font-size: 28rpx;
    border-radius: $wa-radius; line-height: 80rpx; border: none;
    &[disabled] { opacity: .5; }
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
  &__row { display: flex; align-items: center; gap: 12rpx;
    .ipt { flex: 1; }
  }
  &__sep { color: $wa-muted; font-size: 26rpx; }
  &__switch { display: flex; align-items: center; gap: 16rpx; margin-top: 24rpx;
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

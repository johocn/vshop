<template>
  <view class="rpm">
    <view class="rpm-head">
      <text class="rpm-title">{{ $t('hotelRatePlan.title') }}</text>
      <text class="rpm-count">{{ $t('hotelRatePlan.count').replace('{n}', String(plans.length)) }}</text>
    </view>

    <view v-if="loading" class="rpm-tip">{{ $t('hotelRatePlan.loading') }}</view>
    <view v-else-if="!plans.length" class="rpm-tip">{{ $t('hotelRatePlan.empty') }}</view>
    <template v-else>
      <view class="rpm-item" v-for="p in plans" :key="p.id">
        <view class="rpm-row">
          <text class="rpm-badge" :class="p.adjustType">{{ typeLabel(p.adjustType) }}</text>
          <view class="rpm-main">
            <view class="rpm-name">{{ p.name }}</view>
            <view class="rpm-sub">
              <text>{{ p.code }} · {{ valueText(p) }}</text>
              <text class="rpm-dim"> · {{ memberText(p) }} · {{ periodText(p) }}</text>
            </view>
          </view>
          <switch :checked="p.enabled" color="#4f8cff" style="transform: scale(0.8)" @change="onToggle(p, $event)" />
        </view>

        <view class="rpm-actions">
          <text class="rpm-act" @tap="toggleQuick(p)">{{ quickId === p.id ? $t('hotelRatePlan.quickCollapse') : $t('hotelRatePlan.quickEdit') }}</text>
          <text class="rpm-act" @tap="openEditor(p)">{{ $t('hotelRatePlan.edit') }}</text>
          <text class="rpm-act danger" @tap="removePlan(p)">{{ $t('hotelRatePlan.del') }}</text>
          <text class="rpm-state" :class="{ off: !p.enabled }">{{ p.enabled ? $t('hotelRatePlan.enabledOn') : $t('hotelRatePlan.enabledOff') }}</text>
        </view>

        <!-- A 行内快捷改：调整值 + 售卖期 -->
        <view class="rpm-quick" v-if="quickId === p.id">
          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.adjustValueLabel') }}</text>
            <input
              class="rpm-inp"
              type="digit"
              v-model="quickForm.adjustValue"
              :placeholder="adjustValuePh(p.adjustType)"
            />
          </view>
          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.salePeriodLabel') }}</text>
            <view class="rpm-dates">
              <picker mode="date" :value="quickForm.dateFrom" :end="quickForm.dateTo || ''" @change="quickForm.dateFrom = $event.detail.value">
                <view class="rpm-date">{{ quickForm.dateFrom || $t('hotelRatePlan.dateFromPh') }}</view>
              </picker>
              <text class="rpm-sep">~</text>
              <picker mode="date" :value="quickForm.dateTo" :start="quickForm.dateFrom || ''" @change="quickForm.dateTo = $event.detail.value">
                <view class="rpm-date">{{ quickForm.dateTo || $t('hotelRatePlan.dateToPh') }}</view>
              </picker>
              <text class="rpm-clear" @tap="quickForm.dateFrom = ''; quickForm.dateTo = ''">{{ $t('hotelRatePlan.clearDates') }}</text>
            </view>
          </view>
          <view class="rpm-period-hint">{{ periodHint(quickForm.dateFrom, quickForm.dateTo) }}</view>
          <button class="rpm-btn" :disabled="quickSaving" @tap="saveQuick(p)">
            {{ quickSaving ? $t('hotelRatePlan.saving') : $t('hotelRatePlan.quickSave') }}
          </button>
        </view>
      </view>
    </template>

    <button class="rpm-add" @tap="openEditor(null)">{{ $t('hotelRatePlan.add') }}</button>

    <!-- B 弹层编辑（新建/编辑共用，全字段） -->
    <view class="rpm-mask" v-if="editorOpen" @tap="closeEditor">
      <view class="rpm-pop" @tap.stop>
        <view class="rpm-pop-head">
          <text class="rpm-pop-title">{{ editing ? $t('hotelRatePlan.editTitle') : $t('hotelRatePlan.newTitle') }}</text>
          <text class="rpm-pop-close" @tap="closeEditor">×</text>
        </view>
        <scroll-view scroll-y class="rpm-pop-body">
          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.codeLabel') }}</text>
            <input class="rpm-inp" v-model="form.code" :placeholder="$t('hotelRatePlan.codePh')" />
          </view>
          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.nameLabel') }}</text>
            <input class="rpm-inp" v-model="form.name" :placeholder="$t('hotelRatePlan.namePh')" />
          </view>

          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.adjustTypeLabel') }}</text>
            <view class="rpm-seg">
              <text class="rpm-chip" :class="{ on: form.adjustType === 'discount' }" @tap="form.adjustType = 'discount'">{{ $t('hotelRatePlan.discount') }}</text>
              <text class="rpm-chip" :class="{ on: form.adjustType === 'fixed' }" @tap="form.adjustType = 'fixed'">{{ $t('hotelRatePlan.fixed') }}</text>
              <text class="rpm-chip" :class="{ on: form.adjustType === 'surcharge' }" @tap="form.adjustType = 'surcharge'">{{ $t('hotelRatePlan.surcharge') }}</text>
            </view>
          </view>
          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.adjustValueLabel') }}</text>
            <input class="rpm-inp" type="digit" v-model="form.adjustValue" :placeholder="adjustValuePh(form.adjustType)" />
          </view>

          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.memberGateLabel') }}</text>
            <picker :range="memberRange" :value="form.memberIdx" @change="form.memberIdx = Number($event.detail.value)">
              <view class="rpm-date">{{ memberRange[form.memberIdx] || $t('hotelRatePlan.memberAny') }}</view>
            </picker>
          </view>

          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.salePeriodLabel') }}</text>
            <view class="rpm-dates">
              <picker mode="date" :value="form.dateFrom" :end="form.dateTo || ''" @change="form.dateFrom = $event.detail.value">
                <view class="rpm-date">{{ form.dateFrom || $t('hotelRatePlan.dateFromPh') }}</view>
              </picker>
              <text class="rpm-sep">~</text>
              <picker mode="date" :value="form.dateTo" :start="form.dateFrom || ''" @change="form.dateTo = $event.detail.value">
                <view class="rpm-date">{{ form.dateTo || $t('hotelRatePlan.dateToPh') }}</view>
              </picker>
            </view>
          </view>

          <view class="rpm-field">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.cancelPolicyLabel') }}</text>
            <view class="rpm-seg">
              <text class="rpm-chip" :class="{ on: form.policyMode === 'default' }" @tap="form.policyMode = 'default'">{{ $t('hotelRatePlan.policyDefault') }}</text>
              <text class="rpm-chip" :class="{ on: form.policyMode === 'freeUntil' }" @tap="form.policyMode = 'freeUntil'">{{ $t('hotelRatePlan.policyFreeUntil') }}</text>
              <text class="rpm-chip" :class="{ on: form.policyMode === 'nonRefundable' }" @tap="form.policyMode = 'nonRefundable'">{{ $t('hotelRatePlan.policyNonRefundable') }}</text>
            </view>
            <view class="rpm-hours" v-if="form.policyMode === 'freeUntil'">
              <input class="rpm-inp sm" type="number" v-model="form.freeHours" :placeholder="$t('hotelRatePlan.hoursPh')" />
              <text class="rpm-lbl">{{ $t('hotelRatePlan.policyHoursUnit') }}</text>
            </view>
          </view>

          <view class="rpm-field row">
            <text class="rpm-lbl">{{ $t('hotelRatePlan.enabledLabel') }}</text>
            <switch :checked="form.enabled" color="#4f8cff" @change="form.enabled = $event.detail.value" />
          </view>
        </scroll-view>
        <button class="rpm-btn" :disabled="editorSaving" @tap="saveEditor">
          {{ editorSaving ? $t('hotelRatePlan.saving') : $t('hotelRatePlan.save') }}
        </button>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
// 房价方案管理（P2 Task 9）：A 行内快捷改（调整值/售卖期）+ B 底部弹层全字段编辑（含取消政策覆盖）
// 契约：adjustValue discount 存千分比（900=×0.9）、fixed/surcharge 存分；memberOnly 存数字字符串/null；
// cancelPolicyOverride 存 JSON {type:'freeUntil'|'nonRefundable', freeUntilHours?} / null=跟随房型默认
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useLocaleStore } from '../../stores/localeStore';
import {
  fetchHotelRatePlans,
  createHotelRatePlan,
  updateHotelRatePlan,
  deleteHotelRatePlan,
  type HotelRatePlan,
  type HotelRatePlanInput,
} from '../../apis/hotelRatePlan';
import { graphQlErrorMsg } from '../../apis/client';

const props = defineProps<{ variantId: string }>();
const locale = useLocaleStore();

const plans = ref<HotelRatePlan[]>([]);
const loading = ref(false);

async function load() {
  if (!props.variantId) return;
  loading.value = true;
  try {
    plans.value = await fetchHotelRatePlans(props.variantId);
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRatePlan.saveFailed')), icon: 'none' });
  } finally {
    loading.value = false;
  }
}
watch(() => props.variantId, load);
onMounted(load);

// ---- 展示辅助 ----
function typeLabel(t: string): string {
  const map: Record<string, string> = { discount: 'hotelRatePlan.discount', fixed: 'hotelRatePlan.fixed', surcharge: 'hotelRatePlan.surcharge' };
  return locale.t(map[t] || 'hotelRatePlan.discount');
}

/** fixed/surcharge 分 → 元显示；discount 千分比原样 */
function displayValue(type: string, v: number): string {
  return type === 'discount' ? String(v) : String(v / 100);
}

/** UI 输入 → 存储值；非法返回 null（discount ‰；fixed/surcharge 元→分） */
function parseAdjustValue(type: string, raw: string): number | null {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n)) return null;
  if (type === 'discount') {
    const v = Math.round(n);
    return v >= 1 && v <= 1000 ? v : null;
  }
  const v = Math.round(n * 100);
  return type === 'fixed' ? (v > 0 ? v : null) : v >= 0 ? v : null;
}

function valueText(p: HotelRatePlan): string {
  if (p.adjustType === 'discount') {
    // zh 惯例「9 折」= ×0.9（v/100）；en 惯例 ×0.9（v/1000）
    const zh = locale.locale === 'zh-Hans';
    const num = zh ? String(p.adjustValue / 100) : String(p.adjustValue / 1000);
    return locale.t('hotelRatePlan.foldText').replace('{v}', num);
  }
  const yuan = String(p.adjustValue / 100);
  const night = locale.t('hotelRatePlan.perNight');
  return p.adjustType === 'fixed' ? `${night} ¥${yuan}` : `${night} +¥${yuan}`;
}

const memberRange = computed(() => {
  const out = [locale.t('hotelRatePlan.memberAny')];
  for (let i = 1; i <= 5; i++) out.push(locale.t('hotelRatePlan.memberLv').replace('{n}', String(i)));
  return out;
});

function memberText(p: HotelRatePlan): string {
  if (p.memberOnly == null) return locale.t('hotelRatePlan.memberAny');
  return locale.t('hotelRatePlan.memberLv').replace('{n}', String(Number(p.memberOnly)));
}

function periodText(p: HotelRatePlan): string {
  if (!p.dateFrom && !p.dateTo) return locale.t('hotelRatePlan.longTerm');
  return `${p.dateFrom ?? '…'} ~ ${p.dateTo ?? '…'}`;
}

function periodHint(from: string, to: string): string {
  if (!from && !to) return locale.t('hotelRatePlan.longTerm');
  return `${from || '…'} ~ ${to || '…'}`;
}

function adjustValuePh(type: string): string {
  const key = type === 'discount' ? 'adjustValuePhDiscount' : type === 'fixed' ? 'adjustValuePhFixed' : 'adjustValuePhSurcharge';
  return locale.t(`hotelRatePlan.${key}`);
}

// ---- 启停（就地保存，失败回滚） ----
async function onToggle(p: HotelRatePlan, e: any) {
  const next = !!e.detail.value;
  const prev = p.enabled;
  p.enabled = next;
  try {
    await updateHotelRatePlan(p.id, { enabled: next });
    uni.showToast({ title: locale.t(next ? 'hotelRatePlan.enabledOn' : 'hotelRatePlan.enabledOff'), icon: 'none' });
  } catch (err: any) {
    p.enabled = prev;
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRatePlan.saveFailed')), icon: 'none' });
  }
}

// ---- A 行内快捷改 ----
const quickId = ref<string | null>(null);
const quickForm = reactive({ adjustValue: '', dateFrom: '', dateTo: '' });
const quickSaving = ref(false);

function toggleQuick(p: HotelRatePlan) {
  if (quickId.value === p.id) {
    quickId.value = null;
    return;
  }
  quickId.value = p.id;
  quickForm.adjustValue = displayValue(p.adjustType, p.adjustValue);
  quickForm.dateFrom = p.dateFrom ?? '';
  quickForm.dateTo = p.dateTo ?? '';
}

async function saveQuick(p: HotelRatePlan) {
  if (quickSaving.value) return;
  const v = parseAdjustValue(p.adjustType, quickForm.adjustValue);
  if (v == null) {
    uni.showToast({ title: locale.t('hotelRatePlan.adjustValueLabel') + ' 无效', icon: 'none' });
    return;
  }
  if (quickForm.dateFrom && quickForm.dateTo && quickForm.dateFrom > quickForm.dateTo) {
    uni.showToast({ title: locale.t('hotelRatePlan.saveFailed'), icon: 'none' });
    return;
  }
  quickSaving.value = true;
  try {
    await updateHotelRatePlan(p.id, {
      adjustValue: v,
      dateFrom: quickForm.dateFrom || null,
      dateTo: quickForm.dateTo || null,
    });
    uni.showToast({ title: locale.t('hotelRatePlan.saved'), icon: 'success' });
    quickId.value = null;
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRatePlan.saveFailed')), icon: 'none' });
  } finally {
    quickSaving.value = false;
  }
}

// ---- B 弹层编辑（新建/编辑共用） ----
const editorOpen = ref(false);
const editorSaving = ref(false);
const editing = ref<HotelRatePlan | null>(null);
const form = reactive({
  code: '',
  name: '',
  adjustType: 'discount',
  adjustValue: '',
  memberIdx: 0,
  dateFrom: '',
  dateTo: '',
  policyMode: 'default', // default | freeUntil | nonRefundable
  freeHours: '24',
  enabled: true,
});

function parsePolicy(s: string | null): { mode: string; hours: string } | null {
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj?.type === 'nonRefundable') return { mode: 'nonRefundable', hours: '24' };
    if (obj?.type === 'freeUntil' && typeof obj.freeUntilHours === 'number') {
      return { mode: 'freeUntil', hours: String(obj.freeUntilHours) };
    }
  } catch { /* 坏 JSON 视作跟随默认 */ }
  return null;
}

function buildPolicy(mode: string, hours: string): string | null {
  if (mode === 'nonRefundable') return JSON.stringify({ type: 'nonRefundable' });
  if (mode === 'freeUntil') {
    return JSON.stringify({ type: 'freeUntil', freeUntilHours: Math.round(Number(hours)) });
  }
  return null;
}

function openEditor(p: HotelRatePlan | null) {
  editing.value = p;
  if (p) {
    form.code = p.code;
    form.name = p.name;
    form.adjustType = p.adjustType;
    form.adjustValue = displayValue(p.adjustType, p.adjustValue);
    form.memberIdx = p.memberOnly == null ? 0 : Math.min(5, Math.max(1, Number(p.memberOnly)));
    form.dateFrom = p.dateFrom ?? '';
    form.dateTo = p.dateTo ?? '';
    const cp = parsePolicy(p.cancelPolicyOverride);
    form.policyMode = cp?.mode ?? 'default';
    form.freeHours = cp?.hours ?? '24';
    form.enabled = p.enabled;
  } else {
    form.code = '';
    form.name = '';
    form.adjustType = 'discount';
    form.adjustValue = '';
    form.memberIdx = 0;
    form.dateFrom = '';
    form.dateTo = '';
    form.policyMode = 'default';
    form.freeHours = '24';
    form.enabled = true;
  }
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
}

async function saveEditor() {
  if (editorSaving.value) return;
  if (!form.code.trim() || !form.name.trim()) {
    uni.showToast({ title: locale.t('hotelRatePlan.saveFailed'), icon: 'none' });
    return;
  }
  const v = parseAdjustValue(form.adjustType, form.adjustValue);
  if (v == null) {
    uni.showToast({ title: locale.t('hotelRatePlan.adjustValueLabel') + ' 无效', icon: 'none' });
    return;
  }
  if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
    uni.showToast({ title: locale.t('hotelRatePlan.saveFailed'), icon: 'none' });
    return;
  }
  if (form.policyMode === 'freeUntil') {
    const h = Number(form.freeHours);
    if (!form.freeHours.trim() || !Number.isFinite(h) || h <= 0) {
      uni.showToast({ title: locale.t('hotelRatePlan.policyFreeUntil') + ' > 0', icon: 'none' });
      return;
    }
  }
  const policy = buildPolicy(form.policyMode, form.freeHours);
  const input: HotelRatePlanInput = {
    code: form.code.trim(),
    name: form.name.trim(),
    adjustType: form.adjustType,
    adjustValue: v,
    memberOnly: form.memberIdx === 0 ? null : String(form.memberIdx),
    dateFrom: form.dateFrom || null,
    dateTo: form.dateTo || null,
    cancelPolicyOverride: policy,
    enabled: form.enabled,
  };
  editorSaving.value = true;
  try {
    if (editing.value) {
      await updateHotelRatePlan(editing.value.id, input);
    } else {
      await createHotelRatePlan(props.variantId, input);
    }
    uni.showToast({ title: locale.t('hotelRatePlan.saved'), icon: 'success' });
    closeEditor();
    await load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRatePlan.saveFailed')), icon: 'none' });
  } finally {
    editorSaving.value = false;
  }
}

// ---- 删除 ----
function removePlan(p: HotelRatePlan) {
  uni.showModal({
    title: locale.t('hotelRatePlan.delTitle'),
    content: locale.t('hotelRatePlan.delContent').replace('{name}', p.name),
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await deleteHotelRatePlan(p.id);
        uni.showToast({ title: locale.t('hotelRatePlan.deleted'), icon: 'success' });
        await load();
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, locale.t('hotelRatePlan.saveFailed')), icon: 'none' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.rpm {
  margin-top: 16rpx;
  border-top: 1rpx solid $wa-rule;
  padding-top: 16rpx;
}
.rpm-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.rpm-title {
  font-size: 28rpx;
  font-weight: 600;
  color: $wa-ink;
}
.rpm-count {
  font-size: 22rpx;
  color: $wa-muted;
}
.rpm-tip {
  font-size: 24rpx;
  color: $wa-muted;
  padding: 12rpx 0;
}
.rpm-item {
  background: $wa-bg;
  border-radius: $wa-radius;
  padding: 16rpx;
  margin-bottom: 16rpx;
}
.rpm-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.rpm-badge {
  flex: none;
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #fff3e0;
  color: #e05500;
  &.fixed {
    background: #e8f5e9;
    color: #2e7d32;
  }
  &.surcharge {
    background: #ede7f6;
    color: #5e35b1;
  }
}
.rpm-main {
  flex: 1;
  min-width: 0;
}
.rpm-name {
  font-size: 26rpx;
  font-weight: 600;
  color: $wa-ink;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rpm-sub {
  font-size: 22rpx;
  color: $wa-accent-dark;
  margin-top: 4rpx;
}
.rpm-dim {
  color: $wa-muted;
}
.rpm-actions {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 12rpx;
}
.rpm-act {
  font-size: 24rpx;
  color: #4f8cff;
  &.danger {
    color: $wa-danger;
  }
}
.rpm-state {
  margin-left: auto;
  font-size: 22rpx;
  color: $wa-success;
  &.off {
    color: $wa-muted;
  }
}
.rpm-quick {
  margin-top: 12rpx;
  background: #fff;
  border-radius: $wa-radius;
  padding: 16rpx;
}
.rpm-field {
  margin-bottom: 16rpx;
  &.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
}
.rpm-lbl {
  display: block;
  font-size: 24rpx;
  color: $wa-muted;
  margin-bottom: 8rpx;
}
.rpm-inp {
  width: 100%;
  box-sizing: border-box;
  height: 64rpx;
  border: 1rpx solid $wa-rule;
  border-radius: 8rpx;
  padding: 0 16rpx;
  font-size: 26rpx;
  color: $wa-ink;
  &.sm {
    width: 160rpx;
    margin-right: 12rpx;
  }
}
.rpm-dates {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.rpm-date {
  min-width: 180rpx;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 16rpx;
  border: 1rpx solid $wa-rule;
  border-radius: 8rpx;
  font-size: 24rpx;
  color: $wa-ink;
  text-align: center;
}
.rpm-sep {
  color: $wa-muted;
}
.rpm-clear {
  font-size: 22rpx;
  color: #4f8cff;
}
.rpm-period-hint {
  font-size: 22rpx;
  color: $wa-muted;
  margin-bottom: 12rpx;
}
.rpm-seg {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
.rpm-chip {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid $wa-rule;
  color: $wa-muted;
  background: #fff;
  &.on {
    border-color: $wa-accent;
    color: $wa-accent;
    background: #fff3e0;
    font-weight: 600;
  }
}
.rpm-hours {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
  .rpm-lbl {
    margin-bottom: 0;
  }
}
.rpm-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  background: $wa-accent;
  color: #fff;
  font-size: 28rpx;
  border-radius: $wa-radius;
  margin-top: 8rpx;
  &[disabled] {
    opacity: 0.6;
  }
}
.rpm-add {
  width: 100%;
  height: 76rpx;
  line-height: 76rpx;
  background: #fff;
  color: $wa-accent;
  border: 2rpx dashed $wa-accent;
  border-radius: $wa-radius;
  font-size: 28rpx;
}

/* B 底部弹层 */
.rpm-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}
.rpm-pop {
  width: 100%;
  max-height: 85vh;
  background: $wa-card;
  border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.rpm-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.rpm-pop-title {
  font-size: 30rpx;
  font-weight: 600;
  color: $wa-ink;
}
.rpm-pop-close {
  font-size: 44rpx;
  color: $wa-muted;
  line-height: 1;
  padding: 0 8rpx;
}
.rpm-pop-body {
  flex: 1;
  max-height: 60vh;
}
</style>

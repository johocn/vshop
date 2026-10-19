<template>
  <view v-if="visible" class="mask" @tap.self="close">
    <view class="modal">
      <view class="head">
        <text class="t">{{ $t('couponWinback.title') }}</text>
        <text class="x" @tap="close">✕</text>
      </view>

      <scroll-view scroll-y class="body">
        <view class="field">
          <text class="lbl">{{ $t('couponWinback.fieldTemplate') }}</text>
          <picker :range="grantCandidates.map(t => t.name)" @change="(e: any) => (templateId = grantCandidates[Number(e.detail.value)]?.id ?? '')">
            <view class="ipt">{{ templateName(templateId) || $t('couponWinback.pickTemplate') }}</view>
          </picker>
          <view class="hint">{{ $t('couponWinback.templateHint') }}</view>
        </view>
        <view class="field">
          <text class="lbl">{{ $t('couponWinback.fieldDays') }}</text>
          <input class="ipt" type="number" v-model="days" />
          <view class="hint">{{ $t('couponWinback.daysHint') }}</view>
        </view>
        <view class="row-switch">
          <text class="lbl">{{ $t('couponWinback.fieldNotify') }}</text>
          <switch :checked="notify" color="#e1251b" @change="(e: any) => (notify = e.detail.value)" />
        </view>
        <view class="row-btns">
          <button class="ghost" :disabled="previewing" @tap="preview">{{ previewing ? $t('couponWinback.previewing') : $t('couponWinback.preview') }}</button>
          <button class="primary" :disabled="granting" @tap="grant">{{ granting ? $t('couponWinback.granting') : $t('couponWinback.grant') }}</button>
        </view>
        <view class="hint" v-if="previewCount !== null">{{ $t('couponWinback.previewResult').replace('{count}', String(previewCount)) }}</view>

        <view class="sec">{{ $t('couponWinback.batchesTitle') }}</view>
        <view class="batch" v-for="b in batches" :key="b.id" @tap="toggleBatch(b.id)">
          <view class="row-line">
            <text class="b-t">#{{ b.id }} · {{ templateName(b.templateId) || ('#' + b.templateId) }}</text>
            <text class="b-s">{{ b.issuedCount }}/{{ b.totalSelected }}</text>
          </view>
          <view class="row-line sub">
            <text>{{ $t('couponWinback.batchDays').replace('{days}', String(b.days)) }} · {{ fmtDT(b.createdAt) }}</text>
            <text>{{ b.notified ? $t('couponWinback.notifiedYes') : $t('couponWinback.notifiedNo') }}</text>
          </view>
          <view class="detail" v-if="openBatchId === b.id && batchDetail(b)">
            <text v-for="(line, i) in batchDetail(b)!" :key="i" class="d-line">{{ line }}</text>
          </view>
        </view>
        <view v-if="!batches.length && !loading" class="empty">{{ $t('couponWinback.noBatches') }}</view>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  fetchCouponTemplates, fetchCouponGrantBatches, fetchWinBackPreviewCount, grantCouponWinBack,
  type CouponTemplateItem, type CouponGrantBatchRow,
} from '../../apis/coupon';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const templates = ref<CouponTemplateItem[]>([]);
const grantCandidates = ref<CouponTemplateItem[]>([]);
const templateId = ref('');
const days = ref('90');
const notify = ref(true);
const previewing = ref(false);
const granting = ref(false);
const previewCount = ref<number | null>(null);
const batches = ref<CouponGrantBatchRow[]>([]);
const loading = ref(false);
const openBatchId = ref<string>('');

function templateName(id: string | number): string {
  return templates.value.find((t) => String(t.id) === String(id))?.name || '';
}

function fmtDT(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 批次明细摘要（前 10 行）：客户 · 成功券码 / 失败原因 */
function batchDetail(b: CouponGrantBatchRow): string[] | null {
  if (!b.resultsJson) return null;
  try {
    const rows = JSON.parse(b.resultsJson) as Array<{ customerId: string; ok: boolean; code?: string | null; reason?: string | null }>;
    return rows.slice(0, 10).map((r) => {
      if (r.ok) return `${r.customerId} · ${r.code || 'OK'}`;
      return `${r.customerId} · ${r.reason || 'FAILED'}`;
    });
  } catch {
    return null;
  }
}

function toggleBatch(id: string) {
  openBatchId.value = openBatchId.value === id ? '' : id;
}

async function load() {
  loading.value = true;
  previewCount.value = null;
  try {
    const [res, batchRows] = await Promise.all([fetchCouponTemplates({ skip: 0, take: 100 }), fetchCouponGrantBatches(20)]);
    templates.value = res.items;
    // E1 候选：GRANT 渠道券（未显式配渠道的老券也可定向发，与定向发券页口径一致）
    grantCandidates.value = res.items.filter(
      (t) => t.enabled && (!t.distributionChannels || String(t.distributionChannels).toUpperCase().includes('GRANT')),
    );
    batches.value = batchRows;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponList.opFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function preview() {
  if (previewing.value) return;
  previewing.value = true;
  try {
    previewCount.value = await fetchWinBackPreviewCount(Number(days.value) || 90);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponWinback.opFailed'), icon: 'none' });
  } finally {
    previewing.value = false;
  }
}

async function grant() {
  if (granting.value) return;
  if (!templateId.value) {
    uni.showToast({ title: locale.t('couponWinback.pickTemplateFirst'), icon: 'none' });
    return;
  }
  granting.value = true;
  try {
    const batch = await grantCouponWinBack(templateId.value, Number(days.value) || 90, notify.value);
    batches.value = [batch, ...batches.value].slice(0, 20);
    uni.showToast({
      title: locale.t('couponWinback.grantDone').replace('{ok}', String(batch.issuedCount)).replace('{total}', String(batch.totalSelected)),
      icon: 'none',
    });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponWinback.opFailed'), icon: 'none' });
  } finally {
    granting.value = false;
  }
}

function close() { emit('update:visible', false); }

watch(() => props.visible, (v) => { if (v) load(); });
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
.modal { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; max-height: 82vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx 16rpx;
  .t { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
  .x { font-size: 32rpx; color: $wa-muted; padding: 0 8rpx; } }
.body { flex: 1; min-height: 360rpx; padding: 0 32rpx 32rpx; box-sizing: border-box;
  .field { margin-bottom: 20rpx;
    .lbl { display: block; font-size: 24rpx; color: $wa-muted; margin-bottom: 8rpx; }
    .ipt { width: 100%; box-sizing: border-box; background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink; } }
  .hint { font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; line-height: 1.5; }
  .row-switch { display: flex; align-items: center; justify-content: space-between; padding: 10rpx 0;
    .lbl { font-size: 26rpx; color: $wa-ink; } }
  .row-btns { display: flex; gap: 16rpx; margin: 16rpx 0;
    button { flex: 1; font-size: 26rpx; border-radius: $wa-radius; }
    .ghost { background: $wa-bg; color: $wa-ink; }
    .primary { background: $wa-accent; color: #fff; }
    button[disabled] { opacity: 0.6; } }
  .sec { font-size: 26rpx; color: $wa-ink; font-weight: 600; margin: 24rpx 0 12rpx; }
  .batch { background: $wa-bg; border-radius: $wa-radius; padding: 16rpx 20rpx; margin-bottom: 12rpx;
    .row-line { display: flex; align-items: center; justify-content: space-between;
      .b-t { font-size: 25rpx; color: $wa-ink; }
      .b-s { font-size: 24rpx; color: $wa-accent; }
      &.sub { margin-top: 6rpx; text { font-size: 22rpx; color: $wa-muted; } } }
    .detail { margin-top: 10rpx; padding-top: 10rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-direction: column;
      .d-line { font-size: 22rpx; color: $wa-muted; line-height: 1.7; word-break: break-all; } } }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 40rpx 0; } }
</style>

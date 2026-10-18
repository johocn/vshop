<template>
  <view class="page">
    <view class="tip">{{ $t('billpay.mTip') }}</view>

    <view class="card" v-for="m in items" :key="m.id">
      <view class="top">
        <text class="name">{{ m.merchantName }}</text>
        <text class="rate">{{ rateLabel(m.settleRate) }}</text>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv"><text class="k">{{ $t('billpay.mSettleMode') }}</text><text class="v">{{ modeLabel(m.settleMode) }}</text></view>
          <view class="kv"><text class="k">{{ $t('billpay.mContact') }}</text><text class="v">{{ m.contact || '—' }}</text></view>
        </view>
        <view class="row" v-if="m.note">
          <text class="sub">{{ m.note }}</text>
        </view>
      </view>
      <view class="ops">
        <text class="edit" @tap="openForm(m)">{{ $t('billpay.mEdit') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('billpay.mEmpty') }}</view>
    <view v-if="loading" class="empty">{{ $t('billpay.loading') }}</view>

    <view class="fab" @tap="openForm(null)"><text>{{ $t('billpay.mAdd') }}</text></view>

    <!-- 新增/编辑表单 -->
    <view class="mask" v-if="formVisible" @tap="closeForm">
      <view class="sheet" @tap.stop>
        <view class="sheet-title">{{ form.id ? $t('billpay.mFormEdit') : $t('billpay.mFormNew') }}</view>
        <view class="f-row">
          <text class="k">{{ $t('billpay.mName') }}</text>
          <input class="f-input" type="text" v-model="form.merchantName" :placeholder="$t('billpay.mNamePh')" :disabled="!!form.id" />
        </view>
        <view class="f-row">
          <text class="k">{{ $t('billpay.mRate') }}</text>
          <input class="f-input" type="number" v-model="form.settleRate" :placeholder="$t('billpay.mRatePh')" />
        </view>
        <view class="f-row">
          <text class="k">{{ $t('billpay.mMode') }}</text>
          <picker :range="modeOptions" :value="modeIndex" @change="onModeChange">
            <view class="f-input picker-val">{{ modeOptions[modeIndex] || modeOptions[0] }}</view>
          </picker>
        </view>
        <view class="f-row">
          <text class="k">{{ $t('billpay.mContactLabel') }}</text>
          <input class="f-input" type="text" v-model="form.contact" :placeholder="$t('billpay.mContactPh')" />
        </view>
        <view class="f-row">
          <text class="k">{{ $t('billpay.mNoteLabel') }}</text>
          <input class="f-input" type="text" v-model="form.note" :placeholder="$t('billpay.mNotePh')" />
        </view>
        <button class="btn primary" :disabled="saving" @tap="onSave">{{ $t('billpay.mSave') }}</button>
        <text class="hint">{{ $t('billpay.mHint') }}</text>
      </view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import {
  fetchMerchantAgreements, saveMerchantAgreement, type MerchantAgreementRow,
} from '../../../apis/billpay';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();
const t = (k: string) => locale.t(k);

const items = ref<MerchantAgreementRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const formVisible = ref(false);

const modeOptions = computed(() => [t('billpay.mModePer'), t('billpay.mModeMonthly')]);
const MODE_KEYS = ['PER_ORDER', 'MONTHLY'];
const modeIndex = computed(() => Math.max(0, MODE_KEYS.indexOf(form.value.settleMode)));
function onModeChange(e: any) {
  form.value.settleMode = MODE_KEYS[Number(e.detail.value)] || 'PER_ORDER';
}

const form = ref({
  id: '',
  merchantName: '',
  settleRate: '85',
  settleMode: 'PER_ORDER',
  contact: '',
  note: '',
});

const rateLabel = (r: number) => `${r}% ${t('billpay.mRateSuffix')}`;
const modeLabel = (m: string) => (m === 'MONTHLY' ? t('billpay.mModeMonthly') : t('billpay.mModePer'));

function openForm(m: MerchantAgreementRow | null) {
  form.value = m
    ? {
        id: m.id,
        merchantName: m.merchantName,
        settleRate: String(m.settleRate ?? 85),
        settleMode: m.settleMode || 'PER_ORDER',
        contact: m.contact || '',
        note: m.note || '',
      }
    : { id: '', merchantName: '', settleRate: '85', settleMode: 'PER_ORDER', contact: '', note: '' };
  formVisible.value = true;
}
function closeForm() {
  formVisible.value = false;
}

async function onSave() {
  const name = form.value.merchantName.trim();
  const rate = Number(form.value.settleRate);
  if (!name) return uni.showToast({ title: t('billpay.mToastName'), icon: 'none' });
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    return uni.showToast({ title: t('billpay.mToastRate'), icon: 'none' });
  }
  saving.value = true;
  try {
    await saveMerchantAgreement(
      {
        merchantName: name,
        settleRate: Math.round(rate),
        settleMode: form.value.settleMode,
        contact: form.value.contact.trim() || undefined,
        note: form.value.note.trim() || undefined,
      },
      form.value.id || undefined,
    );
    uni.showToast({ title: t('billpay.mToastSaved'), icon: 'success' });
    formVisible.value = false;
    await load();
  } catch (e: any) {
    uni.showToast({ title: e?.message || t('billpay.mSaveFailed'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    items.value = await fetchMerchantAgreements();
  } catch (e: any) {
    uni.showToast({ title: e?.message || t('billpay.mLoadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tip { font-size: 22rpx; color: $wa-muted; line-height: 1.6; margin-bottom: 20rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
      .rate { font-size: 28rpx; color: $wa-danger; font-weight: 700; } }
    .rows { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; } }
        .sub { font-size: 22rpx; color: $wa-muted; } } }
    .ops { margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid $wa-rule;
      .edit { font-size: 26rpx; color: $wa-accent; } } }
  .fab { position: fixed; right: 40rpx; bottom: 60rpx; background: $wa-accent; color: #fff; border-radius: 999rpx; padding: 20rpx 36rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.18);
    text { font-size: 28rpx; color: #fff; } }
  .mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 99; display: flex; align-items: flex-end;
    .sheet { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; padding: 32rpx 40rpx calc(40rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 20rpx;
      .sheet-title { font-size: 30rpx; font-weight: 600; color: $wa-ink; text-align: center; }
      .f-row { display: flex; flex-direction: column; gap: 8rpx;
        .k { font-size: 22rpx; color: $wa-muted; }
        .f-input { background: $wa-bg; border: 1rpx solid $wa-rule; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 26rpx; color: $wa-ink;
          &.picker-val { line-height: 1.5; } } }
      .btn { border-radius: 12rpx; font-size: 28rpx; margin-top: 8rpx;
        &.primary { background: $wa-accent; color: #fff; }
        &[disabled] { opacity: .5; } }
      .hint { font-size: 20rpx; color: $wa-muted; text-align: center; } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

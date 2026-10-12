<template>
  <view class="withdraw-page">
    <view class="withdraw-page__balance">
      <text>{{ t('withdraw.available') }}</text>
      <text class="withdraw-page__amount">¥{{ (balance / 100).toFixed(2) }}</text>
      <text v-if="frozenBalance > 0" class="withdraw-page__frozen">{{ t('withdraw.frozen', { amount: (frozenBalance / 100).toFixed(2) }) }}</text>
    </view>

    <view class="section">
      <text class="section__title">{{ t('withdraw.applyTitle') }}</text>
      <input v-model.trim="amount" type="digit" :placeholder="t('withdraw.amountPlaceholder')" class="input" />
      <text class="section__hint">{{ t('withdraw.minHint', { amount: (minWithdrawalAmount / 100).toFixed(2) }) }}</text>
      <picker :range="methodNames" @change="onMethodChange">
        <view class="picker">
          <text>{{ t('withdraw.methodLabel', { name: methodNames[methodIndex] }) }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
      <input v-model.trim="account" :placeholder="accountPlaceholder" class="input" />
      <button class="withdraw-page__btn" :disabled="submitting" @click="doSubmit">
        {{ submitting ? t('withdraw.submitting') : t('withdraw.submit') }}
      </button>
    </view>

    <view class="section">
      <text class="section__title">{{ t('withdraw.records') }}</text>
      <view v-for="r in items" :key="r.id" class="record-item">
        <view class="record-item__left">
          <text class="record-item__amount">¥{{ (r.amount / 100).toFixed(2) }}</text>
          <text class="record-item__method">{{ methodLabel(r.method) }} · {{ r.accountInfo }}</text>
          <text v-if="r.remark" class="record-item__remark">{{ r.remark }}</text>
        </view>
        <view class="record-item__right">
          <text class="record-item__status" :class="'record-item__status--' + r.status">{{ statusLabel(r.status) }}</text>
          <text class="record-item__date">{{ fmtTime(r.createdAt) }}</text>
        </view>
      </view>
      <EmptyState v-if="items.length === 0 && !loading" :text="t('withdraw.empty')" />
      <view v-if="loading" class="withdraw-page__loading">{{ t('withdraw.loading') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getMyBalanceWithFrozen, getMyBalanceWithdrawals, requestBalanceWithdrawal } from '../../api/queries/withdraw';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const ui = useUIStore();

const balance = ref(0);
const frozenBalance = ref(0);
// 起提金额（分）：后端 myBalanceWithFrozen 返回渠道配置值，异常/未配置回退 ¥10
const minWithdrawalAmount = ref(1000);
const amount = ref('');
const account = ref('');
const submitting = ref(false);

// 收款方式：key 与后端 method 枚举对齐
const METHODS = computed(() => [
    { key: 'wechat', name: t('withdraw.methodWechat'), placeholder: t('withdraw.phWechat') },
    { key: 'alipay', name: t('withdraw.methodAlipay'), placeholder: t('withdraw.phAlipay') },
    { key: 'bank', name: t('withdraw.methodBank'), placeholder: t('withdraw.phBank') },
]);
const methodNames = computed(() => METHODS.value.map(m => m.name));
const methodIndex = ref(0);
const accountPlaceholder = computed(() => METHODS.value[methodIndex.value].placeholder);

function methodLabel(m: string): string {
    const map: Record<string, string> = { wechat: t('withdraw.methodWechat'), alipay: t('withdraw.methodAlipay'), bank: t('withdraw.methodBank') };
    return map[m] || m;
}
function statusLabel(s: string): string {
    const map: Record<string, string> = {
        pending: t('withdraw.statusPending'),
        approved: t('withdraw.statusApproved'),
        paid: t('withdraw.statusPaid'),
        rejected: t('withdraw.statusRejected'),
    };
    return map[s] || s;
}
function fmtTime(s: string): string {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s).replace('T', ' ').slice(0, 16);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function onMethodChange(e: any) {
    methodIndex.value = Number(e.detail.value) || 0;
}

const { items, loading, loadMore, refresh } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        const r: any = await getMyBalanceWithdrawals({ take, skip });
        return r?.myBalanceWithdrawals || { items: [], totalItems: 0 };
    },
});

onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await Promise.all([refresh(), loadBalance()]); uni.stopPullDownRefresh(); });

async function loadBalance() {
    try {
        const r: any = await getMyBalanceWithFrozen();
        balance.value = r.myBalanceWithFrozen?.balance || 0;
        frozenBalance.value = r.myBalanceWithFrozen?.frozenBalance || 0;
        const min = r.myBalanceWithFrozen?.minWithdrawalAmount;
        if (Number.isFinite(min) && min > 0) minWithdrawalAmount.value = min;
    } catch (e) { ui.showToast(t('withdraw.balanceLoadFailed'), 'error'); }
}

onMounted(() => loadBalance());

async function doSubmit() {
    const yuan = Number(amount.value);
    if (!yuan || yuan <= 0) { ui.showToast(t('withdraw.invalidAmount'), 'error'); return; }
    if (Math.round(yuan * 100) < minWithdrawalAmount.value) {
        ui.showToast(t('withdraw.minHint', { amount: (minWithdrawalAmount.value / 100).toFixed(2) }), 'error');
        return;
    }
    if (!account.value) { ui.showToast(t('withdraw.accountRequired'), 'error'); return; }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await requestBalanceWithdrawal(Math.round(yuan * 100), METHODS.value[methodIndex.value].key, account.value);
        ui.showToast(t('withdraw.submitted'), 'success');
        amount.value = '';
        account.value = '';
        await Promise.all([loadBalance(), refresh()]);
    } catch (e: any) {
        ui.showToast(e?.message || t('withdraw.failed'), 'error');
    } finally {
        submitting.value = false;
    }
}
</script>

<style lang="scss" scoped>
.withdraw-page {
    padding: 20rpx;
    &__balance {
        background: $brand-color; color: #fff; padding: 40rpx; border-radius: $radius-md; text-align: center; margin-bottom: 20rpx;
        & .withdraw-page__amount { font-size: 60rpx; font-weight: bold; display: block; margin-top: 12rpx; }
        & .withdraw-page__frozen { font-size: 24rpx; opacity: 0.8; display: block; margin-top: 8rpx; }
    }
    &__btn {
        margin-top: 20rpx; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 88rpx; font-size: 30rpx;
    }
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
.section {
    background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 20rpx;
    &__title { font-weight: bold; font-size: 28rpx; display: block; margin-bottom: 16rpx; }
    &__hint { color: #999; font-size: 22rpx; display: block; margin-bottom: 12rpx; }
}
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-bottom: 16rpx; }
.picker { display: flex; justify-content: space-between; align-items: center; height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-bottom: 16rpx; &__arrow { color: #ccc; } }
.record-item {
    padding: 20rpx 0; border-bottom: 1rpx solid $border-color; display: flex; justify-content: space-between; align-items: center; font-size: 26rpx;
    &:last-child { border-bottom: none; }
    &__left { display: flex; flex-direction: column; }
    &__amount { font-weight: bold; font-size: 30rpx; }
    &__method { color: #999; font-size: 22rpx; margin-top: 4rpx; max-width: 420rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__remark { color: #999; font-size: 20rpx; margin-top: 4rpx; }
    &__right { display: flex; flex-direction: column; align-items: flex-end; }
    &__status { font-size: 24rpx; &--pending { color: #b45309; } &--approved { color: $brand-color; } &--paid { color: $success-color; } &--rejected { color: #999; } }
    &__date { color: #999; font-size: 22rpx; margin-top: 4rpx; }
}
</style>

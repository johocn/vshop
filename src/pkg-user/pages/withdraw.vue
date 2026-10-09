<template>
  <view class="withdraw-page">
    <view class="withdraw-page__balance">
      <text>可提余额</text>
      <text class="withdraw-page__amount">¥{{ (balance / 100).toFixed(2) }}</text>
      <text v-if="frozenBalance > 0" class="withdraw-page__frozen">冻结中 ¥{{ (frozenBalance / 100).toFixed(2) }}</text>
    </view>

    <view class="section">
      <text class="section__title">申请提现</text>
      <input v-model.trim="amount" type="digit" placeholder="提现金额（元），最低 ¥10" class="input" />
      <picker :range="methodNames" @change="onMethodChange">
        <view class="picker">
          <text>收款方式：{{ methodNames[methodIndex] }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
      <input v-model.trim="account" :placeholder="accountPlaceholder" class="input" />
      <button class="withdraw-page__btn" :disabled="submitting" @click="doSubmit">
        {{ submitting ? '提交中...' : '提交申请' }}
      </button>
    </view>

    <view class="section">
      <text class="section__title">提现记录</text>
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
      <EmptyState v-if="items.length === 0 && !loading" text="暂无提现记录" />
      <view v-if="loading" class="withdraw-page__loading">加载中...</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { getMyBalanceWithFrozen, getMyBalanceWithdrawals, requestBalanceWithdrawal } from '../../api/queries/withdraw';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';
import { useUIStore } from '../../stores/ui';

const ui = useUIStore();

const balance = ref(0);
const frozenBalance = ref(0);
const amount = ref('');
const account = ref('');
const submitting = ref(false);

// 收款方式：key 与后端 method 枚举对齐
const METHODS = [
    { key: 'wechat', name: '微信', placeholder: '请输入微信号' },
    { key: 'alipay', name: '支付宝', placeholder: '请输入支付宝账号' },
    { key: 'bank', name: '银行卡', placeholder: '请输入银行卡号' },
];
const methodNames = METHODS.map(m => m.name);
const methodIndex = ref(0);
const accountPlaceholder = computed(() => METHODS[methodIndex.value].placeholder);

const METHOD_LABEL: Record<string, string> = { wechat: '微信', alipay: '支付宝', bank: '银行卡' };
function methodLabel(m: string): string { return METHOD_LABEL[m] || m; }
const STATUS_LABEL: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    paid: '已打款',
    rejected: '已驳回',
};
function statusLabel(s: string): string { return STATUS_LABEL[s] || s; }
function fmtTime(s: string): string {
    return s ? String(s).replace('T', ' ').slice(0, 16) : '';
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
    } catch (e) {}
}

onMounted(() => loadBalance());

async function doSubmit() {
    const yuan = Number(amount.value);
    if (!yuan || yuan <= 0) { ui.showToast('请输入正确的提现金额', 'error'); return; }
    if (!account.value) { ui.showToast('请输入收款账号', 'error'); return; }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await requestBalanceWithdrawal(Math.round(yuan * 100), METHODS[methodIndex.value].key, account.value);
        ui.showToast('申请已提交', 'success');
        amount.value = '';
        account.value = '';
        await Promise.all([loadBalance(), refresh()]);
    } catch (e: any) {
        ui.showToast(e?.message || '提交失败', 'error');
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

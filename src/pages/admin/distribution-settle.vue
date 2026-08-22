<template>
  <view class="ds-page">
    <view class="ds-tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="ds-tab"
        :class="{ 'ds-tab--active': active === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</view>
    </view>

    <!-- 分销员 -->
    <scroll-view v-if="active === 'distributors'" class="ds-scroll" scroll-y>
      <view class="ds-toolbar">
        <button class="ds-settle-btn" @click="doSettleNow">立即结算</button>
      </view>
      <view v-for="d in distributors" :key="d.id" class="ds-card">
        <view class="ds-card__head">
          <text class="ds-card__title">{{ d.customerEmail || ('客户#' + d.customerId) }}</text>
          <text class="ds-tag" :class="'ds-tag--' + d.status">{{ statusText(d.status) }}</text>
        </view>
        <text class="ds-card__meta">等级 V{{ d.level }} · 推荐码 {{ d.referralCode }}</text>
        <view class="ds-card__moneys">
          <text class="ds-money">累计 ¥{{ formatYuan(d.totalEarnings) }}</text>
          <text class="ds-money">可用 ¥{{ formatYuan(d.availableBalance) }}</text>
          <text class="ds-money">冻结 ¥{{ formatYuan(d.frozenBalance) }}</text>
        </view>
        <view class="ds-card__actions">
          <button v-if="d.status === 'pending'" class="ds-btn ds-btn--ok" @click="doApproveDistributor(d.id)">审批</button>
          <button v-if="d.status === 'active'" class="ds-btn ds-btn--warn" @click="doFreezeDistributor(d.id)">冻结</button>
        </view>
      </view>
      <LoadingSkeleton v-if="loading" type="list" :count="3" />
    </scroll-view>

    <!-- 佣金记录 -->
    <scroll-view v-else-if="active === 'commissions'" class="ds-scroll" scroll-y>
      <view v-for="c in commissions" :key="c.id" class="ds-row">
        <view class="ds-row__main">
          <text class="ds-row__name">{{ typeText(c.commissionType) }} · {{ commissionStatusText(c.status) }}</text>
          <text class="ds-row__sub">分销 #{{ c.distributorId }} · 订单 #{{ c.orderId }}</text>
          <text class="ds-row__sub">订单 ¥{{ formatYuan(c.orderAmount) }} · 费率 {{ (c.commissionRate / 100).toFixed(2) }}%</text>
          <text class="ds-row__sub">时间：{{ fmt(c.settledAt || c.createdAt) }}</text>
        </view>
        <text class="ds-row__amount">+¥{{ formatYuan(c.commissionAmount) }}</text>
      </view>
      <LoadingSkeleton v-if="loading" type="list" :count="3" />
    </scroll-view>

    <!-- 提现申请 -->
    <scroll-view v-else class="ds-scroll" scroll-y>
      <view v-for="w in withdrawals" :key="w.id" class="ds-card" :class="{ 'ds-card--paid': w.status === 'paid' }">
        <view class="ds-card__head">
          <text class="ds-card__title">提现 ¥{{ formatYuan(w.amount) }}</text>
          <text class="ds-tag" :class="'ds-tag--w' + w.status">{{ withdrawalStatusText(w.status) }}</text>
        </view>
        <text class="ds-card__meta">{{ methodText(w.method) }} · {{ w.accountInfo }}</text>
        <text class="ds-card__meta">申请：{{ fmt(w.createdAt) }}{{ w.reviewedAt ? ' · 审核：' + fmt(w.reviewedAt) : '' }}{{ w.paidAt ? ' · 打款：' + fmt(w.paidAt) : '' }}</text>
        <view class="ds-card__actions">
          <button v-if="w.status === 'pending'" class="ds-btn ds-btn--ok" @click="doWithdraw(w.id, 'approve')">批准</button>
          <button v-if="w.status === 'pending'" class="ds-btn ds-btn--danger" @click="doWithdraw(w.id, 'reject')">驳回</button>
          <button v-if="w.status === 'approved'" class="ds-btn ds-btn--ok" @click="doWithdraw(w.id, 'paid')">标记已打款</button>
        </view>
      </view>
      <LoadingSkeleton v-if="loading" type="list" :count="3" />
    </scroll-view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
    getAdminDistributors,
    getAdminCommissionRecords,
    getAdminWithdrawalRequests,
    approveDistributorAdmin,
    freezeDistributorAdmin,
    approveWithdrawalAdmin,
    rejectWithdrawalAdmin,
    markWithdrawalPaidAdmin,
    settleCommissionsNowAdmin,
    formatYuan,
} from '../../api/queries/distribution';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const tabs = [
    { key: 'distributors', label: '分销员' },
    { key: 'commissions', label: '佣金记录' },
    { key: 'withdrawals', label: '提现申请' },
];
const active = ref('distributors');
const distributors = ref<any[]>([]);
const commissions = ref<any[]>([]);
const withdrawals = ref<any[]>([]);
const loading = ref(false);

onShow(() => { loadAll(); });

function switchTab(key: string) {
    active.value = key;
    loadSection(key);
}

function loadAll() { loadSection(active.value); }

async function loadSection(key: string) {
    loading.value = true;
    try {
        if (key === 'distributors') {
            const res: any = await getAdminDistributors({ take: 100 });
            distributors.value = res.distributors?.items || [];
        } else if (key === 'commissions') {
            const res: any = await getAdminCommissionRecords({ take: 100 });
            commissions.value = res.commissionRecords?.items || [];
        } else {
            const res: any = await getAdminWithdrawalRequests({ take: 100 });
            withdrawals.value = res.withdrawalRequests?.items || [];
        }
    } catch (e: any) {
        console.error(e);
        uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
    loading.value = false;
}

function refresh() {
    if (active.value === 'distributors') loadSection('distributors');
    if (active.value === 'withdrawals') loadSection('withdrawals');
}

async function run(label: string, fn: () => Promise<any>) {
    try {
        await fn();
        uni.showToast({ title: label + '成功', icon: 'none' });
        refresh();
    } catch (e: any) {
        console.error(e);
        uni.showToast({ title: (e.message || label) + '失败', icon: 'none' });
    }
}

function doApproveDistributor(id: string) { run('审批', () => approveDistributorAdmin(id)); }
function doFreezeDistributor(id: string) { run('冻结', () => freezeDistributorAdmin(id)); }
function doWithdraw(id: string, action: 'approve' | 'reject' | 'paid') {
    run(
        action === 'approve' ? '批准' : action === 'reject' ? '驳回' : '打款',
        () => action === 'approve' ? approveWithdrawalAdmin(id) : action === 'reject' ? rejectWithdrawalAdmin(id) : markWithdrawalPaidAdmin(id),
    );
}
function doSettleNow() { run('结算', () => settleCommissionsNowAdmin()); }

// ---- 文案 ----
function statusText(s: string): string {
    return { active: '正常', frozen: '已冻结', pending: '待审核' }[s] ?? s;
}
function typeText(t: string): string {
    return { direct: '直推', indirect: '间推' }[t] ?? t;
}
function commissionStatusText(s: string): string {
    return { pending: '待结算', confirmed: '已入账', paid: '已打款', cancelled: '已取消' }[s] ?? s;
}
function methodText(m: string): string {
    return { bank: '银行', alipay: '支付宝', wechat: '微信' }[m] ?? m;
}
function withdrawalStatusText(s: string): string {
    return { pending: '待审核', approved: '已批准', paid: '已打款', rejected: '已驳回' }[s] ?? s;
}
function fmt(t?: string): string {
    if (!t) return '';
    return t.replace('T', ' ').slice(0, 16);
}
</script>
<style lang="scss" scoped>
.ds-page { min-height: 100vh; background: $bg-color; }
.ds-tabs { display: flex; background: #fff; position: sticky; top: 0; z-index: 10; }
.ds-tab { flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: $text-color; border-bottom: 4rpx solid transparent; &--active { color: $brand-color; font-weight: bold; border-bottom-color: $brand-color; } }
.ds-scroll { padding: 20rpx; height: 90vh; }

.ds-card { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 20rpx; &--paid { border: 1rpx solid #e9f7ec; } &__head { display: flex; justify-content: space-between; align-items: center; } &__title { font-size: 30rpx; font-weight: bold; } &__meta { font-size: 22rpx; color: $text-color-secondary; display: block; margin-top: 8rpx; } &__moneys { display: flex; gap: 30rpx; margin-top: 16rpx; } &__actions { display: flex; gap: 20rpx; margin-top: 20rpx; } }

.ds-tag { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; &--active, &--wpaid { background: #e9f7ec; color: #18a058; } &--frozen, &--wrejected { background: #fdeeee; color: #f56c6c; } &--pending, &--wpending { background: #fff7e6; color: #e6a23c; } &--wapproved { background: #e6f1ff; color: #2f79d8; } }

.ds-row { background: #fff; border-radius: $radius-md; padding: 22rpx 24rpx; margin-bottom: 16rpx; display: flex; justify-content: space-between; align-items: center; &__main { flex: 1; margin-right: 20rpx; } &__name { font-size: 28rpx; display: block; } &__sub { font-size: 22rpx; color: $text-color-secondary; display: block; margin-top: 4rpx; } &__amount { font-size: 28rpx; font-weight: bold; color: $brand-color; } }

.ds-money { font-size: 24rpx; color: $text-color; }
.ds-toolbar { margin-bottom: 16rpx; display: flex; justify-content: flex-end; }
.ds-settle-btn { background: $brand-color; color: #fff; font-size: 26rpx; height: 64rpx; line-height: 64rpx; border-radius: $radius-md; padding: 0 30rpx; }
.ds-btn { flex: 1; height: 64rpx; line-height: 64rpx; font-size: 26rpx; border-radius: $radius-md; &--ok { background: $brand-color; color: #fff; } &--warn { background: #e6a23c; color: #fff; } &--danger { background: #f56c6c; color: #fff; } }
</style>
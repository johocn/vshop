<template>
  <view class="dist-center">
    <!-- 未申请：引导申请成为分销商 -->
    <view v-if="!profile" class="dc-empty">
      <text class="dc-empty__title">{{ t('distribution.title') }}</text>
      <text class="dc-empty__desc">{{ t('distribution.emptyDesc') }}</text>
      <button class="dc-empty__btn" :loading="applying" @click="doApply">{{ t('distribution.applyBtn') }}</button>
    </view>

    <!-- 已申请：概况 + 推广 + 佣金 + 提现 -->
    <block v-else>
      <!-- 概况卡片 -->
      <view class="dc-hero">
        <view class="dc-hero__row">
          <text class="dc-hero__level">V{{ profile.level }} · {{ statusText(profile.status) }}</text>
          <text class="dc-hero__code" @click="copy(referralLink(), t('distribution.referralCopied'))">{{ t('distribution.referralCode', { code: profile.referralCode }) }} {{ t('distribution.copy') }}</text>
        </view>
        <view class="dc-hero__moneys">
          <view class="dc-money">
            <text class="dc-money__label">{{ t('distribution.totalEarnings') }}</text>
            <text class="dc-money__val">¥{{ formatYuan(profile.totalEarnings) }}</text>
          </view>
          <view class="dc-money">
            <text class="dc-money__label">{{ t('distribution.availableBalance') }}</text>
            <text class="dc-money__val dc-money__val--primary">¥{{ formatYuan(profile.availableBalance) }}</text>
          </view>
          <view class="dc-money">
            <text class="dc-money__label">{{ t('distribution.frozenBalance') }}</text>
            <text class="dc-money__val">¥{{ formatYuan(profile.frozenBalance) }}</text>
          </view>
        </view>
      </view>

      <!-- 推广工具 -->
      <view class="dc-card">
        <text class="dc-card__title">{{ t('distribution.promoTools') }}</text>
        <view class="dc-promo__link" @click="copy(promoLink(), t('distribution.promoCopied'))">
          <text class="dc-promo__text">{{ t('distribution.shareLinkText') }}</text>
          <text class="dc-promo__copy">{{ t('distribution.copy') }}</text>
        </view>
        <button class="dc-promo__poster" @click="showPoster = true">{{ t('distribution.genPoster') }}</button>
      </view>

      <!-- 我的团队 -->
      <view class="dc-card" v-if="teamSummary">
        <text class="dc-card__title">{{ t('distribution.myTeam') }}</text>
        <view class="dc-team__grid">
          <view class="dc-team__cell"><text>{{ t('distribution.direct') }}</text><text>{{ t('distribution.personCount', { n: teamSummary.directTeamSize }) }}</text></view>
          <view class="dc-team__cell"><text>{{ t('distribution.indirect') }}</text><text>{{ t('distribution.personCount', { n: teamSummary.indirectTeamSize }) }}</text></view>
          <view class="dc-team__cell"><text>{{ t('distribution.ordersLabel') }}</text><text>{{ t('distribution.ordersCount', { n: teamSummary.orderCount }) }}</text></view>
          <view class="dc-team__cell"><text>{{ t('distribution.teamCommission') }}</text><text>¥{{ formatYuan(teamSummary.teamCommission) }}</text></view>
        </view>
      </view>

      <!-- 佣金明细 -->
      <view class="dc-card">
        <text class="dc-card__title">{{ t('distribution.commissionRecords') }}</text>
        <view v-if="commissions.length === 0 && !loadingCom" class="dc-card__empty">{{ t('distribution.noCommissions') }}</view>
        <view v-for="c in commissions" :key="c.id" class="dc-item">
          <view class="dc-item__main">
            <text class="dc-item__name">{{ typeText(c.commissionType) }} · {{ commissionStatusText(c.status) }}</text>
            <text class="dc-item__sub">{{ t('distribution.orderFeeRate', { amount: formatYuan(c.orderAmount), rate: (c.commissionRate / 100).toFixed(2) }) }}</text>
            <text class="dc-item__sub">{{ t('distribution.settledTime', { time: fmtTime(c.settledAt || c.createdAt) }) }}</text>
          </view>
          <text class="dc-item__amount">+¥{{ formatYuan(c.commissionAmount) }}</text>
        </view>
        <LoadingSkeleton v-if="loadingCom" type="list" :count="3" />
      </view>

      <!-- 提现中心 -->
      <view class="dc-card">
        <text class="dc-card__title">{{ t('distribution.withdrawCenter') }}</text>
        <view class="dc-withdraw-form">
          <view class="dc-form-row">
            <text class="dc-form-label">{{ t('distribution.amount') }}</text>
            <input class="dc-form-input" type="digit" v-model="withdrawAmount" :placeholder="t('distribution.amountPlaceholder')" />
          </view>
          <view class="dc-form-row">
            <text class="dc-form-label">{{ t('distribution.method') }}</text>
            <picker :range="methodLabels" @change="onMethodChange">
              <view class="dc-form-picker">{{ methodLabels[methodIndex] }}</view>
            </picker>
          </view>
          <view class="dc-form-row">
            <text class="dc-form-label">{{ t('distribution.payeeInfo') }}</text>
            <input class="dc-form-input" v-model="accountInfo" :placeholder="accountPlaceholder" />
          </view>
          <button class="dc-withdraw-btn" :loading="withdrawing" @click="doWithdraw">{{ t('distribution.withdrawBtn') }}</button>
        </view>

        <text class="dc-card__title dc-card__title--sub">{{ t('distribution.withdrawRecords') }}</text>
        <view v-if="withdrawals.length === 0 && !loadingWd" class="dc-card__empty">{{ t('distribution.noWithdrawals') }}</view>
        <view v-for="w in withdrawals" :key="w.id" class="dc-item">
          <view class="dc-item__main">
            <text class="dc-item__name">{{ methodText(w.method) }} · {{ withdrawalStatusText(w.status) }}</text>
            <text class="dc-item__sub">{{ t('distribution.appliedAt', { time: fmtTime(w.createdAt) }) }}</text>
            <text v-if="w.reviewedAt" class="dc-item__sub">{{ t('distribution.reviewedAt', { time: fmtTime(w.reviewedAt) }) }}</text>
            <text v-if="w.paidAt" class="dc-item__sub">{{ t('distribution.paidAt', { time: fmtTime(w.paidAt) }) }}</text>
          </view>
          <text class="dc-item__amount dc-item__amount--minus">-¥{{ formatYuan(w.amount) }}</text>
        </view>
        <LoadingSkeleton v-if="loadingWd" type="list" :count="3" />
      </view>
    </block>

    <!-- 推广海报弹窗 -->
    <view v-if="showPoster" class="dc-poster-mask" @click="showPoster = false">
      <view class="dc-poster-panel" @click.stop>
        <dist-poster
          :channel-name="tenantName"
          :inviter-name="profile?.referralCode || ''"
          :invite-code="profile?.referralCode || ''"
        />
        <button class="dc-poster-close" @click="showPoster = false">{{ t('distribution.close') }}</button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';
import { useUIStore } from '../../stores/ui';
import {
    getMyDistributorProfile,
    getMyCommissionRecords,
    getMyWithdrawalRequests,
    getMyTeamSummary,
    applyDistributor,
    requestWithdrawal,
    formatYuan,
} from '../../api/queries/distribution';
import type { TeamSummary } from '../../api/queries/distribution';
import DistPoster from '../../components/dist-poster/dist-poster.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const authStore = useAuthStore();
const ui = useUIStore();
const tenantStore = useTenantStore();
const { t } = useI18n();

const profile = ref<any | null>(null);
const commissions = ref<any[]>([]);
const withdrawals = ref<any[]>([]);
const loadingCom = ref(false);
const loadingWd = ref(false);
const applying = ref(false);
const withdrawing = ref(false);
const teamSummary = ref<TeamSummary | null>(null);
const showPoster = ref(false);

const tenantName = computed(() => tenantStore.tenantName || t('distribution.defaultTenant'));

const withdrawAmount = ref('');
const methodLabels = computed(() => [t('distribution.methodBank'), t('distribution.methodAlipay'), t('distribution.methodWechat')]);
const methodKeys = ['bank', 'alipay', 'wechat'];
const methodIndex = ref(0);
const accountInfo = ref('');
const accountPlaceholder = computed(() => methodIndex.value === 0
    ? t('distribution.bankAccountPlaceholder')
    : t('distribution.accountCodePlaceholder') + (methodIndex.value === 1 ? '/' : '') + methodLabels.value[methodIndex.value]);

onShow(() => {
    loadProfile();
    if (authStore.token) {
        loadCommissions();
        loadWithdrawals();
        loadTeam();
    }
});

async function loadProfile() {
    try {
        const res: any = await getMyDistributorProfile();
        profile.value = res.myDistributorProfile || null;
    } catch (e: any) { console.error(e); }
}

async function loadCommissions() {
    loadingCom.value = true;
    try {
        const res: any = await getMyCommissionRecords({ take: 50 });
        commissions.value = res.myCommissionRecords?.items || [];
    } catch (e: any) { console.error(e); }
    loadingCom.value = false;
}

async function loadWithdrawals() {
    loadingWd.value = true;
    try {
        const res: any = await getMyWithdrawalRequests({ take: 50 });
        withdrawals.value = res.myWithdrawalRequests?.items || [];
    } catch (e: any) { console.error(e); }
    loadingWd.value = false;
}

async function doApply() {
    applying.value = true;
    try {
        await applyDistributor(authStore.inviteCode || null);
        ui.showToast(t('distribution.applySuccess'), 'success');
        loadProfile();
    } catch (e: any) {
        ui.showToast(e.message || t('distribution.applyFailed'));
    }
    applying.value = false;
}

function referralLink(): string {
    const code = profile.value?.referralCode || '';
    if (typeof window !== 'undefined' && window.location) {
        const base = window.location.origin + '/#/pages/home/index';
        return base + '?ref=' + encodeURIComponent(code);
    }
    return code;
}

function promoLink(): string {
    const code = profile.value?.referralCode || '';
    if (typeof window !== 'undefined' && window.location) {
        const base = window.location.origin + '/#/pages/landing/invite';
        return code ? `${base}?ref=${encodeURIComponent(code)}` : base;
    }
    return code;
}

async function loadTeam() {
    teamSummary.value = null;
    try {
        teamSummary.value = await getMyTeamSummary();
    } catch (e: any) {
        console.error(e);
    }
}

async function copy(text: string, msg: string) {
    try {
        uni.setClipboardData({
            data: text,
            success: () => ui.showToast(msg, 'success'),
        });
    } catch (e: any) {
        ui.showToast(t('distribution.copyFailed'));
    }
}

function onMethodChange(e: any) {
    methodIndex.value = Number(e.detail.value);
}

async function doWithdraw() {
    const amount = parseFloat(withdrawAmount.value);
    if (!amount || amount <= 0) { ui.showToast(t('distribution.invalidAmount')); return; }
    const account = accountInfo.value.trim();
    if (!account) { ui.showToast(t('distribution.payeeRequired')); return; }
    withdrawing.value = true;
    try {
        await requestWithdrawal(amount, methodKeys[methodIndex.value], account);
        ui.showToast(t('distribution.withdrawSubmitted'));
        withdrawAmount.value = '';
        accountInfo.value = '';
        loadProfile();
        loadWithdrawals();
    } catch (e: any) {
        ui.showToast(e.message || t('distribution.withdrawFailed'));
    }
    withdrawing.value = false;
}

// ---- 文案映射 ----
function statusText(s: string): string {
    return { active: t('distribution.statusActive'), frozen: t('distribution.statusFrozen'), pending: t('distribution.statusPending') }[s] ?? s;
}
function typeText(s: string): string {
    return { direct: t('distribution.typeDirect'), indirect: t('distribution.typeIndirect') }[s] ?? s;
}
function commissionStatusText(s: string): string {
    return { pending: t('distribution.comPending'), confirmed: t('distribution.comConfirmed'), paid: t('distribution.comPaid'), cancelled: t('distribution.comCancelled') }[s] ?? s;
}
function methodText(m: string): string {
    return { bank: t('distribution.methodBank'), alipay: t('distribution.methodAlipay'), wechat: t('distribution.methodWechat') }[m] ?? m;
}
function withdrawalStatusText(s: string): string {
    return { pending: t('distribution.wdPending'), approved: t('distribution.wdApproved'), paid: t('distribution.wdPaid'), rejected: t('distribution.wdRejected') }[s] ?? s;
}
function fmtTime(t?: string): string {
    if (!t) return '';
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return t.replace('T', ' ').slice(0, 16);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>
<style lang="scss" scoped>
.dist-center { min-height: 100vh; background: $bg-color; padding-bottom: 40rpx; }

.dc-empty {
    padding: 120rpx 40rpx; text-align: center;
    &__title { font-size: 40rpx; font-weight: bold; display: block; }
    &__desc { font-size: 26rpx; color: $text-color-secondary; margin-top: 20rpx; display: block; line-height: 1.6; }
    &__btn { margin-top: 60rpx; background: $brand-color; color: #fff; border-radius: $radius-md; height: 88rpx; font-size: 30rpx; }
}

.dc-hero {
    background: linear-gradient(135deg, $brand-color, #e04a00); color: #fff; padding: 40rpx 30rpx;
    &__row { display: flex; justify-content: space-between; align-items: center; }
    &__level { font-size: 30rpx; font-weight: bold; }
    &__code { font-size: 24rpx; opacity: 0.9; background: rgba(255,255,255,0.2); padding: 8rpx 16rpx; border-radius: 24rpx; }
    &__moneys { display: flex; margin-top: 30rpx; }
}

.dc-money { flex: 1; &__label { font-size: 22rpx; opacity: 0.85; display: block; } &__val { font-size: 34rpx; font-weight: bold; margin-top: 8rpx; display: block; &--primary { font-size: 42rpx; color: #ffe08a; } } }

.dc-card {
    background: #fff; border-radius: $radius-md; margin: 20rpx; padding: 24rpx;
    &__title { font-size: 30rpx; font-weight: bold; display: block; margin-bottom: 16rpx; &--sub { margin-top: 30rpx; } }
    &__empty { font-size: 24rpx; color: #999; padding: 20rpx 0; }
}

.dc-item { display: flex; justify-content: space-between; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid #f0f0f0; &:last-child { border-bottom: none; } &__main { flex: 1; margin-right: 20rpx; } &__name { font-size: 28rpx; display: block; } &__sub { font-size: 22rpx; color: $text-color-secondary; display: block; margin-top: 4rpx; } &__amount { font-size: 28rpx; font-weight: bold; color: $brand-color; &--minus { color: $text-color; } } }

.dc-withdraw-form { border: 1rpx solid #eee; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx; }
.dc-form-row { display: flex; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid #f5f5f5; &:last-of-type { border-bottom: none; } }
.dc-form-label { width: 160rpx; font-size: 26rpx; color: $text-color; }
.dc-form-input { flex: 1; font-size: 26rpx; }
.dc-form-picker { font-size: 26rpx; padding: 10rpx 0; }
.dc-withdraw-btn { margin-top: 20rpx; background: $brand-color; color: #fff; border-radius: $radius-md; height: 80rpx; font-size: 30rpx; }

.dc-promo__link { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.dc-promo__text { font-size: 26rpx; color: $text-color; }
.dc-promo__copy { font-size: 24rpx; color: $brand-color; }
.dc-promo__poster { margin-top: 20rpx; background: #fff; color: $brand-color; border: 1rpx solid $brand-color; border-radius: $radius-md; height: 76rpx; line-height: 76rpx; font-size: 28rpx; }

.dc-team__grid { display: flex; flex-wrap: wrap; }
.dc-team__cell { width: 50%; display: flex; flex-direction: column; padding: 18rpx 0; text-align: center; }
.dc-team__cell text:first-child { font-size: 22rpx; color: $text-color-secondary; }
.dc-team__cell text:last-child { font-size: 30rpx; font-weight: bold; margin-top: 8rpx; }

.dc-poster-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 999; padding: 40rpx; }
.dc-poster-panel { display: flex; flex-direction: column; align-items: center; }
.dc-poster-close { margin-top: 24rpx; width: 320rpx; height: 76rpx; line-height: 76rpx; background: rgba(255,255,255,0.2); color: #fff; border-radius: 999rpx; font-size: 28rpx; font-weight: bold; }
</style>
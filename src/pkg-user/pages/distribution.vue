<template>
  <view class="dist-center">
    <!-- 未申请：引导申请成为分销商 -->
    <view v-if="!profile" class="dc-empty">
      <text class="dc-empty__title">分销中心</text>
      <text class="dc-empty__desc">分享商品链接给好友，好友下单你就能获得佣金奖励</text>
      <button class="dc-empty__btn" :loading="applying" @click="doApply">申请成为分销商</button>
    </view>

    <!-- 已申请：概况 + 推广 + 佣金 + 提现 -->
    <block v-else>
      <!-- 概况卡片 -->
      <view class="dc-hero">
        <view class="dc-hero__row">
          <text class="dc-hero__level">V{{ profile.level }} · {{ statusText(profile.status) }}</text>
          <text class="dc-hero__code" @click="copy(referralLink(), '推荐链接已复制')">推荐码：{{ profile.referralCode }} 复制</text>
        </view>
        <view class="dc-hero__moneys">
          <view class="dc-money">
            <text class="dc-money__label">累计收益</text>
            <text class="dc-money__val">¥{{ formatYuan(profile.totalEarnings) }}</text>
          </view>
          <view class="dc-money">
            <text class="dc-money__label">可用余额</text>
            <text class="dc-money__val dc-money__val--primary">¥{{ formatYuan(profile.availableBalance) }}</text>
          </view>
          <view class="dc-money">
            <text class="dc-money__label">冻结余额</text>
            <text class="dc-money__val">¥{{ formatYuan(profile.frozenBalance) }}</text>
          </view>
        </view>
      </view>

      <!-- 佣金明细 -->
      <view class="dc-card">
        <text class="dc-card__title">佣金明细</text>
        <view v-if="commissions.length === 0 && !loadingCom" class="dc-card__empty">暂无佣金记录</view>
        <view v-for="c in commissions" :key="c.id" class="dc-item">
          <view class="dc-item__main">
            <text class="dc-item__name">{{ typeText(c.commissionType) }} · {{ commissionStatusText(c.status) }}</text>
            <text class="dc-item__sub">订单 ¥{{ formatYuan(c.orderAmount) }} · 费率 {{ (c.commissionRate / 100).toFixed(2) }}%</text>
            <text class="dc-item__sub">时间：{{ fmtTime(c.settledAt || c.createdAt) }}</text>
          </view>
          <text class="dc-item__amount">+¥{{ formatYuan(c.commissionAmount) }}</text>
        </view>
        <LoadingSkeleton v-if="loadingCom" type="list" :count="3" />
      </view>

      <!-- 提现中心 -->
      <view class="dc-card">
        <text class="dc-card__title">提现中心</text>
        <view class="dc-withdraw-form">
          <view class="dc-form-row">
            <text class="dc-form-label">金额</text>
            <input class="dc-form-input" type="digit" v-model="withdrawAmount" placeholder="请输入提现金额（元）" />
          </view>
          <view class="dc-form-row">
            <text class="dc-form-label">方式</text>
            <picker :range="methodLabels" @change="onMethodChange">
              <view class="dc-form-picker">{{ methodLabels[methodIndex] }}</view>
            </picker>
          </view>
          <view class="dc-form-row">
            <text class="dc-form-label">收款信息</text>
            <input class="dc-form-input" v-model="accountInfo" :placeholder="methodIndex === 0 ? '开户行 + 账号' : '账号/收款码' + (methodIndex === 1 ? '/' : '') + methodLabels[methodIndex]" />
          </view>
          <button class="dc-withdraw-btn" :loading="withdrawing" @click="doWithdraw">申请提现</button>
        </view>

        <text class="dc-card__title dc-card__title--sub">提现记录</text>
        <view v-if="withdrawals.length === 0 && !loadingWd" class="dc-card__empty">暂无提现记录</view>
        <view v-for="w in withdrawals" :key="w.id" class="dc-item">
          <view class="dc-item__main">
            <text class="dc-item__name">{{ methodText(w.method) }} · {{ withdrawalStatusText(w.status) }}</text>
            <text class="dc-item__sub">申请时间：{{ fmtTime(w.createdAt) }}</text>
            <text v-if="w.reviewedAt" class="dc-item__sub">审核：{{ fmtTime(w.reviewedAt) }}</text>
            <text v-if="w.paidAt" class="dc-item__sub">打款：{{ fmtTime(w.paidAt) }}</text>
          </view>
          <text class="dc-item__amount dc-item__amount--minus">-¥{{ formatYuan(w.amount) }}</text>
        </view>
        <LoadingSkeleton v-if="loadingWd" type="list" :count="3" />
      </view>
    </block>
  </view>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import {
    getMyDistributorProfile,
    getMyCommissionRecords,
    getMyWithdrawalRequests,
    applyDistributor,
    requestWithdrawal,
    formatYuan,
} from '../../api/queries/distribution';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';

const authStore = useAuthStore();
const ui = useUIStore();

const profile = ref<any | null>(null);
const commissions = ref<any[]>([]);
const withdrawals = ref<any[]>([]);
const loadingCom = ref(false);
const loadingWd = ref(false);
const applying = ref(false);
const withdrawing = ref(false);

const withdrawAmount = ref('');
const methodLabels = ['银行转账', '支付宝', '微信'];
const methodKeys = ['bank', 'alipay', 'wechat'];
const methodIndex = ref(0);
const accountInfo = ref('');

onShow(() => {
    loadProfile();
    if (authStore.token) {
        loadCommissions();
        loadWithdrawals();
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
        ui.showToast('申请成功，等待审核', 'success');
        loadProfile();
    } catch (e: any) {
        ui.showToast(e.message || '申请失败');
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

async function copy(text: string, msg: string) {
    try {
        uni.setClipboardData({
            data: text,
            success: () => ui.showToast(msg, 'success'),
        });
    } catch (e: any) {
        ui.showToast('复制失败');
    }
}

function onMethodChange(e: any) {
    methodIndex.value = Number(e.detail.value);
}

async function doWithdraw() {
    const amount = parseFloat(withdrawAmount.value);
    if (!amount || amount <= 0) { ui.showToast('请输入正确的提现金额'); return; }
    const account = accountInfo.value.trim();
    if (!account) { ui.showToast('请填写收款信息'); return; }
    withdrawing.value = true;
    try {
        await requestWithdrawal(amount, methodKeys[methodIndex.value], account);
        ui.showToast('提现申请已提交');
        withdrawAmount.value = '';
        accountInfo.value = '';
        loadProfile();
        loadWithdrawals();
    } catch (e: any) {
        ui.showToast(e.message || '提现失败');
    }
    withdrawing.value = false;
}

// ---- 文案映射 ----
function statusText(s: string): string {
    return { active: '正常', frozen: '已冻结', pending: '待审核' }[s] ?? s;
}
function typeText(t: string): string {
    return { direct: '直推佣金', indirect: '间推佣金' }[t] ?? t;
}
function commissionStatusText(s: string): string {
    return { pending: '待结算', confirmed: '已入账', paid: '已打款', cancelled: '已取消' }[s] ?? s;
}
function methodText(m: string): string {
    return { bank: '银行转账', alipay: '支付宝', wechat: '微信' }[m] ?? m;
}
function withdrawalStatusText(s: string): string {
    return { pending: '待审核', approved: '已批准', paid: '已打款', rejected: '已驳回' }[s] ?? s;
}
function fmtTime(t?: string): string {
    if (!t) return '';
    return t.replace('T', ' ').slice(0, 16);
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
</style>
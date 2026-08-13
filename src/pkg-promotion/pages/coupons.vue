<template>
  <view class="coupons-page">
    <view class="coupons-tabs">
      <text class="tab" :class="{ active: tab === 'center' }" @click="switchTab('center')">领券中心</text>
      <text class="tab" :class="{ active: tab === 'wallet' }" @click="switchTab('wallet')">我的卡包</text>
      <text class="tab" :class="{ active: tab === 'code' }" @click="switchTab('code')">使用优惠码</text>
    </view>

    <!-- 领券中心 -->
    <view v-if="tab === 'center'">
      <view v-if="availableCoupons.length > 0">
        <view v-for="c in availableCoupons" :key="c.id" class="coupon-card">
          <view class="coupon-card__left" :class="{ 'coupon-card__left--disabled': !canClaim(c) }">
            <view class="coupon-card__amount-row">
              <text class="coupon-card__symbol" v-if="c.couponType === 'fixed'">¥</text>
              <text class="coupon-card__amount">{{ formatAmount(c) }}</text>
              <text class="coupon-card__unit">{{ c.couponType === 'fixed' ? '元' : '折' }}</text>
            </view>
            <text class="coupon-card__left-tip">{{ c.couponType === 'fixed' ? '立减' : '折扣' }}</text>
          </view>
          <view class="coupon-card__right">
            <view class="coupon-card__info">
              <text class="coupon-card__name">{{ c.name }}</text>
              <text class="coupon-card__cond">{{ formatCondition(c) }}</text>
              <text class="coupon-card__date">{{ formatDateRange(c) }}</text>
            </view>
            <button
              class="coupon-card__btn"
              :class="{ 'coupon-card__btn--disabled': !canClaim(c) }"
              :disabled="!canClaim(c) || claiming"
              @click="claim(c)"
            >
              {{ claimBtnText(c) }}
            </button>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loadingCenter" text="暂无可领取的优惠券" />
    </view>

    <!-- 我的卡包 -->
    <view v-else-if="tab === 'wallet'">
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">请先登录查看您的优惠券</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <view class="wallet-subtabs">
          <text class="subtab" :class="{ active: walletTab === 'unused' }" @click="walletTab = 'unused'">未使用</text>
          <text class="subtab" :class="{ active: walletTab === 'used' }" @click="walletTab = 'used'">已使用</text>
          <text class="subtab" :class="{ active: walletTab === 'expired' }" @click="walletTab = 'expired'">已过期</text>
        </view>
        <view v-if="filteredMyCoupons.length > 0">
          <view
            v-for="mc in filteredMyCoupons"
            :key="mc.id"
            class="coupon-card"
            :class="{ 'coupon-card--disabled': mc.status !== 'UNUSED' }"
          >
            <view class="coupon-card__left">
              <view class="coupon-card__amount-row">
                <text class="coupon-card__symbol" v-if="myCouponType(mc) === 'fixed'">¥</text>
                <text class="coupon-card__amount">{{ formatMyAmount(mc) }}</text>
                <text class="coupon-card__unit">{{ myCouponType(mc) === 'fixed' ? '元' : '折' }}</text>
              </view>
              <text class="coupon-card__left-tip">{{ myCouponType(mc) === 'fixed' ? '立减' : '折扣' }}</text>
            </view>
            <view class="coupon-card__right">
              <view class="coupon-card__info">
                <text class="coupon-card__name">{{ mc.coupon?.name || '优惠券' }}</text>
                <text class="coupon-card__cond">{{ formatMyCondition(mc) }}</text>
                <text class="coupon-card__code">券码：{{ mc.code }}</text>
                <text class="coupon-card__date">{{ formatMyDate(mc) }}</text>
              </view>
            </view>
            <view v-if="mc.status !== 'UNUSED'" class="coupon-card__stamp">
              <text>{{ mc.status === 'USED' ? '已使用' : '已过期' }}</text>
            </view>
          </view>
        </view>
        <EmptyState v-else-if="!loadingWallet" :text="walletEmptyText" />
      </template>
    </view>

    <!-- 使用优惠码 -->
    <view v-else class="coupons-code">
      <view v-if="!isLoggedIn" class="login-prompt" @click="goLogin">
        <text class="login-prompt__text">请先登录后使用优惠码</text>
        <text class="login-prompt__btn">去登录</text>
      </view>
      <template v-else>
        <text class="coupons-code__tip">输入优惠码即可绑定到当前订单使用</text>
        <view class="coupons-code__row">
          <input v-model="couponCode" placeholder="请输入优惠码" class="input" />
          <button @click="applyCode" class="coupons-code__btn" :disabled="applying">使用</button>
        </view>
        <view v-if="activeCouponCodes.length > 0" class="coupons-code__active">
          <text class="coupons-code__active-title">当前订单已使用</text>
          <view v-for="code in activeCouponCodes" :key="code" class="coupons-code__active-item">
            <text class="coupons-code__active-code">{{ code }}</text>
            <text class="coupons-code__active-remove" @click="removeCode(code)">移除</text>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getAvailableCoupons, getMyCoupons } from '../../api/queries/coupon';
import { claimCoupon } from '../../api/mutations/coupon';
import { applyCouponCode, removeCouponCode } from '../../api/mutations/cart';
import { getActiveOrder } from '../../api/queries/order';
import { useUIStore } from '../../stores/ui';
import { useCartStore } from '../../stores/cart';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';
import { useShare } from '../../composables/useShare';

const ui = useUIStore();
const cart = useCartStore();
const auth = useAuthStore();
useShare({
    title: '优惠券 - 精选好物',
    path: '/pkg-promotion/pages/coupons',
});

const isLoggedIn = computed(() => !!auth.token);

type TabKey = 'center' | 'wallet' | 'code';
type WalletKey = 'unused' | 'used' | 'expired';

const tab = ref<TabKey>('center');
const walletTab = ref<WalletKey>('unused');
const availableCoupons = ref<any[]>([]);
const myCoupons = ref<any[]>([]);
const couponCode = ref('');
const activeCouponCodes = ref<string[]>([]);
const claiming = ref(false);
const applying = ref(false);
const loadingCenter = ref(false);
const loadingWallet = ref(false);

const STATUS_MAP: Record<WalletKey, string> = {
    unused: 'UNUSED',
    used: 'USED',
    expired: 'EXPIRED',
};

const filteredMyCoupons = computed(() => {
    const target = STATUS_MAP[walletTab.value];
    return myCoupons.value.filter((c: any) => (c.status || '').toUpperCase() === target);
});

const walletEmptyText = computed(() => {
    const map: Record<WalletKey, string> = {
        unused: '暂无可用优惠券',
        used: '暂无已使用优惠券',
        expired: '暂无已过期优惠券',
    };
    return map[walletTab.value];
});

function goLogin() {
    uni.navigateTo({ url: '/pages/login/index?redirect=' + encodeURIComponent('/pkg-promotion/pages/coupons') });
}

/** 检测 GraphQL 错误是否为认证失败（token 过期/无效） */
function isAuthError(e: any): boolean {
    const msg = (e?.message || '').toLowerCase();
    const errors = e?.response?.errors || e?.errors || [];
    return msg.includes('not currently authorized') ||
        msg.includes('forbidden') ||
        msg.includes('unauthorized') ||
        errors.some((er: any) => er?.extensions?.code === 'FORBIDDEN' || er?.extensions?.code === 'UNAUTHORIZED');
}

function switchTab(t: TabKey) {
    tab.value = t;
    if (t === 'center' && availableCoupons.value.length === 0) loadAvailable();
    if (t === 'wallet' && isLoggedIn.value && myCoupons.value.length === 0) loadMy();
    if (t === 'code' && isLoggedIn.value) loadActive();
}

async function loadAvailable() {
    loadingCenter.value = true;
    try {
        const res: any = await getAvailableCoupons();
        availableCoupons.value = res.availableCoupons || [];
    } catch (e: any) { ui.showToast(e.message); }
    loadingCenter.value = false;
}

async function loadMy() {
    loadingWallet.value = true;
    try {
        const res: any = await getMyCoupons();
        myCoupons.value = (res.myCoupons || []).map((c: any) => ({
            ...c,
            status: (c.status || '').toUpperCase(),
        }));
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(e.message);
        }
    }
    loadingWallet.value = false;
}

async function loadActive() {
    try {
        const res: any = await getActiveOrder();
        if (res.activeOrder) {
            activeCouponCodes.value = res.activeOrder.couponCodes || [];
            cart.setOrder(res.activeOrder);
        }
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
        }
    }
}

function canClaim(c: any): boolean {
    if (c._claimed) return false;
    if (c.totalQuantity && c.claimedCount != null && c.claimedCount >= c.totalQuantity) return false;
    return true;
}

function claimBtnText(c: any): string {
    if (c._claimed) return '已领取';
    if (c.totalQuantity && c.claimedCount != null && c.claimedCount >= c.totalQuantity) return '已抢完';
    return '立即领取';
}

const PENDING_CLAIM_KEY = 'pending_claim_coupon_id';

async function claim(c: any) {
    if (!isLoggedIn.value) {
        uni.setStorageSync(PENDING_CLAIM_KEY, c.id);
        goLogin();
        return;
    }
    if (claiming.value || !canClaim(c)) return;
    claiming.value = true;
    try {
        await claimCoupon(c.id);
        ui.showToast('领取成功', 'success');
        c._claimed = true;
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(e.message);
        }
    }
    claiming.value = false;
}

/** 登录后自动完成待领取的优惠券 */
async function checkPendingClaim() {
    if (!isLoggedIn.value) return;
    const pendingId = uni.getStorageSync(PENDING_CLAIM_KEY);
    if (!pendingId) return;
    uni.removeStorageSync(PENDING_CLAIM_KEY);
    try {
        await claimCoupon(pendingId);
        ui.showToast('领取成功', 'success');
        const target = availableCoupons.value.find((c: any) => c.id === pendingId);
        if (target) target._claimed = true;
    } catch (e: any) {
        ui.showToast(e?.message || '领取失败');
    }
}

async function applyCode() {
    if (!isLoggedIn.value) { goLogin(); return; }
    if (!couponCode.value) { ui.showToast('请输入优惠码'); return; }
    applying.value = true;
    try {
        const res: any = await applyCouponCode(couponCode.value);
        if (res.applyCouponCode?.couponCodes) {
            activeCouponCodes.value = res.applyCouponCode.couponCodes;
            cart.setOrder(res.applyCouponCode);
        }
        ui.showToast('优惠券已应用', 'success');
        couponCode.value = '';
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
            ui.showToast('登录已过期，请重新登录');
        } else {
            ui.showToast(e.message);
        }
    }
    applying.value = false;
}

async function removeCode(code: string) {
    try {
        const res: any = await removeCouponCode(code);
        if (res.removeCouponCode) {
            activeCouponCodes.value = res.removeCouponCode.couponCodes || [];
            cart.setOrder(res.removeCouponCode);
        }
        ui.showToast('已移除', 'success');
    } catch (e: any) {
        if (isAuthError(e)) {
            auth.logout();
        } else {
            ui.showToast(e.message);
        }
    }
}

// ===== 格式化工具 =====

/** 左侧大字：fixed 显示金额（元），percentage 显示折 */
function formatAmount(c: any): string {
    if (c.couponType === 'fixed') return (c.discountValue / 100).toString();
    // percentage: discountValue 为优惠百分比（10 = 9折）
    const zhe = (100 - c.discountValue) / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
}

function myCouponType(mc: any): string {
    return mc.coupon?.couponType || 'fixed';
}

function formatMyAmount(mc: any): string {
    return formatAmount(mc.coupon || { couponType: 'fixed', discountValue: 0 });
}

function formatCondition(c: any): string {
    const minSpend = c.minSpend ? c.minSpend / 100 : 0;
    let cond = minSpend > 0 ? `满${minSpend}元可用` : '无门槛';
    if (c.couponType === 'percentage' && c.maxDiscount) {
        cond += `，最高减${c.maxDiscount / 100}元`;
    }
    return cond;
}

function formatMyCondition(mc: any): string {
    return formatCondition(mc.coupon || { couponType: 'fixed', discountValue: 0 });
}

function formatDateRange(c: any): string {
    const start = c.startAt ? String(c.startAt).slice(0, 10) : '';
    const end = c.endAt ? String(c.endAt).slice(0, 10) : '';
    if (start && end) return `${start} 至 ${end}`;
    if (end) return `至 ${end}`;
    return '';
}

function formatMyDate(mc: any): string {
    return formatDateRange(mc.coupon || {});
}

onMounted(async () => {
    await loadAvailable();
    checkPendingClaim();
});
</script>

<style lang="scss" scoped>
.coupons-page { padding: 20rpx; padding-bottom: 40rpx; }
.coupons-tabs {
    display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 20rpx; overflow: hidden;
    .tab {
        flex: 1; text-align: center; padding: 24rpx 0; font-size: 28rpx; color: #666;
        &.active { background: $brand-color; color: #fff; }
    }
}

.wallet-subtabs {
    display: flex; gap: 16rpx; margin-bottom: 20rpx; padding: 0 4rpx;
    .subtab {
        padding: 10rpx 30rpx; font-size: 26rpx; color: #666; background: #fff; border-radius: 30rpx;
        &.active { background: $brand-color; color: #fff; }
    }
}

.coupon-card {
    display: flex; background: #fff; border-radius: $radius-md; margin-bottom: 20rpx;
    overflow: hidden; position: relative;
    &--disabled { opacity: 0.65; }

    &__left {
        width: 200rpx; background: linear-gradient(135deg, $brand-color, #8a6fff);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 24rpx 0; color: #fff;
        &--disabled { background: linear-gradient(135deg, #bbb, #999); }
    }
    &__amount-row { display: flex; align-items: baseline; }
    &__symbol { font-size: 28rpx; font-weight: bold; }
    &__amount { font-size: 56rpx; font-weight: bold; line-height: 1; }
    &__unit { font-size: 24rpx; margin-left: 4rpx; }
    &__left-tip { font-size: 22rpx; margin-top: 10rpx; opacity: 0.9; }

    &__right {
        flex: 1; padding: 20rpx 24rpx; display: flex; flex-direction: column;
        justify-content: space-between; min-width: 0;
    }
    &__info { display: flex; flex-direction: column; }
    &__name { font-size: 30rpx; font-weight: bold; color: #333; }
    &__cond { font-size: 24rpx; color: #999; margin-top: 8rpx; }
    &__code { font-size: 22rpx; color: #666; margin-top: 6rpx; }
    &__date { font-size: 22rpx; color: #bbb; margin-top: 6rpx; }

    &__btn {
        align-self: flex-end; background: $brand-color; color: #fff; border: none;
        font-size: 24rpx; padding: 8rpx 28rpx; border-radius: 30rpx; line-height: 1.6;
        &--disabled { background: #ccc; }
        &::after { border: none; }
    }

    &__stamp {
        position: absolute; right: 36rpx; top: 50%;
        transform: translateY(-50%) rotate(-18deg);
        border: 4rpx solid #ff4d4f; color: #ff4d4f;
        padding: 6rpx 20rpx; border-radius: 8rpx;
        font-size: 28rpx; font-weight: bold; opacity: 0.75;
    }
}

.coupons-code {
    background: #fff; padding: 30rpx; border-radius: $radius-md;
    &__tip { font-size: 26rpx; color: #999; margin-bottom: 20rpx; display: block; }
    &__row { display: flex; gap: 16rpx; }
    &__btn {
        background: $brand-color; color: #fff; border: none; border-radius: $radius-md;
        height: 80rpx; font-size: 28rpx; white-space: nowrap; padding: 0 36rpx;
        &[disabled] { opacity: 0.6; }
        &::after { border: none; }
    }
    &__active { margin-top: 30rpx; }
    &__active-title { font-size: 26rpx; color: #666; display: block; margin-bottom: 16rpx; }
    &__active-item {
        display: flex; align-items: center; justify-content: space-between;
        background: #f7f5ff; padding: 18rpx 24rpx; border-radius: $radius-sm; margin-bottom: 12rpx;
    }
    &__active-code { font-size: 28rpx; font-weight: bold; color: $brand-color; }
    &__active-remove {
        font-size: 24rpx; color: #999; border: 1rpx solid $border-color;
        background: #fff; border-radius: $radius-sm; padding: 6rpx 20rpx;
    }
}

.input {
    flex: 1; height: 80rpx; border: 1rpx solid $border-color;
    border-radius: $radius-sm; padding: 0 20rpx; font-size: 28rpx;
}

.login-prompt {
    display: flex; flex-direction: column; align-items: center;
    padding: 80rpx 40rpx; background: #fff; border-radius: $radius-md;
    &__text { font-size: 28rpx; color: #999; margin-bottom: 24rpx; }
    &__btn {
        background: $brand-color; color: #fff; border: none;
        border-radius: 40rpx; padding: 16rpx 60rpx; font-size: 28rpx;
        &::after { border: none; }
    }
}
</style>

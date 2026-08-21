<template>
  <view class="member-page">
    <!-- 等级头部 -->
    <view class="member-page__header">
      <text class="member-page__level">{{ info.levelName || ('Lv.' + info.level) }}</text>
      <text class="member-page__growth">成长值 {{ info.growthValue }}{{ info.nextLevelThreshold ? ' / ' + info.nextLevelThreshold : '' }}</text>
      <view class="member-page__bar"><view class="member-page__bar--fill" :style="{ width: growthPercent + '%' }" /></view>
      <text v-if="info.nextLevelName" class="member-page__next">距离 {{ info.nextLevelName }} 还差 {{ nextThresholdDiff }}</text>
    </view>

    <!-- 权益卡片 -->
    <view class="member-page__cards">
      <view class="card" @click="navTo('/pkg-user/pages/points-history')">
        <text class="card__num">{{ info.points }}</text>
        <text class="card__label">我的积分</text>
      </view>
      <view class="card" @click="navTo('/pkg-user/pages/recharge')">
        <text class="card__num">¥{{ balanceYuan }}</text>
        <text class="card__label">余额</text>
      </view>
      <view class="card" @click="navTo('/pkg-promotion/pages/coupons')">
        <text class="card__num">{{ couponCount }}</text>
        <text class="card__label">优惠券</text>
      </view>
      <view class="card" @click="doCheckin">
        <text class="card__num" :class="{ 'card__num--done': checkedIn }">{{ checkedIn ? '已签' : '签到' }}</text>
        <text class="card__label">连签 {{ streak }} 天</text>
      </view>
    </view>

    <!-- 快捷入口 -->
    <view class="member-page__menu">
      <view class="menu-item" v-for="m in quickMenus" :key="m.url" @click="navTo(m.url)"><text>{{ m.label }}</text><text>></text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getMyMemberInfo, getCheckinToday, doCheckin as doCheckinMutation } from '../../api/queries/member';
import { getMyBalance } from '../../api/mutations/recharge';
import { getMyCoupons } from '../../api/queries/coupon';
import { useUIStore } from '../../stores/ui';

const ui = useUIStore();
const info = ref<any>({});
const balance = ref(0);
const myCoupons = ref<any[]>([]);
const checkedIn = ref(false);
const streak = ref(0);

const balanceYuan = computed(() => (balance.value / 100).toFixed(2));
const couponCount = computed(() => (myCoupons.value.filter((c: any) => (c.status || '').toUpperCase() === 'UNUSED')).length);
const growthPercent = computed(() => {
    const t = info.value.nextLevelThreshold || 0;
    if (!t || t <= 0) return 100;
    return Math.min(100, Math.round((info.value.growthValue / t) * 100));
});
const nextThresholdDiff = computed(() => Math.max(0, (info.value.nextLevelThreshold || 0) - (info.value.growthValue || 0)));

async function refresh() {
    const [mi, bal, cp, ct]: any[] = await Promise.all([
        getMyMemberInfo(), getMyBalance(), getMyCoupons(), getCheckinToday(),
    ]);
    info.value = mi?.myMemberInfo || {};
    balance.value = bal?.myRechargeBalance || 0;
    myCoupons.value = cp?.myCoupons || [];
    checkedIn.value = ct?.checkinToday?.checkedIn || false;
    streak.value = ct?.checkinToday?.streak || 0;
}

async function doCheckin() {
    if (checkedIn.value) return;
    try {
        ui.showLoading();
        const res: any = await doCheckinMutation();
        const r = res?.checkin;
        ui.hideLoading();
        if (r?.success) {
            ui.showToast(`签到成功 +${r.points ?? 0}积分`, 'success');
            await refresh();
        } else {
            ui.showToast(r?.reason || '今日已签到', 'error');
        }
    } catch (e: any) { ui.hideLoading(); ui.showToast(e.message || '签到失败', 'error'); }
}

onMounted(async () => {
    try { await refresh(); } catch (e) { console.warn('[member-center] load failed', e); }
});
function navTo(url: string) { uni.navigateTo({ url }); }
const quickMenus = [
    { label: '我的订单', url: '/pkg-order/pages/orders' },
    { label: '余额明细', url: '/pkg-user/pages/balance-history' },
    { label: '优惠券', url: '/pkg-promotion/pages/coupons' },
];
</script>

<style lang="scss" scoped>
.member-page { min-height: 100vh; background: $bg-color;
    &__header { background: $brand-color; color: #fff; padding: 50rpx 30rpx;
        & .member-page__level { font-size: 44rpx; font-weight: bold; display: block; }
        & .member-page__growth { font-size: 26rpx; opacity: .9; margin-top: 8rpx; display: block; }
        & .member-page__next { font-size: 22rpx; opacity: .8; margin-top: 8rpx; display: block; } }
    &__bar { height: 14rpx; background: rgba(255,255,255,.3); border-radius: 10rpx; margin-top: 20rpx; overflow: hidden;
        &--fill { height: 100%; background: #fff; border-radius: 10rpx; } }
    &__cards { display: flex; margin: 20rpx; background: #fff; border-radius: $radius-md; padding: 20rpx 0;
        & .card { flex: 1; text-align: center;
            &__num { display: block; font-size: 36rpx; font-weight: bold; color: $brand-color;
                &--done { color: $success-color; } }
            &__label { display: block; font-size: 24rpx; color: #666; margin-top: 8rpx; } } }
    &__menu { background: #fff; margin: 20rpx; border-radius: $radius-md; } }
.menu-item { display: flex; justify-content: space-between; padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
</style>
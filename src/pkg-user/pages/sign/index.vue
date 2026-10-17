<template>
  <view class="sign-page">
    <!-- 积分卡 -->
    <view class="sign-page__header">
      <text class="sign-page__label">{{ t('sign.myPoints') }}</text>
      <text class="sign-page__points">{{ points }}</text>
      <text class="sign-page__streak">{{ t('sign.streak', { n: streak }) }}</text>
    </view>

    <!-- 本周 7 日格（周一为起点） -->
    <view class="sign-week">
      <view v-for="cell in cells" :key="cell.date" class="sign-week__cell">
        <view
          class="sign-week__day"
          :class="{ 'sign-week__day--done': cell.state === 'done', 'sign-week__day--today': cell.state === 'today' }"
        >
          <text v-if="cell.state === 'done'">✓</text>
          <text v-else>{{ Number(cell.date.slice(-2)) }}</text>
        </view>
      </view>
    </view>

    <!-- 签到按钮 -->
    <button
      class="sign-page__btn"
      :class="{ 'sign-page__btn--disabled': checkedIn }"
      :disabled="checkedIn || submitting"
      @click="onCheckin"
    >{{ checkedIn ? t('sign.checked') : t('sign.checkinBtn') }}</button>

    <!-- 明细 / 规则入口 -->
    <view class="sign-page__links">
      <text class="sign-page__link" @click="navTo('/pkg-user/pages/points-history')">{{ t('sign.pointsDetail') }} ›</text>
      <text class="sign-page__link" @click="showRules">{{ t('sign.rules') }} ›</text>
    </view>

    <text class="sign-page__tip">{{ t('sign.weekTip') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getMyMemberInfo, getCheckinToday, doCheckin } from '../../../api/queries/member';
import { useAuthStore } from '../../../stores/auth';
import { useUIStore } from '../../../stores/ui';
import { buildWeek, localDateKey } from './week';

const WEEK_KEY = 'vshop:checkin-week';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUIStore();
const points = ref<number | string>('--');
const checkedIn = ref(false);
const streak = ref(0);
const submitting = ref(false);
const checkedSet = ref(new Set<string>());

// 7 日格：后端 streak 推算 ∪ 本周本地补记
const cells = computed(() => buildWeek(new Date(), checkedSet.value, streak.value, checkedIn.value));

/** 读取本地记录，仅保留本周 key（清理上周及更早数据） */
function loadLocal() {
  const stored: Record<string, boolean> = uni.getStorageSync(WEEK_KEY) || {};
  const weekKeys = new Set(cells.value.map(c => c.date));
  const cleaned: Record<string, boolean> = {};
  for (const k of Object.keys(stored)) {
    if (weekKeys.has(k)) cleaned[k] = true;
  }
  uni.setStorageSync(WEEK_KEY, cleaned);
  checkedSet.value = new Set(Object.keys(cleaned));
}

function saveLocal() {
  const record: Record<string, boolean> = {};
  for (const k of checkedSet.value) record[k] = true;
  uni.setStorageSync(WEEK_KEY, record);
}

async function load() {
  const [mi, ct]: any[] = await Promise.all([getMyMemberInfo(), getCheckinToday()]);
  points.value = mi?.myMemberInfo?.points ?? '--';
  checkedIn.value = !!ct?.checkinToday?.checkedIn;
  streak.value = ct?.checkinToday?.streak || 0;
}

async function onCheckin() {
  if (checkedIn.value || submitting.value) return;
  submitting.value = true;
  try {
    ui.showLoading();
    const res: any = await doCheckin();
    const r = res?.checkin;
    ui.hideLoading();
    if (r?.success) {
      // 写本地补记 + 刷新状态，toast 提示所得积分
      checkedSet.value = new Set([...checkedSet.value, localDateKey(new Date())]);
      saveLocal();
      checkedIn.value = true;
      streak.value = r.streak ?? streak.value + 1;
      ui.showToast(t('memberCenter.checkinSuccess', { n: r.points ?? 0 }), 'success');
      const mi: any = await getMyMemberInfo();
      points.value = mi?.myMemberInfo?.points ?? points.value;
    } else {
      ui.showToast(r?.reason || t('memberCenter.alreadyCheckedIn'), 'error');
    }
  } catch (e: any) {
    ui.hideLoading();
    ui.showToast(e?.response?.errors?.[0]?.message || e.message || t('common.loadFailed'), 'error');
  } finally {
    submitting.value = false;
  }
}

function showRules() {
  uni.showModal({
    title: t('sign.rules'),
    content: t('sign.rulesBody'),
    showCancel: false,
    confirmText: t('common.confirm'),
  });
}

function navTo(url: string) { uni.navigateTo({ url }); }

onMounted(() => {
  // 未登录参照 favorites/points-orders 页模式：跳登录并携带回跳地址
  if (!auth.isLoggedIn) {
    auth.requireLogin('/pkg-user/pages/sign/index');
    return;
  }
  loadLocal();
  load().catch((e: any) => ui.showToast(e?.message || t('common.loadFailed'), 'error'));
});
</script>

<style lang="scss" scoped>
.sign-page {
  min-height: 100vh;
  background: $bg-color;
  padding-bottom: 60rpx;
  &__header {
    background: $brand-color; color: #fff; padding: 50rpx 30rpx; text-align: center;
    & .sign-page__label { font-size: 26rpx; opacity: .9; display: block; }
    & .sign-page__points { font-size: 64rpx; font-weight: bold; display: block; margin: 12rpx 0; }
    & .sign-page__streak { font-size: 24rpx; opacity: .9; display: inline-block; background: rgba(255,255,255,.2); padding: 6rpx 24rpx; border-radius: 24rpx; } }
  &__btn {
    display: block; margin: 40rpx 30rpx 0; height: 88rpx; line-height: 88rpx;
    background: $brand-color; color: #fff; font-size: 32rpx; font-weight: bold;
    border: none; border-radius: 44rpx;
    &--disabled { background: #ccc; color: #fff; } }
  &__links {
    display: flex; justify-content: center; gap: 80rpx; margin-top: 40rpx;
    & .sign-page__link { font-size: 26rpx; color: #666; } }
  &__tip { display: block; text-align: center; font-size: 22rpx; color: #999; margin-top: 60rpx; }
}

.sign-week {
  display: flex; margin: 30rpx 20rpx 0; background: #fff; border-radius: $radius-md; padding: 24rpx 12rpx;
  &__cell { flex: 1; display: flex; justify-content: center; }
  &__day {
    width: 64rpx; height: 64rpx; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 26rpx; color: #666; background: #f5f5f5;
    &--done { background: $brand-color; color: #fff; font-weight: bold; }
    &--today { border: 3rpx solid $brand-color; color: $brand-color; font-weight: bold; background: #fff; } }
}
</style>

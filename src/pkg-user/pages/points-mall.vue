<template>
  <view class="mall-page">
    <!-- 顶部积分余额 -->
    <view class="mall-page__top">
      <text class="mall-page__label">我的积分</text>
      <text class="mall-page__points">{{ info.points ?? '--' }}</text>
      <text class="mall-page__tip">积分可兑换以下优惠券</text>
    </view>

    <!-- 兑换列表 -->
    <view v-for="tpl in templates" :key="tpl.id" class="mall-card">
      <view class="mall-card__left">
        <text class="mall-card__name">{{ tpl.name }}</text>
        <text class="mall-card__benefit">{{ benefitLabel(tpl) }}</text>
        <text class="mall-card__cond">{{ condLabel(tpl) }}</text>
      </view>
      <view class="mall-card__right">
        <text class="mall-card__price">{{ tpl.pointsPrice }}<text class="mall-card__unit"> 积分</text></text>
        <text class="mall-card__stock">{{ stockLabel(tpl) }}</text>
        <button
          class="mall-card__btn"
          :class="{ 'mall-card__btn--disabled': !canExchange(tpl) }"
          :disabled="!canExchange(tpl)"
          @click.stop="onExchange(tpl)"
        >{{ canExchange(tpl) ? '兑换' : disabledReason(tpl) }}</button>
      </view>
    </view>

    <EmptyState v-if="templates.length === 0 && !loading" text="暂无可用兑换券" />
    <view v-if="loading" class="mall-page__loading">加载中...</view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getMyMemberInfo, getPointsMallTemplates, exchangeCouponWithPoints } from '../../api/queries/member';
import EmptyState from '../../components/EmptyState.vue';
import { useUIStore } from '../../stores/ui';

const ui = useUIStore();
const info = ref<any>({});
const templates = ref<any[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const [mi, mall]: any[] = await Promise.all([getMyMemberInfo(), getPointsMallTemplates()]);
    info.value = mi?.myMemberInfo || {};
    templates.value = mall?.pointsMallTemplates || [];
  } catch (e: any) {
    ui.showToast(e.message || '加载失败', 'error');
  } finally {
    loading.value = false;
  }
}

/** 当前可用积分 */
function myPoints(): number {
  return Number(info.value?.points ?? 0);
}

/** 权益描述 */
function benefitLabel(tpl: any): string {
  const v = tpl.discountValue ?? 0;
  if (tpl.type === 'PERCENT') return `${(v / 10).toFixed(1).replace(/\.0$/, '')}折`;
  if (tpl.type === 'FULL') return '全场免单券';
  return `立减 ¥${(v / 100).toFixed(2)}`;
}

/** 使用门槛描述 */
function condLabel(tpl: any): string {
  const min = tpl.minSpend ?? 0;
  if (min <= 0) return '无门槛使用';
  return `满 ¥${(min / 100).toFixed(2)} 可用`;
}

/** 库存/限购描述 */
function stockLabel(tpl: any): string {
  if (tpl.totalCount > 0) {
    const left = Math.max(0, tpl.totalCount - (tpl.claimedCount ?? 0));
    return `剩余 ${left} 张${tpl.perUserLimit > 0 ? ` · 限兑${tpl.perUserLimit}张` : ''}`;
  }
  return tpl.perUserLimit > 0 ? `限兑 ${tpl.perUserLimit} 张` : '不限量';
}

function soldOut(tpl: any): boolean {
  return tpl.totalCount > 0 && (tpl.claimedCount ?? 0) >= tpl.totalCount;
}

function canExchange(tpl: any): boolean {
  if (soldOut(tpl)) return false;
  if (myPoints() < (tpl.pointsPrice ?? 0)) return false;
  return true;
}

function disabledReason(tpl: any): string {
  if (soldOut(tpl)) return '已兑完';
  return '积分不足';
}

function onExchange(tpl: any) {
  const need = tpl.pointsPrice ?? 0;
  uni.showModal({
    title: '确认兑换',
    content: `使用 ${need} 积分兑换「${tpl.name}」？兑换后积分将立即扣减。`,
    confirmText: '确认兑换',
    confirmColor: '#ff6600',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        ui.showLoading();
        const result: any = await exchangeCouponWithPoints(tpl.id);
        ui.hideLoading();
        const spent = result?.exchangeCouponWithPoints?.spentPoints ?? need;
        ui.showToast(`兑换成功，消耗 ${spent} 积分`, 'success');
        await load();
      } catch (e: any) {
        ui.hideLoading();
        const msg = e?.response?.errors?.[0]?.message || e.message || '兑换失败';
        ui.showToast(msg, 'error');
        await load(); // 刷新积分与库存
      }
    },
  });
}

onMounted(() => {
  load();
});
</script>

<style lang="scss" scoped>
.mall-page {
  min-height: 100vh;
  background: $bg-color;
  padding-bottom: 40rpx;
  &__top { background: $brand-color; color: #fff; padding: 50rpx 30rpx;
    & .mall-page__label { font-size: 26rpx; opacity: .9; display: block; }
    & .mall-page__points { font-size: 60rpx; font-weight: bold; display: block; margin: 12rpx 0; }
    & .mall-page__tip { font-size: 22rpx; opacity: .8; display: block; } }
  &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}

.mall-card {
  background: #fff; margin: 20rpx; border-radius: $radius-md; padding: 24rpx;
  display: flex; justify-content: space-between; align-items: center;
  &__left { display: flex; flex-direction: column; flex: 1; margin-right: 20rpx; }
  &__name { font-size: 30rpx; font-weight: bold; }
  &__benefit { font-size: 34rpx; color: $brand-color; font-weight: bold; margin-top: 6rpx; }
  &__cond { font-size: 22rpx; color: #999; margin-top: 6rpx; }
  &__right { display: flex; flex-direction: column; align-items: flex-end; }
  &__price { font-size: 32rpx; color: $brand-color; font-weight: bold;
    & .mall-card__unit { font-size: 20rpx; font-weight: normal; } }
  &__stock { font-size: 20rpx; color: #999; margin-top: 4rpx; }
  &__btn { margin-top: 12rpx; background: $brand-color; color: #fff; font-size: 26rpx; padding: 0 24rpx; height: 64rpx; line-height: 64rpx; border-radius: 32rpx; border: none;
    &--disabled { background: #ccc; } }
}
</style>
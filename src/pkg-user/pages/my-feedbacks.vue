<template>
  <view class="mf-page">
    <view v-for="f in items" :key="f.id" class="mf-item">
      <view class="mf-item__row1">
        <text class="mf-item__title">{{ f.title }}</text>
        <text class="mf-item__st" :class="'st-' + f.status">{{ t('myFeedbacks.' + f.status) }}</text>
      </view>
      <text class="mf-item__body">{{ f.content }}</text>
      <view v-if="f.reply" class="mf-item__reply">
        <text class="mf-item__reply-lb">{{ t('myFeedbacks.replyLabel') }}</text>
        <text class="mf-item__reply-tx">{{ f.reply }}</text>
      </view>
      <text class="mf-item__tm">{{ f.reply ? t('myFeedbacks.repliedAt') + ' ' + fmtTime(f.repliedAt) : fmtTime(f.createdAt) }}</text>
    </view>
    <EmptyState v-if="items.length === 0 && !loading" :text="t('myFeedbacks.empty')" />
    <view v-if="loading" class="mf-page__loading">{{ t('myFeedbacks.loading') }}</view>
    <text v-if="items.length" class="mf-page__hint">{{ t('myFeedbacks.markRead') }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getMyFeedbacks, markFeedbacksRead } from '../../api/queries/feedback';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';
import { fmtUser } from '../../utils/datetime';

const { t } = useI18n();
const authStore = useAuthStore();
const items = ref<any[]>([]);
const loading = ref(false);

async function load() {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  try {
    const r: any = await getMyFeedbacks(0, 50);
    items.value = r?.myFeedbacks?.items || [];
    // 进入页面即把「非 pending 且未读」的反馈标记已读（角标清零；幂等）
    await markFeedbacksRead();
  } catch (e) {
    // 拉取失败保留旧数据；已读标记静默失败不影响展示
  } finally {
    loading.value = false;
  }
}

onShow(() => load());

/** 时间展示：用户视角 YYYY-MM-DD HH:mm */
function fmtTime(s: string): string {
  return fmtUser(s);
}
</script>

<style lang="scss" scoped>
.mf-page {
  min-height: 100vh; background: $bg-color; padding: 20rpx;
  &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
  &__hint { display: block; text-align: center; color: #bbb; font-size: 22rpx; padding: 8rpx 0 24rpx; }
}
.mf-item {
  background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 16rpx;
  display: flex; flex-direction: column;
  &__row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12rpx; }
  &__title { font-size: 28rpx; font-weight: bold; flex: 1; margin-right: 16rpx; }
  &__st {
    font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 999rpx; flex-shrink: 0;
    &.st-pending { background: #f2f3f5; color: #999; }
    &.st-processing { background: #fff7e6; color: #d48806; }
    &.st-resolved { background: #e8f7ee; color: #389e50; }
  }
  &__body { font-size: 26rpx; color: #666; line-height: 1.6; }
  &__reply {
    margin-top: 16rpx; background: rgba($brand-color, 0.06); border-radius: $radius-sm;
    padding: 16rpx 20rpx; display: flex; flex-direction: column;
  }
  &__reply-lb { font-size: 22rpx; color: $brand-color; font-weight: bold; margin-bottom: 6rpx; }
  &__reply-tx { font-size: 26rpx; color: #444; line-height: 1.6; }
  &__tm { font-size: 22rpx; color: #bbb; margin-top: 16rpx; }
}
</style>

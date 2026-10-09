<template>
  <view class="feed-page">
    <view class="feed-page__cols">
      <view class="feed-page__col">
        <view v-for="post in leftCol" :key="post.id" class="post-card" @tap="goDetail(post)">
          <image v-if="coverOf(post)" :src="coverOf(post)" class="post-card__img" mode="widthFix" />
          <view class="post-card__body">
            <view class="post-card__badges" v-if="post.isPinned">
              <text class="post-card__badge">置顶</text>
            </view>
            <text v-if="post.title" class="post-card__title">{{ post.title }}</text>
            <text class="post-card__content">{{ post.content }}</text>
            <view class="post-card__meta">
              <text class="post-card__author">{{ post.nickname }}</text>
              <text class="post-card__stats">♡{{ post.likeCount }} · ☆{{ post.favoriteCount }}</text>
            </view>
          </view>
        </view>
      </view>
      <view class="feed-page__col">
        <view v-for="post in rightCol" :key="post.id" class="post-card" @tap="goDetail(post)">
          <image v-if="coverOf(post)" :src="coverOf(post)" class="post-card__img" mode="widthFix" />
          <view class="post-card__body">
            <view class="post-card__badges" v-if="post.isPinned">
              <text class="post-card__badge">置顶</text>
            </view>
            <text v-if="post.title" class="post-card__title">{{ post.title }}</text>
            <text class="post-card__content">{{ post.content }}</text>
            <view class="post-card__meta">
              <text class="post-card__author">{{ post.nickname }}</text>
              <text class="post-card__stats">♡{{ post.likeCount }} · ☆{{ post.favoriteCount }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
    <EmptyState v-if="items.length === 0 && !loading" text="还没有帖子，快来发布第一条吧" />
    <view v-if="loading" class="feed-page__loading">加载中...</view>
    <view class="feed-page__fab" @tap="goPublish">
      <text class="feed-page__fab-icon">＋</text>
      <text class="feed-page__fab-text">发布</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import { getCircleFeed } from '../../api/queries/circle';
import { usePagination } from '../../composables/usePagination';
import EmptyState from '../../components/EmptyState.vue';

const { items, loading, loadMore, refresh } = usePagination<any>({
    fetchFn: async ({ take, skip }) => {
        const r: any = await getCircleFeed(skip, take);
        return r?.circleFeed || { items: [], totalItems: 0 };
    },
});

// 双列瀑布流：按合并列表下标奇偶分流到左右两列
const leftCol = computed(() => items.value.filter((_: any, i: number) => i % 2 === 0));
const rightCol = computed(() => items.value.filter((_: any, i: number) => i % 2 === 1));

function coverOf(post: any): string {
    return Array.isArray(post.images) && post.images.length ? post.images[0] : '';
}

function goDetail(post: any) {
    uni.navigateTo({ url: '/pkg-circle/pages/detail?id=' + post.id });
}

function goPublish() {
    uni.navigateTo({ url: '/pkg-circle/pages/publish' });
}

// 首次进入由 usePagination 的 onMounted 加载；从发布页返回时重拉
let firstShow = true;
onShow(() => {
    if (firstShow) { firstShow = false; return; }
    refresh();
});

onReachBottom(() => loadMore());
onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh(); });
</script>

<style lang="scss" scoped>
.feed-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx 20rpx 140rpx;
    &__cols { display: flex; gap: 16rpx; }
    &__col { flex: 1; min-width: 0; }
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
    &__fab {
        position: fixed; right: 32rpx; bottom: 120rpx; width: 128rpx; height: 128rpx;
        border-radius: 50%; background: $brand-color; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);
    }
    &__fab-icon { font-size: 44rpx; line-height: 1; }
    &__fab-text { font-size: 22rpx; margin-top: 4rpx; }
}
.post-card {
    background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 16rpx;
    &__img { width: 100%; display: block; }
    &__body { padding: 16rpx 20rpx 20rpx; }
    &__badges { margin-bottom: 8rpx; }
    &__badge {
        font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color;
        border-radius: 6rpx; padding: 2rpx 10rpx;
    }
    &__title {
        display: block; font-size: 28rpx; font-weight: bold; color: #333;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    &__content {
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
        overflow: hidden; font-size: 24rpx; color: #666; margin-top: 8rpx; line-height: 1.5;
        word-break: break-all;
    }
    &__meta {
        display: flex; justify-content: space-between; align-items: center; margin-top: 12rpx;
    }
    &__author { font-size: 22rpx; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__stats { font-size: 22rpx; color: #999; flex-shrink: 0; }
}
</style>

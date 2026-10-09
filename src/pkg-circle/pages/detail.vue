<template>
  <view class="detail-page" v-if="post">
    <video
      v-if="post.videoUrl"
      :src="post.videoUrl"
      class="detail-page__video"
      controls
      object-fit="contain"
    />
    <swiper v-else-if="images.length" class="detail-page__gallery" :indicator-dots="images.length > 1" circular>
      <swiper-item v-for="(img, idx) in images" :key="idx" @tap="preview(idx)">
        <image :src="img" class="detail-page__img" mode="aspectFill" />
      </swiper-item>
    </swiper>

    <view class="detail-page__body">
      <text v-if="post.title" class="detail-page__title">{{ post.title }}</text>
      <view class="detail-page__meta">
        <text class="detail-page__author">{{ post.nickname }}</text>
        <text class="detail-page__time">{{ fmtTime(post.createdAt) }}</text>
      </view>
      <text class="detail-page__content">{{ post.content }}</text>
    </view>

    <view class="detail-page__footer">
      <view class="detail-page__action" :class="{ 'detail-page__action--on': post.viewerLiked }" @tap="onToggleLike">
        <text class="detail-page__action-icon">{{ post.viewerLiked ? '♥' : '♡' }}</text>
        <text class="detail-page__action-text">{{ post.likeCount }}</text>
      </view>
      <view class="detail-page__action" :class="{ 'detail-page__action--on': post.viewerFavorited }" @tap="onToggleFavorite">
        <text class="detail-page__action-icon">{{ post.viewerFavorited ? '★' : '☆' }}</text>
        <text class="detail-page__action-text">{{ post.favoriteCount }}</text>
      </view>
      <view class="detail-page__action" @tap="onShare">
        <text class="detail-page__action-icon">↗</text>
        <text class="detail-page__action-text">分享</text>
      </view>
      <view v-if="post.productId" class="detail-page__buy" @tap="goBuySame">
        <text class="detail-page__buy-text">买同款</text>
      </view>
    </view>
  </view>
  <EmptyState v-else-if="!loading" text="帖子不存在或已被删除" />
  <view v-if="loading" class="detail-page__loading">加载中...</view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getCirclePost, toggleCircleLike, toggleCircleFavorite } from '../../api/queries/circle';
import { getProductsByIds } from '../../api/queries/product';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';

const authStore = useAuthStore();
const post = ref<any>(null);
const loading = ref(true);
const images = ref<string[]>([]);

onLoad(async (options: any) => {
    const id = options?.id;
    if (!id) { loading.value = false; return; }
    try {
        const r: any = await getCirclePost(id);
        post.value = r?.circlePost || null;
        images.value = Array.isArray(post.value?.images) ? post.value.images : [];
    } catch (e) { console.error(e); }
    loading.value = false;
});

function fmtTime(s: string): string {
    return s ? String(s).replace('T', ' ').slice(0, 16) : '';
}

function preview(idx: number) {
    uni.previewImage({ current: idx, urls: images.value });
}

/** 点赞/收藏 toggle：以服务端返回的 ToggleCircleResult 为准整体覆盖（含双计数与双状态） */
async function doToggle(kind: 'like' | 'favorite') {
    if (!post.value) return;
    const redirect = '/pkg-circle/pages/detail?id=' + post.value.id;
    if (!authStore.requireLogin(redirect)) return;
    try {
        const r = kind === 'like'
            ? await toggleCircleLike(post.value.id)
            : await toggleCircleFavorite(post.value.id);
        if (r && post.value) {
            post.value.viewerLiked = r.liked;
            post.value.viewerFavorited = r.favorited;
            post.value.likeCount = r.likeCount;
            post.value.favoriteCount = r.favoriteCount;
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
}
const onToggleLike = () => doToggle('like');
const onToggleFavorite = () => doToggle('favorite');

/** H5 无原生分享面板：复制帖子链接 */
function onShare() {
    const link = window.location.origin + '/#/pkg-circle/pages/detail?id=' + post.value?.id;
    uni.setClipboardData({
        data: link,
        success: () => uni.showToast({ title: '链接已复制', icon: 'none' }),
    });
}

/** 买同款：后端只存 productId，复用秒杀/拼团的补查口径拿 slug 再跳详情 */
function goBuySame() {
    const productId = String(post.value?.productId || '');
    if (!productId) return;
    getProductsByIds([productId])
        .then((products: any[]) => {
            const slug = products?.[0]?.slug;
            if (!slug) {
                uni.showToast({ title: '商品不存在或已下架', icon: 'none' });
                return;
            }
            uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug });
        })
        .catch(() => uni.showToast({ title: '商品加载失败', icon: 'none' }));
}
</script>

<style lang="scss" scoped>
.detail-page {
    min-height: 100vh; background: $bg-color; padding-bottom: 160rpx;
    &__video { width: 100%; height: 750rpx; background: #000; }
    &__gallery { width: 100%; height: 750rpx; background: #fff; }
    &__img { width: 100%; height: 100%; }
    &__body { background: #fff; margin-top: 2rpx; padding: 30rpx; }
    &__title { display: block; font-size: 34rpx; font-weight: bold; color: #333; }
    &__meta { display: flex; justify-content: space-between; margin-top: 16rpx; }
    &__author { font-size: 26rpx; color: #666; }
    &__time { font-size: 22rpx; color: #999; }
    &__content { display: block; font-size: 28rpx; color: #333; line-height: 1.7; margin-top: 24rpx; word-break: break-all; }
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 40rpx; }
    &__footer {
        position: fixed; left: 0; right: 0; bottom: 0; background: #fff;
        display: flex; align-items: center; gap: 16rpx;
        padding: 16rpx 30rpx calc(16rpx + constant(safe-area-inset-bottom));
        padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
        border-top: 1rpx solid $border-color;
    }
    &__action {
        display: flex; flex-direction: column; align-items: center; min-width: 96rpx;
        &-icon { font-size: 36rpx; color: #666; line-height: 1.2; }
        &-text { font-size: 22rpx; color: #999; }
        &--on &-icon { color: $brand-color; }
        &--on &-text { color: $brand-color; }
    }
    &__buy {
        margin-left: auto; background: $brand-color; color: #fff; border-radius: 999rpx;
        padding: 16rpx 44rpx;
        &-text { font-size: 28rpx; font-weight: bold; }
    }
}
</style>

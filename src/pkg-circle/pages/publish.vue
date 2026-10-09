<template>
  <view class="publish-page">
    <view class="publish-page__form">
      <view class="publish-page__field">
        <input
          v-model="title"
          class="publish-page__input"
          :maxlength="50"
          placeholder="标题（选填，50 字以内）"
          placeholder-class="publish-page__placeholder"
        />
        <text class="publish-page__count">{{ title.length }}/50</text>
      </view>
      <view class="publish-page__field">
        <textarea
          v-model="content"
          class="publish-page__textarea"
          :maxlength="2000"
          placeholder="分享你的购物心得…"
          placeholder-class="publish-page__placeholder"
        />
      </view>
      <view class="publish-page__field">
        <text class="publish-page__label">图片（最多 6 张）</text>
        <ImageUpload v-model="images" :maxCount="6" />
      </view>
    </view>
    <button class="publish-page__submit" :disabled="submitting" @tap="doSubmit">
      {{ submitting ? '发布中…' : '发布' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createCirclePost } from '../../api/queries/circle';
import { useAuthStore } from '../../stores/auth';
import ImageUpload from '../../components/ImageUpload.vue';

const authStore = useAuthStore();

// 游客进发布页直接引导登录（createCirclePost 需登录）
authStore.requireLogin('/pkg-circle/pages/publish');

const title = ref('');
const content = ref('');
const images = ref<string[]>([]);
const submitting = ref(false);

async function doSubmit() {
    if (!content.value.trim()) {
        uni.showToast({ title: '请填写正文', icon: 'none' });
        return;
    }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await createCirclePost({
            title: title.value.trim() || null,
            content: content.value.trim(),
            images: images.value.length ? images.value : null,
        });
        uni.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 600);
    } catch (e: any) {
        uni.showToast({ title: e?.message || '发布失败', icon: 'none' });
    }
    submitting.value = false;
}
</script>

<style lang="scss" scoped>
.publish-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__form { background: #fff; border-radius: $radius-md; padding: 24rpx; }
    &__field { margin-bottom: 24rpx; position: relative; }
    &__input {
        height: 88rpx; background: $bg-color; border-radius: $radius-md; padding: 0 24rpx;
        font-size: 28rpx; padding-right: 120rpx;
    }
    &__count { position: absolute; right: 24rpx; top: 30rpx; font-size: 22rpx; color: #999; }
    &__textarea {
        width: 100%; height: 320rpx; background: $bg-color; border-radius: $radius-md;
        padding: 24rpx; font-size: 28rpx; box-sizing: border-box;
    }
    &__label { display: block; font-size: 26rpx; color: #666; margin-bottom: 16rpx; }
    &__placeholder { color: #bbb; }
    &__submit {
        margin-top: 40rpx; background: $brand-color; color: #fff; height: 88rpx; line-height: 88rpx;
        font-size: 30rpx; border-radius: $radius-md;
        &[disabled] { opacity: 0.6; }
    }
}
</style>

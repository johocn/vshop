<template>
  <view class="feedback-page">
    <view class="section">
      <text class="section__title">反馈类型</text>
      <picker :range="typeNames" @change="onTypeChange">
        <view class="picker">
          <text>{{ typeNames[typeIndex] }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
    </view>

    <view class="section">
      <text class="section__title">问题标题</text>
      <input v-model.trim="form.title" :maxlength="20" placeholder="请简要概括问题（20 字以内，必填）" class="input" />
    </view>

    <view class="section">
      <text class="section__title">问题描述</text>
      <textarea v-model="form.content" placeholder="请详细描述您遇到的问题（必填）" class="textarea" />
    </view>

    <view class="section">
      <text class="section__title">图片补充（最多 3 张）</text>
      <ImageUpload v-model="form.imgs" :max-count="3" />
    </view>

    <view class="section">
      <text class="section__title">联系方式</text>
      <input v-model.trim="form.contactWay" :maxlength="30" placeholder="手机号 / 微信 / 邮箱（30 字以内，选填）" class="input" />
    </view>

    <button class="feedback-page__btn" :disabled="submitting" @click="doSubmit">
      {{ submitting ? '提交中...' : '提交反馈' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createFeedback } from '../../api/queries/feedback';
import { useUIStore } from '../../stores/ui';
import ImageUpload from '../../components/ImageUpload.vue';

const ui = useUIStore();
const submitting = ref(false);

// 类型 key 与后端 Feedback.type 对齐
const TYPES = [
    { key: 'bug', name: '功能异常' },
    { key: 'experience', name: '体验问题' },
    { key: 'other', name: '其他' },
];
const typeNames = TYPES.map(t => t.name);
const typeIndex = ref(0);

const form = ref({ title: '', content: '', imgs: [] as string[], contactWay: '' });

function onTypeChange(e: any) {
    typeIndex.value = Number(e.detail.value) || 0;
}

async function doSubmit() {
    if (!form.value.title) { ui.showToast('请填写问题标题', 'error'); return; }
    if (!form.value.content) { ui.showToast('请填写问题描述', 'error'); return; }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await createFeedback({
            type: TYPES[typeIndex.value].key,
            title: form.value.title,
            content: form.value.content,
            imgs: form.value.imgs,
            contactWay: form.value.contactWay || undefined,
        });
        ui.showToast('反馈已提交，感谢您的意见', 'success');
        setTimeout(() => uni.navigateBack(), 1500);
    } catch (e: any) {
        ui.showToast(e?.message || '提交失败', 'error');
    } finally {
        submitting.value = false;
    }
}
</script>

<style lang="scss" scoped>
.feedback-page {
    min-height: 100vh; background: $bg-color; padding: 20rpx;
    &__btn {
        margin-top: 20rpx; background: $brand-color; color: #fff; border: none;
        border-radius: $radius-md; height: 88rpx; font-size: 30rpx;
    }
}
.section {
    background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 20rpx;
    &__title { font-weight: bold; font-size: 28rpx; display: block; margin-bottom: 16rpx; }
}
.input { height: 80rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
.textarea { width: 100%; min-height: 200rpx; font-size: 28rpx; line-height: 1.6; }
.picker { display: flex; justify-content: space-between; align-items: center; height: 80rpx; font-size: 28rpx; &__arrow { color: #ccc; } }
</style>

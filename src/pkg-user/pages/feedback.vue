<template>
  <view class="feedback-page">
    <view class="section">
      <text class="section__title">{{ t('feedback.typeTitle') }}</text>
      <picker :range="typeNames" @change="onTypeChange">
        <view class="picker">
          <text>{{ typeNames[typeIndex] }}</text>
          <text class="picker__arrow">></text>
        </view>
      </picker>
    </view>

    <view class="section">
      <text class="section__title">{{ t('feedback.titleLabel') }}</text>
      <input v-model.trim="form.title" :maxlength="20" :placeholder="t('feedback.titlePlaceholder')" class="input" />
    </view>

    <view class="section">
      <text class="section__title">{{ t('feedback.contentLabel') }}</text>
      <textarea v-model="form.content" :placeholder="t('feedback.contentPlaceholder')" class="textarea" />
    </view>

    <view class="section">
      <text class="section__title">{{ t('feedback.imagesLabel') }}</text>
      <ImageUpload v-model="form.imgs" :max-count="3" />
    </view>

    <view class="section">
      <text class="section__title">{{ t('feedback.contactLabel') }}</text>
      <input v-model.trim="form.contactWay" :maxlength="30" :placeholder="t('feedback.contactPlaceholder')" class="input" />
    </view>

    <button class="feedback-page__btn" :disabled="submitting" @click="doSubmit">
      {{ submitting ? t('feedback.submitting') : t('feedback.submit') }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { createFeedback } from '../../api/queries/feedback';
import { useUIStore } from '../../stores/ui';
import ImageUpload from '../../components/ImageUpload.vue';

const { t } = useI18n();
const ui = useUIStore();
const submitting = ref(false);

// 类型 key 与后端 Feedback.type 对齐
const TYPE_KEYS = ['bug', 'experience', 'other'];
const typeNames = computed(() => [t('feedback.typeBug'), t('feedback.typeExperience'), t('feedback.typeOther')]);
const typeIndex = ref(0);

const form = ref({ title: '', content: '', imgs: [] as string[], contactWay: '' });

function onTypeChange(e: any) {
    typeIndex.value = Number(e.detail.value) || 0;
}

async function doSubmit() {
    if (!form.value.title) { ui.showToast(t('feedback.titleRequired'), 'error'); return; }
    if (!form.value.content) { ui.showToast(t('feedback.contentRequired'), 'error'); return; }
    if (submitting.value) return;
    submitting.value = true;
    try {
        await createFeedback({
            type: TYPE_KEYS[typeIndex.value],
            title: form.value.title,
            content: form.value.content,
            imgs: form.value.imgs,
            contactWay: form.value.contactWay || undefined,
        });
        ui.showToast(t('feedback.submitted'), 'success');
        setTimeout(() => uni.navigateBack(), 1500);
    } catch (e: any) {
        ui.showToast(e?.message || t('feedback.failed'), 'error');
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

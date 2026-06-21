<template>
  <view class="image-upload">
    <view class="image-upload__grid">
      <view v-for="(img, idx) in images" :key="idx" class="image-upload__item">
        <image :src="img" class="image-upload__preview" mode="aspectFill" @click="previewImage(idx)" />
        <text class="image-upload__remove" @click="removeImage(idx)">×</text>
      </view>
      <view v-if="images.length < maxCount" class="image-upload__add" @click="chooseImage">
        <text class="image-upload__icon">+</text>
        <text class="image-upload__text">添加图片</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
    modelValue?: string[];
    maxCount?: number;
    maxSize?: number; // KB
}>();
const emit = defineEmits<{
    'update:modelValue': [value: string[]];
}>();

const maxCount = props.maxCount || 9;
const maxSize = props.maxSize || 5 * 1024; // 5MB default
const images = ref<string[]>(props.modelValue || []);

watch(() => props.modelValue, (val) => {
    if (val) images.value = val;
});

function chooseImage() {
    const remaining = maxCount - images.value.length;
    if (remaining <= 0) return;
    uni.chooseImage({
        count: remaining,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
            res.tempFilePaths.forEach((filePath: string) => {
                const fileInfo = res.tempFiles?.find((f: any) => f.path === filePath);
                if (fileInfo && fileInfo.size > maxSize * 1024) {
                    uni.showToast({ title: '图片过大', icon: 'none' });
                    return;
                }
                uploadImage(filePath);
            });
        }
    });
}

async function uploadImage(filePath: string) {
    // TODO: Replace with real upload endpoint (OSS/CDN)
    // For now, use local temp path as placeholder
    uni.showLoading({ title: '上传中...' });
    try {
        // In production: upload to OSS/S3 and get URL
        // const res = await uni.uploadFile({ url: 'YOUR_UPLOAD_API', filePath, name: 'file' });
        // images.value.push(res.data.url);

        // Placeholder: use local file path
        images.value.push(filePath);
        emit('update:modelValue', images.value);
    } catch (e) {
        uni.showToast({ title: '上传失败', icon: 'none' });
    }
    uni.hideLoading();
}

function removeImage(idx: number) {
    images.value.splice(idx, 1);
    emit('update:modelValue', images.value);
}

function previewImage(idx: number) {
    uni.previewImage({ current: idx, urls: images.value });
}
</script>

<style lang="scss" scoped>
.image-upload__grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.image-upload__item {
    width: 200rpx; height: 200rpx; position: relative; border-radius: $radius-md; overflow: hidden;
}
.image-upload__preview { width: 100%; height: 100%; }
.image-upload__remove {
    position: absolute; top: 0; right: 0; width: 48rpx; height: 48rpx;
    background: rgba(0,0,0,0.5); color: #fff; text-align: center; line-height: 48rpx;
    font-size: 32rpx; border-radius: 0 0 0 16rpx;
}
.image-upload__add {
    width: 200rpx; height: 200rpx; border: 2rpx dashed $border-color; border-radius: $radius-md;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.image-upload__icon { font-size: 60rpx; color: #ccc; line-height: 1; }
.image-upload__text { font-size: 22rpx; color: #999; margin-top: 8rpx; }
</style>

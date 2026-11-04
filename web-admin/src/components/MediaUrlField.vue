<template>
  <view class="mwf">
    <view class="mwf__grid">
      <view v-for="(u, i) in modelValue" :key="`${u}-${i}`" class="mwf__cell">
        <image class="mwf__img" :src="u" mode="aspectFill" @tap="preview(i)" />
        <view class="mwf__del" @tap.stop="remove(i)">×</view>
      </view>
      <view v-if="modelValue.length < max" class="mwf__add" @tap="open = true">
        <text class="mwf__plus">＋</text>
        <text class="mwf__txt">{{ $t('mediaPicker.fromLibrary') }}</text>
      </view>
    </view>

    <!-- 统一走素材库（可选已上传资源，也可在弹层内上传新图），不另起本地上传 -->
    <MediaLibraryModal
      v-model:visible="open"
      :max="max"
      media-type="image"
      :value="[]"
      @confirm="onConfirm"
    />
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MediaLibraryModal from './MediaLibraryModal.vue';
import type { AssetItem } from '../apis/asset';
import { mergeAssetUrls } from '../utils/media';

const props = withDefaults(defineProps<{ modelValue: string[]; max?: number }>(), { max: 1 });
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const open = ref(false);

function onConfirm(assets: AssetItem[]) {
    emit('update:modelValue', mergeAssetUrls(props.modelValue, assets, props.max));
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i));
}
function preview(i: number) {
  uni.previewImage({ urls: props.modelValue, current: props.modelValue[i] });
}
</script>

<style lang="scss" scoped>
.mwf {
  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }
  &__cell {
    position: relative;
    width: 160rpx;
    height: 120rpx;
    border-radius: $wa-radius;
    overflow: hidden;
    border: 1rpx solid $wa-rule;
    box-sizing: border-box;
  }
  &__img {
    width: 100%;
    height: 100%;
    display: block;
  }
  &__del {
    position: absolute;
    top: 4rpx;
    right: 4rpx;
    width: 34rpx;
    height: 34rpx;
    line-height: 34rpx;
    text-align: center;
    font-size: 28rpx;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 50%;
  }
  &__add {
    width: 160rpx;
    height: 120rpx;
    border: 2rpx dashed $wa-rule;
    border-radius: $wa-radius;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }
  &__plus {
    font-size: 44rpx;
    line-height: 1;
    color: $wa-accent;
  }
  &__txt {
    font-size: 22rpx;
    margin-top: 6rpx;
    color: $wa-ink;
  }
}
</style>

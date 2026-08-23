<template>
  <view class="page">
    <ImagePicker :max="999" @change="onSelect" />
  </view>
</template>
<script lang="ts" setup>
import ImagePicker from '../../../components/ImagePicker.vue';

// 独立图片库页仅用于浏览/上传；选中无后续处理，预留接口便于后续扩展
function onSelect(ids: string[]) {
  void ids;
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $wa-bg;
  padding: 24rpx 32rpx;
  box-sizing: border-box;
}
</style>
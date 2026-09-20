<template>
  <view class="mask" @tap="$emit('close')">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ title }}</text>
      <view class="pwd-box">
        <text class="pwd-label">{{ $t('passwordPopup.account') }}</text>
        <text class="pwd-val">{{ account }}</text>
      </view>
      <view class="pwd-box">
        <text class="pwd-label">{{ $t('passwordPopup.initialPwd') }}</text>
        <text class="pwd-val mono">{{ password }}</text>
      </view>
      <text class="tip">{{ $t('passwordPopup.tip') }}</text>
      <button class="btn" @tap="copyPwd">{{ $t('passwordPopup.copyBtn') }}</button>
      <view class="done" @tap="$emit('close')">{{ $t('passwordPopup.done') }}</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { useLocaleStore } from '../stores/localeStore';
const locale = useLocaleStore();
const props = defineProps<{ title: string; account: string; password: string }>();
function copyPwd() {
  uni.setClipboardData({
    data: props.password,
    success: () => uni.showToast({ title: locale.t('passwordPopup.copied'), icon: 'none' }),
  });
}
</script>
<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 560rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { font-size: 32rpx; font-weight: 700; display: block; text-align: center; margin-bottom: 24rpx; }
.pwd-box { display: flex; justify-content: space-between; padding: 20rpx 0; border-bottom: 1px solid #f0f0f0; align-items: center; }
.pwd-label { color: #999; font-size: 26rpx; }
.pwd-val { font-size: 28rpx; font-weight: 600; }
.mono { font-family: monospace; letter-spacing: 1rpx; }
.tip { display: block; color: #e64340; font-size: 22rpx; margin: 20rpx 0; }
.btn { background: #4f8cff; color: #fff; border-radius: 40rpx; font-size: 28rpx; line-height: 2.4; }
.done { text-align: center; color: #999; font-size: 26rpx; margin-top: 24rpx; }
</style>
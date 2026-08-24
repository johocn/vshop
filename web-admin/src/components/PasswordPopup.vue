<template>
  <view class="mask" @tap="$emit('close')">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ title }}</text>
      <view class="pwd-box">
        <text class="pwd-label">账号</text>
        <text class="pwd-val">{{ account }}</text>
      </view>
      <view class="pwd-box">
        <text class="pwd-label">初始口令</text>
        <text class="pwd-val mono">{{ password }}</text>
      </view>
      <text class="tip">仅显示一次，请复制并转发给本人；首次登录后强制修改密码。</text>
      <button class="btn" @tap="copyPwd">一键复制密码</button>
      <view class="done" @tap="$emit('close')">我已经复制完成</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
const props = defineProps<{ title: string; account: string; password: string }>();
function copyPwd() {
  uni.setClipboardData({
    data: props.password,
    success: () => uni.showToast({ title: '密码已复制', icon: 'none' }),
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
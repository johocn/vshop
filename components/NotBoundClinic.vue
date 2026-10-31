<template>
  <!-- 账号未绑定诊所引导态：与普通空态（common.empty）区分，避免医生误以为业务无数据 -->
  <view class="bind-clinic card">
    <view class="bc-icon"><view class="bc-cross"></view></view>
    <view class="bc-title">{{ t('common.notBoundClinicTitle') }}</view>
    <view class="bc-desc">{{ t('common.notBoundClinicDesc') }}</view>
    <view class="btn-primary bc-action" @tap="contactAdmin">{{ t('common.bindClinicAction') }}</view>
  </view>
</template>

<script setup>
import { t } from '../utils/i18n'

// 无客服/联系方式配置：不做假跳转，仅弹层说明联系管理员
function contactAdmin() {
  uni.showModal({
    title: t('common.bindClinicAction'),
    content: t('common.contactAdminTip'),
    showCancel: false,
    confirmText: t('common.confirm'),
  })
}
</script>

<style scoped>
.bind-clinic { display: flex; flex-direction: column; align-items: center; padding: 56rpx 40rpx 40rpx; }
.bc-icon {
  width: 120rpx; height: 120rpx; border-radius: 50%;
  background: #e8f3ee;
  display: flex; align-items: center; justify-content: center;
}
/* 绿色医疗十字：诊所类图标，随主题色 */
.bc-cross { position: relative; width: 56rpx; height: 56rpx; }
.bc-cross::before,
.bc-cross::after {
  content: ''; position: absolute; background: #2f7d5f; border-radius: 6rpx;
}
.bc-cross::before { left: 18rpx; top: 0; width: 20rpx; height: 56rpx; }
.bc-cross::after { top: 18rpx; left: 0; width: 56rpx; height: 20rpx; }
.bc-title { font-size: 32rpx; font-weight: 600; color: #303133; margin-top: 24rpx; }
.bc-desc { font-size: 26rpx; color: #7a837f; line-height: 1.6; margin-top: 12rpx; text-align: center; }
.bc-action { margin-top: 36rpx; padding-left: 56rpx; padding-right: 56rpx; }
</style>

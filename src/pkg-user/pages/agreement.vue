<template>
    <view class="agree-page">
        <scroll-view scroll-y class="agree-page__scroll">
            <view class="agree-page__doc">
                <text class="h1">{{ isPrivacy ? '隐私政策' : '用户协议' }}</text>
                <text class="p">更新日期：2026-10-09</text>
                <template v-if="isPrivacy">
                    <text class="h2">一、我们收集的信息</text>
                    <text class="p">为完成注册与下单，我们会收集您的手机号、收货人姓名、收货地址与联系方式；微信/抖音等第三方登录时收集您授权的头像与昵称。</text>
                    <text class="h2">二、信息的使用</text>
                    <text class="p">收集的信息仅用于订单处理、物流配送、售后服务与账户安全，不用于任何与本商城交易无关的用途。</text>
                    <text class="h2">三、信息的共享</text>
                    <text class="p">仅向完成配送所必需的承运方提供收货信息；除法律法规要求外，不向其他第三方提供您的个人信息。</text>
                    <text class="h2">四、信息的存储与保护</text>
                    <text class="p">您的信息存储于我们的服务器并通过加密传输；您可在「个人中心-修改密码」维护账户安全，或联系客服注销账户。</text>
                </template>
                <template v-else>
                    <text class="h2">一、服务说明</text>
                    <text class="p">本商城为您提供商品浏览、下单购买、支付结算、售后服务等电商服务。注册即视为同意本协议。</text>
                    <text class="h2">二、账户与安全</text>
                    <text class="p">您应妥善保管账户凭据，通过账户进行的操作视为您本人行为。请勿将账户出借、转让。</text>
                    <text class="h2">三、交易规范</text>
                    <text class="p">您承诺在下单、支付、评价等环节遵守诚实信用原则；利用系统漏洞或恶意下单的，平台有权取消交易并保留追责权利。</text>
                    <text class="h2">四、售后保障</text>
                    <text class="p">商品支持按平台公示的售后政策申请退换货；具体规则以订单页与售后页展示为准。</text>
                </template>
            </view>
        </scroll-view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const isPrivacy = ref(false);
onLoad((opts) => {
    isPrivacy.value = opts?.type === 'privacy';
    uni.setNavigationBarTitle({ title: isPrivacy.value ? '隐私政策' : '用户协议' });
});
</script>

<style lang="scss" scoped>
.agree-page { height: 100vh; background: #fff;
    &__scroll { height: 100%; }
    &__doc { padding: 32rpx; display: flex; flex-direction: column; }
    .h1 { font-size: 36rpx; font-weight: 700; margin-bottom: 8rpx; }
    .h2 { font-size: 30rpx; font-weight: 600; margin: 24rpx 0 8rpx; }
    .p { font-size: 26rpx; color: #444; line-height: 1.7; margin-bottom: 8rpx; }
}
</style>

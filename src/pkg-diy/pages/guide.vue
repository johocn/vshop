<template>
    <view class="guide">
        <view v-for="s in sections" :key="s.k" class="guide__sec">
            <text class="guide__t">{{ t('diy.guide.' + s.k + 't') }}</text>
            <text class="guide__p">{{ t('diy.guide.' + s.k) }}</text>
        </view>
        <view class="guide__foot">
            <view class="guide__btn" @tap="back">{{ t('diy.guide.start') }}</view>
        </view>
    </view>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const sections = [
    { k: 's1' }, { k: 's2' }, { k: 's3' }, { k: 's4' }, { k: 's5' }, { k: 's6' }, { k: 's7' },
];
function back() {
    const pages = getCurrentPages();
    if (pages.length > 1) uni.navigateBack();
    else uni.redirectTo({ url: '/pkg-diy/pages/designer' });
}
</script>
<style lang="scss" scoped>
.guide {
    min-height: 100vh;
    background: $bg-color;
    padding: 24rpx 24rpx 200rpx;

    &__sec {
        background: #fff;
        border-radius: $radius-md;
        padding: 28rpx 32rpx;
        margin-bottom: 20rpx;
    }

    &__t {
        display: block;
        font-size: 30rpx;
        font-weight: 600;
        color: $text-color;
    }

    &__p {
        display: block;
        margin-top: 14rpx;
        font-size: 26rpx;
        line-height: 1.7;
        color: $text-color-secondary;
    }

    &__foot {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
        background: #fff;
        box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
    }

    &__btn {
        height: 88rpx;
        line-height: 88rpx;
        text-align: center;
        border-radius: $radius-md;
        background: $brand-color;
        color: #fff;
        font-size: 30rpx;
    }
}
</style>

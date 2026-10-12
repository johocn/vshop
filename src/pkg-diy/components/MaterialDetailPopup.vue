<template>
    <view v-if="material" class="mdp" @touchmove.stop.prevent>
        <view class="mdp__mask" @tap="close" />
        <view class="mdp__panel">
            <view class="mdp__dot" :style="{ background: materialColor(material), width: '160rpx', height: '160rpx' }" />
            <text class="mdp__name">{{ materialName(material, locale) }}</text>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.spec') }}</text><text>{{ material.diameter ?? material.axialLength ?? 0 }}mm</text></view>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.price') }}</text><text class="mdp__price">¥{{ yuan(material.price) }}{{ t('diy.perBead') }}</text></view>
            <view class="mdp__btn" @tap="onPick">{{ t('diy.detail.pick') }}</view>
        </view>
    </view>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { materialColor, materialName, yuan, type DiyMaterialRow } from '../composables/useDesigner';

const props = defineProps<{ material: DiyMaterialRow | null }>();
const emit = defineEmits<{
    (e: 'update:material', v: DiyMaterialRow | null): void;
    (e: 'pick', id: string): void;
}>();
const { t, locale } = useI18n();
function close() { emit('update:material', null); }
function onPick() { if (props.material) emit('pick', props.material.id); close(); }
</script>
<style lang="scss" scoped>
.mdp {
    position: fixed;
    inset: 0;
    z-index: 1000;

    &__mask {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
    }

    &__panel {
        position: absolute;
        left: 60rpx;
        right: 60rpx;
        top: 50%;
        transform: translateY(-50%);
        background: #fff;
        border-radius: $radius-lg;
        padding: 40rpx;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    &__dot {
        border-radius: 50%;
        box-shadow: inset -6rpx -8rpx 14rpx rgba(0, 0, 0, 0.18), inset 6rpx 8rpx 14rpx rgba(255, 255, 255, 0.5);
    }

    &__name {
        margin-top: 20rpx;
        font-size: 30rpx;
        font-weight: 600;
        color: $text-color;
    }

    &__row {
        width: 100%;
        display: flex;
        justify-content: space-between;
        margin-top: 20rpx;
        font-size: 26rpx;
        color: $text-color;
    }

    &__k {
        color: $text-color-secondary;
    }

    &__price {
        color: $price-color;
    }

    &__btn {
        margin-top: 32rpx;
        width: 100%;
        height: 80rpx;
        line-height: 80rpx;
        text-align: center;
        background: $brand-color;
        color: #fff;
        border-radius: $radius-md;
        font-size: 28rpx;
    }
}
</style>

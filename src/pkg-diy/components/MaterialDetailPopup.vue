<template>
    <view v-if="material" class="mdp" @touchmove.stop.prevent>
        <view class="mdp__mask" @tap="close" />
        <view class="mdp__panel">
            <view class="mdp__dot" :style="{ background: materialColor(material), width: '160rpx', height: '160rpx' }" />
            <text class="mdp__name">{{ materialName(material, locale) }}</text>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.spec') }}</text><text>{{ material.diameter ?? material.axialLength ?? 0 }}mm</text></view>
            <view class="mdp__row"><text class="mdp__k">{{ t('diy.detail.price') }}</text><text class="mdp__price">¥{{ yuan(material.price) }}{{ t('diy.perBead') }}</text></view>
            <view v-if="materialDetail.meaning" class="mdp__row"><text class="mdp__k">{{ t('diy.detail.meaning') }}</text><text>{{ materialDetail.meaning }}</text></view>
            <view v-if="materialDetail.origin" class="mdp__row"><text class="mdp__k">{{ t('diy.detail.origin') }}</text><text>{{ materialDetail.origin }}</text></view>
            <view v-if="materialDetail.hardness" class="mdp__row"><text class="mdp__k">{{ t('diy.detail.hardness') }}</text><text>{{ materialDetail.hardness }}</text></view>
            <view class="mdp__btn" @tap="onPick">{{ t('diy.detail.pick') }}</view>
        </view>
    </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
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

/** attrs 详情（meaning/origin 多语言；缺省跳行） */
const materialDetail = computed(() => {
    const a: any = (props.material as any)?.attrs || {};
    const loc = (v: any): string => {
        if (!v) return '';
        if (typeof v === 'string') return v;
        return v[locale.value] || v['zh-CN'] || Object.values(v)[0] || '';
    };
    return { meaning: loc(a.meaning), origin: loc(a.origin), hardness: a.hardness ? String(a.hardness) : '' };
});
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

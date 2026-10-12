<template>
    <view class="plan-detail">
        <!-- 预览区 -->
        <view class="plan-detail__preview">
            <BeadRing canvas-id="planDetailRing" :width="690" :height="420" :beads="pd.previewBeads.value" :mm-per-px="ringMmPerPx" />
            <view class="plan-detail__badges">
                <text v-if="pd.status.value" class="plan-detail__badge" :class="'plan-detail__badge--' + pd.status.value">
                    {{ t('diy.status.' + pd.status.value) }}
                </text>
                <text v-if="pd.isPublicShown.value" class="plan-detail__badge plan-detail__badge--public">{{ t('diy.status.public') }}</text>
                <text v-else-if="pd.isOwner.value && !pd.isOrdered.value" class="plan-detail__badge plan-detail__badge--private">{{ t('diy.status.private') }}</text>
            </view>
            <view class="plan-detail__meta">
                <text class="plan-detail__title">{{ pd.title.value }}</text>
                <text class="plan-detail__price">¥{{ yuan(pd.bomView.value.totalAmount) }}</text>
            </view>
            <view class="plan-detail__fit" @tap="showCalc = true">
                {{ t('diy.innerCirc') }} {{ cm(pd.bomView.value.geometry?.innerCircumference) }} · {{ t(feedbackI18nKey(pd.bomView.value.geometry?.feedback)) }}
                <text class="plan-detail__fit-link">{{ t('diy.calcDetail') }}</text>
            </view>
        </view>

        <!-- 参数摘要 -->
        <view class="plan-detail__card">
            <view class="plan-detail__row">
                <text class="plan-detail__label">{{ t('diy.mode.' + (pd.spec.value?.mode ?? 'byWrist')) }}</text>
                <text class="plan-detail__value">{{ t('diy.wristSize') }} {{ (Number(pd.spec.value?.params?.wristSize ?? 0) / 10).toFixed(1) }}cm</text>
            </view>
            <view class="plan-detail__row">
                <text class="plan-detail__label">{{ t('diy.beadCount') }}</text>
                <text class="plan-detail__value">{{ pd.bomView.value.totalCount }}</text>
            </view>
            <view v-if="pd.bomView.value.cord" class="plan-detail__row">
                <text class="plan-detail__label">{{ t('diy.cord') }}</text>
                <text class="plan-detail__value">⌀{{ pd.bomView.value.cord.diameter }}mm · {{ Math.round(pd.bomView.value.cord.length) }}mm</text>
            </view>
            <view class="plan-detail__detail-btn" @tap="showCalc = true">{{ t('diy.calcDetail') }}</view>
        </view>

        <!-- 操作区 -->
        <view class="plan-detail__actions">
            <view
                v-if="pd.canQuote.value"
                class="plan-detail__btn"
                :class="{ 'plan-detail__btn--busy': acting }"
                @tap="act(pd.onQuote)"
            >{{ t('diy.quote') }}</view>
            <view
                v-if="pd.canOrder.value"
                class="plan-detail__btn plan-detail__btn--primary"
                :class="{ 'plan-detail__btn--busy': acting, 'plan-detail__btn--disabled': pd.isOrdered.value }"
                @tap="onOrderTap"
            >{{ pd.isOrdered.value ? t('diy.status.ordered') : t('diy.orderNow') }}</view>
            <view
                v-if="pd.canPublish.value"
                class="plan-detail__btn"
                :class="{ 'plan-detail__btn--busy': acting }"
                @tap="act(pd.onPublish)"
            >{{ pd.plan.value?.isPublic ? t('diy.unpublish') : t('diy.publish') }}</view>
            <view
                v-if="pd.canCopy.value"
                class="plan-detail__btn plan-detail__btn--primary"
                :class="{ 'plan-detail__btn--busy': acting }"
                @tap="onCopyTap"
            >{{ t('diy.copyPlan') }}</view>
        </view>

        <CalcDetailSheet v-model:show="showCalc" :result="calcSheetResult" />
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import BeadRing from '../components/BeadRing.vue';
import CalcDetailSheet from '../components/CalcDetailSheet.vue';
import { useAuthStore } from '../../stores/auth';
import { usePlanDetail } from '../composables/usePlanDetail';
import { yuan, cm, feedbackI18nKey, type DiyMaterialRow } from '../composables/useDesigner';

const { t, locale } = useI18n();
const authStore = useAuthStore();

const materials = ref<DiyMaterialRow[]>([]);
const pd = usePlanDetail(materials, locale, t);

const showCalc = ref(false);
const acting = ref(false);

onLoad(async (opts: any) => {
    uni.setNavigationBarTitle({ title: t('diy.planDetail.title') });
    const id = String(opts?.id ?? '');
    if (!id) {
        uni.showToast({ title: t('diy.planDetail.notFound'), icon: 'none' });
        setTimeout(() => uni.navigateBack(), 600);
        return;
    }
    await Promise.all([pd.loadMaterials(), pd.load(id)]);
    if (!pd.plan.value) {
        uni.showToast({ title: t('diy.planDetail.notFound'), icon: 'none' });
        setTimeout(() => uni.navigateBack(), 600);
    }
});

/** mmPerPx 随颗数自适应（对齐 designer.vue） */
const ringMmPerPx = computed(() => {
    const beads = pd.previewBeads.value;
    if (!beads.length) return 1.4;
    const avgD = beads.reduce((s, b) => s + b.diameterMm, 0) / beads.length;
    const radiusRpx = 690 / 2 - avgD / 2 - 4;
    const circRpx = 2 * Math.PI * Math.max(40, radiusRpx);
    return Math.min(2.2, Math.max(0.7, (beads.length * avgD) / circRpx));
});

/** CalcDetailSheet 入参：bom 用展示视图，calc 补 adjustHint（服务端快照无 calc 时为 null，sheet 已兜底） */
const calcSheetResult = computed(() => ({
    calc: pd.localResult.value?.calc ?? null,
    bom: pd.bomView.value,
}));

/** 通用动作包装：busy 态 + 错误 toast */
async function act(fn: () => Promise<string | null>) {
    if (acting.value) return;
    acting.value = true;
    try {
        const msg = await fn();
        if (msg) uni.showToast({ title: msg, icon: 'success' });
    } catch (e: any) {
        uni.showToast({ title: e?.message || t('diy.actionFailed'), icon: 'none' });
    }
    acting.value = false;
}

/** 下单：已下单不可重复；未登录引导登录 */
function onOrderTap() {
    if (pd.isOrdered.value || acting.value) return;
    acting.value = true;
    pd.onOrder()
        .catch((e: any) => uni.showToast({ title: e?.message || t('diy.actionFailed'), icon: 'none' }))
        .finally(() => { acting.value = false; });
}

/** 复制他人方案：需登录 */
async function onCopyTap() {
    if (acting.value) return;
    if (!authStore.requireLogin('/pkg-diy/pages/plan-detail?id=' + pd.planId.value)) return;
    await act(pd.onCopy);
}

// #ifdef MP-WEIXIN
onShareAppMessage(() => ({
    title: pd.title.value || t('diy.planDetail.shareTitle'),
    path: '/pkg-diy/pages/plan-detail?id=' + pd.planId.value,
    imageUrl: pd.plan.value?.thumb || '',
}));
// #endif
</script>

<style lang="scss" scoped>
.plan-detail {
    min-height: 100vh;
    background: $bg-color;
    padding-bottom: 180rpx;

    &__preview {
        background: #fff;
        padding: 24rpx 20rpx 20rpx;
    }

    &__badges {
        display: flex;
        gap: 12rpx;
        margin-bottom: 12rpx;
    }

    &__badge {
        font-size: 20rpx;
        padding: 4rpx 16rpx;
        border-radius: 20rpx;
        background: $bg-color;
        color: $text-color-secondary;

        &--draft {
            background: #f0f0f0;
            color: #999;
        }

        &--quoted {
            background: #e6f7ff;
            color: #1890ff;
        }

        &--ordered {
            background: #f6ffed;
            color: $success-color;
        }

        &--public {
            background: $brand-color-light;
            color: $brand-color;
        }

        &--private {
            background: #fff7e6;
            color: $warning-color;
        }
    }

    &__meta {
        display: flex;
        align-items: baseline;
        gap: 16rpx;
    }

    &__title {
        flex: 1;
        font-size: 30rpx;
        font-weight: 600;
        color: $text-color;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__price {
        font-size: 36rpx;
        font-weight: 600;
        color: $price-color;
    }

    &__fit {
        margin-top: 8rpx;
        font-size: 24rpx;
        color: $text-color-secondary;
    }

    &__fit-link {
        margin-left: 12rpx;
        color: $brand-color;
    }

    &__card {
        background: #fff;
        border-radius: $radius-md;
        margin: 16rpx 20rpx;
        padding: 12rpx 24rpx;
    }

    &__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14rpx 0;
    }

    &__label {
        font-size: 26rpx;
        color: $text-color-secondary;
    }

    &__value {
        font-size: 26rpx;
        color: $text-color;
    }

    &__detail-btn {
        margin: 8rpx 0 12rpx;
        text-align: center;
        height: 72rpx;
        line-height: 72rpx;
        border-radius: $radius-md;
        background: $brand-color-light;
        color: $brand-color;
        font-size: 26rpx;
    }

    &__actions {
        background: #fff;
        border-radius: $radius-md;
        margin: 16rpx 20rpx;
        padding: 24rpx;
        display: flex;
        flex-direction: column;
        gap: 20rpx;
    }

    &__btn {
        height: 88rpx;
        line-height: 88rpx;
        text-align: center;
        border-radius: $radius-md;
        font-size: 30rpx;
        background: $bg-color;
        color: $text-color;
        border: 2rpx solid $border-color;

        &--primary {
            background: $brand-color;
            color: #fff;
            border-color: $brand-color;
        }

        &--disabled {
            opacity: 0.5;
        }

        &--busy {
            opacity: 0.7;
        }
    }
}
</style>

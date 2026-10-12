<template>
    <view class="gallery">
        <!-- 顶部标题栏 + 副文案 -->
        <view class="gallery__head">
            <text class="gallery__title">{{ t('diy.gallery.title') }}</text>
            <text class="gallery__subtitle">{{ t('diy.gallery.subtitle') }}</text>
        </view>

        <!-- 卡片流 -->
        <view v-if="items.length" class="gallery__grid">
            <view v-for="it in items" :key="it.id" class="gallery__card" @tap="goDetail(it.id)">
                <view class="gallery__beads">
                    <view
                        v-for="(cid, i) in coverIds(it)"
                        :key="i"
                        class="gallery__bead"
                        :class="{ 'gallery__bead--first': i === 0 }"
                        :style="{ background: colorOf(cid), width: sizeOf(cid) + 'rpx', height: sizeOf(cid) + 'rpx' }"
                    />
                </view>
                <text class="gallery__card-title">{{ it.title || t('diy.planDetail.shareTitle') }}</text>
                <view class="gallery__card-meta">
                    <text class="gallery__card-count">{{ it.totalCount ?? 0 }}{{ t('diy.beadCountUnit') }}</text>
                    <text class="gallery__card-price">¥{{ yuan(it.totalAmount) }}</text>
                </view>
                <view class="gallery__card-foot">
                    <text class="gallery__card-author">{{ it.authorName || t('diy.gallery.anonymous') }}</text>
                    <text class="gallery__card-date">{{ relativeDate(it.createdAt, t) }}</text>
                </view>
            </view>
        </view>

        <!-- 空态 / 加载态 -->
        <EmptyState v-if="!loading && items.length === 0" :text="t('diy.gallery.empty')" />
        <view v-if="loading" class="gallery__loading">{{ t('diy.gallery.loading') }}</view>
        <view v-else-if="items.length && !hasMore" class="gallery__no-more">{{ t('diy.gallery.noMore') }}</view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onReachBottom, onShareAppMessage } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import { getDiyGalleryPlans, getDiyMaterials } from '../../api/queries/diy';
import { materialColor, relativeDate, yuan, type DiyMaterialRow } from '../composables/useDesigner';

const TAKE = 12;

const { t, locale } = useI18n();

const items = ref<any[]>([]);
const total = ref(0);
const skip = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const materials = ref<DiyMaterialRow[]>([]);

const materialsMap = computed(() => new Map(materials.value.map(m => [m.id, m])));
const hasMore = computed(() => items.value.length < total.value);

onLoad(async () => {
    uni.setNavigationBarTitle({ title: t('diy.gallery.title') });
    await Promise.all([loadPage(0), loadMaterials()]);
});

async function loadMaterials() {
    try {
        const res: any = await getDiyMaterials();
        materials.value = (res?.diyMaterials?.items || []).map((m: any) => ({ ...m, id: String(m.id) }));
    } catch {
        materials.value = [];
    }
}

async function loadPage(nextSkip: number) {
    if (nextSkip === 0) loading.value = true;
    else loadingMore.value = true;
    try {
        const res: any = await getDiyGalleryPlans(nextSkip, TAKE);
        const page = res?.diyGalleryPlans;
        const rows = (page?.items || []).map((it: any) => ({ ...it, id: String(it.id) }));
        items.value = nextSkip === 0 ? rows : [...items.value, ...rows];
        total.value = Number(page?.total ?? items.value.length);
        skip.value = nextSkip;
    } catch {
        if (nextSkip === 0) items.value = [];
    }
    loading.value = false;
    loadingMore.value = false;
}

onReachBottom(() => {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    loadPage(skip.value + TAKE);
});

function goDetail(id: string) {
    uni.navigateTo({ url: '/pkg-diy/pages/plan-detail?id=' + id });
}

/** 封面珠串：coverMaterialIds ≤3 → 素材色小圆相切排列 */
function coverIds(it: any): string[] {
    return (it.coverMaterialIds || []).slice(0, 3).map(String).filter((id: string) => materialsMap.value.has(id));
}
function colorOf(id: string): string {
    return materialColor(materialsMap.value.get(id));
}
/** 珠径 mm → rpx（8~14mm → 64~84rpx，第一颗大一点做焦点） */
function sizeOf(id: string): number {
    const m = materialsMap.value.get(id);
    const d = m?.diameter ?? m?.axialLength ?? 8;
    return Math.round(Math.min(84, Math.max(64, d * 8)));
}

// #ifdef MP-WEIXIN
onShareAppMessage(() => ({
    title: t('diy.gallery.title'),
    path: '/pkg-diy/pages/gallery',
}));
// #endif
</script>

<style lang="scss" scoped>
.gallery {
    min-height: 100vh;
    background: $bg-color;
    padding: 0 20rpx 40rpx;

    &__head {
        padding: 24rpx 8rpx 20rpx;
    }

    &__title {
        display: block;
        font-size: 40rpx;
        font-weight: 600;
        color: $text-color;
    }

    &__subtitle {
        display: block;
        margin-top: 6rpx;
        font-size: 24rpx;
        color: $text-color-placeholder;
    }

    &__grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16rpx;
    }

    &__card {
        width: calc(50% - 8rpx);
        box-sizing: border-box;
        background: #fff;
        border-radius: $radius-md;
        padding: 20rpx;
        display: flex;
        flex-direction: column;
    }

    &__beads {
        height: 96rpx;
        display: flex;
        align-items: center;
        margin-bottom: 12rpx;
    }

    &__bead {
        border-radius: 50%;
        box-shadow: inset -4rpx -6rpx 10rpx rgba(0, 0, 0, 0.18), inset 4rpx 6rpx 10rpx rgba(255, 255, 255, 0.5);

        & + & {
            margin-left: -12rpx;
        }

        &--first {
            z-index: 1;
        }
    }

    &__card-title {
        font-size: 26rpx;
        color: $text-color;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__card-meta {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-top: 8rpx;
    }

    &__card-count {
        font-size: 22rpx;
        color: $text-color-secondary;
    }

    &__card-price {
        font-size: 28rpx;
        font-weight: 600;
        color: $price-color;
    }

    &__card-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12rpx;
        padding-top: 12rpx;
        border-top: 2rpx solid $border-color;
    }

    &__card-author {
        font-size: 22rpx;
        color: $text-color-secondary;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__card-date {
        font-size: 20rpx;
        color: $text-color-placeholder;
    }

    &__loading,
    &__no-more {
        text-align: center;
        padding: 32rpx 0;
        font-size: 24rpx;
        color: $text-color-placeholder;
    }
}
</style>

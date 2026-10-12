<template>
    <view class="my-plans">
        <!-- 状态筛选 chips -->
        <view class="my-plans__chips">
            <text
                v-for="st in statusTabs"
                :key="st"
                class="my-plans__chip"
                :class="{ 'my-plans__chip--on': statusFilter === st }"
                @tap="switchStatus(st)"
            >{{ st === 'all' ? t('diy.myPlans.all') : t('diy.status.' + st) }}</text>
        </view>

        <!-- 卡片列表 -->
        <view v-if="items.length" class="my-plans__list">
            <view v-for="it in items" :key="it.id" class="my-plans__card" @tap="goDetail(it.id)">
                <image
                    v-if="it.thumb"
                    class="my-plans__thumb"
                    :src="it.thumb"
                    mode="aspectFill"
                />
                <view v-else class="my-plans__thumb my-plans__thumb--fallback">
                    <view
                        v-for="(cid, i) in specCoverIds(it)"
                        :key="i"
                        class="my-plans__bead"
                        :style="{ background: colorOf(cid), width: beadRpx + 'rpx', height: beadRpx + 'rpx' }"
                    />
                </view>
                <view class="my-plans__info">
                    <text class="my-plans__title">{{ titleOf(it) }}</text>
                    <view class="my-plans__badges">
                        <text v-if="it.status" class="my-plans__badge" :class="'my-plans__badge--' + it.status">
                            {{ t('diy.status.' + it.status) }}
                        </text>
                        <text v-if="it.isPublic" class="my-plans__badge my-plans__badge--public">{{ t('diy.status.public') }}</text>
                        <text v-else class="my-plans__badge my-plans__badge--private">{{ t('diy.status.private') }}</text>
                    </view>
                    <view class="my-plans__meta">
                        <text class="my-plans__price">¥{{ yuan(it.bom?.totalAmount) }}</text>
                        <text class="my-plans__date">{{ relativeDate(it.createdAt) }}</text>
                    </view>
                </view>
            </view>
        </view>

        <EmptyState v-if="!loading && items.length === 0" :text="t('diy.myPlans.empty')" />
        <view v-if="loading" class="my-plans__loading">{{ t('diy.gallery.loading') }}</view>
        <view v-else-if="items.length && !hasMore" class="my-plans__no-more">{{ t('diy.gallery.noMore') }}</view>
    </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import EmptyState from '../../components/EmptyState.vue';
import { getMyDiyPlans, getDiyMaterials } from '../../api/queries/diy';
import { useAuthStore } from '../../stores/auth';
import { materialColor, relativeDate, yuan, type DiyMaterialRow } from '../composables/useDesigner';

const TAKE = 12;

const { t, locale } = useI18n();
const authStore = useAuthStore();

const items = ref<any[]>([]);
const total = ref(0);
const skip = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
/** 'all' → 不传 status */
const statusFilter = ref('all');
const materials = ref<DiyMaterialRow[]>([]);

const statusTabs = ['all', 'draft', 'quoted', 'ordered'];
const materialsMap = computed(() => new Map(materials.value.map(m => [m.id, m])));
const hasMore = computed(() => items.value.length < total.value);

onLoad(() => {
    uni.setNavigationBarTitle({ title: t('diy.myPlans') });
    loadMaterials();
});

onShow(() => {
    // 未登录引导登录后返回本页时已登录，正常刷新；未登录保持空态
    if (!authStore.isLoggedIn && !authStore.requireLogin('/pkg-diy/pages/my-plans')) return;
    refresh();
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
        const res: any = await getMyDiyPlans({
            status: statusFilter.value === 'all' ? undefined : statusFilter.value,
            skip: nextSkip,
            take: TAKE,
        });
        const page = res?.myDiyPlans;
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

function refresh() {
    loadPage(0);
}

function switchStatus(st: string) {
    if (statusFilter.value === st) return;
    statusFilter.value = st;
    refresh();
}

onPullDownRefresh(async () => {
    await loadPage(0);
    uni.stopPullDownRefresh();
});

onReachBottom(() => {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    loadPage(skip.value + TAKE);
});

function goDetail(id: string) {
    uni.navigateTo({ url: '/pkg-diy/pages/plan-detail?id=' + id });
}

/** 标题：服务端 title 缺失（DIY_PLAN_FIELDS 无 title）→ BOM 前两个素材名派生 */
function titleOf(it: any): string {
    if (it.title) return String(it.title);
    const names: string[] = [];
    for (const item of it.bom?.items || []) {
        if (item.name && !names.includes(item.name)) names.push(item.name);
        if (names.length >= 2) break;
    }
    return names.length ? names.join('') : t('diy.planDetail.shareTitle');
}

/** 无 thumb 时预览：spec.sequence / slotList 去重前 3 个素材色块 */
function specCoverIds(it: any): string[] {
    const spec = it.spec || {};
    const ids: string[] = (spec.sequence || []).map(String);
    if (!ids.length) {
        for (const s of spec.slotList || []) {
            if (s.materialId) ids.push(String(s.materialId));
        }
    }
    return [...new Set(ids)].filter(id => materialsMap.value.has(id)).slice(0, 3);
}
function colorOf(id: string): string {
    return materialColor(materialsMap.value.get(id));
}
/** 兜底预览珠径：固定 56rpx */
const beadRpx = 56;
</script>

<style lang="scss" scoped>
.my-plans {
    min-height: 100vh;
    background: $bg-color;
    padding: 0 20rpx 40rpx;

    &__chips {
        display: flex;
        gap: 12rpx;
        padding: 20rpx 8rpx;
    }

    &__chip {
        padding: 10rpx 28rpx;
        border-radius: 28rpx;
        font-size: 24rpx;
        color: $text-color-secondary;
        background: #fff;
        border: 2rpx solid $border-color;

        &--on {
            color: #fff;
            background: $brand-color;
            border-color: $brand-color;
        }
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: 16rpx;
    }

    &__card {
        background: #fff;
        border-radius: $radius-md;
        padding: 20rpx;
        display: flex;
        gap: 20rpx;
    }

    &__thumb {
        width: 160rpx;
        height: 160rpx;
        border-radius: $radius-sm;
        flex-shrink: 0;

        &--fallback {
            background: $bg-color;
            display: flex;
            align-items: center;
            justify-content: center;
        }
    }

    &__bead {
        border-radius: 50%;
        box-shadow: inset -3rpx -5rpx 8rpx rgba(0, 0, 0, 0.18), inset 3rpx 5rpx 8rpx rgba(255, 255, 255, 0.5);

        & + & {
            margin-left: -10rpx;
        }
    }

    &__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    &__title {
        font-size: 28rpx;
        color: $text-color;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    &__badges {
        display: flex;
        gap: 10rpx;
        margin-top: 10rpx;
    }

    &__badge {
        font-size: 20rpx;
        padding: 2rpx 14rpx;
        border-radius: 18rpx;
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
        justify-content: space-between;
        margin-top: auto;
    }

    &__price {
        font-size: 30rpx;
        font-weight: 600;
        color: $price-color;
    }

    &__date {
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

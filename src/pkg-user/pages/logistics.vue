<template>
    <view class="logistics-page">
        <view v-if="loading" class="logistics-page__loading">
            <LoadingSkeleton type="card" :count="2" />
        </view>
        <EmptyState v-else-if="!packages.length && !tracks.length" text="暂无物流信息" />
        <view v-else class="logistics-page__body">
            <template v-if="packages.length">
                <view v-for="pkg in packages" :key="pkg.code" class="package-card">
                    <view class="package-card__head">
                        <text class="package-card__no">包裹 {{ pkg.code }}</text>
                        <text class="package-card__status">{{ statusLabel(pkg.status) }}</text>
                    </view>
                    <view v-if="pkg.trackingNo" class="package-card__row">
                        <text class="label">运单号</text>
                        <text class="value" selectable>{{ pkg.trackingNo }}</text>
                    </view>
                    <view v-if="pkg.carrierName" class="package-card__row">
                        <text class="label">承运</text>
                        <text class="value">{{ pkg.carrierName }}</text>
                    </view>
                    <view v-if="pkg.courierName" class="package-card__row">
                        <text class="label">配送员</text>
                        <text class="value">{{ pkg.courierName }}{{ pkg.courierPhone ? ' ' + pkg.courierPhone : '' }}</text>
                    </view>
                    <view class="package-card__row">
                        <text class="label">状态</text>
                        <text class="value">{{ statusLabel(pkg.status) }}{{ pkg.deliveredAt ? ' · ' + fmtTime(pkg.deliveredAt) : '' }}</text>
                    </view>
                    <view v-if="tracksByPkg(pkg.code).length" class="track-list">
                        <view v-for="tr in tracksByPkg(pkg.code)" :key="tr.id" class="track-item">
                            <view class="track-item__dot" />
                            <view class="track-item__body">
                                <text class="track-item__info">{{ tr.trackInfo || '包裹更新' }}</text>
                                <text class="track-item__time">{{ fmtTime(tr.signedAt || tr.lastSyncedAt) }}</text>
                            </view>
                        </view>
                    </view>
                    <view v-else class="track-empty">
                        <text>暂无轨迹明细</text>
                    </view>
                </view>
            </template>
            <view v-else class="package-card">
                <view class="package-card__head">
                    <text class="package-card__no">物流轨迹</text>
                </view>
                <view class="track-list track-list--bare">
                    <view v-for="tr in tracks" :key="tr.id" class="track-item">
                        <view class="track-item__dot" />
                        <view class="track-item__body">
                            <text class="track-item__info">{{ tr.trackInfo || '包裹更新' }}</text>
                            <text class="track-item__time">{{ fmtTime(tr.signedAt || tr.lastSyncedAt) }}</text>
                        </view>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '../../components/EmptyState.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
import { getMyOrderPackages, getMyOrderTracks } from '../../api/queries/order';

interface OrderPackage { code: string; status: string; trackingNo: string | null; carrierName: string | null;
    courierName: string | null; courierPhone: string | null; deliveredAt: string | null; }
interface Track { id: string; fulfillmentId: string; trackingNo: string; status: string;
    trackInfo: string | null; signedAt: string | null; lastSyncedAt: string | null; }

const orderId = ref('');
const loading = ref(true);
const packages = ref<OrderPackage[]>([]);
const tracks = ref<Track[]>([]);

function statusLabel(s: string) {
    const map: Record<string, string> = { pending: '待发货', shipped: '运输中', delivered: '已送达', cancelled: '已取消' };
    return map[s] || s;
}
function fmtTime(v: string | null) {
    if (!v) return '';
    return String(v).replace('T', ' ').slice(0, 16);
}
// 后端 OrderPackage.trackingNo 即其关联 fulfillment 上 LogisticsTrack 的运单号
// （order-package.service 按 trackMap(fulfillmentId→track) 回填），故按 trackingNo 匹配即等效按 fulfillment 关联。
function tracksByPkg(code: string) {
    const pkg = packages.value.find((p) => p.code === code);
    if (!pkg?.trackingNo) return [];
    return tracks.value.filter((t) => t.trackingNo === pkg.trackingNo);
}

onLoad(async (opts) => {
    orderId.value = String(opts?.orderId || '');
    try {
        const [pkgs, trs] = await Promise.all([
            getMyOrderPackages(orderId.value),
            getMyOrderTracks(orderId.value).catch(() => null),
        ]);
        packages.value = (pkgs?.myOrderPackages || []) as OrderPackage[];
        tracks.value = (trs?.myOrderTracks || []) as Track[];
    } catch (e: any) {
        uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
        loading.value = false;
    }
});
</script>

<style lang="scss" scoped>
.logistics-page { min-height: 100vh; background: $bg-color; padding: 24rpx; }
.package-card { background: #fff; border-radius: $radius-md; padding: 24rpx; margin-bottom: 24rpx;
    &__head { display: flex; justify-content: space-between; margin-bottom: 16rpx; }
    &__no { font-weight: 600; }
    &__status { color: $brand-color; font-size: 24rpx; }
    &__row { display: flex; font-size: 26rpx; margin-bottom: 8rpx;
        .label { color: #999; width: 140rpx; }
        .value { color: #333; flex: 1; word-break: break-all; }
    }
}
.track-list { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid #f0f0f0; &--bare { margin-top: 0; padding-top: 0; border-top: none; } }
.track-item { display: flex; padding: 12rpx 0;
    &__dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: $brand-color; margin: 10rpx 20rpx 0 6rpx; }
    &__body { flex: 1; }
    &__info { font-size: 26rpx; color: #333; display: block; }
    &__time { font-size: 22rpx; color: #999; display: block; margin-top: 4rpx; }
}
.track-empty { padding: 20rpx 0 4rpx; text-align: center; color: #999; font-size: 24rpx; }
</style>

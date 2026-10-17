<template>
  <view class="group-join">
    <template v-if="activity">
      <!-- 状态条 + 倒计时 -->
      <view class="gj-status">
        <text class="gj-status__state" :class="'is-' + status">{{ statusText }}</text>
        <text v-if="status === 'active'" class="gj-status__time">{{ t('groupJoin.timeLeft', { t: remainingText }) }}</text>
      </view>

      <!-- 成员位（匿名占位） -->
      <view class="gj-members">
        <view class="gj-members__row">
          <view
            v-for="n in targetCount"
            :key="n"
            class="gj-members__cell"
            :class="{ filled: n <= currentCount }"
          >
            <text class="gj-members__icon">{{ n <= currentCount ? '👤' : '+' }}</text>
          </view>
        </view>
        <text class="gj-members__joined">{{ t('groupJoin.joined', { m: currentCount, n: targetCount }) }}</text>
        <text v-if="lackCount > 0" class="gj-members__lack">{{ t('groupJoin.needMore', { n: lackCount }) }}</text>
      </view>

      <!-- 商品卡 -->
      <view v-if="product" class="gj-product">
        <VImage :src="product.featuredAsset?.preview || ''" width="160rpx" height="160rpx" class="gj-product__img" />
        <view class="gj-product__main">
          <text class="gj-product__name">{{ product.name }}</text>
          <view class="gj-product__prices">
            <text class="gj-product__group">¥{{ priceText }}</text>
            <text v-if="originPriceText" class="gj-product__origin">¥{{ originPriceText }}</text>
          </view>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="gj-actions">
        <button class="gj-actions__secondary" @click="showStrategy = true">{{ t('groupJoin.strategy') }}</button>
        <button class="gj-actions__primary" :disabled="status !== 'active'" @click="onJoin">
          {{ t('groupJoin.join') }} ¥{{ priceText }}
        </button>
      </view>
    </template>

    <!-- 活动不存在/已结束 -->
    <EmptyState v-else-if="notFound" :text="t('groupJoin.notFound')" />

    <!-- 拼团攻略弹层 -->
    <view v-if="showStrategy" class="gj-mask" @click="showStrategy = false">
      <view class="gj-sheet" @click.stop>
        <text class="gj-sheet__title">{{ t('groupJoin.strategy') }}</text>
        <text class="gj-sheet__body">{{ t('groupJoin.strategyBody') }}</text>
        <button class="gj-sheet__btn" @click="showStrategy = false">{{ t('common.confirm') }}</button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad } from '@dcloudio/uni-app';
import { getGroupBuyActivityById } from '../../api/queries/promotion';
import { getProductsByIds } from '../../api/queries/product';
import { getActiveOrder } from '../../api/queries/order';
import { addItemToOrder } from '../../api/mutations/cart';
import { getGraphQLClient } from '../../api/client';
import { useUIStore } from '../../stores/ui';
import { useAuthStore } from '../../stores/auth';
import EmptyState from '../../components/EmptyState.vue';
import VImage from '../../components/VImage.vue';
import { useShare } from '../../composables/useShare';
import { formatRemaining } from './group-join/utils';

const { t } = useI18n();
const ui = useUIStore();
const auth = useAuthStore();

let activityId = '';
const activity = ref<any>(null);
const product = ref<any>(null);
const notFound = ref(false);
const showStrategy = ref(false);
const nowTick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const status = computed(() => activity.value?.status || 'active');
const statusText = computed(() => {
    // 活动状态枚举：active | completed | expired（GroupBuyActivity.status）
    if (status.value === 'completed') return t('groupJoin.success');
    if (status.value === 'expired') return t('groupJoin.failed');
    return t('groupJoin.ongoing');
});
const remainingText = computed(() => {
    const end = Date.parse(activity.value?.endAt);
    if (!Number.isFinite(end)) return '--:--:--';
    return formatRemaining(end - nowTick.value);
});
const targetCount = computed(() => Math.max(0, Number(activity.value?.targetCount) || 0));
const currentCount = computed(() => Math.max(0, Number(activity.value?.currentCount) || 0));
const lackCount = computed(() => Math.max(0, targetCount.value - currentCount.value));
const priceText = computed(() => {
    const p = activity.value?.groupPrice;
    return Number.isFinite(p) ? (p / 100).toFixed(2) : '--';
});
const originPriceText = computed(() => {
    const v = (product.value?.variants || []).find((x: any) => String(x.id) === String(activity.value?.variantId));
    const p = v?.priceWithTax;
    return Number.isFinite(p) && p > activity.value?.groupPrice ? (p / 100).toFixed(2) : '';
});

function buildSharePath(): string {
    let p = `/pkg-promotion/pages/group-join?activityId=${activityId}`;
    if (auth.inviteCode) p += `&ref=${encodeURIComponent(auth.inviteCode)}`;
    return p;
}

// 传可变对象：onLoad 拿到邀请码、商品加载后原位更新，分享回调读取的是同一引用（MP 分享时机在页面就绪后）
const shareOpts: { title: string; path: string; imageUrl: string } = {
    title: t('promotion.shareTitle'),
    path: buildSharePath(),
    imageUrl: '',
};
useShare(shareOpts);

async function load() {
    if (!activityId) { notFound.value = true; return; }
    try {
        const a: any = await getGroupBuyActivityById(activityId);
        if (!a) { notFound.value = true; return; }
        activity.value = a;
        if (a.productId) {
            try {
                const products: any[] = await getProductsByIds([String(a.productId)]);
                product.value = products[0] || null;
            } catch (e) { product.value = null; }
        }
        if (product.value) {
            shareOpts.title = `${product.value.name} · ¥${priceText.value}`;
            shareOpts.imageUrl = product.value.featuredAsset?.preview || '';
        }
        shareOpts.path = buildSharePath();
    } catch (e) {
        notFound.value = true;
    }
}

onLoad((options: any) => {
    activityId = String(options?.activityId || '');
    // 邀请码：q=拼单链接参数（ref 兼容 H5/App 启动参数拼法），落 authStore（同 App.vue 对 ref 的处理）
    const code = String(options?.q || options?.ref || '');
    if (code) auth.setInviteCode(code);
    load();
});

onMounted(() => {
    timer = setInterval(() => { nowTick.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

async function onJoin() {
    if (!activity.value || status.value !== 'active') return;
    if (!auth.requireLogin('/pkg-promotion/pages/group-join?activityId=' + activityId)) return;
    try {
        // 1) 先确保存在 activeOrder，2) 加购该活动商品，3) 再调用 joinGroupBuy（与 group-buy.vue 参团模式一致）
        const order0: any = await getActiveOrder();
        let orderId = order0?.activeOrder?.id;
        if (!orderId) {
            throw new Error(t('promotion.cartUnavailable'));
        }
        if (activity.value.variantId) {
            await addItemToOrder(String(activity.value.variantId), 1);
        }
        const after: any = await getActiveOrder();
        orderId = after?.activeOrder?.id || orderId;

        const client = getGraphQLClient();
        const res: any = await client.request(
            `mutation($activityId:ID!,$orderId:ID!,$isLeader:Boolean!) { joinGroupBuy(activityId:$activityId,orderId:$orderId,isLeader:$isLeader) { id status } }`,
            { activityId: activity.value.id, orderId, isLeader: false },
        );
        if (res?.joinGroupBuy?.id) {
            ui.showToast(t('promotion.joinSuccess'), 'success');
            uni.navigateTo({ url: '/pkg-order/pages/checkout' });
        } else {
            ui.showToast(t('promotion.joinFailed'));
        }
    } catch (e: any) {
        ui.showToast(e.message);
    }
}
</script>
<style lang="scss" scoped>
.group-join { padding: 20rpx; padding-bottom: 180rpx; }
.gj-status {
    display: flex; align-items: center; justify-content: space-between;
    background: #fff; border-radius: $radius-md; padding: 24rpx 20rpx; margin-bottom: 16rpx;
    &__state { font-size: 30rpx; font-weight: bold; color: $price-color;
        &.is-completed { color: $brand-color; }
        &.is-expired { color: #999; }
    }
    &__time { font-size: 26rpx; color: $text-color-secondary; }
}
.gj-members {
    display: flex; flex-direction: column; align-items: center; gap: 16rpx;
    background: #fff; border-radius: $radius-md; padding: 48rpx 20rpx; margin-bottom: 16rpx;
    &__row { display: flex; flex-wrap: wrap; justify-content: center; gap: 20rpx; }
    &__cell {
        width: 88rpx; height: 88rpx; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 2rpx dashed $border-color; color: #ccc; font-size: 40rpx;
        &.filled { border: none; background: $brand-color-light; }
    }
    &__icon { font-size: 40rpx; }
    &__joined { font-size: 28rpx; font-weight: bold; color: $text-color; }
    &__lack { font-size: 24rpx; color: $text-color-secondary; }
}
.gj-product {
    display: flex; gap: 16rpx; background: #fff; border-radius: $radius-md; padding: 20rpx;
    &__img { border-radius: $radius-sm; flex-shrink: 0; }
    &__main { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__name { font-size: 28rpx; font-weight: bold; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__prices { display: flex; align-items: baseline; gap: 12rpx; margin-top: auto; }
    &__group { font-size: 34rpx; color: $price-color; font-weight: bold; }
    &__origin { font-size: 22rpx; color: #999; text-decoration: line-through; }
}
.gj-actions {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; gap: 20rpx; padding: 20rpx; background: #fff; box-shadow: $shadow;
    &__secondary { flex: 1; background: #fff; color: $brand-color; border: 1rpx solid $brand-color; border-radius: $radius-md; height: 80rpx; line-height: 76rpx; font-size: 28rpx; }
    &__primary { flex: 2; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 80rpx; line-height: 80rpx; font-size: 28rpx;
        &[disabled] { opacity: 0.5; color: #fff; background: $brand-color; }
    }
}
.gj-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.gj-sheet {
    background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 30rpx;
    display: flex; flex-direction: column; gap: 24rpx;
    &__title { font-size: 32rpx; font-weight: bold; text-align: center; }
    &__body { font-size: 26rpx; color: $text-color-secondary; line-height: 1.6; }
    &__btn { background: $brand-color; color: #fff; border: none; border-radius: $radius-md; height: 80rpx; line-height: 80rpx; font-size: 28rpx; }
}
</style>

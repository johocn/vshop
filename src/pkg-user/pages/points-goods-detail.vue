<template>
  <view class="pgd-page" v-if="product">
    <!-- 头图 -->
    <view class="pgd-page__hero">
      <VImage :src="product.image" height="750rpx" />
    </view>

    <!-- 价格区 -->
    <view class="pgd-price">
      <view class="pgd-price__row">
        <text class="pgd-price__points">{{ product.pointsPrice }}<text class="pgd-price__unit">{{ t('pointsGoods.pointsUnit') }}</text></text>
        <text v-if="product.cashPrice > 0" class="pgd-price__cash">+¥{{ (product.cashPrice / 100).toFixed(2) }}</text>
        <text v-if="showMarketPrice" class="pgd-price__market">{{ t('pointsGoods.marketPrice') }} ¥{{ (product.priceWithTax / 100).toFixed(2) }}</text>
      </view>
      <text class="pgd-price__redeemed">{{ t('pointsGoods.redeemedCount', { n: product.redeemedCount }) }}</text>
    </view>

    <!-- 标题与权益标签 -->
    <view class="pgd-title">
      <text class="pgd-title__name">{{ product.name }}</text>
      <view class="pgd-title__tags">
        <text class="pgd-title__tag" :class="product.deliveryType === 'virtual' ? 'pgd-title__tag--virtual' : 'pgd-title__tag--physical'">
          {{ product.deliveryType === 'virtual' ? t('pointsGoods.virtualTag') : t('pointsGoods.physicalTag') }}
        </text>
      </view>
    </view>

    <!-- 兑换说明 -->
    <view class="pgd-notes">
      <view class="pgd-notes__title">{{ t('pointsGoods.exchangeNotes') }}</view>
      <view class="pgd-notes__row"><text class="pgd-notes__label">{{ t('pointsGoods.stockText') }}</text><text class="pgd-notes__value">{{ product.stock }}</text></view>
      <view class="pgd-notes__row" v-if="product.perUserLimit > 0">
        <text class="pgd-notes__label">{{ t('pointsGoods.limitText') }}</text>
        <text class="pgd-notes__value">{{ t('pointsGoods.limitQty', { n: product.perUserLimit }) }}</text>
      </view>
      <view class="pgd-notes__row" v-if="product.validTo">
        <text class="pgd-notes__label">{{ product.deliveryType === 'virtual' ? t('pointsGoods.virtualValidLabel') : t('pointsGoods.validLabel') }}</text>
        <text class="pgd-notes__value">{{ fmtDate(product.validTo) }}</text>
      </view>
    </view>

    <view class="pgd-page__placeholder" />

    <!-- 底部操作栏 -->
    <view class="pgd-bar">
      <view class="bar-ico" @click="onToggleFavorite">
        <text class="bar-ico__g" :class="{ 'bar-ico__g--fav': isFav }">{{ isFav ? '♥' : '♡' }}</text>
        <text class="bar-ico__t">{{ t('pointsGoods.favoriteCount', { n: favCount }) }}</text>
      </view>
      <button class="pgd-bar__btn" :class="{ 'pgd-bar__btn--disabled': !product.inStock }" @click="goConfirm">
        {{ product.inStock ? t('pointsGoods.exchangeNow') : t('pointsGoods.soldOut') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad } from '@dcloudio/uni-app';
import { getMyMemberInfo } from '../../api/queries/member';
import { getPointsProduct, getProductFavoriteMeta, toggleProductFavorite } from '../../api/queries/points-mall';
import VImage from '../../components/VImage.vue';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUIStore();

const id = ref('');
const product = ref<any>(null);
const isFav = ref(false);
const favCount = ref(0);
const memberRate = ref(1000);

/** 市场参考价：仅当 priceWithTax 高于「积分按价值率折算 + 现金」组合价时展示 */
const showMarketPrice = computed(() => {
    const p = product.value;
    if (!p?.priceWithTax) return false;
    const rate = memberRate.value > 0 ? memberRate.value : 1000;
    const combined = p.pointsPrice * (rate / 1000) + (p.cashPrice || 0);
    return p.priceWithTax > combined;
});

onLoad((options: any) => {
    id.value = String(options?.id || '');
});

onMounted(async () => {
    if (!id.value) return;
    try {
        const r: any = await getPointsProduct(id.value);
        product.value = r?.pointsProduct || null;
    } catch (e: any) {
        ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.loadFailed'), 'error');
        return;
    }
    if (product.value) {
        loadFavoriteMeta();
        loadMemberRate();
    }
});

/** 收藏元信息（productId 为底层商品 id，游客可查，静默降级） */
async function loadFavoriteMeta() {
    try {
        const r: any = await getProductFavoriteMeta(String(product.value.productId));
        favCount.value = r?.productFavoriteMeta?.favoriteCount ?? 0;
        isFav.value = !!r?.productFavoriteMeta?.myFavorited;
    } catch (e) { /* 静默 */ }
}

/** 积分价值率（redeemDiscountRate，1000=1积分抵1分），用于市场参考价比较 */
async function loadMemberRate() {
    try {
        const r: any = await getMyMemberInfo();
        const rate = Number(r?.myMemberInfo?.redeemDiscountRate);
        if (Number.isFinite(rate) && rate > 0) memberRate.value = rate;
    } catch (e) { /* 未登录/失败用默认 1000 */ }
}

async function onToggleFavorite() {
    if (!auth.isLoggedIn) {
        ui.showToast(t('pointsGoods.loginFirst'));
        uni.navigateTo({ url: '/pages/login/index' });
        return;
    }
    const pid = String(product.value?.productId || '');
    if (!pid) return;
    const next = !isFav.value;
    // 乐观更新，失败回滚
    isFav.value = next;
    favCount.value = Math.max(0, favCount.value + (next ? 1 : -1));
    try {
        const r: any = await toggleProductFavorite(pid);
        isFav.value = !!r?.toggleProductFavorite?.favorited;
        favCount.value = r?.toggleProductFavorite?.favoriteCount ?? favCount.value;
        ui.showToast(next ? t('pointsGoods.favoriteSuccess') : t('pointsGoods.favoriteRemoved'), 'success');
    } catch (e: any) {
        isFav.value = !next;
        favCount.value = Math.max(0, favCount.value + (next ? -1 : 1));
        ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.operationFailed'), 'error');
    }
}

function goConfirm() {
    if (!product.value?.inStock) {
        ui.showToast(t('pointsGoods.soldOut'));
        return;
    }
    uni.navigateTo({ url: '/pkg-user/pages/points-goods-confirm?id=' + id.value });
}

function fmtDate(s: string): string {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
</script>

<style lang="scss" scoped>
.pgd-page {
    min-height: 100vh;
    background: $bg-color;
    padding-bottom: 140rpx;
    &__hero { background: #fff; }
    &__placeholder { height: 20rpx; }
}
.pgd-price {
    background: #fff;
    padding: 24rpx 30rpx;
    margin-bottom: 16rpx;
    &__row { display: flex; align-items: baseline; flex-wrap: wrap; }
    &__points { font-size: 48rpx; font-weight: bold; color: $brand-color; }
    &__unit { font-size: 24rpx; font-weight: normal; margin-left: 4rpx; }
    &__cash { font-size: 32rpx; font-weight: bold; color: $brand-color; margin-left: 12rpx; }
    &__market { font-size: 24rpx; color: #999; text-decoration: line-through; margin-left: 16rpx; }
    &__redeemed { display: block; font-size: 22rpx; color: #999; margin-top: 8rpx; }
}
.pgd-title {
    background: #fff;
    padding: 24rpx 30rpx;
    margin-bottom: 16rpx;
    &__name { font-size: 32rpx; font-weight: bold; color: $text-color; display: block; }
    &__tags { margin-top: 14rpx; display: flex; }
    &__tag { font-size: 22rpx; padding: 6rpx 18rpx; border-radius: $radius-sm;
        &--virtual { background: #e6f7f5; color: #00b8a9; }
        &--physical { background: #e8f1ff; color: #3a7afe; } }
}
.pgd-notes {
    background: #fff;
    padding: 24rpx 30rpx;
    &__title { font-size: 28rpx; font-weight: bold; margin-bottom: 16rpx; }
    &__row { display: flex; justify-content: space-between; font-size: 26rpx; padding: 10rpx 0; }
    &__label { color: #999; }
    &__value { color: $text-color; }
}
.pgd-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fff;
    display: flex;
    align-items: center;
    padding: 16rpx 30rpx calc(16rpx + env(safe-area-inset-bottom));
    box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, .06);
    &__btn {
        flex: 1;
        margin-left: 20rpx;
        background: $brand-color;
        color: #fff;
        font-size: 30rpx;
        height: 84rpx;
        line-height: 84rpx;
        border-radius: 42rpx;
        border: none;
        &--disabled { background: #ccc; }
    }
}
.bar-ico {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 120rpx;
    &__g { font-size: 36rpx; color: $text-color-secondary;
        &--fav { color: #ff4d4f; } }
    &__t { font-size: 20rpx; color: $text-color-secondary; margin-top: 4rpx; }
}
</style>

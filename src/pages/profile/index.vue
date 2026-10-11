<template>
  <view class="profile-page">
    <view class="profile-page__header">
      <text class="profile-page__name">{{ customer?.firstName || t('profile.defaultName') }} {{ customer?.lastName || '' }}</text>
      <text class="profile-page__email">{{ customer?.emailAddress || '' }}</text>
    </view>
    <view class="profile-page__menu">
      <view class="menu-item" @click="navTo('/pkg-order/pages/orders')">
        <text>{{ t('profile.myOrders') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/addresses')">
        <text>{{ t('profile.addressManagement') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/recharge')">
        <text>{{ t('nav.recharge') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/balance-history')">
        <text>{{ t('profile.balanceHistory') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/withdraw')">
        <text>{{ t('nav.withdraw') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-after-sale/pages/list')">
        <text>{{ t('profile.afterSaleRecords') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-promotion/pages/coupons')">
        <text>{{ t('profile.coupons') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/distribution')">
        <text>{{ t('profile.distributionCenter') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-circle/pages/feed')">
        <text>{{ t('nav.circleFeed') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/lottery')">
        <text>{{ t('nav.lottery') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/faq')">
        <text>{{ t('nav.faq') }}</text><text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/feedback')">
        <text>{{ t('nav.feedback') }}</text><text class="menu-arrow">></text>
      </view>
    </view>
    <button class="profile-page__logout" @click="doLogout">{{ t('profile.logout') }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { logout } from '../../api/mutations/auth';

const { t } = useI18n();
const authStore = useAuthStore();
const cartStore = useCartStore();
const customer = ref<any>(null);

onMounted(async () => {
    try { const res: any = await getActiveCustomer(); customer.value = res.activeCustomer; } catch (e) {}
});

function navTo(url: string) { uni.navigateTo({ url }); }

async function doLogout() {
    try { await logout(); } catch (e) {}
    authStore.logout();
    cartStore.clearCart();
    uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
.profile-page {
    min-height: 100vh; background: $bg-color;
    &__header {
        background: $brand-color; color: #fff; padding: 60rpx 30rpx;
    }
    &__name { font-size: 36rpx; font-weight: bold; display: block; }
    &__email { font-size: 26rpx; opacity: 0.8; margin-top: 8rpx; display: block; }
    &__menu { background: #fff; margin: 20rpx; border-radius: $radius-md; }
    &__logout {
        margin: 40rpx 20rpx; background: #fff; color: #999;
        border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 28rpx;
    }
}
.menu-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx;
}
.menu-arrow { color: #ccc; }
</style>

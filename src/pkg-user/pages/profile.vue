<template>
  <view class="profile-page">
    <view class="profile-page__header">
      <text class="profile-page__name">{{ customer?.firstName || '用户' }} {{ customer?.lastName }}</text>
      <text class="profile-page__email">{{ customer?.emailAddress }}</text>
    </view>
    <view class="profile-page__menu">
      <view class="menu-item" @click="navTo('/pkg-order/pages/orders')"><text>我的订单</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/addresses')"><text>地址管理</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/recharge')"><text>我的钱包</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/balance-history')"><text>余额明细</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-after-sale/pages/list')"><text>售后记录</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-promotion/pages/coupons')"><text>优惠券</text><text>></text></view>
      <view class="menu-item" @click="navTo('/pkg-user/pages/distribution')"><text>分销中心</text><text>></text></view>
    </view>
    <button class="profile-page__logout" @click="doLogout">退出登录</button>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { logout } from '../../api/mutations/auth';
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
.profile-page { min-height: 100vh; background: $bg-color;
    &__header { background: $brand-color; color: #fff; padding: 60rpx 30rpx; & .profile-page__name { font-size: 36rpx; font-weight: bold; display: block; } & .profile-page__email { font-size: 26rpx; opacity: 0.8; } }
    &__menu { background: #fff; margin: 20rpx; border-radius: $radius-md; }
    &__logout { margin: 40rpx 20rpx; background: #fff; color: #999; border: 1rpx solid $border-color; border-radius: $radius-md; height: 88rpx; font-size: 28rpx; }
}
.menu-item { display: flex; justify-content: space-between; padding: 30rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; }
</style>
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
        <view class="menu-item__label">
          <text>{{ t('nav.feedback') }}</text>
          <view v-if="fbUnread > 0" class="fb-badge">{{ fbUnread > 99 ? '99+' : fbUnread }}</view>
        </view>
        <text class="menu-arrow">></text>
      </view>
      <view class="menu-item" @click="chooseLanguage">
        <text>{{ t('profile.language') }}</text><text class="menu-lang">{{ currentLangLabel }}</text>
      </view>
    </view>
    <button class="profile-page__logout" @click="doLogout">{{ t('profile.logout') }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useI18n } from 'vue-i18n';
import { getActiveCustomer } from '../../api/queries/user';
import { getUnreadFeedbackCount } from '../../api/queries/feedback';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { logout } from '../../api/mutations/auth';
import { setAppLocale } from '../../i18n/nav-titles';

const { t, locale } = useI18n();
const authStore = useAuthStore();
const cartStore = useCartStore();
const customer = ref<any>(null);
/** 意见反馈未读数（登录态 onShow 拉取；未登录/失败静默 0） */
const fbUnread = ref(0);

/** 拉取意见反馈未读数（失败/未登录静默 0） */
async function fetchUnread() {
    try {
        const r: any = await getUnreadFeedbackCount();
        fbUnread.value = r?.unreadFeedbackCount || 0;
    } catch (e) {
        fbUnread.value = 0;
    }
}

onShow(() => {
    if (authStore.isLoggedIn) {
        fetchUnread();
    } else {
        fbUnread.value = 0;
    }
});

// 冷启动竞态兜底：uni-app 不等 App.onLaunch（async initTenant+restoreSession）结束就触发页面 onShow，
// onShow 可能先以未登录态返回；登录态就绪翻转时补拉一次，保证冷启动直进「我的」也能看到角标
watch(() => authStore.isLoggedIn, (v) => { if (v) fetchUnread(); });

// 语言原生名（各语言下展示一致，不随界面语言翻译，故不入语言包）
const LOCALE_OPTIONS = [
    { locale: 'zh-CN', label: '简体中文' },
    { locale: 'zh-TW', label: '繁體中文' },
    { locale: 'en', label: 'English' },
    { locale: 'ja', label: '日本語' },
    { locale: 'ko', label: '한국어' },
];
const currentLocale = computed(() => String(locale.value));
const currentLangLabel = computed(() => LOCALE_OPTIONS.find((o) => o.locale === currentLocale.value)?.label || currentLocale.value);

function chooseLanguage() {
    uni.showActionSheet({
        itemList: LOCALE_OPTIONS.map((o) => o.label),
        success: (res) => {
            const opt = res.tapIndex != null ? LOCALE_OPTIONS[res.tapIndex] : undefined;
            if (!opt || opt.locale === currentLocale.value) return;
            setAppLocale(opt.locale);
            uni.showToast({ title: t('profile.languageSwitched'), icon: 'none' });
        },
    });
}

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
.menu-item__label { position: relative; display: inline-flex; align-items: center; }
.fb-badge {
    position: absolute; top: -14rpx; right: -26rpx;
    min-width: 32rpx; height: 32rpx; border-radius: 999rpx;
    background: #e5484d; color: #fff; font-size: 20rpx; line-height: 32rpx;
    text-align: center; padding: 0 6rpx;
}
.menu-arrow { color: #ccc; }
.menu-lang { color: #999; }
</style>

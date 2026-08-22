<template>
  <view class="invite-page">
    <view class="invite-hero">
      <image v-if="avatar" class="invite-avatar" :src="avatar" mode="aspectFill" />
      <view v-else class="invite-avatar invite-avatar--fallback">{{ inviterName.charAt(0) }}</view>
      <text class="invite-title">{{ inviterName }} 邀你一起逛商城</text>
      <text v-if="inviteCode" class="invite-code">推荐码：{{ inviteCode }}</text>
    </view>

    <view class="invite-actions">
      <button class="invite-btn" @click="goShopping">进商城逛逛</button>
      <text v-if="!isLoggedIn" class="invite-login" @click="goLogin">登录后绑定推荐关系</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/auth';
import { useTenantStore } from '../../stores/tenant';
import { parseAndBindRef } from '../../utils/ref';

const authStore = useAuthStore();
const tenantStore = useTenantStore();
const inviteCode = ref('');
const isLoggedIn = computed(() => authStore.isLoggedIn);

const inviterName = computed(() => tenantStore.tenantName || '好友');
const avatar = computed(() => ''); // 如需展示邀请人头像，可后续经 ref 反查；本期先用首字

function goShopping() {
    // 首页是 tabBar 页（pages.json tabBar.list[0].pagePath = pages/home/index），须用 switchTab
    uni.switchTab({ url: '/pages/home/index' });
}

function goLogin() {
    // 复用 authStore.requireLogin：未登录时跳转登录页并记住当前落地页，登录后被 tryUpdateReferredBy 落库
    authStore.requireLogin('/pages/landing/invite?ref=' + encodeURIComponent(inviteCode.value || ''));
}

onLoad(async (options) => {
    const ref = options?.ref ?? '';
    inviteCode.value = await parseAndBindRef(ref as string);
});
</script>

<style scoped>
.invite-page{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:60rpx 40rpx;background:linear-gradient(180deg,#fff 0%,#f6f7fb 100%);}
.invite-hero{display:flex;flex-direction:column;align-items:center;margin-bottom:80rpx;}
.invite-avatar{width:160rpx;height:160rpx;border-radius:50%;background:#e8ecf2;margin-bottom:24rpx;}
.invite-avatar--fallback{display:flex;align-items:center;justify-content:center;font-size:56rpx;color:#fff;background:#ff7d00;}
.invite-title{font-size:36rpx;font-weight:600;color:#1a1a1a;}
.invite-code{margin-top:16rpx;font-size:26rpx;color:#999;background:#f1f1f5;padding:6rpx 24rpx;border-radius:999rpx;}
.invite-actions{width:100%;display:flex;flex-direction:column;align-items:center;}
.invite-btn{width:100%;height:88rpx;line-height:88rpx;background:linear-gradient(90deg,#ff7d00,#ff5c00);color:#fff;border-radius:999rpx;font-size:32rpx;}
.invite-login{margin-top:32rpx;font-size:26rpx;color:#666;text-decoration:underline;}
</style>
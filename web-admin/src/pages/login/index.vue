<template>
  <view class="login">
    <view class="brand">
      <view class="dot" />
      <text class="t1">vshop 管理后台</text>
      <text class="t2">店铺经营 · 一部手机搞定</text>
    </view>
    <view class="card">
      <input v-model="username" class="field" placeholder="账号" />
      <input v-model="password" class="field" :password="!showPwd" placeholder="密码" @confirm="doLogin" />
      <view class="opt"><text @tap="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}密码</text></view>
      <button class="btn" :disabled="loading" @tap="doLogin">{{ loading ? '登录中…' : '登 录' }}</button>
      <view v-if="err" class="err">{{ err }}</view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();
const username = ref('');
const password = ref('');
const showPwd = ref(false);
const loading = ref(false);
const err = ref('');

async function doLogin() {
  err.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    // 保留上次店铺；无则进入选店
    if (tenant.token) {
      uni.redirectTo({ url: '/pages/dashboard/index' });
    } else {
      uni.redirectTo({ url: '/pages/channel-select/index' });
    }
  } catch (e: any) {
    err.value = (e?.response?.errors?.[0]?.message) || '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.login { min-height: 100vh; background: $wa-bg; padding: 120rpx 48rpx; box-sizing: border-box; }
.brand { display: flex; flex-direction: column; align-items: center; margin-bottom: 80rpx;
  .dot { width: 72rpx; height: 72rpx; border-radius: 18rpx; background: $wa-accent; margin-bottom: 24rpx; }
  .t1 { font-size: 44rpx; font-weight: 700; color: $wa-ink; }
  .t2 { font-size: 24rpx; color: $wa-muted; margin-top: 8rpx; }
}
.card { background: $wa-card; border-radius: 24rpx; padding: 40rpx 32rpx; box-shadow: 0 8rpx 30rpx rgba(0,0,0,.06);
  .field { height: 92rpx; border: 1rpx solid $wa-rule; border-radius: $wa-radius; padding: 0 24rpx; margin-bottom: 24rpx; font-size: 30rpx; }
  .opt { text-align: right; font-size: 24rpx; color: $wa-muted; padding-bottom: 16rpx; }
  .btn { height: 92rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius; font-size: 32rpx; font-weight: 600; margin-top: 8rpx; }
  .btn[disabled] { opacity: .6; }
  .err { color: $wa-danger; font-size: 26rpx; margin-top: 16rpx; text-align: center; }
}
</style>

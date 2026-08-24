<template>
  <view class="pick">
    <view class="title">选择要经营的店铺</view>
    <view class="item" v-for="c in auth.channels" :key="c.id" @tap="pick(c)">
      <view class="row">
        <text class="code">{{ c.code }}</text>
        <text class="go">›</text>
      </view>
      <text class="hint">endpoint token 由后端 Channel 提供，列表来自当前账号权限</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();

async function pick(c: { id: string; code: string; token: string }) {
  tenant.selectCh(c, c.code);
  // 按所选店铺限定权限后进入（避免跨店铺权限并集导致菜单错显）
  await auth.loadAccess(c.id);
  uni.redirectTo({ url: '/pages/dashboard/index' });
}
</script>

<style lang="scss" scoped>
.pick { min-height: 100vh; background: $wa-bg; padding: 60rpx 48rpx;
  .title { font-size: 40rpx; font-weight: 700; margin-bottom: 32rpx; }
  .item { background: $wa-card; border-radius: 20rpx; padding: 32rpx; margin-bottom: 20rpx;
    .row { display: flex; justify-content: space-between; align-items: center;
      .code { font-size: 34rpx; font-weight: 600; }
      .go { color: $wa-muted; font-size: 40rpx; }
    }
    .hint { font-size: 22rpx; color: $wa-muted; margin-top: 8rpx; display: block; }
  }
}
</style>

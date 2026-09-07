<template>
  <view class="pick">
    <view class="title">选择要经营的店铺</view>
    <view
      class="item"
      :class="{ off: c.enabled === false }"
      v-for="c in auth.channels"
      :key="c.id"
      @tap="c.enabled === false ? void 0 : pick(c)"
    >
      <view class="row">
        <view class="lt">
          <text class="name">{{ c.name || c.code }}</text>
          <text class="off-tag" v-if="c.enabled === false">已停用</text>
        </view>
        <text class="go">›</text>
      </view>
      <view class="sub">
        <text class="code">{{ c.code }}</text>
        <text class="no" v-if="c.tenantNo != null">#{{ c.tenantNo }}</text>
        <text class="tag official" v-if="c.isOfficial">官方自营</text>
        <text class="tag third" v-else>第三方</text>
      </view>
    </view>
    <view v-if="!auth.channels.length" class="empty">暂无可用店铺</view>
  </view>
</template>

<script lang="ts" setup>
import { onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../stores/authStore';
import { useTenantStore } from '../../stores/tenantStore';

const auth = useAuthStore();
const tenant = useTenantStore();

// 返回用户（带登录态深链/刷新/返回本页）时店铺列表为空，需重新加载；登录流程已填充则跳过
onShow(() => {
  if (!auth.channels.length) {
    auth.loadAccess().catch(() => {});
  }
});

async function pick(c: { id: string; code: string; token: string; name?: string }) {
  tenant.selectCh(c, c.name || c.code);
  // 按所选店铺限定权限后进入（避免跨店铺权限并集导致菜单错显）
  await auth.loadAccess(c.id);
  uni.redirectTo({ url: '/pages/dashboard/index' });
}
</script>

<style lang="scss" scoped>
.pick { min-height: 100vh; background: $wa-bg; padding: 60rpx 48rpx;
  .title { font-size: 40rpx; font-weight: 700; margin-bottom: 32rpx; }
  .item { background: $wa-card; border-radius: 20rpx; padding: 32rpx; margin-bottom: 20rpx; opacity: 1;
    &.off { opacity: .55; }
    .row { display: flex; justify-content: space-between; align-items: center;
      .lt { display: flex; align-items: center; gap: 16rpx;
        .name { font-size: 34rpx; font-weight: 600; }
        .off-tag { font-size: 20rpx; color: #fff; background: #e64340; border-radius: 999rpx; padding: 2rpx 14rpx; }
      }
      .go { color: $wa-muted; font-size: 40rpx; }
    }
    .sub { display: flex; align-items: center; margin-top: 10rpx; gap: 12rpx;
      .code { font-size: 22rpx; color: $wa-muted; }
      .no { font-size: 22rpx; color: $wa-muted; }
      .tag { font-size: 20rpx; padding: 0 12rpx; border-radius: 999rpx; }
      .official { background: #f0f5ff; color: #2f6bff; }
      .third { background: #f6ffed; color: #52c41a; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
<template>
  <view>
    <view v-if="show" class="mask" @tap="$emit('close')" />
    <view v-if="show" class="drawer">
      <view class="head">
        <text class="store">{{ tenant.name || tenant.code || '未选店铺' }}</text>
        <text class="switch" @tap="switchStore">切换店铺 ›</text>
      </view>
      <scroll-view scroll-y class="body">
        <view class="group" v-for="g in shownGroups" :key="g.domain">
          <view class="g-band">
            <view class="band" :style="{ background: g.color }" />
            <text class="g-title">{{ g.domain }}</text>
          </view>
          <view class="tags">
            <text v-for="it in g.items" :key="it.label" class="tag"
              :style="tierStyle(g.color, g.grad, it.tier)" @tap="go(it)">{{ it.label }}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import { useTenantStore } from '../stores/tenantStore';
import { useAuthStore } from '../stores/authStore';
import { D, tierStyle } from '../theme';
const emit = defineEmits(['close']);
const tenant = useTenantStore();
const auth = useAuthStore();
defineProps<{ show: boolean }>();

const groups = [
  { domain: '商品', color: D.d1.main, grad: D.d1.grad, items: [
    { label: '分类', url: '/pages/product/categories/index', tier: 1 },
    { label: '＋新增商品', url: '/pages/product/create/index', tier: 1 },
    { label: '商品列表', url: '/pages/product/list/index', tier: 1 },
    { label: '库存预警', url: '/pages/inventory/stock/index', tier: 2 },
    { label: '图片库', url: '/pages/media/library/index', tier: 3 },
  ]},
  { domain: '交易', color: D.d2.main, grad: D.d2.grad, items: [
    { label: '订单', url: '/pages/order/list/index', tier: 1 },
    { label: '发货', url: '/pages/order/ship/index', tier: 2 },
    { label: '售后', url: '/pages/after-sale/list/index', tier: 2 },
  ]},
  { domain: '履约', color: D.d3.main, grad: D.d3.grad, items: [
    { label: '配送方式', url: '/pages/shipping/methods/index', tier: 2 },
    { label: '支付方式', url: '/pages/payment/methods/index', tier: 2 },
    { label: '自提点', url: '/pages/pickup/index', tier: 2 },
    { label: '配送档案', url: '/pages/shipping/profile/index', tier: 3 },
    { label: '支付档案', url: '/pages/payment/profile/index', tier: 3 },
  ]},
  { domain: '装修', color: D.d4.main, grad: D.d4.grad, items: [
    { label: '首页装修', url: '/pages/decorate/home/index', tier: 1 },
    { label: '主题风格', url: '/pages/decorate/theme/index', tier: 3 },
    { label: '店铺信息', url: '/pages/decorate/shop-info/index', tier: 3 },
  ]},
  { domain: '分销', color: D.d5.main, grad: D.d5.grad, items: [
    { label: '分销关系', url: '/pages/distribution/relations/index', tier: 2 },
    { label: '佣金结算', url: '/pages/distribution/settle/index', tier: 2 },
  ]},
  { domain: '系统', color: D.d6.main, grad: D.d6.grad, items: [
    { label: '数据看板', url: '/pages/data/dashboard/index', tier: 2 },
    { label: '切换店铺', tier: 3, action: 'switchStore' },
    { label: '退出登录', tier: 3, action: 'logout' },
  ]},
];

// 平台管理组：按权限渲染（仅持有对应权限者可见）
const platformGroup = () => {
  const items: { label: string; url: string; tier: number }[] = [];
  if (auth.isSuperAdmin || auth.hasPermission('TenantManage')) {
    items.push({ label: '租户列表', url: '/pages/platform/tenants/index', tier: 1 });
  }
  if (auth.hasPermission('TenantRoleManage')) {
    items.push({ label: '角色管理', url: '/pages/platform/roles/index', tier: 2 });
  }
  if (auth.hasPermission('TenantMemberManage')) {
    items.push({ label: '人员管理', url: '/pages/platform/members/index', tier: 2 });
  }
  if (auth.isSuperAdmin || auth.hasPermission('PlatformProductReview')) {
    items.push({ label: '商品审批', url: '/pages/platform/product-approval/index', tier: 3 });
  }
  if (!items.length) return null;
  return { domain: '平台', color: D.d7.main, grad: D.d7.grad, items };
};

const shownGroups = computed(() =>
  [...groups, ...(platformGroup() ? [platformGroup()] : [])].filter(Boolean),
);

function switchStore() { uni.redirectTo({ url: '/pages/channel-select/index' }); }
function go(it: any) {
  emit('close');
  if (it.action === 'logout') return uni.redirectTo({ url: '/pages/login/index' });
  if (it.action === 'switchStore') return switchStore();
  if (it.url) uni.navigateTo({ url: it.url });
}
</script>
<style lang="scss" scoped>
.mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,.45); z-index: 90; }
.drawer { position: fixed; left: 0; top: 0; bottom: 0; width: 78vw; max-width: 620rpx; background: #fff; z-index: 91; display: flex; flex-direction: column; box-shadow: 4rpx 0 24rpx rgba(0,0,0,.1); }
.head { padding: 32rpx 32rpx 22rpx; border-bottom: 1px solid #f0f0f0;
  .store { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
  .switch { display: block; margin-top: 8rpx; font-size: 22rpx; color: $pm-info; }
}
.body { flex: 1; padding: 20rpx 28rpx 40rpx; }
.group { margin-bottom: 28rpx; }
.g-band { display: flex; align-items: center; gap: 12rpx; margin-bottom: 16rpx;
  .band { width: 10rpx; height: 30rpx; border-radius: 6rpx; }
  .g-title { font-size: 26rpx; font-weight: 700; color: $wa-ink; }
}
.tags { display: flex; flex-wrap: wrap; gap: 14rpx; }
.tag { padding: 12rpx 22rpx; border-radius: 14rpx; font-size: 24rpx; font-weight: 500; white-space: nowrap; }
</style>
<template>
  <view>
    <view v-if="show" class="mask" @tap="$emit('close')" />
    <view v-if="show" class="drawer">
      <view class="head">
        <text class="store">{{ tenant.name || tenant.code || '未选店铺' }}</text>
        <text class="switch" @tap="switchStore">切换店铺 ›</text>
      </view>
      <view class="group" v-for="g in groups" :key="g.title">
        <text class="g-title">{{ g.title }}</text>
        <text class="g-item" v-for="it in g.items" :key="it.label" @tap="go(it)">{{ it.label }}</text>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { useTenantStore } from '../stores/tenantStore';
const emit = defineEmits(['close']);
const tenant = useTenantStore();
defineProps<{ show: boolean }>();
const groups = [
  { title: '商品', items: [{ label: '商品列表', url: '/pages/product/list/index' }, { label: '分类管理', url: '/pages/product/categories/index' }, { label: '库存与预警', url: '/pages/inventory/stock/index' }] },
  { title: '订单', items: [{ label: '全部订单', url: '/pages/order/list/index' }, { label: '售后处理', url: '/pages/after-sale/list/index' }] },
  { title: '装修', items: [{ label: '首页装修', url: '/pages/decorate/home/index' }, { label: '主题风格', url: '/pages/decorate/theme/index' }, { label: '店铺信息', url: '/pages/decorate/shop-info/index' }] },
  { title: '经营', items: [{ label: '数据看板', url: '/pages/data/dashboard/index' }, { label: '配送方式', url: '/pages/shipping/methods/index' }, { label: '支付方式', url: '/pages/payment/methods/index' }, { label: '分销管理', url: '/pages/distribution/relations/index' }] },
  { title: '我的', items: [{ label: '退出登录', url: '' }] },
];
function switchStore() { uni.redirectTo({ url: '/pages/channel-select/index' }); }
function go(it: any) {
  emit('close');
  if (it.label === '退出登录') return uni.redirectTo({ url: '/pages/login/index' });
  uni.navigateTo({ url: it.url });
}
</script>

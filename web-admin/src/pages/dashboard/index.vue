<template>
  <view class="page">
    <view class="topbar">
      <text class="nav">工作台</text>
      <view class="right">
        <text class="menu" @tap="drawer = true">☰</text>
      </view>
    </view>
    <view class="stat">
      <view class="stat-card" v-for="s in stats" :key="s.label">
        <text class="num">{{ s.value }}</text>
        <text class="lbl">{{ s.label }}</text>
      </view>
    </view>
    <view class="section" v-for="sec in common" :key="sec.title">
      <text class="sec-title">{{ sec.title }}</text>
      <view class="grid">
        <BizCard v-for="it in sec.items" :key="it.label" :name="it.label" :badge="it.badge" @tap="go(it.url)" />
      </view>
    </view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
    <Drawer :show="drawer" @close="drawer = false" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import BizCard from '../../components/BizCard.vue';
import BottomBar from '../../components/BottomBar.vue';
import Drawer from '../../components/Drawer.vue';

const drawer = ref(false);
const stats = ref([{ label: '今日销售额', value: '—' }, { label: '待发货单数', value: '0' }, { label: '库存预警', value: '0' }]);
const common = [
  { title: '商品', items: [{ label: '商品列表', url: '/pages/product/list/index' }, { label: '新增商品', url: '/pages/product/create/index' }, { label: '分类', url: '/pages/product/categories/index' }, { label: '库存预警', url: '/pages/inventory/stock/index' }, { label: '图片库', url: '/pages/media/library/index' }] },
  { title: '订单', items: [{ label: '全部订单', url: '/pages/order/list/index' }, { label: '待发货', url: '/pages/order/list/index?state=WaitingForShipping' }, { label: '售后处理', url: '/pages/after-sale/list/index' }] },
  { title: '装修', items: [{ label: '首页装修', url: '/pages/decorate/home/index' }, { label: '主题风格', url: '/pages/decorate/theme/index' }, { label: '店铺信息', url: '/pages/decorate/shop-info/index' }] },
  { title: '经营', items: [{ label: '数据看板', url: '/pages/data/dashboard/index' }, { label: '配送方式', url: '/pages/shipping/methods/index' }, { label: '支付方式', url: '/pages/payment/methods/index' }, { label: '配送档案', url: '/pages/shipping/profile/index' }, { label: '支付档案', url: '/pages/payment/profile/index' }] },
];
function go(url: string) { uni.navigateTo({ url }); }
</script>

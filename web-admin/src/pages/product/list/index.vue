<template>
  <view class="page">
    <view class="toolbar">
      <input v-model="term" class="search" placeholder="搜索商品" confirm-type="search" @confirm="load" />
      <text class="link" @tap="goCats">分类</text>
      <text class="new" @tap="goCreate">＋ 新增</text>
    </view>
    <view class="card" v-for="p in items" :key="p.id">
      <view class="row">
        <text class="name">{{ p.name }}</text>
        <text class="st" :class="{ off: !p.enabled }">{{ p.enabled ? '在售' : '下架' }}</text>
      </view>
      <view class="ops">
        <text @tap="toggle(p)">{{ p.enabled ? '下架' : '上架' }}</text>
        <text @tap="edit(p)">编辑</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无商品</view>
    <view style="height: 120rpx" />
    <BottomBar current="product" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchProducts, setProductEnabled } from '../../../apis/product';

const term = ref('');
const items = ref<any[]>([]);

async function load() {
  items.value = (await fetchProducts(20, 0, term.value)).items;
}
onMounted(load);
function goCreate() { uni.navigateTo({ url: '/pages/product/create/index' }); }
function goCats() { uni.navigateTo({ url: '/pages/product/categories/index' }); }
function edit(p: any) { uni.navigateTo({ url: `/pages/product/edit/index?id=${p.id}` }); }
async function toggle(p: any) { await setProductEnabled(p.id, !p.enabled); await load(); }
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar { display: flex; align-items: center; margin-bottom: 24rpx;
    .search { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; font-size: 28rpx; }
    .link { margin-left: 24rpx; color: $wa-muted; font-size: 28rpx; }
    .new { margin-left: 24rpx; color: $wa-accent; font-size: 28rpx; font-weight: 600; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 30rpx; color: $wa-ink; flex: 1; }
      .st { font-size: 24rpx; color: $wa-success; &.off { color: $wa-muted; } }
    }
    .ops { display: flex; margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 40rpx; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

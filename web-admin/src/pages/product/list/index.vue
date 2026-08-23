<template>
  <view class="page">
    <view class="toolbar">
      <input
        v-model="term"
        class="search"
        placeholder="按名称搜索商品"
        confirm-type="search"
        @confirm="load(0)"
      />
      <text class="link" @tap="goCats">分类</text>
    </view>
    <view class="tabs">
      <text
        v-for="t in tabs"
        :key="t.value"
        class="tab"
        :class="{ on: filter === t.value }"
        @tap="switchFilter(t.value)"
      >{{ t.label }}</text>
    </view>

    <view class="card" v-for="p in items" :key="p.id" @tap="edit(p)">
      <view class="body">
        <image
          v-if="p.thumb"
          class="thumb"
          :src="p.thumb"
          mode="aspectFill"
        />
        <view v-else class="thumb thumb-empty">无</view>
        <view class="meta">
          <text class="name">{{ p.name }}</text>
          <text class="slug">{{ p.slug }}</text>
          <view class="price-row">
            <text class="price">¥{{ p.priceYuan }}</text>
            <text class="stock" :class="{ low: p.low }">库存 {{ p.stock }}<text v-if="p.low"> · 缺货</text></text>
          </view>
          <text class="st" :class="{ off: !p.enabled }">{{ p.enabled ? '在售' : '下架' }}</text>
        </view>
      </view>
    </view>

    <view v-if="!items.length" class="empty">暂无商品</view>
    <view v-else-if="hasMore" class="more" @tap="load()">加载更多</view>

    <view style="height: 160rpx" />
    <BottomBar current="product" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchProductList, type ProductListRow } from '../../../apis/product';

const term = ref('');
const filter = ref<'all' | 'on' | 'off'>('all');
const items = ref<ProductListRow[]>([]);
const total = ref(0);
const loading = ref(false);

const tabs: Array<{ value: 'all' | 'on' | 'off'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'on', label: '在售' },
  { value: 'off', label: '下架' },
];

const hasMore = computed(() => items.value.length < total.value);

async function load(reset = items.value.length === 0) {
  if (loading.value) return;
  loading.value = true;
  try {
    const skip = reset ? 0 : items.value.length;
    const q: Parameters<typeof fetchProductList>[0] = {
      take: 20,
      skip,
      term: term.value || undefined,
    };
    if (filter.value === 'on') q.enabled = true;
    else if (filter.value === 'off') q.enabled = false;
    const res = await fetchProductList(q);
    items.value = reset ? res.items : [...items.value, ...res.items];
    total.value = res.totalItems;
  } finally {
    loading.value = false;
  }
}

function switchFilter(v: 'all' | 'on' | 'off') {
  filter.value = v;
  load(0);
}

onMounted(() => load(0));

function goCats() { uni.navigateTo({ url: '/pages/product/categories/index' }); }
function edit(p: ProductListRow) { uni.navigateTo({ url: `/pages/product/edit/index?id=${p.id}` }); }
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar {
    display: flex; align-items: center; margin-bottom: 20rpx;
    .search { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; font-size: 28rpx; }
    .link { margin-left: 24rpx; color: $wa-muted; font-size: 28rpx; }
  }
  .tabs {
    display: flex; margin-bottom: 24rpx;
    .tab {
      font-size: 28rpx; color: $wa-muted; margin-right: 40rpx; padding-bottom: 8rpx;
      &.on { color: $wa-accent; font-weight: 600; border-bottom: 4rpx solid $wa-accent; }
    }
  }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 20rpx;
    .body { display: flex; align-items: center; }
    .thumb {
      width: 140rpx; height: 140rpx; border-radius: $wa-radius; flex-shrink: 0; background: $wa-bg;
    }
    .thumb-empty {
      display: flex; align-items: center; justify-content: center; color: $wa-muted; font-size: 24rpx;
    }
    .meta {
      flex: 1; margin-left: 24rpx; display: flex; flex-direction: column;
      .name { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .slug { font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
      .price-row { display: flex; align-items: baseline; margin-top: 12rpx;
        .price { font-size: 32rpx; color: $wa-accent; font-weight: 600; }
        .stock { font-size: 24rpx; color: $wa-muted; margin-left: 20rpx; &.low { color: #e53935; font-weight: 600; } }
      }
      .st {
        align-self: flex-start; margin-top: 10rpx; font-size: 22rpx; color: $wa-success; padding: 2rpx 14rpx;
        border-radius: $wa-radius; background: rgba(67, 160, 71, 0.12);
        &.off { color: $wa-muted; background: $wa-bg; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .more {
    text-align: center; color: $wa-accent; font-size: 28rpx; padding: 24rpx 0;
  }
}
</style>
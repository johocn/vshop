<template>
  <view class="mkt-home">
    <view class="mkt-home__hero">
      <text class="mkt-home__title">市场专区</text>
      <text class="mkt-home__subtitle">聚合多商家精选好物</text>
    </view>

    <view class="mkt-home__tabs">
      <view
        v-for="g in groups"
        :key="g.key"
        class="tab"
        :class="{ active: activeGroup === g.key }"
        @click="activeGroup = g.key"
      >
        <text>{{ g.name }}</text>
        <text class="tab__count">{{ g.items.length }}</text>
      </view>
    </view>

    <view v-if="loading" class="mkt-state">加载中...</view>
    <view v-else-if="groups.length === 0" class="mkt-state">暂无聚合商品</view>

    <view
      v-for="g in groups"
      v-show="activeGroup === 'all' || activeGroup === g.key"
      :key="g.key"
      class="mkt-section"
    >
      <view class="mkt-section__title">
        <text>{{ g.name }}</text>
        <text class="mkt-section__shop-note">{{ g.key === 'self' ? '平台直营' : '商家入驻' }}</text>
      </view>
      <view class="mkt-grid">
        <view
          v-for="p in g.items"
          :key="p.id"
          class="mkt-card"
          @click="goDetail(p.slug)"
        >
          <text class="mkt-card__name">{{ p.name }}</text>
          <text class="mkt-card__code">条形码: {{ p.barcode || '—' }}</text>
          <text class="mkt-card__code">内部编码: {{ p.internalCode || '—' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getMarketplaceProducts } from '../../../api/queries/marketplace';

const loading = ref(true);
const products = ref<any[]>([]);
const activeGroup = ref('all');

interface Group { key: string; name: string; items: any[]; }

const groups = computed<Group[]>(() => {
    const map = new Map<string, Group>();
    map.set('self', { key: 'self', name: '自营', items: [] });
    products.value.forEach((p: any) => {
        const ch = p?.merchantChannel;
        const key = ch?.id ? String(ch.id) : 'self';
        if (!map.has(key)) {
            map.set(key, { key, name: ch?.name || '商家', items: [] });
        }
        map.get(key)!.items.push(p);
    });
    const all: Group[] = Array.from(map.values());
    // 自营排最前，其余按商家
    all.sort((a, b) => (a.key === 'self' ? -1 : b.key === 'self' ? 1 : 0));
    return all;
});

onMounted(async () => {
    try {
        const res: any = await getMarketplaceProducts();
        products.value = res.marketplaceProducts || [];
    } catch (e) {
        console.error('加载聚合商品失败', e);
    }
    loading.value = false;
});

function goDetail(slug: string) {
    if (!slug) return;
    uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug });
}
</script>
<style lang="scss" scoped>
.mkt-home {
    &__hero { background: linear-gradient(135deg, $brand-color, #ff9966); padding: 60rpx 30rpx; color: #fff;
        & .mkt-home__title { font-size: 48rpx; font-weight: bold; display: block; }
        & .mkt-home__subtitle { font-size: 26rpx; opacity: 0.8; }
    }
    &__tabs { display: flex; gap: 16rpx; padding: 20rpx; overflow-x: auto; background: #fff; }
    &__section { padding: 0 20rpx; }
}
.tab {
    flex-shrink: 0; display: flex; align-items: center; gap: 8rpx; background: $bg-color; padding: 12rpx 24rpx; border-radius: 32rpx; font-size: 26rpx;
    &.active { background: $brand-color; color: #fff; }
    &__count { font-size: 22rpx; opacity: 0.7; }
}
.mkt-state { text-align: center; color: #999; padding: 80rpx 0; font-size: 28rpx; }
.mkt-section {
    background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx;
    &__title { font-size: 30rpx; font-weight: bold; display: flex; align-items: baseline; gap: 12rpx; margin-bottom: 16rpx;
        & .mkt-section__shop-note { font-size: 22rpx; font-weight: normal; color: #999; }
    }
}
.mkt-grid { display: flex; flex-wrap: wrap; gap: 16rpx; }
.mkt-card {
    width: calc(50% - 8rpx); background: $bg-color; border-radius: $radius-md; padding: 20rpx; box-sizing: border-box;
    &__name { font-size: 26rpx; font-weight: bold; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 72rpx; }
    &__code { display: block; font-size: 22rpx; color: #999; margin-top: 8rpx; }
}
</style>
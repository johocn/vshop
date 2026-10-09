<template>
  <view class="faq-page">
    <scroll-view scroll-x class="faq-page__tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="faq-page__tab"
        :class="{ active: cur === t.key }"
        @click="onTab(t.key)"
      >{{ t.name }}</view>
    </scroll-view>

    <view class="faq-page__list">
      <view v-for="f in items" :key="f.id" class="faq-item">
        <view class="faq-item__head" @click="toggle(f.id)">
          <text class="faq-item__title">{{ f.title }}</text>
          <text class="faq-item__arrow" :class="{ open: expandedId === f.id }">></text>
        </view>
        <view v-show="expandedId === f.id" class="faq-item__body">
          <text>{{ f.content }}</text>
        </view>
      </view>
      <EmptyState v-if="items.length === 0 && !loading" text="暂无常见问题" />
      <view v-if="loading" class="faq-page__loading">加载中...</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getFaqs } from '../../api/queries/feedback';
import EmptyState from '../../components/EmptyState.vue';

// 分组 key 与后端 FaqEntry.type 对齐
const tabs = [
    { key: '', name: '全部' },
    { key: 'register', name: '注册登录' },
    { key: 'order', name: '订单' },
    { key: 'pay', name: '支付' },
    { key: 'afterSale', name: '售后' },
    { key: 'account', name: '账户' },
];
const cur = ref('');
const items = ref<any[]>([]);
const loading = ref(false);
const expandedId = ref<string | null>(null);

function toggle(id: string) {
    expandedId.value = expandedId.value === id ? null : id;
}

function onTab(key: string) {
    if (cur.value === key) return;
    cur.value = key;
    loadFaqs();
}

async function loadFaqs() {
    loading.value = true;
    try {
        const r: any = await getFaqs(cur.value || undefined);
        items.value = r?.faqs || [];
        expandedId.value = null;
    } catch (e) {
        items.value = [];
    } finally {
        loading.value = false;
    }
}

onMounted(() => loadFaqs());
</script>

<style lang="scss" scoped>
.faq-page {
    min-height: 100vh; background: $bg-color;
    &__tabs {
        background: #fff; white-space: nowrap; padding: 0 12rpx;
        border-bottom: 1rpx solid $border-color;
    }
    &__tab {
        display: inline-block; padding: 24rpx 28rpx; font-size: 28rpx; color: #666;
        &.active { color: $brand-color; font-weight: bold; border-bottom: 4rpx solid $brand-color; }
    }
    &__list { padding: 20rpx; }
    &__loading { text-align: center; color: #999; font-size: 24rpx; padding: 20rpx; }
}
.faq-item {
    background: #fff; border-radius: $radius-md; margin-bottom: 16rpx; overflow: hidden;
    &__head {
        display: flex; justify-content: space-between; align-items: center; padding: 28rpx 24rpx;
    }
    &__title { font-size: 28rpx; font-weight: bold; flex: 1; }
    &__arrow {
        color: #ccc; font-size: 26rpx; transform: rotate(90deg); transition: transform 0.2s;
        &.open { transform: rotate(-90deg); }
    }
    &__body {
        padding: 0 24rpx 24rpx; font-size: 26rpx; color: #666; line-height: 1.6;
        border-top: 1rpx solid $border-color; padding-top: 20rpx;
    }
}
</style>

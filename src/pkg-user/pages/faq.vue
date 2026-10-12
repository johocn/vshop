<template>
  <view class="faq-page">
    <scroll-view scroll-x class="faq-page__tabs">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="faq-page__tab"
        :class="{ active: cur === tab.key }"
        @click="onTab(tab.key)"
      >{{ tab.name }}</view>
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
      <EmptyState v-if="items.length === 0 && !loading" :text="t('faq.empty')" />
      <view v-if="loading" class="faq-page__loading">{{ t('common.loading') }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFaqs } from '../../api/queries/feedback';
import EmptyState from '../../components/EmptyState.vue';

const { t, tm, locale } = useI18n();

// 分组 key 与后端 FaqEntry.type 对齐：tab 由全量数据 distinct type 动态生成，
// 顺序按语言包 typeOrder 固定序（tm() 取数组词条），未知 type 排最后、显示 key 原文
const FIXED_ORDER = (tm('faq.typeOrder') as string[]) || [];
const allTypes = ref<string[]>([]);
const tabs = computed(() => {
    const known = allTypes.value
        .filter(tp => FIXED_ORDER.includes(tp))
        .sort((a, b) => FIXED_ORDER.indexOf(a) - FIXED_ORDER.indexOf(b));
    const unknown = allTypes.value.filter(tp => !FIXED_ORDER.includes(tp));
    const nameOf = (tp: string) => {
        const key = `faq.type_${tp}`;
        const translated = t(key);
        return translated === key ? tp : translated;
    };
    return [
        { key: '', name: t('faq.tabAll') },
        ...[...known, ...unknown].map(tp => ({ key: tp, name: nameOf(tp) })),
    ];
});
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
        const r: any = await getFaqs(cur.value || undefined, locale.value);
        items.value = r?.faqs || [];
        expandedId.value = null;
        // 全量拉取（未按 type 过滤）时提取 distinct type 驱动动态 tab
        if (!cur.value) {
            allTypes.value = [...new Set(items.value.map((f: any) => f.type).filter(Boolean))] as string[];
        }
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

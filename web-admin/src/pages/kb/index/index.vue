<template>
  <view class="page">
    <view v-if="loading" class="empty">{{ $t('kb.index.loading') }}</view>
    <view v-else-if="error" class="empty">
      <text>{{ error }}</text>
      <text class="retry" @tap="load()">{{ $t('kb.index.retry') }}</text>
    </view>
    <view v-else-if="!stats.length" class="empty">{{ $t('kb.index.empty') }}</view>

    <template v-else>
      <view class="card" v-for="s in stats" :key="s.index">
        <view class="row">
          <text class="idx">{{ s.index }}</text>
          <text class="st" :class="s.healthy ? 'st-ok' : 'st-bad'">
            {{ s.healthy ? $t('kb.index.healthy') : $t('kb.index.unhealthy') }}
          </text>
        </view>
        <text class="meta">{{ $t('kb.index.documents').replace('{n}', String(s.documents)) }}</text>
      </view>

      <view class="tip">{{ $t('kb.index.reindexTip') }}</view>

      <view class="actions">
        <button class="op" :disabled="!!pending" @tap="onReindex('PRODUCTS')">
          {{ pending === 'PRODUCTS' ? $t('kb.index.submitting') : $t('kb.index.reindexProductsBtn') }}
        </button>
        <button class="op" :disabled="!!pending" @tap="onReindex('CONTENTS')">
          {{ pending === 'CONTENTS' ? $t('kb.index.submitting') : $t('kb.index.reindexContentsBtn') }}
        </button>
        <button class="op main" :disabled="!!pending" @tap="onReindex('ALL')">
          {{ pending === 'ALL' ? $t('kb.index.submitting') : $t('kb.index.reindexAllBtn') }}
        </button>
      </view>
    </template>

    <view style="height: 160rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchIndexStats, reindex, type MeiliIndexStatus, type MeiliReindexScope } from '../../../apis/meili';

const locale = useLocaleStore();

const stats = ref<MeiliIndexStatus[]>([]);
const loading = ref(false);
const error = ref('');
// 提交中的 scope：同时作防重复点击闸（任一提交进行中其余按钮禁用）
const pending = ref<MeiliReindexScope | ''>('');

// silent=true 用于提交成功后的静默刷新（不闪加载态，卡片保持可见）
async function load(silent = false) {
  if (!silent) {
    loading.value = true;
  }
  error.value = '';
  try {
    stats.value = await fetchIndexStats();
  } catch (e: any) {
    error.value = e?.message || locale.t('kb.index.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

function toast(msg: string) {
  uni.showToast({ title: msg, icon: 'none' });
}

async function onReindex(scope: MeiliReindexScope) {
  if (pending.value) return;
  pending.value = scope;
  uni.showLoading({ title: locale.t('kb.index.submitting'), mask: true });
  try {
    await reindex(scope);
    uni.hideLoading();
    uni.showToast({ title: locale.t('kb.index.requeued'), icon: 'success' });
    await load(true);
  } catch (e: any) {
    uni.hideLoading();
    toast(e?.message || locale.t('kb.index.opFailed'));
  } finally {
    pending.value = '';
  }
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx; display: flex; flex-direction: column; gap: 12rpx;
    .row { display: flex; align-items: center; justify-content: space-between; }
    .idx { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
    .st { font-size: 24rpx; border-radius: 999rpx; padding: 4rpx 16rpx;
      &.st-ok { color: #16a34a; background: #e6f5ec; }
      &.st-bad { color: #dc2626; background: #fdeaea; } }
    .meta { font-size: 24rpx; color: $wa-muted; }
  }
  .tip { font-size: 22rpx; color: $wa-muted; line-height: 1.6; margin: 8rpx 0 24rpx; }
  .actions { display: flex; flex-direction: column; gap: 16rpx;
    .op { margin: 0; height: 80rpx; line-height: 80rpx; font-size: 28rpx; border-radius: $wa-radius; background: $wa-card; color: $wa-ink;
      &.main { background: $wa-accent; color: #fff; }
      &[disabled] { opacity: 0.6; color: $wa-ink; background: $wa-card; }
      &.main[disabled] { background: $wa-accent; color: #fff; } }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .retry { display: block; margin-top: 16rpx; color: $wa-accent; }
}
</style>

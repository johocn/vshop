<template>
  <view class="page">
    <view class="tab">
      <text class="tab-item on">{{ $t('distributionRelations.title') }}</text>
      <text class="tab-item" @tap="goSettle">{{ $t('distributionRelations.goSettle') }}</text>
    </view>
    <view class="card" v-for="d in items" :key="d.id">
      <view class="row">
        <text class="code">{{ $t('distributionRelations.promoter').replace('{id}', d.id) }}</text>
        <text class="st" :class="d.status">{{ statusText(d.status) }}</text>
      </view>
      <text class="line">{{ $t('distributionRelations.customer').replace('{customerId}', d.customerId).replace('{referralCode}', d.referralCode) }}</text>
      <text class="line">{{ $t('distributionRelations.level').replace('{level}', d.level) }}<text v-if="d.parentId">{{ $t('distributionRelations.parent').replace('{parentId}', d.parentId) }}</text></text>
      <view class="amt">
        <text class="amt-item">{{ $t('distributionRelations.totalEarnings') }} ¥{{ (d.totalEarnings / 100).toFixed(2) }}</text>
        <text class="amt-item">{{ $t('distributionRelations.availableBalance') }} ¥{{ (d.availableBalance / 100).toFixed(2) }}</text>
        <text class="amt-item">{{ $t('distributionRelations.frozenBalance') }} ¥{{ (d.frozenBalance / 100).toFixed(2) }}</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('distributionRelations.empty') }}</view>
    <view style="height: 120rpx" />
    <BottomBar current="mine" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchDistributors, type DistributorRow } from '../../../apis/distribution';

const locale = useLocaleStore();
const items = ref<DistributorRow[]>([]);
const statusText = (s: string) => ({ active: locale.t('distributionRelations.statusActive'), frozen: locale.t('distributionRelations.statusFrozen'), pending: locale.t('distributionRelations.statusPending') } as Record<string, string>)[s] || s;
function goSettle() { uni.navigateTo({ url: '/pages/distribution/settle/index' }); }
onMounted(async () => { items.value = (await fetchDistributors(20)).items; });
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .tab { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 24rpx;
    .tab-item { flex: 1; text-align: center; font-size: 28rpx; color: $wa-muted; padding: 16rpx 0; border-radius: $wa-radius;
      &.on { color: #fff; background: $wa-accent; font-weight: 600; }
    }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .code { font-size: 28rpx; color: $wa-ink; }
      .st { font-size: 24rpx; color: $wa-accent;
        &.frozen { color: $wa-danger; }
        &.pending { color: $wa-muted; }
      }
    }
    .line { display: block; font-size: 26rpx; color: $wa-muted; line-height: 1.6; margin-top: 8rpx; }
    .amt { display: flex; gap: 24rpx; margin-top: 16rpx;
      .amt-item { font-size: 24rpx; color: $wa-ink; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

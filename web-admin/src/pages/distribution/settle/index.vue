<template>
  <view class="page">
    <view class="tab">
      <text class="tab-item" @tap="goRelations">{{ $t('distributionSettle.goRelations') }}</text>
      <text class="tab-item on">{{ $t('distributionSettle.title') }}</text>
    </view>
    <view class="card" v-for="c in items" :key="c.id">
      <view class="row">
        <text class="code">{{ $t('distributionSettle.settlement').replace('{id}', c.id) }}</text>
        <text class="st" :class="c.status">{{ statusText(c.status) }}</text>
      </view>
      <text class="line">{{ $t('distributionSettle.line').replace('{distributorId}', c.distributorId).replace('{orderId}', c.orderId) }}</text>
      <text class="line">{{ (c.commissionType === 'direct' ? $t('distributionSettle.feeDirect') : $t('distributionSettle.feeIndirect')).replace('{rate}', (c.commissionRate / 100).toFixed(1)) }}</text>
      <view class="amt">
        <text class="amt-item">{{ $t('distributionSettle.order') }} ¥{{ (c.orderAmount / 100).toFixed(2) }}</text>
        <text class="amt-item">{{ $t('distributionSettle.commission') }} ¥{{ (c.commissionAmount / 100).toFixed(2) }}</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('distributionSettle.empty') }}</view>
    <view style="height: 120rpx" />
    <BottomBar current="mine" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchCommissions, type CommissionRow } from '../../../apis/distribution';

const locale = useLocaleStore();
const items = ref<CommissionRow[]>([]);
const statusText = (s: string) => ({ pending: locale.t('distributionSettle.statusPending'), confirmed: locale.t('distributionSettle.statusConfirmed'), paid: locale.t('distributionSettle.statusPaid'), cancelled: locale.t('distributionSettle.statusCancelled') } as Record<string, string>)[s] || s;
function goRelations() { uni.navigateTo({ url: '/pages/distribution/relations/index' }); }
onMounted(async () => { items.value = (await fetchCommissions(20)).items; });
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
        &.cancelled { color: $wa-danger; }
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

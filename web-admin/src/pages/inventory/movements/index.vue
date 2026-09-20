<template>
  <view class="page">
    <view class="card" v-for="m in items" :key="m.id">
      <view class="row">
        <text class="name" :class="m.direction">{{ m.direction === 'in' ? '＋' : '－' }} {{ m.quantity }}</text>
        <text class="biz">{{ m.bizType }}</text>
      </view>
      <view class="sub"><text>#{{ m.productVariantId }} · 仓#{{ m.stockLocationId }}</text></view>
      <view class="sub">
        <text>{{ m.code }}</text>
        <text v-if="m.bizCode">｜{{ m.bizCode }}</text>
      </view>
      <view class="sub dim">{{ fmtTime(m.createdAt) }}<text v-if="m.reason"> · {{ m.reason }}</text></view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('inventoryMovements.empty') }}</view>
    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchMovements, type MovementRow } from '../../../apis/stock-doc';

const locale = useLocaleStore();
const items = ref<MovementRow[]>([]);

function fmtTime(s: string): string {
  if (!s) return '';
  return s.replace('T', ' ').replace('.000Z', '').slice(0, 19);
}

onMounted(async () => {
  try {
    const res = await fetchMovements({ page: 1, pageSize: 50 });
    items.value = res.items;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryMovements.loadFailed'), icon: 'none' });
  }
});
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .name { font-size: 30rpx; font-weight: 600;
        &.in { color: $wa-accent; }
        &.out { color: $wa-danger; }
      }
      .biz { font-size: 24rpx; color: $wa-muted; }
    }
    .sub { margin-top: 10rpx; font-size: 24rpx; color: $wa-ink;
      &.dim { color: $wa-muted; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
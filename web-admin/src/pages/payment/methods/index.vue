<template>
  <view class="page">
    <view class="card" v-for="p in items" :key="p.id">
      <view class="row">
        <view class="left">
          <text class="name">{{ p.name }}</text>
          <text class="code">{{ p.code }}</text>
        </view>
        <switch :checked="p.enabled" color="#ff6600" @change="toggle(p, $event)" />
      </view>
      <text class="desc">{{ p.description || '—' }}</text>
    </view>
    <view v-if="!items.length" class="empty">暂无支付方式</view>
    <view style="height: 120rpx" />
    <BottomBar current="dashboard" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import BottomBar from '../../../components/BottomBar.vue';
import { fetchPaymentMethods, setPaymentEnabled } from '../../../apis/payment';

const items = ref<any[]>([]);
onMounted(async () => { items.value = await fetchPaymentMethods(); });

async function toggle(p: any, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await setPaymentEnabled(p.id, enabled);
    p.enabled = enabled;
  } catch (err: any) {
    uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
  }
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: center; justify-content: space-between;
      .left { display: flex; flex-direction: column;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
        .code { margin-top: 4rpx; font-size: 24rpx; color: $wa-muted; }
      }
    }
    .desc { display: block; margin-top: 12rpx; font-size: 26rpx; color: $wa-muted; }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

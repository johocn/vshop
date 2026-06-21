<template>
  <view class="history-page">
    <view v-for="card in history" :key="card.id" class="history-item">
      <text>{{ card.code }}</text>
      <text class="history-item__value">+¥{{ (card.faceValue / 100).toFixed(2) }}</text>
      <text class="history-item__date">{{ card.redeemedAt || card.createdAt }}</text>
    </view>
    <EmptyState v-if="history.length === 0" text="暂无充值记录" />
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getMyRechargeHistory } from '../../api/mutations/recharge';
import EmptyState from '../../components/EmptyState.vue';
const history = ref<any[]>([]);
onMounted(async () => { try { const r: any = await getMyRechargeHistory(); history.value = r.myRechargeHistory || []; } catch (e) {} });
</script>
<style lang="scss" scoped>
.history-page { padding: 20rpx; }
.history-item { background: #fff; padding: 20rpx; border-radius: $radius-md; margin-bottom: 12rpx; display: flex; justify-content: space-between; align-items: center; font-size: 26rpx; &__value { color: $success-color; font-weight: bold; } &__date { color: #999; font-size: 22rpx; } }
</style>
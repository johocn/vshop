<template>
  <view class="page">
    <!-- 核销输入 -->
    <view class="claim-card">
      <input
        ref="codeInput"
        class="code-input"
        v-model="code"
        placeholder="请输入核销码"
        :maxlength="6"
        confirm-type="done"
        @confirm="onClaim"
      />
      <button class="scan-btn" @tap="onScan">扫一扫</button>
      <button class="claim-btn" :disabled="claiming" @tap="onClaim">{{ claiming ? '核销中…' : '核销' }}</button>
    </view>

    <!-- 待核销自提单列表 -->
    <text class="sec-title">待核销自提单</text>
    <view class="card" v-for="r in orders" :key="r.id">
      <view class="head">
        <text class="code">#{{ r.orderCode || r.orderId }}</text>
        <text class="st" :style="{ color: stateLabel(REDEMPTION_STATES, r.status).color }">{{ stateLabel(REDEMPTION_STATES, r.status).label }}</text>
      </view>
      <view class="line">
        <text>核销码</text>
        <text class="mono">{{ r.code }}</text>
      </view>
      <view class="line">
        <text>收款</text>
        <text :class="{ pay: r.collected }">{{ r.paymentType === 'cod' && !r.collected ? '待到店收款' : (r.collected ? '已收款' : '—') }}</text>
      </view>
      <view class="line" v-if="r.claimedAt">
        <text>核销时间</text>
        <text>{{ formatTime(r.claimedAt) }}</text>
      </view>
    </view>
    <view v-if="!orders.length" class="empty">暂无待核销自提单</view>

    <view style="height: 140rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { fetchPickupOrders, claimPickup, PickupRedemptionItem } from '../../../apis/pickup';
import { REDEMPTION_STATES, stateLabel } from '../../../constants/orderState';
import { scanCode } from '../../../utils/scanner';

const code = ref('');
const orders = ref<PickupRedemptionItem[]>([]);
const claiming = ref(false);
const codeInput = ref<unknown | null>(null);

function formatTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadList(): Promise<void> {
  try {
    orders.value = await fetchPickupOrders(true);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  }
}

onLoad(async (q) => {
  const c = (q && (q.code as string)) || '';
  const orderId = (q && (q.orderId as string)) || '';
  if (c) {
    code.value = c;
  } else if (orderId) {
    // 订单详情「去核销」跳转只带 orderId 时，从核销记录匹配出该单核销码预填
    try {
      const list = await fetchPickupOrders(false);
      const hit = list.find((r) => String(r.orderId) === orderId);
      if (hit) code.value = hit.code;
    } catch (_e) {
      /* 匹配失败不阻塞，用户可手输 */
    }
  }
});

// onShow 在每次进入/返回本页时刷新列表（含核销成功后）
onShow(() => { loadList(); });

function focusInput(): void {
  // number 键盘 focus，Web/小程序下若支持再触发；失败静默
  try {
    (codeInput.value as any)?.focus?.();
  } catch { /* 忽略 */ }
}

async function onScan(): Promise<void> {
  try {
    const text = await scanCode();
    code.value = (text || '').trim();
    if (code.value) await onClaim();
  } catch (e: any) {
    if (e?.code === 'MANUAL') {
      uni.showToast({ title: e?.message || '请手动输入核销码', icon: 'none' });
      focusInput();
    } else if (e?.code === 'FAILED') {
      uni.showToast({ title: e?.message || '无法打开相机，请改用手动输入', icon: 'none' });
      focusInput();
    }
    // CANCEL 静默
  }
}

async function onClaim(): Promise<void> {
  const c = code.value.trim();
  if (!c) {
    uni.showToast({ title: '请输入核销码', icon: 'none' });
    return;
  }
  claiming.value = true;
  try {
    // 店员到店核销即确认已收款（到店付款单必须 collect=true 后端才放行，防漏收）
    await claimPickup(c, true);
    uni.showToast({ title: '核销成功', icon: 'success' });
    code.value = '';
    await loadList();
  } catch (e: any) {
    uni.showToast({ title: e?.message || '核销失败', icon: 'none' });
  } finally {
    claiming.value = false;
  }
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 60rpx;
  .claim-card {
    display: flex; align-items: center; gap: 16rpx;
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 24rpx;
    .code-input {
      flex: 1; height: 72rpx; padding: 0 24rpx; font-size: 32rpx; letter-spacing: 4rpx;
      background: $wa-bg; border-radius: $wa-radius; color: $wa-ink;
    }
    .claim-btn {
      margin: 0; min-width: 168rpx; height: 72rpx; line-height: 72rpx; padding: 0 24rpx;
      font-size: 28rpx; background: $wa-accent; color: #fff; border-radius: $wa-radius;
      &[disabled] { opacity: 0.6; }
    }
    .scan-btn {
      margin: 0; min-width: 132rpx; height: 72rpx; line-height: 72rpx; padding: 0 20rpx;
      font-size: 28rpx; background: $wa-ink; color: #fff; border-radius: $wa-radius;
    }
  }
  .sec-title { display: block; font-size: 26rpx; color: $wa-muted; margin-bottom: 16rpx; }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx;
      .code { font-size: 30rpx; font-weight: 600; color: $wa-ink; }
      .st { font-size: 24rpx; }
    }
    .line {
      display: flex; align-items: center; justify-content: space-between; font-size: 26rpx;
      color: $wa-muted; padding: 6rpx 0;
      .mono { color: $wa-ink; letter-spacing: 2rpx; font-weight: 600; }
      .pay { color: $wa-success; font-weight: 600; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
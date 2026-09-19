<template>
  <view v-if="visible" class="mask" @tap.self="close">
    <view class="modal">
      <view class="head">
        <text class="t">券使用明细</text>
        <text class="x" @tap="close">✕</text>
      </view>
      <view class="tabs">
        <text :class="{ on: tab === 'issued' }" @tap="switchTab('issued')">领取明细</text>
        <text :class="{ on: tab === 'used' }" @tap="switchTab('used')">核销明细</text>
      </view>

      <scroll-view scroll-y class="list">
        <view class="row" v-for="r in items" :key="r.id">
          <view class="left">
            <text class="who">{{ customerText(r) }}</text>
            <text class="sub">
              <template v-if="tab === 'issued'">
                券码 {{ r.code }} · {{ statusLabel(r.status) }} · {{ issuedByLabel(r.issuedBy) }}
              </template>
              <template v-else>
                券码 {{ r.code }} · 订单 {{ r.usedOrderId || '—' }}
              </template>
            </text>
          </view>
          <text class="when">
            <template v-if="tab === 'issued'">{{ fmtDT(r.issuedAt) }}</template>
            <template v-else>{{ fmtDT(r.usedAt) }}</template>
          </text>
        </view>
        <view v-if="!items.length && !loading" class="empty">暂无记录</view>
        <view v-if="loading" class="empty">加载中…</view>
        <view v-if="items.length && hasMore" class="more" @tap="loadMore">加载更多</view>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  fetchCustomerCoupons, COUPON_STATUS_LABELS, COUPON_ISSUED_BY_LABELS,
  type CustomerCouponRow, type CouponTemplateItem,
} from '../../apis/coupon';

const props = defineProps<{ visible: boolean; template: CouponTemplateItem | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const tab = ref<'issued' | 'used'>('issued');
const items = ref<CustomerCouponRow[]>([]);
const loading = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const hasMore = () => items.value.length < totalItems.value;

function close() { emit('update:visible', false); }

function customerText(r: CustomerCouponRow): string {
  const c = r.customer;
  if (c) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
    return `${name} ${c.phoneNumber || ''}`.trim();
  }
  return `客户 #${r.customerId}`;
}

function fmtDT(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const statusLabel = (s: string) => COUPON_STATUS_LABELS[s] || s;
const issuedByLabel = (s: string) => COUPON_ISSUED_BY_LABELS[s] || s;

async function load() {
  if (!props.template) return;
  loading.value = true;
  items.value = [];
  try {
    const res = await fetchCustomerCoupons(props.template.id, 0, PAGE, tab.value === 'used' ? 'USED' : undefined);
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || !hasMore()) return;
  loading.value = true;
  try {
    const res = await fetchCustomerCoupons(props.template.id, items.value.length, PAGE, tab.value === 'used' ? 'USED' : undefined);
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function switchTab(t: 'issued' | 'used') {
  if (tab.value === t) return;
  tab.value = t;
  load();
}

watch(() => props.visible, (v) => { if (v) load(); });
</script>

<style lang="scss" scoped>
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 999; display: flex; align-items: flex-end; }
.modal { width: 100%; background: $wa-card; border-radius: 24rpx 24rpx 0 0; max-height: 76vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx 16rpx;
  .t { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
  .x { font-size: 32rpx; color: $wa-muted; padding: 0 8rpx; } }
.tabs { display: flex; gap: 12rpx; padding: 0 32rpx 16rpx;
  text { font-size: 26rpx; color: $wa-muted; padding: 8rpx 28rpx; border-radius: 999rpx; background: $wa-rule;
    &.on { background: $wa-accent; color: #fff; } } }
.list { flex: 1; min-height: 320rpx; padding: 0 32rpx 32rpx; box-sizing: border-box;
  .row { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0; border-bottom: 1rpx solid $wa-rule;
    .left { flex: 1; margin-right: 16rpx;
      .who { display: block; font-size: 26rpx; color: $wa-ink; }
      .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; word-break: break-all; } }
    .when { font-size: 22rpx; color: $wa-muted; flex-shrink: 0; } }
  .empty { text-align: center; color: $wa-muted; font-size: 26rpx; padding: 60rpx 0; }
  .more { text-align: center; color: $wa-accent; font-size: 26rpx; padding: 24rpx 0; } }
</style>

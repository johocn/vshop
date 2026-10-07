<template>
  <view v-if="visible" class="mask" @tap.self="close">
    <view class="modal">
      <view class="head">
        <text class="t">{{ $t('couponDetailModal.title') }}</text>
        <text class="x" @tap="close">✕</text>
      </view>
      <view class="stats">
        <view class="stat">
          <text class="num">{{ issuedCount }}</text>
          <text class="lbl">{{ $t('couponDetailModal.statsIssued') }}</text>
        </view>
        <view class="stat">
          <text class="num">{{ usedCount }}</text>
          <text class="lbl">{{ $t('couponDetailModal.statsUsed') }}</text>
        </view>
        <view class="stat">
          <text class="num">{{ rateText }}</text>
          <text class="lbl">{{ $t('couponDetailModal.statsRate') }}</text>
        </view>
      </view>
      <view class="tabs">
        <text :class="{ on: tab === 'issued' }" @tap="switchTab('issued')">{{ $t('couponDetailModal.tabIssued') }}</text>
        <text :class="{ on: tab === 'used' }" @tap="switchTab('used')">{{ $t('couponDetailModal.tabUsed') }}</text>
      </view>

      <scroll-view scroll-y class="list">
        <view class="row" v-for="r in items" :key="r.id">
          <view class="left">
            <text class="who">{{ customerText(r) }}</text>
            <text class="sub">
              <template v-if="tab === 'issued'">
                {{ $t('couponDetailModal.issuedSub').replace('{code}', r.code).replace('{status}', statusLabel(r.status)).replace('{by}', issuedByLabel(r.issuedBy)) }}
              </template>
              <template v-else>
                {{ $t('couponDetailModal.usedSub').replace('{code}', r.code).replace('{order}', r.usedOrderId || '—') }}
              </template>
            </text>
          </view>
          <text class="when">
            <template v-if="tab === 'issued'">{{ fmtDT(r.issuedAt) }}</template>
            <template v-else>{{ fmtDT(r.usedAt) }}</template>
          </text>
        </view>
        <view v-if="!items.length && !loading" class="empty">{{ $t('couponDetailModal.empty') }}</view>
        <view v-if="loading" class="empty">{{ $t('couponDetailModal.loading') }}</view>
        <view v-if="items.length && hasMore" class="more" @tap="loadMore">{{ $t('couponDetailModal.loadMore') }}</view>
      </scroll-view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import {
  fetchCustomerCoupons, COUPON_STATUS_LABELS, COUPON_ISSUED_BY_LABELS,
  type CustomerCouponRow, type CouponTemplateItem,
} from '../../apis/coupon';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();

const props = defineProps<{ visible: boolean; template: CouponTemplateItem | null }>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const tab = ref<'issued' | 'used'>('issued');
const items = ref<CustomerCouponRow[]>([]);
const loading = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const issuedCount = ref(0);
const usedCount = ref(0);
const rateText = computed(() => {
  if (!issuedCount.value) return '—';
  return `${Math.round((usedCount.value / issuedCount.value) * 100)}%`;
});

/** 领取/核销统计：并发两个 count 查询（take=1 仅取 total），失败不阻塞明细 */
async function loadStats() {
  if (!props.template) return;
  try {
    const [issuedRes, usedRes] = await Promise.all([
      fetchCustomerCoupons(props.template.id, 0, 1),
      fetchCustomerCoupons(props.template.id, 0, 1, 'USED'),
    ]);
    issuedCount.value = issuedRes.totalItems;
    usedCount.value = usedRes.totalItems;
  } catch { /* 统计加载失败不弹错 */ }
}

const hasMore = () => items.value.length < totalItems.value;

function close() { emit('update:visible', false); }

function customerText(r: CustomerCouponRow): string {
  const c = r.customer;
  if (c) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
    return `${name} ${c.phoneNumber || ''}`.trim();
  }
  return locale.t('couponDetailModal.customerId').replace('{id}', r.customerId);
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
  void loadStats();
  try {
    const res = await fetchCustomerCoupons(props.template.id, 0, PAGE, tab.value === 'used' ? 'USED' : undefined);
    items.value = res.items;
    totalItems.value = res.totalItems;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponDetailModal.loadFailed'), icon: 'none' });
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
    uni.showToast({ title: e?.message || locale.t('couponDetailModal.loadFailed'), icon: 'none' });
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
.stats { display: flex; gap: 12rpx; padding: 0 32rpx 16rpx;
  .stat { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 0; text-align: center;
    .num { display: block; font-size: 30rpx; color: $wa-ink; font-weight: 600; }
    .lbl { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; } } }
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

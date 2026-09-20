<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ {{ $t('couponList.createNew') }}</button>
    </view>

    <view class="card" v-for="c in items" :key="c.id">
      <view class="top" @tap="onEdit(c)">
        <view class="head">
          <text class="name">{{ c.name }}</text>
          <text class="badge" :class="c.type.toLowerCase()">{{ typeLabel(c.type) }}</text>
          <text class="badge tag" v-if="c.claimable">{{ $t('couponList.badgeClaimable') }}</text>
          <text class="badge tag" v-if="c.claimCode">{{ $t('couponList.badgeClaimCode') }}</text>
          <text class="badge tag" v-if="c.newCustomerOnly">{{ $t('couponList.badgeNewCustomer') }}</text>
          <text class="badge tag" v-if="c.scope === 'SKU'">{{ $t('couponList.badgeSku') }}</text>
          <text class="badge off" v-if="!c.enabled">{{ $t('couponList.disabled') }}</text>
        </view>
        <view class="value">{{ valueText(c) }}</view>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('couponList.limitLabel') }}</text>
            <text class="v">{{ c.totalCount === 0 ? $t('couponList.unlimited') : c.totalCount }}{{ c.claimedCount ? locale.t('couponList.claimedSuffix').replace('{count}', c.claimedCount) : '' }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponList.validLabel') }}</text>
            <text class="v">{{ validText(c) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">{{ $t('couponList.perUserLabel') }}</text>
            <text class="v">{{ c.perUserLimit === 0 ? $t('couponList.unlimited') : c.perUserLimit }}</text>
          </view>
          <view class="kv">
            <text class="k">{{ $t('couponList.shopLabel') }}</text>
            <text class="v">{{ shopText(c.shopId) }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onToggle(c)">{{ c.enabled ? $t('couponList.disabled') : $t('couponList.enabled') }}</text>
        <text @tap="onEdit(c)">{{ $t('couponList.edit') }}</text>
        <text @tap="openDetail(c)">{{ $t('couponList.detail') }}</text>
        <text class="del" @tap="onDelete(c)">{{ $t('couponList.del') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('couponList.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('couponList.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('couponList.loadingMore') }}</view>

    <CouponDetailModal v-model:visible="detailVisible" :template="detailTemplate" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  fetchCouponTemplates, deleteCouponTemplate, setCouponTemplateEnabled,
  couponTypeLabel, fmtCNY, CouponTemplateItem,
} from '../../apis/coupon';
import CouponDetailModal from './CouponDetailModal.vue';
import { useLocaleStore } from '../../stores/localeStore';

const locale = useLocaleStore();

const items = ref<CouponTemplateItem[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const totalItems = ref(0);
const PAGE = 20;

const detailVisible = ref(false);
const detailTemplate = ref<CouponTemplateItem | null>(null);

function openDetail(c: CouponTemplateItem) {
  detailTemplate.value = c;
  detailVisible.value = true;
}

const typeLabel = (t: string) => couponTypeLabel(t);
const shopText = (id?: string | null) => (id ? locale.t('couponList.storeShop').replace('{id}', id) : locale.t('couponList.platform'));

const valueText = (c: CouponTemplateItem): string => {
  switch (c.type) {
    case 'FIXED':
      return locale.t('couponList.valueFixed').replace('{min}', fmtCNY(c.minSpend)).replace('{val}', fmtCNY(c.discountValue));
    case 'PERCENT':
      return locale.t('couponList.valuePercent').replace('{min}', fmtCNY(c.minSpend)).replace('{disc}', String(c.discountValue / 10));
    case 'FULL':
      return locale.t('couponList.valueFull').replace('{val}', fmtCNY(c.discountValue));
    case 'FREE_SHIPPING':
      return locale.t('couponList.valueFreeShipping');
    default:
      return '';
  }
};

function fmtDT(t?: string | null): string {
  if (!t) return locale.t('couponList.unlimited');
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const validText = (c: CouponTemplateItem): string => {
  if (!c.startsAt && !c.endsAt) return locale.t('couponList.unlimited');
  return locale.t('couponList.validRange').replace('{start}', fmtDT(c.startsAt)).replace('{end}', fmtDT(c.endsAt));
};

async function load() {
  loading.value = true;
  try {
    const res = await fetchCouponTemplates({ skip: 0, take: PAGE });
    items.value = res.items;
    totalItems.value = res.totalItems;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value && totalItems.value > 0) return;
  loadingMore.value = true;
  try {
    const res = await fetchCouponTemplates({ skip: items.value.length, take: PAGE });
    totalItems.value = res.totalItems;
    items.value = items.value.concat(res.items);
  } finally {
    loadingMore.value = false;
  }
}

function onCreate() { uni.navigateTo({ url: '/pages/coupon/edit/index' }); }
function onEdit(c: CouponTemplateItem) { uni.navigateTo({ url: `/pages/coupon/edit/index?id=${c.id}` }); }

const toggling = ref(false);

function onToggle(c: CouponTemplateItem) {
  const enable = !c.enabled;
  uni.showModal({
    title: enable ? locale.t('couponList.enableTitle') : locale.t('couponList.disableTitle'),
    content: enable
      ? locale.t('couponList.enableContent').replace('{name}', c.name)
      : locale.t('couponList.disableContent').replace('{name}', c.name),
    success: async (r) => {
      if (!r.confirm) return;
      if (toggling.value) return;
      toggling.value = true;
      try {
        await setCouponTemplateEnabled(c.id, enable);
        c.enabled = enable;
        uni.showToast({ title: enable ? locale.t('couponList.enabled') : locale.t('couponList.disabled'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('couponList.opFailed'), icon: 'none' });
      } finally {
        toggling.value = false;
      }
    },
  });
}

function onDelete(c: CouponTemplateItem) {
  uni.showModal({
    title: locale.t('couponList.delTitle'),
    content: locale.t('couponList.delContent').replace('{name}', c.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteCouponTemplate(c.id);
        items.value = items.value.filter((x) => x.id !== c.id);
        uni.showToast({ title: locale.t('couponList.deleted'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('couponList.delFailed'), icon: 'none' });
      }
    },
  });
}

onMounted(load);
onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh(); });
onReachBottom(loadMore);
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar .add { width: 300rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .top { display: flex; align-items: center; justify-content: space-between;
      .head { display: flex; align-items: center; flex-wrap: wrap;
        .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
        .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 8rpx;
          &.fixed { background: #f0821f; }
          &.percent { background: #2563eb; }
          &.full { background: #0a9c6e; }
          &.free_shipping { background: #7c3aed; }
          &.off { background: #bbb; }
          &.tag { background: transparent; color: #2563eb; border: 1rpx solid #2563eb; }
        }
      }
      .value { font-size: 28rpx; color: $wa-danger; font-weight: 700; flex-shrink: 0; margin-left: 12rpx; }
    }
    .rows { margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $wa-rule;
      .row { display: flex; margin-bottom: 10rpx;
        .kv { flex: 1; display: flex; align-items: center;
          .k { font-size: 22rpx; color: $wa-muted; margin-right: 12rpx; flex-shrink: 0; }
          .v { font-size: 24rpx; color: $wa-ink; }
        }
      }
    }
    .ops { margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-wrap: wrap; align-items: center;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
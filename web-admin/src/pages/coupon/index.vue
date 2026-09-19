<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ 新建优惠券</button>
    </view>

    <view class="card" v-for="c in items" :key="c.id">
      <view class="top" @tap="onEdit(c)">
        <view class="head">
          <text class="name">{{ c.name }}</text>
          <text class="badge" :class="c.type.toLowerCase()">{{ typeLabel(c.type) }}</text>
          <text class="badge tag" v-if="c.claimable">可领取</text>
          <text class="badge tag" v-if="c.claimCode">凭码领券</text>
          <text class="badge tag" v-if="c.newCustomerOnly">仅新客</text>
          <text class="badge tag" v-if="c.scope === 'SKU'">指定商品</text>
          <text class="badge off" v-if="!c.enabled">停用</text>
        </view>
        <view class="value">{{ valueText(c) }}</view>
      </view>
      <view class="rows">
        <view class="row">
          <view class="kv">
            <text class="k">限量</text>
            <text class="v">{{ c.totalCount === 0 ? '不限' : c.totalCount }}{{ c.claimedCount ? `（已发 ${c.claimedCount}）` : '' }}</text>
          </view>
          <view class="kv">
            <text class="k">有效期</text>
            <text class="v">{{ validText(c) }}</text>
          </view>
        </view>
        <view class="row">
          <view class="kv">
            <text class="k">每人限领</text>
            <text class="v">{{ c.perUserLimit === 0 ? '不限' : c.perUserLimit }}</text>
          </view>
          <view class="kv">
            <text class="k">归属店铺</text>
            <text class="v">{{ shopText(c.shopId) }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onToggle(c)">{{ c.enabled ? '停用' : '启用' }}</text>
        <text @tap="onEdit(c)">编辑</text>
        <text @tap="openDetail(c)">明细</text>
        <text class="del" @tap="onDelete(c)">删除</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">暂无优惠券</view>
    <view v-if="loading" class="empty">加载中…</view>
    <view v-if="loadingMore" class="empty">加载更多…</view>

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
const shopText = (id?: string | null) => (id ? `店 ${id}` : '平台');

const valueText = (c: CouponTemplateItem): string => {
  switch (c.type) {
    case 'FIXED':
      return `满 ${fmtCNY(c.minSpend)} 减 ${fmtCNY(c.discountValue)}`;
    case 'PERCENT':
      return `满 ${fmtCNY(c.minSpend)} 打 ${c.discountValue / 10} 折`;
    case 'FULL':
      return `直减 ${fmtCNY(c.discountValue)}`;
    case 'FREE_SHIPPING':
      return '免邮';
    default:
      return '';
  }
};

function fmtDT(t?: string | null): string {
  if (!t) return '不限';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const validText = (c: CouponTemplateItem): string => {
  if (!c.startsAt && !c.endsAt) return '不限';
  return `${fmtDT(c.startsAt)} 至 ${fmtDT(c.endsAt)}`;
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

async function onToggle(c: CouponTemplateItem) {
  try {
    await setCouponTemplateEnabled(c.id, !c.enabled);
    c.enabled = !c.enabled;
    uni.showToast({ title: c.enabled ? '已启用' : '已停用', icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' });
  }
}

function onDelete(c: CouponTemplateItem) {
  uni.showModal({
    title: '删除', content: `确认删除「${c.name}」？删除后不可恢复；若该模板已发放券，删除将被阻止并提示数量。`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteCouponTemplate(c.id);
        items.value = items.value.filter((x) => x.id !== c.id);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' });
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
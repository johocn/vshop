<template>
  <view class="page">
    <view class="seg">
      <view class="seg-item" :class="{ on: tab === 'pending' }" @tap="switchTab('pending')">{{ $t('platformProductApproval.tabPending') }}</view>
      <view class="seg-item" :class="{ on: tab === 'approved' }" @tap="switchTab('approved')">{{ $t('platformProductApproval.tabApproved') }}</view>
    </view>

    <view class="head-row">
      <text class="head-title">{{ tab === 'pending' ? $t('platformProductApproval.pendingTitle') : $t('platformProductApproval.approvedTitle') }}</text>
      <text class="head-ops">{{ tab === 'pending' ? vendors : approvedCount }}</text>
    </view>

    <!-- 待审 -->
    <template v-if="tab === 'pending'">
      <view class="card" v-for="p in products" :key="p.id">
        <view class="row head">
          <view class="lt">
            <text class="title">{{ p.name }}</text>
          </view>
          <text class="badge">{{ badgeText(p.marketplaceStatus) }}</text>
        </view>
        <view class="reject" v-if="p.marketplaceStatus === 'rejected' && p.rejectReason">
          {{ $t('platformProductApproval.rejectReason').replace('{reason}', p.rejectReason) }}
        </view>
        <view class="meta-row">
          <text class="tl">{{ $t('platformProductApproval.platformCategory') }}</text>
          <text class="cat" :class="{ todo: !p.platformCategoryId }">
            {{ p.platformCategoryId ? catName(p.platformCategoryId) : $t('platformProductApproval.pendingClassify') }}
          </text>
        </view>
        <view class="row foot">
          <text class="btn danger" @tap="onReject(p)">{{ $t('platformProductApproval.reject') }}</text>
          <text class="btn primary" @tap="onPickCategory(p)">{{ $t('platformProductApproval.setCategory') }}</text>
          <text class="btn success" @tap="onApprove(p)">{{ $t('platformProductApproval.approve') }}</text>
        </view>
      </view>
      <view v-if="!products.length" class="empty">{{ $t('platformProductApproval.emptyPending') }}</view>
    </template>

    <!-- 已过审：产品名称一行 + 状态 + 平台分类(或待归类) + 设置分类 -->
    <template v-else>
      <view class="card" v-for="p in approved" :key="p.id">
        <view class="row head">
          <view class="lt">
            <text class="tl">{{ $t('platformProductApproval.productName') }}</text>
            <text class="title">{{ p.name }}</text>
          </view>
          <text class="badge good">{{ $t('platformProductApproval.approvedBadge') }}</text>
        </view>
        <view class="meta-row">
          <text class="tl">{{ $t('platformProductApproval.platformCategory') }}</text>
          <text class="cat" :class="{ todo: !p.platformCategoryId }">
            {{ p.platformCategoryId ? catName(p.platformCategoryId) : $t('platformProductApproval.pendingClassify') }}
          </text>
        </view>
        <view class="row foot">
          <text class="btn plain" v-if="p.platformCategoryId" @tap="onClearCategory(p)">{{ $t('platformProductApproval.clearCategory') }}</text>
          <text class="btn primary" @tap="onPickCategory(p)">{{ $t('platformProductApproval.setCategory') }}</text>
        </view>
      </view>
      <view v-if="!approved.length" class="empty">{{ $t('platformProductApproval.emptyApproved') }}</view>
    </template>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchPendingProducts,
  approveProduct,
  rejectProduct,
  fetchApprovedProducts,
  setProductPlatformCategory,
  type MarketplaceApprovalItem,
  type ApprovedItem,
} from '@/apis/marketplace';
import { fetchPlatformCollections, buildCollectionTree } from '@/apis/collection';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const tab = ref<'pending' | 'approved'>('pending');
const products = ref<MarketplaceApprovalItem[]>([]);
const approved = ref<ApprovedItem[]>([]);
const collTree = ref<Array<{ id: string; name: string; depth: number }>>([]);
const approvedCount = ref(0);
const vendors = ref(products.value.length);

onShow(load);

function switchTab(t: 'pending' | 'approved') {
  tab.value = t;
  load();
}

async function load() {
  try {
    if (tab.value === 'pending') {
      const [list, c] = await Promise.all([fetchPendingProducts(), loadCollections()]);
      products.value = list;
      collTree.value = c;
      vendors.value = list.length;
    } else {
      const [a, c] = await Promise.all([fetchApprovedProducts(), loadCollections()]);
      approved.value = a;
      approvedCount.value = a.length;
      collTree.value = c;
    }
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('platformProductApproval.loadFailed'), icon: 'none' });
  }
}

async function loadCollections(): Promise<Array<{ id: string; name: string; depth: number }>> {
  try {
    // 平台（默认租户）分类，而非登录租户自己的分类
    const list = await fetchPlatformCollections();
    return buildCollectionTree(list);
  } catch {
    return collTree.value;
  }
}

function catName(id: string): string {
  const hit = collTree.value.find((c) => String(c.id) === String(id));
  return hit ? hit.name.trim() : id;
}

function badgeText(status: string | null) {
  if (status === 'rejected') return locale.t('platformProductApproval.badgeRejected');
  return locale.t('platformProductApproval.tabPending');
}

function onApprove(p: MarketplaceApprovalItem) {
  if (!p.platformCategoryId) {
    uni.showToast({ title: locale.t('platformProductApproval.needCategory'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('platformProductApproval.approveTitle'),
    content: locale.t('platformProductApproval.approveContent').replace('{name}', p.name),
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await approveProduct(p.id);
        uni.showToast({ title: locale.t('platformProductApproval.approvedToast'), icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('platformProductApproval.opFailed'), icon: 'none' });
      }
    },
  });
}

function onReject(p: MarketplaceApprovalItem) {
  uni.showModal({
    title: locale.t('platformProductApproval.rejectTitle'),
    editable: true,
    placeholderText: locale.t('platformProductApproval.rejectPh'),
    success: async (r: any) => {
      if (!r.confirm) return;
      const reason = (r.content || '').trim();
      if (!reason) {
        uni.showToast({ title: locale.t('platformProductApproval.rejectNeedReason'), icon: 'none' });
        return;
      }
      try {
        await rejectProduct(p.id, reason);
        uni.showToast({ title: locale.t('platformProductApproval.rejectedToast'), icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('platformProductApproval.opFailed'), icon: 'none' });
      }
    },
  });
}

function onPickCategory(p: { id: string }) {
  if (!collTree.value.length) {
    uni.showToast({ title: locale.t('platformProductApproval.noCategory'), icon: 'none' });
    return;
  }
  uni.showActionSheet({
    itemList: collTree.value.map((c) => c.name.trim()),
    success: async (r: any) => {
      const c = collTree.value[r.tapIndex];
      if (!c) return;
      try {
        await setProductPlatformCategory(p.id, String(c.id));
        uni.showToast({ title: locale.t('platformProductApproval.categorized'), icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('platformProductApproval.setFailed'), icon: 'none' });
      }
    },
  });
}

function onClearCategory(p: ApprovedItem) {
  uni.showModal({
    title: locale.t('platformProductApproval.clearTitle'),
    content: locale.t('platformProductApproval.clearContent').replace('{name}', p.name),
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await setProductPlatformCategory(p.id, '');
        uni.showToast({ title: locale.t('platformProductApproval.cleared'), icon: 'success' });
        load();
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('platformProductApproval.opFailed'), icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.seg { display: flex; background: #f2f3f5; border-radius: 16rpx; padding: 6rpx; margin-bottom: 20rpx; }
.seg-item { flex: 1; text-align: center; padding: 14rpx 0; border-radius: 12rpx; font-size: 27rpx; color: #666; }
.seg-item.on { background: #fff; color: $pm-success; font-weight: 700; box-shadow: 0 2rpx 8rpx rgba(0,0,0,.06); }
.head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.head-title { font-size: 30rpx; font-weight: 700; color: $wa-ink; }
.head-ops { font-size: 26rpx; color: #999; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display: flex; align-items: center; justify-content: space-between; }
.head { margin-bottom: 16rpx; }
.lt { flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.title { display: block; font-size: 30rpx; font-weight: 700; color: $wa-ink; word-break: break-all; }
.tl { display: block; font-size: 22rpx; color: #999; }
.badge { flex: 0 0 auto; padding: 6rpx 18rpx; border-radius: 999rpx; font-size: 22rpx; }
.badge.good { background: #e8f7ee; color: $pm-success; }
.reject { background: #fdecea; color: $wa-danger; font-size: 24rpx; border-radius: 12rpx; padding: 16rpx 20rpx; margin-bottom: 16rpx; }
.meta-row { display: flex; gap: 14rpx; align-items: center; padding: 12rpx 0; }
.meta-row .tl { font-size: 24rpx; }
.cat { font-size: 26rpx; font-weight: 600; color: $wa-ink; }
.cat.todo { color: #e05500; font-weight: 500; }
.foot { gap: 16rpx; justify-content: flex-end; }
.btn { padding: 12rpx 34rpx; border-radius: 999rpx; font-size: 26rpx; }
.btn.success { background: $pm-success; color: #fff; }
.btn.primary { background: $pm-success; color: #fff; }
.btn.plain { border: 1.5rpx solid #d9d9d9; color: #666; }
.btn.danger { border: 1.5rpx solid $wa-danger; color: $wa-danger; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; font-size: 26rpx; }
</style>
<template>
  <view class="page">
    <view class="toolbar">
      <input
        v-model="term"
        class="search"
        placeholder="{{ locale.t('productList.searchPlaceholder') }}"
        confirm-type="search"
        @confirm="load(0)"
      />
      <text class="link" @tap="goCats">{{ locale.t('menu.category') }}</text>
    </view>
    <view class="tabs">
      <text
        v-for="t in tabs"
        :key="t.value"
        class="tab"
        :class="{ on: filter === t.value }"
        @tap="switchFilter(t.value)"
      >{{ locale.t(t.label) }}</text>
    </view>

    <!-- 批量选择工具栏入口 -->
    <view class="bulkbar" :class="{ on: bulkMode }">
      <view class="bulk-left">
        <text v-if="bulkMode" class="bulk-tip">
          <text class="bulk-count">{{ selectedCount }}</text> {{ locale.t('productList.bulkSelectedSuffix') }}
        </text>
        <text v-else class="bulk-off">{{ locale.t('productList.bulkSingle') }}</text>
      </view>
      <view class="bulk-right">
        <text v-if="bulkMode" class="bulk-cancel" @tap="exitBulk">{{ locale.t('productList.cancel') }}</text>
        <text v-else class="bulk-enter" @tap="enterBulk">{{ locale.t('productList.bulkManage') }}</text>
      </view>
    </view>

    <view class="card" v-for="p in items" :key="p.id" @tap="bulkMode ? toggleSel(p) : edit(p)">
      <view class="body">
        <view v-if="bulkMode" class="check" :class="{ on: selected.has(p.id) }">
          <text class="tick">{{ selected.has(p.id) ? '✓' : '' }}</text>
        </view>
        <image
          v-if="p.thumb"
          class="thumb"
          :src="p.thumb"
          mode="aspectFill"
        />
        <view v-else class="thumb thumb-empty">{{ locale.t('productList.thumbEmpty') }}</view>
        <view class="meta">
          <text class="name">{{ p.name }}</text>
          <text class="slug">{{ p.slug }}</text>
          <view class="price-row">
            <text class="price">¥{{ p.priceYuan }}</text>
            <text class="stock" :class="{ low: p.low }">{{ locale.t('productList.stockLabel').replace('{n}', p.stock) }}<text v-if="p.low"> · {{ locale.t('productList.lowStock') }}</text></text>
          </view>
          <text class="st" :class="{ off: !p.enabled }">{{ p.enabled ? locale.t('productList.tabOn') : locale.t('productList.tabOff') }}</text>
          <view v-if="!bulkMode" class="mkt-ops">
            <text v-if="mktStatus(p) === 'productList.mktPending'" class="mkt-txt pending">{{ locale.t('productList.mktPending') }}</text>
            <text v-else-if="mktStatus(p) === 'productList.mktListed'" class="mkt-txt ok">{{ locale.t('productList.mktListed') }}</text>
            <text v-else-if="mktStatus(p) === 'productList.mktRejected'" class="mkt-txt rej">{{ locale.t('productList.mktRejected') }}</text>
            <text v-else class="mkt-btn" @tap.stop="onSubmitMarketplace(p)">{{ locale.t('productList.mktSubmit') }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="!items.length" class="empty">{{ locale.t('productList.empty') }}</view>
    <view v-else-if="hasMore" class="more" @tap="load()">{{ locale.t('productList.loadMore') }}</view>

    <!-- 批量操作栏 -->
    <view v-if="bulkMode" class="bulk-ops">
      <text class="op" @tap="onBulkSet(true)">{{ locale.t('productList.bulkEnable') }}</text>
      <text class="op danger" @tap="onBulkSet(false)">{{ locale.t('productList.bulkDisable') }}</text>
      <text class="op" @tap="onBulkStock">{{ locale.t('productList.bulkStock') }}</text>
    </view>

    <view style="height: 160rpx" />
    <BottomBar current="product" />
  </view>
</template>
<script lang="ts" setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import BottomBar from '../../../components/BottomBar.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchProductList,
  bulkSetProductsEnabled,
  bulkSetVariantsStock,
  type ProductListRow,
} from '../../../apis/product';
import { submitProductToMarketplace } from '../../../apis/marketplace';

const term = ref('');
const locale = useLocaleStore();
const filter = ref<'all' | 'on' | 'off'>('all');
const items = ref<ProductListRow[]>([]);
const total = ref(0);
const loading = ref(false);

// 批量管理模式
const bulkMode = ref(false);
const selected = reactive(new Set<string>());
const selectedCount = computed(() => selected.size);

function enterBulk() {
  bulkMode.value = true;
  selected.clear();
}
function exitBulk() {
  bulkMode.value = false;
  selected.clear();
}
function toggleSel(p: ProductListRow) {
  if (selected.has(p.id)) selected.delete(p.id);
  else selected.add(p.id);
}

const tabs: Array<{ value: 'all' | 'on' | 'off'; label: string }> = [
  { value: 'all', label: 'productList.tabAll' },
  { value: 'on', label: 'productList.tabOn' },
  { value: 'off', label: 'productList.tabOff' },
];

const hasMore = computed(() => items.value.length < total.value);

async function load(reset = items.value.length === 0) {
  if (loading.value) return;
  loading.value = true;
  try {
    const skip = reset ? 0 : items.value.length;
    const q: Parameters<typeof fetchProductList>[0] = {
      take: 20,
      skip,
      term: term.value || undefined,
    };
    if (filter.value === 'on') q.enabled = true;
    else if (filter.value === 'off') q.enabled = false;
    const res = await fetchProductList(q);
    items.value = reset ? res.items : [...items.value, ...res.items];
    total.value = res.totalItems;
  } finally {
    loading.value = false;
  }
}

function switchFilter(v: 'all' | 'on' | 'off') {
  filter.value = v;
  load(0);
}

onMounted(() => load(0));

// 页面开启了 enablePullDownRefresh，但此前未实现 onPullDownRefresh，
// 下拉时刷新圈出现后永远不消失、也无数据重载，表现为「下拉刷新加载缓慢/卡住」。
onPullDownRefresh(async () => {
  await load(0);
  uni.stopPullDownRefresh();
});

function goCats() { uni.navigateTo({ url: '/pages/product/categories/index' }); }
function edit(p: ProductListRow) { uni.navigateTo({ url: `/pages/product/edit/index?id=${p.id}` }); }

function mktStatus(p: { marketplaceStatus?: string | null }): string | null {
  if (p.marketplaceStatus === 'approved') return 'productList.mktListed';
  if (p.marketplaceStatus === 'pending') return 'productList.mktPending';
  if (p.marketplaceStatus === 'rejected') return 'productList.mktRejected';
  return null; // 未提审
}
function onSubmitMarketplace(p: ProductListRow) {
  uni.showModal({
    title: locale.t('productList.submitListTitle'),
    content: locale.t('productList.submitListContent').replace('{name}', p.name),
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await submitProductToMarketplace(p.id);
        uni.showToast({ title: locale.t('productList.mktPending'), icon: 'success' });
        load(0);
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('productList.submitFailed'), icon: 'none' });
      }
    },
  });
}

// ---- 批量操作 ----
async function onBulkSet(enabled: boolean) {
  if (!selectedCount.value) return;
  const ids = Array.from(selected);
  const label = enabled ? locale.t('productList.bulkEnable') : locale.t('productList.bulkDisable');
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: locale.t('productList.bulkDialogTitle').replace('{label}', label),
      content: locale.t('productList.bulkDialogContent').replace('{label}', label).replace('{n}', ids.length),
      success: (r: any) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  try {
    const count = await bulkSetProductsEnabled(ids, enabled);
    uni.showToast({ title: locale.t('productList.bulkDone').replace('{label}', label).replace('{n}', count), icon: 'success' });
    exitBulk();
    load(0);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('productList.bulkFailed').replace('{label}', label), icon: 'none' });
  }
}

async function onBulkStock() {
  if (!selectedCount.value) return;
  const targets = items.value.filter(
    (p) => selected.has(p.id) && p.firstVariantId,
  );
  if (!targets.length) {
    uni.showToast({ title: locale.t('productList.bulkNoVariant'), icon: 'none' });
    return;
  }
  uni.showModal({
    title: locale.t('productList.bulkStockTitle').replace('{n}', targets.length),
    editable: true,
    // editable 弹窗的 content 即输入框初始值：必须留空，否则会把说明文字当输入文本预填，
    // 用户得先清空才能输入。提示文案放 placeholderText。
    content: '',
    placeholderText: locale.t('productList.bulkStockPlaceholder'),
    success: async (r: any) => {
      if (!r.confirm) return;
      const text = (r.content ?? '').toString().trim();
      if (!text) {
        uni.showToast({ title: locale.t('productList.bulkStockEmpty'), icon: 'none' });
        return;
      }
      const stock = parseInt(text, 10);
      if (isNaN(stock) || stock < 0) {
        uni.showToast({ title: locale.t('productList.bulkStockInvalid'), icon: 'none' });
        return;
      }
      const updates = targets.map((p) => ({
        variantId: p.firstVariantId!,
        stock,
      }));
      try {
        const count = await bulkSetVariantsStock(updates);
        uni.showToast({ title: locale.t('productList.bulkStockDone').replace('{n}', count), icon: 'success' });
        exitBulk();
        load(0);
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('productList.bulkStockFailed'), icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar {
    display: flex; align-items: center; margin-bottom: 20rpx;
    .search { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx; font-size: 28rpx; }
    .link { margin-left: 24rpx; color: $wa-muted; font-size: 28rpx; }
  }
  .tabs {
    display: flex; margin-bottom: 24rpx;
    .tab {
      font-size: 28rpx; color: $wa-muted; margin-right: 40rpx; padding-bottom: 8rpx;
      &.on { color: $wa-accent; font-weight: 600; border-bottom: 4rpx solid $wa-accent; }
    }
  }
  .card {
    background: $wa-card; border-radius: $wa-radius; padding: 24rpx; margin-bottom: 20rpx;
    .body { display: flex; align-items: center; }
    .thumb {
      width: 140rpx; height: 140rpx; border-radius: $wa-radius; flex-shrink: 0; background: $wa-bg;
    }
    .thumb-empty {
      display: flex; align-items: center; justify-content: center; color: $wa-muted; font-size: 24rpx;
    }
    .meta {
      flex: 1; margin-left: 24rpx; display: flex; flex-direction: column;
      .name { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
      .slug { font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; }
      .price-row { display: flex; align-items: baseline; margin-top: 12rpx;
        .price { font-size: 32rpx; color: $wa-accent; font-weight: 600; }
        .stock { font-size: 24rpx; color: $wa-muted; margin-left: 20rpx; &.low { color: #e53935; font-weight: 600; } }
      }
      .st {
        align-self: flex-start; margin-top: 10rpx; font-size: 22rpx; color: $wa-success; padding: 2rpx 14rpx;
        border-radius: $wa-radius; background: rgba(67, 160, 71, 0.12);
        &.off { color: $wa-muted; background: $wa-bg; }
      }
      .mkt-ops { margin-top: 12rpx; }
      .mkt-btn { align-self: flex-start; font-size: 22rpx; color: $wa-accent; border: 1rpx solid $wa-accent; border-radius: $wa-radius; padding: 4rpx 18rpx; }
      .mkt-txt { align-self: flex-start; font-size: 22rpx; }
      .mkt-txt.pending { color: #f59e0b; }
      .mkt-txt.ok { color: #52c41a; }
      .mkt-txt.rej { color: #e64340; }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .more {
    text-align: center; color: $wa-accent; font-size: 28rpx; padding: 24rpx 0;
  }
  .bulkbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20rpx; padding: 16rpx 24rpx; border-radius: $wa-radius;
    background: $wa-card;
    &.on { background: rgba(243, 214, 73, 0.14); }
    .bulk-left {
      .bulk-tip { font-size: 28rpx; color: $wa-ink;
        .bulk-count { color: $wa-accent; font-weight: 700; }
      }
      .bulk-off { font-size: 26rpx; color: $wa-muted; }
    }
    .bulk-right {
      .bulk-enter { font-size: 26rpx; color: $wa-accent; font-weight: 600; }
      .bulk-cancel { font-size: 26rpx; color: $wa-muted; }
    }
  }
  .check {
    width: 44rpx; height: 44rpx; border-radius: 50%;
    border: 2rpx solid #c9cdd4; margin-right: 20rpx; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; background: #fff;
    .tick { color: #fff; font-size: 26rpx; line-height: 1; }
    &.on { background: $wa-accent; border-color: $wa-accent; }
  }
  .bulk-ops {
    position: fixed; left: 0; right: 0; bottom: 100rpx; z-index: 20;
    display: flex; justify-content: space-around; align-items: center;
    background: $wa-ink; padding: 24rpx 0;
    .op {
      font-size: 30rpx; color: #fff; text-align: center; flex: 1;
      &.danger { color: #ff7875; }
    }
  }
}
</style>
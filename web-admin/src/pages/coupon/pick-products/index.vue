<template>
  <view class="page">
    <view class="searchbar">
      <input class="sinput" v-model="term" :placeholder="$t('couponPick.searchPh')" confirm-type="search" @confirm="reload" />
      <text class="sbtn" @tap="reload">{{ $t('couponPick.search') }}</text>
    </view>

    <view class="toolbar">
      <text class="only-on" :class="{ on: onlineOnly }" @tap="toggleOnlineOnly">{{ $t('couponPick.onlineOnly') }}</text>
      <text class="all" @tap="toggleSelectAll">{{ allSelected ? $t('couponPick.unselectAllPage') : $t('couponPick.selectAllPage') }}</text>
    </view>

    <view class="card" v-for="p in items" :key="p.id">
      <view class="row">
        <text class="cb" :class="{ on: isSelected(p.id) }" @tap.stop="toggleSelect(p.id)">{{ isSelected(p.id) ? '✓' : '' }}</text>
        <image v-if="p.thumb" class="thumb" :src="p.thumb" mode="aspectFill" />
        <view class="info" @tap="toggleSelect(p.id)">
          <text class="name">{{ p.name }}</text>
          <text class="sub">{{ $t('couponPick.variantCount').replace('{n}', String(p.variants.length)) }}</text>
        </view>
        <text class="expand" @tap.stop="toggleExpand(p.id)">{{ isExpanded(p.id) ? $t('couponPick.collapse') : $t('couponPick.expand') }}</text>
      </view>
      <view class="skus" v-if="isExpanded(p.id)">
        <view class="sku" v-for="v in p.variants" :key="v.id">
          <text class="sku-code">{{ v.sku || '—' }}</text>
          <text class="sku-price">¥{{ v.priceYuan.toFixed(2) }}</text>
          <text class="sku-stock">{{ $t('couponPick.stock').replace('{n}', String(v.stock)) }}</text>
        </view>
        <text class="sku-tip">{{ $t('couponPick.skuTip') }}</text>
      </view>
    </view>

    <view v-if="!items.length && !loading" class="empty">{{ $t('couponPick.empty') }}</view>
    <view v-if="loading" class="empty">{{ $t('couponPick.loading') }}</view>
    <view v-if="loadingMore" class="empty">{{ $t('couponPick.loadingMore') }}</view>

    <view class="foot">
      <text class="sel">{{ $t('couponPick.selected').replace('{n}', String(selected.length)).replace('{m}', String(selectedSkuCount)) }}</text>
      <button class="confirm" :disabled="!selected.length || binding" @tap="onConfirm">
        {{ binding ? $t('couponPick.binding') : $t('couponPick.confirm') }}
      </button>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { onLoad, onReachBottom } from '@dcloudio/uni-app';
import { fetchPickerProducts, type PickerProductRow } from '../../../apis/product';
import { bindProductsToCoupon } from '../../../apis/coupon';
import { useLocaleStore } from '../../../stores/localeStore';

const locale = useLocaleStore();

const templateId = ref<string | null>(null);
const term = ref('');
const onlineOnly = ref(true);

const items = ref<PickerProductRow[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const PAGE = 20;

const selected = ref<string[]>([]);
const expanded = ref<string[]>([]);
const binding = ref(false);

const isSelected = (id: string) => selected.value.includes(id);
const isExpanded = (id: string) => expanded.value.includes(id);

function toggleSelect(id: string) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push(id);
}

function toggleExpand(id: string) {
  const i = expanded.value.indexOf(id);
  if (i >= 0) expanded.value.splice(i, 1);
  else expanded.value.push(id);
}

/** 已选商品覆盖的规格总数（全选商品 = 全规格适用） */
const selectedSkuCount = computed(() => {
  let n = 0;
  for (const p of items.value) {
    if (isSelected(p.id)) n += p.variants.length;
  }
  return n;
});

const allSelected = computed(() => items.value.length > 0 && items.value.every((p) => isSelected(p.id)));

function toggleSelectAll() {
  if (allSelected.value) {
    const ids = new Set(items.value.map((p) => p.id));
    selected.value = selected.value.filter((id) => !ids.has(id));
  } else {
    const set = new Set(selected.value);
    for (const p of items.value) set.add(p.id);
    selected.value = Array.from(set);
  }
}

function toggleOnlineOnly() {
  onlineOnly.value = !onlineOnly.value;
  reload();
}

async function load(skip = 0) {
  const res = await fetchPickerProducts({
    take: PAGE,
    skip,
    term: term.value.trim() || undefined,
    enabled: onlineOnly.value ? true : undefined,
  });
  totalItems.value = res.totalItems;
  items.value = skip === 0 ? res.items : items.value.concat(res.items);
}

async function reload() {
  loading.value = true;
  try {
    await load(0);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponPick.loadFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value) return;
  if (items.value.length >= totalItems.value) return;
  loadingMore.value = true;
  try {
    await load(items.value.length);
  } finally {
    loadingMore.value = false;
  }
}

async function onConfirm() {
  if (!templateId.value || !selected.value.length || binding.value) return;
  binding.value = true;
  try {
    const created = await bindProductsToCoupon(templateId.value, selected.value);
    uni.showToast({
      title: created > 0
        ? locale.t('couponPick.bound').replace('{n}', String(created))
        : locale.t('couponPick.boundNone'),
      icon: 'none',
    });
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponPick.bindFailed'), icon: 'none' });
  } finally {
    binding.value = false;
  }
}

onLoad((query: any) => {
  if (query?.templateId) templateId.value = query.templateId as string;
});

onMounted(reload);
onReachBottom(loadMore);
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 180rpx;
  .searchbar { display: flex; align-items: center; margin-bottom: 20rpx;
    .sinput { flex: 1; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 20rpx; font-size: 28rpx; color: $wa-ink; box-sizing: border-box; }
    .sbtn { flex-shrink: 0; margin-left: 16rpx; font-size: 26rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 14rpx 28rpx; } }
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx;
    .only-on { font-size: 24rpx; color: $wa-muted; border: 1rpx solid $wa-rule; border-radius: 999rpx; padding: 6rpx 24rpx;
      &.on { color: #fff; background: $wa-accent; border-color: $wa-accent; } }
    .all { font-size: 26rpx; color: $wa-accent; } }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 20rpx 24rpx; margin-bottom: 16rpx;
    .row { display: flex; align-items: center;
      .cb { width: 40rpx; height: 40rpx; border-radius: 8rpx; border: 2rpx solid $wa-rule; color: transparent; text-align: center; line-height: 38rpx; font-size: 26rpx; flex-shrink: 0; margin-right: 16rpx;
        &.on { background: $wa-accent; border-color: $wa-accent; color: #fff; } }
      .thumb { width: 72rpx; height: 72rpx; border-radius: 8rpx; background: $wa-rule; margin-right: 16rpx; flex-shrink: 0; }
      .info { flex: 1; margin-right: 12rpx;
        .name { display: block; font-size: 28rpx; color: $wa-ink; }
        .sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 6rpx; } }
      .expand { flex-shrink: 0; font-size: 24rpx; color: $wa-accent; } }
    .skus { margin-top: 16rpx; padding-top: 12rpx; border-top: 1rpx dashed $wa-rule;
      .sku { display: flex; align-items: center; justify-content: space-between; padding: 8rpx 0;
        .sku-code { font-size: 24rpx; color: $wa-ink; flex: 1; }
        .sku-price { font-size: 24rpx; color: $wa-danger; margin-right: 24rpx; }
        .sku-stock { font-size: 22rpx; color: $wa-muted; } }
      .sku-tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: $wa-muted; } } }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
  .foot { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; padding: 20rpx 32rpx; background: #fff; box-shadow: 0 -2rpx 12rpx rgba(0,0,0,.04);
    .sel { font-size: 26rpx; color: $wa-ink; }
    .confirm { margin: 0; font-size: 28rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; line-height: 76rpx; padding: 0 48rpx;
      &[disabled] { opacity: .5; } } }
}
</style>
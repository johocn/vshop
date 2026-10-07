<template>
  <view class="cbc">
    <!-- 已绑商品列表 -->
    <view class="cbc-head">
      <text class="cbc-count">{{ boundText }}</text>
    </view>
    <view class="cbc-list">
      <view class="cbc-row" v-for="r in boundRows" :key="r.productId">
        <view class="cbc-info">
          <text class="cbc-name">{{ r.name }}</text>
          <text class="cbc-sub">{{ r.sub }}</text>
        </view>
        <text class="cbc-op unbind" @tap="onUnbind(r)">{{ $t('couponBinding.unbind') }}</text>
      </view>
      <view v-if="!boundRows.length && !loading" class="cbc-empty">{{ $t('couponBinding.boundNone') }}</view>
      <view v-if="loading" class="cbc-empty">{{ $t('couponBinding.loading') }}</view>
    </view>

    <!-- 商品搜索 -->
    <view class="cbc-search">
      <input class="cbc-ipt" v-model="term" :placeholder="$t('couponBinding.searchPh')" confirm-type="search" @confirm="doSearch" />
      <text class="cbc-btn" @tap="doSearch">{{ $t('couponBinding.search') }}</text>
    </view>
    <view class="cbc-list">
      <view class="cbc-row" v-for="p in results" :key="p.id">
        <view class="cbc-info">
          <text class="cbc-name">{{ p.name }}</text>
          <text class="cbc-sub">{{ resultSub(p) }}</text>
        </view>
        <text class="cbc-op bind" @tap="onBind(p)">+ {{ $t('couponBinding.bind') }}</text>
      </view>
      <view v-if="searched && !results.length && !searching" class="cbc-empty">{{ $t('couponBinding.empty') }}</view>
      <view v-if="searching" class="cbc-empty">{{ $t('couponBinding.loading') }}</view>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { fetchPickerProducts, type PickerProductRow } from '../../apis/product';
import {
  fetchCouponBoundProducts, bindProductsToCoupon, unbindProductFromCoupon,
  type CouponBoundProductRow,
} from '../../apis/coupon';
import { useLocaleStore } from '../../stores/localeStore';

const props = defineProps<{ templateId: string }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const locale = useLocaleStore();

interface BoundRow {
  productId: string;
  /** variantIds 为空 = 全规格适用 */
  variantIds: string[] | null;
  name: string;
  sub: string;
}

const loading = ref(false);
const boundRows = ref<BoundRow[]>([]);

const term = ref('');
const searching = ref(false);
const searched = ref(false);
const results = ref<PickerProductRow[]>([]);

/** 搜索/预取结果缓存：productId → 商品信息（已绑行的名称/价格尽量从这里取） */
const productMap = new Map<string, PickerProductRow>();

const boundText = computed(() =>
  locale.t('couponBinding.boundCount').replace('{n}', String(boundRows.value.length)),
);

function absorbProducts(list: PickerProductRow[]) {
  for (const p of list) productMap.set(p.id, p);
}

function variantText(variantIds: string[] | null, total: number): string {
  if (variantIds?.length) return locale.t('couponBinding.variantCount').replace('{n}', String(variantIds.length));
  if (total > 0) return locale.t('couponBinding.allVariants');
  return '';
}

function priceText(p?: PickerProductRow): string {
  if (!p?.variants?.length) return '';
  const min = Math.min(...p.variants.map((v) => v.priceYuan));
  return `¥${min.toFixed(2)}`;
}

function resultSub(p: PickerProductRow): string {
  const parts = [priceText(p), variantText(null, p.variants?.length || 0)].filter(Boolean);
  return parts.join(' · ');
}

/** 用缓存商品信息重算已绑行展示（名称/价格拿不到时回退 #productId） */
function rebuildBoundRows(rows: CouponBoundProductRow[]) {
  boundRows.value = rows.map((b) => {
    const p = productMap.get(String(b.productId));
    const parts = [priceText(p), variantText(b.variantIds, p?.variants?.length || 0)].filter(Boolean);
    return {
      productId: String(b.productId),
      variantIds: b.variantIds,
      name: p?.name || `#${b.productId}`,
      sub: parts.join(' · '),
    };
  });
}

async function reload() {
  if (!props.templateId) return;
  loading.value = true;
  try {
    const [rows, products] = await Promise.all([
      fetchCouponBoundProducts(props.templateId),
      // 预取一页商品填充名称/价格缓存；失败不阻塞绑定列表
      fetchPickerProducts({ take: 100, skip: 0 }).catch(() => ({ totalItems: 0, items: [] })),
    ]);
    absorbProducts(products.items);
    rebuildBoundRows(rows);
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponBinding.opFailed'), icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function doSearch() {
  if (searching.value) return;
  searching.value = true;
  try {
    const res = await fetchPickerProducts({
      take: 20,
      skip: 0,
      term: term.value.trim() || undefined,
      enabled: true,
    });
    absorbProducts(res.items);
    const boundIds = new Set(boundRows.value.map((r) => r.productId));
    results.value = res.items.filter((p) => !boundIds.has(p.id));
    searched.value = true;
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('couponBinding.opFailed'), icon: 'none' });
  } finally {
    searching.value = false;
  }
}

function onBind(p: PickerProductRow) {
  bindProductsToCoupon(props.templateId, [p.id])
    .then(() => {
      uni.showToast({ title: locale.t('couponBinding.bound'), icon: 'none' });
      emit('changed');
      reload();
    })
    .catch((e: any) => {
      uni.showToast({ title: e?.message || locale.t('couponBinding.opFailed'), icon: 'none' });
    });
}

function onUnbind(r: BoundRow) {
  uni.showModal({
    title: locale.t('couponBinding.unbind'),
    content: locale.t('couponBinding.confirmUnbind'),
    success: (res) => {
      if (!res.confirm) return;
      unbindProductFromCoupon(props.templateId, r.productId)
        .then(() => {
          uni.showToast({ title: locale.t('couponBinding.unbound'), icon: 'none' });
          emit('changed');
          reload();
        })
        .catch((e: any) => {
          uni.showToast({ title: e?.message || locale.t('couponBinding.opFailed'), icon: 'none' });
        });
    },
  });
}

watch(() => props.templateId, (v) => { if (v) reload(); }, { immediate: true });
</script>

<style lang="scss" scoped>
.cbc { padding-top: 4rpx;
  .cbc-head { display: flex; align-items: center; margin-bottom: 12rpx;
    .cbc-count { font-size: 26rpx; color: $wa-ink; } }
  .cbc-list { margin-bottom: 16rpx;
    .cbc-row { display: flex; align-items: center; justify-content: space-between; padding: 14rpx 20rpx; background: $wa-bg; border-radius: $wa-radius; margin-bottom: 12rpx;
      .cbc-info { flex: 1; margin-right: 16rpx;
        .cbc-name { display: block; font-size: 26rpx; color: $wa-ink; }
        .cbc-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; } }
      .cbc-op { flex-shrink: 0; font-size: 24rpx; border-radius: 999rpx; padding: 8rpx 24rpx;
        &.bind { color: #fff; background: $wa-accent; }
        &.unbind { color: $wa-muted; border: 1rpx solid $wa-rule; } } }
    .cbc-empty { text-align: center; font-size: 24rpx; color: $wa-muted; padding: 20rpx 0; } }
  .cbc-search { display: flex; align-items: center; margin-bottom: 16rpx;
    .cbc-ipt { flex: 1; background: $wa-bg; border-radius: $wa-radius; padding: 14rpx 20rpx; font-size: 26rpx; color: $wa-ink; box-sizing: border-box; }
    .cbc-btn { flex-shrink: 0; margin-left: 16rpx; font-size: 24rpx; color: #fff; background: $wa-accent; border-radius: $wa-radius; padding: 12rpx 28rpx; } }
}
</style>

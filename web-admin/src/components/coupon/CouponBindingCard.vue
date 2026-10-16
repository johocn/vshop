<template>
  <view class="cbc">
    <!-- 已绑商品列表（搜索绑品功能由「批量选品」页承担，此处仅展示/解绑） -->
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
  </view>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { fetchPickerProducts, type PickerProductRow } from '../../apis/product';
import {
  fetchCouponBoundProducts, unbindProductFromCoupon,
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

/** 搜索/预取结果缓存：productId → 商品信息（已绑行的名称/价格尽量从这里取） */
const productMap = new Map<string, PickerProductRow>();

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
// 供编辑页在「批量选品」返回时主动刷新已绑列表
defineExpose({ reload });
</script>

<style lang="scss" scoped>
.cbc { padding-top: 4rpx;
  .cbc-list { margin-bottom: 16rpx;
    .cbc-row { display: flex; align-items: center; justify-content: space-between; padding: 14rpx 20rpx; background: $wa-bg; border-radius: $wa-radius; margin-bottom: 12rpx;
      .cbc-info { flex: 1; margin-right: 16rpx;
        .cbc-name { display: block; font-size: 26rpx; color: $wa-ink; }
        .cbc-sub { display: block; font-size: 22rpx; color: $wa-muted; margin-top: 4rpx; } }
      .cbc-op { flex-shrink: 0; font-size: 24rpx; border-radius: 999rpx; padding: 8rpx 24rpx;
        &.unbind { color: $wa-muted; border: 1rpx solid $wa-rule; } } }
    .cbc-empty { text-align: center; font-size: 24rpx; color: $wa-muted; padding: 20rpx 0; } }
}
</style>

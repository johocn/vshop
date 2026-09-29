<template>
  <view v-if="visible" class="sku-mask" @click.self="close">
    <view class="sku-sheet">
      <view class="sku-sheet__head">
        <VImage :src="variantAsset" width="180rpx" height="180rpx" />
        <view class="sku-sheet__head-info">
          <PriceTag :price="currentVariant?.priceWithTax || 0" :large="true" />
          <text class="sku-sheet__stock">{{ stockText }}</text>
          <text class="sku-sheet__picked">{{ t('sku.picked') }}：{{ pickedText }} · {{ quantity }} {{ t('sku.pieces') }}</text>
        </view>
        <text class="sku-sheet__close" @click="close">✕</text>
      </view>

      <scroll-view scroll-y class="sku-sheet__body">
        <view v-for="group in optionGroups" :key="group.id" class="sku-group">
          <text class="sku-group__label">{{ group.name }} ({{ group.options.length }})</text>
          <view class="sku-group__options">
            <text
              v-for="opt in group.options"
              :key="opt.id"
              class="sku-option"
              :class="{ active: selected[group.id] === opt.id, disabled: !isOptionEnabled(group, opt) }"
              @click="pickOption(group, opt)"
            >{{ opt.name }}</text>
          </view>
        </view>

        <view class="sku-qty">
          <text class="sku-qty__label">{{ t('sku.quantity') }}</text>
          <view class="qty-control">
            <text class="qty-btn" @click="changeQty(-1)">-</text>
            <text class="qty-num">{{ quantity }}</text>
            <text class="qty-btn" @click="changeQty(1)">+</text>
          </view>
        </view>
      </scroll-view>

      <view class="sku-sheet__bar">
        <button class="sku-sheet__btn sku-sheet__btn--cart" :disabled="!currentVariant" @click="emitAction('cart')">{{ t('product.addToCart') }}</button>
        <button class="sku-sheet__btn sku-sheet__btn--buy" :disabled="!currentVariant" @click="emitAction('buy')">{{ t('product.buyNow') }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import VImage from './VImage.vue';
import PriceTag from './PriceTag.vue';

const props = defineProps<{
    visible: boolean;
    product: any;
    /** 秒杀活动（用于详情页 applyFlashSale 联动） */
    activityId?: string;
}>();
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void;
    (e: 'action', payload: { action: 'cart' | 'buy'; variantId: string; quantity: number }): void;
}>();

const { t } = useI18n();
const selected = ref<Record<string, string>>({});
const quantity = ref(1);

const optionGroups = computed(() => props.product?.optionGroups || []);

const currentVariant = computed(() => {
    const variants = props.product?.variants || [];
    if (!variants.length) return null;
    const chosen = Object.values(selected.value);
    if (!chosen.length) return variants[0];
    return variants.find((v: any) => (v.options || []).every((o: any) => chosen.includes(o.id))) || null;
});

const variantAsset = computed(() => currentVariant.value?.featuredAsset?.preview || props.product?.featuredAsset?.preview || '');

const stockText = computed(() => {
    const v = currentVariant.value;
    if (!v) return t('sku.outOfStock');
    const stock = Number(v.stockLevel);
    if (Number.isFinite(stock) && stock >= 0) return `${t('product.stock')} ${stock}`;
    return '';
});

const pickedText = computed(() => {
    const names: string[] = [];
    for (const g of optionGroups.value) {
        const id = selected.value[g.id];
        const opt = (g.options || []).find((o: any) => o.id === id);
        if (opt) names.push(opt.name);
    }
    if (names.length) return names.join(' / ');
    // 单规格商品（无规格组）没有「未选」状态：直接显示当前变体名，不出现「请选择规格」
    if (!optionGroups.value.length) return currentVariant.value?.name || t('sku.pleasePick');
    return t('sku.pleasePick');
});

/** 某选项是否可点：把它代入当前已选后，必须能命中一个存在的变体（库存为 0 也算命中但置灰不可选） */
function isOptionEnabled(group: any, opt: any): boolean {
    const trial = { ...selected.value, [group.id]: opt.id };
    const full = optionGroups.value.every((g: any) => !!trial[g.id]);
    if (!full) return true;
    const hit = (props.product?.variants || []).find((v: any) =>
        (v.options || []).every((o: any) => Object.values(trial).includes(o.id)),
    );
    if (!hit) return false;
    const stock = Number(hit.stockLevel);
    return !(Number.isFinite(stock) && stock <= 0);
}

function pickOption(group: any, opt: any) {
    if (!isOptionEnabled(group, opt)) return;
    selected.value = { ...selected.value, [group.id]: opt.id };
}

function changeQty(delta: number) {
    const next = quantity.value + delta;
    if (next < 1) return;
    const stock = Number(currentVariant.value?.stockLevel);
    if (Number.isFinite(stock) && stock > 0 && next > stock) return;
    quantity.value = next;
}

function close() {
    emit('update:visible', false);
}

function emitAction(action: 'cart' | 'buy') {
    if (!currentVariant.value) return;
    emit('action', { action, variantId: currentVariant.value.id, quantity: quantity.value });
}

/** 打开时自动选第一个可用的规格组合 */
watch(
    () => props.visible,
    (v) => {
        if (!v) return;
        const init: Record<string, string> = {};
        for (const g of optionGroups.value) {
            const firstOk = (g.options || []).find((o: any) => isOptionEnabled(g, o));
            if (firstOk) init[g.id] = firstOk.id;
        }
        selected.value = init;
        quantity.value = 1;
    },
);
</script>

<style lang="scss" scoped>
.sku-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 200; display: flex; align-items: flex-end; }
.sku-sheet { width: 100%; background: #fff; border-top-left-radius: 24rpx; border-top-right-radius: 24rpx; max-height: 80vh; display: flex; flex-direction: column;
    &__head { display: flex; gap: 20rpx; padding: 24rpx; border-bottom: 1rpx solid $border-color; position: relative; }
    &__head-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__stock { font-size: 24rpx; color: #999; }
    &__picked { font-size: 24rpx; color: $text-color-secondary; }
    &__close { position: absolute; right: 24rpx; top: 16rpx; font-size: 32rpx; color: #ccc; }
    &__body { flex: 1; padding: 0 24rpx; }
    &__bar { display: flex; gap: 16rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid $border-color; }
    &__btn { flex: 1; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none;
        &--cart { background: $brand-color-light; color: $brand-color; }
        &--buy { background: $brand-color; color: #fff; }
    }
}
.sku-group { padding: 20rpx 0;
    &__label { font-size: 26rpx; color: $text-color; }
    &__options { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
}
.sku-option { padding: 10rpx 28rpx; font-size: 24rpx; border: 1rpx solid $border-color; border-radius: $radius-sm; color: $text-color;
    &.active { border-color: $brand-color; color: $brand-color; background: $brand-color-light; }
    &.disabled { color: #ccc; background: #f7f7f7; border-color: #eee; }
}
.sku-qty { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0 30rpx;
    &__label { font-size: 26rpx; color: $text-color; }
}
.qty-control { display: flex; align-items: center; border: 1rpx solid $border-color; border-radius: $radius-sm; }
.qty-btn { width: 56rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 28rpx; background: #f5f5f5; }
.qty-num { width: 64rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 26rpx; border-left: 1rpx solid $border-color; border-right: 1rpx solid $border-color; }
</style>

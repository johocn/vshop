<template>
  <view class="cart-page">
    <view v-if="!auth.isLoggedIn" class="cart-guest">
      <text class="cart-guest__text">当前未授权，登录后查看购物车</text>
      <button class="cart-guest__btn" @click="goLogin">去登录</button>
    </view>
    <view v-if="auth.isLoggedIn && cartLines.length > 0" class="cart-list">
      <view v-for="group in cartGroups" :key="group.key" class="cart-group">
        <view class="cart-group__header">
          <text class="cart-group__name">{{ group.name }}</text>
          <text class="cart-group__count">{{ group.lines.length }} 件</text>
        </view>
        <view v-for="line in group.lines" :key="line.id" class="cart-item">
          <view class="cart-item__check" @click="toggleSelect(line.id)">
            <text class="check-icon">{{ isSelected(line.id) ? '☑' : '☐' }}</text>
          </view>
          <VImage :src="line.featuredAsset?.preview || ''" width="160rpx" height="160rpx" class="cart-item__img" />
          <view class="cart-item__info">
            <text class="cart-item__name">{{ line.productVariant?.name }}</text>
            <text class="cart-item__spec">{{ line.productVariant?.options?.map((o:any)=>o.name).join(' ') }}</text>
            <view class="cart-item__tags" v-if="lineState(line) === 'lowStock'">
              <text class="tag tag--warn">{{ lowStockText(line) }}</text>
            </view>
            <view class="cart-item__bottom">
              <PriceTag :price="line.unitPriceWithTax" />
              <view class="qty-control">
                <text class="qty-btn" @click="changeQty(line, -1)">-</text>
                <text class="qty-num">{{ line.quantity }}</text>
                <text class="qty-btn" @click="changeQty(line, 1)">+</text>
              </view>
            </view>
          </view>
          <text class="cart-item__del" @click="removeLine(line.id)">×</text>
        </view>
      </view>
    </view>
    <EmptyState v-else-if="auth.isLoggedIn && !loading" text="购物车是空的" />

    <view class="cart-reco" v-if="auth.isLoggedIn && reco.length > 0">
      <text class="cart-reco__title">为你推荐</text>
      <view class="cart-reco__grid">
        <view v-for="p in reco" :key="p.productId" class="reco-card" @click="goDetail(p.slug)">
          <VImage :src="p.productAsset?.preview || ''" width="100%" height="260rpx" />
          <text class="reco-card__name">{{ p.productName }}</text>
          <PriceTag :price="getMinPrice(p.priceWithTax)" />
        </view>
      </view>
    </view>

    <view class="cart-footer" v-if="auth.isLoggedIn && cartLines.length > 0">
      <view class="cart-footer__left" @click="toggleAll">
        <text class="check-icon">{{ allSelected ? '☑' : '☐' }}</text>
        <text>全选</text>
      </view>
      <view class="cart-footer__right">
        <text class="cart-footer__total">合计: <text class="price">¥{{ totalYuan }}</text></text>
        <button class="cart-footer__btn" :disabled="selectedCount === 0" @click="goCheckout">
          结算({{ selectedCount }})
        </button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useCartStore } from '../../stores/cart';
import { useUIStore } from '../../stores/ui';
import { useTenantStore } from '../../stores/tenant';
import { getActiveOrder } from '../../api/queries/order';
import { adjustOrderLine, addItemToOrder, removeOrderLine } from '../../api/mutations/cart';
import VImage from '../../components/VImage.vue';
import PriceTag from '../../components/PriceTag.vue';
import EmptyState from '../../components/EmptyState.vue';
import { cartLineState, lowStockText } from '../../utils/flash-normalize';
import { useAuthStore } from '../../stores/auth';
import { searchProducts } from '../../api/queries/product';

const cart = useCartStore();
const ui = useUIStore();
const auth = useAuthStore();
const tenant = useTenantStore();
const loading = ref(true);
const selectedIds = ref<Set<string>>(new Set());
const reco = ref<any[]>([]);

const cartLines = computed(() => cart.lines);
const cartGroups = computed(() => cart.groupedLines);
const allSelected = computed(() => cartLines.value.length > 0 && selectedIds.value.size === cartLines.value.length);
const selectedCount = computed(() => selectedIds.value.size);
const totalYuan = computed(() => {
    let total = 0;
    cartLines.value.forEach((l: any) => {
        if (selectedIds.value.has(l.id)) total += l.unitPriceWithTax * l.quantity;
    });
    return (total / 100).toFixed(2);
});

onShow(async () => {
    // 冷启动（刷新/直接打开 /pages/cart/index）时 onShow 早于 App.onLaunch 的
    // initTenant + restoreSession 完成，此时请求既无渠道 token 也无登录 token，
    // activeOrder 恒为 null，页面会误报「购物车是空的」。等就绪后再拉一次。
    await waitTenantReady();
    await loadCart();
    await restorePending();
    void loadReco();
});

/** 等待 App.onLaunch 初始化完成（tenantReady）；异常时最多等 8s，避免永久骨架屏 */
function waitTenantReady(): Promise<void> {
    if (tenant.tenantReady) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const stop = watch(
            () => tenant.tenantReady,
            (ready) => {
                if (ready) {
                    stop();
                    resolve();
                }
            },
        );
        setTimeout(() => {
            stop();
            resolve();
        }, 8000);
    });
}

async function loadReco() {
    if (!auth.isLoggedIn) { reco.value = []; return; }
    try {
        const res: any = await searchProducts({ take: 8 });
        reco.value = (res.search?.items || []).slice(0, 4);
    } catch (e) {
        reco.value = [];
    }
}

function getMinPrice(price: any): number { return price?.value ?? price?.min ?? 0; }
function goDetail(slug: string) { uni.navigateTo({ url: '/pkg-product/pages/detail?slug=' + slug }); }
function goLogin() {
    uni.navigateTo({ url: '/pages/login/index' });
}

/** 幂等回填：成功一行即从暂存放移除一行，失败的行留在暂存里等下次再试 */
async function restorePending() {
    const pending = [...cart.pendingLines];
    if (pending.length === 0) return;
    const failed: Array<{ variantId: string; quantity: number }> = [];
    for (const p of pending) {
        try {
            await addItemToOrder(p.variantId, p.quantity);
        } catch (e) {
            failed.push(p);
        }
    }
    cart.setPendingLines(failed);
    if (failed.length > 0) ui.showToast(`${failed.length} 件商品库存不足，未能恢复`);
    await loadCart();
}

async function loadCart() {
    loading.value = true;
    try {
        const res: any = await getActiveOrder();
        if (res.activeOrder) {
            cart.setOrder(res.activeOrder);
            // Auto-select all
            const ids = new Set<string>();
            (res.activeOrder.lines || []).forEach((l: any) => ids.add(l.id));
            selectedIds.value = ids;
        }
    } catch (e) {}
    loading.value = false;
}

function isSelected(id: string) { return selectedIds.value.has(id); }

function lineState(line: any) {
    return cartLineState(line);
}

function toggleSelect(id: string) {
    const s = new Set(selectedIds.value);
    if (s.has(id)) s.delete(id); else s.add(id);
    selectedIds.value = s;
}

function toggleAll() {
    if (allSelected.value) {
        selectedIds.value = new Set();
    } else {
        const ids = new Set<string>();
        cartLines.value.forEach((l: any) => ids.add(l.id));
        selectedIds.value = ids;
    }
}

async function changeQty(line: any, delta: number) {
    const newQty = line.quantity + delta;
    if (newQty <= 0) { removeLine(line.id); return; }
    try {
        await adjustOrderLine(line.id, newQty);
        await loadCart();
    } catch (e: any) { ui.showToast(e.message); }
}

async function removeLine(id: string) {
    uni.showModal({
        title: '确认', content: '确定删除该商品?',
        success: async (res: any) => {
            if (res.confirm) {
                try {
                    await removeOrderLine(id);
                    selectedIds.value.delete(id);
                    await loadCart();
                    ui.showToast('已删除', 'success');
                } catch (e: any) { ui.showToast(e.message); }
            }
        }
    });
}

async function goCheckout() {
    if (selectedCount.value === 0) return;
    const unselected = cartLines.value.filter((l: any) => !selectedIds.value.has(l.id));
    // 未勾选行只暂存「可再次下单」的变体（无变体的脏数据不进暂存，但仍从订单移出）
    const stash = unselected
        .map((l: any) => ({ variantId: l.productVariant?.id, quantity: l.quantity }))
        .filter((x: any) => !!x.variantId);

    try {
        for (const l of unselected) {
            await removeOrderLine(l.id);
        }
    } catch (e: any) {
        ui.showToast(e.message);
        await loadCart();
        return;
    }

    cart.setPendingLines(stash);
    uni.navigateTo({ url: '/pkg-order/pages/checkout' });
}
</script>
<style lang="scss" scoped>
.cart-page { min-height: 100vh; padding-bottom: calc(120rpx + 50px); background: $bg-color; }
.cart-list { padding: 20rpx; }
.cart-group { background: #fff; border-radius: $radius-md; padding: 20rpx; margin-bottom: 20rpx;
    &__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__count { font-size: 24rpx; color: #999; }
}
.cart-item {
    display: flex; align-items: flex-start; gap: 16rpx; background: $bg-color; padding: 20rpx; border-radius: $radius-md; margin-bottom: 16rpx; position: relative;
    &__check { padding: 10rpx; }
    &__img { border-radius: $radius-sm; flex-shrink: 0; }
    &__info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
    &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    &__spec { font-size: 22rpx; color: #999; }
    &__bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8rpx; }
    &__del { position: absolute; top: 16rpx; right: 16rpx; font-size: 32rpx; color: #ccc; padding: 8rpx; }
}
.cart-item__tags { display: flex; gap: 8rpx; }
.tag { font-size: 20rpx; border-radius: 6rpx; padding: 2rpx 10rpx;
    &--warn { color: #fff; background: $price-color; }
}
.check-icon { font-size: 36rpx; color: $brand-color; }
.cart-guest { display: flex; flex-direction: column; align-items: center; gap: 30rpx; padding: 160rpx 40rpx;
    &__text { font-size: 28rpx; color: $text-color-secondary; }
    &__btn { background: $brand-color; color: #fff; font-size: 28rpx; border-radius: 40rpx; padding: 0 60rpx; height: 72rpx; line-height: 72rpx; }
}
.cart-reco { padding: 20rpx; &__title { font-size: 30rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } &__grid { display: flex; flex-wrap: wrap; justify-content: space-between; } }
.reco-card { width: 48%; background: #fff; border-radius: $radius-md; overflow: hidden; margin-bottom: 20rpx;
    &__name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 24rpx; padding: 10rpx 12rpx 6rpx; height: 64rpx; }
}
.qty-control { display: flex; align-items: center; gap: 0; border: 1rpx solid $border-color; border-radius: $radius-sm; }
.qty-btn { width: 56rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 28rpx; background: #f5f5f5; }
.qty-num { width: 64rpx; height: 48rpx; text-align: center; line-height: 48rpx; font-size: 26rpx; border-left: 1rpx solid $border-color; border-right: 1rpx solid $border-color; }
.cart-footer {
    position: fixed; bottom: 50px; left: 0; right: 0; height: 100rpx; background: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20rpx; box-shadow: $shadow;
    &__left { display: flex; align-items: center; gap: 12rpx; font-size: 28rpx; }
    &__right { display: flex; align-items: center; gap: 20rpx; }
    &__total { font-size: 26rpx; .price { font-size: 32rpx; color: $price-color; font-weight: bold; } }
    &__btn { background: $brand-color; color: #fff; font-size: 28rpx; height: 72rpx; padding: 0 40rpx; border-radius: 40rpx; border: none; &[disabled] { opacity: 0.5; } }
}
</style>

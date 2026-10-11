<template>
  <view class="order-detail" v-if="order">
    <view class="status-header" :class="'status--' + order.state">
      <text class="status-header__text">{{ statusLabel }}</text>
      <text class="status-header__sub">{{ statusHint }}</text>
    </view>
    <view class="section" v-if="order.shippingAddress">
      <text class="section__title">{{ t('checkout.address') }}</text>
      <text>{{ order.shippingAddress.fullName }} {{ order.shippingAddress.phoneNumber }}</text>
      <text class="section__sub">{{ order.shippingAddress.province }} {{ order.shippingAddress.city }} {{ order.shippingAddress.streetLine1 }}</text>
    </view>
    <view class="section" v-if="order.shippingLines?.length">
      <text class="section__title">{{ t('orderDetail.logisticsInfo') }}</text>
      <view class="logistics">
        <text>{{ order.shippingLines[0]?.shippingMethod?.name || t('orderDetail.shippingFallback') }}</text>
        <text v-if="trackingNo" class="logistics__no">{{ t('logistics.trackingNo') }}: {{ trackingNo }}</text>
        <text v-else class="logistics__empty">{{ t('logistics.empty') }}</text>
      </view>
      <view v-if="trackingNo || orderPackages.length" class="logistics-link" @tap="goLogistics">
        <text class="logistics-link__text">{{ t('order.viewLogistics') }}</text>
        <text class="logistics-link__arrow">›</text>
      </view>
    </view>
    <view class="section">
      <text class="section__title">{{ t('orderDetail.goodsInfo') }}</text>
      <view v-for="line in order.lines" :key="line.id" class="order-line">
        <VImage :src="line.featuredAsset?.preview || ''" width="140rpx" height="140rpx" />
        <view class="order-line__info">
          <text class="order-line__name">{{ line.productVariant?.name }}</text>
          <text class="order-line__spec">{{ line.productVariant?.options?.map((o: any) => o.name).join(' ') }}</text>
          <view class="order-line__bottom">
            <text class="order-line__price">¥{{ (line.unitPriceWithTax / 100).toFixed(2) }}</text>
            <text class="order-line__qty">x{{ line.quantity }}</text>
          </view>
        </view>
      </view>
    </view>
    <view class="section summary">
      <view class="summary__row"><text>{{ t('checkout.goodsTotal') }}</text><text>¥{{ (order.subTotalWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row"><text>{{ t('checkout.shippingFee') }}</text><text>¥{{ (order.shippingWithTax / 100).toFixed(2) }}</text></view>
      <view class="summary__row" v-if="order.discounts?.length"><text>{{ t('orderDetail.discountLabel') }}</text><text class="discount">-¥{{ (discountTotal / 100).toFixed(2) }}</text></view>
      <view class="summary__row summary__row--total"><text>{{ t('orderDetail.actualPaid') }}</text><text class="summary__total">¥{{ (order.totalWithTax / 100).toFixed(2) }}</text></view>
    </view>
    <view class="section" v-if="order.couponCodes?.length">
      <text class="section__title">{{ t('checkout.coupon') }}</text>
      <text v-for="c in order.couponCodes" :key="c" class="coupon-tag">{{ c }}</text>
    </view>
    <view class="section info">
      <view class="info__row"><text>{{ t('order.orderNo') }}</text><text @click="copyCode">{{ order.code }}</text></view>
      <view class="info__row"><text>{{ t('order.createTime') }}</text><text>{{ formatTime(order.createdAt) }}</text></view>
      <view class="info__row" v-if="order.payments?.length"><text>{{ t('checkout.payment') }}</text><text>{{ order.payments[0]?.method }}</text></view>
    </view>
    <view class="order-detail__actions">
      <button v-if="canPay" class="action-btn action-btn--primary" @click="goPay">{{ t('order.payNow') }}</button>
      <button v-if="canReceive" class="action-btn action-btn--primary" @click="confirmReceive">{{ t('order.confirmReceive') }}</button>
      <button v-if="canAfterSale" class="action-btn" @click="applyAfterSale">{{ t('order.applyAfterSale') }}</button>
      <button v-if="canInvoice" class="action-btn" @click="applyInvoice">{{ t('orderDetail.applyInvoice') }}</button>
      <button v-if="canCancel" class="action-btn action-btn--ghost" @click="cancelOrder">{{ t('order.cancelOrder') }}</button>
      <button v-if="canReview" class="action-btn" @click="goEvaluate">{{ t('review.myOrderReviewBtn') }}</button>
      <text v-else-if="isFullyReviewed" class="action-btn action-btn--ghost">{{ t('review.reviewed') }}</text>
    </view>
  </view>
  <LoadingSkeleton v-else type="card" :count="2" />
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getOrderByCode, getMyOrderPackages } from '../../api/queries/order';
import { getMyReviews } from '../../api/queries/review';
import { confirmOrderReceipt, cancelMyOrder as cancelMyOrderApi } from '../../api/mutations/order';
import { useAuthStore } from '../../stores/auth';
import VImage from '../../components/VImage.vue';
import LoadingSkeleton from '../../components/LoadingSkeleton.vue';
const order = ref<any>(null);
const { t } = useI18n();
const auth = useAuthStore();
const reviewedLineIds = ref<Set<string>>(new Set());
const trackingNo = ref('');
const orderPackages = ref<any[]>([]);
// 订单状态 → i18n key（与 orders 列表页共用 order.* 状态文案；Modified 为详情页独有）
const STATUS_KEY: Record<string, string> = { Created:'order.pending', PaymentAuthorized:'order.paid', PaymentSettled:'order.paid', Delivered:'order.shipped', PartiallyDelivered:'order.shipped', Shipped:'order.shipped', Cancelled:'order.cancelled', Modified:'order.modified' };
const HINT_KEY: Record<string, string> = { Created:'orderDetail.hintPay', PaymentAuthorized:'orderDetail.hintProcessing', PaymentSettled:'orderDetail.hintProcessing', Delivered:'orderDetail.hintReceive', Shipped:'orderDetail.hintShipping' };
const statusLabel = computed(() => {
    const k = STATUS_KEY[order.value?.state];
    return k ? t(k) : (order.value?.state || '');
});
const statusHint = computed(() => {
    const k = HINT_KEY[order.value?.state];
    return k ? t(k) : '';
});
const discountTotal = computed(() => order.value?.discounts?.reduce((s:number,d:any)=>s+d.amountWithTax,0) || 0);
const canPay = computed(() => ['Created','AddingItems','ArrangingPayment'].includes(order.value?.state));
const canReceive = computed(() => ['Delivered','PartiallyDelivered','Shipped'].includes(order.value?.state));
const canAfterSale = computed(() => ['Delivered','PaymentSettled','PaymentAuthorized'].includes(order.value?.state));
const canInvoice = computed(() => ['Delivered','Completed','PartiallyDelivered'].includes(order.value?.state));
const canCancel = computed(() => ['Created','AddingItems','ArrangingPayment'].includes(order.value?.state));
const canReview = computed(() => {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order.value?.state)) return false;
    return (order.value?.lines || []).some((l: any) => !reviewedLineIds.value.has(String(l.id)));
});
const isFullyReviewed = computed(() => {
    if (!auth.isLoggedIn) return false;
    if (!['Delivered', 'Completed'].includes(order.value?.state)) return false;
    const lines = order.value?.lines || [];
    return lines.length > 0 && lines.every((l: any) => reviewedLineIds.value.has(String(l.id)));
});
onMounted(async () => {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const code = page?.options?.code; if (!code) return;
    try { const res: any = await getOrderByCode(code); order.value = res.orderByCode; } catch (e) { console.error(e); }
    // 物流单号取自「本人订单包裹」（myOrderPackages 内部按 activeUserId 归属校验），
    // 不能用 afterSalesRequest(id)：其入参是售后单 id，传订单 id 恒查不到。
    try {
        const pkgRes: any = await getMyOrderPackages(order.value?.id);
        orderPackages.value = pkgRes?.myOrderPackages || [];
        const pkg = orderPackages.value.find((p: any) => p?.trackingNo);
        if (pkg) trackingNo.value = pkg.carrierName ? `${pkg.carrierName} ${pkg.trackingNo}` : pkg.trackingNo;
    } catch (e) {}
    await loadReviewedLines();
});
function formatTime(t: string) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function copyCode() { uni.setClipboardData({ data: order.value.code }); uni.showToast({ title: t('orderDetail.copied'), icon: 'success' }); }
function goPay() { uni.navigateTo({ url: '/pkg-order/pages/payment?code=' + order.value.code }); }
function goLogistics() { uni.navigateTo({ url: '/pkg-user/pages/logistics?orderId=' + order.value.id }); }
function confirmReceive() { uni.showModal({ title: t('order.confirmReceive'), content: t('orderDetail.receiveConfirm'), confirmText: t('common.confirm'), cancelText: t('common.cancel'), success: async (r: any) => { if (r.confirm) { try { const res: any = await confirmOrderReceipt(String(order.value.id)); if (res?.confirmOrderReceipt === false) { uni.showToast({ title: t('orderDetail.receiveNotAllowed'), icon: 'none' }); return; } uni.showToast({ title: t('orderDetail.received') }); order.value.state = 'Completed'; } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
function applyAfterSale() { uni.navigateTo({ url: '/pkg-after-sale/pages/apply?orderId=' + order.value.id }); }
function applyInvoice() { uni.navigateTo({ url: '/pkg-order/pages/invoice-apply?orderIds=' + order.value.id }); }
function cancelOrder() { uni.showModal({ title: t('order.cancelOrder'), content: t('orderDetail.cancelConfirm'), confirmText: t('common.confirm'), cancelText: t('common.cancel'), success: async (r: any) => { if (r.confirm) { try { const res: any = await cancelMyOrderApi(String(order.value.id)); if (res?.cancelMyOrder?.state) order.value.state = res.cancelMyOrder.state; else order.value.state = 'Cancelled'; uni.showToast({ title: t('order.cancelled') }); } catch (e: any) { uni.showToast({ title: e.message, icon: 'none' }); } } } }); }
async function loadReviewedLines() {
    if (!auth.isLoggedIn) return;
    try {
        const res: any = await getMyReviews();
        const set = new Set<string>();
        for (const r of res.myReviews || []) {
            if (r.orderLineId && r.status !== 'deleted') set.add(String(r.orderLineId));
        }
        reviewedLineIds.value = set;
    } catch (e) {
        console.error(e);
    }
}
function goEvaluate() {
    uni.navigateTo({ url: '/pkg-order/pages/order-evaluate?code=' + order.value.code });
}
</script>
<style lang="scss" scoped>
.order-detail { padding-bottom: 40rpx; }
.status-header { padding: 40rpx 30rpx; background: linear-gradient(135deg, $brand-color, #ff9966); color: #fff; &__text { font-size: 36rpx; font-weight: bold; display: block; } &__sub { font-size: 26rpx; opacity: 0.85; margin-top: 8rpx; display: block; } }
.status--Cancelled { background: linear-gradient(135deg, #999, #bbb); }
.section { background: #fff; margin: 20rpx; padding: 24rpx; border-radius: $radius-md; &__title { font-size: 28rpx; font-weight: bold; display: block; margin-bottom: 16rpx; } &__sub { font-size: 26rpx; color: $text-color-secondary; display: block; margin-top: 6rpx; } }
.logistics { &__no { font-size: 26rpx; color: $brand-color; display: block; margin-top: 8rpx; } &__empty { font-size: 26rpx; color: #999; } }
.logistics-link { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid #f0f0f0; &__text { font-size: 26rpx; color: $brand-color; } &__arrow { color: $brand-color; font-size: 32rpx; } }
.order-line { display: flex; gap: 16rpx; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5; &:last-child { border-bottom: none; } &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; } &__name { font-size: 26rpx; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } &__spec { font-size: 22rpx; color: #999; margin-top: 4rpx; } &__bottom { display: flex; justify-content: space-between; align-items: center; } &__price { font-size: 28rpx; color: $price-color; } &__qty { font-size: 24rpx; color: #999; } }
.summary { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; &--total { padding-top: 16rpx; margin-top: 8rpx; border-top: 1rpx solid $border-color; font-size: 28rpx; } } &__total { font-size: 36rpx; color: $price-color; font-weight: bold; } }
.discount { color: #07c160; }
.coupon-tag { display: inline-block; background: #fff3e6; color: $brand-color; font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; margin-right: 12rpx; border: 1rpx solid $brand-color; }
.info { &__row { display: flex; justify-content: space-between; padding: 8rpx 0; font-size: 26rpx; color: $text-color-secondary; } }
.order-detail__actions { padding: 20rpx; display: flex; gap: 16rpx; flex-wrap: wrap; }
.action-btn { flex: 1; min-width: 200rpx; height: 80rpx; font-size: 28rpx; border-radius: $radius-md; border: none; display: flex; align-items: center; justify-content: center; &--primary { background: $brand-color; color: #fff; } &--ghost { background: #fff; color: #999; border: 1rpx solid $border-color; } }
</style>

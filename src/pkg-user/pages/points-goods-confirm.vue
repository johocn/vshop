<template>
  <view class="pgc-page" v-if="product">
    <!-- 商品卡 -->
    <view class="pgc-card">
      <VImage :src="product.image" height="160rpx" width="160rpx" />
      <view class="pgc-card__info">
        <text class="pgc-card__name">{{ product.name }}</text>
        <view class="pgc-card__price">
          <text class="pgc-card__points">{{ product.pointsPrice }}{{ t('pointsGoods.pointsUnit') }}</text>
          <text v-if="product.cashPrice > 0" class="pgc-card__cash">+¥{{ (product.cashPrice / 100).toFixed(2) }}</text>
        </view>
      </view>
    </view>

    <!-- 数量 -->
    <view class="pgc-section">
      <view class="pgc-section__row">
        <text class="pgc-section__label">{{ t('pointsGoods.quantity') }}</text>
        <view class="stepper">
          <view class="stepper__btn" :class="{ 'stepper__btn--disabled': qty <= 1 }" @click="changeQty(-1)">−</view>
          <text class="stepper__num">{{ qty }}</text>
          <view class="stepper__btn" :class="{ 'stepper__btn--disabled': qty >= maxQty }" @click="changeQty(1)">＋</view>
        </view>
      </view>
      <view class="pgc-section__hint">{{ t('pointsGoods.maxExchange', { n: maxQty }) }}</view>
    </view>

    <!-- 收货地址（仅实物） -->
    <view class="pgc-section" v-if="product.deliveryType === 'physical'">
      <view v-if="selectedAddress" class="pgc-addr" @click="showAddressPicker = true">
        <view class="pgc-addr__top">
          <text class="pgc-addr__name">{{ selectedAddress.fullName }}</text>
          <text class="pgc-addr__phone">{{ selectedAddress.phoneNumber }}</text>
        </view>
        <text class="pgc-addr__detail">{{ selectedAddress.province }} {{ selectedAddress.city }} {{ selectedAddress.streetLine1 }}{{ selectedAddress.streetLine2 ? ' ' + selectedAddress.streetLine2 : '' }}</text>
        <text class="pgc-addr__change">{{ t('pointsGoods.chooseAddress') }} ▾</text>
      </view>
      <view v-else class="pgc-addr pgc-addr--empty" @click="goAddressManage">
        <text>{{ t('pointsGoods.noAddress') }}</text>
        <text class="pgc-addr__arrow">›</text>
      </view>
    </view>

    <!-- 虚拟权益提示 -->
    <view class="pgc-section pgc-section--virtual" v-if="product.deliveryType === 'virtual'">
      <text class="pgc-virtual-tag">{{ t('pointsGoods.virtualTag') }}</text>
    </view>

    <!-- 明细 -->
    <view class="pgc-section">
      <view class="pgc-section__row">
        <text class="pgc-section__label">{{ t('pointsGoods.pointsCost') }}</text>
        <text class="pgc-detail__points">−{{ pointsCost }}{{ t('pointsGoods.pointsUnit') }}</text>
      </view>
      <view class="pgc-section__row">
        <text class="pgc-section__label">{{ t('pointsGoods.currentBalance') }}</text>
        <text class="pgc-detail__value">{{ balance ?? '--' }}</text>
      </view>
      <view class="pgc-section__row">
        <text class="pgc-section__label">{{ t('pointsGoods.balanceAfter') }}</text>
        <text class="pgc-detail__value" :class="{ 'pgc-detail__value--neg': balanceAfter < 0 }">{{ balanceAfterText }}</text>
      </view>
      <view class="pgc-section__row" v-if="cashTotal > 0">
        <text class="pgc-section__label">{{ t('pointsGoods.cashTotal') }}</text>
        <text class="pgc-detail__value">¥{{ (cashTotal / 100).toFixed(2) }}（{{ t('pointsGoods.wechatPay') }}）</text>
      </view>
    </view>

    <view class="pgc-page__placeholder" />

    <!-- 底部提交栏 -->
    <view class="pgc-bar">
      <view class="pgc-bar__total">
        <text class="pgc-bar__points">{{ pointsCost }}{{ t('pointsGoods.pointsUnit') }}</text>
        <text v-if="cashTotal > 0" class="pgc-bar__cash">+¥{{ (cashTotal / 100).toFixed(2) }}</text>
      </view>
      <button class="pgc-bar__btn" :disabled="submitting || limitReached" @click="submit">
        {{ limitReached ? t('pointsGoods.limitReached') : (submitting ? t('pointsGoods.submitting') : t('pointsGoods.submitExchange')) }}
      </button>
    </view>

    <!-- 地址选择弹层（结账页选择器简化版） -->
    <view v-if="showAddressPicker" class="addr-mask" @click.self="showAddressPicker = false">
      <view class="addr-sheet">
        <view class="addr-sheet__head">
          <text class="addr-sheet__title">{{ t('pointsGoods.chooseAddress') }}</text>
          <text class="addr-sheet__close" @click="showAddressPicker = false">✕</text>
        </view>
        <scroll-view class="addr-sheet__list" scroll-y>
          <view
            v-for="addr in addresses"
            :key="addr.id"
            class="addr-option"
            :class="{ 'addr-option--selected': selectedAddress?.id === addr.id }"
            @click="chooseAddress(addr)"
          >
            <view class="addr-option__top">
              <text class="addr-option__name">{{ addr.fullName }}</text>
              <text class="addr-option__phone">{{ addr.phoneNumber }}</text>
              <text v-if="addr.defaultShippingAddress" class="addr-option__tag">{{ t('pointsGoods.defaultTag') }}</text>
            </view>
            <text class="addr-option__detail">{{ addr.province }} {{ addr.city }} {{ addr.streetLine1 }}{{ addr.streetLine2 ? ' ' + addr.streetLine2 : '' }}</text>
          </view>
          <view v-if="addresses.length === 0" class="addr-sheet__empty">
            <text>{{ t('pointsGoods.noAddress') }}</text>
          </view>
        </scroll-view>
        <view class="addr-sheet__footer" @click="goAddressManage">{{ t('pointsGoods.manageAddress') }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { onLoad } from '@dcloudio/uni-app';
import { getMyMemberInfo } from '../../api/queries/member';
import { getActiveCustomer } from '../../api/queries/user';
import { getPointsProduct, createPointsOrderExchange, createPointsOrderPayment } from '../../api/queries/points-mall';
import { handlePayment } from '../../composables/usePayment';
import { getPlatform } from '../../utils/platform';
import VImage from '../../components/VImage.vue';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUIStore();

const id = ref('');
const product = ref<any>(null);
const qty = ref(1);
const balance = ref<number | null>(null);
const addresses = ref<any[]>([]);
const selectedAddress = ref<any>(null);
const showAddressPicker = ref(false);
const submitting = ref(false);

/** 可兑上限：库存与「每人限兑-已兑数量」取小（perUserLimit>0 时生效；myRedeemedCount 为后端返回的本人累计已兑） */
const maxQty = computed(() => {
    const p = product.value;
    if (!p) return 1;
    let limit = p.stock;
    if (p.perUserLimit > 0) {
        limit = Math.min(limit, Math.max(0, (p.perUserLimit || 0) - (p.myRedeemedCount || 0)));
    }
    return Math.max(1, limit);
});
const limitReached = computed(() => {
    const p = product.value;
    if (!p || !(p.perUserLimit > 0)) return false;
    return Math.max(0, (p.perUserLimit || 0) - (p.myRedeemedCount || 0)) <= 0;
});

const pointsCost = computed(() => (product.value?.pointsPrice || 0) * qty.value);
const cashTotal = computed(() => (product.value?.cashPrice || 0) * qty.value);
const balanceAfter = computed(() => (balance.value ?? 0) - pointsCost.value);
const balanceAfterText = computed(() => (balance.value === null ? '--' : String(balanceAfter.value)));

onLoad((options: any) => {
    id.value = String(options?.id || '');
});

onMounted(async () => {
    if (!id.value) return;
    if (!auth.isLoggedIn) {
        auth.requireLogin('/pkg-user/pages/points-goods-confirm?id=' + id.value);
        return;
    }
    try {
        const r: any = await getPointsProduct(id.value);
        product.value = r?.pointsProduct || null;
    } catch (e: any) {
        ui.showToast(e?.response?.errors?.[0]?.message || e?.message || t('pointsGoods.loadFailed'), 'error');
        return;
    }
    loadBalance();
    loadAddress();
});

async function loadBalance() {
    try {
        const r: any = await getMyMemberInfo();
        balance.value = r?.myMemberInfo?.points ?? null;
    } catch (e) { balance.value = null; }
}

/** 地址簿：默认取默认收货地址，否则第一条（与 checkout.vue 同口径） */
async function loadAddress() {
    try {
        const r: any = await getActiveCustomer();
        addresses.value = r?.activeCustomer?.addresses || [];
        selectedAddress.value = addresses.value.find((a: any) => a.defaultShippingAddress) || addresses.value[0] || null;
    } catch (e) { /* 静默 */ }
}

function changeQty(delta: number) {
    const next = qty.value + delta;
    if (next < 1 || next > maxQty.value) return;
    qty.value = next;
}

function chooseAddress(addr: any) {
    selectedAddress.value = addr;
    showAddressPicker.value = false;
}

function goAddressManage() {
    showAddressPicker.value = false;
    uni.navigateTo({ url: '/pkg-user/pages/addresses' });
}

async function submit() {
    if (submitting.value) return;
    if (product.value?.deliveryType === 'physical' && !selectedAddress.value) {
        ui.showToast(t('pointsGoods.errAddressRequired'), 'error');
        return;
    }
    submitting.value = true;
    ui.showLoading();
    try {
        const input: any = { pointsProductId: id.value, quantity: qty.value };
        if (product.value.deliveryType === 'physical') input.addressId = selectedAddress.value.id;
        const res: any = await createPointsOrderExchange(input);
        const order = res?.createPointsOrderExchange;
        ui.hideLoading();
        if (!order) throw new Error(t('pointsGoods.exchangeFailed'));
        if (order.cashTotal > 0) {
            await payOrder(order);
        } else {
            ui.showToast(product.value.deliveryType === 'virtual' ? t('pointsGoods.virtualSuccess') : t('pointsGoods.exchangeSuccess'), 'success');
        }
        setTimeout(() => uni.redirectTo({ url: '/pkg-user/pages/points-orders' }), 800);
    } catch (e: any) {
        ui.hideLoading();
        ui.showToast(errText(e), 'error');
    } finally {
        submitting.value = false;
    }
}

/** 混合价单拉微信支付：与 recharge.vue 同款（tradeType 按端、pay 结构一致走 handlePayment） */
async function payOrder(order: any) {
    const tradeType = getPlatform() === 'mp-weixin' ? 'JSAPI' : 'H5';
    const payRes: any = await createPointsOrderPayment(order.id, tradeType);
    const pay = payRes?.createPointsOrderPayment?.pay;
    const result = await handlePayment('wechatpay', pay);
    if (result.success) {
        ui.showToast(t('pointsGoods.paySuccess'), 'success');
    } else {
        ui.showToast(result.message || t('pointsGoods.payLaterHint'), 'error');
    }
}

/** 后端错误码 → i18n 文案（OUT_OF_STOCK / PER_USER_LIMIT_EXCEEDED / NOT_IN_VALIDITY / ADDRESS_REQUIRED / Insufficient points） */
function errText(e: any): string {
    const msg = e?.response?.errors?.[0]?.message || e?.message || '';
    if (msg.includes('OUT_OF_STOCK')) return t('pointsGoods.errOutOfStock');
    if (msg.includes('PER_USER_LIMIT_EXCEEDED')) return t('pointsGoods.errPerUserLimit');
    if (msg.includes('NOT_IN_VALIDITY')) return t('pointsGoods.errNotInValidity');
    if (msg.includes('ADDRESS_REQUIRED')) return t('pointsGoods.errAddressRequired');
    if (msg.toLowerCase().includes('insufficient points')) return t('pointsGoods.errInsufficientPoints');
    return msg || t('pointsGoods.exchangeFailed');
}
</script>

<style lang="scss" scoped>
.pgc-page {
    min-height: 100vh;
    background: $bg-color;
    padding: 20rpx;
    padding-bottom: 160rpx;
    &__placeholder { height: 20rpx; }
}
.pgc-card {
    background: #fff;
    border-radius: $radius-md;
    padding: 24rpx;
    display: flex;
    gap: 20rpx;
    &__info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    &__name { font-size: 30rpx; font-weight: bold; color: $text-color; }
    &__price { display: flex; align-items: baseline; }
    &__points { font-size: 34rpx; font-weight: bold; color: $brand-color; }
    &__cash { font-size: 26rpx; color: $brand-color; margin-left: 8rpx; }
}
.pgc-section {
    background: #fff;
    border-radius: $radius-md;
    padding: 24rpx;
    margin-top: 20rpx;
    &__row { display: flex; justify-content: space-between; align-items: center; padding: 8rpx 0; }
    &__label { font-size: 28rpx; color: $text-color; }
    &__hint { font-size: 22rpx; color: #999; margin-top: 8rpx; }
    &--virtual { display: flex; align-items: center; }
}
.stepper {
    display: flex;
    align-items: center;
    &__btn {
        width: 56rpx;
        height: 56rpx;
        line-height: 52rpx;
        text-align: center;
        border: 1rpx solid $border-color;
        border-radius: $radius-sm;
        font-size: 32rpx;
        color: $text-color;
        &--disabled { color: #ccc; }
    }
    &__num { min-width: 80rpx; text-align: center; font-size: 30rpx; font-weight: bold; }
}
.pgc-addr {
    &__top { display: flex; align-items: center; gap: 16rpx; }
    &__name { font-size: 30rpx; font-weight: bold; }
    &__phone { font-size: 26rpx; color: #666; }
    &__detail { display: block; font-size: 26rpx; color: #666; margin-top: 10rpx; line-height: 1.5; }
    &__change { display: block; font-size: 24rpx; color: $brand-color; margin-top: 12rpx; }
    &--empty { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; color: #999; }
    &__arrow { font-size: 32rpx; color: #ccc; }
}
.pgc-virtual-tag { font-size: 24rpx; color: #00b8a9; background: #e6f7f5; padding: 10rpx 20rpx; border-radius: $radius-sm; }
.pgc-detail {
    &__points { font-size: 30rpx; font-weight: bold; color: $brand-color; }
    &__value { font-size: 28rpx; color: $text-color; &--neg { color: $error-color; } }
}
.pgc-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 30rpx calc(16rpx + env(safe-area-inset-bottom));
    box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, .06);
    &__total { display: flex; align-items: baseline; }
    &__points { font-size: 36rpx; font-weight: bold; color: $brand-color; }
    &__cash { font-size: 26rpx; font-weight: bold; color: $brand-color; margin-left: 8rpx; }
    &__btn {
        background: $brand-color;
        color: #fff;
        font-size: 30rpx;
        padding: 0 60rpx;
        height: 84rpx;
        line-height: 84rpx;
        border-radius: 42rpx;
        border: none;
    }
}
.addr-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .45);
    z-index: 999;
    display: flex;
    align-items: flex-end;
}
.addr-sheet {
    width: 100%;
    background: #fff;
    border-radius: $radius-lg $radius-lg 0 0;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    &__head { display: flex; justify-content: space-between; align-items: center; padding: 28rpx 30rpx 16rpx; }
    &__title { font-size: 30rpx; font-weight: bold; }
    &__close { font-size: 32rpx; color: #999; padding: 0 10rpx; }
    &__list { flex: 1; max-height: 52vh; padding: 0 30rpx; box-sizing: border-box; }
    &__empty { text-align: center; color: #999; font-size: 26rpx; padding: 60rpx 0; }
    &__footer { text-align: center; font-size: 28rpx; color: $brand-color; padding: 24rpx 0 calc(24rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid $border-color; }
}
.addr-option {
    padding: 20rpx 0;
    border-bottom: 1rpx solid $border-color;
    &--selected { background: #fff7f0; }
    &__top { display: flex; align-items: center; gap: 16rpx; }
    &__name { font-size: 28rpx; font-weight: bold; }
    &__phone { font-size: 24rpx; color: #666; }
    &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; border-radius: $radius-sm; padding: 0 8rpx; }
    &__detail { display: block; font-size: 24rpx; color: #666; margin-top: 8rpx; line-height: 1.5; }
}
</style>

<template>
  <view class="invoice-apply">
    <view class="form-card">
      <view class="form-title">{{ t('invoiceApply.titleType') }}</view>
      <view class="type-tabs">
        <view
          class="type-tab"
          :class="{ 'type-tab--active': form.invoiceType === 'ordinary' }"
          @click="form.invoiceType = 'ordinary'"
        >{{ t('invoiceApply.typeOrdinary') }}</view>
        <view
          class="type-tab"
          :class="{ 'type-tab--active': form.invoiceType === 'special' }"
          @click="form.invoiceType = 'special'"
        >{{ t('invoiceApply.typeSpecial') }}</view>
      </view>
    </view>

    <view class="form-card" v-if="titles.length">
      <view class="form-title">{{ t('invoiceApply.selectTitle') }}</view>
      <view
        v-for="tit in titles"
        :key="tit.id"
        class="title-item"
        :class="{ 'title-item--active': selectedTitleId === tit.id }"
        @click="selectTitle(tit)"
      >
        <view class="title-item__main">
          <text class="title-item__name">{{ tit.title }}</text>
          <text v-if="tit.taxNumber" class="title-item__tax">{{ t('invoiceTitles.taxNoLabel') }} {{ tit.taxNumber }}</text>
          <text v-if="tit.email" class="title-item__email">{{ t('invoiceTitles.emailFieldLabel') }} {{ tit.email }}</text>
        </view>
        <text v-if="tit.isDefault" class="title-item__default">{{ t('invoiceTitles.defaultTag') }}</text>
        <text v-else class="title-item__check" :class="{ 'is-on': selectedTitleId === tit.id }"></text>
      </view>
      <view class="title-add" @click="goManageTitles">{{ t('invoiceApply.manageTitles') }}</view>
    </view>

    <view class="form-card" v-if="!selectedTitleId">
      <view class="form-title">{{ t('invoiceApply.titleInfo') }}</view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.titleLabel') }} *</text><input class="field__input" v-model="form.title" :placeholder="t('invoiceTitles.titlePlaceholder')" /></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.taxNumberLabel') }}</text><input class="field__input" v-model="form.taxNumber" :placeholder="t('invoiceTitles.taxNumberPlaceholder')" /></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.emailFieldLabel') }}</text><input class="field__input" v-model="form.email" :placeholder="t('invoiceTitles.emailPlaceholder')" type="text" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">{{ t('invoiceApply.bankNameLabel') }}</text><input class="field__input" v-model="form.bankName" :placeholder="t('invoiceApply.bankNameLabel')" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">{{ t('invoiceApply.bankAccountLabel') }}</text><input class="field__input" v-model="form.bankAccount" :placeholder="t('invoiceApply.bankAccountLabel')" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">{{ t('invoiceApply.companyAddressLabel') }}</text><input class="field__input" v-model="form.companyAddress" :placeholder="t('invoiceApply.companyAddressLabel')" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">{{ t('invoiceApply.companyPhoneLabel') }}</text><input class="field__input" v-model="form.companyPhone" :placeholder="t('invoiceApply.companyPhoneLabel')" /></view>
    </view>

    <view class="form-card">
      <view class="form-title">{{ t('invoiceApply.ordersTitle') }}</view>
      <view class="order-item" v-for="o in orders" :key="o.id">
        <text class="order-item__code">{{ o.code }}</text>
        <text class="order-item__amount">¥{{ (o.totalWithTax / 100).toFixed(2) }}</text>
      </view>
    </view>

    <view class="submit-wrap">
      <button class="submit-btn" :loading="submitting" :disabled="submitting" @click="submit">{{ t('invoiceApply.submit') }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { createInvoice } from '../../api/mutations/invoice';
import { getMyInvoiceTitles } from '../../api/queries/invoice';
const { t } = useI18n();
const form = ref<any>({ invoiceType: 'ordinary', title: '', taxNumber: '', email: '', bankName: '', bankAccount: '', companyAddress: '', companyPhone: '' });
const titles = ref<any[]>([]);
const selectedTitleId = ref<string>('');
const orders = ref<any[]>([]);
const submitting = ref(false);

function selectTitle(t: any) {
    selectedTitleId.value = t.id;
    form.value.title = t.title;
    form.value.taxNumber = t.taxNumber || '';
    form.value.email = t.email || '';
    form.value.bankName = t.bankName || '';
    form.value.bankAccount = t.bankAccount || '';
    form.value.companyAddress = t.companyAddress || '';
    form.value.companyPhone = t.companyPhone || '';
}
function goManageTitles() { uni.navigateTo({ url: '/pkg-user/pages/invoice-titles?select=1' }); }

onMounted(async () => {
    const pages = getCurrentPages(); const page = pages[pages.length - 1] as any;
    const ids = (page?.options?.orderIds || '').split(',').filter(Boolean);
    orders.value = ids.map((id: string) => ({ id, code: id, totalWithTax: 0 }));
    // 以后端为准，仅用于展示占位；真实金额可在订单列表传入
    try { const res: any = await getMyInvoiceTitles(); titles.value = res.myInvoiceTitles || []; const def = titles.value.find((t: any) => t.isDefault); if (def) selectTitle(def); } catch (e) { uni.showToast({ title: t('invoiceApply.titlesLoadFailed'), icon: 'none' }); }
});

async function submit() {
    if (!form.value.title) { uni.showToast({ title: t('invoiceTitles.titleRequired'), icon: 'none' }); return; }
    if (!orders.value.length) { uni.showToast({ title: t('invoiceApply.orderRequired'), icon: 'none' }); return; }
    submitting.value = true;
    try {
        const input: any = { ...form.value, orderIds: orders.value.map((o: any) => o.id) };
        // 命中已存抬头：回传 titleId，后端自动回填抬头快照字段（避免前端字段遗漏/不一致）
        if (selectedTitleId.value) input.invoiceTitleId = selectedTitleId.value;
        const res: any = await createInvoice(input);
        if (res?.createInvoice) {
            uni.showToast({ title: t('invoiceApply.success'), icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
        } else {
            uni.showToast({ title: t('invoiceApply.failed'), icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || t('invoiceApply.failed'), icon: 'none' });
    } finally {
        submitting.value = false;
    }
}
</script>
<style lang="scss" scoped>
.invoice-apply { padding: 20rpx 0 40rpx; }
.form-card { background: #fff; margin: 20rpx; padding: 30rpx; border-radius: $radius-md; }
.form-title { font-size: 30rpx; font-weight: bold; margin-bottom: 24rpx; }
.type-tabs { display: flex; gap: 16rpx; }
.type-tab { flex: 1; height: 80rpx; border: 1rpx solid $border-color; border-radius: $radius-md; display: flex; align-items: center; justify-content: center; font-size: 28rpx; color: $text-color-secondary; &--active { border-color: $brand-color; color: $brand-color; background: #fff3e6; } }
.title-item { padding: 20rpx 0; border-bottom: 1rpx solid $border-color; display: flex; align-items: center; justify-content: space-between; &--active { .title-item__name, .title-item__tax { color: $brand-color; } } &__main { display: flex; flex-direction: column; gap: 6rpx; } &__name { font-size: 28rpx; } &__tax, &__email { font-size: 24rpx; color: $text-color-secondary; } &__default { font-size: 22rpx; color: #fff; background: $brand-color; padding: 4rpx 14rpx; border-radius: 16rpx; } &__check { width: 36rpx; height: 36rpx; border: 2rpx solid $border-color; border-radius: 50%; &.is-on { border-color: $brand-color; background: $brand-color; box-shadow: inset 0 0 0 6rpx #fff; } } }
.title-add { margin-top: 16rpx; color: $brand-color; font-size: 26rpx; text-align: center; } 
.field { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $border-color; &__label { width: 180rpx; font-size: 28rpx; color: $text-color-secondary; } &__input { flex: 1; font-size: 28rpx; } }
.order-item { display: flex; justify-content: space-between; padding: 16rpx 0; border-bottom: 1rpx solid $border-color; &__code { font-size: 26rpx; color: $text-color-secondary; } &__amount { font-size: 28rpx; color: $price-color; } }
.submit-wrap { padding: 20rpx; }
.submit-btn { background: $brand-color; color: #fff; font-size: 30rpx; height: 88rpx; border-radius: $radius-md; border: none; }
</style>
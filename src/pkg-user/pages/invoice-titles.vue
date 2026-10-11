<template>
  <view class="title-mgmt">
    <view v-if="titles.length === 0" class="empty">
      <text class="empty__text">{{ t('invoiceTitles.empty') }}</text>
    </view>
    <view class="title-card" v-for="item in titles" :key="item.id" @click="edit(item)">
      <view class="title-card__main">
        <text class="title-card__name">{{ item.title }} <text v-if="item.isDefault" class="title-card__default">{{ t('invoiceTitles.defaultTag') }}</text></text>
        <text v-if="item.taxNumber" class="title-card__tax">{{ t('invoiceTitles.taxNoLabel') }} {{ item.taxNumber }}</text>
        <text v-if="item.email" class="title-card__email">{{ t('invoiceTitles.emailLabel') }} {{ item.email }}</text>
      </view>
      <view class="title-card__ops">
        <text class="op-btn" v-if="!item.isDefault" @click.stop="setDefault(item)">{{ t('invoiceTitles.setDefault') }}</text>
        <text class="op-btn op-btn--danger" @click.stop="remove(item)">{{ t('common.delete') }}</text>
      </view>
    </view>

    <view class="add-wrap">
      <button class="add-btn" @click="showForm = !showForm; resetForm()">{{ showForm ? t('invoiceTitles.collapse') : t('invoiceTitles.addTitle') }}</button>
    </view>

    <view class="form-sheet" v-if="showForm">
      <view class="field"><text class="field__label">{{ t('invoiceTitles.titleLabel') }} *</text><input class="field__input" v-model="form.title" :placeholder="t('invoiceTitles.titlePlaceholder')" /></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.taxNumberLabel') }}</text><input class="field__input" v-model="form.taxNumber" :placeholder="t('invoiceTitles.taxNumberPlaceholder')" /></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.emailFieldLabel') }}</text><input class="field__input" v-model="form.email" :placeholder="t('invoiceTitles.emailPlaceholder')" /></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.bankLabel') }}</text><view class="field__inline"><input class="field__input" v-model="form.bankName" :placeholder="t('invoiceTitles.bankNamePlaceholder')" /><input class="field__input" v-model="form.bankAccount" :placeholder="t('invoiceTitles.bankAccountPlaceholder')" /></view></view>
      <view class="field"><text class="field__label">{{ t('invoiceTitles.companyLabel') }}</text><view class="field__inline"><input class="field__input" v-model="form.companyAddress" :placeholder="t('invoiceTitles.addressPlaceholder')" /><input class="field__input" v-model="form.companyPhone" :placeholder="t('invoiceTitles.phonePlaceholder')" /></view></view>
      <button class="save-btn" @click="save">{{ t('common.save') }}</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getMyInvoiceTitles } from '../../api/queries/invoice';
import { createInvoiceTitle, updateInvoiceTitle, setDefaultInvoiceTitle, deleteInvoiceTitle } from '../../api/mutations/invoice';
const { t } = useI18n();
const titles = ref<any[]>([]);
const showForm = ref(false);
const editingId = ref<string>('');
const form = ref<any>({});
function resetForm() { editingId.value = ''; form.value = { title: '', taxNumber: '', email: '', bankName: '', bankAccount: '', companyAddress: '', companyPhone: '' }; }
function edit(item: any) { editingId.value = item.id; form.value = { title: item.title, taxNumber: item.taxNumber, email: item.email, bankName: item.bankName, bankAccount: item.bankAccount, companyAddress: item.companyAddress, companyPhone: item.companyPhone }; showForm.value = true; }
async function load() { try { const res: any = await getMyInvoiceTitles(); titles.value = res.myInvoiceTitles || []; } catch (e) { console.error(e); } }
onMounted(load);
async function setDefault(item: any) { try { await setDefaultInvoiceTitle(item.id); uni.showToast({ title: t('invoiceTitles.defaultSet'), icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message, icon: 'none' }); } }
async function remove(item: any) { uni.showModal({ title: t('invoiceTitles.deleteTitle'), content: t('invoiceTitles.deleteConfirm'), success: async (r: any) => { if (r.confirm) { try { await deleteInvoiceTitle(item.id); uni.showToast({ title: t('invoiceTitles.deleted'), icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message, icon: 'none' }); } } } }); }
async function save() {
    if (!form.value.title) { uni.showToast({ title: t('invoiceTitles.titleRequired'), icon: 'none' }); return; }
    try {
        if (editingId.value) { await updateInvoiceTitle(editingId.value, form.value); } else { await createInvoiceTitle(form.value); }
        uni.showToast({ title: t('invoiceTitles.saveSuccess'), icon: 'success' }); showForm.value = false; resetForm(); load();
    } catch (e: any) { uni.showToast({ title: e?.message || t('invoiceTitles.saveFailed'), icon: 'none' }); }
}
</script>
<style lang="scss" scoped>
.title-mgmt { padding: 20rpx 0 60rpx; }
.empty { text-align: center; color: #999; font-size: 26rpx; padding: 100rpx 0; }
.title-card { background: #fff; margin: 20rpx; border-radius: $radius-md; padding: 30rpx; display: flex; justify-content: space-between; align-items: center; &__main { display: flex; flex-direction: column; gap: 6rpx; } &__name { font-size: 30rpx; } &__default { font-size: 20rpx; color: #fff; background: $brand-color; padding: 2rpx 12rpx; border-radius: 14rpx; margin-left: 8rpx; } &__tax, &__email { font-size: 24rpx; color: $text-color-secondary; } &__ops { display: flex; gap: 20rpx; } }
.op-btn { font-size: 24rpx; color: $brand-color; &--danger { color: #e64340; } }
.add-wrap { padding: 20rpx; }
.add-btn { background: $brand-color; color: #fff; height: 84rpx; border-radius: $radius-md; font-size: 30rpx; border: none; }
.form-sheet { background: #fff; margin: 20rpx; border-radius: $radius-md; padding: 30rpx; }
.field { padding: 16rpx 0; &__label { font-size: 26rpx; color: $text-color-secondary; display: block; margin-bottom: 12rpx; } &__inline { display: flex; gap: 16rpx; } &__input { flex: 1; border: 1rpx solid $border-color; border-radius: $radius-sm; padding: 16rpx 20rpx; font-size: 28rpx; } }
.save-btn { margin-top: 20rpx; background: $brand-color; color: #fff; height: 80rpx; border-radius: $radius-md; font-size: 30rpx; border: none; }
</style>
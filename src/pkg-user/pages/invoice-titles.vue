<template>
  <view class="title-mgmt">
    <view v-if="titles.length === 0" class="empty">
      <text class="empty__text">暂无抬头，点下方新增</text>
    </view>
    <view class="title-card" v-for="t in titles" :key="t.id" @click="edit(t)">
      <view class="title-card__main">
        <text class="title-card__name">{{ t.title }} <text v-if="t.isDefault" class="title-card__default">默认</text></text>
        <text v-if="t.taxNumber" class="title-card__tax">税号 {{ t.taxNumber }}</text>
        <text v-if="t.email" class="title-card__email">邮箱 {{ t.email }}</text>
      </view>
      <view class="title-card__ops">
        <text class="op-btn" v-if="!t.isDefault" @click.stop="setDefault(t)">设为默认</text>
        <text class="op-btn op-btn--danger" @click.stop="remove(t)">删除</text>
      </view>
    </view>

    <view class="add-wrap">
      <button class="add-btn" @click="showForm = !showForm; resetForm()">{{ showForm ? '收起' : '新增抬头' }}</button>
    </view>

    <view class="form-sheet" v-if="showForm">
      <view class="field"><text class="field__label">抬头名称 *</text><input class="field__input" v-model="form.title" placeholder="个人 / 公司名称" /></view>
      <view class="field"><text class="field__label">税号</text><input class="field__input" v-model="form.taxNumber" placeholder="企业税号" /></view>
      <view class="field"><text class="field__label">接收邮箱</text><input class="field__input" v-model="form.email" placeholder="电子发票接收邮箱" /></view>
      <view class="field"><text class="field__label">开户行/账号</text><view class="field__inline"><input class="field__input" v-model="form.bankName" placeholder="开户行" /><input class="field__input" v-model="form.bankAccount" placeholder="账号" /></view></view>
      <view class="field"><text class="field__label">注册地址/电话</text><view class="field__inline"><input class="field__input" v-model="form.companyAddress" placeholder="地址" /><input class="field__input" v-model="form.companyPhone" placeholder="电话" /></view></view>
      <button class="save-btn" @click="save">保存</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getMyInvoiceTitles } from '../../api/queries/invoice';
import { createInvoiceTitle, updateInvoiceTitle, setDefaultInvoiceTitle, deleteInvoiceTitle } from '../../api/mutations/invoice';
const titles = ref<any[]>([]);
const showForm = ref(false);
const editingId = ref<string>('');
const form = ref<any>({});
function resetForm() { editingId.value = ''; form.value = { title: '', taxNumber: '', email: '', bankName: '', bankAccount: '', companyAddress: '', companyPhone: '' }; }
function edit(t: any) { editingId.value = t.id; form.value = { title: t.title, taxNumber: t.taxNumber, email: t.email, bankName: t.bankName, bankAccount: t.bankAccount, companyAddress: t.companyAddress, companyPhone: t.companyPhone }; showForm.value = true; }
async function load() { try { const res: any = await getMyInvoiceTitles(); titles.value = res.myInvoiceTitles || []; } catch (e) { console.error(e); } }
onMounted(load);
async function setDefault(t: any) { try { await setDefaultInvoiceTitle(t.id); uni.showToast({ title: '已设为默认', icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message, icon: 'none' }); } }
async function remove(t: any) { uni.showModal({ title: '删除抬头', content: '确定删除该抬头?', success: async (r: any) => { if (r.confirm) { try { await deleteInvoiceTitle(t.id); uni.showToast({ title: '已删除', icon: 'success' }); load(); } catch (e: any) { uni.showToast({ title: e?.message, icon: 'none' }); } } } }); }
async function save() {
    if (!form.value.title) { uni.showToast({ title: '请填写抬头名称', icon: 'none' }); return; }
    try {
        if (editingId.value) { await updateInvoiceTitle(editingId.value, form.value); } else { await createInvoiceTitle(form.value); }
        uni.showToast({ title: '保存成功', icon: 'success' }); showForm.value = false; resetForm(); load();
    } catch (e: any) { uni.showToast({ title: e?.message || '保存失败', icon: 'none' }); }
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
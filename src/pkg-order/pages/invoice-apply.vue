<template>
  <view class="invoice-apply">
    <view class="form-card">
      <view class="form-title">抬头类型</view>
      <view class="type-tabs">
        <view
          class="type-tab"
          :class="{ 'type-tab--active': form.invoiceType === 'ordinary' }"
          @click="form.invoiceType = 'ordinary'"
        >普通发票</view>
        <view
          class="type-tab"
          :class="{ 'type-tab--active': form.invoiceType === 'special' }"
          @click="form.invoiceType = 'special'"
        >专用发票</view>
      </view>
    </view>

    <view class="form-card" v-if="titles.length">
      <view class="form-title">选择抬头</view>
      <view
        v-for="t in titles"
        :key="t.id"
        class="title-item"
        :class="{ 'title-item--active': selectedTitleId === t.id }"
        @click="selectTitle(t)"
      >
        <view class="title-item__main">
          <text class="title-item__name">{{ t.title }}</text>
          <text v-if="t.taxNumber" class="title-item__tax">税号 {{ t.taxNumber }}</text>
          <text v-if="t.email" class="title-item__email">接收邮箱 {{ t.email }}</text>
        </view>
        <text v-if="t.isDefault" class="title-item__default">默认</text>
        <text v-else class="title-item__check" :class="{ 'is-on': selectedTitleId === t.id }"></text>
      </view>
      <view class="title-add" @click="goManageTitles">管理抬头 +</view>
    </view>

    <view class="form-card" v-if="!selectedTitleId">
      <view class="form-title">抬头信息</view>
      <view class="field"><text class="field__label">抬头名称 *</text><input class="field__input" v-model="form.title" placeholder="个人 / 公司名称" /></view>
      <view class="field"><text class="field__label">税号</text><input class="field__input" v-model="form.taxNumber" placeholder="企业税号" /></view>
      <view class="field"><text class="field__label">接收邮箱</text><input class="field__input" v-model="form.email" placeholder="电子发票接收邮箱" type="text" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">开户行</text><input class="field__input" v-model="form.bankName" placeholder="开户行" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">银行账号</text><input class="field__input" v-model="form.bankAccount" placeholder="银行账号" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">注册地址</text><input class="field__input" v-model="form.companyAddress" placeholder="注册地址" /></view>
      <view class="field" v-if="form.invoiceType === 'special'"><text class="field__label">注册电话</text><input class="field__input" v-model="form.companyPhone" placeholder="注册电话" /></view>
    </view>

    <view class="form-card">
      <view class="form-title">开票订单</view>
      <view class="order-item" v-for="o in orders" :key="o.id">
        <text class="order-item__code">{{ o.code }}</text>
        <text class="order-item__amount">¥{{ (o.totalWithTax / 100).toFixed(2) }}</text>
      </view>
    </view>

    <view class="submit-wrap">
      <button class="submit-btn" :loading="submitting" :disabled="submitting" @click="submit">提交开票申请</button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createInvoice } from '../../api/mutations/invoice';
import { getMyInvoiceTitles } from '../../api/queries/invoice';
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
    try { const res: any = await getMyInvoiceTitles(); titles.value = res.myInvoiceTitles || []; const def = titles.value.find((t: any) => t.isDefault); if (def) selectTitle(def); } catch (e) {}
});

async function submit() {
    if (!form.value.title) { uni.showToast({ title: '请填写抬头名称', icon: 'none' }); return; }
    if (!orders.value.length) { uni.showToast({ title: '请选择开票订单', icon: 'none' }); return; }
    submitting.value = true;
    try {
        const input = { ...form.value, orderIds: orders.value.map((o: any) => o.id) };
        const res: any = await createInvoice(input);
        if (res?.createInvoice) {
            uni.showToast({ title: '申请成功', icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
        } else {
            uni.showToast({ title: '申请失败', icon: 'none' });
        }
    } catch (e: any) {
        uni.showToast({ title: e?.message || '申请失败', icon: 'none' });
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
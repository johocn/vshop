<template>
  <view class="addresses-page">
    <view v-for="addr in addresses" :key="addr.id" class="addr-card">
      <view class="addr-card__main">
        <view class="addr-card__top">
          <text class="addr-card__name">{{ addr.fullName }}</text>
          <text class="addr-card__phone">{{ addr.phoneNumber }}</text>
          <text v-if="addr.defaultShippingAddress" class="addr-card__tag">默认</text>
        </view>
        <text class="addr-card__detail">{{ addr.province }} {{ addr.city }} {{ addr.streetLine1 }}{{ addr.streetLine2 ? ' ' + addr.streetLine2 : '' }}</text>
      </view>
      <view class="addr-card__actions">
        <text class="addr-card__edit" @click="editAddress(addr)">编辑</text>
        <text class="addr-card__del" @click="deleteAddr(addr.id)">删除</text>
        <text v-if="!addr.defaultShippingAddress" class="addr-card__default" @click="setDefault(addr)">设为默认</text>
      </view>
    </view>
    <EmptyState v-if="!loading && addresses.length === 0" text="暂无收货地址" />

    <!-- Add/Edit Form Modal -->
    <view v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <view class="modal-content">
        <text class="modal-title">{{ editingId ? '编辑地址' : '新增地址' }}</text>
        <input v-model="form.fullName" placeholder="收货人姓名" class="input" />
        <input v-model="form.phoneNumber" placeholder="手机号" type="number" class="input" />
        <view class="region-row" @click="showRegionPicker = true">
          <text :class="{ 'region-row__placeholder': !regionText() }">{{ regionText() || '请选择省/市/区' }}</text>
          <text class="region-row__arrow">▸</text>
        </view>
        <input v-model="form.streetLine1" placeholder="详细地址" class="input" />
        <input v-model="form.streetLine2" placeholder="补充地址(可选)" class="input" />
        <input v-model="form.postalCode" placeholder="邮编(可选)" class="input" />
        <view class="modal-check">
          <text>设为默认地址</text>
          <switch :checked="form.defaultShippingAddress" @change="form.defaultShippingAddress = $event.detail.value" />
        </view>
        <view class="modal-actions">
          <button class="btn-cancel" @click="showForm = false">取消</button>
          <button class="btn-save" @click="saveAddress">保存</button>
        </view>
      </view>
    </view>

    <view class="addresses-page__fab" @click="addNew">
      <text class="fab-text">+ 新增地址</text>
    </view>

    <!-- 省市区联动选择器 -->
    <RegionPicker
      v-model:visible="showRegionPicker"
      :init-province="form.province"
      :init-city="form.city"
      :init-district="form.district"
      @confirm="onRegionConfirm"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveCustomer } from '../../api/queries/user';
import { createCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from '../../api/mutations/address';
import { useUIStore } from '../../stores/ui';
import EmptyState from '../../components/EmptyState.vue';
import RegionPicker from '../../components/RegionPicker.vue';

const ui = useUIStore();
const addresses = ref<any[]>([]);
const loading = ref(true);
const showForm = ref(false);
const showRegionPicker = ref(false);
const editingId = ref('');

const emptyForm = () => ({
    fullName: '', phoneNumber: '', province: '', city: '', district: '',
    streetLine1: '', streetLine2: '', postalCode: '', countryCode: 'CN',
    defaultShippingAddress: false,
});
const form = ref(emptyForm());

onMounted(() => loadAddresses());

async function loadAddresses() {
    loading.value = true;
    try {
        const res: any = await getActiveCustomer();
        addresses.value = res.activeCustomer?.addresses || [];
    } catch (e) {}
    loading.value = false;
}

function addNew() {
    editingId.value = '';
    form.value = emptyForm();
    showForm.value = true;
}

function editAddress(addr: any) {
    editingId.value = addr.id;
    // Try to extract district from streetLine1 (format: "区名 详细地址")
    let district = '';
    let detailLine = addr.streetLine1 || '';
    const streetParts = detailLine.split(' ');
    if (streetParts.length > 1 && streetParts[0].endsWith('区')) {
        district = streetParts[0];
        detailLine = streetParts.slice(1).join(' ');
    }
    form.value = {
        fullName: addr.fullName || '',
        phoneNumber: addr.phoneNumber || '',
        province: addr.province || '',
        city: addr.city || '',
        district,
        streetLine1: detailLine,
        streetLine2: addr.streetLine2 || '',
        postalCode: addr.postalCode || '',
        countryCode: addr.country?.code || 'CN',
        defaultShippingAddress: addr.defaultShippingAddress || false,
    };
    showForm.value = true;
}

function regionText(): string {
    if (form.value.province) {
        return [form.value.province, form.value.city, form.value.district].filter(Boolean).join(' ');
    }
    return '';
}

function onRegionConfirm(region: { province: string; city: string; district: string }) {
    form.value.province = region.province;
    form.value.city = region.city;
    form.value.district = region.district;
}

function buildStreetLine1(): string {
    if (form.value.district) {
        return `${form.value.district} ${form.value.streetLine1}`.trim();
    }
    return form.value.streetLine1;
}

async function saveAddress() {
    if (!form.value.fullName || !form.value.phoneNumber || !form.value.streetLine1) {
        ui.showToast('请填写必要信息');
        return;
    }
    try {
        const payload = { ...form.value, streetLine1: buildStreetLine1() };
        delete (payload as any).district;
        if (editingId.value) {
            await updateCustomerAddress({ id: editingId.value, ...payload });
        } else {
            await createCustomerAddress(payload);
        }
        ui.showToast('保存成功', 'success');
        showForm.value = false;
        await loadAddresses();
    } catch (e: any) { ui.showToast(e.message); }
}

async function deleteAddr(id: string) {
    uni.showModal({
        title: '确认',
        content: '确定删除该地址?',
        success: async (res: any) => {
            if (res.confirm) {
                try {
                    await deleteCustomerAddress(id);
                    ui.showToast('已删除', 'success');
                    await loadAddresses();
                } catch (e: any) { ui.showToast(e.message); }
            }
        }
    });
}

async function setDefault(addr: any) {
    try {
        await updateCustomerAddress({ id: addr.id, defaultShippingAddress: true });
        ui.showToast('已设为默认', 'success');
        await loadAddresses();
    } catch (e: any) { ui.showToast(e.message); }
}
</script>

<style lang="scss" scoped>
.addresses-page { padding: 20rpx; padding-bottom: 140rpx; &__fab { position: fixed; bottom: 40rpx; left: 20rpx; right: 20rpx; height: 90rpx; background: $brand-color; color: #fff; display: flex; align-items: center; justify-content: center; border-radius: $radius-md; box-shadow: $shadow; } }
.fab-text { font-size: 30rpx; }
.addr-card {
    background: #fff; border-radius: $radius-md; margin-bottom: 16rpx; overflow: hidden;
    &__main { padding: 20rpx; }
    &__top { display: flex; align-items: center; gap: 16rpx; margin-bottom: 8rpx; }
    &__name { font-weight: bold; font-size: 30rpx; }
    &__phone { color: #666; font-size: 26rpx; }
    &__tag { font-size: 20rpx; color: $brand-color; border: 1rpx solid $brand-color; padding: 2rpx 12rpx; border-radius: 20rpx; }
    &__detail { font-size: 26rpx; color: $text-color-secondary; line-height: 1.5; }
    &__actions { display: flex; border-top: 1rpx solid $border-color; padding: 0; }
    &__edit, &__del, &__default { flex: 1; text-align: center; padding: 20rpx 0; font-size: 26rpx; border-right: 1rpx solid $border-color; }
    &__edit { color: $brand-color; }
    &__del { color: #999; }
    &__default { color: #07c160; border-right: none; }
}
.modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; }
.modal-content { background: #fff; width: 100%; border-radius: 24rpx 24rpx 0 0; padding: 40rpx 30rpx; }
.modal-title { font-size: 32rpx; font-weight: bold; text-align: center; margin-bottom: 30rpx; display: block; }
.input { height: 88rpx; border-bottom: 1rpx solid $border-color; font-size: 28rpx; margin-bottom: 4rpx; }
.region-row {
    height: 88rpx; border-bottom: 1rpx solid $border-color;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 28rpx; color: #333;
    &__placeholder { color: #999; }
    &__arrow { color: #ccc; font-size: 24rpx; }
}
.modal-check { display: flex; justify-content: space-between; align-items: center; padding: 20rpx 0; font-size: 28rpx; }
.modal-actions { display: flex; gap: 20rpx; margin-top: 30rpx; }
.btn-cancel { flex: 1; height: 88rpx; background: #f5f5f5; color: #666; border: none; border-radius: $radius-md; font-size: 28rpx; }
.btn-save { flex: 1; height: 88rpx; background: $brand-color; color: #fff; border: none; border-radius: $radius-md; font-size: 28rpx; }
</style>

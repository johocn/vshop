<template>
  <view class="tenant-bar">
    <view class="tenant-bar__current" @click="togglePopup">
      <text class="tenant-bar__name">{{ tenantName }}</text>
      <text class="tenant-bar__icon">{{ showPopup ? '▲' : '▼' }}</text>
    </view>
    <view v-if="showPopup" class="tenant-bar__popup">
      <view
        v-for="t in tenants"
        :key="t.code"
        class="tenant-bar__option"
        :class="{ active: t.code === tenantCode }"
        @click="selectTenant(t.code)"
      >
        <text>{{ t.name }}</text>
        <text v-if="t.code === tenantCode" class="tenant-bar__check">✓</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTenantStore } from '../stores/tenant';
import { resetClient } from '../api/client';

const tenantStore = useTenantStore();
const tenantName = computed(() => tenantStore.tenantName);
const tenantCode = computed(() => tenantStore.tenantCode);
const tenants = computed(() => tenantStore.listTenants());
const showPopup = ref(false);

function togglePopup() {
    showPopup.value = !showPopup.value;
}

function selectTenant(code: string) {
    if (code === tenantCode.value) {
        showPopup.value = false;
        return;
    }
    const ok = tenantStore.switchTenant(code);
    if (ok) {
        resetClient();
        showPopup.value = false;
        // 刷新页面以重新加载所有数据
        setTimeout(() => {
            // #ifdef H5
            const url = new URL(window.location.href);
            url.searchParams.set('tenant', code);
            window.location.href = url.toString();
            // #endif
        }, 100);
    }
}
</script>

<style lang="scss" scoped>
.tenant-bar {
    position: relative;
    background: #fff;
    padding: 16rpx 24rpx;
    border-bottom: 1rpx solid #eee;

    &__current {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8rpx;
    }

    &__name {
        font-size: 30rpx;
        font-weight: 600;
        color: #333;
    }

    &__icon {
        font-size: 20rpx;
        color: #999;
    }

    &__popup {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        border-radius: 12rpx;
        box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.12);
        min-width: 320rpx;
        z-index: 100;
        overflow: hidden;
    }

    &__option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24rpx;
        font-size: 28rpx;
        border-bottom: 1rpx solid #f5f5f5;

        &:last-child {
            border-bottom: none;
        }

        &.active {
            color: $brand-color;
            background: #fff8f3;
        }
    }

    &__check {
        color: $brand-color;
        font-weight: bold;
    }
}
</style>

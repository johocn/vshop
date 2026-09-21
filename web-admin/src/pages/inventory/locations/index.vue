<template>
  <view class="page">
    <view class="toolbar">
      <view class="tenant">
        <text class="tt">{{ $t('inventoryLocations.tenantLabel') }}</text>
        <text class="tc">{{ tenantCode || $t('inventoryLocations.notSelected') }}</text>
      </view>
      <button class="add" @tap="onCreate">{{ $t('inventoryLocations.create') }}</button>
    </view>

    <!-- 库存方案：物理/虚拟口径 + 系统仓落点（编码由服务端规则生成，此处只读展示） -->
    <view v-if="ov" class="card plan">
      <view class="plan-head">
        <text class="plan-title">{{ $t('inventoryLocations.planTitle') }}</text>
        <text class="badge" :class="ov.physicalStockEnabled ? 'phy' : 'vir'">
          {{ ov.physicalStockEnabled ? $t('inventoryLocations.planEnabled') : $t('inventoryLocations.planDisabled') }}
        </text>
      </view>
      <view class="code-row">
        <text class="ck">{{ $t('inventoryLocations.virtualCodeLabel') }}</text>
        <text class="cv">{{ ov.virtualCode }}</text>
        <text class="cs" :class="ov.virtualLocationId ? 'ok' : 'no'">
          {{ ov.virtualLocationId ? $t('inventoryLocations.ready') : $t('inventoryLocations.missing') }}
        </text>
      </view>
      <view class="code-row">
        <text class="ck">{{ $t('inventoryLocations.defaultCodeLabel') }}</text>
        <text class="cv">{{ ov.defaultPhysicalCode }}</text>
        <text class="cs" :class="ov.defaultPhysicalLocationId ? 'ok' : 'no'">
          {{ ov.defaultPhysicalLocationId ? $t('inventoryLocations.ready') : $t('inventoryLocations.missing') }}
        </text>
      </view>
      <view class="plan-hint">
        {{ ov.physicalStockEnabled ? $t('inventoryLocations.planHintEnabled') : $t('inventoryLocations.planHintDisabled') }}
      </view>
      <button v-if="needInit" class="init" :disabled="initing" @tap="onInit">
        {{ initing ? $t('inventoryLocations.initing') : $t('inventoryLocations.initBtn') }}
      </button>
    </view>

    <view class="card" v-for="s in locations" :key="s.id">
      <view class="row">
        <view class="info">
          <view class="head">
            <text class="name">{{ s.name }}</text>
            <text class="badge" :class="s.kind === 'physical' ? 'phy' : 'vir'">{{ s.kind === 'physical' ? $t('inventoryLocations.physical') : $t('inventoryLocations.virtual') }}</text>
            <text v-if="s.isSystem" class="badge sys">{{ $t('inventoryLocations.systemBadge') }}</text>
          </view>
          <view class="meta">
            <text class="pm">{{ s.code ? $t('inventoryLocations.codePrefix').replace('{code}', s.code) : $t('inventoryLocations.uncoded') }}</text>
            <text class="pm">{{ $t('inventoryLocations.deliveryPrefix').replace('{label}', deliveryLabel(s)) }}</text>
            <text class="pm">{{ $t('inventoryLocations.cityPrefix').replace('{label}', citiesLabel(s)) }}</text>
            <text v-if="hasCoords(s)" class="pm">{{ $t('inventoryLocations.coordsPrefix').replace('{lat}', fmtCoord(s.lat)).replace('{lng}', fmtCoord(s.lng)) }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text v-if="!isVirtualSystem(s)" @tap="onEdit(s)">{{ $t('inventoryLocations.edit') }}</text>
        <text v-if="!s.isSystem" class="del" @tap="onDel(s)">{{ $t('inventoryLocations.del') }}</text>
        <text v-else class="lock">{{ $t('inventoryLocations.systemNoDelete') }}</text>
      </view>
    </view>
    <view v-if="!locations.length" class="empty">{{ $t('inventoryLocations.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useTenantStore } from '../../../stores/tenantStore';
import { useLocaleStore } from '../../../stores/localeStore';
import {
  fetchTenantInventoryOverview,
  ensureTenantInventoryLocations,
  deleteTenantStockLocation,
  type TenantInventoryOverview,
  type TenantStockLocation,
} from '../../../apis/inventory';

const tenant = useTenantStore();
const locale = useLocaleStore();
const tenantCode = computed(() => tenant.code);
const ov = ref<TenantInventoryOverview | null>(null);
const initing = ref(false);

// 服务端已按「渠道可见 + 租户归属」过滤，前端不再自行按 channelCode 筛（避免规则分叉）
const locations = computed<TenantStockLocation[]>(() => ov.value?.locations ?? []);
const needInit = computed(() => {
  const o = ov.value;
  if (!o) return false;
  return !o.virtualLocationId || (o.physicalStockEnabled && !o.defaultPhysicalLocationId);
});

/** 系统虚拟仓为自动可售源，不提供编辑（避免误改编码导致线上可售口径漂移） */
function isVirtualSystem(s: TenantStockLocation): boolean {
  return s.isSystem && s.kind === 'virtual';
}

function deliveryLabel(s: TenantStockLocation): string {
  const m = (s.deliveryMethods ?? []) as string[];
  const hasMail = m.includes('MAIL');
  const hasPickup = m.includes('SELF_PICKUP');
  if (hasMail && hasPickup) return locale.t('inventoryLocations.delivMailPickup');
  if (hasMail) return locale.t('inventoryLocations.delivMailOnly');
  if (hasPickup) return locale.t('inventoryLocations.delivPickupOnly');
  return locale.t('inventoryLocations.delivUnconfig');
}

function citiesLabel(s: TenantStockLocation): string {
  const c = (s.serviceCities ?? []) as string[];
  return c.length ? c.join('、') : locale.t('inventoryLocations.nationwide');
}

function hasCoords(s: TenantStockLocation): boolean {
  return s.lat != null && s.lng != null;
}
function fmtCoord(v?: number | null): string {
  return v == null ? '-' : String(v);
}

async function reload() {
  try {
    ov.value = await fetchTenantInventoryOverview();
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryLocations.loadFailed'), icon: 'none' });
  }
}

// onShow 每次页面显示都刷新（新建/编辑返回后能看到最新网点；onMounted 只执行一次）
onShow(reload);

async function onInit() {
  if (initing.value) return;
  initing.value = true;
  try {
    ov.value = await ensureTenantInventoryLocations();
    uni.showToast({ title: locale.t('inventoryLocations.initDone'), icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: e?.message || locale.t('inventoryLocations.initFailed'), icon: 'none' });
  } finally {
    initing.value = false;
  }
}

function onCreate() {
  uni.navigateTo({ url: '/pages/inventory/locations/edit' });
}

function onEdit(s: TenantStockLocation) {
  uni.navigateTo({ url: `/pages/inventory/locations/edit?id=${s.id}` });
}

function onDel(s: TenantStockLocation) {
  uni.showModal({
    title: locale.t('inventoryLocations.deleteTitle'),
    content: locale.t('inventoryLocations.deleteContent').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        ov.value = await deleteTenantStockLocation(s.id);
        uni.showToast({ title: locale.t('inventoryLocations.deleted'), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || locale.t('inventoryLocations.deleteFailed'), icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page {
  min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24rpx;
    .tenant { display: flex; align-items: baseline; background: $wa-card; border-radius: $wa-radius; padding: 16rpx 24rpx;
      .tt { font-size: 24rpx; color: $wa-muted; margin-right: 12rpx; }
      .tc { font-size: 28rpx; color: $wa-ink; font-weight: 600; }
    }
    .add { width: 240rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin: 0; }
  }
  .plan { background: $wa-card; border-radius: $wa-radius; padding: 24rpx 32rpx; margin-bottom: 20rpx;
    .plan-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx;
      .plan-title { font-size: 30rpx; color: $wa-ink; font-weight: 600; }
    }
    .code-row { display: flex; align-items: center; padding: 8rpx 0;
      .ck { width: 200rpx; font-size: 26rpx; color: $wa-muted; }
      .cv { flex: 1; font-size: 26rpx; color: $wa-ink; word-break: break-all; }
      .cs { font-size: 22rpx; border-radius: 16rpx; padding: 2rpx 14rpx; color: #fff;
        &.ok { background: #16a34a; }
        &.no { background: #e64340; }
      }
    }
    .plan-hint { margin-top: 12rpx; font-size: 22rpx; color: $wa-muted; line-height: 1.6; }
    .init { margin-top: 20rpx; background: $wa-accent; color: #fff; font-size: 26rpx; border-radius: $wa-radius; }
  }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: flex-start;
      .info { flex: 1; min-width: 0;
        .head { display: flex; align-items: center; flex-wrap: wrap;
          .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
          .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 10rpx;
            &.phy { background: #2563eb; }
            &.vir { background: #9ca3af; }
            &.sys { background: #7c3aed; }
          }
        }
        .meta { margin-top: 12rpx; display: flex; flex-direction: column;
          .pm { font-size: 24rpx; color: $wa-muted; line-height: 1.6; }
        }
      }
    }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex; align-items: center;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 40rpx;
        &.del { color: #e64340; }
        &.lock { color: $wa-muted; font-size: 22rpx; margin-right: 0; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
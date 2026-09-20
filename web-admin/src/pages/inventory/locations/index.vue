<template>
  <view class="page">
    <view class="toolbar">
      <view class="tenant">
        <text class="tt">{{ $t('inventoryLocations.tenantLabel') }}</text>
        <text class="tc">{{ tenantCode || $t('inventoryLocations.notSelected') }}</text>
      </view>
      <button class="add" @tap="onCreate">{{ $t('inventoryLocations.create') }}</button>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <view class="info">
          <view class="head">
            <text class="name">{{ s.name }}</text>
            <text class="badge" :class="s.kind === 'physical' ? 'phy' : 'vir'">{{ s.kind === 'physical' ? $t('inventoryLocations.physical') : $t('inventoryLocations.virtual') }}</text>
          </view>
          <view class="meta">
            <text class="pm">{{ $t('inventoryLocations.deliveryPrefix').replace('{label}', deliveryLabel(s)) }}</text>
            <text class="pm">{{ $t('inventoryLocations.cityPrefix').replace('{label}', citiesLabel(s)) }}</text>
            <text v-if="hasCoords(s)" class="pm">{{ $t('inventoryLocations.coordsPrefix').replace('{lat}', fmtCoord(s.customFields?.lat)).replace('{lng}', fmtCoord(s.customFields?.lng)) }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(s)">{{ $t('inventoryLocations.edit') }}</text>
        <text class="del" @tap="onDel(s)">{{ $t('inventoryLocations.del') }}</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">{{ $t('inventoryLocations.empty') }}</view>

    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useTenantStore } from '../../../stores/tenantStore';
import { useLocaleStore } from '../../../stores/localeStore';
import { fetchLocations, deleteLocation, type LocationRow } from '../../../apis/inventory';

const tenant = useTenantStore();
const locale = useLocaleStore();
const tenantCode = computed(() => tenant.code);
const all = ref<LocationRow[]>([]);

// 展示本租户网点：channelCode 为空（旧数据）或等于当前租户编码
const items = computed(() =>
  all.value.filter((s) => {
    const c = s.customFields?.channelCode?.trim() || '';
    return !c || c === tenant.code;
  }),
);

function deliveryLabel(s: LocationRow): string {
  const m = (s.customFields?.deliveryMethods ?? []) as string[];
  const hasMail = m.includes('MAIL');
  const hasPickup = m.includes('SELF_PICKUP');
  if (hasMail && hasPickup) return locale.t('inventoryLocations.delivMailPickup');
  if (hasMail) return locale.t('inventoryLocations.delivMailOnly');
  if (hasPickup) return locale.t('inventoryLocations.delivPickupOnly');
  return locale.t('inventoryLocations.delivUnconfig');
}

function citiesLabel(s: LocationRow): string {
  const c = (s.customFields?.serviceCities ?? []) as string[];
  return c.length ? c.join('、') : locale.t('inventoryLocations.nationwide');
}

function hasCoords(s: LocationRow): boolean {
  return s.customFields?.lat != null && s.customFields?.lng != null;
}
function fmtCoord(v?: number | null): string {
  return v == null ? '-' : String(v);
}

async function reload() {
  all.value = await fetchLocations();
}

// onShow 每次页面显示都刷新（新建/编辑返回后能看到最新网点；onMounted 只执行一次）
onShow(reload);

function onCreate() {
  uni.navigateTo({ url: '/pages/inventory/locations/edit' });
}

function onEdit(s: LocationRow) {
  uni.navigateTo({ url: `/pages/inventory/locations/edit?id=${s.id}` });
}

function onDel(s: LocationRow) {
  uni.showModal({
    title: locale.t('inventoryLocations.deleteTitle'),
    content: locale.t('inventoryLocations.deleteContent').replace('{name}', s.name),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteLocation(s.id);
        await reload();
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
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: flex-start;
      .info { flex: 1; min-width: 0;
        .head { display: flex; align-items: center; flex-wrap: wrap;
          .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
          .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx;
            &.phy { background: #2563eb; }
            &.vir { background: #9ca3af; }
          }
        }
        .meta { margin-top: 12rpx; display: flex; flex-direction: column;
          .pm { font-size: 24rpx; color: $wa-muted; line-height: 1.6; }
        }
      }
    }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 40rpx;
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>

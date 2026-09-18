<template>
  <view class="page">
    <view class="toolbar">
      <view class="tenant">
        <text class="tt">当前租户</text>
        <text class="tc">{{ tenantCode || '未选择' }}</text>
      </view>
      <button class="add" @tap="onCreate">＋ 新建网点</button>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <view class="info">
          <view class="head">
            <text class="name">{{ s.name }}</text>
            <text class="badge" :class="s.kind === 'physical' ? 'phy' : 'vir'">{{ s.kind === 'physical' ? '物理' : '虚拟' }}</text>
          </view>
          <view class="meta">
            <text class="pm">配送：{{ deliveryLabel(s) }}</text>
            <text class="pm">城市：{{ citiesLabel(s) }}</text>
            <text v-if="hasCoords(s)" class="pm">坐标 {{ fmtCoord(s.customFields?.lat) }}, {{ fmtCoord(s.customFields?.lng) }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(s)">编辑</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无网点</view>

    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import { useTenantStore } from '../../../stores/tenantStore';
import { fetchLocations, deleteLocation, type LocationRow } from '../../../apis/inventory';

const tenant = useTenantStore();
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
  if (hasMail && hasPickup) return '邮寄 + 自提';
  if (hasMail) return '仅邮寄';
  if (hasPickup) return '仅自提';
  return '邮寄 + 自提（未配置）';
}

function citiesLabel(s: LocationRow): string {
  const c = (s.customFields?.serviceCities ?? []) as string[];
  return c.length ? c.join('、') : '全国';
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

onMounted(reload);

function onCreate() {
  uni.navigateTo({ url: '/pages/inventory/locations/edit/index' });
}
function onEdit(s: LocationRow) {
  uni.navigateTo({ url: `/pages/inventory/locations/edit/index?id=${s.id}` });
}

function onDel(s: LocationRow) {
  uni.showModal({
    title: '删除网点',
    content: `删除「${s.name}」？关联库存记录将一并移除。`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteLocation(s.id);
        await reload();
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' });
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

<template>
  <view class="page">
    <view class="toolbar">
      <button class="add" @tap="onCreate">＋ 新增自提点</button>
    </view>

    <view class="card" v-for="s in items" :key="s.id">
      <view class="row">
        <image v-if="s.photos?.length" class="thumb" :src="s.photos[0]" mode="aspectFill" />

        <view class="info">
          <view class="head">
            <text class="name">{{ s.name }}</text>
            <text class="badge" :class="s.type">{{ typeLabel(s.type) }}</text>
            <text v-if="!s.enabled" class="badge off">停用</text>
          </view>
          <text v-if="s.address" class="addr">{{ s.address }}</text>
          <view class="meta">
            <text v-if="s.contactPerson" class="pm">👤 {{ s.contactPerson }}</text>
            <text v-if="s.phoneNumber" class="pm">☎ {{ s.phoneNumber }}</text>
            <text v-if="s.businessHours" class="pm">🕘 {{ s.businessHours }}</text>
          </view>
          <view v-if="s.coordinates" class="meta">
            <text class="pm">📍 {{ s.coordinates.lat }}, {{ s.coordinates.lng }}</text>
          </view>
        </view>
      </view>
      <view class="ops">
        <text @tap="onEdit(s)">编辑</text>
        <text class="setdefault" @tap="onToggle(s)">{{ s.enabled ? '停用' : '启用' }}</text>
        <text class="del" @tap="onDel(s)">删除</text>
      </view>
    </view>
    <view v-if="!items.length" class="empty">暂无自提点</view>
    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchPickupLocations, updatePickupLocation, deletePickupLocation, PickupLocationItem } from '../../apis/pickup-location';

const items = ref<PickupLocationItem[]>([]);
const TYPE_LABEL: Record<string, string> = { store: '门店', point: '自提点', employee: '职工单位' };
const typeLabel = (t: string) => TYPE_LABEL[t] || t;

async function reload() { items.value = await fetchPickupLocations(); }
onMounted(reload);

function onCreate() {
  uni.navigateTo({ url: '/pages/pickup/edit/index' });
}
function onEdit(s: PickupLocationItem) {
  uni.navigateTo({ url: `/pages/pickup/edit/index?id=${s.id}` });
}
async function onToggle(s: PickupLocationItem) {
  try {
    await updatePickupLocation({ id: s.id, enabled: !s.enabled });
    await reload();
  } catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
}
function onDel(s: PickupLocationItem) {
  uni.showModal({
    title: '删除', content: `删除「${s.name}」？`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await deletePickupLocation(s.id); await reload(); }
      catch (e: any) { uni.showToast({ title: e?.message || '删除失败', icon: 'none' }); }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { min-height: 100vh; background: $wa-bg; padding: 24rpx 32rpx 160rpx;
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: flex-start;
      .thumb { width: 120rpx; height: 120rpx; border-radius: $wa-radius; margin-right: 20rpx; background: $wa-bg; flex-shrink: 0; }
      .info { flex: 1; min-width: 0;
        .head { display: flex; align-items: center; flex-wrap: wrap;
          .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
          .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 8rpx;
            &.store { background: #f0821f; }
            &.point { background: #2563eb; }
            &.employee { background: #7c3aed; }
            &.off { background: #bbb; }
          }
        }
        .addr { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
        .meta { margin-top: 8rpx; display: flex; flex-wrap: wrap;
          .pm { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
        }
      }
    }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        .setdefault { color: $wa-accent; }
        .del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
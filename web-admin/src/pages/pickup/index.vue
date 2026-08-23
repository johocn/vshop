<template>
  <view class="page">
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'mine' }" @tap="switchTab('mine')">本店自提点</text>
      <text class="tab" :class="{ on: tab === 'pool' }" @tap="switchTab('pool')">全局自提点池</text>
    </view>

    <template v-if="tab === 'mine'">
      <view class="toolbar">
        <button class="add" @tap="onCreate">＋ 新增自提点</button>
      </view>
      <view class="card" v-for="s in items" :key="s.id">
        <view class="row">
          <view class="info">
            <view class="head">
              <text class="name">{{ s.name }}</text>
              <text class="badge" :class="s.type">{{ typeLabel(s.type) }}</text>
              <text v-if="s.isPublic" class="badge global">全局</text>
              <text v-if="!s.enabled" class="badge off">停用</text>
            </view>
            <text v-if="s.address" class="addr">{{ s.address }}</text>
            <view class="meta">
              <text v-if="s.phoneNumber" class="pm">☎ {{ s.phoneNumber }}</text>
              <text v-if="s.businessHours" class="pm">🕘 {{ s.businessHours }}</text>
            </view>
          </view>
        </view>
        <view class="ops">
          <text v-if="editable(s)" @tap="onEdit(s)">编辑</text>
          <text v-if="!s.isPublic" class="setdefault" @tap="onToggle(s)">{{ s.enabled ? '停用' : '启用' }}</text>
          <text v-if="!s.isPublic && !s.enabled && auth.isSuperAdmin" class="promote" @tap="onPromote(s)">设为全局</text>
          <text v-if="s.isPublic" class="del" @tap="onRemove(s)">不用本店点</text>
          <text v-if="!s.isPublic" class="del" @tap="onDel(s)">删除</text>
        </view>
      </view>
      <view v-if="!items.length" class="empty">暂无自提点</view>
    </template>

    <template v-else>
      <view class="hint">全局自提点由超级管理员维护，租户「复制到本店」即引用共享（不克隆副本）。</view>
      <view class="card" v-for="g in pool" :key="g.id">
        <view class="row">
          <view class="info">
            <view class="head">
              <text class="name">{{ g.name }}</text>
              <text class="badge" :class="g.type">{{ typeLabel(g.type) }}</text>
              <text class="badge global">全局</text>
            </view>
            <text v-if="g.address" class="addr">{{ g.address }}</text>
            <view class="meta"><text v-if="g.phoneNumber" class="pm">☎ {{ g.phoneNumber }}</text></view>
          </view>
        </view>
        <view class="ops">
          <text v-if="auth.isSuperAdmin" @tap="onEdit(g)">编辑</text>
          <text v-if="!assigned(g.id)" class="copy" @tap="onAssign(g)">复制到本店</text>
          <text v-else class="assigned">已复制</text>
        </view>
      </view>
      <view v-if="!pool.length" class="empty">暂无全局自提点</view>
    </template>

    <view style="height: 120rpx" />
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../../stores/authStore';
import { fetchPickupLocations, updatePickupLocation, deletePickupLocation, assignToChannel, removeFromChannel, promoteToListPublic, PickupLocationItem } from '../../apis/pickup-location';

const tab = ref<'mine' | 'pool'>('mine');
const items = ref<PickupLocationItem[]>([]);
const pool = ref<PickupLocationItem[]>([]);
const auth = useAuthStore();

const TYPE_LABEL: Record<string, string> = { store: '门店', point: '自提点', employee: '职工单位' };
const typeLabel = (t: string) => TYPE_LABEL[t] || t;
const assigned = (id: string) => items.value.some((s) => s.id === id);
// 全局点租户只读：可编辑的仅自身租户级点，或超管编辑全局点
const editable = (s: PickupLocationItem) => !s.isPublic || auth.isSuperAdmin;

async function reload() { items.value = await fetchPickupLocations(); }
async function switchTab(t: 'mine' | 'pool') {
  tab.value = t;
  if (t === 'mine') await reload();
  if (t === 'pool') pool.value = await fetchPickupLocations(true);
}
onMounted(async () => { await reload(); pool.value = await fetchPickupLocations(true); });

function onCreate() { uni.navigateTo({ url: '/pages/pickup/edit/index' }); }
function onEdit(s: PickupLocationItem) { uni.navigateTo({ url: `/pages/pickup/edit/index?id=${s.id}` }); }

async function onToggle(s: PickupLocationItem) {
  try { await updatePickupLocation({ id: s.id, enabled: !s.enabled }); await reload(); }
  catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
}

function onPromote(s: PickupLocationItem) {
  uni.showModal({
    title: '设为全局', content: `确认将「${s.name}」设为全局？全平台租户可选用且仅超管可编辑。`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await promoteToListPublic(s.id); await reload(); uni.showToast({ title: '已设为全局', icon: 'none' }); }
      catch (e: any) { uni.showToast({ title: e?.message || '操作失败', icon: 'none' }); }
    },
  });
}

async function onAssign(g: PickupLocationItem) {
  try { await assignToChannel([g.id]); await reload(); await switchTab('pool'); uni.showToast({ title: '已复制到本店', icon: 'none' }); }
  catch (e: any) { uni.showToast({ title: e?.message || '复制失败', icon: 'none' }); }
}

function onRemove(s: PickupLocationItem) {
  uni.showModal({
    title: '不用本店点', content: `确认移除「${s.name}」？本店将不再使用该全局点。`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await removeFromChannel([s.id]); await reload(); uni.showToast({ title: '已移除', icon: 'none' }); }
      catch (e: any) { uni.showToast({ title: e?.message || '移除失败', icon: 'none' }); }
    },
  });
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
  .tabs { display: flex; background: $wa-card; border-radius: $wa-radius; padding: 8rpx; margin-bottom: 20rpx;
    .tab { flex: 1; text-align: center; font-size: 28rpx; color: $wa-muted; padding: 18rpx 0; border-radius: 14rpx;
      &.on { background: $wa-accent; color: #fff; font-weight: 600; }
    }
  }
  .hint { background: #fff7f0; border: 1px solid #ffe0c4; color: #b05000; font-size: 24rpx; border-radius: 16rpx; padding: 18rpx 22rpx; margin-bottom: 20rpx; }
  .toolbar .add { width: 260rpx; background: $wa-accent; color: #fff; font-size: 28rpx; border-radius: $wa-radius; margin-bottom: 24rpx; }
  .card { background: $wa-card; border-radius: $wa-radius; padding: 28rpx 32rpx; margin-bottom: 20rpx;
    .row { display: flex; align-items: flex-start;
      .info { flex: 1; min-width: 0;
        .head { display: flex; align-items: center; flex-wrap: wrap;
          .name { font-size: 28rpx; color: $wa-ink; font-weight: 600; margin-right: 12rpx; }
          .badge { font-size: 20rpx; color: #fff; border-radius: 16rpx; padding: 2rpx 14rpx; margin-right: 8rpx;
            &.store { background: #f0821f; }
            &.point { background: #2563eb; }
            &.employee { background: #7c3aed; }
            &.global { background: #0a9c6e; }
            &.off { background: #bbb; }
          }
        }
        .addr { display: block; margin-top: 8rpx; font-size: 24rpx; color: $wa-muted; }
        .meta { margin-top: 8rpx; display: flex; flex-wrap: wrap;
          .pm { font-size: 22rpx; color: $wa-muted; margin-right: 20rpx; }
        }
      }
    }
    .ops { margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $wa-rule; display: flex; flex-wrap: wrap; align-items: center;
      text { font-size: 26rpx; color: $wa-accent; margin-right: 32rpx;
        &.setdefault { color: $wa-accent; }
        &.copy { color: $wa-accent; font-weight: 600; }
        &.assigned { color: #bbb; }
        &.promote { color: #0a9c6e; font-weight: 600; }
        &.del { color: #e64340; }
      }
    }
  }
  .empty { text-align: center; color: $wa-muted; font-size: 28rpx; padding: 80rpx 0; }
}
</style>
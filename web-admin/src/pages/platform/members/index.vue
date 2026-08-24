<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">本租户人员</text>
        <text class="btn" @tap="onAdd">＋添加人员</text>
      </view>
      <view class="item" v-for="m in members" :key="m.id">
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}</text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggle(m, $event)" />
        <text class="link" @tap="onRemove(m)">移除</text>
      </view>
      <view v-if="!members.length" class="empty">暂无人员</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember,
  type TenantMemberItem,
} from '../../../apis/tenant-admin';

const members = ref<TenantMemberItem[]>([]);

onShow(load);
async function load() { members.value = await fetchMyTenantMembers(); }

function onAdd() {
  uni.showModal({
    title: '添加人员',
    editable: true,
    placeholderText: '登录邮箱',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        // 不传密码：后端生成随机强口令并标记首次登录强制改密，initialPassword 仅本次返回展示一次
        const pwd = await createTenantMember({ emailAddress: r.content, displayName: r.content, roleIds: [] });
        uni.showModal({
          title: '初始口令（仅显示一次）',
          content: `账号：${r.content}\n初始口令：${pwd}\n请立即转发给本人，首次登录后将被强制修改密码。`,
          showCancel: false,
          success: () => {
            load();
          },
        });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '添加失败', icon: 'none' });
      }
    },
  });
}
function onToggle(m: TenantMemberItem, e: any) {
  uni.showModal({
    title: e.detail.value ? '启用人员' : '停用人员',
    content: `确定${e.detail.value ? '启用' : '停用'}「${m.displayName || m.administratorId}」？`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantMemberEnabled(m.id, e.detail.value as boolean);
        m.enabled = e.detail.value as boolean;
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        load();
      }
    },
  });
}
function onRemove(m: TenantMemberItem) {
  uni.showModal({
    title: '移除人员',
    content: `确定从本租户移除「${m.displayName || m.administratorId}」？`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteTenantMember(m.id);
        uni.showToast({ title: '已移除', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '移除失败', icon: 'none' });
      }
    },
  });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.btn { color: $pm-info; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: #e64340; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>
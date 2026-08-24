<template>
  <view class="page">
    <view class="tabs">
      <text class="tab" :class="{ on: tab === 'admin' }" @tap="tab = 'admin'">管理员</text>
      <text class="tab" :class="{ on: tab === 'role' }" @tap="tab = 'role'">角色</text>
    </view>

    <!-- 管理员 Tab -->
    <view v-if="tab === 'admin'" class="card">
      <view class="row head">
        <text class="title">管理员授权</text>
        <text class="btn" @tap="onAddAdmin">＋添加管理员</text>
      </view>
      <view class="item" v-for="m in admins" :key="m.id">
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}</text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggleAdmin(m, $event)" />
      </view>
      <view v-if="!admins.length" class="empty">暂无管理员</view>
    </view>

    <!-- 角色 Tab -->
    <view v-else class="card">
      <view class="row head">
        <text class="title">角色</text>
        <text class="btn" @tap="onAddRole">＋新建角色</text>
      </view>
      <view class="item col" v-for="r in roles" :key="r.id">
        <view class="row between">
          <text class="name">{{ r.description || r.code }}</text>
          <text class="link" @tap="onEditRole(r)">权限 ›</text>
        </view>
        <text class="sub">{{ r.code }} · {{ (r.permissions || []).length }} 项权限</text>
      </view>
      <view v-if="!roles.length" class="empty">暂无角色</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchTenantAdministrators, createTenantAdministrator, setTenantAdministratorEnabled,
  fetchTenantRoles, createTenantRole, deleteTenantRole,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';

const channelId = ref('');
const tab = ref<'admin' | 'role'>('admin');
const admins = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

onLoad((q: any) => { channelId.value = q.id; load(); });

async function load() {
  await Promise.all([loadAdmins(), loadRoles()]);
}
async function loadAdmins() {
  admins.value = await fetchTenantAdministrators(channelId.value);
}
async function loadRoles() {
  roles.value = await fetchTenantRoles(channelId.value);
}

function onAddAdmin() {
  uni.showModal({
    title: '添加管理员',
    editable: true,
    placeholderText: '登录邮箱',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      const adminRole = roles.value.find((x) => x.code.includes('tenant-admin') || x.description === '租户管理员');
      try {
        await createTenantAdministrator(channelId.value, {
          emailAddress: r.content,
          password: 'Admin@123456',
          roleIds: adminRole ? [adminRole.id] : [],
          displayName: r.content,
        });
        uni.showToast({ title: '已添加', icon: 'none' });
        loadAdmins();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '添加失败', icon: 'none' });
      }
    },
  });
}
function onToggleAdmin(m: TenantMemberItem, e: any) {
  uni.showModal({
    title: e.detail.value ? '启用人员' : '停用人员',
    content: `确定${e.detail.value ? '启用' : '停用'}该管理员？`,
    success: async (r) => {
      if (!r.confirm) return loadAdmins();
      try {
        await setTenantAdministratorEnabled(m.id, e.detail.value as boolean);
        m.enabled = e.detail.value as boolean;
        uni.showToast({ title: '已更新', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        loadAdmins();
      }
    },
  });
}
function onAddRole() {
  uni.showModal({
    title: '新建角色',
    editable: true,
    placeholderText: '角色编码（如 kefu）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenantRole(channelId.value, { code: r.content, description: r.content, permissions: ['ReadProduct'] });
        uni.showToast({ title: '已创建', icon: 'none' });
        loadRoles();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
}
function onEditRole(r: RoleItem) {
  uni.navigateTo({ url: `/pages/platform/roles/index?channelId=${channelId.value}` });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.tabs { display: flex; gap: 12rpx; margin-bottom: 20rpx; }
.tab { padding: 12rpx 30rpx; background: #fff; border-radius: 999rpx; font-size: 26rpx; color: #666; }
.tab.on { background: $pm-info; color: #fff; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.btn { color: $pm-info; font-size: 26rpx; }
.row { display: flex; align-items: center; }
.between { justify-content: space-between; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.item.col { flex-direction: column; align-items: stretch; gap: 8rpx; }
.info { flex: 1; }
.name { flex: 1; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 4rpx; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>
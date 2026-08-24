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
        <text class="head-btn" @tap="onAddAdmin">＋添加管理员</text>
      </view>
      <view class="item" v-for="m in admins" :key="m.id">
        <view class="info">
          <text class="name">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}<text v-if="m.phone"> · {{ m.phone }}</text></text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggleAdmin(m, $event)" />
      </view>
      <view v-if="!admins.length" class="empty">暂无管理员</view>
    </view>

    <!-- 角色 Tab -->
    <view v-else class="card">
      <view class="row head">
        <text class="title">角色</text>
        <text class="head-btn" @tap="onAddRole">＋新建角色</text>
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

  <!-- 添加管理员表单弹层 -->
  <view class="mask" v-if="showAdd" @tap="showAdd = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">添加管理员</text>
      <view class="field"><text class="label">邮箱 <text class="req">*</text></text><input class="input" v-model="addForm.emailAddress" placeholder="必填（全局唯一）" /></view>
      <view class="field"><text class="label">显示姓名</text><input class="input" v-model="addForm.displayName" placeholder="选填" /></view>
      <view class="field"><text class="label">手机号</text><input class="input" v-model="addForm.phone" placeholder="选填" /></view>
      <view class="field">
        <text class="label">角色</text>
        <view class="pick-trigger" @tap="showRolePick = true">
          <text v-if="!selectedRoleNames.length" class="ph">请选择角色</text>
          <view v-else class="pick-tags"><text v-for="n in selectedRoleNames" :key="n" class="pick-tag">{{ n }}</text></view>
          <text class="arrow">▾</text>
        </view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showAdd = false">取消</button>
        <button class="btn" @tap="submitAdd">添加</button>
      </view>
    </view>
  </view>

  <!-- 角色多选弹层 -->
  <view class="mask" v-if="showRolePick" @tap="showRolePick = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">选择角色</text>
      <view class="pick-list">
        <view v-for="r in roles" :key="r.id" class="pick-item" @tap="toggleRole(r.id)">
          <text class="pick-item-name" :class="{ on: addForm.roleIds.includes(r.id) }">{{ r.description || r.code }}</text>
          <text class="check" :class="{ on: addForm.roleIds.includes(r.id) }">{{ addForm.roleIds.includes(r.id) ? '✓' : '' }}</text>
        </view>
        <view v-if="!roles.length" class="empty">暂无角色，请先在「角色」Tab 创建</view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showRolePick = false">取消</button>
        <button class="btn" @tap="showRolePick = false">确定</button>
      </view>
    </view>
  </view>

  <PasswordPopup v-if="pwdPop" :title="'初始口令（仅显示一次）'" :account="pwdInfo.account" :password="pwdInfo.password" @close="pwdPop = false" />
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchTenantAdministrators, createTenantAdministrator, setTenantAdministratorEnabled,
  fetchTenantRoles, createTenantRole, deleteTenantRole,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import PasswordPopup from '../../../components/PasswordPopup.vue';

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

// 添加管理员表单弹层
const showAdd = ref(false);
const addForm = ref({ emailAddress: '', displayName: '', phone: '', roleIds: [] as string[] });
const showRolePick = ref(false);
const selectedRoleNames = computed(() =>
  roles.value.filter((r) => addForm.value.roleIds.includes(r.id)).map((r) => r.description || r.code),
);
const pwdPop = ref(false);
const pwdInfo = ref({ account: '', password: '' });

function onAddAdmin() {
  addForm.value = { emailAddress: '', displayName: '', phone: '', roleIds: [] };
  showAdd.value = true;
}
function toggleRole(id: string) {
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
async function submitAdd() {
  const email = addForm.value.emailAddress.trim();
  if (!email) { uni.showToast({ title: '邮箱必填', icon: 'none' }); return; }
  try {
    // 不传密码：后端生成随机强口令并标记首次登录强制改密，initialPassword 仅本次返回展示一次
    const pwd = await createTenantAdministrator(channelId.value, {
      emailAddress: email,
      roleIds: addForm.value.roleIds,
      displayName: addForm.value.displayName.trim() || email,
      phone: addForm.value.phone.trim() || undefined,
    });
    showAdd.value = false;
    if (pwd) {
      pwdInfo.value = { account: email, password: pwd };
      pwdPop.value = true;
    } else {
      uni.showToast({ title: '已添加', icon: 'none' });
    }
    loadAdmins();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '添加失败'), icon: 'none' });
  }
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
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.row { display: flex; align-items: center; }
.between { justify-content: space-between; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.item.col { flex-direction: column; align-items: stretch; gap: 8rpx; }
.info { flex: 1; }
.name { flex: 1; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 4rpx; }
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.pick-trigger { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; }
.pick-trigger .ph { color: #bbb; font-size: 26rpx; }
.pick-trigger .arrow { color: #999; font-size: 24rpx; }
.pick-tags { display: flex; flex-wrap: wrap; gap: 8rpx; flex: 1; }
.pick-tag { background: #eef4ff; color: $pm-info; border-radius: 999rpx; padding: 4rpx 16rpx; font-size: 22rpx; }
.pick-list { max-height: 480rpx; overflow-y: auto; margin-bottom: 8rpx; }
.pick-item { display: flex; align-items: center; justify-content: space-between; padding: 22rpx 8rpx; border-bottom: 1px solid #f2f2f2; }
.pick-item-name { font-size: 28rpx; color: #333; }
.pick-item-name.on { color: $pm-info; font-weight: 600; }
.check { width: 36rpx; height: 36rpx; border-radius: 50%; border: 1px solid #ddd; color: #fff; font-size: 22rpx; text-align: center; line-height: 36rpx; }
.check.on { background: $pm-info; border-color: $pm-info; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
</style>
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
          <text class="sub">ID: {{ m.administratorId }}<text v-if="m.phone"> · {{ m.phone }}</text> · <text class="link" @tap="openRoles(m)">角色</text></text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggle(m, $event)" />
        <text class="link" @tap="onRemove(m)">移除</text>
      </view>
      <view v-if="!members.length" class="empty">暂无人员</view>
    </view>
  </view>

  <view class="mask" v-if="showAdd" @tap="showAdd = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">添加人员</text>
      <view class="field"><text class="label">邮箱 <text class="req">*</text></text><input class="input" v-model="addForm.email" placeholder="必填（全局唯一）" /></view>
      <view class="field"><text class="label">显示姓名</text><input class="input" v-model="addForm.displayName" placeholder="选填" /></view>
      <view class="field"><text class="label">手机号</text><input class="input" v-model="addForm.phone" placeholder="选填" /></view>
      <view class="field">
        <text class="label">角色</text>
        <view class="perm-tags">
          <text v-for="r in roles" :key="r.id" class="perm" :class="{ on: addForm.roleIds.includes(r.id) }" @tap="toggleRole(r.id)">{{ r.description || r.code }}</text>
        </view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showAdd = false">取消</button>
        <button class="btn" @tap="submitAdd">添加</button>
      </view>
    </view>
  </view>

  <view class="mask" v-if="showRoles" @tap="showRoles = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">分配角色</text>
      <view class="perm-tags">
        <text v-for="r in roles" :key="r.id" class="perm" :class="{ on: roleTargetIds.includes(r.id) }" @tap="toggleTargetRole(r.id)">{{ r.description || r.code }}</text>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showRoles = false">取消</button>
        <button class="btn" @tap="submitRoles">保存</button>
      </view>
    </view>
  </view>

  <PasswordPopup v-if="pwdPop" :title="'初始口令（仅显示一次）'" :account="pwdInfo.account" :password="pwdInfo.password" @close="pwdPop = false" />
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember,
  fetchMyTenantRoles, updateTenantMemberRolesToMember,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import PasswordPopup from '../../../components/PasswordPopup.vue';

const members = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

const showAdd = ref(false);
const addForm = ref({ email: '', displayName: '', phone: '', roleIds: [] as string[] });
const pwdPop = ref(false);
const pwdInfo = ref({ account: '', password: '' });

const showRoles = ref(false);
const roleTarget = ref<TenantMemberItem | null>(null);
const roleTargetIds = ref([] as string[]);

onShow(load);
async function load() {
  members.value = await fetchMyTenantMembers();
  roles.value = await fetchMyTenantRoles();
}

function onAdd() {
  addForm.value = { email: '', displayName: '', phone: '', roleIds: [] };
  showAdd.value = true;
}
function toggleRole(id: string) {
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
async function submitAdd() {
  const email = addForm.value.email.trim();
  if (!email) { uni.showToast({ title: '邮箱必填', icon: 'none' }); return; }
  try {
    const initialPassword = await createTenantMember({
      emailAddress: email,
      displayName: addForm.value.displayName.trim() || email,
      phone: addForm.value.phone.trim() || undefined,
      roleIds: addForm.value.roleIds,
    });
    showAdd.value = false;
    if (initialPassword) {
      pwdInfo.value = { account: email, password: initialPassword };
      pwdPop.value = true;
    } else {
      uni.showToast({ title: '已添加', icon: 'none' });
    }
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '添加失败'), icon: 'none' });
  }
}

function openRoles(m: TenantMemberItem) {
  roleTarget.value = m;
  roleTargetIds.value = (m.roleIds || []).slice();
  showRoles.value = true;
}
function toggleTargetRole(id: string) {
  const i = roleTargetIds.value.indexOf(id);
  if (i >= 0) roleTargetIds.value.splice(i, 1);
  else roleTargetIds.value.push(id);
}
async function submitRoles() {
  if (!roleTarget.value) return;
  try {
    await updateTenantMemberRolesToMember(roleTarget.value.id, roleTargetIds.value);
    showRoles.value = false;
    uni.showToast({ title: '角色已更新', icon: 'none' });
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '更新失败'), icon: 'none' });
  }
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
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.perm-tags { display: flex; flex-wrap: wrap; gap: 16rpx; }
.perm { padding: 12rpx 24rpx; border-radius: 40rpx; border: 1px solid #eee; color: #666; font-size: 24rpx; }
.perm.on { background: #4f8cff; color: #fff; border-color: #4f8cff; }
.actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 40rpx; font-size: 28rpx; background: #4f8cff; color: #fff; line-height: 2.4; }
.ghost { background: #f2f2f2; color: #666; }
</style>
<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">{{ $t('platformMembers.title') }}</text>
        <view class="head-ops">
          <text class="head-link" @tap="onChangeMyPassword">{{ $t('platformMembers.changePwd') }}</text>
          <text class="head-btn" @tap="onAdd">{{ $t('platformMembers.add') }}</text>
        </view>
      </view>
      <view class="item" v-for="m in members" :key="m.id">
        <view class="info">
          <text class="name" @tap="showInfo(m)">{{ m.displayName || m.administratorId }}</text>
          <text class="sub">ID: {{ m.administratorId }}<text v-if="m.phone"> · {{ m.phone }}</text> · <text class="link" @tap="openRoles(m)">{{ $t('platformMembers.role') }}</text></text>
          <text v-if="m.canResetPassword" class="reset" @tap="onResetPassword(m)">{{ $t('platformMembers.resetPwd') }}</text>
        </view>
        <switch :checked="m.enabled" color="#4f8cff" @change="onToggle(m, $event)" />
        <text class="link" @tap="onRemove(m)">{{ $t('platformMembers.remove') }}</text>
      </view>
      <view v-if="!members.length" class="empty">{{ $t('platformMembers.empty') }}</view>
    </view>
  </view>

  <view class="mask" v-if="showAdd" @tap="showAdd = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ $t('platformMembers.addTitle') }}</text>
      <view class="field"><text class="label">{{ $t('platformMembers.emailLabel') }} <text class="req">*</text></text><input class="input" v-model="addForm.email" :placeholder="$t('platformMembers.emailPh')" /></view>
      <view class="field"><text class="label">{{ $t('platformMembers.nameLabel') }}</text><input class="input" v-model="addForm.displayName" :placeholder="$t('platformMembers.optionalPh')" /></view>
      <view class="field"><text class="label">{{ $t('platformMembers.phoneLabel') }}</text><input class="input" v-model="addForm.phone" :placeholder="$t('platformMembers.optionalPh')" /></view>
      <view class="field">
        <text class="label">{{ $t('platformMembers.roleLabel') }}</text>
        <view class="pick-trigger" @tap="openPickRole">
          <text v-if="!selectedRoleNames.length" class="ph">{{ $t('platformMembers.rolePh') }}</text>
          <view v-else class="pick-tags">
            <text v-for="n in selectedRoleNames" :key="n" class="pick-tag">{{ n }}</text>
          </view>
          <text class="arrow">▾</text>
        </view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showAdd = false">{{ $t('platformMembers.cancel') }}</button>
        <button class="btn" @tap="submitAdd">{{ $t('platformMembers.addBtn') }}</button>
      </view>
    </view>
  </view>

  <!-- 角色多选弹层 -->
  <view class="mask" v-if="showRolePick" @tap="showRolePick = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ $t('platformMembers.pickRoleTitle') }}</text>
      <view class="pick-list">
        <view v-for="r in grantableRoles" :key="r.id" class="pick-item" @tap="togglePickRole(r.id)">
          <text class="pick-item-name" :class="{ on: addForm.roleIds.includes(r.id), dis: r.grantable === false }">{{ r.description || r.code }}</text>
          <text v-if="r.grantable === false" class="dis-tag">{{ $t('platformMembers.notGrantable') }}</text>
          <text v-else class="check" :class="{ on: addForm.roleIds.includes(r.id) }">{{ addForm.roleIds.includes(r.id) ? '✓' : '' }}</text>
        </view>
        <view v-if="!roles.length" class="empty">{{ $t('platformMembers.noRole') }}<text class="link" @tap="gotoRoles">{{ $t('platformMembers.gotoCreate') }}</text></view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showRolePick = false">{{ $t('platformMembers.cancel') }}</button>
        <button class="btn" @tap="showRolePick = false">{{ $t('platformMembers.confirm') }}</button>
      </view>
    </view>
  </view>

  <view class="mask" v-if="showRoles" @tap="showRoles = false">
    <view class="pop" @tap.stop>
      <text class="pop-title">{{ $t('platformMembers.assignTitle') }}</text>
      <view class="pick-list">
        <view v-for="r in grantableRoles" :key="r.id" class="pick-item" @tap="toggleTargetRole(r.id)">
          <text class="pick-item-name" :class="{ on: roleTargetIds.includes(r.id), dis: r.grantable === false }">{{ r.description || r.code }}</text>
          <text v-if="r.grantable === false" class="dis-tag">{{ $t('platformMembers.notGrantable') }}</text>
          <text v-else class="check" :class="{ on: roleTargetIds.includes(r.id) }">{{ roleTargetIds.includes(r.id) ? '✓' : '' }}</text>
        </view>
        <view v-if="!roles.length" class="empty">{{ $t('platformMembers.noRoleShort') }}</view>
      </view>
      <view class="actions">
        <button class="btn ghost" @tap="showRoles = false">{{ $t('platformMembers.cancel') }}</button>
        <button class="btn" @tap="submitRoles">{{ $t('platformMembers.save') }}</button>
      </view>
    </view>
  </view>

  <!-- 用户信息弹窗 -->
  <view class="mask" v-if="infoVisible && infoTarget" @tap="infoVisible = false">
    <view class="pop" @tap.stop>
      <view class="pop-head">
        <text class="pop-title">{{ $t('platformMembers.infoTitle') }}</text>
        <text class="pop-close" @tap="infoVisible = false">×</text>
      </view>
      <view class="name-row">
        <text class="info-name">{{ infoTarget.displayName || infoTarget.administratorId }}</text>
        <text class="badge" :class="infoTarget.enabled ? 'on' : ''">{{ infoTarget.enabled ? $t('platformMembers.enabled') : $t('platformMembers.disabled') }}</text>
      </view>
      <view class="kv"><text class="k">{{ $t('platformMembers.loginName') }}</text><text class="v">{{ infoTarget.emailAddress || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('platformMembers.phone') }}</text><text class="v">{{ infoTarget.phone || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('platformMembers.role') }}</text><text class="v">{{ infoRoleNames }}</text></view>
      <view class="kv"><text class="k">{{ $t('platformMembers.remark') }}</text><text class="v">{{ infoTarget.remark || '—' }}</text></view>
      <view class="kv"><text class="k">{{ $t('platformMembers.memberId') }}</text><text class="v">{{ infoTarget.administratorId }}</text></view>
      <view class="kv"><text class="k">{{ $t('platformMembers.joinedAt') }}</text><text class="v">{{ fmtTime(infoTarget.createdAt) }}</text></view>
    </view>
  </view>

  <PasswordPopup v-if="pwdPop" :title="$t('platformMembers.initialPassword')" :account="pwdInfo.account" :password="pwdInfo.password" @close="pwdPop = false" />
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { changeMyPassword } from '../../../apis/auth';
import {
  fetchMyTenantMembers, createTenantMember, setTenantMemberEnabled, deleteTenantMember,
  fetchMyTenantRoles, updateTenantMemberRolesToMember, resetTenantMemberPasswordToDefault,
  type TenantMemberItem, type RoleItem,
} from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import { useLocaleStore } from '../../../stores/localeStore';
import PasswordPopup from '../../../components/PasswordPopup.vue';

const locale = useLocaleStore();

const members = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

const showAdd = ref(false);
const addForm = ref({ email: '', displayName: '', phone: '', roleIds: [] as string[] });
const pwdPop = ref(false);
const pwdInfo = ref({ account: '', password: '' });

const showRolePick = ref(false);
const selectedRoleNames = computed(() =>
  roles.value.filter((r) => addForm.value.roleIds.includes(r.id)).map((r) => r.description || r.code),
);

const showRoles = ref(false);
const roleTarget = ref<TenantMemberItem | null>(null);
const roleTargetIds = ref([] as string[]);

const infoVisible = ref(false);
const infoTarget = ref<TenantMemberItem | null>(null);

const infoRoleNames = computed(() => {
  const t = infoTarget.value;
  if (!t || !t.roleIds?.length) return '—';
  return t.roleIds
    .map((id) => roles.value.find((r) => r.id === id)?.description || id)
    .join('、');
});

function showInfo(m: TenantMemberItem) {
  infoTarget.value = m;
  infoVisible.value = true;
}

function fmtTime(t?: string | null): string {
  if (!t) return '—';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onShow(load);
async function load() {
  members.value = await fetchMyTenantMembers();
  const list = await fetchMyTenantRoles();
  roles.value = Array.from(new Map(list.map((r) => [r.id, r])).values());
}

const grantableRoles = computed(() => roles.value.filter((r) => r.grantable !== false));

function onAdd() {
  addForm.value = { email: '', displayName: '', phone: '', roleIds: [] };
  showAdd.value = true;
}
function openPickRole() { showRolePick.value = true; }
function togglePickRole(id: string) {
  const r = roles.value.find((x) => x.id === id);
  if (r && r.grantable === false) return;
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
function gotoRoles(e: any) {
  e.stopPropagation();
  showRolePick.value = false;
  uni.navigateTo({ url: '/pages/platform/roles/index' });
}
async function submitAdd() {
  const email = addForm.value.email.trim();
  if (!email) { uni.showToast({ title: locale.t('platformMembers.requireEmail'), icon: 'none' }); return; }
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
      uni.showToast({ title: locale.t('platformMembers.added'), icon: 'none' });
    }
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('platformMembers.addFailed')), icon: 'none' });
  }
}

function openRoles(m: TenantMemberItem) {
  roleTarget.value = m;
  roleTargetIds.value = (m.roleIds || []).slice();
  showRoles.value = true;
}
function toggleTargetRole(id: string) {
  const r = roles.value.find((x) => x.id === id);
  if (r && r.grantable === false) return;
  const i = roleTargetIds.value.indexOf(id);
  if (i >= 0) roleTargetIds.value.splice(i, 1);
  else roleTargetIds.value.push(id);
}
async function submitRoles() {
  if (!roleTarget.value) return;
  try {
    await updateTenantMemberRolesToMember(roleTarget.value.id, roleTargetIds.value);
    showRoles.value = false;
    uni.showToast({ title: locale.t('platformMembers.roleUpdated'), icon: 'none' });
    load();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, locale.t('platformMembers.updateFailed')), icon: 'none' });
  }
}
function onToggle(m: TenantMemberItem, e: any) {
  const action = e.detail.value ? locale.t('platformMembers.enableAction') : locale.t('platformMembers.disableAction');
  uni.showModal({
    title: e.detail.value ? locale.t('platformMembers.enableTitle') : locale.t('platformMembers.disableTitle'),
    content: locale.t('platformMembers.toggleContent').replace('{action}', action).replace('{name}', m.displayName || m.administratorId),
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantMemberEnabled(m.id, e.detail.value as boolean);
        m.enabled = e.detail.value as boolean;
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('platformMembers.opFailed'), icon: 'none' });
        load();
      }
    },
  });
}
function onRemove(m: TenantMemberItem) {
  uni.showModal({
    title: locale.t('platformMembers.removeTitle'),
    content: locale.t('platformMembers.removeContent').replace('{name}', m.displayName || m.administratorId),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await deleteTenantMember(m.id);
        uni.showToast({ title: locale.t('platformMembers.removed'), icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('platformMembers.removeFailed'), icon: 'none' });
      }
    },
  });
}

function onResetPassword(m: TenantMemberItem) {
  uni.showModal({
    title: locale.t('platformMembers.resetTitle'),
    content: locale.t('platformMembers.resetContent').replace('{name}', m.displayName || m.administratorId),
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await resetTenantMemberPasswordToDefault(m.id);
        uni.showToast({ title: locale.t('platformMembers.resetDone'), icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || locale.t('platformMembers.resetFailed'), icon: 'none' });
      }
    },
  });
}

function onChangeMyPassword() {
  uni.navigateTo({ url: '/pages/change-password/index?manual=1' });
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.item { display: flex; align-items: center; gap: 16rpx; padding: 20rpx 0; border-bottom: 1px solid #f2f2f2; }
.info { flex: 1; }
.name { display: block; font-size: 28rpx; font-weight: 600; }
.sub { display: block; font-size: 22rpx; color: #999; margin-top: 6rpx; }
.link { color: #e64340; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 600rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8rpx; }
.pop-head .pop-title { margin-bottom: 0; }
.pop-close { font-size: 36rpx; color: #999; line-height: 1; padding: 8rpx; }
.name-row { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx; }
.info-name { font-size: 32rpx; font-weight: 700; }
.badge { font-size: 22rpx; color: #999; background: #f2f2f2; border-radius: 999rpx; padding: 4rpx 16rpx; }
.badge.on { color: #07c160; background: #e8f8f0; }
.kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 16rpx 0; border-bottom: 1px solid #f2f2f2; }
.kv .k { font-size: 24rpx; color: #999; flex: 0 0 auto; }
.kv .v { font-size: 26rpx; color: #333; text-align: right; word-break: break-all; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.perm-tags { display: flex; flex-wrap: wrap; gap: 16rpx; }
.perm { padding: 12rpx 24rpx; border-radius: 40rpx; border: 1px solid #eee; color: #666; font-size: 24rpx; }
.perm.on { background: #4f8cff; color: #fff; border-color: #4f8cff; }
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
.head-ops { display: flex; align-items: center; gap: 16rpx; }
.head-link { font-size: 26rpx; color: #666; }
.reset { display: block; font-size: 22rpx; color: #e64340; margin-top: 4rpx; }
.pick-item-name.dis { color: #bbb; }
.dis-tag { font-size: 22rpx; color: #bbb; }
</style>
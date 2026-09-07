<template>
  <view class="page">
    <view class="card danger-card">
      <view class="row between">
        <view class="info danger-info">
          <text class="name">清空商品（从头开始）</text>
          <text class="sub">软删该租户名下全部商品（前端不可见）。不影响配送/支付/账户等配置。</text>
        </view>
        <text class="danger-btn" @tap="onClearProducts">清空商品</text>
      </view>
    </view>

    <view class="card" style="margin-bottom: 20rpx;">
      <view class="row head">
        <text class="title">租户基础信息</text>
        <text class="sub-info">{{ tenantCode }}<text v-if="tenantNo != null"> · #{{ tenantNo }}</text></text>
      </view>
      <view class="field">
        <text class="label">店铺名称（租户名）</text>
        <view class="save-row">
          <input class="input" v-model="tenantName" placeholder="请输入店铺名称" />
          <button class="btn save-btn" @tap="saveName">保存</button>
        </view>
      </view>
      <view class="field" style="margin-bottom: 0;">
        <text class="label">默认外网访问域名</text>
        <view class="save-row">
          <input class="input" v-model="tenantDomain" placeholder="如 store.example.com" />
          <button class="btn save-btn" @tap="saveDomain">保存</button>
        </view>
        <text class="tip">不要带 http(s):// 前缀；前端据此域名回源。</text>
      </view>
    </view>

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
        <text class="link warn-link" @tap="onResetPwd(m)">重置密码</text>
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
      <view class="mode-tabs">
        <text class="mode-tab" :class="{ on: addMode === 'create' }" @tap="switchMode('create')">新建账号</text>
        <text class="mode-tab" :class="{ on: addMode === 'link' }" @tap="switchMode('link')">关联已有</text>
      </view>

      <!-- 新建账号模式 -->
      <template v-if="addMode === 'create'">
        <view class="field"><text class="label">邮箱 <text class="req">*</text></text><input class="input" v-model="addForm.emailAddress" placeholder="必填（全局唯一）" /></view>
        <view class="field"><text class="label">显示姓名</text><input class="input" v-model="addForm.displayName" placeholder="选填" /></view>
        <view class="field"><text class="label">手机号</text><input class="input" v-model="addForm.phone" placeholder="选填" /></view>
      </template>

      <!-- 关联已有账号模式 -->
      <template v-else>
        <view class="field">
          <text class="label">搜索账号</text>
          <view class="search-row">
            <input class="input link-search" v-model="linkKeyword" placeholder="邮箱或姓名" />
            <button class="btn link-btn" @tap="doSearch">搜索</button>
          </view>
        </view>
        <view class="field">
          <text class="label">候选账号</text>
          <view v-if="searched && !candidates.length" class="empty hint">未找到可关联的账号，可切回「新建账号」</view>
          <view class="cand-list" v-if="candidates.length">
            <view
              class="cand-item" :class="{ on: selectedAdminId === c.id }"
              v-for="c in candidates" :key="c.id" @tap="selectedAdminId = c.id"
            >
              <view class="cand-info">
                <text class="name">{{ c.displayName || c.emailAddress }}</text>
                <text class="sub">{{ c.emailAddress }} · 已关联 {{ c.linkedCount }} 个租户</text>
              </view>
              <text class="cand-tag" v-if="c.alreadyLinked">已在本租户</text>
              <text class="check" :class="{ on: selectedAdminId === c.id }">{{ selectedAdminId === c.id ? '✓' : '' }}</text>
            </view>
          </view>
        </view>
      </template>

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
        <button class="btn" @tap="submitAdd">{{ addMode === 'link' ? '关联' : '添加' }}</button>
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
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchTenant, updateTenant, resetTenantAdministratorPassword,
  fetchTenantAdministrators, createTenantAdministrator, setTenantAdministratorEnabled,
  fetchTenantRoles, deleteTenantRole,
  searchTenantAdmins, linkTenantMember,
  clearTenantProducts,
  type TenantMemberItem, type RoleItem, type AdminSearchCandidate,
} from '../../../apis/tenant-admin';
import { graphQlErrorMsg } from '../../../apis/client';
import PasswordPopup from '../../../components/PasswordPopup.vue';

const channelId = ref('');
const tab = ref<'admin' | 'role'>('admin');
const admins = ref<TenantMemberItem[]>([]);
const roles = ref<RoleItem[]>([]);

// 租户基础信息（改名 / 默认外网域名）
const tenantName = ref('');
const tenantDomain = ref('');
const tenantCode = ref('');
const tenantNo = ref<number | null>(null);

onLoad((q: any) => { channelId.value = q.id ?? q.name ?? ''; });
onShow(() => { if (channelId.value) loadAll(); });

async function loadAll() {
  await Promise.all([loadTenant(), loadAdmins(), loadRoles()]);
}
async function loadTenant() {
  try {
    const t = await fetchTenant(channelId.value);
    tenantName.value = t.name || '';
    tenantDomain.value = t.domain || '';
    tenantCode.value = t.code;
    tenantNo.value = t.tenantNo ?? null;
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '加载租户信息失败'), icon: 'none' });
  }
}
async function loadAdminAndRoles() {
  await Promise.all([loadAdmins(), loadRoles()]);
}
async function loadAdmins() {
  admins.value = await fetchTenantAdministrators(channelId.value);
}
async function loadRoles() {
  roles.value = await fetchTenantRoles(channelId.value);
}

// 保存租户名（改名）
async function saveName() {
  const name = tenantName.value.trim();
  if (!name) { uni.showToast({ title: '店铺名称不能为空', icon: 'none' }); return; }
  try {
    await updateTenant(channelId.value, { name });
    uni.showToast({ title: '名称已更新', icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '保存失败'), icon: 'none' });
  }
}

// 保存默认外网域名
async function saveDomain() {
  const domain = tenantDomain.value.trim();
  if (domain && /^https?:\/\//i.test(domain)) {
    uni.showToast({ title: '请勿包含 http(s):// 前缀', icon: 'none' });
    return;
  }
  try {
    await updateTenant(channelId.value, { domain: domain || undefined });
    uni.showToast({ title: '域名已更新', icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '保存失败'), icon: 'none' });
  }
}

// 重置管理员密码为默认口令 you123123
function onResetPwd(m: TenantMemberItem) {
  uni.showModal({
    title: '重置密码',
    content: `确定将 ${m.displayName || m.administratorId} 的登录密码重置为 you123123 吗？`,
    confirmText: '重置',
    confirmColor: '#e64340',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await resetTenantAdministratorPassword(m.id);
        uni.showToast({ title: '已重置为 you123123', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, '重置失败'), icon: 'none' });
      }
    },
  });
}

// 添加管理员表单弹层
const showAdd = ref(false);
const addMode = ref<'create' | 'link'>('create');
const addForm = ref({ emailAddress: '', displayName: '', phone: '', roleIds: [] as string[] });
// 关联已有账号模式
const linkKeyword = ref('');
const candidates = ref<AdminSearchCandidate[]>([]);
const searched = ref(false);
const selectedAdminId = ref('');
const showRolePick = ref(false);
const selectedRoleNames = computed(() =>
  roles.value.filter((r) => addForm.value.roleIds.includes(r.id)).map((r) => r.description || r.code),
);
const pwdPop = ref(false);
const pwdInfo = ref({ account: '', password: '' });

function switchMode(mode: 'create' | 'link') {
  addMode.value = mode;
  if (mode === 'create') {
    linkKeyword.value = '';
    candidates.value = [];
    searched.value = false;
    selectedAdminId.value = '';
  } else {
    addForm.value.emailAddress = '';
    selectedAdminId.value = '';
  }
}

function onAddAdmin() {
  addMode.value = 'create';
  addForm.value = { emailAddress: '', displayName: '', phone: '', roleIds: [] };
  linkKeyword.value = '';
  candidates.value = [];
  searched.value = false;
  selectedAdminId.value = '';
  showAdd.value = true;
}
function toggleRole(id: string) {
  const i = addForm.value.roleIds.indexOf(id);
  if (i >= 0) addForm.value.roleIds.splice(i, 1);
  else addForm.value.roleIds.push(id);
}
async function doSearch() {
  const kw = linkKeyword.value.trim();
  if (!kw) { uni.showToast({ title: '请输入邮箱或姓名', icon: 'none' }); return; }
  try {
    candidates.value = await searchTenantAdmins(channelId.value, kw);
    searched.value = true;
    selectedAdminId.value = '';
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '搜索失败'), icon: 'none' });
  }
}
async function submitAdd() {
  if (addMode.value === 'link') return submitLink();
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
    loadAdminAndRoles();
  } catch (err: any) {
    uni.showToast({ title: graphQlErrorMsg(err, '添加失败'), icon: 'none' });
  }
}
async function submitLink() {
  if (!selectedAdminId.value) { uni.showToast({ title: '请选择要关联的账号', icon: 'none' }); return; }
  if (!addForm.value.roleIds.length) { uni.showToast({ title: '请选择角色', icon: 'none' }); return; }
  try {
    await linkTenantMember(channelId.value, {
      administratorId: selectedAdminId.value,
      roleIds: addForm.value.roleIds,
      displayName: addForm.value.displayName.trim() || undefined,
      phone: addForm.value.phone.trim() || undefined,
      remark: undefined,
    });
    showAdd.value = false;
    uni.showToast({ title: '已关联', icon: 'none' });
    loadAdminAndRoles();
  } catch (err: any) {
    if (/ALREADY_IN_CHANNEL/.test(graphQlErrorMsg(err, ''))) {
      uni.showToast({ title: '该账号已在本租户', icon: 'none' });
    } else {
      uni.showToast({ title: graphQlErrorMsg(err, '关联失败'), icon: 'none' });
    }
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
function onClearProducts() {
  uni.showModal({
    title: '清空商品（从头开始）',
    content: `确定清空该租户名下全部商品？此操作会使这些商品在前端不可见（软删），且不可恢复。`,
    confirmText: '清空',
    confirmColor: '#e64340',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        const n = await clearTenantProducts(channelId.value);
        uni.showToast({ title: `已清空商品 ${n} 件`, icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: graphQlErrorMsg(err, '清空失败'), icon: 'none' });
      }
    },
  });
}
function onAddRole() {
  uni.navigateTo({ url: `/pages/platform/roles/index?channelId=${channelId.value}` });
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
.danger-card { margin-bottom: 20rpx; border: 1px solid #ffe2e2; background: #fffafa; }
.danger-info { flex: 1; }
.danger-info .name { display: block; font-size: 28rpx; font-weight: 600; color: #e64340; }
.danger-info .sub { display: block; font-size: 22rpx; color: #b05757; margin-top: 6rpx; }
.danger-btn { flex: 0 0 auto; padding: 10rpx 30rpx; background: #e64340; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.sub-info { font-size: 24rpx; color: #999; }
.head-btn { flex: 0 0 auto; padding: 8rpx 26rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.save-row { display: flex; align-items: center; gap: 16rpx; }
.save-row .input { flex: 1; }
.save-btn { flex: 0 0 auto; padding: 0 30rpx; line-height: 2.4; border-radius: 12rpx; background: $pm-info; }
.tip { display: block; margin-top: 8rpx; font-size: 22rpx; color: #bbb; }
.warn-link { color: #e64340; flex: 0 0 auto; }
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
.mode-tabs { display: flex; gap: 12rpx; margin-bottom: 24rpx; background: #f2f2f2; border-radius: 12rpx; padding: 6rpx; }
.mode-tab { flex: 1; text-align: center; padding: 12rpx 0; font-size: 26rpx; color: #666; border-radius: 10rpx; }
.mode-tab.on { background: #fff; color: $pm-info; font-weight: 600; }
.search-row { display: flex; gap: 16rpx; }
.link-search { flex: 1; }
.link-btn { flex: 0 0 auto; padding: 0 30rpx; line-height: 2.4; border-radius: 12rpx; }
.cand-list { max-height: 320rpx; overflow-y: auto; border: 1px solid #eee; border-radius: 12rpx; }
.cand-item { display: flex; align-items: center; gap: 12rpx; padding: 18rpx 20rpx; border-bottom: 1px solid #f2f2f2; }
.cand-item:last-child { border-bottom: none; }
.cand-item.on { background: #f2f7ff; }
.cand-info { flex: 1; }
.cand-info .name { display: block; font-size: 28rpx; font-weight: 600; }
.cand-info .sub { display: block; font-size: 22rpx; color: #999; margin-top: 4rpx; }
.cand-tag { font-size: 20rpx; color: #e64340; background: #fdeeee; border-radius: 999rpx; padding: 4rpx 14rpx; }
.hint { padding: 24rpx 0; }
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
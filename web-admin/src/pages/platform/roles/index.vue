<template>
  <view class="page">
    <view class="tabbar" v-if="isSuperAdmin">
      <text class="tab" :class="{ on: activeTab === 'shop' }" @tap="switchTab('shop')">本店角色</text>
      <text class="tab" :class="{ on: activeTab === 'global' }" @tap="switchTab('global')">全局角色池</text>
    </view>

    <!-- 本店角色 -->
    <template v-if="activeTab === 'shop'">
      <view class="card" v-for="r in roles" :key="r.id">
        <view class="row head">
          <view class="lt">
            <text class="title">{{ r.description || r.code }}</text>
            <text class="sub">{{ r.code }}</text>
          </view>
          <text class="role-type" v-if="r.code.includes('tenant-admin')">租户管理员</text>
          <text class="role-type sale" v-else-if="r.code.includes('-sales-')">销售</text>
          <text class="role-type stock" v-else-if="r.code.includes('-stock-')">库存</text>
        </view>
        <view class="group" v-for="g in catalog" :key="g.key">
          <text class="g-label">{{ g.label }}</text>
          <view class="perms">
            <text v-for="p in g.items" :key="p.code" class="perm" :class="{ on: has(r, p.code) }" @tap="toggle(r, p.code)">
              {{ p.label }}
            </text>
          </view>
        </view>
        <view class="row foot">
          <text class="btn danger" @tap="onDelete(r)">删除角色</text>
          <text class="btn" @tap="onSave(r)">保存</text>
        </view>
      </view>
      <view v-if="!roles.length" class="empty">
        <text>暂无角色</text>
        <view v-if="canImport()" class="import-btn" @tap="openImport">{{ importing ? '导入中…' : '一键导入默认角色' }}</view>
      </view>
      <view v-if="canImport()" class="import-row"><text class="import-btn" @tap="openImport">{{ importing ? '导入中…' : '一键导入默认角色' }}</text></view>

      <!-- 从全局角色池引用到本店（超管 / 租户自助） -->
      <view class="import-row">
        <text class="import-btn ghost" @tap="toggleRefer">{{ referOpen ? '关闭' : '从全局角色池引用到本店' }}</text>
      </view>
      <view class="refer-list" v-if="referOpen">
        <view class="card" v-for="g in availableGlobal" :key="g.id">
          <view class="row head">
            <view class="lt">
              <text class="title">{{ g.description || g.code }}</text>
              <text class="sub">{{ g.code }}</text>
            </view>
            <text class="btn" @tap="doRefer(g.id)">引用到本店</text>
          </view>
        </view>
        <view v-if="!availableGlobal.length" class="empty">暂无可用全局角色</view>
      </view>

      <view class="fab" @tap="openCreate">＋</view>
    </template>

    <!-- 全局角色池（超管） -->
    <template v-else>
      <view class="card" v-for="g in globalRoles" :key="g.id">
        <view class="row head">
          <view class="lt">
            <text class="title">{{ g.description || g.code }}</text>
            <text class="sub">{{ g.code }}</text>
          </view>
        </view>
        <view class="group">
          <text class="g-label">已绑定权限</text>
          <view class="perms">
            <text v-for="p in g.permissions" :key="p" class="perm">{{ p }}</text>
          </view>
        </view>
        <view class="row foot">
          <text class="btn" @tap="openDistribute(g)">分发到租户</text>
        </view>
      </view>
      <view v-if="!globalRoles.length" class="empty">暂无全局角色</view>
      <view class="fab" @tap="openGlobalCreate">＋</view>
    </template>

    <!-- 新建角色表单弹层（本店） -->
    <view class="mask" v-if="showCreate" @tap="showCreate = false">
      <view class="pop" @tap.stop>
        <text class="pop-title">新建角色</text>
        <view class="field"><text class="label">角色编码（英文，如 kefu）<text class="req">*</text></text><input class="input" v-model="createForm.code" placeholder="唯一英文标识" /></view>
        <view class="field"><text class="label">显示名称（中文）<text class="req">*</text></text><input class="input" v-model="createForm.description" placeholder="如：客服" /></view>
        <view class="field">
          <text class="label">选择权限</text>
          <view class="perms">
            <text v-for="p in permissionOptions" :key="p.code" class="perm" :class="{ on: createForm.permissions.includes(p.code) }" @tap="toggleCreate(p.code)">
              {{ p.label }}
            </text>
          </view>
        </view>
        <view class="actions">
          <text class="btn ghost" @tap="showCreate = false">取消</text>
          <text class="btn" @tap="submitCreate">创建</text>
        </view>
      </view>
    </view>

    <!-- 新建全局角色弹层（超管） -->
    <view class="mask" v-if="showGlobalCreate" @tap="showGlobalCreate = false">
      <view class="pop" @tap.stop>
        <text class="pop-title">新建全局角色</text>
        <view class="field"><text class="label">角色编码（英文，如 kefu）<text class="req">*</text></text><input class="input" v-model="globalForm.code" placeholder="全局唯一英文标识" /></view>
        <view class="field"><text class="label">显示名称（中文）<text class="req">*</text></text><input class="input" v-model="globalForm.description" placeholder="如：客服" /></view>
        <view class="field">
          <text class="label">选择权限</text>
          <view class="perms">
            <text v-for="p in permissionOptions" :key="p.code" class="perm" :class="{ on: globalForm.permissions.includes(p.code) }" @tap="toggleGlobalCreate(p.code)">
              {{ p.label }}
            </text>
          </view>
        </view>
        <view class="field">
          <text class="label">立即分发到租户（可不选，后续再分发）</text>
          <view class="perms">
            <text v-for="t in tenants" :key="t.id" class="perm tenant" :class="{ on: globalForm.channelIds.includes(t.id) }" @tap="toggleTenant(t.id)">
              {{ t.name }}
            </text>
          </view>
        </view>
        <view class="actions">
          <text class="btn ghost" @tap="showGlobalCreate = false">取消</text>
          <text class="btn" @tap="submitGlobalCreate">创建</text>
        </view>
      </view>
    </view>

    <!-- 分发到租户弹层（超管） -->
    <view class="mask" v-if="showDistribute" @tap="showDistribute = false">
      <view class="pop" @tap.stop>
        <text class="pop-title">分发「{{ distributeRole?.description || distributeRole?.code }}」到租户</text>
        <view class="field">
          <text class="g-label">从「全局角色池」分发该角色到以下租户（引用到店）</text>
          <view class="perms">
            <text v-for="t in tenants" :key="t.id" class="perm tenant" :class="{ on: distributeSel.includes(t.id) }" @tap="toggleDistribute(t.id)">
              {{ t.name }}
            </text>
          </view>
        </view>
        <view class="actions">
          <text class="btn ghost" @tap="showDistribute = false">取消</text>
          <text class="btn" @tap="submitDistribute">分发</text>
        </view>
      </view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { useAuthStore } from '../../../stores/authStore';
import {
  fetchTenantRoles, createTenantRole, updateTenantRole, deleteTenantRole, importTenantDefaultRoles,
  fetchMyTenantRoles, myCreateTenantRole, myUpdateTenantRole, myDeleteTenantRole,
  fetchPermissionCatalog, fetchTenants,
  fetchGlobalRoles, createGlobalRole, referGlobalRoleToChannel,
  fetchMyGlobalRolesAvailable, myReferGlobalRole,
  type RoleItem, type PermissionCatalogGroup, type TenantItem,
} from '../../../apis/tenant-admin';

const auth = useAuthStore();
const channelId = ref('');
const activeTab = ref<'shop' | 'global'>('shop');
const roles = ref<RoleItem[]>([]);
const globalRoles = ref<RoleItem[]>([]);
const availableGlobal = ref<RoleItem[]>([]);
const tenants = ref<TenantItem[]>([]);
// 动态业务权限目录（单一来源：后端 PERMISSION_CATALOG，避免前端硬编码双份）
const catalog = ref<PermissionCatalogGroup[]>([]);
const importing = ref(false);
const isSuperAdmin = computed(() => auth.isSuperAdmin);
const referOpen = ref(false);

onLoad(async (q: any) => {
  channelId.value = q?.id || '';
  loadCatalog();
  if (tenants.value.length === 0 && auth.isSuperAdmin) loadTenants();
  if (isSuperAdmin.value) activeTab.value = 'global';
});
// uni-app 先 onLoad 后 onShow；每次进入/从详情页返回都重拉角色列表，修复新建后不刷新的问题
onShow(() => { load(); });

async function loadTenants() {
  try { tenants.value = (await fetchTenants(0, 100)).items; } catch (e: any) { /* 忽略 */ }
}

function canImport() {
  // 仅超管从租户详情进入（带 channelId）提供一键导入；租户自助路径无权限，不显示
  return !!channelId.value;
}

function switchTab(t: 'shop' | 'global') {
  activeTab.value = t;
  if (t === 'global') loadGlobal();
}

async function load() {
  roles.value = channelId.value ? await fetchTenantRoles(channelId.value) : await fetchMyTenantRoles();
}
async function loadGlobal() {
  if (isSuperAdmin.value) {
    globalRoles.value = await fetchGlobalRoles();
  } else {
    availableGlobal.value = await fetchMyGlobalRolesAvailable();
  }
}
async function loadCatalog() {
  catalog.value = await fetchPermissionCatalog();
}
function has(r: RoleItem, p: string) { return (r.permissions || []).includes(p); }
function toggle(r: RoleItem, p: string) {
  const list = (r.permissions || []).slice();
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1); else list.push(p);
  r.permissions = list;
}
async function onSave(r: RoleItem) {
  try {
    if (channelId.value) await updateTenantRole(r.id, { description: r.description, permissions: r.permissions });
    else await myUpdateTenantRole(r.id, { description: r.description, permissions: r.permissions });
    uni.showToast({ title: '已保存', icon: 'none' });
  } catch (err: any) {
    uni.showToast({ title: err?.message || '保存失败', icon: 'none' });
  }
}
function onDelete(r: RoleItem) {
  uni.showModal({
    title: '删除角色',
    content: `确定删除「${r.description || r.code}」？`,
    success: async (d) => {
      if (!d.confirm) return;
      try {
        if (channelId.value) await deleteTenantRole(r.id);
        else await myDeleteTenantRole(r.id);
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '删除失败', icon: 'none' });
      }
    },
  });
}
function openCreate() {
  createForm.value = { code: '', description: '', permissions: ['ReadProduct'] };
  showCreate.value = true;
}
const showCreate = ref(false);
const createForm = ref({ code: '', description: '', permissions: [] as string[] });
// 新建角色默认勾选「商品·读」，与后端单一模板默认权限一致
const permissionOptions = computed(() => catalog.value.flatMap((g) => g.items));
function toggleCreate(p: string) {
  const list = createForm.value.permissions.slice();
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1); else list.push(p);
  createForm.value.permissions = list;
}
async function submitCreate() {
  const code = createForm.value.code.trim();
  const description = createForm.value.description.trim();
  if (!code) { uni.showToast({ title: '角色编码必填', icon: 'none' }); return; }
  if (!description) { uni.showToast({ title: '显示名称必填', icon: 'none' }); return; }
  try {
    if (channelId.value) await createTenantRole(channelId.value, { code, description, permissions: createForm.value.permissions });
    else await myCreateTenantRole({ code, description, permissions: createForm.value.permissions });
    uni.showToast({ title: '已创建', icon: 'none' });
    showCreate.value = false;
    load();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
  }
}

// ===== 从全局角色池引用到本店（超管 / 租户自助） =====
async function toggleRefer() {
  referOpen.value = !referOpen.value;
  if (referOpen.value) availableGlobal.value = isSuperAdmin.value ? await fetchGlobalRoles() : await fetchMyGlobalRolesAvailable();
}
async function doRefer(roleId: string) {
  try {
    if (channelId.value) {
      // 超管从租户详情进入：显式引用到该租户
      await referGlobalRoleToChannel(roleId, channelId.value);
    } else {
      await myReferGlobalRole(roleId);
    }
    uni.showToast({ title: '已引用到本店', icon: 'none' });
    referOpen.value = false;
    load();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '引用失败', icon: 'none' });
  }
}

// ===== 全局角色池（超管） =====
async function openGlobalCreate() {
  globalForm.value = { code: '', description: '', permissions: ['ReadProduct'], channelIds: [] as string[] };
  showGlobalCreate.value = true;
}
const showGlobalCreate = ref(false);
const globalForm = ref({ code: '', description: '', permissions: [] as string[], channelIds: [] as string[] });
function toggleGlobalCreate(p: string) {
  const list = globalForm.value.permissions.slice();
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1); else list.push(p);
  globalForm.value.permissions = list;
}
function toggleTenant(id: string) {
  const list = globalForm.value.channelIds.slice();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  globalForm.value.channelIds = list;
}
async function submitGlobalCreate() {
  const code = globalForm.value.code.trim();
  const description = globalForm.value.description.trim();
  if (!code) { uni.showToast({ title: '角色编码必填', icon: 'none' }); return; }
  if (!description) { uni.showToast({ title: '显示名称必填', icon: 'none' }); return; }
  try {
    await createGlobalRole(globalForm.value.channelIds, { code, description, permissions: globalForm.value.permissions });
    uni.showToast({ title: '已创建', icon: 'none' });
    showGlobalCreate.value = false;
    loadGlobal();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
  }
}

const showDistribute = ref(false);
const distributeRole = ref<RoleItem | null>(null);
const distributeSel = ref<string[]>([]);
function openDistribute(r: RoleItem) {
  distributeRole.value = r;
  distributeSel.value = [];
  showDistribute.value = true;
}
function toggleDistribute(id: string) {
  const list = distributeSel.value.slice();
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  distributeSel.value = list;
}
async function submitDistribute() {
  if (!distributeRole.value) return;
  if (!distributeSel.value.length) { uni.showToast({ title: '请选择租户', icon: 'none' }); return; }
  try {
    for (const cid of distributeSel.value) {
      await referGlobalRoleToChannel(distributeRole.value.id, cid);
    }
    uni.showToast({ title: '已分发', icon: 'none' });
    showDistribute.value = false;
    loadGlobal();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '分发失败', icon: 'none' });
  }
}
</script>
<style lang="scss" scoped>
.page { padding: 24rpx 24rpx 140rpx; }
.tabbar { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.tab { padding: 12rpx 32rpx; border-radius: 999rpx; background: #f2f3f5; color: #666; font-size: 26rpx; }
.tab.on { background: $pm-info; color: #fff; }
.card { background: #fff; border-radius: 20rpx; padding: 24rpx; margin-bottom: 20rpx; }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.lt { display: flex; align-items: baseline; gap: 12rpx; }
.title { font-size: 30rpx; font-weight: 700; }
.sub { font-size: 22rpx; color: #999; }
.role-type { font-size: 20rpx; color: $pm-info; border: 1px solid $pm-info; border-radius: 999rpx; padding: 2rpx 16rpx; }
.role-type.sale { color: #e6a23c; border-color: #e6a23c; }
.role-type.stock { color: #67c23a; border-color: #67c23a; }
.group { margin-bottom: 18rpx; }
.g-label { font-size: 22rpx; color: #999; display: block; margin-bottom: 10rpx; }
.perms { display: flex; flex-wrap: wrap; gap: 12rpx; }
.perm { padding: 10rpx 20rpx; border-radius: 999rpx; font-size: 22rpx; background: #f2f3f5; color: #666; }
.perm.on { background: $pm-info; color: #fff; }
.perm.tenant { margin-bottom: 8rpx; }
.foot { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
.btn { color: $pm-info; font-size: 26rpx; }
.btn.danger { color: #e64340; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; }
.import-btn { display: inline-block; margin-top: 20rpx; padding: 12rpx 30rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
.import-btn.ghost { background: transparent; color: $pm-info; border: 1px solid $pm-info; }
.import-row { display: flex; justify-content: center; margin: 24rpx 0 20rpx; }
.import-row .import-btn { margin-top: 0; }
.fab { position: fixed; right: 40rpx; bottom: 60rpx; width: 96rpx; height: 96rpx; border-radius: 50%; background: $pm-info; color: #fff; font-size: 56rpx; line-height: 96rpx; text-align: center; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15); }
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex; align-items: center; justify-content: center; z-index: 99; }
.pop { width: 640rpx; background: #fff; border-radius: 20rpx; padding: 40rpx; }
.pop-title { display: block; font-size: 32rpx; font-weight: 700; text-align: center; margin-bottom: 24rpx; }
.field { margin-bottom: 24rpx; }
.req { color: #e64340; }
.label { display: block; font-size: 26rpx; color: #333; margin-bottom: 8rpx; }
.input { border: 1px solid #eee; border-radius: 12rpx; padding: 16rpx 20rpx; font-size: 28rpx; }
.actions { display: flex; justify-content: flex-end; gap: 24rpx; margin-top: 8rpx; }
.btn { color: $pm-info; font-size: 26rpx; padding: 12rpx 30rpx; }
.btn.ghost { color: #666; }
</style>
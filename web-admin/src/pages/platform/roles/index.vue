<template>
  <view class="page">
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
    <view class="fab" @tap="openCreate">＋</view>

    <!-- 新建角色表单弹层 -->
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
  </view>
</template>
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchTenantRoles, createTenantRole, updateTenantRole, deleteTenantRole, importTenantDefaultRoles,
  fetchMyTenantRoles, myCreateTenantRole, myUpdateTenantRole, myDeleteTenantRole,
  fetchPermissionCatalog,
  type RoleItem, type PermissionCatalogGroup,
} from '../../../apis/tenant-admin';

const channelId = ref('');
const roles = ref<RoleItem[]>([]);
// 动态业务权限目录（单一来源：后端 PERMISSION_CATALOG，避免前端硬编码双份）
const catalog = ref<PermissionCatalogGroup[]>([]);
const importing = ref(false);

onLoad((q: any) => { channelId.value = q?.id || ''; loadCatalog(); });
// uni-app 先 onLoad 后 onShow；每次进入/从详情页返回都重拉角色列表，修复新建后不刷新的问题
onShow(() => { load(); });

function canImport() {
  // 仅超管从租户详情进入（带 channelId）提供一键导入；租户自助路径无权限，不显示
  return !!channelId.value;
}
async function openImport() {
  if (importing.value) return;
  try {
    importing.value = true;
    const imported = await importTenantDefaultRoles(channelId.value);
    uni.showToast({ title: imported.length ? `已导入 ${imported.length} 个默认角色` : '已是默认角色，无需导入', icon: 'none' });
    load();
  } catch (err: any) {
    uni.showToast({ title: err?.message || '导入失败', icon: 'none' });
  } finally {
    importing.value = false;
  }
}

async function load() {
  roles.value = channelId.value ? await fetchTenantRoles(channelId.value) : await fetchMyTenantRoles();
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
</script>
<style lang="scss" scoped>
.page { padding: 24rpx 24rpx 140rpx; }
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
.foot { display: flex; justify-content: flex-end; gap: 16rpx; margin-top: 20rpx; }
.btn { color: $pm-info; font-size: 26rpx; }
.btn.danger { color: #e64340; }
.empty { text-align: center; color: #bbb; padding: 60rpx 0; }
.import-btn { display: inline-block; margin-top: 20rpx; padding: 12rpx 30rpx; background: $pm-info; color: #fff; border-radius: 999rpx; font-size: 26rpx; }
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
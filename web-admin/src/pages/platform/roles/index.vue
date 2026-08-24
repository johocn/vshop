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
      <view class="group" v-for="g in groups" :key="g.label">
        <text class="g-label">{{ g.label }}</text>
        <view class="perms">
          <text v-for="p in g.items" :key="p" class="perm" :class="{ on: has(r, p) }" @tap="toggle(r, p)">
            {{ permLabel(p) }}
          </text>
        </view>
      </view>
      <view class="row foot">
        <text class="btn danger" @tap="onDelete(r)">删除角色</text>
        <text class="btn" @tap="onSave(r)">保存</text>
      </view>
    </view>
    <view v-if="!roles.length" class="empty">暂无角色</view>
    <view class="fab" @tap="onCreate">＋</view>
  </view>
</template>
<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  fetchTenantRoles, createTenantRole, updateTenantRole, deleteTenantRole,
  fetchMyTenantRoles, myCreateTenantRole, myUpdateTenantRole, myDeleteTenantRole,
  type RoleItem,
} from '../../../apis/tenant-admin';

const channelId = ref('');
const roles = ref<RoleItem[]>([]);

// 业务权限点清单（与后端 BUSINESS_PERMISSIONS 白名单对齐；超管专属权限不入列）
const groups: { label: string; items: string[] }[] = [
  { label: '商品/目录', items: ['ReadCatalog', 'CreateCatalog', 'UpdateCatalog', 'DeleteCatalog', 'ReadProduct', 'CreateProduct', 'UpdateProduct', 'DeleteProduct'] },
  { label: '分类', items: ['ReadCollection', 'CreateCollection', 'UpdateCollection', 'DeleteCollection'] },
  { label: '订单', items: ['ReadOrder', 'UpdateOrder', 'CreateOrder'] },
  { label: '图片', items: ['ReadAsset', 'CreateAsset', 'UpdateAsset', 'DeleteAsset'] },
  { label: '配送', items: ['ReadShippingMethod', 'CreateShippingMethod', 'UpdateShippingMethod', 'DeleteShippingMethod'] },
  { label: '支付', items: ['ReadPaymentMethod', 'CreatePaymentMethod', 'UpdatePaymentMethod', 'DeletePaymentMethod'] },
  { label: '店铺', items: ['ReadChannel', 'UpdateChannel'] },
  { label: '账号', items: ['ReadAdministrator', 'UpdateAdministrator'] },
  { label: '租户管理', items: ['TenantRoleManage', 'TenantMemberManage', 'VerifyOrder'] },
];

const permLabels: Record<string, string> = {
  ReadCatalog: '目录·读', CreateCatalog: '目录·增', UpdateCatalog: '目录·改', DeleteCatalog: '目录·删',
  ReadProduct: '商品·读', CreateProduct: '商品·增', UpdateProduct: '商品·改', DeleteProduct: '商品·删',
  ReadCollection: '分类·读', CreateCollection: '分类·增', UpdateCollection: '分类·改', DeleteCollection: '分类·删',
  ReadOrder: '订单·读', UpdateOrder: '订单·改', CreateOrder: '订单·建',
  ReadAsset: '图片·读', CreateAsset: '图片·传', UpdateAsset: '图片·改', DeleteAsset: '图片·删',
  ReadShippingMethod: '配送·读', CreateShippingMethod: '配送·增', UpdateShippingMethod: '配送·改', DeleteShippingMethod: '配送·删',
  ReadPaymentMethod: '支付·读', CreatePaymentMethod: '支付·增', UpdatePaymentMethod: '支付·改', DeletePaymentMethod: '支付·删',
  ReadChannel: '店铺·读', UpdateChannel: '店铺·改',
  ReadAdministrator: '账号·读', UpdateAdministrator: '账号·改',
  TenantRoleManage: '角色·管理', TenantMemberManage: '人员·管理', VerifyOrder: '核销·预留',
};

function permLabel(p: string) { return permLabels[p] || p; }

onLoad((q: any) => { channelId.value = q?.id || ''; load(); });

async function load() {
  roles.value = channelId.value ? await fetchTenantRoles(channelId.value) : await fetchMyTenantRoles();
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
function onCreate() {
  uni.showModal({
    title: '新建角色',
    editable: true,
    placeholderText: '角色编码（如 kefu）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        if (channelId.value) await createTenantRole(channelId.value, { code: r.content, description: r.content, permissions: ['ReadProduct'] });
        else await myCreateTenantRole({ code: r.content, description: r.content, permissions: ['ReadProduct'] });
        uni.showToast({ title: '已创建', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
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
.fab { position: fixed; right: 40rpx; bottom: 60rpx; width: 96rpx; height: 96rpx; border-radius: 50%; background: $pm-info; color: #fff; font-size: 56rpx; line-height: 96rpx; text-align: center; box-shadow: 0 8rpx 24rpx rgba(0,0,0,.15); }
</style>
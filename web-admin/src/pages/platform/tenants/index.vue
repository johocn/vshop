<template>
  <view class="page">
    <view class="card">
      <view class="row head">
        <text class="title">租户列表</text>
        <text class="btn" @tap="onCreate">＋新建租户</text>
      </view>
      <view class="item" v-for="t in tenants" :key="t.id">
        <view class="info">
          <text class="name">{{ t.name }}</text>
          <text class="sub">#{{ t.tenantNo ?? '—' }} · {{ t.code }} · {{ t.isOfficial ? '官方自营' : '第三方' }}</text>
        </view>
        <switch :checked="t.enabled" color="#4f8cff" @change="onToggle(t, $event)" />
        <text class="link" @tap="goDetail(t)">管理 ›</text>
      </view>
      <view v-if="!tenants.length" class="empty">暂无租户</view>
    </view>
  </view>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { fetchTenants, setTenantEnabled, createTenant, type TenantItem } from '../../../apis/tenant-admin';

const tenants = ref<TenantItem[]>([]);

async function load() {
  const res = await fetchTenants();
  tenants.value = res.items;
}
function onToggle(t: TenantItem, e: any) {
  const enabled = e.detail.value as boolean;
  uni.showModal({
    title: enabled ? '启用租户' : '停用租户',
    content: `确定${enabled ? '启用' : '停用'}「${t.name}」？停用后该租户所有后台人员无法登录（C端不受影响）。`,
    success: async (r) => {
      if (!r.confirm) return load();
      try {
        await setTenantEnabled(t.id, enabled);
        t.enabled = enabled;
        uni.showToast({ title: '已更新', icon: 'none' });
      } catch (err: any) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
        load();
      }
    },
  });
}
function onCreate() {
  uni.showModal({
    title: '新建租户',
    editable: true,
    placeholderText: '租户编码 code（如 shop01）',
    success: async (r) => {
      if (!r.confirm || !r.content) return;
      try {
        await createTenant({ code: r.content, name: r.content });
        uni.showToast({ title: '已创建', icon: 'none' });
        load();
      } catch (err: any) {
        uni.showToast({ title: err?.message || '创建失败', icon: 'none' });
      }
    },
  });
}
function goDetail(t: TenantItem) {
  uni.navigateTo({ url: `/pages/platform/tenants/detail?id=${t.id}&name=${encodeURIComponent(t.name)}` });
}
onMounted(load);
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
.link { color: $pm-info; font-size: 26rpx; }
.empty { text-align: center; color: #bbb; padding: 40rpx 0; font-size: 26rpx; }
</style>